const express = require('express');
const { getDB, round2 } = require('../db');
const { getConfig } = require('../config');
const { totalVentasPeriodo } = require('../helpers');
const { requireAuth, handle } = require('../middleware');

const router = express.Router();

router.get('/dashboard', requireAuth, handle((req, res) => {
  const db = getDB();
  const hoy = new Date();
  const iso = (d) => d.toISOString().slice(0, 10);
  const hoyStr = iso(hoy);
  const hoyLocal = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`;
  void hoyStr;

  const resumenHoy = totalVentasPeriodo(hoyLocal, hoyLocal);

  const sem1 = new Date(hoy); sem1.setDate(sem1.getDate() - 6);
  const semLocal = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const ventas7 = db.prepare(`
    SELECT date(creado_en) AS dia, ROUND(SUM(total),2) AS total, COUNT(*) AS ventas
    FROM ventas WHERE estado='COMPLETADA' AND date(creado_en) >= ? AND date(creado_en) <= ?
    GROUP BY date(creado_en) ORDER BY dia`).all(semLocal(sem1), hoyLocal);

  const mesIni = hoyLocal.slice(0, 8) + '01';
  const porCategoriaMes = db.prepare(`
    SELECT COALESCE(c.nombre,'Sin categoría') AS categoria, ROUND(SUM(dv.total),2) AS total
    FROM detalle_ventas dv JOIN ventas v ON v.id = dv.id_venta
    LEFT JOIN productos p ON p.id = dv.id_producto
    LEFT JOIN categorias c ON c.id = p.id_categoria
    WHERE v.estado='COMPLETADA' AND date(v.creado_en) >= ? AND date(v.creado_en) <= ?
    GROUP BY c.nombre ORDER BY total DESC LIMIT 8`).all(mesIni, hoyLocal);

  const topProductos = db.prepare(`
    SELECT dv.nombre, SUM(dv.cantidad) AS cantidad, SUM(dv.total) AS total
    FROM detalle_ventas dv JOIN ventas v ON v.id = dv.id_venta
    WHERE v.estado='COMPLETADA' AND date(v.creado_en) = ?
    GROUP BY dv.nombre ORDER BY cantidad DESC LIMIT 6`).all(hoyLocal);

  const stockBajo = db.prepare(`SELECT COUNT(*) c FROM productos WHERE esta_activo=1 AND stock_minimo > 0 AND stock <= stock_minimo`).get().c;
  const caja = db.prepare("SELECT * FROM cajas WHERE estado='ABIERTA' ORDER BY id DESC LIMIT 1").get();
  const saldoCaja = caja ? (db.prepare('SELECT saldo FROM movimientos_caja WHERE id_caja=? ORDER BY id DESC LIMIT 1').get(caja.id) || {}).saldo || caja.monto_apertura : 0;

  const pendientes = getConfig('stock_minimo_default');
  res.json({
    nombre_comercio: getConfig('nombre_comercio'),
    moneda: getConfig('moneda'),
    hoy: hoyLocal,
    resumen_hoy: resumenHoy,
    stock_bajo: stockBajo,
    stock_minimo_default: pendientes,
    caja_abierta: !!caja, caja_id: caja ? caja.id : null, saldo_caja: round2(saldoCaja),
    ventas_7_dias: ventas7,
    ventas_por_categoria: porCategoriaMes,
    top_productos: topProductos
  });
}));

router.get('/ventas', requireAuth, handle((req, res) => {
  const db = getDB();
  const { desde, hasta } = req.query;
  if (!desde || !hasta) return res.status(400).json({ error: 'Faltan fechas' });
  const porDia = db.prepare(`
    SELECT date(creado_en) AS dia, ROUND(SUM(total),2) AS total, COUNT(*) AS ventas, ROUND(SUM(ganancia),2) AS ganancia, SUM(cant) AS unidades
    FROM (SELECT v.*, (SELECT COALESCE(SUM(d.cantidad),0) FROM detalle_ventas d WHERE d.id_venta=v.id) AS cant
          FROM ventas v WHERE v.estado='COMPLETADA' AND date(v.creado_en) BETWEEN ? AND ?) t
    GROUP BY dia ORDER BY dia`).all(desde, hasta);
  const porMetodo = db.prepare(`
    SELECT m.nombre AS metodo, ROUND(SUM(pg.monto),2) AS total FROM pagos pg
    JOIN ventas v ON v.id = pg.id_venta JOIN metodos_pago m ON m.id = pg.id_metodo_pago
    WHERE v.estado='COMPLETADA' AND date(v.creado_en) BETWEEN ? AND ?
    GROUP BY m.nombre ORDER BY total DESC`).all(desde, hasta);
  const resumen = totalVentasPeriodo(desde, hasta);
  resumen.unidades = Number(resumen.unidades);
  const detalle = db.prepare(`
    SELECT v.numero, v.creado_en, dv.nombre AS producto, dv.codigo, dv.cantidad, dv.precio_unitario, dv.total, dv.costo_unitario, dv.ganancia
    FROM detalle_ventas dv JOIN ventas v ON v.id = dv.id_venta
    WHERE v.estado='COMPLETADA' AND date(v.creado_en) BETWEEN ? AND ? ORDER BY v.id, dv.id`).all(desde, hasta);
  res.json({ desde, hasta, resumen, por_dia: porDia, por_metodo: porMetodo, detalle });
}));

router.get('/productos', requireAuth, handle((req, res) => {
  const db = getDB();
  const { desde, hasta } = req.query;
  const { mas_vendidos = '1', menos_vendidos = '0', sin_movimiento = '0', stock_bajo = '0', limite = 30 } = req.query;
  const rango = (!desde || !hasta) ? `1=1` : `date(v.creado_en) BETWEEN '${desde}' AND '${hasta}'`;
  if (mas_vendidos === '1') {
    const rows = db.prepare(`
      SELECT dv.nombre, SUM(dv.cantidad) cantidad, SUM(dv.total) total, ROUND(SUM(dv.ganancia),2) ganancia
      FROM detalle_ventas dv JOIN ventas v ON v.id=dv.id_venta
      WHERE v.estado='COMPLETADA' AND ${rango}
      GROUP BY dv.nombre ORDER BY cantidad DESC, dv.nombre LIMIT ?`).all(Number(limite));
    return res.json({ tipo: 'mas_vendidos', filas: rows });
  }
  if (menos_vendidos === '1') {
    const rows = db.prepare(`
      SELECT dv.nombre, SUM(dv.cantidad) cantidad, SUM(dv.total) total
      FROM detalle_ventas dv JOIN ventas v ON v.id=dv.id_venta
      WHERE v.estado='COMPLETADA' AND ${rango}
      GROUP BY dv.nombre ORDER BY cantidad ASC, dv.nombre LIMIT ?`).all(Number(limite));
    return res.json({ tipo: 'menos_vendidos', filas: rows });
  }
  if (sin_movimiento === '1') {
    const rows = db.prepare(`
      SELECT p.id, p.nombre, p.codigo_barras, p.stock, p.precio_venta, c.nombre AS categoria
      FROM productos p LEFT JOIN categorias c ON c.id=p.id_categoria
      WHERE p.esta_activo=1 AND NOT EXISTS (
        SELECT 1 FROM detalle_ventas dv JOIN ventas v ON v.id=dv.id_venta
        WHERE dv.id_producto=p.id AND v.estado='COMPLETADA' AND ${rango.replaceAll('v.creado_en', 'v.creado_en')})
      ORDER BY p.nombre COLLATE NOCASE LIMIT ?`).all(Number(limite));
    return res.json({ tipo: 'sin_movimiento', filas: rows });
  }
  if (stock_bajo === '1') {
    const rows = db.prepare(`
      SELECT p.id, p.nombre, p.codigo_barras, p.stock, p.stock_minimo, p.precio_venta, c.nombre AS categoria
      FROM productos p LEFT JOIN categorias c ON c.id=p.id_categoria
      WHERE p.esta_activo=1 AND p.stock_minimo>0 AND p.stock<=p.stock_minimo
      ORDER BY p.stock ASC LIMIT ?`).all(Number(limite));
    return res.json({ tipo: 'stock_bajo', filas: rows });
  }
  res.json({ tipo: 'none', filas: [] });
}));

router.get('/ganancias', requireAuth, handle((req, res) => {
  const db = getDB();
  const { desde, hasta } = req.query;
  if (!desde || !hasta) return res.status(400).json({ error: 'Faltan fechas' });
  const porDia = db.prepare(`
    SELECT date(creado_en) AS dia, ROUND(SUM(total),2) AS facturacion, ROUND(SUM(costo_total),2) AS costo,
      ROUND(SUM(ganancia),2) AS ganancia, COUNT(*) AS ventas, (SELECT COALESCE(SUM(d.cantidad),0) FROM detalle_ventas d WHERE d.id_venta=t.id) AS unidades
    FROM (SELECT * FROM ventas WHERE estado='COMPLETADA' AND date(creado_en) BETWEEN ? AND ?) t
    GROUP BY dia ORDER BY dia`).all(desde, hasta);
  const total = db.prepare(`
    SELECT ROUND(SUM(total),2) facturacion, ROUND(SUM(costo_total),2) costo, ROUND(SUM(ganancia),2) ganancia, COUNT(*) ventas
    FROM ventas WHERE estado='COMPLETADA' AND date(creado_en) BETWEEN ? AND ?`).get(desde, hasta);
  res.json({ desde, hasta, total, por_dia: porDia });
}));

router.get('/caja', requireAuth, handle((req, res) => {
  const db = getDB();
  const { desde, hasta } = req.query;
  if (!desde || !hasta) return res.status(400).json({ error: 'Faltan fechas' });
  const mv = db.prepare(`
    SELECT mc.creado_en, mc.tipo, mc.concepto, mc.monto, mc.saldo, m.nombre AS metodo, v.numero
    FROM movimientos_caja mc LEFT JOIN metodos_pago m ON m.id=mc.id_metodo_pago LEFT JOIN ventas v ON v.id=mc.id_venta
    WHERE date(mc.creado_en) BETWEEN ? AND ? ORDER BY mc.id DESC LIMIT 1000`).all(desde, hasta);
  const resumen = db.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN tipo='VENTA' THEN monto END),0) ingresos,
      COALESCE(SUM(CASE WHEN tipo='INGRESO' THEN monto END),0) ingreso_manual,
      COALESCE(SUM(CASE WHEN tipo='EGRESO' THEN monto END),0) egresos,
      COALESCE(SUM(CASE WHEN tipo='RETIRO' THEN monto END),0) retiros
    FROM movimientos_caja WHERE date(creado_en) BETWEEN ? AND ?`).get(desde, hasta);
  res.json({ desde, hasta, resumen, movimientos: mv });
}));

