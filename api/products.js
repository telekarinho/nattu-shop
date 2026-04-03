const { json, error, handleCors } = require("./lib/cors");
const productsData = require("./data/products.json");

module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;

  if (req.method !== "GET") {
    return error(res, "Método não permitido. Use GET.", 405);
  }

  try {
    const { category, search, available } = req.query;

    let products = [...productsData];

    // Filter by category
    if (category) {
      products = products.filter(
        (p) => p.category.toLowerCase() === category.toLowerCase()
      );
    }

    // Filter by search term
    if (search) {
      const term = search.toLowerCase();
      products = products.filter(
        (p) =>
          p.name.toLowerCase().includes(term) ||
          p.description.toLowerCase().includes(term)
      );
    }

    // Filter by availability
    if (available !== undefined) {
      const isAvailable = available === "true";
      products = products.filter((p) => p.available === isAvailable);
    }

    return json(res, {
      success: true,
      count: products.length,
      products,
    });
  } catch (err) {
    console.error("GET /api/products error:", err);
    return error(res, "Erro interno ao buscar produtos.", 500);
  }
};
