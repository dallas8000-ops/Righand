# Stripe + Render setup

Production API host: `https://righand-frontend-production.up.railway.app`
Webhook URL: `https://righand-frontend-production.up.railway.app/api/billing/webhook`

## 1. Stripe Dashboard

1. Open Stripe Dashboard in test mode until go-live.
2. Copy the secret key from Developers -> API keys.
3. Create or open the RigHand Pro and Fleet subscription products.
4. Copy the recurring monthly Price IDs. They start with `price_`.

## 2. Render environment

In Render, open `righand` -> Environment and set:

| Key | Value |
| --- | --- |
| `STRIPE_SECRET_KEY` | `sk_test_...` or `sk_live_...` |
| `STRIPE_WEBHOOK_SECRET` | `whsec_...` after creating the webhook |
| `STRIPE_PRICE_ID_PRO` | Pro recurring `price_...` |
| `STRIPE_PRICE_ID_FLEET` | Fleet recurring `price_...` |
| `STRIPE_CHECKOUT_DISPLAY_NAME` | Optional, e.g. `RigHand AI` |

These keys are declared in `render.yaml` with `sync: false`, so Render prompts for values and no secrets are committed to git.

## 3. Stripe webhook

Create a Stripe webhook endpoint:

```text
https://righand-frontend-production.up.railway.app/api/billing/webhook
```

Required events:

```text
checkout.session.completed
customer.subscription.created
customer.subscription.updated
customer.subscription.deleted
```

Copy the webhook signing secret into `STRIPE_WEBHOOK_SECRET`, then redeploy `righand`.

## 4. Verify

```bash
python scripts/verify_stripe_config.py
```

Or check directly:

```bash
curl -s https://righand-frontend-production.up.railway.app/health/billing
```

The response reports only whether each setting exists. It never returns secret values.
