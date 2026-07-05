"""
Flask prediction server — library di-import sekali saat startup,
tidak ada cold start per request seperti pada subprocess spawn.
"""

import os
import sys
import traceback

# Pastikan predict.py bisa di-import dari direktori yang sama
sys.path.insert(0, os.path.dirname(__file__))

from flask import Flask, request, jsonify
from predict import run_prediction

app = Flask(__name__)


@app.route('/health', methods=['GET'])
def health():
    return jsonify({'status': 'ok'})


@app.route('/predict', methods=['POST'])
def predict():
    try:
        input_data = request.get_json(force=True)
        if not input_data:
            return jsonify({'error': 'Request body kosong atau bukan JSON'}), 400

        result = run_prediction(input_data)
        return jsonify(result)
    except Exception as e:
        return jsonify({'error': str(e), 'trace': traceback.format_exc()}), 500


if __name__ == '__main__':
    port = int(os.environ.get('PREDICT_PORT', 5001))
    print(f'[Flask] Prediction server berjalan di port {port}', flush=True)
    # threaded=False karena Prophet/numpy tidak thread-safe
    app.run(host='127.0.0.1', port=port, debug=False, threaded=False)
