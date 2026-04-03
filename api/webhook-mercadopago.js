const { json, error, parseBody } = require("./lib/cors");
const db = require("./lib/db");
const { processWebhook } = require("./lib/mercadopago");

module.exports = async function handler(req, res) {
  // Webhooks only accept POST
  if (req.method !== "POST") {
    return error(res, "Método não permitido.", 405);
  }

  try {
    const body = parseBody(req);
    if (!body) {
      // MercadoPago expects 200 even if we can't parse
      return json(res, { received: true });
    }

    // Log the raw webhook for debugging
    const webhookLog = {
      receivedAt: new Date().toISOString(),
      body,
      headers: {
        "x-signature": req.headers["x-signature"] || null,
        "x-request-id": req.headers["x-request-id"] || null,
      },
    };
    await db.set(`webhook:${Date.now()}`, webhookLog);

    // Only process if we have a MercadoPago token
    if (!process.env.MERCADOPAGO_ACCESS_TOKEN) {
      console.warn("MERCADOPAGO_ACCESS_TOKEN not set, webhook logged but not processed.");
      return json(res, { received: true, processed: false });
    }

    const result = await processWebhook(body);

    if (!result) {
      // Not a payment notification (e.g., merchant_order) — acknowledge it
      return json(res, { received: true, type: body.type || "unknown" });
    }

    // Update the corresponding order
    const orderId = result.externalReference;
    if (orderId) {
      const order = await db.get(`order:${orderId}`);
      if (order) {
        // Map MercadoPago status to our order status
        const statusMap = {
          approved: "paid",
          pending: "payment_pending",
          authorized: "payment_authorized",
          in_process: "payment_pending",
          in_mediation: "payment_dispute",
          rejected: "payment_rejected",
          cancelled: "cancelled",
          refunded: "refunded",
          charged_back: "refunded",
        };

        order.paymentStatus = result.status;
        order.status = statusMap[result.status] || order.status;
        order.paymentId = result.paymentId;
        order.paymentMethodId = result.paymentMethodId;
        order.paymentTypeId = result.paymentTypeId;
        order.updatedAt = new Date().toISOString();

        await db.set(`order:${orderId}`, order);

        console.log(
          `Order ${orderId} updated: status=${order.status}, payment=${result.status}`
        );
      }
    }

    // MercadoPago expects 200 to stop retrying
    return json(res, { received: true, processed: true });
  } catch (err) {
    console.error("Webhook processing error:", err);
    // Still return 200 to prevent MercadoPago from retrying indefinitely
    return json(res, { received: true, error: "Processing failed" });
  }
};
