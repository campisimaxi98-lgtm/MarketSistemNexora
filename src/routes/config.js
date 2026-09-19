const express = require('express');
const { getAllConfig, setConfig } = require('../config');
const { audit } = require('../helpers');
const { requireAuth, requireAdmin, handle } = require('../middleware');

const router = express.Router();

router.get('/', requireAuth, (req, res) => {
  res.json(getAllConfig());
});

router.put('/', requireAdmin, handle((req, res) => {
  const body = req.body || {};
  const keys = ['nombre_comercio', 'direccion', 'telefono', 'cuit', 'moneda', 'stock_minimo_default',
    'formato_ticket', 'mensaje_ticket', 'incluir_ganancia_ticket', 'backup_automatico', 'backup_frecuencia_hs',
    'usar_stock'];
  const cambios = [];
  for (const k of keys) {
    if (body[k] !== undefined) { setConfig(k, body[k]); cambios.push(k); }
  }
  // métodos de pago
  if (Array.isArray(body.metodos_pago)) {
    const db = require('../db').getDB();
    const upd = db.prepare('UPDATE metodos_pago SET nombre = COALESCE(?, nombre), activo = ? WHERE id = ?');
    body.metodos_pago.forEach((m) => {
      if (m && m.id) {
        upd.run(m.nombre !== undefined ? String(m.nombre).trim() : null, m.activo ? 1 : 0, Number(m.id));
        cambios.push('metodo_pago_' + m.id);
      }
    });
  }
  // categorías (agregar nuevas)
  if (Array.isArray(body.categorias_nuevas)) {
    const db = require('../db').getDB();
    const st = db.prepare('INSERT OR IGNORE INTO categorias (nombre) VALUES (?)');
    body.categorias_nuevas.forEach((c) => { if (c && c.trim()) st.run(c.trim()); });
  }
  if (cambios.length) {
    audit(req.session.user, 'CONFIG', 'Cambió la configuración');
  }
  res.json({ ok: true });
}));

module.exports = router;