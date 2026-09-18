const express = require('express');
const { getDB, round2 } = require('../db');
const { audit } = require('../helpers');
const { requireAuth, handle } = require('../middleware');

const router = express.Router();

router.get('/reponer', requireAuth, handle((req, res) => {
  const db = getDB();
  const rows = db.prepare(`
    SELECT p.id, p.nombre, p.codigo_barras, p.codigo_interno, p.stock, p.stock_minimo, p.precio_venta,
      c.nombre AS categoria, ROUND(p.stock_minimo - p.stock, 2) AS faltan
    FROM productos p LEFT JOIN categorias c ON c.id = p.id_categoria
    WHERE p.esta_activo = 1 AND p.stock_minimo > 0 AND p.stock <= p.stock_minimo
    ORDER BY p.stock ASC, p.nombre COLLATE NOCASE`).all();
  res.json({ total: rows.length, productos: rows });
}));

router.get('/movimientos', requireAuth, handle((req, res) => {
  const { producto_id = '', desde = '', hasta = '', limite = 200 } = req.query;
  const db = getDB();
  const wh = [];
  const params = {};
  if (producto_id) { wh.push('m.id_producto = @pid'); params.pid = Number(producto_id); }
  if (desde) { wh.push('date(m.creado_en) >= @d'); params.d = desde; }
  if (hasta) { wh.push('date(m.creado_en) <= @h'); params.h = hasta; }
  const w = wh.length ? 'WHERE ' + wh.join(' AND ') : '';
  const rows = db.prepare(`
    SELECT m.*, p.nombre, p.codigo_barras FROM movimientos_stock m
    JOIN productos p ON p.id = m.id_producto ${w}
    ORDER BY m.id DESC LIMIT @lim`).all({ ...params, lim: Number(limite) });
  res.json(rows);
}));

router.post('/entrada', requireAuth, handle((req, res) => {
  const { id_producto, cantidad, motivo = 'Carga de mercadería' } = req.body || {};
  const db = getDB();
  const prod = db.prepare('SELECT * FROM productos WHERE id = ?').get(Number(id_producto));
  if (!prod) return res.status(404).json({ error: 'Producto no encontrado' });
  const cant = Number(cantidad);
  if (!(cant > 0)) return res.status(400).json({ error: 'Cantidad inválida' });
  const nuevo = round2(prod.stock + cant);
  db.prepare('UPDATE productos SET stock = ?, actualizado_en = datetime(\'now\',\'localtime\') WHERE id = ?').run(nuevo, prod.id);
  db.prepare(`INSERT INTO movimientos_stock (id_producto, tipo, cantidad, stock_anterior, stock_nuevo, motivo, id_usuario)
    VALUES (?,?,?,?,?,?,?)`).run(prod.id, 'ENTRADA', cant, prod.stock, nuevo, String(motivo || ''), req.session.user.id);
  audit(req.session.user, 'STOCK_ENTRADA', `${prod.nombre}: +${cant} (${motivo || 'carga'})`);
  res.json({ ok: true, stock: nuevo, stock_anterior: prod.stock });
}));

router.post('/ajuste', requireAuth, handle((req, res) => {
  const { id_producto, nuevo_stock, motivo = 'Ajuste manual' } = req.body || {};
  const db = getDB();
  const prod = db.prepare('SELECT * FROM productos WHERE id = ?').get(Number(id_producto));
  if (!prod) return res.status(404).json({ error: 'Producto no encontrado' });
  const ns = Number(nuevo_stock);
  if (isNaN(ns) || ns < 0) return res.status(400).json({ error: 'Stock inválido' });
  const cant = round2(ns - prod.stock);
  db.prepare('UPDATE productos SET stock = ?, actualizado_en = datetime(\'now\',\'localtime\') WHERE id = ?').run(ns, prod.id);
  db.prepare(`INSERT INTO movimientos_stock (id_producto, tipo, cantidad, stock_anterior, stock_nuevo, motivo, id_usuario)
    VALUES (?,'AJUSTE',?,?,?,?,?)`).run(prod.id, cant, prod.stock, ns, String(motivo || ''), req.session.user.id);
  audit(req.session.user, 'STOCK_AJUSTE', `${prod.nombre}: ${prod.stock} -> ${ns} (${motivo || 'ajuste'})`);
  res.json({ ok: true, stock: ns, stock_anterior: prod.stock });
}));

module.exports = router;