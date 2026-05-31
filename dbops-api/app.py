"""Standalone dbops-api server for RigHand purchase tracking dashboard."""

import os
from flask import Flask, send_from_directory
from flask_cors import CORS
from righand_webhook import righand_webhook_bp

app = Flask(__name__)
CORS(app, resources={r'/api/*': {'origins': '*'}})
app.register_blueprint(righand_webhook_bp)


@app.route('/')
def dashboard():
    return send_from_directory('.', 'dashboard.html')


@app.route('/health')
def health():
    return {'status': 'healthy', 'service': 'dbops-api'}


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5001))
    app.run(host='0.0.0.0', port=port, debug=os.environ.get('FLASK_DEBUG') == '1')
