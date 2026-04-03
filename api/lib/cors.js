/**
 * CORS and common response helpers for Clube do Natural API.
 */

const ALLOWED_ORIGINS = [
  "https://clubedonatural.com.br",
  "https://www.clubedonatural.com.br",
  "http://localhost:3000",
  "http://localhost:5500",
];

function getCorsHeaders(origin) {
  const allowedOrigin =
    origin && ALLOWED_ORIGINS.some((o) => origin.startsWith(o))
      ? origin
      : ALLOWED_ORIGINS[0];

  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
  };
}

function json(res, data, status = 200) {
  const origin = res.req?.headers?.origin || "";
  const cors = getCorsHeaders(origin);
  Object.entries(cors).forEach(([k, v]) => res.setHeader(k, v));
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.status(status).json(data);
}

function error(res, message, status = 400) {
  json(res, { error: message }, status);
}

function handleCors(req, res) {
  if (req.method === "OPTIONS") {
    const origin = req.headers.origin || "";
    const cors = getCorsHeaders(origin);
    Object.entries(cors).forEach(([k, v]) => res.setHeader(k, v));
    res.status(204).end();
    return true;
  }
  return false;
}

function parseBody(req) {
  // Vercel already parses JSON bodies, but we handle edge cases
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body);
    } catch {
      return null;
    }
  }
  return null;
}

module.exports = { json, error, handleCors, parseBody, getCorsHeaders };
