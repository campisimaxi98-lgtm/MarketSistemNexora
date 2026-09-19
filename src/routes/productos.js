const express = require('express');
const { getDB, round2 } = require('../db');
const { audit, registrarPrecio } = require('../helpers');
const { requireAuth, requireAdmin, handle } = require('../middleware');

const router = express.Router();

const PRODUCTO_COLS = `p.id, p.codigo_barras, p.codigo_qr, p.codigo_interno, p.nombre,
  p.marca, p.descripcion, p.id_categoria, p.id_proveedor, p.precio_costo, p.precio_venta,
  p.stock, p.stock_minimo, p.esta_activo,
  p.creado_en, p.actualizado_en, c.nombre AS categoria,
  ROUND(p.precio_venta - p.precio_costo, 2) AS ganancia`;

function mapProducto(p) {
  return {
    id: p.id,
    codigo_barras: p.codigo_barras,
    codigo_qr: p.codigo_qr,
    codigo_interno: p.codigo_interno,
    nombre: p.nombre,
    marca: p.marca || '',
    descripcion: p.descripcion || '',
    id_categoria: p.id_categoria,
    id_proveedor: p.id_proveedor,
    categoria: p.categoria || 'Sin categoría',
    nombre_categoria: p.categoria || 'Sin categoría',
    precio_costo: p.precio_costo,
    precio_venta: p.precio_venta,
    ganancia: p.ganancia,
    stock: p.stock,
    stock_minimo: p.stock_minimo,
    esta_activo: p.esta_activo,
    bajo: p.stock_minimo > 0 && p.stock <= p.stock_minimo,
    creado_en: p.creado_en,
    actualizado_en: p.actualizado_en
  };
}

router.get('/', requireAuth, handle((req, res) => {
  const db = getDB();
  const { search = '', categoria = '', solo_bajo = '', incluir_inactivos = '0', page = 1, limit = 50 } = req.query;
  const where = [incluir_inactivos === '1' ? '(p.esta_activo = 0 OR p.esta_activo = 1)' : 'p.esta_activo = 1'];
  const params = {};
  if (search) {
    const s = String(search).trim();
    where.push(`(p.nombre LIKE @s OR p.codigo_barras LIKE @s OR p.codigo_interno LIKE @s OR p.codigo_qr LIKE @s)`);
    params.s = `%${s}%`;
  }
  if (categoria) { where.push('p.id_categoria = @cat'); params.cat = Number(categoria); }
  if (solo_bajo === '1') { where.push('p.stock_minimo > 0 AND p.stock <= p.stock_minimo'); }
  const w = where.join(' AND ');
  const total = db.prepare(`SELECT COUNT(*) c FROM productos p WHERE ${w}`).get(params).c;
  const rows = db.prepare(`
    SELECT ${PRODUCTO_COLS} FROM productos p
    LEFT JOIN categorias c ON c.id = p.id_categoria
    WHERE ${w} ORDER BY p.nombre COLLATE NOCASE LIMIT @lim OFFSET @off`)
    .all({ ...params, lim: Number(limit), off: (Number(page) - 1) * Number(limit) });
  res.json({ total, page: Number(page), limit: Number(limit), productos: rows.map(mapProducto) });
}));

router.get('/sugerencias', requireAuth, handle((req, res) => {
  const q = String(req.query.q || '').trim();
  if (!q) return res.json([]);
  const db = getDB();
  const rows = db.prepare(`
    SELECT ${PRODUCTO_COLS} FROM productos p LEFT JOIN categorias c ON c.id = p.id_categoria
    WHERE p.esta_activo = 1 AND p.nombre LIKE @s ORDER BY p.nombre COLLATE NOCASE LIMIT 20`)
    .all({ s: `%${q}%` });
  res.json(rows.map(mapProducto).map((p) => ({ id: p.id, label: p.nombre, value: p.nombre, p })));
}));

