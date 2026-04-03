/**
 * MercadoPago integration helper for Clube do Natural.
 *
 * Uses the MercadoPago REST API directly (no SDK needed).
 * Requires env var MERCADOPAGO_ACCESS_TOKEN.
 */

const MP_API = "https://api.mercadopago.com";

function headers() {
  return {
    Authorization: `Bearer ${process.env.MERCADOPAGO_ACCESS_TOKEN}`,
    "Content-Type": "application/json",
  };
}

/**
 * Create a checkout preference (payment link).
 *
 * @param {Object} opts
 * @param {Array}  opts.items        – [{ title, quantity, unit_price, description? }]
 * @param {Object} opts.payer        – { name, email, phone? }
 * @param {string} opts.externalRef  – your internal order id
 * @param {string} opts.notificationUrl – webhook URL
 * @param {string} [opts.backUrls]   – { success, failure, pending }
 * @returns {Object} MercadoPago preference object
 */
async function createPreference({
  items,
  payer,
  externalRef,
  notificationUrl,
  backUrls,
}) {
  const body = {
    items: items.map((i) => ({
      title: i.title,
      description: i.description || i.title,
      quantity: Number(i.quantity),
      unit_price: Number(i.unit_price),
      currency_id: "BRL",
    })),
    payer: {
      name: payer.name,
      email: payer.email,
      ...(payer.phone ? { phone: { number: payer.phone } } : {}),
    },
    payment_methods: {
      excluded_payment_types: [],
      installments: 12,
      default_installments: 1,
    },
    external_reference: externalRef,
    notification_url: notificationUrl,
    statement_descriptor: "CLUBE DO NATURAL",
    ...(backUrls
      ? {
          back_urls: {
            success: backUrls.success,
            failure: backUrls.failure,
            pending: backUrls.pending,
          },
          auto_return: "approved",
        }
      : {}),
  };

  const res = await fetch(`${MP_API}/checkout/preferences`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`MercadoPago createPreference error ${res.status}: ${text}`);
  }

  return res.json();
}

/**
 * Fetch a payment by its ID (used when processing webhooks).
 *
 * @param {string|number} paymentId
 * @returns {Object} MercadoPago payment object
 */
async function getPayment(paymentId) {
  const res = await fetch(`${MP_API}/v1/payments/${paymentId}`, {
    headers: headers(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`MercadoPago getPayment error ${res.status}: ${text}`);
  }

  return res.json();
}

/**
 * Process an incoming webhook notification.
 *
 * @param {Object} body – the webhook request body
 * @returns {Object|null} – { action, payment } or null if not a payment notification
 */
async function processWebhook(body) {
  // MercadoPago sends different notification types
  if (body.type === "payment" && body.data?.id) {
    const payment = await getPayment(body.data.id);
    return {
      action: body.action,
      paymentId: body.data.id,
      status: payment.status,
      statusDetail: payment.status_detail,
      externalReference: payment.external_reference,
      transactionAmount: payment.transaction_amount,
      paymentMethodId: payment.payment_method_id,
      paymentTypeId: payment.payment_type_id,
      payment,
    };
  }
  return null;
}

module.exports = { createPreference, getPayment, processWebhook };
