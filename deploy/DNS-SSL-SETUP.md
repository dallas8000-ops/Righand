# Domain & SSL Setup

Production URL: https://righand-production.up.railway.app
Domain: righand-production.up.railway.app
Framework: react

## SSL
SSL/TLS is automatic on Vercel, Railway, and Fly.io custom domains.

## Stripe Webhook (production)
Update webhook URL to: `https://righand-production.up.railway.app/api/stripe/webhook`

## Verification
```bash
curl https://righand-production.up.railway.app/api/health
```
Run readiness from Stripe Installer after deploy.
