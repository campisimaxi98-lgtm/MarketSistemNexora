const express = require('express');
const { getDB, round2 } = require('../db');
const { getConfig } = require('../config');
const { generarTicketPDF } = require('../pdf');
const { requireAuth, handle } = require('../middleware');

const router = express.Router();

function ventaCompleta(db, id) {
  const v = db.prepare(`SELECT v.*, u.nombre AS vendedor FROM ventas v LEFT JOIN usuarios u ON u.id=v.id_usuario WHERE v.id=?`).get(id);
  if (!v) return null;
  v.detalle = db.prepare('SELECT * FROM detalle_ventas WHERE id_venta=? ORDER BY id').all(id);
  v.pagos = db.prepare(`SELECT p.monto, m.nombre metodo FROM pagos p JOIN metodos_pago m ON m.id=p.id_metodo_pago WHERE p.id_venta=? ORDER BY p.id`).all(id);
  return v;
}

function armarLineas(v) {
  const conf = getConfig;
  const L = [];
  const nombre = conf('nombre_comercio') || 'MarketSistemNexora';
  L.push({ text: nombre, bold: true, size: 14, center: true });
  if (conf('direccion')) L.push({ text: conf('direccion'), center: true });
  if (conf('telefono')) L.push({ text: 'Tel: ' + conf('telefono'), center: true });
  if (conf('cuit')) L.push({ text: 'CUIT: ' + conf('cuit'), center: true });
  L.push({ text: '--------------------------------', center: true });
  L.push({ text: `N° ${v.numero}`, bold: true });
  L.push({ text: v.creado_en });
  L.push({ text: `Atendió: ${v.vendedor || '-'}` });
  L.push({ text: '================================', center: true });
  const anchoTxt = 43;
  for (const d of v.detalle) {
    const nombreL = d.nombre.length > anchoTxt ? d.nombre.slice(0, anchoTxt - 1) : d.nombre;
    L.push({ text: nombreL, bold: true });
    L.push({ text: `${d.cantidad} x $${d.precio_unitario.toFixed(2)}      $${d.total.toFixed(2)}` });
  }
  L.push({ text: '================================', center: true });
  L.push({ text: `TOTAL: $${v.total.toFixed(2)}`, bold: true, size: 12, center: true });
  for (const p of v.pagos) {
    L.push({ text: `${p.metodo}: $${p.monto.toFixed(2)}` });
  }
  L.push({ text: '--------------------------------', center: true });
  if (conf('incluir_ganancia_ticket') === '1') {
    L.push({ text: `Ganancia estimada: $${round2(v.ganancia).toFixed(2)}` });
  }
  if (conf('mensaje_ticket')) L.push({ text: conf('mensaje_ticket'), center: true, size: 9, bold: true });
  return L;
}

router.get('/:id/pdf', requireAuth, handle((req, res) => {
  const v = ventaCompleta(getDB(), Number(req.params.id));
  if (!v) return res.status(404).json({ error: 'Venta no encontrada' });
  const lineas = armarLineas(v);
  const pdf = generarTicketPDF({ lineas });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="ticket_${v.numero}.pdf"`);
  res.send(pdf);
}));

module.exports = router;