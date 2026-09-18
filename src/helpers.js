const { getDB } = require('./db');

function audit(usuario, accion, detalle) {
  const id = usuario && usuario.id ? usuario.id : null;
  getDB().prepare('INSERT INTO auditoria (id_usuario, accion, detalle) VALUES (?,?,?)').run(id, accion, detalle || '');
}

function registrarPrecio(idProducto, precioCosto, precioVenta, usuario) {
  const id = usuario && usuario.id ? usuario.id : null;
  getDB().prepare('INSERT INTO precios_historial (id_producto, precio_costo, precio_venta, id_usuario) VALUES (?,?,?,?)')
    .run(idProducto, precioCosto, precioVenta, id);
}

function registrarMovimientoStock(prod, tipo, cantidad, motivo, usuario, idVenta) {
  const nuevo = Math.round((prod.stock + cantidad) * 1000) / 1000;
  getDB().prepare(`INSERT INTO movimientos_stock
    (id_producto, tipo, cantidad, stock_anterior, stock_nuevo, motivo, id_usuario, id_venta)
    VALUES (?,?,?,?,?,?,?,?)`)
    .run(prod.id, tipo, cantidad, prod.stock, nuevo, motivo || null, usuario && usuario.id ? usuario.id : null, idVenta || null);
  return nuevo;
}

function proximoNumeroVenta() {
  const hoy = new Date();
  const prefijo = 'V-' + hoy.getFullYear() +
    String(hoy.getMonth() + 1).padStart(2, '0') +
    String(hoy.getDate()).padStart(2, '0') + '-';
  const row = getDB().prepare(
    `SELECT numero FROM ventas WHERE numero LIKE ? ORDER BY numero DESC LIMIT 1`
  ).get(prefijo + '%');
  const n = row ? parseInt(row.numero.split('-').pop(), 10) + 1 : 1;
  return prefijo + String(n).padStart(4, '0');
}

function totalVentasPeriodo(desde, hasta) {
  const r = getDB().prepare(`SELECT
    COALESCE(SUM(total),0) total, COALESCE(SUM(ganancia),0) ganancia,
    COALESCE(SUM(costo_total),0) costo, COUNT(*) ventas,
    COALESCE(SUM((SELECT COALESCE(SUM(cantidad),0) FROM detalle_ventas d WHERE d.id_venta = v.id)),0) unidades
    FROM ventas v WHERE estado='COMPLETADA' AND date(creado_en) BETWEEN ? AND ?`).get(desde, hasta);
  return r;
}

module.exports = { audit, registrarPrecio, registrarMovimientoStock, proximoNumeroVenta, totalVentasPeriodo };