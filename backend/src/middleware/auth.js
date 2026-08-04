// Exige um Supabase ID token válido (header "Authorization: Bearer <token>")
// em toda rota que usar este middleware. Em caso de sucesso, anexa
// req.user = { uid, email } — os controllers usam isso para saber quem está
// fazendo a chamada (ex.: GET /api/users/me).

const supabaseService = require("../services/supabaseService");

async function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const [scheme, token] = header.split(" ");
  if (scheme !== "Bearer" || !token) {
    return res.status(401).json({ error: "unauthorized", message: "Token ausente" });
  }
  try {
    const decoded = await supabaseService.getAuth().verifyIdToken(token);
    req.user = { uid: decoded.uid, email: decoded.email || null };
    next();
  } catch (err) {
    console.error("KronoOP: falha ao verificar token —", err.name, err.message);
    res.status(401).json({ error: "unauthorized", message: "Token inválido ou expirado" });
  }
}

module.exports = { requireAuth };
