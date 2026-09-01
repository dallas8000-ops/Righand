"""Django settings for RigHand AI backend."""

import os
import urllib.parse
from datetime import timedelta
from pathlib import Path

from django.core.exceptions import ImproperlyConfigured

BASE_DIR = Path(__file__).resolve().parent.parent
REPO_ROOT = BASE_DIR.parent
FRONTEND_BUILD_DIR = REPO_ROOT / 'frontend' / 'build'

SECRET_KEY = os.environ.get('SECRET_KEY', 'righand-secret-key-change-in-production')
JWT_SECRET_KEY = os.environ.get('JWT_SECRET_KEY', 'righand-jwt-secret-change-in-production')

_is_production = bool(os.environ.get('RAILWAY_ENVIRONMENT'))
if _is_production:
    _env = os.environ.get('DJANGO_ENV', os.environ.get('FLASK_ENV', 'production'))
else:
    _env = os.environ.get('DJANGO_ENV', os.environ.get('FLASK_ENV', 'development'))
DEBUG = _env == 'development'

# --- Error/performance monitoring (Sentry) ---
# SENTRY_DSN is set as a Railway environment variable, not hardcoded here.
# No-ops safely if unset (e.g. local dev), so it's always safe to leave in.
_sentry_dsn = os.environ.get('SENTRY_DSN', '').strip()
if _sentry_dsn:
    import sentry_sdk
    from sentry_sdk.integrations.django import DjangoIntegration

    sentry_sdk.init(
        dsn=_sentry_dsn,
        integrations=[DjangoIntegration()],
        environment=_env,
        release=os.environ.get('RAILWAY_DEPLOYMENT_ID', 'unknown'),
        # Keep trace/profile sampling modest by default; tune from the Sentry
        # dashboard rather than raising this blindly.
        traces_sample_rate=float(os.environ.get('SENTRY_TRACES_SAMPLE_RATE', '0.1')),
        send_default_pii=False,
    )


def _build_allowed_hosts():
    hosts = [
        'righand-production.up.railway.app',
        'righand.gilliomfrontlinedigital.com',
        '.railway.app',
        'localhost',
        '127.0.0.1',
        'testserver',
    ]
    railway_host = os.environ.get('RAILWAY_PUBLIC_DOMAIN')
    if railway_host:
        hosts.insert(0, railway_host)
    override = os.environ.get('ALLOWED_HOSTS')
    if override:
        extra = [
            host.strip()
            for host in override.split(',')
            if host.strip() and host.strip() != '*'
        ]
        hosts = extra + [h for h in hosts if h not in extra]
    return list(dict.fromkeys(hosts))


ALLOWED_HOSTS = _build_allowed_hosts()

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'corsheaders',
    'api.apps.ApiConfig',
]

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'whitenoise.middleware.WhiteNoiseMiddleware',
    'corsheaders.middleware.CorsMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'righand.urls'
WSGI_APPLICATION = 'righand.wsgi.application'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

_database_url = os.environ.get('DATABASE_URL', f'sqlite:///{BASE_DIR / "righand.db"}')
if _database_url.startswith('postgres://'):
    _database_url = _database_url.replace('postgres://', 'postgresql://', 1)

if _is_production:
    if not os.environ.get('DATABASE_URL', '').strip():
        raise ImproperlyConfigured(
            'DATABASE_URL is not set on Railway. Link Postgres and set '
            'DATABASE_URL=${{Postgres.DATABASE_URL}} on the Righand service.'
        )
    if _database_url.startswith('postgresql://'):
        _db_host = urllib.parse.urlparse(_database_url).hostname or ''
        if 'render.com' in _db_host:
            raise ImproperlyConfigured(
                'DATABASE_URL points to Render Postgres (' + _db_host + '). '
                'Railway cannot use that database reliably. In Railway → Righand → Variables, '
                'delete the old Render URL and set DATABASE_URL=${{Postgres.DATABASE_URL}} '
                'after linking a Railway Postgres service in the same project.'
            )

if _database_url.startswith('sqlite:///'):
    db_name = _database_url.replace('sqlite:///', '', 1)
    if db_name == ':memory:':
        DATABASES = {
            'default': {
                'ENGINE': 'django.db.backends.sqlite3',
                'NAME': ':memory:',
            }
        }
    else:
        path = Path(db_name)
        if not path.is_absolute():
            path = BASE_DIR / path
        DATABASES = {
            'default': {
                'ENGINE': 'django.db.backends.sqlite3',
                'NAME': str(path),
            }
        }
elif _database_url.startswith('postgresql://'):
    parsed = urllib.parse.urlparse(_database_url)
    query = urllib.parse.parse_qs(parsed.query)
    db_options = {}
    if 'sslmode' in query:
        db_options['sslmode'] = query['sslmode'][0]
    elif parsed.hostname and parsed.hostname.endswith('.railway.app'):
        db_options['sslmode'] = 'require'

    db_config = {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': parsed.path.lstrip('/'),
        'USER': parsed.username,
        'PASSWORD': parsed.password or '',
        'HOST': parsed.hostname,
        'PORT': parsed.port or '5432',
    }
    if db_options:
        db_config['OPTIONS'] = db_options
    if _is_production:
        db_config['CONN_MAX_AGE'] = int(os.environ.get('DB_CONN_MAX_AGE', '600'))
    DATABASES = {'default': db_config}
else:
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.sqlite3',
            'NAME': str(BASE_DIR / 'righand.db'),
        }
    }

AUTH_PASSWORD_VALIDATORS = []

LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'UTC'
USE_I18N = True
USE_TZ = True

STATIC_URL = '/static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'

if (FRONTEND_BUILD_DIR / 'static').is_dir():
    STATICFILES_DIRS = [FRONTEND_BUILD_DIR / 'static']

# Serve CRA build assets (JS/CSS) and index.html fallback for client routes
if FRONTEND_BUILD_DIR.is_dir():
    WHITENOISE_ROOT = FRONTEND_BUILD_DIR
    WHITENOISE_INDEX_FILE = True

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

JWT_ACCESS_TOKEN_EXPIRES = timedelta(days=30)

_cors_origins = os.environ.get('CORS_ORIGINS', '*')
if _cors_origins.strip() == '*':
    CORS_ALLOW_ALL_ORIGINS = True
else:
    CORS_ALLOW_ALL_ORIGINS = False
    CORS_ALLOWED_ORIGINS = [
        origin.strip() for origin in _cors_origins.split(',') if origin.strip()
    ]
    for origin in ('https://localhost', 'capacitor://localhost', 'http://localhost'):
        if origin not in CORS_ALLOWED_ORIGINS:
            CORS_ALLOWED_ORIGINS.append(origin)

CSRF_TRUSTED_ORIGINS = [
    origin for origin in os.environ.get('CSRF_TRUSTED_ORIGINS', '').split(',') if origin.strip()
]
for _url in (
    f"https://{os.environ['RAILWAY_PUBLIC_DOMAIN']}" if os.environ.get('RAILWAY_PUBLIC_DOMAIN') else '',
    'https://righand-production.up.railway.app',
    'https://righand.gilliomfrontlinedigital.com',
):
    if _url and _url not in CSRF_TRUSTED_ORIGINS:
        CSRF_TRUSTED_ORIGINS.append(_url)

if _is_production:
    SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
    USE_X_FORWARDED_HOST = True

LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'handlers': {'console': {'class': 'logging.StreamHandler'}},
    'loggers': {
        'django.db.backends': {
            'level': 'DEBUG' if DEBUG else 'INFO',
            'handlers': ['console'],
        },
    },
}
