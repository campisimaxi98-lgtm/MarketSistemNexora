const express = require('express');
const { getDB, round2 } = require('../db');
const { getConfig } = require('../config');
const { audit, registrarMovimientoStock, proximoNumeroVenta } = require('../helpers');
const { requireAuth, requireAdmin, handle } = require('../middleware');

const router = express.Router();

function saldoCajaActual(db, idCaja) {
  const row = db.prepare('SELECT saldo FROM movimientos_caja WHERE id_caja = ? ORDER BY id DESC LIMIT 1').get(idCaja);
  return row ? row.saldo : 0;
}

router.post('/', requireAuth, handle((req, res) => {
  const body = req.body || {};
  const items = Array.isArray(body.items) ? body.items : [];
  const pagos = Array.isArray(body.pagos) ? body.pagos : [];
  if (!items.length) return res.status(400).json({ error: 'La venta no tiene productos' });
  if (!pagos.length) return res.status(400).json({ error: 'Falta el método de pago' });

  const db = getDB();
  const usarStock = getConfig('usar_stock') !== '0';
  const sinStock = [];

  const detalles = items.map((it) => {
    const id = Number(it.id_producto);
    const cantidad = Number(it.cantidad);
    if (!(cantidad > 0)) return { error: 'Cantidad inválida' };
    const prod = db.prepare('SELECT * FROM productos WHERE id = ? AND esta_activo = 1').get(id);
    if (!prod) return { error: 'Producto inexistente o desactivado' };
    if (usarStock && prod.stock < cantidad) sinStock.push(`${prod.nombre} (stock: ${prod.stock})`);
    const precio = Number(prod.precio_venta) || 0;
    const costo = Number(prod.precio_costo) || 0;
    const total = round2(precio * cantidad);
    return {
      id_producto: prod.id, nombre: prod.nombre, codigo: prod.codigo_barras || prod.codigo_interno || prod.codigo_qr,
      cantidad, precio_unitario: precio, costo_unitario: costo, total, ganancia: round2((precio - costo) * cantidad), prod
    };
  });

  const err = detalles.find((d) => d.error);
  if (err) return res.status(400).json({ error: err.error });
  if (sinStock.length) return res.status(400).json({ error: 'Stock insuficiente: ' + sinStock.join(', ') });

  const total = round2(detalles.reduce((a, d) => a + d.total, 0));
  const costoTotal = round2(detalles.reduce((a, d) => a + d.costo_unitario * d.cantidad, 0));
  const ganancia = round2(total - costoTotal);
  const sumaPagos = round2(pagos.reduce((a, p) => a + Number(p.monto), 0));
  if (Math.abs(sumaPagos - total) > 0.01) {
    return res.status(400).json({ error: 'La suma de pagos ($' + sumaPagos.toFixed(2) + ') no coincide con el total ($' + total.toFixed(2) + ')' });
  }

  const numero = proximoNumeroVenta();
  const caja = db.prepare("SELECT * FROM cajas WHERE estado = 'ABIERTA' ORDER BY id DESC LIMIT 1").get();

  db.exec('BEGIN');
  try {
    const info = db.prepare(`INSERT INTO ventas (numero, total, costo_total, ganancia, estado, id_usuario) VALUES (?,?,?,?,?,?)`)
      .run(numero, total, costoTotal, ganancia, 'COMPLETADA', req.session.user.id);

    const insDet = db.prepare(`INSERT INTO detalle_ventas (id_venta, id_producto, nombre, codigo, cantidad, precio_unitario, costo_unitario, total, ganancia)
      VALUES (?,?,?,?,?,?,?,?,?)`);
    const updStock = db.prepare('UPDATE productos SET stock = stock - ?, actualizado_en = datetime(\'now\',\'localtime\') WHERE id = ?');
    for (const d of detalles) {
      insDet.run(info.lastInsertRowid, d.id_producto, d.nombre, d.codigo, d.cantidad, d.precio_unitario, d.costo_unitario, d.total, d.ganancia);
      if (usarStock) {
        updStock.run(d.cantidad, d.id_producto);
        const nuevoStock = round2(d.prod.stock - d.cantidad);
        db.prepare(`INSERT INTO movimientos_stock (id_producto, tipo, cantidad, stock_anterior, stock_nuevo, motivo, id_usuario, id_venta)
          VALUES (?,?,?,?,?,?,?,?)`).run(d.id_producto, 'SALIDA', d.cantidad, d.prod.stock, nuevoStock, 'VENTA', req.session.user.id, info.lastInsertRowid);
      }
    }

    let saldo = 0;
    if (caja) saldo = saldoCajaActual(db, caja.id);
    const insPago = db.prepare('INSERT INTO pagos (id_venta, id_metodo_pago, monto) VALUES (?,?,?)');
    const insMc = db.prepare(`INSERT INTO movimientos_caja (id_caja, tipo, concepto, id_metodo_pago, monto, saldo, id_venta, id_usuario) VALUES (?,?,?,?,?,?,?,?)`);
    for (const p of pagos) {
      insPago.run(info.lastInsertRowid, Number(p.id_metodo_pago), round2(Number(p.monto)));
      if (caja) {
        saldo = round2(saldo + Number(p.monto));
        insMc.run(caja.id, 'VENTA', 'Venta ' + numero, Number(p.id_metodo_pago), round2(Number(p.monto)), saldo, info.lastInsertRowid, req.session.user.id);
      }
    }
    db.exec('COMMIT');
    audit(req.session.user, 'VENTA', numero + ' | Total $' + total.toFixed(2));
    res.json({ ok: true, id: info.lastInsertRowid, numero, total });
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}));

router.get('/', requireAuth, handle((req, res) => {
  const { desde = '', hasta = '', numero = '', limite = 100 } = req.query;
  const db = getDB();
  const wh = [];
  const params = {};
  if (desde) { wh.push('date(v.creado_en) >= @desde'); params.desde = desde; }
  if (hasta) { wh.push('date(v.creado_en) <= @hasta'); params.hasta = hasta; }
  if (numero) { wh.push('v.numero LIKE @numero'); params.numero = `%${numero}%`; }
  const w = wh.length ? 'WHERE ' + wh.join(' AND ') : '';
  const rows = db.prepare(`
    SELECT v.id, v.numero, v.total, v.costo_total, v.ganancia, v.estado, v.creado_en, u.nombre AS vendedor
    FROM ventas v LEFT JOIN usuarios u ON u.id = v.id_usuario ${w}
    ORDER BY v.id DESC LIMIT @lim`).all({ ...params, lim: Number(limite) });
  res.json(rows);
}));

router.get('/ultima', requireAuth, handle((req, res) => {
  const db = getDB();
  const v = db.prepare(`SELECT v.*, u.nombre AS vendedor FROM ventas v LEFT JOIN usuarios u ON u.id = v.id_usuario
    WHERE v.estado = 'COMPLETADA' ORDER BY v.id DESC LIMIT 1`).get();
  if (!v) return res.json(null);
  const detalle = db.prepare('SELECT * FROM detalle_ventas WHERE id_venta = ?').all(v.id);
  const pagos = db.prepare(`SELECT p.*, m.nombre AS metodo FROM pagos p JOIN metodos_pago m ON m.id = p.id_metodo_pago WHERE p.id_venta = ?`).all(v.id);
  res.json({ ...v, detalle, pagos });
}));

function ventaCompleta(db, id) {
  const v = db.prepare(`SELECT v.*, u.nombre AS vendedor FROM ventas v LEFT JOIN usuarios u ON u.id = v.id_usuario WHERE v.id = ?`).get(id);
  if (!v) return null;
  v.detalle = db.prepare('SELECT * FROM detalle_ventas WHERE id_venta = ?').all(id);
  v.pagos = db.prepare(`SELECT p.*, m.nombre AS metodo FROM pagos p JOIN metodos_pago m ON m.id = p.id_metodo_pago WHERE p.id_venta = ?`).all(id);
  return v;
}

router.get('/:id', requireAuth, handle((req, res) => {
  const v = ventaCompleta(getDB(), Number(req.params.id));
  if (!v) return res.status(404).json({ error: 'Venta no encontrada' });
  res.json(v);
}));

router.post('/:id/anular', requireAdmin, handle((req, res) => {
  const db = getDB();
  const id = Number(req.params.id);
  const v = ventaCompleta(db, id);
  if (!v) return res.status(404).json({ error: 'Venta no encontrada' });
  if (v.estado !== 'COMPLETADA') return res.status(400).json({ error: 'La venta ya fue anulada' });
  if ((req.body || {}).motivo === undefined) return res.status(400).json({ error: 'Indique el motivo' });

  const usarStock = getConfig('usar_stock') !== '0';
  db.exec('BEGIN');
  try {
    db.prepare(`UPDATE ventas SET estado = 'ANULADA' WHERE id = ?`).run(id);
    if (usarStock) {
      for (const d of v.detalle) {
        const prod = db.prepare('SELECT * FROM productos WHERE id = ?').get(d.id_producto);
        if (!prod) continue;
        const nuevo = round2(prod.stock + d.cantidad);
        db.prepare('UPDATE productos SET stock = ?, actualizado_en = datetime(\'now\',\'localtime\') WHERE id = ?').run(nuevo, prod.id);
        db.prepare(`INSERT INTO movimientos_stock (id_producto, tipo, cantidad, stock_anterior, stock_nuevo, motivo, id_usuario, id_venta)
          VALUES (?,?,?,?,?,?,?,?)`).run(prod.id, 'ENTRADA', d.cantidad, prod.stock, nuevo, 'ANULACION VENTA ' + v.numero, req.session.user.id, id);
      }
    }
    db.exec('COMMIT');
    audit(req.session.user, 'ANULAR_VENTA', v.numero + ' - ' + (req.body.motivo || ''));
    res.json({ ok: true });
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}));

module.exports = router;