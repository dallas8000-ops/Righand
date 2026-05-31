from flask import Flask, jsonify
from flask_cors import CORS
from flask_jwt_extended import JWTManager
from config import config
from models import db
from routes_auth import auth_bp
from routes_expenses import expenses_bp
from routes_reports import reports_bp
from routes_fleet import fleet_bp
from routes_categories import categories_bp
from routes_subscriptions import subscriptions_bp
import os
from migrate import run_migrations

def create_app(env=None):
    """Application factory"""
    if env is None:
        env = os.environ.get('FLASK_ENV', 'development')
    
    app = Flask(__name__)
    
    # Load configuration
    app.config.from_object(config[env])
    
    # Initialize extensions
    db.init_app(app)
    cors_origins = os.environ.get('CORS_ORIGINS', '*')
    cors_origins = [origin.strip() for origin in cors_origins.split(',') if origin.strip()]
    # Capacitor Android/iOS WebView origin (required for native app API calls)
    if cors_origins != ['*']:
        for origin in ('https://localhost', 'capacitor://localhost', 'http://localhost'):
            if origin not in cors_origins:
                cors_origins.append(origin)
    CORS(app, resources={r"/*": {"origins": cors_origins}})
    jwt = JWTManager(app)
    
    # Register blueprints
    app.register_blueprint(auth_bp)
    app.register_blueprint(expenses_bp)
    app.register_blueprint(reports_bp)
    app.register_blueprint(fleet_bp)
    app.register_blueprint(categories_bp)
    app.register_blueprint(subscriptions_bp)
    
    # Health check endpoint
    @app.route('/health', methods=['GET'])
    def health():
        return jsonify({
            'status': 'healthy',
            'service': 'RigHand AI Backend',
            'version': '1.0.0'
        }), 200
    
    # Error handlers
    @app.errorhandler(404)
    def not_found(error):
        return jsonify({'error': 'Not found'}), 404
    
    @app.errorhandler(500)
    def internal_error(error):
        db.session.rollback()
        return jsonify({'error': 'Internal server error'}), 500
    
    # Create tables
    with app.app_context():
        db.create_all()
        run_migrations(db)
    
    return app

# Expose a WSGI app object for Gunicorn (app:app)
app = create_app()

if __name__ == '__main__':
    app.run(
        host='0.0.0.0',
        port=int(os.environ.get('PORT', 5000)),
        debug=True
    )