router.get('/resumen-mensual', requireAuth, handle((req, res) => {
  const db = getDB();
  const anio = Number(req.query.anio) || new Date().getFullYear();
  const filas = [];
  for (let mes = 1; mes <= 12; mes++) {
    const ini = `${anio}-${String(mes).padStart(2, '0')}-01`;
    const fin = `${anio}-${String(mes).padStart(2, '0')}-31`;
    const v = db.prepare(`
      SELECT ROUND(SUM(total),2) facturacion, ROUND(SUM(costo_total),2) costos, ROUND(SUM(ganancia),2) ganancia, COUNT(*) ventas
      FROM ventas WHERE estado='COMPLETADA' AND date(creado_en) BETWEEN ? AND ?`).get(ini, fin);
    const g = db.prepare(`
      SELECT COALESCE(SUM(CASE WHEN tipo='EGRESO' THEN monto END),0) gastos
      FROM movimientos_caja WHERE date(creado_en) BETWEEN ? AND ?`).get(ini, fin);
    const u = db.prepare(`
      SELECT COALESCE(SUM(dv.cantidad),0) unidades FROM detalle_ventas dv JOIN ventas v ON v.id=dv.id_venta
      WHERE v.estado='COMPLETADA' AND date(v.creado_en) BETWEEN ? AND ?`).get(ini, fin);
    filas.push({
      mes, anio,
      facturacion: v.facturacion || 0, costos: v.costos || 0, ganancia: v.ganancia || 0,
      gastos: g.gastos || 0, ventas: v.ventas || 0, unidades: u.unidades || 0
    });
  }
  res.json({ anio, filas });
}));

module.exports = router;