/* ═══════════════════════════════════════════════════════════════════
   TAMATO — STRIPE INTEGRATION
   Checkout for plans + credit reloads. Billing via Customer Portal.
   Keys + price IDs are deployment constants. Stripe.js is lazy-loaded.
═══════════════════════════════════════════════════════════════════ */

/* ── Constants (set for this deployment) ───────────────────────── */
export const STRIPE_PUBLISHABLE_KEY = 'pk_live_REPLACE_ME';
export const STRIPE_SECRET_KEY = 'sk_live_REPLACE_ME'; // server-side only — keep out of shipped frontend
/* Checkout session creation must happen server-side. This endpoint is a
   Cloudflare Worker / serverless route that uses STRIPE_SECRET_KEY. */
export const CHECKOUT_ENDPOINT = '/api/create-checkout-session'; // TODO: deploy backend route
export const PORTAL_ENDPOINT = '/api/create-portal-session';     // TODO: deploy backend route

/* ── Product catalogue (price metadata; price IDs filled at deploy) ── */
export const STRIPE_PRODUCTS = {
  single:            { mode: 'payment',      amount: 1497,  label: 'Single Site',            price_id: 'price_single' },
  single_dev:        { mode: 'payment',      amount: 1997,  label: 'Single Site + Dev Mode', price_id: 'price_single_dev' },
  dev_addon:         { mode: 'payment',      amount: 500,   label: 'Dev Mode add-on',        price_id: 'price_dev_addon' },
  pro_monthly:       { mode: 'subscription', amount: 2999,  label: 'Pro (monthly)',          price_id: 'price_pro_m' },
  pro_annual:        { mode: 'subscription', amount: 34189, label: 'Pro (annual)',           price_id: 'price_pro_y' },
  agency3_monthly:   { mode: 'subscription', amount: 9997,  label: 'Agency 3 (monthly)',     price_id: 'price_ag3_m' },
  agency3_annual:    { mode: 'subscription', amount: 113966,label: 'Agency 3 (annual)',      price_id: 'price_ag3_y' },
  agency5_monthly:   { mode: 'subscription', amount: 13497, label: 'Agency 5 (monthly)',     price_id: 'price_ag5_m' },
  agency5_annual:    { mode: 'subscription', amount: 153866,label: 'Agency 5 (annual)',      price_id: 'price_ag5_y' },
  agency10_monthly:  { mode: 'subscription', amount: 21697, label: 'Agency 10 (monthly)',    price_id: 'price_ag10_m' },
  agency10_annual:   { mode: 'subscription', amount: 247346,label: 'Agency 10 (annual)',     price_id: 'price_ag10_y' },
  brandwide_monthly: { mode: 'subscription', amount: 10797, label: 'Brand Wide (monthly)',   price_id: 'price_bw_m' },
  brandwide_annual:  { mode: 'subscription', amount: 123088,label: 'Brand Wide (annual)',    price_id: 'price_bw_y' },
  credits_100:  { mode: 'payment', amount: 300,  label: '100 credits',  price_id: 'price_c100',  credits: 100 },
  credits_200:  { mode: 'payment', amount: 500,  label: '200 credits',  price_id: 'price_c200',  credits: 200 },
  credits_300:  { mode: 'payment', amount: 700,  label: '300 credits',  price_id: 'price_c300',  credits: 300 },
  credits_400:  { mode: 'payment', amount: 900,  label: '400 credits',  price_id: 'price_c400',  credits: 400 },
  credits_500:  { mode: 'payment', amount: 1100, label: '500 credits',  price_id: 'price_c500',  credits: 500 },
  credits_2000: { mode: 'payment', amount: 3500, label: '2000 credits', price_id: 'price_c2000', credits: 2000 },
};

let _stripe = null;
async function loadStripe() {
  if (_stripe) return _stripe;
  if (!window.Stripe) {
    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://js.stripe.com/v3/';
      s.onload = resolve; s.onerror = () => reject(new Error('Stripe.js failed to load'));
      document.head.appendChild(s);
    });
  }
  _stripe = window.Stripe(STRIPE_PUBLISHABLE_KEY);
  return _stripe;
}

/**
 * Start a Checkout session for a product key. Requires the backend route
 * to create the session and return { id } (session id) or { url }.
 */
export async function checkout(productKey, { userId, email } = {}) {
  const product = STRIPE_PRODUCTS[productKey];
  if (!product) throw new Error('Unknown product: ' + productKey);
  const res = await fetch(CHECKOUT_ENDPOINT, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      price_id: product.price_id, mode: product.mode, product: productKey,
      user_id: userId, email,
      success_url: location.origin + '/success.html?session_id={CHECKOUT_SESSION_ID}',
      cancel_url: location.href,
    }),
  });
  if (!res.ok) throw new Error('Could not start checkout');
  const data = await res.json();
  if (data.url) { location.href = data.url; return; }
  const stripe = await loadStripe();
  await stripe.redirectToCheckout({ sessionId: data.id });
}

/** Open Stripe Customer Portal for billing management. */
export async function openBillingPortal(customerId) {
  const res = await fetch(PORTAL_ENDPOINT, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ customer_id: customerId, return_url: location.href }),
  });
  if (!res.ok) throw new Error('Could not open billing portal');
  const data = await res.json();
  if (data.url) location.href = data.url;
}

export function fmtUSD(cents) { return '$' + (cents / 100).toFixed(2); }
