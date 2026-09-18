function requireAuth(req, res, next) {
  if (!req.session || !req.session.user) {
    return res.status(401).json({ error: 'No autorizado' });
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session || !req.session.user) {
    return res.status(401).json({ error: 'No autorizado' });
  }
  if (req.session.user.rol !== 'ADMIN') {
    return res.status(403).json({ error: 'Se requiere permiso de administrador' });
  }
  next();
}

function handle(fn) {
  return (req, res, next) => {
    try {
      const result = fn(req, res);
      if (result && result.then) result.catch(next);
    } catch (e) {
      next(e);
    }
  };
}

module.exports = { requireAuth, requireAdmin, handle };