const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

const DATA_DIR = process.env.MINIMARKET_DATA || (process.env.APPDATA ? path.join(process.env.APPDATA, 'MarketSistemNexora', 'datos') : path.join(__dirname, '..', 'data'));
const DB_PATH = path.join(DATA_DIR, 'minimarket.db');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(BACKUP_DIR, { recursive: true });

let db = null;

const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS categorias (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL UNIQUE,
  creado_en TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  actualizado_en TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS productos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo_barras TEXT,
  codigo_qr TEXT,
  codigo_interno TEXT,
  nombre TEXT NOT NULL,
  marca TEXT,
  descripcion TEXT,
  id_categoria INTEGER REFERENCES categorias(id) ON DELETE SET NULL,
  id_proveedor INTEGER REFERENCES proveedores(id) ON DELETE SET NULL,
  precio_costo REAL NOT NULL DEFAULT 0,
  precio_venta REAL NOT NULL DEFAULT 0,
  stock REAL NOT NULL DEFAULT 0,
  stock_minimo REAL NOT NULL DEFAULT 10,
  esta_activo INTEGER NOT NULL DEFAULT 1,
  creado_en TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  actualizado_en TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_productos_cb ON productos(codigo_barras) WHERE codigo_barras IS NOT NULL AND codigo_barras <> '';
CREATE UNIQUE INDEX IF NOT EXISTS ux_productos_ci ON productos(codigo_interno) WHERE codigo_interno IS NOT NULL AND codigo_interno <> '';
CREATE INDEX IF NOT EXISTS ix_productos_nombre ON productos(nombre COLLATE NOCASE);

CREATE TABLE IF NOT EXISTS precios_historial (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  id_producto INTEGER NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
  precio_costo REAL NOT NULL,
  precio_venta REAL NOT NULL,
  id_usuario INTEGER,
  creado_en TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS ix_preciohist_prod ON precios_historial(id_producto);

CREATE TABLE IF NOT EXISTS ventas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  numero TEXT NOT NULL UNIQUE,
  total REAL NOT NULL DEFAULT 0,
  costo_total REAL NOT NULL DEFAULT 0,
  ganancia REAL NOT NULL DEFAULT 0,
  estado TEXT NOT NULL DEFAULT 'COMPLETADA',
  id_usuario INTEGER,
  creado_en TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS ix_ventas_fecha ON ventas(creado_en);

CREATE TABLE IF NOT EXISTS detalle_ventas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  id_venta INTEGER NOT NULL REFERENCES ventas(id) ON DELETE CASCADE,
  id_producto INTEGER REFERENCES productos(id) ON DELETE SET NULL,
  nombre TEXT NOT NULL,
  codigo TEXT,
  cantidad REAL NOT NULL,
  precio_unitario REAL NOT NULL,
  costo_unitario REAL NOT NULL,
  total REAL NOT NULL,
  ganancia REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_detventa_venta ON detalle_ventas(id_venta);

CREATE TABLE IF NOT EXISTS metodos_pago (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL UNIQUE,
  activo INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS pagos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  id_venta INTEGER NOT NULL REFERENCES ventas(id) ON DELETE CASCADE,
  id_metodo_pago INTEGER NOT NULL REFERENCES metodos_pago(id),
  monto REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_pagos_venta ON pagos(id_venta);

CREATE TABLE IF NOT EXISTS movimientos_stock (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  id_producto INTEGER NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL,
  cantidad REAL NOT NULL,
  stock_anterior REAL NOT NULL,
  stock_nuevo REAL NOT NULL,
  motivo TEXT,
  id_usuario INTEGER,
  id_venta INTEGER,
  creado_en TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS ix_movstock_prod ON movimientos_stock(id_producto);

CREATE TABLE IF NOT EXISTS cajas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  estado TEXT NOT NULL DEFAULT 'ABIERTA',
  monto_apertura REAL NOT NULL DEFAULT 0,
  monto_cierre REAL,
  diferencia REAL,
  id_usuario_apertura INTEGER,
  id_usuario_cierre INTEGER,
  abierta_en TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  cerrada_en TEXT,
  creado_en TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS movimientos_caja (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  id_caja INTEGER REFERENCES cajas(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL,
  concepto TEXT,
  id_metodo_pago INTEGER REFERENCES metodos_pago(id),
  monto REAL NOT NULL DEFAULT 0,
  saldo REAL NOT NULL DEFAULT 0,
  id_venta INTEGER,
  id_usuario INTEGER,
  creado_en TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS ix_movcaja_fecha ON movimientos_caja(creado_en);
CREATE INDEX IF NOT EXISTS ix_movcaja_caja ON movimientos_caja(id_caja);
CREATE INDEX IF NOT EXISTS ix_movcaja_venta ON movimientos_caja(id_venta);

CREATE TABLE IF NOT EXISTS usuarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  usuario TEXT NOT NULL UNIQUE,
  email TEXT,
  password_hash TEXT NOT NULL,
  recuperacion_hash TEXT,
  rol TEXT NOT NULL DEFAULT 'CAJERO',
  esta_activo INTEGER NOT NULL DEFAULT 1,
  creado_en TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  actualizado_en TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS configuracion (
  clave TEXT PRIMARY KEY,
  valor TEXT,
  actualizado_en TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS auditoria (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  id_usuario INTEGER,
  accion TEXT NOT NULL,
  detalle TEXT,
  creado_en TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS ix_auditoria_fecha ON auditoria(creado_en);

CREATE TABLE IF NOT EXISTS proveedores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL UNIQUE,
  telefono TEXT,
  email TEXT,
  direccion TEXT,
  cuit TEXT,
  esta_activo INTEGER NOT NULL DEFAULT 1,
  creado_en TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  actualizado_en TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS compras (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  numero TEXT NOT NULL UNIQUE,
  id_proveedor INTEGER REFERENCES proveedores(id) ON DELETE SET NULL,
  fecha TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  total REAL NOT NULL DEFAULT 0,
  estado TEXT NOT NULL DEFAULT 'COMPLETADA',
  id_usuario INTEGER,
  creado_en TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  actualizado_en TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS ix_compras_fecha ON compras(fecha);

CREATE TABLE IF NOT EXISTS detalle_compras (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  id_compra INTEGER NOT NULL REFERENCES compras(id) ON DELETE CASCADE,
  id_producto INTEGER REFERENCES productos(id) ON DELETE SET NULL,
  nombre TEXT NOT NULL,
  codigo TEXT,
  cantidad REAL NOT NULL,
  costo_unitario REAL NOT NULL,
  total REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_detcompra_compra ON detalle_compras(id_compra);
`;

function seed() {
  const rc = (cb) => db.prepare(cb).get();
  const count = (t) => db.prepare(`SELECT COUNT(*) c FROM ${t}`).get().c;

  if (count('categorias') === 0) {
    const st = db.prepare('INSERT INTO categorias (nombre) VALUES (?)');
    const cats = ['Gaseosas', 'Aguas', 'Energizantes y deportivas', 'Cervezas', 'Otras bebidas', 'Golosinas', 'Chocolates', 'Snacks', 'Alimentos', 'Cigarrillos', 'Limpieza', 'Higiene personal', 'Kiosco / Varios', 'Sin categoría'];
    cats.forEach((c) => st.run(c));
  }

  if (count('metodos_pago') === 0) {
    const st = db.prepare('INSERT INTO metodos_pago (nombre) VALUES (?)');
    ['Efectivo', 'Tarjeta de débito', 'Tarjeta de crédito', 'Transferencia', 'Mercado Pago', 'Otro'].forEach((m) => st.run(m));
  }

  // No se crea ningún usuario por defecto: la primera cuenta que se registra
  // en la pantalla de inicio queda como dueño (ADMIN) del negocio.

  const defs = {
    nombre_comercio: 'MarketSistemNexora',
    direccion: '',
    telefono: '',
    cuit: '',
    moneda: '$',
    stock_minimo_default: '10',
    formato_ticket: '80',
    mensaje_ticket: 'Gracias por su compra',
    incluir_ganancia_ticket: '0',
    backup_automatico: '1',
    backup_frecuencia_hs: '24',
    usar_stock: '1'
  };
  const st = db.prepare('INSERT OR IGNORE INTO configuracion (clave, valor) VALUES (?,?)');
  for (const [k, v] of Object.entries(defs)) st.run(k, v);
}

function migrar(db) {
  const colExiste = (tabla, col) => db.prepare(`PRAGMA table_info(${tabla})`).all().some((r) => r.name === col);
  const addCol = (tabla, col, def) => {
    if (!colExiste(tabla, col)) db.exec(`ALTER TABLE ${tabla} ADD COLUMN ${col} ${def}`);
  };

  addCol('productos', 'marca', 'TEXT');
  addCol('productos', 'descripcion', 'TEXT');
  addCol('productos', 'id_proveedor', 'INTEGER REFERENCES proveedores(id) ON DELETE SET NULL');
  addCol('usuarios', 'email', 'TEXT');
  addCol('usuarios', 'recuperacion_hash', 'TEXT');

  db.exec('DROP INDEX IF EXISTS ix_productos_qr;');

  const duplicadosQr = db.prepare(
    `SELECT MIN(id) AS mid, codigo_qr FROM productos
     WHERE codigo_qr IS NOT NULL AND codigo_qr <> ''
     GROUP BY codigo_qr HAVING COUNT(*) > 1`
  ).all();
  const limpiarQr = db.prepare('UPDATE productos SET codigo_qr = NULL WHERE codigo_qr = ? AND id <> ?');
  for (const d of duplicadosQr) limpiarQr.run(d.codigo_qr, d.mid);
  db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS ux_productos_qr ON productos(codigo_qr) WHERE codigo_qr IS NOT NULL AND codigo_qr <> '';`);
}

function openDB() {
  if (db) return db;
  db = new DatabaseSync(DB_PATH);
  db.exec(SCHEMA);
  migrar(db);
  seed();
  return db;
}

function getDB() {
  return db || openDB();
}

function closeDB() {
  if (db) { try { db.close(); } catch (e) {} db = null; }
}

function swapDBFromFile(tmpPath) {
  closeDB();
  fs.copyFileSync(tmpPath, DB_PATH);
  openDB();
  return true;
}

module.exports = { openDB, getDB, closeDB, swapDBFromFile, DB_PATH, DATA_DIR, BACKUP_DIR, round2: (n) => Math.round((Number(n) || 0) * 100) / 100 };