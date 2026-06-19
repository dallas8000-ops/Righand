# Stripe + Railway setup

Production API host: `https://righand-production.up.railway.app`
Webhook URL: `https://righand-production.up.railway.app/api/billing/webhook`

> **Note:** This file was originally named for Render. Production now runs on **Railway** (`railway.toml` + root `Dockerfile`). See `backend/RAILWAY_DEPLOY.md`.

## 1. Stripe Dashboard

1. Open Stripe Dashboard in test mode until go-live.
2. Copy the secret key from Developers -> API keys.
3. Create or open the RigHand Pro and Fleet subscription products.
4. Copy the recurring monthly Price IDs. They start with `price_`.

## 2. Railway environment

In Railway, open the **Righand** service -> Variables and set:

| Key | Value |
| --- | --- |
| `STRIPE_SECRET_KEY` | `sk_test_...` or `sk_live_...` |
| `STRIPE_WEBHOOK_SECRET` | `whsec_...` after creating the webhook |
| `STRIPE_PRICE_ID_PRO` | Pro recurring `price_...` |
| `STRIPE_PRICE_ID_FLEET` | Fleet recurring `price_...` |
| `STRIPE_CHECKOUT_DISPLAY_NAME` | Optional, e.g. `RigHand AI` |

Do not commit secrets to git.

## 3. Stripe webhook

Create a Stripe webhook endpoint:

```text
https://righand-production.up.railway.app/api/billing/webhook
```

Required events:

```text
checkout.session.completed
customer.subscription.created
customer.subscription.updated
customer.subscription.deleted
```

## 4. Verify

```bash
curl -s https://righand-production.up.railway.app/health/billing
```

Or run:

```bash
python scripts/verify_stripe_config.py
```

Set `RIGHAND_API_URL=https://righand-production.up.railway.app` if needed.
