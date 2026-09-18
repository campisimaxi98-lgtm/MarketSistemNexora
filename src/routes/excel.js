const express = require('express');
const ExcelJS = require('exceljs');
const { getDB, round2 } = require('../db');
const { getConfig } = require('../config');
const { audit, registrarPrecio } = require('../helpers');
const { requireAuth, requireAdmin, handle } = require('../middleware');

const router = express.Router();

function normalize(s) {
  return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function colKey(nombre) {
  const n = normalize(nombre);
  const map = {
    'codigo': 'codigo_barras', 'codigo de barras': 'codigo_barras', 'codigo barra': 'codigo_barras', 'barras': 'codigo_barras',
    'codigo qr': 'codigo_qr', 'qr': 'codigo_qr',
    'codigo interno': 'codigo_interno', 'codigo interno/ qr a imprimir': 'codigo_interno',
    'nombre': 'nombre', 'producto': 'nombre', 'descripcion': 'nombre',
    'categoria': 'categoria', 'categorias': 'categoria',
    'stock': 'stock', 'cantidad': 'stock', 'cantidad/stock': 'stock',
    'stock minimo': 'stock_minimo',
    'precio de costo': 'precio_costo', 'precio costo': 'precio_costo', 'costo': 'precio_costo', 'costo unitario': 'precio_costo',
    'precio de venta': 'precio_venta', 'precio venta': 'precio_venta', 'precio': 'precio_venta', 'precio venta bs': 'precio_venta'
  };
  return map[n] || null;
}

function cellVal(cell) {
  if (cell === null || cell === undefined) return '';
  if (cell && cell.hyperlink) return cell.hyperlink;
  if (cell && cell.text) return cell.text;
  if (cell instanceof Date) return cell;
  return cell;
}

function parseNum(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return isFinite(v) ? v : null;
  const n = parseFloat(String(v).replace(/\./g, '').replace(',', '.'));
  return isNaN(n) ? null : n;
}

async function leerFilas(buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const ws = wb.worksheets[0];
  if (!ws) return [];
  const header = [];
  ws.getRow(1).eachCell((c, col) => { header[col] = colKey(cellVal(c.value)); });
  const filas = [];
  ws.eachRow((row, rowNum) => {
    if (rowNum === 1) return;
    const raw = {};
    header.forEach((key, i) => {
      if (key) { const v = cellVal(row.getCell(i).value); if (v !== '' && v !== null && v !== undefined) raw[key] = v; }
    });
    if (Object.keys(raw).length) filas.push({ fila_excel: rowNum, raw });
  });
  return filas;
}

router.post('/importar', express.raw({ type: () => true, limit: '25mb' }),
  handle(async (req, res) => {
    if (!req.body || !req.body.length) return res.status(400).json({ error: 'Archivo vacío' });
    const db = getDB();
    const filas = await leerFilas(req.body);
    if (!filas.length) return res.status(400).json({ error: 'El archivo no tiene filas de datos o no tiene un encabezado válido' });

    const catCache = {};
    db.prepare('SELECT id, nombre FROM categorias').all().forEach((c) => { catCache[normalize(c.nombre)] = c.id; });

    const resultado = [];
    let nuevos = 0, actualizar = 0, conError = 0;
    const codigosVistos = new Map();
    for (const f of filas) {
      const r = { fila_excel: f.fila_excel, estado: 'nuevo', error: null, precio_anterior: null, precio_nuevo: null, variacion: null, ...f.raw };
      const { raw } = f;
      const errs = [];
      if (!raw.nombre) errs.push('Falta el nombre');
      const pv = parseNum(raw.precio_venta);
      const pc = parseNum(raw.precio_costo);
      if (raw.precio_venta !== undefined && pv === null) errs.push('Precio de venta inválido');
      if (raw.precio_costo !== undefined && pc === null) errs.push('Precio de costo inválido');
      if (raw.stock !== undefined && parseNum(raw.stock) === null) errs.push('Stock inválido');

      const codigoClave = String(raw.codigo_barras || raw.codigo_interno || raw.codigo_qr || '').trim();
      if (codigoClave) {
        if (codigosVistos.has(codigoClave)) errs.push(`Código repetido en el archivo (fila ${codigosVistos.get(codigoClave)})`);
        else codigosVistos.set(codigoClave, f.fila_excel);
      } else if (errs.length === 0) {
        errs.push('Falta un código (barras, interno o QR) para identificar el producto');
      }

      let existente = null;
      if (!errs.length && raw.codigo_barras) existente = db.prepare('SELECT * FROM productos WHERE codigo_barras = ?').get(String(raw.codigo_barras).trim());
      if (!errs.length && !existente && raw.codigo_interno) existente = db.prepare('SELECT * FROM productos WHERE codigo_interno = ?').get(String(raw.codigo_interno).trim());
      if (!errs.length && !existente && raw.codigo_qr) existente = db.prepare('SELECT * FROM productos WHERE codigo_qr = ?').get(String(raw.codigo_qr).trim());

      if (errs.length) {
        r.estado = 'error'; r.error = errs.join(' | '); conError++;
        resultado.push(r);
        continue;
      }

      if (existente) {
        r.estado = 'actualizar';
        r.id_existente = existente.id;
        r.precio_anterior = existente.precio_venta;
        r.costo_anterior = existente.precio_costo;
        if (pv !== null && pv !== existente.precio_venta) {
          r.precio_nuevo = pv;
          r.variacion = existente.precio_venta ? round2(((pv - existente.precio_venta) / existente.precio_venta) * 100) : null;
        } else {
          r.precio_nuevo = existente.precio_venta;
        }
        if (pc !== null && pc !== existente.precio_costo) { r.costo_nuevo = pc; }
        actualizar++;
      } else {
        const catNorm = normalize(raw.categoria);
        const catId = catNorm && catCache[catNorm];
        r.categoria_resuelta = catId ? getDB().prepare('SELECT nombre FROM categorias WHERE id = ?').get(catId).nombre : (raw.categoria || 'Sin categoría').trim();
        r.precio_nuevo = pv !== null ? pv : 0;
        nuevos++;
      }
      resultado.push(r);
    }

    res.json({
      resumen: { nuevos, actualizar, conError, total: filas.length },
      filas: resultado
    });
  }));

router.post('/aplicar', requireAdmin, handle(async (req, res) => {
  const db = getDB();
  const body = req.body || {};
  const filas = Array.isArray(body.filas) ? body.filas : [];
  if (!filas.length) return res.status(400).json({ error: 'No hay filas para aplicar' });

  const catCache = {};
  db.prepare('SELECT id, nombre FROM categorias').all().forEach((c) => { catCache[normalize(c.nombre)] = c.id; });
  const stCat = db.prepare('INSERT OR IGNORE INTO categorias (nombre) VALUES (?)');

  const crear = db.prepare(`INSERT INTO productos (codigo_barras, codigo_qr, codigo_interno, nombre, id_categoria, precio_costo, precio_venta, stock, stock_minimo)
    VALUES (?,?,?,?,?,?,?,?,?)`);
  const updPrecios = db.prepare(`UPDATE productos SET nombre=?, id_categoria=?, precio_costo=?, precio_venta=?, actualizado_en=datetime('now','localtime') WHERE id=?`);
  const updStock = db.prepare('UPDATE productos SET stock=?, actualizado_en=datetime(\'now\',\'localtime\') WHERE id=?');
  const insMov = db.prepare(`INSERT INTO movimientos_stock (id_producto, tipo, cantidad, stock_anterior, stock_nuevo, motivo, id_usuario)
    VALUES (?,?,?,?,?,?,?)`);

  const stockMinimoDef = Number(getConfig('stock_minimo_default')) || 10;
  let creados = 0, actualizados = 0, conPrecio = 0;
  const mapaNuevos = new Map();

  for (const r of filas) {
    const nombre = String(r.nombre || '').trim();
    const codigoB = r.codigo_barras ? String(r.codigo_barras).trim() : null;
    const codigoI = r.codigo_interno ? String(r.codigo_interno).trim() : null;
    const codigoQ = r.codigo_qr ? String(r.codigo_qr).trim() : null;
    const pv = r.precio_venta !== undefined && r.precio_venta !== null && r.precio_venta !== '' ? round2(Number(r.precio_venta)) : null;
    const pc = r.precio_costo !== undefined && r.precio_costo !== null && r.precio_costo !== '' ? round2(Number(r.precio_costo)) : null;
    const stock = r.stock !== undefined && r.stock !== null && r.stock !== '' ? Number(r.stock) : null;
    const clave = codigoB || codigoI || codigoQ || `nombre:${nombre.toLowerCase()}`;

    let catId = null;
    if (r.categoria && String(r.categoria).trim() && String(r.categoria).trim().toLowerCase() !== 'sin categoría') {
      const norm = normalize(r.categoria);
      catId = catCache[norm];
      if (!catId) {
        stCat.run(String(r.categoria).trim());
        catId = getDB().prepare('SELECT id FROM categorias WHERE nombre = ? COLLATE NOCASE').get(String(r.categoria).trim()).id;
        catCache[norm] = catId;
      }
    }

    let existente = r.id_existente
      ? db.prepare('SELECT * FROM productos WHERE id=?').get(Number(r.id_existente))
      : (mapaNuevos.get(clave) ? db.prepare('SELECT * FROM productos WHERE id=?').get(mapaNuevos.get(clave)) : null);

    if (existente) {
      const nuevoPv = pv !== null ? pv : existente.precio_venta;
      const nuevoPc = pc !== null ? pc : existente.precio_costo;
      updPrecios.run(nombre || existente.nombre, catId !== null ? catId : existente.id_categoria, nuevoPc, nuevoPv, existente.id);
      if ((pv !== null && pv !== existente.precio_venta) || (pc !== null && pc !== existente.precio_costo)) {
        registrarPrecio(existente.id, nuevoPc, nuevoPv, req.session.user);
        conPrecio++;
      }
      if (stock !== null && stock !== existente.stock) {
        updStock.run(stock, existente.id);
        insMov.run(existente.id, 'AJUSTE', round2(stock - existente.stock), existente.stock, stock, 'Importación Excel', req.session.user.id);
      }
      actualizados++;
    } else {
      const nuevoCodigoInterno = codigoI || (codigoB ? null : 'PRODUCTO-' + String(Date.now()).slice(-6) + '-' + Math.floor(Math.random() * 90 + 10));
      const info = crear.run(codigoB, codigoQ, nuevoCodigoInterno, nombre, catId, pc !== null ? pc : 0, pv !== null ? pv : 0, stock !== null ? stock : 0, stockMinimoDef);
      const id = Number(info.lastInsertRowid);
      mapaNuevos.set(clave, id);
      registrarPrecio(id, pc !== null ? pc : 0, pv !== null ? pv : 0, req.session.user);
      if (stock !== null && stock > 0) {
        insMov.run(id, 'INICIAL', stock, 0, stock, 'Importación Excel', req.session.user.id);
      }
      creados++;
    }
  }
  audit(req.session.user, 'IMPORTAR_EXCEL', `${creados} creados, ${actualizados} actualizados, ${conPrecio} cambios de precio`);
  res.json({ ok: true, creados, actualizados, conPrecio });
}));

function estiloHoja(ws, headers, widths) {
  const head = ws.getRow(1);
  head.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  head.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };
  head.alignment = { vertical: 'middle' };
  ws.getRow(1).height = 22;
  headers.forEach((h, i) => {
    ws.getCell(1, i + 1).value = h;
    ws.getColumn(i + 1).width = widths[i] || 12;
  });
}

