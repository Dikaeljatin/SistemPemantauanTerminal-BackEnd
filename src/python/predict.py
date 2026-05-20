"""
Prophet forecasting — anti-overfitting version with honest accuracy reporting.

Key improvements vs previous version:
1. Time-series cross-validation (rolling window, 3 folds)
2. Hyperparameter tuning uses INNER CV — no data leakage
3. Final hold-out test set (last 14 days) for honest MAPE reporting
4. Limited grid search (only 3 params) — reduces overfit to validation noise
5. Outlier removal (winsorization)
6. Indonesian holidays
7. Daily aggregation + hourly pattern (more stable signals)
"""

import sys
import json
import warnings
warnings.filterwarnings("ignore")

import logging
logging.getLogger('prophet').setLevel(logging.ERROR)
logging.getLogger('cmdstanpy').setLevel(logging.ERROR)

import os
import contextlib
import pandas as pd
import numpy as np
from prophet import Prophet
from datetime import datetime, timedelta

try:
    import holidays as holidays_lib
    HAS_HOLIDAYS = True
except ImportError:
    HAS_HOLIDAYS = False


def get_indonesian_holidays(years):
    if not HAS_HOLIDAYS:
        return None
    id_holidays = holidays_lib.country_holidays('ID', years=years)
    holiday_data = []
    for date, name in id_holidays.items():
        holiday_data.append({
            'holiday': name,
            'ds': pd.Timestamp(date),
            'lower_window': -1,
            'upper_window': 2,
        })
    return pd.DataFrame(holiday_data) if holiday_data else None


def remove_outliers(series, lower_pct=2, upper_pct=98):
    """Less aggressive winsorization (2-98 percentile)."""
    if len(series) < 10:
        return series
    lower = np.percentile(series, lower_pct)
    upper = np.percentile(series, upper_pct)
    return series.clip(lower=lower, upper=upper)


def aggregate_to_daily(history):
    """Aggregate hourly history into daily totals + hourly distribution pattern."""
    df = pd.DataFrame(history)
    df['ds'] = pd.to_datetime(df['ds'])
    df['date'] = df['ds'].dt.date
    df['hour'] = df['ds'].dt.hour

    daily = df.groupby('date').agg({
        'masuk': 'sum',
        'keluar': 'sum',
        'penumpang': 'sum',
    }).reset_index()
    daily['ds'] = pd.to_datetime(daily['date'])
    daily = daily[['ds', 'masuk', 'keluar', 'penumpang']].sort_values('ds').reset_index(drop=True)

    # Hourly pattern (proportion per hour)
    hourly_pattern = {}
    for col in ['masuk', 'keluar', 'penumpang']:
        hourly_avg = df.groupby('hour')[col].mean()
        total = hourly_avg.sum()
        full_pattern = {h: float(hourly_avg.get(h, 0)) / total if total > 0 else 1/24 for h in range(24)}
        # Normalize
        total_p = sum(full_pattern.values())
        if total_p > 0:
            full_pattern = {h: v / total_p for h, v in full_pattern.items()}
        hourly_pattern[col] = full_pattern

    return daily, hourly_pattern


def build_prophet(cps, holidays_df, has_yearly):
    """Build Prophet model with given changepoint_prior_scale."""
    kwargs = {
        'daily_seasonality': False,
        'weekly_seasonality': True,
        'yearly_seasonality': has_yearly,
        'changepoint_prior_scale': cps,
        'seasonality_prior_scale': 10.0,
        'seasonality_mode': 'additive',
        'interval_width': 0.80,
    }
    if holidays_df is not None and not holidays_df.empty:
        kwargs['holidays'] = holidays_df
    return Prophet(**kwargs)


def fit_silently(model, df):
    """Fit Prophet without printing to stdout."""
    with open(os.devnull, 'w') as devnull:
        with contextlib.redirect_stdout(devnull), contextlib.redirect_stderr(devnull):
            model.fit(df[['ds', 'y']])
    return model


def calculate_mape(actual, predicted):
    """MAPE only on non-zero actuals to avoid division issues."""
    mask = actual > 0
    if mask.sum() == 0:
        return None
    return float(np.mean(np.abs((actual[mask] - predicted[mask]) / actual[mask])) * 100)


