const { getDB } = require('./db');

const DEFAULTS = {
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

function getConfig(clave) {
  const row = getDB().prepare('SELECT valor FROM configuracion WHERE clave = ?').get(clave);
  return row ? row.valor : DEFAULTS[clave];
}

function setConfig(clave, valor) {
  getDB().prepare(`
    INSERT INTO configuracion (clave, valor, actualizado_en) VALUES (?, ?, datetime('now','localtime'))
    ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor, actualizado_en = datetime('now','localtime')
  `).run(clave, String(valor ?? ''));
}

function getAllConfig() {
  const rows = getDB().prepare('SELECT clave, valor FROM configuracion').all();
  const out = { ...DEFAULTS };
  rows.forEach((r) => { out[r.clave] = r.valor; });
  out.metodos_pago = getDB().prepare('SELECT id, nombre, activo FROM metodos_pago ORDER BY id').all();
  out.categorias = getDB().prepare('SELECT id, nombre FROM categorias ORDER BY nombre').all();
  return out;
}

module.exports = { getConfig, setConfig, getAllConfig, DEFAULTS };