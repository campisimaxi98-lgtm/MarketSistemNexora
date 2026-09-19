const express = require('express');
const { getDB, round2 } = require('../db');
const { audit, registrarPrecio } = require('../helpers');
const { requireAdmin, handle } = require('../middleware');

const router = express.Router();

router.put('/:id', requireAdmin, handle((req, res) => {
  const db = getDB();
  const id = Number(req.params.id);
  const p = db.prepare('SELECT * FROM productos WHERE id = ?').get(id);
  if (!p) return res.status(404).json({ error: 'Producto no encontrado' });
  const body = req.body || {};
  const precioVenta = body.precio_venta !== undefined ? round2(Number(body.precio_venta)) : p.precio_venta;
  const precioCosto = body.precio_costo !== undefined ? round2(Number(body.precio_costo)) : p.precio_costo;
  if (!(precioVenta >= 0)) return res.status(400).json({ error: 'Precio de venta inválido' });
  if (!(precioCosto >= 0)) return res.status(400).json({ error: 'Precio de costo inválido' });
  if (precioVenta === p.precio_venta && precioCosto === p.precio_costo) {
    return res.json({ ok: true, sin_cambios: true });
  }
  db.prepare(`UPDATE productos SET precio_venta = ?, precio_costo = ?, actualizado_en = datetime('now','localtime') WHERE id = ?`)
    .run(precioVenta, precioCosto, id);
  registrarPrecio(id, precioCosto, precioVenta, req.session.user);
  audit(req.session.user, 'ACT_PRECIO', `${p.nombre}: venta ${p.precio_venta} -> ${precioVenta}` +
    (body.precio_costo !== undefined ? ` | costo ${p.precio_costo} -> ${precioCosto}` : ''));
  res.json({ ok: true });
}));

router.post('/masiva', requireAdmin, handle((req, res) => {
  const body = req.body || {};
  const { alcance = 'todos', categoria_id, ids, tipo = 'porcentaje', operacion = 'aumento', valor = 0, redondear_a = '' } = body;
  const v = Number(valor);
  if (!(v > 0)) return res.status(400).json({ error: 'El valor debe ser mayor a cero' });
  if (!['porcentaje', 'monto'].includes(tipo)) return res.status(400).json({ error: 'Tipo inválido' });
  if (!['aumento', 'disminucion'].includes(operacion)) return res.status(400).json({ error: 'Operación inválida' });

  const db = getDB();
  let productos = [];
  if (alcance === 'categoria') {
    if (!categoria_id) return res.status(400).json({ error: 'Indique la categoría para aplicar el cambio' });
    productos = db.prepare('SELECT * FROM productos WHERE id_categoria = ? AND esta_activo = 1').all(Number(categoria_id));
  } else if (alcance === 'ids' && Array.isArray(ids) && ids.length) {
    const marks = ids.map(() => '?').join(',');
    productos = db.prepare(`SELECT * FROM productos WHERE id IN (${marks}) AND esta_activo = 1`).all(...ids.map(Number));
  } else {
    productos = db.prepare('SELECT * FROM productos WHERE esta_activo = 1').all();
  }
  if (!productos.length) return res.status(400).json({ error: 'No hay productos para actualizar' });

  const signo = operacion === 'aumento' ? 1 : -1;
  const upd = db.prepare(`UPDATE productos SET precio_venta = ?, actualizado_en = datetime('now','localtime') WHERE id = ?`);
  let contador = 0;
  let montoBase = 0;
  let montoNuevo = 0;
  for (const p of productos) {
    let np;
    if (tipo === 'porcentaje') np = p.precio_venta * (1 + (signo * v) / 100);
    else np = p.precio_venta + signo * v;
    if (redondear_a && Number(redondear_a) > 0) np = Math.round(np / Number(redondear_a)) * Number(redondear_a);
    np = round2(Math.max(np, 0.01));
    montoBase += p.precio_venta;
    montoNuevo += np;
    upd.run(np, p.id);
    registrarPrecio(p.id, p.precio_costo, np, req.session.user);
    contador++;
  }
  audit(req.session.user, 'PRECIO_MASIVO', `${contador} productos | ${operacion} ${tipo === 'porcentaje' ? v + '%' : '$' + v} | alcance: ${alcance}`);
  res.json({
    ok: true, contador,
    variacion_promedio: montoBase ? round2(((montoNuevo - montoBase) / montoBase) * 100) : 0
  });
}));

module.exports = router;