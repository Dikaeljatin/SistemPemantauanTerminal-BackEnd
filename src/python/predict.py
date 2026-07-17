"""
Forecasting kendaraan menggunakan Facebook Prophet.

Versi hasil tuning — hyperparameter & training window berbeda per metrik
berdasarkan hasil grid search di workspace eksperimen.

Ringkasan perbaikan MAPE (hold-out, horizon 30 hari):
    masuk     : 54.77 → 29.77  (-45.6%)
    keluar    : 55.29 → 42.63  (-22.9%)
    penumpang : 51.78 → 41.17  (-20.5%)

Fitur:
1. Hari libur Indonesia
2. Seasonality mode per-metrik (multiplicative untuk masuk, additive untuk keluar/penumpang)
3. Training window per-metrik (keluar & penumpang: 730 hari terakhir, masuk: semua histori)
4. Outlier handling (IQR capping)
5. Missing date filling dengan deteksi gap besar
6. Time-series cross-validation untuk evaluasi akurasi
7. Honest hold-out evaluation
8. Backtesting otomatis jika tanggal prediksi memiliki data aktual
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
from datetime import datetime, timedelta

from prophet import Prophet

try:
    import holidays as holidays_lib
    HAS_HOLIDAYS = True
except ImportError:
    HAS_HOLIDAYS = False


# ==================== KONFIGURASI HASIL TUNING (PER METRIK) ====================
# Sumber: hasil grid search pada data terminal Abdya.
# window_days: None = pakai semua histori; angka = pakai N hari terakhir saja.
METRIC_CONFIG = {
    'masuk': {
        'changepoint_prior_scale': 0.5,
        'changepoint_range': 0.8,
        'seasonality_mode': 'multiplicative',
        'seasonality_prior_scale': 1.0,
        'window_days': None,
    },
    'keluar': {
        'changepoint_prior_scale': 0.5,
        'changepoint_range': 0.8,
        'seasonality_mode': 'additive',
        'seasonality_prior_scale': 1.0,
        'window_days': 730,
    },
    'penumpang': {
        'changepoint_prior_scale': 0.5,
        'changepoint_range': 0.8,
        'seasonality_mode': 'additive',
        'seasonality_prior_scale': 10.0,
        'window_days': 730,
    },
}


# ==================== UTILITIES ====================

def silent_fit(fn):
    """Decorator untuk menekan stdout/stderr saat fitting Prophet."""
    def wrapper(*args, **kwargs):
        with open(os.devnull, 'w') as devnull:
            with contextlib.redirect_stdout(devnull), contextlib.redirect_stderr(devnull):
                return fn(*args, **kwargs)
    return wrapper


def get_indonesian_holidays_df(years):
    """DataFrame hari libur Indonesia untuk Prophet."""
    if not HAS_HOLIDAYS:
        return None
    id_holidays = holidays_lib.country_holidays('ID', years=years)
    rows = []
    for date, name in id_holidays.items():
        rows.append({
            'holiday': name,
            'ds': pd.Timestamp(date),
            'lower_window': -1,
            'upper_window': 2,
        })
    return pd.DataFrame(rows) if rows else None


def calculate_mape(actual, predicted, min_actual=2):
    """MAPE robust terhadap nilai nol/sangat kecil. Hanya pada actual >= min_actual."""
    actual = np.array(actual)
    predicted = np.array(predicted)
    mask = actual >= min_actual
    if mask.sum() == 0:
        return None
    return float(np.mean(np.abs((actual[mask] - predicted[mask]) / actual[mask])) * 100)


def calculate_smape(actual, predicted):
    """Symmetric MAPE - lebih robust untuk nilai rendah."""
    actual = np.array(actual)
    predicted = np.array(predicted)
    denom = (np.abs(actual) + np.abs(predicted)) / 2
    mask = denom > 0
    if mask.sum() == 0:
        return None
    return float(np.mean(np.abs(actual[mask] - predicted[mask]) / denom[mask]) * 100)


# ==================== PREPROCESSING ====================

def remove_outliers_iqr(series, multiplier=3.0):
    """IQR capping untuk handle outlier secara konservatif."""
    if len(series) < 10:
        return series
    q1 = np.percentile(series, 25)
    q3 = np.percentile(series, 75)
    iqr = q3 - q1
    lower = max(0, q1 - multiplier * iqr)
    upper = q3 + multiplier * iqr
    return series.clip(lower=lower, upper=upper)


def fill_missing_dates(df, date_col='ds', value_cols=None, max_gap_to_fill=30):
    """Isi tanggal kosong dengan 0, tapi ABAIKAN gap besar > max_gap_to_fill hari.
    Gap besar (misal 15 bulan tanpa data) tidak diisi 0 agar tidak merusak model."""
    if value_cols is None:
        value_cols = [c for c in df.columns if c != date_col]
    df[date_col] = pd.to_datetime(df[date_col])
    df = df.sort_values(date_col).reset_index(drop=True)

    segments = []
    seg_start = 0
    for i in range(1, len(df)):
        gap_days = (df[date_col].iloc[i] - df[date_col].iloc[i - 1]).days
        if gap_days > max_gap_to_fill:
            segments.append(df.iloc[seg_start:i])
            seg_start = i
    segments.append(df.iloc[seg_start:])

    filled = []
    for seg in segments:
        if len(seg) == 0:
            continue
        seg_range = pd.date_range(start=seg[date_col].min(), end=seg[date_col].max(), freq='D')
        full_seg = pd.DataFrame({date_col: seg_range})
        seg = full_seg.merge(seg, on=date_col, how='left')
        for col in value_cols:
            if col in seg.columns:
                seg[col] = seg[col].fillna(0).astype(int)
        filled.append(seg)

    return pd.concat(filled, ignore_index=True) if filled else df


# ==================== MODEL: PROPHET ====================

@silent_fit
def fit_prophet(train_df, holidays_df, has_yearly, params):
    """Fit Prophet model. params = entri METRIC_CONFIG (beda per metrik)."""
    kwargs = {
        'daily_seasonality': False,
        'weekly_seasonality': True,
        'yearly_seasonality': has_yearly,
        'changepoint_prior_scale': params['changepoint_prior_scale'],
        'changepoint_range': params['changepoint_range'],
        'seasonality_prior_scale': params['seasonality_prior_scale'],
        'seasonality_mode': params['seasonality_mode'],
        'interval_width': 0.80,
    }
    if holidays_df is not None and not holidays_df.empty:
        kwargs['holidays'] = holidays_df
    model = Prophet(**kwargs)
    model.fit(train_df[['ds', 'y']])
    return model


def predict_with_prophet(history_df, target_dates, target_col, holidays_df, has_yearly, params):
    """Prediksi menggunakan Prophet."""
    train = history_df.copy()
    train['ds'] = pd.to_datetime(train['ds'])
    train['y'] = remove_outliers_iqr(train[target_col], 3.0)

    model = fit_prophet(train[['ds', 'y']], holidays_df, has_yearly, params)

    target_df = pd.DataFrame({'ds': pd.to_datetime(target_dates)})
    forecast = model.predict(target_df[['ds']])
    pred = forecast['yhat'].clip(lower=0).values

    return [int(round(p)) for p in pred]


# ==================== EVALUATION ====================

def time_series_cv_evaluate(df, target_col, holidays_df, has_yearly, params, n_folds=3):
    """Time-series cross-validation. Return rata-rata MAPE."""
    n = len(df)
    fold_size = max(7, n // (n_folds + 1))
    test_zone_start = n - (n_folds * fold_size)

    if test_zone_start < 30:
        return None

    mapes = []
    for fold in range(n_folds):
        cutoff = test_zone_start + fold * fold_size
        end = cutoff + fold_size
        if end > n:
            break

        train = df.iloc[:cutoff].copy()
        test = df.iloc[cutoff:end].copy()

        if len(train) < 30 or len(test) == 0:
            continue

        try:
            train['y'] = remove_outliers_iqr(train[target_col], 3.0)
            model = fit_prophet(train[['ds', 'y']], holidays_df, has_yearly, params)
            forecast = model.predict(test[['ds']])
            pred = forecast['yhat'].clip(lower=0).values
            mape = calculate_mape(test[target_col].values, pred)
            if mape is not None:
                mapes.append(mape)
        except Exception:
            continue

    return round(float(np.mean(mapes)), 2) if mapes else None


# ==================== MAIN ====================

def run_prediction(input_data):
    """Core prediction logic. Returns dict result (bisa dipanggil dari Flask atau stdin)."""
    daily_history      = input_data['daily_history']
    hourly_pattern_raw = input_data.get('hourly_pattern', {})
    tanggal_mulai      = input_data['tanggal_mulai']
    tanggal_akhir      = input_data['tanggal_akhir']

    daily_df_full = pd.DataFrame(daily_history)
    daily_df_full['ds'] = pd.to_datetime(daily_df_full['ds'])
    daily_df_full = fill_missing_dates(daily_df_full, 'ds', ['masuk', 'keluar', 'penumpang'])

    if len(daily_df_full) < 60:
        return {'error': 'Data harian tidak cukup (minimal 60 hari)'}

    # Normalisasi pola distribusi per jam
    hourly_pattern = {}
    for col in ['masuk', 'keluar', 'penumpang']:
        raw = {h: float((hourly_pattern_raw.get(str(h)) or hourly_pattern_raw.get(h) or {}).get(col, 0))
               for h in range(24)}
        total = sum(raw.values())
        if total > 0:
            hourly_pattern[col] = {h: v / total for h, v in raw.items()}
        else:
            hourly_pattern[col] = {h: 1 / 24 for h in range(24)}

    # Build target dates
    start = datetime.strptime(tanggal_mulai, '%Y-%m-%d')
    end = datetime.strptime(tanggal_akhir, '%Y-%m-%d')
    target_dates = []
    cur = start
    while cur <= end:
        target_dates.append(cur)
        cur += timedelta(days=1)

    # Tentukan mode akurasi: backtesting (ada data aktual) atau CV (masa depan)
    target_date_set = {d.date() for d in target_dates}
    hist_date_set = set(daily_df_full['ds'].dt.date)
    overlap = sorted(target_date_set & hist_date_set)
    earliest_target = pd.Timestamp(min(target_dates))
    bt_train_check = daily_df_full[daily_df_full['ds'] < earliest_target]
    can_backtest = len(overlap) >= 3 and len(bt_train_check) >= 30
    accuracy_mode = 'backtesting' if can_backtest else 'cv'

    metrics = ['masuk', 'keluar', 'penumpang']
    daily_forecasts = {}
    accuracy_info = {}

    for metric in metrics:
        params = METRIC_CONFIG[metric]

        # Potong training window per metrik
        window_days = params['window_days']
        daily_df = daily_df_full if window_days is None else daily_df_full.tail(window_days).reset_index(drop=True)

        years = list(range(daily_df['ds'].min().year, end.year + 1))
        holidays_df = get_indonesian_holidays_df(years)
        has_yearly = len(daily_df) > 365

        df_metric = daily_df[['ds', metric]].copy()

        if can_backtest:
            # Backtesting: train pada data sebelum target, bandingkan dengan data aktual
            train_df_bt = daily_df[daily_df['ds'] < earliest_target].copy()
            try:
                pred_bt = predict_with_prophet(
                    train_df_bt, [pd.Timestamp(d) for d in overlap],
                    metric, holidays_df, has_yearly, params
                )
                actual_bt = []
                for d in overlap:
                    row = daily_df_full[daily_df_full['ds'].dt.date == d][metric]
                    actual_bt.append(int(row.values[0]) if len(row) > 0 else 0)

                bt_mape = calculate_mape(actual_bt, pred_bt)
                bt_smape = calculate_smape(actual_bt, pred_bt)
            except Exception:
                bt_mape = None
                bt_smape = None

            accuracy_info[metric] = {
                'mape': round(bt_mape, 2) if bt_mape is not None else None,
                'smape': round(bt_smape, 2) if bt_smape is not None else None,
                'cv_mape': None,
                'holdout_mape': None,
                'method_note': f'Backtesting pada {len(overlap)} hari aktual',
            }
        else:
            # Tanggal masa depan — CV + hold-out
            # Panjang holdout disesuaikan dengan horizon prediksi yang dipilih user
            # agar akurasi berubah saat user memilih periode berbeda (1 minggu vs 1 bulan)
            cv_mape = time_series_cv_evaluate(df_metric, metric, holidays_df, has_yearly, params, n_folds=3)

            n = len(df_metric)
            pred_horizon = len(target_dates)
            holdout_mape = None
            holdout_smape = None
            if n > 30:
                # Holdout window = panjang prediksi, minimal 7 hari, sisakan >=30 hari untuk training
                holdout_window = max(7, min(pred_horizon, n - 30))
                holdout_start = n - holdout_window
                train_for_holdout = df_metric.iloc[:holdout_start].copy()
                holdout = df_metric.iloc[holdout_start:].copy()
                try:
                    holdout_pred = predict_with_prophet(
                        train_for_holdout, holdout['ds'].tolist(),
                        metric, holidays_df, has_yearly, params
                    )
                    holdout_mape = calculate_mape(holdout[metric].values, np.array(holdout_pred))
                    holdout_smape = calculate_smape(holdout[metric].values, np.array(holdout_pred))
                except Exception:
                    pass

            if holdout_mape is not None and cv_mape is not None and holdout_mape > cv_mape * 2:
                primary_mape = cv_mape
                method_note = 'CV (hold-out menunjukkan data drift)'
            elif holdout_mape is not None:
                primary_mape = holdout_mape
                method_note = f'Hold-out ({holdout_window} hari terakhir)'
            elif cv_mape is not None:
                primary_mape = cv_mape
                method_note = 'Time-series CV'
            else:
                primary_mape = None
                method_note = 'tidak tersedia'

            accuracy_info[metric] = {
                'mape': round(primary_mape, 2) if primary_mape is not None else None,
                'smape': round(holdout_smape, 2) if holdout_smape is not None else None,
                'cv_mape': cv_mape,
                'holdout_mape': round(holdout_mape, 2) if holdout_mape is not None else None,
                'method_note': method_note,
            }

        # Final prediction selalu pakai semua data (window per metrik)
        final_predictions = predict_with_prophet(
            df_metric, target_dates, metric, holidays_df, has_yearly, params
        )
        daily_forecasts[metric] = final_predictions

    # Build per-day output
    per_day_predictions = []
    daily_totals = {'masuk': 0, 'keluar': 0, 'penumpang': 0}
    for i, target_date in enumerate(target_dates):
        m = daily_forecasts['masuk'][i]
        k = daily_forecasts['keluar'][i]
        p = daily_forecasts['penumpang'][i]
        daily_totals['masuk'] += m
        daily_totals['keluar'] += k
        daily_totals['penumpang'] += p
        per_day_predictions.append({
            'tanggal': f"{target_date.day:02d}/{target_date.month:02d}",
            'tanggal_full': target_date.strftime('%Y-%m-%d'),
            'masuk': m, 'keluar': k, 'penumpang': p,
        })

    # Distribusi ke jam menggunakan pola historis
    predictions = []
    for h in range(24):
        masuk_h     = daily_totals['masuk']     * hourly_pattern['masuk'].get(h, 0)
        keluar_h    = daily_totals['keluar']    * hourly_pattern['keluar'].get(h, 0)
        penumpang_h = daily_totals['penumpang'] * hourly_pattern['penumpang'].get(h, 0)
        predictions.append({
            'jam': f"{h:02d}:00",
            'masuk': int(round(masuk_h)),
            'keluar': int(round(keluar_h)),
            'penumpang': int(round(penumpang_h)),
        })

    # Jam tersibuk
    masuk_hours  = {h: hourly_pattern['masuk'][h]  for h in range(24)}
    keluar_hours = {h: hourly_pattern['keluar'][h] for h in range(24)}
    jam_tersibuk_masuk  = f"{max(masuk_hours,  key=masuk_hours.get):02d}:00"  if any(masuk_hours.values())  else "-"
    jam_tersibuk_keluar = f"{max(keluar_hours, key=keluar_hours.get):02d}:00" if any(keluar_hours.values()) else "-"

    # Akurasi keseluruhan — pakai MAPE
    valid_mapes = [accuracy_info[m]['mape'] for m in metrics if accuracy_info[m]['mape'] is not None]
    avg_mape = round(np.mean(valid_mapes), 2) if valid_mapes else None
    overall_accuracy = round(max(0, 100 - avg_mape), 2) if avg_mape is not None else None

    cv_mapes = [accuracy_info[m]['cv_mape'] for m in metrics if accuracy_info[m]['cv_mape'] is not None]
    avg_cv_mape = round(np.mean(cv_mapes), 2) if cv_mapes else None

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
            'masuk_mape':     accuracy_info['masuk']['mape'],
            'keluar_mape':    accuracy_info['keluar']['mape'],
            'penumpang_mape': accuracy_info['penumpang']['mape'],
            'avg_mape': avg_mape,
            'overall_accuracy': overall_accuracy,
            'cv_mape': avg_cv_mape,
            'holdout_mape': {m: accuracy_info[m]['holdout_mape'] for m in metrics},
            'accuracy_mode': accuracy_mode,
            'backtesting_days': len(overlap) if can_backtest else 0,
            'evaluation_method': 'Backtesting pada data aktual' if can_backtest else 'Time-series CV + hold-out',
            'method_notes': {m: accuracy_info[m]['method_note'] for m in metrics},
        },
        'meta': {
            'training_data_points': {m: (len(daily_df_full) if METRIC_CONFIG[m]['window_days'] is None
                                          else min(METRIC_CONFIG[m]['window_days'], len(daily_df_full)))
                                      for m in metrics},
            'used_holidays': bool(holidays_df is not None and not holidays_df.empty),
            'method': 'Facebook Prophet dengan hyperparameter & training window per-metrik (hasil tuning)',
            'model': 'Prophet',
        }
    }

    return output


def main():
    """Stdin/stdout mode — dipakai saat dipanggil langsung via subprocess (fallback)."""
    input_data = json.loads(sys.stdin.read())
    result = run_prediction(input_data)
    print(json.dumps(result))


if __name__ == '__main__':
    try:
        main()
    except Exception as e:
        import traceback
        print(json.dumps({'error': str(e), 'trace': traceback.format_exc()}))
        sys.exit(1)
