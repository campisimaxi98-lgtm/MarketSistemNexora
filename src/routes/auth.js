const express = require('express');
const bcrypt = require('bcryptjs');
const { getDB } = require('../db');
const { audit } = require('../helpers');
const { handle } = require('../middleware');

const router = express.Router();

router.post('/login', handle((req, res) => {
  const { usuario, password } = req.body || {};
  if (!usuario || !password) return res.status(400).json({ error: 'Usuario y contraseña requeridos' });
  const user = getDB().prepare('SELECT * FROM usuarios WHERE usuario = ?').get(String(usuario).trim());
  if (!user || user.esta_activo !== 1) return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
  if (!bcrypt.compareSync(password, user.password_hash)) return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
  req.session.user = { id: user.id, nombre: user.nombre, usuario: user.usuario, rol: user.rol };
  audit(user, 'LOGIN', 'Inicio de sesión');
  res.json({ user: req.session.user });
}));

router.post('/logout', (req, res) => {
  if (req.session && req.session.user) audit(req.session.user, 'LOGOUT', 'Cierre de sesión');
  req.session.destroy(() => res.json({ ok: true }));
});

router.get('/me', (req, res) => {
  if (req.session && req.session.user) return res.json({ user: req.session.user });
  res.status(401).json({ error: 'No autorizado' });
});

router.post('/cambiar-password', handle((req, res) => {
  const { actual, nueva } = req.body || {};
  if (!req.session || !req.session.user) return res.status(401).json({ error: 'No autorizado' });
  const db = getDB();
  const user = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(req.session.user.id);
  if (!bcrypt.compareSync(actual, user.password_hash)) return res.status(400).json({ error: 'Contraseña actual incorrecta' });
  if (!nueva || String(nueva).length < 4) return res.status(400).json({ error: 'La contraseña nueva debe tener al menos 4 caracteres' });
  const hash = bcrypt.hashSync(String(nueva), 10);
  db.prepare(`UPDATE usuarios SET password_hash = ?, actualizado_en = datetime('now','localtime') WHERE id = ?`).run(hash, user.id);
  audit(req.session.user, 'CAMBIAR_PASSWORD', 'Cambió su contraseña');
  res.json({ ok: true });
}));

router.get('/registro-info', handle((req, res) => {
  const db = getDB();
  const hayDueno = db.prepare("SELECT COUNT(*) c FROM usuarios WHERE rol = 'ADMIN'").get().c > 0;
  const total = db.prepare('SELECT COUNT(*) c FROM usuarios').get().c;
  res.json({ hay_dueno: hayDueno, primer_usuario: total === 0 });
}));

router.post('/registro', handle((req, res) => {
  const { nombre, usuario, password, rol } = req.body || {};
  if (!nombre || !usuario || !password) return res.status(400).json({ error: 'Nombre, usuario y contraseña son obligatorios' });
  if (String(password).length < 4) return res.status(400).json({ error: 'La contraseña debe tener al menos 4 caracteres' });
  const uA = String(usuario).trim();
  if (uA.length < 3) return res.status(400).json({ error: 'El usuario debe tener al menos 3 caracteres' });
  const db = getDB();
  const hayDueno = db.prepare("SELECT COUNT(*) c FROM usuarios WHERE rol = 'ADMIN'").get().c > 0;
  let rolFinal;
  if (!hayDueno) {
    rolFinal = 'ADMIN';
  } else if (rol === 'DUENO') {
    return res.status(400).json({ error: 'Ya existe un dueño registrado. Pedile que te cree una cuenta de empleado desde Configuración.' });
  } else {
    rolFinal = 'CAJERO';
  }
  if (db.prepare('SELECT 1 FROM usuarios WHERE usuario = ?').get(uA)) {
    return res.status(400).json({ error: 'Ese usuario ya existe' });
  }
  const hash = bcrypt.hashSync(String(password), 10);
  const info = db.prepare('INSERT INTO usuarios (nombre, usuario, password_hash, rol) VALUES (?,?,?,?)')
    .run(String(nombre).trim(), uA, hash, rolFinal);
  const user = { id: Number(info.lastInsertRowid), nombre: String(nombre).trim(), usuario: uA, rol: rolFinal };
  req.session.user = user;
  audit(user, 'REGISTRO', 'Cuenta creada como ' + (rolFinal === 'ADMIN' ? 'dueño' : 'empleado'));
  res.json({ ok: true, user });
}));

router.post('/usuarios', handle((req, res) => {
  if (!req.session.user || req.session.user.rol !== 'ADMIN') return res.status(403).json({ error: 'Solo administrador' });
  const { nombre, usuario, password, rol } = req.body || {};
  if (!nombre || !usuario || !password) return res.status(400).json({ error: 'Nombre, usuario y contraseña son obligatorios' });
  if (!['ADMIN', 'CAJERO'].includes(rol)) return res.status(400).json({ error: 'Rol inválido' });
  const db = getDB();
  if (db.prepare('SELECT 1 FROM usuarios WHERE usuario = ?').get(String(usuario).trim())) {
    return res.status(400).json({ error: 'El usuario ya existe' });
  }
  const hash = bcrypt.hashSync(String(password), 10);
  db.prepare('INSERT INTO usuarios (nombre, usuario, password_hash, rol) VALUES (?,?,?,?)')
    .run(nombre, String(usuario).trim(), hash, rol);
  audit(req.session.user, 'CREAR_USUARIO', usuario);
  res.json({ ok: true });
}));

router.get('/usuarios', handle((req, res) => {
  if (!req.session.user || req.session.user.rol !== 'ADMIN') return res.status(403).json({ error: 'Solo administrador' });
  const rows = getDB().prepare('SELECT id, nombre, usuario, rol, esta_activo, creado_en FROM usuarios ORDER BY id').all();
  res.json(rows);
}));

router.put('/usuarios/:id', handle((req, res) => {
  if (!req.session.user || req.session.user.rol !== 'ADMIN') return res.status(403).json({ error: 'Solo administrador' });
  const id = Number(req.params.id);
  const db = getDB();
  const exists = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(id);
  if (!exists) return res.status(404).json({ error: 'Usuario no encontrado' });
  const { nombre, rol, esta_activo, password } = req.body || {};
  db.prepare(`UPDATE usuarios SET nombre = ?, rol = ?, esta_activo = ?,
    password_hash = CASE WHEN ? IS NULL OR ? = '' THEN password_hash ELSE ? END,
    actualizado_en = datetime('now','localtime') WHERE id = ?`)
    .run(nombre || exists.nombre, rol || exists.rol, esta_activo === undefined ? exists.esta_activo : (esta_activo ? 1 : 0),
      password, password, password ? bcrypt.hashSync(String(password), 10) : null, id);
  audit(req.session.user, 'EDITAR_USUARIO', exists.usuario);
  res.json({ ok: true });
}));

module.exports = router;