// Búsqueda exacta por código (para POS / escáner)
router.post('/buscar', requireAuth, handle((req, res) => {
  const codigo = String((req.body || {}).codigo || '').trim();
  if (!codigo) return res.json({ producto: null });
  const db = getDB();
  const row = db.prepare(`
    SELECT ${PRODUCTO_COLS} FROM productos p LEFT JOIN categorias c ON c.id = p.id_categoria
    WHERE p.esta_activo = 1 AND (p.codigo_barras = @c OR p.codigo_interno = @c OR p.codigo_qr = @c)
    ORDER BY (p.codigo_barras = @c) DESC, (p.codigo_interno = @c) DESC LIMIT 1`).get({ c: codigo });
  res.json({ producto: row ? mapProducto(row) : null });
}));

function validarDatos(body) {
  const errs = [];
  let { codigo_barras, codigo_qr, codigo_interno, nombre, marca, descripcion, id_categoria, id_proveedor, precio_costo, precio_venta, stock, stock_minimo } = body;
  nombre = String(nombre || '').trim();
  if (!nombre) errs.push('El nombre del producto es obligatorio');
  precio_costo = precio_costo === '' || precio_costo === undefined || precio_costo === null ? 0 : Number(precio_costo);
  precio_venta = precio_venta === '' || precio_venta === undefined || precio_venta === null ? 0 : Number(precio_venta);
  if (!(precio_venta >= 0) || isNaN(precio_venta)) errs.push('Precio de venta inválido');
  if (!(precio_costo >= 0) || isNaN(precio_costo)) errs.push('Precio de costo inválido');
  stock = stock === '' || stock === undefined || stock === null ? 0 : Number(stock);
  stock_minimo = stock_minimo === '' || stock_minimo === undefined || stock_minimo === null ? 0 : Number(stock_minimo);
  if (isNaN(stock) || stock < 0) errs.push('Stock inválido');
  if (isNaN(stock_minimo) || stock_minimo < 0) errs.push('Stock mínimo inválido');
  return { errs, data: {
    codigo_barras: String(codigo_barras || '').trim(),
    codigo_qr: String(codigo_qr || '').trim(),
    codigo_interno: String(codigo_interno || '').trim(),
    nombre,
    marca: String(marca || '').trim(),
    descripcion: String(descripcion || '').trim(),
    id_categoria: id_categoria ? Number(id_categoria) : null,
    id_proveedor: id_proveedor ? Number(id_proveedor) : null,
    precio_costo: round2(precio_costo), precio_venta: round2(precio_venta),
    stock: Number(stock), stock_minimo: Number(stock_minimo)
  } };
}

async function chequearDuplicados(data, exceptoId) {
  const db = getDB();
  const ex = exceptoId ? `AND id != ${Number(exceptoId)}` : '';
  if (data.codigo_barras) {
    const r = db.prepare(`SELECT id FROM productos WHERE codigo_barras = ? ${ex}`).get(data.codigo_barras);
    if (r) return 'El código de barras ya está registrado (producto #' + r.id + ')';
  }
  if (data.codigo_interno) {
    const r = db.prepare(`SELECT id FROM productos WHERE codigo_interno = ? ${ex}`).get(data.codigo_interno);
    if (r) return 'El código interno ya está registrado (producto #' + r.id + ')';
  }
  return null;
}