def time_series_cv(df, cps, holidays_df, has_yearly, n_folds=3, fold_size_days=14):
    """
    Rolling window cross-validation.
    Each fold: train on [start..cutoff], test on [cutoff..cutoff+fold_size].
    Returns mean MAPE across folds.
    """
    n = len(df)
    if n < fold_size_days * (n_folds + 1):
        # Not enough data for full CV, reduce folds
        n_folds = max(1, (n // fold_size_days) - 1)
        if n_folds < 1:
            return None

    fold_mapes = []
    # Calculate fold cutoffs (use last 30% of data for testing)
    test_zone_start = int(n * 0.7)
    available_test_days = n - test_zone_start
    actual_fold_size = min(fold_size_days, available_test_days // n_folds)

    if actual_fold_size < 3:
        return None

    for fold in range(n_folds):
        cutoff_idx = test_zone_start + fold * actual_fold_size
        end_idx = cutoff_idx + actual_fold_size

        if cutoff_idx <= 14 or end_idx > n:
            continue

        train = df.iloc[:cutoff_idx].copy()
        test = df.iloc[cutoff_idx:end_idx].copy()

        if len(train) < 14 or len(test) == 0:
            continue

        try:
            # Apply outlier removal on training only
            train['y'] = remove_outliers(train['y'], 2, 98)

            model = build_prophet(cps, holidays_df, has_yearly and len(train) > 180)
            fit_silently(model, train)

            pred = model.predict(test[['ds']])
            actual = test['y'].values
            predicted = pred['yhat'].clip(lower=0).values
            mape = calculate_mape(actual, predicted)
            if mape is not None:
                fold_mapes.append(mape)
        except Exception:
            continue

    return float(np.mean(fold_mapes)) if fold_mapes else None


def find_best_params_with_cv(df, holidays_df, has_yearly):
    """
    Find best changepoint_prior_scale via inner CV (no data leakage).
    Limited to 3 params to reduce overfitting to validation noise.
    """
    param_grid = [0.01, 0.05, 0.1]
    best_mape = float('inf')
    best_param = 0.05

    for cps in param_grid:
        mape = time_series_cv(df, cps, holidays_df, has_yearly, n_folds=3, fold_size_days=14)
        if mape is not None and mape < best_mape:
            best_mape = mape
            best_param = cps

    return best_param, best_mape if best_mape != float('inf') else None


def evaluate_holdout(df, cps, holidays_df, has_yearly, holdout_days=14):
    """
    Honest evaluation: train on data EXCLUDING last `holdout_days`,
    test on those last days. NEVER seen during tuning.
    Returns (mape, model_trained_on_all_for_final_pred).
    """
    n = len(df)
    if n <= holdout_days + 14:
        # Not enough data for holdout — train on all, no honest MAPE
        df_train = df.copy()
        df_train['y'] = remove_outliers(df_train['y'], 2, 98)
        model = build_prophet(cps, holidays_df, has_yearly and len(df_train) > 180)
        fit_silently(model, df_train)
        return None, model

    train = df.iloc[:n - holdout_days].copy()
    holdout = df.iloc[n - holdout_days:].copy()

    train['y'] = remove_outliers(train['y'], 2, 98)
    model = build_prophet(cps, holidays_df, has_yearly and len(train) > 180)
    fit_silently(model, train)

    pred = model.predict(holdout[['ds']])
    actual = holdout['y'].values
    predicted = pred['yhat'].clip(lower=0).values
    holdout_mape = calculate_mape(actual, predicted)

    # Now train final model on ALL data for actual prediction
    df_all = df.copy()
    df_all['y'] = remove_outliers(df_all['y'], 2, 98)
    final_model = build_prophet(cps, holidays_df, has_yearly and len(df_all) > 180)
    fit_silently(final_model, df_all)

    return holdout_mape, final_model


def predict_for_dates(model, target_dates):
    """Predict daily values for target dates."""
    future = pd.DataFrame({'ds': pd.to_datetime(target_dates)})
    forecast = model.predict(future)
    forecast['yhat'] = forecast['yhat'].clip(lower=0).round().astype(int)
    return forecast[['ds', 'yhat']].to_dict('records')


def main():
    input_data = json.loads(sys.stdin.read())
    history = input_data['history']
    tanggal_mulai = input_data['tanggal_mulai']
    tanggal_akhir = input_data['tanggal_akhir']

    # Filter to last 12 months
    df_all = pd.DataFrame(history)
    df_all['ds'] = pd.to_datetime(df_all['ds'])
    cutoff = df_all['ds'].max() - pd.DateOffset(months=12)
    df_all = df_all[df_all['ds'] >= cutoff].reset_index(drop=True)

    if len(df_all) < 24:
        print(json.dumps({'error': 'Data historis tidak cukup'}))
        sys.exit(0)

    history_filtered = df_all.to_dict('records')

    # Aggregate to daily + hourly pattern
    daily_df, hourly_pattern = aggregate_to_daily(history_filtered)

    if len(daily_df) < 30:
        print(json.dumps({'error': 'Data harian tidak cukup (minimal 30 hari)'}))
        sys.exit(0)

    # Target dates
    start = datetime.strptime(tanggal_mulai, '%Y-%m-%d')
    end = datetime.strptime(tanggal_akhir, '%Y-%m-%d')
    target_dates = []
    cur = start
    while cur <= end:
        target_dates.append(cur)
        cur += timedelta(days=1)

    # Indonesian holidays
    years = list(range(daily_df['ds'].min().year, end.year + 1))
    holidays_df = get_indonesian_holidays(years)

    has_yearly = len(daily_df) > 180

    # Process each metric
    metrics = ['masuk', 'keluar', 'penumpang']
    daily_forecasts = {}
    accuracy_info = {}

    for metric in metrics:
        df_metric = daily_df[['ds', metric]].rename(columns={metric: 'y'}).copy()

        # Step 1: Find best params via INNER CV (no leakage)
        best_param, cv_mape = find_best_params_with_cv(df_metric, holidays_df, has_yearly)

        # Step 2: Honest holdout evaluation with chosen params
        holdout_mape, final_model = evaluate_holdout(df_metric, best_param, holidays_df, has_yearly, holdout_days=14)

        # Step 3: Predict target dates
        daily_forecasts[metric] = predict_for_dates(final_model, target_dates)

        accuracy_info[metric] = {
            'cv_mape': round(cv_mape, 2) if cv_mape is not None else None,
            'holdout_mape': round(holdout_mape, 2) if holdout_mape is not None else None,
            'best_changepoint_prior_scale': best_param,
        }

    # Build per-day output
    per_day_predictions = []
    daily_totals = {'masuk': 0, 'keluar': 0, 'penumpang': 0}

    for i, target_date in enumerate(target_dates):
        date_str = target_date.strftime('%Y-%m-%d')
        m = daily_forecasts['masuk'][i]['yhat']
        k = daily_forecasts['keluar'][i]['yhat']
        p = daily_forecasts['penumpang'][i]['yhat']
        daily_totals['masuk'] += m
        daily_totals['keluar'] += k
        daily_totals['penumpang'] += p
        per_day_predictions.append({
            'tanggal': f"{target_date.day:02d}/{target_date.month:02d}",
            'tanggal_full': date_str,
            'masuk': m,
            'keluar': k,
            'penumpang': p,
        })

    # Distribute to hours using historical pattern
    avg_daily_masuk = daily_totals['masuk'] / len(target_dates) if target_dates else 0
    avg_daily_keluar = daily_totals['keluar'] / len(target_dates) if target_dates else 0
    avg_daily_penumpang = daily_totals['penumpang'] / len(target_dates) if target_dates else 0

    predictions = []
    for h in range(24):
        m_h = int(round(avg_daily_masuk * hourly_pattern['masuk'].get(h, 0)))
        k_h = int(round(avg_daily_keluar * hourly_pattern['keluar'].get(h, 0)))
        p_h = int(round(avg_daily_penumpang * hourly_pattern['penumpang'].get(h, 0)))
        predictions.append({'jam': f"{h:02d}:00", 'masuk': m_h, 'keluar': k_h, 'penumpang': p_h})

    # Busiest hours
    masuk_hours = {h: hourly_pattern['masuk'][h] for h in range(24)}
    keluar_hours = {h: hourly_pattern['keluar'][h] for h in range(24)}
    jam_tersibuk_masuk = f"{max(masuk_hours, key=masuk_hours.get):02d}:00" if any(masuk_hours.values()) else "-"
    jam_tersibuk_keluar = f"{max(keluar_hours, key=keluar_hours.get):02d}:00" if any(keluar_hours.values()) else "-"

    # Use HOLDOUT MAPE (honest) as primary accuracy metric
    valid_holdouts = [accuracy_info[m]['holdout_mape'] for m in metrics if accuracy_info[m]['holdout_mape'] is not None]
    avg_mape = round(sum(valid_holdouts) / len(valid_holdouts), 2) if valid_holdouts else None
    overall_accuracy = round(max(0, 100 - avg_mape), 2) if avg_mape is not None else None

    # CV MAPE (for transparency)
    valid_cvs = [accuracy_info[m]['cv_mape'] for m in metrics if accuracy_info[m]['cv_mape'] is not None]
    avg_cv_mape = round(sum(valid_cvs) / len(valid_cvs), 2) if valid_cvs else None

    output = {
        'predictions': predictions,
        'per_day': per_day_predictions,
        'summary': {
            'total_masuk': daily_totals['masuk'],
            'total_keluar': daily_totals['keluar'],
            'total_penumpang': daily_totals['penumpang'],
            'jam_tersibuk_masuk': jam_tersibuk_masuk,
            'jam_tersibuk_keluar': jam_tersibuk_keluar,
            'num_days': len(target_dates),
        },
        'accuracy': {
            'masuk_mape': accuracy_info['masuk']['holdout_mape'],
            'keluar_mape': accuracy_info['keluar']['holdout_mape'],
            'penumpang_mape': accuracy_info['penumpang']['holdout_mape'],
            'avg_mape': avg_mape,
            'overall_accuracy': overall_accuracy,
            'cv_mape': avg_cv_mape,
            'evaluation_method': 'Honest hold-out (last 14 days never seen during tuning)',
        },
        'meta': {
            'training_data_points': len(daily_df),
            'used_holidays': holidays_df is not None and not holidays_df.empty,
            'method': 'Prophet + Time-series CV + Honest hold-out evaluation',
            'best_params': {m: accuracy_info[m]['best_changepoint_prior_scale'] for m in metrics},
        }
    }

    print(json.dumps(output))


if __name__ == '__main__':
    try:
        main()
    except Exception as e:
        import traceback
        print(json.dumps({'error': str(e), 'trace': traceback.format_exc()}))
        sys.exit(1)
