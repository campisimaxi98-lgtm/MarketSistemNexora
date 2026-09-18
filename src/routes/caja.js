const express = require('express');
const { getDB, round2 } = require('../db');
const { audit } = require('../helpers');
const { requireAuth, handle } = require('../middleware');

const router = express.Router();

function saldoActual(db, idCaja) {
  const r = db.prepare('SELECT saldo FROM movimientos_caja WHERE id_caja = ? ORDER BY id DESC LIMIT 1').get(idCaja);
  return r ? r.saldo : 0;
}

function detalleCaja(db, caja) {
  if (!caja) return null;
  const mvs = db.prepare('SELECT * FROM movimientos_caja WHERE id_caja = ? ORDER BY id').all(caja.id);
  let saldo = 0;
  let totalVentas = 0, totalIngresos = 0, totalEgresos = 0, totalRetiros = 0;
  const porMetodo = {};
  for (const m of mvs) {
    if (m.tipo === 'VENTA') { totalVentas += m.monto; }
    else if (m.tipo === 'INGRESO') totalIngresos += m.monto;
    else if (m.tipo === 'EGRESO') totalEgresos += m.monto;
    else if (m.tipo === 'RETIRO') totalRetiros += m.monto;
    if (m.tipo === 'VENTA') {
      const k = String(m.id_metodo_pago);
      porMetodo[k] = round2((porMetodo[k] || 0) + m.monto);
    }
    saldo = m.saldo;
  }
  const esperado = round2(caja.monto_apertura + totalVentas + totalIngresos - totalEgresos - totalRetiros);
  return {
    caja,
    saldo: round2(saldo),
    total_apertura: caja.monto_apertura,
    total_ventas: round2(totalVentas),
    total_ingresos: round2(totalIngresos),
    total_egresos: round2(totalEgresos),
    total_retiros: round2(totalRetiros),
    esperado,
    por_metodo: Object.fromEntries(Object.entries(porMetodo).map(([k, v]) => [Number(k), v])),
    movimientos: mvs.slice(-50).reverse()
  };
}

router.get('/estado', requireAuth, handle((req, res) => {
  const db = getDB();
  const caja = db.prepare("SELECT * FROM cajas WHERE estado = 'ABIERTA' ORDER BY id DESC LIMIT 1").get();
  const metodos = db.prepare('SELECT id, nombre FROM metodos_pago WHERE activo = 1 ORDER BY id').all();
  res.json({ detalle: caja ? detalleCaja(db, caja) : null, metodos });
}));

router.post('/apertura', requireAuth, handle((req, res) => {
  const db = getDB();
  const abierta = db.prepare("SELECT id FROM cajas WHERE estado = 'ABIERTA'").get();
  if (abierta) return res.status(400).json({ error: 'Ya hay una caja abierta' });
  const monto = round2(Number(((req.body || {}).monto) || 0));
  if (monto < 0) return res.status(400).json({ error: 'Monto de apertura inválido' });
  const info = db.prepare(`INSERT INTO cajas (estado, monto_apertura, id_usuario_apertura, abierta_en)
    VALUES ('ABIERTA', ?, ?, datetime('now','localtime'))`).run(monto, req.session.user.id);
  db.prepare(`INSERT INTO movimientos_caja (id_caja, tipo, concepto, monto, saldo, id_usuario)
    VALUES (?,'APERTURA','Apertura de caja',?,?,?)`).run(info.lastInsertRowid, monto, monto, req.session.user.id);
  audit(req.session.user, 'CAJA_APERTURA', 'Apertura $' + monto);
  res.json({ ok: true, id: info.lastInsertRowid });
}));

function addMovimiento(req, res, tipo, concepto) {
  const db = getDB();
  const caja = db.prepare("SELECT * FROM cajas WHERE estado = 'ABIERTA' ORDER BY id DESC LIMIT 1").get();
  if (!caja) return res.status(400).json({ error: 'No hay caja abierta' });
  const monto = round2(Number((req.body || {}).monto || 0));
  if (!(monto > 0)) return res.status(400).json({ error: 'Monto inválido' });
  const idMetodo = (req.body || {}).id_metodo_pago ? Number((req.body || {}).id_metodo_pago) : 1;
  const saldoNuevo = round2(saldoActual(db, caja.id) + (tipo === 'EGRESO' || tipo === 'RETIRO' ? -monto : monto));
  db.prepare(`INSERT INTO movimientos_caja (id_caja, tipo, concepto, id_metodo_pago, monto, saldo, id_usuario)
    VALUES (?,?,?,?,?,?,?)`).run(caja.id, tipo, String(concepto || ''), idMetodo, monto, saldoNuevo, req.session.user.id);
  audit(req.session.user, 'CAJA_' + tipo, concepto + ' $' + monto);
  res.json({ ok: true, saldo: saldoNuevo });
}

router.post('/ingreso', requireAuth, (req, res) => addMovimiento(req, res, 'INGRESO', (req.body || {}).concepto || 'Ingreso manual'));
router.post('/egreso', requireAuth, (req, res) => addMovimiento(req, res, 'EGRESO', (req.body || {}).concepto || 'Gasto'));
router.post('/retiro', requireAuth, (req, res) => addMovimiento(req, res, 'RETIRO', (req.body || {}).concepto || 'Retiro de caja'));

router.post('/cierre', requireAuth, handle((req, res) => {
  const db = getDB();
  const caja = db.prepare("SELECT * FROM cajas WHERE estado = 'ABIERTA' ORDER BY id DESC LIMIT 1").get();
  if (!caja) return res.status(400).json({ error: 'No hay caja abierta' });
  const detalle = detalleCaja(db, caja);
  const montoReal = round2(Number((req.body || {}).monto_real ?? detalle.esperado));
  const diferencia = round2(montoReal - detalle.esperado);
  db.prepare(`UPDATE cajas SET estado='CERRADA', monto_cierre=?, diferencia=?, id_usuario_cierre=?, cerrada_en=datetime('now','localtime')
    WHERE id = ?`).run(montoReal, diferencia, req.session.user.id, caja.id);
  db.prepare(`INSERT INTO movimientos_caja (id_caja, tipo, concepto, monto, saldo, id_usuario)
    VALUES (?,'CIERRE','Cierre de caja',?,?,?)`).run(caja.id, montoReal, montoReal, req.session.user.id);
  audit(req.session.user, 'CAJA_CIERRE', `Caja #${caja.id} | real $${montoReal} | esperado $${detalle.esperado} | dif $${diferencia}`);
  res.json({ ok: true, cierre: { ...detalle, monto_real: montoReal, diferencia, caja_id: caja.id } });
}));

router.get('/historial', requireAuth, handle((req, res) => {
  const db = getDB();
  const rows = db.prepare(`
    SELECT c.id, c.estado, c.monto_apertura, c.monto_cierre, c.diferencia, c.abierta_en, c.cerrada_en,
      ua.nombre AS abrio, uc.nombre AS cerro,
      (SELECT SUM(monto) FROM movimientos_caja mc WHERE mc.id_caja = c.id AND mc.tipo = 'VENTA') AS total_ventas
    FROM cajas c
    LEFT JOIN usuarios ua ON ua.id = c.id_usuario_apertura
    LEFT JOIN usuarios uc ON uc.id = c.id_usuario_cierre
    ORDER BY c.id DESC LIMIT 60`).all();
  res.json(rows);
}));

module.exports = router;