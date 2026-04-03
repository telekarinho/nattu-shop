const { json, error, handleCors, parseBody } = require("./lib/cors");
const db = require("./lib/db");

const VALID_FREQUENCIES = ["weekly", "biweekly", "monthly"];

module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;

  if (req.method !== "POST") {
    return error(res, "Método não permitido. Use POST.", 405);
  }

  try {
    const body = parseBody(req);
    if (!body) {
      return error(res, "Corpo da requisição inválido.", 400);
    }

    const { customer, items, frequency, startDate, notes } = body;

    // Validation
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

    if (!items || !Array.isArray(items) || items.length === 0) {
      return error(res, "A assinatura precisa ter pelo menos um item.", 400);
    }

    if (!frequency || !VALID_FREQUENCIES.includes(frequency)) {
      return error(
        res,
        `Frequência inválida. Use: ${VALID_FREQUENCIES.join(", ")}.`,
        400
      );
    }

    for (const item of items) {
      if (!item.productId || !item.name || !item.quantity || !item.price) {
        return error(
          res,
          "Cada item deve ter: productId, name, quantity, price.",
          400
        );
      }
    }

    const subId = `SUB-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    const total = items.reduce(
      (sum, i) => sum + Number(i.price) * Number(i.quantity),
      0
    );

    const subscription = {
      id: subId,
      customer: {
        name: customer.name,
        email: customer.email,
        phone: customer.phone,
      },
      items,
      frequency,
      startDate: startDate || new Date().toISOString().slice(0, 10),
      notes: notes || "",
      total: Math.round(total * 100) / 100,
      status: "active",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await db.set(`subscription:${subId}`, subscription);

    return json(
      res,
      {
        success: true,
        subscription: {
          id: subscription.id,
          frequency: subscription.frequency,
          total: subscription.total,
          startDate: subscription.startDate,
          status: subscription.status,
          createdAt: subscription.createdAt,
        },
      },
      201
    );
  } catch (err) {
    console.error("POST /api/subscribe error:", err);
    return error(res, "Erro ao criar assinatura.", 500);
  }
};
