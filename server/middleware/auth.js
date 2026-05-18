function requireAuth(req, res, next) {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: "Не авторизован" });
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: "Не авторизован" });
  }
  if (req.session.role !== "admin") {
    return res.status(403).json({ error: "Недостаточно прав" });
  }
  next();
}

module.exports = { requireAuth, requireAdmin };
