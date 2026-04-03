const { json, error, handleCors, parseBody } = require("./lib/cors");
const db = require("./lib/db");

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

    const { name, email, phone, subject, message } = body;

    // Validation
    if (!name || !name.trim()) {
      return error(res, "Nome é obrigatório.", 400);
    }
    if (!email || !email.trim()) {
      return error(res, "E-mail é obrigatório.", 400);
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return error(res, "E-mail inválido.", 400);
    }

    if (!message || !message.trim()) {
      return error(res, "Mensagem é obrigatória.", 400);
    }

    if (message.trim().length < 10) {
      return error(res, "Mensagem deve ter pelo menos 10 caracteres.", 400);
    }

    const msgId = `MSG-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

    const contactMessage = {
      id: msgId,
      name: name.trim(),
      email: email.trim().toLowerCase(),
      phone: phone?.trim() || null,
      subject: subject?.trim() || "Contato pelo site",
      message: message.trim(),
      read: false,
      createdAt: new Date().toISOString(),
    };

    await db.set(`contact:${msgId}`, contactMessage);

    return json(
      res,
      {
        success: true,
        message: "Mensagem enviada com sucesso! Retornaremos em breve.",
        id: msgId,
      },
      201
    );
  } catch (err) {
    console.error("POST /api/contact error:", err);
    return error(res, "Erro ao enviar mensagem.", 500);
  }
};
