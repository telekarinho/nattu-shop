const { json, error, handleCors, parseBody } = require("./lib/cors");
const db = require("./lib/db");
const { createPreference } = require("./lib/mercadopago");

module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;

  // -----------------------------------------------------------------------
  // GET — list orders (optionally filter by email or status)
  // -----------------------------------------------------------------------
  if (req.method === "GET") {
    try {
      const { email, status } = req.query;

      const entries = await db.list("order:");
      let orders = entries.map((e) => e.value);

      if (email) {
        orders = orders.filter(
          (o) => o.customer?.email?.toLowerCase() === email.toLowerCase()
        );
      }
      if (status) {
        orders = orders.filter((o) => o.status === status);
      }

      // Sort newest first
      orders.sort(
        (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
      );

      return json(res, { success: true, count: orders.length, orders });
    } catch (err) {
      console.error("GET /api/orders error:", err);
      return error(res, "Erro ao listar pedidos.", 500);
    }
  }

  // -----------------------------------------------------------------------
  // POST — create a new order
  // -----------------------------------------------------------------------
  if (req.method === "POST") {
    try {
      const body = parseBody(req);
      if (!body) {
        return error(res, "Corpo da requisição inválido.", 400);
      }

      const { items, customer, deliveryMethod, address, notes } = body;

      // Validation
      if (!items || !Array.isArray(items) || items.length === 0) {
        return error(res, "O pedido precisa ter pelo menos um item.", 400);
      }
      if (!customer || !customer.name || !customer.email || !customer.phone) {
        return error(
          res,
          "Dados do cliente obrigatórios: name, email, phone.",
          400
        );
      }

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(customer.email)) {
        return error(res, "E-mail inválido.", 400);
      }

      // Validate each item
      for (const item of items) {
        if (!item.productId || !item.name || !item.quantity || !item.price) {
          return error(
            res,
            "Cada item deve ter: productId, name, quantity, price.",
            400
          );
        }
        if (item.quantity <= 0 || item.price < 0) {
          return error(res, "Quantidade e preço devem ser positivos.", 400);
        }
      }

      // Build order
      const orderId = `ORD-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
      const total = items.reduce(
        (sum, i) => sum + Number(i.price) * Number(i.quantity),
        0
      );

      const order = {
        id: orderId,
        items,
        customer: {
          name: customer.name,
          email: customer.email,
          phone: customer.phone,
        },
        deliveryMethod: deliveryMethod || "pickup",
        address: address || null,
        notes: notes || "",
        total: Math.round(total * 100) / 100,
        status: "pending",
        paymentStatus: "pending",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      // Save order
      await db.set(`order:${orderId}`, order);

      // Create MercadoPago preference if token is configured
      let paymentUrl = null;
      if (process.env.MERCADOPAGO_ACCESS_TOKEN) {
        try {
          const siteUrl =
            process.env.SITE_URL || "https://clubedonatural.com.br";
          const preference = await createPreference({
            items: items.map((i) => ({
              title: i.name,
              quantity: Number(i.quantity),
              unit_price: Number(i.price),
            })),
            payer: {
              name: customer.name,
              email: customer.email,
              phone: customer.phone,
            },
            externalRef: orderId,
            notificationUrl: `${siteUrl}/api/webhook-mercadopago`,
            backUrls: {
              success: `${siteUrl}/pedido?id=${orderId}&status=success`,
              failure: `${siteUrl}/pedido?id=${orderId}&status=failure`,
              pending: `${siteUrl}/pedido?id=${orderId}&status=pending`,
            },
          });

          paymentUrl = preference.init_point;
          order.mpPreferenceId = preference.id;
          order.paymentUrl = paymentUrl;
          await db.set(`order:${orderId}`, order);
        } catch (mpErr) {
          console.error("MercadoPago preference error:", mpErr);
          // Order is created but without payment link
        }
      }

      return json(
        res,
        {
          success: true,
          order: {
            id: order.id,
            total: order.total,
            status: order.status,
            paymentUrl,
            createdAt: order.createdAt,
          },
        },
        201
      );
    } catch (err) {
      console.error("POST /api/orders error:", err);
      return error(res, "Erro ao criar pedido.", 500);
    }
  }

  return error(res, "Método não permitido. Use GET ou POST.", 405);
};