router.post('/', requireAuth, handle(async (req, res) => {
  if (!req.session.user || !['ADMIN', 'CAJERO'].includes(req.session.user.rol)) {
    return res.status(403).json({ error: 'Permiso denegado' });
  }
  const { errs, data } = validarDatos(req.body || {});
  if (errs.length) return res.status(400).json({ error: errs.join(' | ') });
  const dup = await chequearDuplicados(data);
  if (dup) return res.status(400).json({ error: dup });
  const db = getDB();
  if (!data.codigo_barras && !data.codigo_interno && !data.codigo_qr) {
    const base = 'PRODUCTO-' + String(Date.now()).slice(-4);
    for (let intento = 0; intento < 20; intento++) {
      const candidato = base + '-' + Math.floor(Math.random() * 900 + 100);
      if (!db.prepare('SELECT 1 FROM productos WHERE codigo_interno = ?').get(candidato)) {
        data.codigo_interno = candidato;
        break;
      }
    }
  }
  const info = db.prepare(`INSERT INTO productos (codigo_barras, codigo_qr, codigo_interno, nombre, marca, descripcion, id_categoria, id_proveedor, precio_costo, precio_venta, stock, stock_minimo)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(data.codigo_barras || null, data.codigo_qr || null, data.codigo_interno || null,
      data.nombre, data.marca || null, data.descripcion || null, data.id_categoria, data.id_proveedor,
      data.precio_costo, data.precio_venta, data.stock, data.stock_minimo);
  const id = Number(info.lastInsertRowid);
  registrarPrecio(id, data.precio_costo, data.precio_venta, req.session.user);
  if (data.stock > 0) {
    db.prepare(`INSERT INTO movimientos_stock (id_producto, tipo, cantidad, stock_anterior, stock_nuevo, motivo, id_usuario)
      VALUES (?,'INICIAL',?,0,?,'Carga inicial',?)`).run(id, data.stock, data.stock, req.session.user.id);
  }
  audit(req.session.user, 'CREAR_PRODUCTO', data.nombre + ' (' + (data.codigo_barras || data.codigo_interno) + ')');
  res.json({ ok: true, id });
}));

router.get('/:id', requireAuth, handle((req, res) => {
  const db = getDB();
const p = db.prepare(`
    SELECT ${PRODUCTO_COLS} FROM productos p LEFT JOIN categorias c ON c.id = p.id_categoria WHERE p.id = ?`).get(Number(req.params.id));
  if (!p) return res.status(404).json({ error: 'Producto no encontrado' });
  const historial = db.prepare('SELECT id, precio_costo, precio_venta, creado_en FROM precios_historial WHERE id_producto = ? ORDER BY creado_en DESC, id DESC LIMIT 100').all(Number(req.params.id));
  res.json({ producto: mapProducto(p), historial });
}));

router.put('/:id', requireAuth, handle(async (req, res) => {
  const db = getDB();
  const id = Number(req.params.id);
  const actual = db.prepare('SELECT * FROM productos WHERE id = ?').get(id);
  if (!actual) return res.status(404).json({ error: 'Producto no encontrado' });
  const body = req.body || {};

  const tocaSensible = body.precio_venta !== undefined || body.precio_costo !== undefined || body.stock !== undefined;
  if (tocaSensible && req.session.user.rol !== 'ADMIN') {
    return res.status(403).json({ error: 'Solo el dueño puede modificar precios o stock' });
  }

  const cambios = {};
  if (body.nombre !== undefined) cambios.nombre = String(body.nombre).trim();
  if (body.codigo_barras !== undefined) cambios.codigo_barras = String(body.codigo_barras).trim();
  if (body.codigo_qr !== undefined) cambios.codigo_qr = String(body.codigo_qr).trim();
  if (body.codigo_interno !== undefined) cambios.codigo_interno = String(body.codigo_interno).trim();
  if (body.marca !== undefined) cambios.marca = String(body.marca).trim();
  if (body.descripcion !== undefined) cambios.descripcion = String(body.descripcion).trim();
  if (body.id_categoria !== undefined) cambios.id_categoria = body.id_categoria ? Number(body.id_categoria) : null;
  if (body.id_proveedor !== undefined) cambios.id_proveedor = body.id_proveedor ? Number(body.id_proveedor) : null;
  let precioCosto = body.precio_costo !== undefined ? round2(Number(body.precio_costo)) : actual.precio_costo;
  let precioVenta = body.precio_venta !== undefined ? round2(Number(body.precio_venta)) : actual.precio_venta;
  if (body.precio_venta !== undefined && !(precioVenta >= 0)) return res.status(400).json({ error: 'Precio de venta inválido' });
  if (body.precio_costo !== undefined && !(precioCosto >= 0)) return res.status(400).json({ error: 'Precio de costo inválido' });
  if (body.precio_venta !== undefined || body.precio_costo !== undefined) {
    cambios.precio_costo = precioCosto;
    cambios.precio_venta = precioVenta;
  }
  let nuevoStock = null;
  if (body.stock !== undefined) {
    nuevoStock = Number(body.stock);
    if (!(nuevoStock >= 0) || isNaN(nuevoStock)) return res.status(400).json({ error: 'Stock inválido' });
    cambios.stock = nuevoStock;
  }
  if (body.stock_minimo !== undefined) {
    const sm = Number(body.stock_minimo);
    if (!(sm >= 0) || isNaN(sm)) return res.status(400).json({ error: 'Stock mínimo inválido' });
    cambios.stock_minimo = sm;
  }
  if (body.esta_activo !== undefined) cambios.esta_activo = body.esta_activo ? 1 : 0;
  if (!Object.keys(cambios).length) return res.status(400).json({ error: 'No hay cambios para guardar' });

  const data = { ...actual, ...cambios };
  const dup = await chequearDuplicados(data, id);
  if (dup) return res.status(400).json({ error: dup });

  if (cambios.nombre !== undefined && !cambios.nombre) return res.status(400).json({ error: 'El nombre es obligatorio' });

  const sets = Object.keys(cambios).map((k) => `${k} = ?`).join(', ');
  db.prepare(`UPDATE productos SET ${sets}, actualizado_en = datetime('now','localtime') WHERE id = ?`)
    .run(...Object.values(cambios), id);

  if (body.precio_venta !== undefined || body.precio_costo !== undefined) {
    registrarPrecio(id, precioCosto, precioVenta, req.session.user);
    audit(req.session.user, 'ACT_PRECIO', actual.nombre + ' PV: ' + actual.precio_venta + ' -> ' + precioVenta +
      (body.precio_costo !== undefined ? ' | PC: ' + actual.precio_costo + ' -> ' + precioCosto : ''));
  }
  if (nuevoStock !== null && nuevoStock !== actual.stock) {
    const delta = round2(nuevoStock - actual.stock);
    db.prepare(`INSERT INTO movimientos_stock (id_producto, tipo, cantidad, stock_anterior, stock_nuevo, motivo, id_usuario)
      VALUES (?,'AJUSTE',?,?,?,'Ajuste directo',?)`).run(id, delta, actual.stock, nuevoStock, req.session.user.id);
    audit(req.session.user, 'AJUSTE_STOCK', actual.nombre + ': ' + actual.stock + ' -> ' + nuevoStock);
  }
  audit(req.session.user, 'EDITAR_PRODUCTO', actual.nombre);
  res.json({ ok: true });
}));

router.delete('/:id', requireAdmin, handle((req, res) => {
  const db = getDB();
  const id = Number(req.params.id);
  const p = db.prepare('SELECT * FROM productos WHERE id = ?').get(id);
  if (!p) return res.status(404).json({ error: 'Producto no encontrado' });
  if ((req.body || {}).confirmar !== true) return res.status(400).json({ error: 'Confirmación requerida' });
  db.prepare('UPDATE productos SET esta_activo = 0, actualizado_en = datetime(\'now\',\'localtime\') WHERE id = ?').run(id);
  audit(req.session.user, 'ELIMINAR_PRODUCTO', p.nombre + ' (desactivado)');
  res.json({ ok: true });
}));

router.get('/:id/precios', requireAuth, handle((req, res) => {
  const hist = getDB().prepare('SELECT id, precio_costo, precio_venta, creado_en FROM precios_historial WHERE id_producto = ? ORDER BY creado_en DESC, id DESC LIMIT 100').all(Number(req.params.id));
  res.json(hist);
}));

module.exports = router;