function setFila(ws, fila, valores, formatoMoneda) {
  valores.forEach((v, i) => {
    const c = ws.getCell(fila, i + 1);
    c.value = v;
    if (formatoMoneda && typeof v === 'number') {
      c.numFmt = '#,##0.00';
    }
  });
}

function crearWb(titulo) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'MarketSistemNexora';
  const ws = wb.addWorksheet(titulo);
  return { wb, ws };
}

function enviarXlsx(res, wb, nombre) {
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(nombre)}.xlsx"`);
  return wb.xlsx.write(res).then(() => res.end());
}

router.post('/exportar', requireAuth, handle(async (req, res) => {
  const db = getDB();
  const { tipo = 'productos', desde = '', hasta = '', anio } = req.body || {};
  const comercio = getConfig('nombre_comercio');

  if (tipo === 'productos') {
    const { wb, ws } = crearWb('PRODUCTOS');
    const headers = ['Código de barras', 'Código interno', 'Código QR', 'Producto', 'Categoría', 'Stock', 'Stock mínimo', 'Precio costo', 'Precio venta', 'Ganancia', 'Fecha actualización'];
    estiloHoja(ws, headers, [15, 14, 22, 30, 18, 10, 10, 12, 12, 12, 19]);
    const rows = db.prepare(`
      SELECT p.codigo_barras, p.codigo_interno, p.codigo_qr, p.nombre, COALESCE(c.nombre,'Sin categoría') cat, p.precio_costo, p.precio_venta, p.stock, p.stock_minimo, p.actualizado_en
      FROM productos p LEFT JOIN categorias c ON c.id=p.id_categoria WHERE p.esta_activo=1 ORDER BY p.nombre COLLATE NOCASE`).all();
    let fila = 2;
    for (const p of rows) {
      setFila(ws, fila, [p.codigo_barras || '', p.codigo_interno || '', p.codigo_qr || '', p.nombre, p.cat, p.stock, p.stock_minimo, p.precio_costo, p.precio_venta, round2(p.precio_venta - p.precio_costo), p.actualizado_en], true);
      fila++;
    }
    ws.autoFilter = { from: 'A1', to: `K${fila - 1}` };
    return enviarXlsx(res, wb, `PRODUCTOS_${comercio}_${desde || 'todo'}`);
  }

  if (tipo === 'ventas') {
    const { wb, ws } = crearWb('VENTAS');
    const headers = ['Fecha', 'Hora', 'N° de venta', 'Producto', 'Código', 'Cantidad', 'Precio unitario', 'Total', 'Método de pago', 'Costo', 'Ganancia'];
    estiloHoja(ws, headers, [11, 8, 15, 30, 16, 9, 13, 12, 18, 12, 12]);
    const rows = db.prepare(`
      SELECT v.numero, v.creado_en, dv.nombre, dv.codigo, dv.cantidad, dv.precio_unitario, dv.total, dv.costo_unitario, dv.ganancia, v.id AS vid
      FROM detalle_ventas dv JOIN ventas v ON v.id=dv.id_venta
      WHERE v.estado='COMPLETADA' AND date(v.creado_en) BETWEEN ? AND ? ORDER BY v.id, dv.id`).all(desde, hasta);
    const metodos = {};
    db.prepare(`SELECT p.id_venta, GROUP_CONCAT(m.nombre, ' + ') ms FROM pagos p JOIN metodos_pago m ON m.id=p.id_metodo_pago GROUP BY p.id_venta`).all()
      .forEach((r) => { metodos[r.id_venta] = r.ms; });
    let fila = 2;
    for (const v of rows) {
      const fechaHora = v.creado_en.split(' ');
      setFila(ws, fila, [fechaHora[0], (fechaHora[1] || '').slice(0, 5), v.numero, v.nombre, v.codigo || '', v.cantidad, v.precio_unitario, v.total, metodos[v.vid] || 'Efectivo', v.costo_unitario, v.ganancia], true);
      fila++;
    }
    ws.autoFilter = { from: 'A1', to: `K${fila - 1}` };
    return enviarXlsx(res, wb, `VENTAS_${comercio}_${desde}_a_${hasta}`);
  }

  if (tipo === 'caja') {
    const { wb, ws } = crearWb('CAJA');
    const headers = ['Fecha', 'Hora', 'Concepto', 'Tipo', 'Medio de pago', 'Ingreso', 'Egreso', 'Saldo'];
    estiloHoja(ws, headers, [11, 8, 25, 13, 16, 12, 12, 12]);
    const rows = db.prepare(`
      SELECT mc.creado_en, mc.concepto, mc.tipo, mc.monto, mc.saldo, m.nombre metodo, v.numero
      FROM movimientos_caja mc LEFT JOIN metodos_pago m ON m.id=mc.id_metodo_pago LEFT JOIN ventas v ON v.id=mc.id_venta
      WHERE date(mc.creado_en) BETWEEN ? AND ? ORDER BY mc.id`).all(desde, hasta);
    let fila = 2;
    for (const m of rows) {
      const fh = m.creado_en.split(' ');
      const esEgreso = m.tipo === 'EGRESO' || m.tipo === 'RETIRO';
      const concepto = m.tipo === 'VENTA' ? 'Venta ' + m.numero : (m.concepto || m.tipo);
      setFila(ws, fila, [fh[0], (fh[1] || '').slice(0, 5), concepto, m.tipo, m.metodo || '', esEgreso ? '' : m.monto, esEgreso ? m.monto : '', m.saldo], true);
      fila++;
    }
    ws.autoFilter = { from: 'A1', to: `H${fila - 1}` };
    return enviarXlsx(res, wb, `CAJA_${comercio}_${desde}_a_${hasta}`);
  }

  if (tipo === 'resumen') {
    const { wb, ws } = crearWb('RESUMEN_' + anio);
    const headers = ['Mes', 'Facturación', 'Costos', 'Ganancia bruta', 'Gastos', 'N° de ventas', 'Productos vendidos'];
    estiloHoja(ws, headers, [12, 13, 13, 13, 12, 13, 14]);
    const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    let fila = 2;
    for (let mes = 1; mes <= 12; mes++) {
      const ini = `${anio}-${String(mes).padStart(2, '0')}-01`;
      const fin = `${anio}-${String(mes).padStart(2, '0')}-31`;
      const v = db.prepare(`SELECT ROUND(SUM(total),2) f, ROUND(SUM(costo_total),2) c, ROUND(SUM(ganancia),2) g, COUNT(*) n FROM ventas WHERE estado='COMPLETADA' AND date(creado_en) BETWEEN ? AND ?`).get(ini, fin);
      const gastos = db.prepare(`SELECT COALESCE(SUM(monto),0) g FROM movimientos_caja WHERE tipo='EGRESO' AND date(creado_en) BETWEEN ? AND ?`).get(ini, fin);
      const u = db.prepare(`SELECT COALESCE(SUM(dv.cantidad),0) u FROM detalle_ventas dv JOIN ventas v ON v.id=dv.id_venta WHERE v.estado='COMPLETADA' AND date(v.creado_en) BETWEEN ? AND ?`).get(ini, fin);
      setFila(ws, fila, [meses[mes - 1], v.f || 0, v.c || 0, v.g || 0, gastos.g || 0, v.n || 0, u.u || 0], true);
      fila++;
    }
    return enviarXlsx(res, wb, `RESUMEN_${anio}_${comercio}`);
  }

  res.status(400).json({ error: 'Tipo de exportación inválido' });
}));

module.exports = router;