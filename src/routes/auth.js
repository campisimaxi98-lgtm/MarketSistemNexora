const express = require('express');
const bcrypt = require('bcryptjs');
const { getDB } = require('../db');
const { audit, generarCodigoRecuperacion, esEmailValido } = require('../helpers');
const { handle, requireAuth, requireAdmin } = require('../middleware');

const router = express.Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function usuarioPublico(u) {
  return { id: u.id, nombre: u.nombre, usuario: u.usuario, email: u.email || '', rol: u.rol };
}

function buscarPorUsuarioOEmail(ident) {
  const db = getDB();
  const val = String(ident || '').trim();
  if (val.includes('@')) {
    const porEmail = db.prepare('SELECT * FROM usuarios WHERE lower(email) = lower(?)').get(val);
    if (porEmail) return porEmail;
  }
  return db.prepare('SELECT * FROM usuarios WHERE usuario = ?').get(val);
}

function emailEnUso(email, excluirId) {
  if (!email) return false;
  const db = getDB();
  const row = db.prepare("SELECT 1 FROM usuarios WHERE lower(email) = lower(?) AND email IS NOT NULL AND email <> '' AND id <> ?")
    .get(email.trim(), excluirId || 0);
  return !!row;
}

router.post('/login', (req, res, next) => {
  const { usuario, password } = req.body || {};
  if (!usuario || !password) return res.status(400).json({ error: 'Usuario y contraseña requeridos' });
  const user = buscarPorUsuarioOEmail(String(usuario));
  if (!user || user.esta_activo !== 1) return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
  if (!bcrypt.compareSync(String(password), user.password_hash)) return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
  req.session.regenerate((err) => {
    if (err) return next(err);
    req.session.user = usuarioPublico(user);
    audit(user, 'LOGIN', 'Inicio de sesión');
    res.json({ user: req.session.user });
  });
});

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

function crearUsuario(datos) {
  const { nombre, usuario, password, rol, email } = datos;
  if (!nombre || !usuario || !password) return { error: 'Nombre, usuario y contraseña son obligatorios' };
  if (String(password).length < 4) return { error: 'La contraseña debe tener al menos 4 caracteres' };
  const uA = String(usuario).trim();
  if (uA.length < 3) return { error: 'El usuario debe tener al menos 3 caracteres' };
  if (email !== undefined && email !== null && String(email).trim() !== '') {
    if (!EMAIL_RE.test(String(email).trim())) return { error: 'El email no es válido' };
  }
  const db = getDB();
  if (db.prepare('SELECT 1 FROM usuarios WHERE usuario = ?').get(uA)) return { error: 'Ese usuario ya existe' };
  if (emailEnUso(email)) return { error: 'Ese email ya está en uso por otro usuario' };
  const codigo = generarCodigoRecuperacion();
  const hash = bcrypt.hashSync(String(password), 10);
  const recuHash = bcrypt.hashSync(codigo, 10);
  const emailFinal = email !== undefined && email !== null ? String(email).trim() : null;
  const info = db.prepare('INSERT INTO usuarios (nombre, usuario, email, password_hash, recuperacion_hash, rol) VALUES (?,?,?,?,?,?)')
    .run(String(nombre).trim(), uA, emailFinal || null, hash, recuHash, rol);
  return { id: Number(info.lastInsertRowid), nombre: String(nombre).trim(), usuario: uA, email: emailFinal || '', rol, codigo };
}

router.post('/registro', handle((req, res) => {
  const { nombre, usuario, password, rol, email } = req.body || {};
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
  const creado = crearUsuario({ nombre, usuario, password, rol: rolFinal, email });
  if (creado.error) return res.status(400).json({ error: creado.error });
  const user = { id: creado.id, nombre: creado.nombre, usuario: creado.usuario, email: creado.email, rol: creado.rol };
  req.session.regenerate((err) => {
    if (err) return next(err);
    req.session.user = user;
    audit(user, 'REGISTRO', 'Cuenta creada como ' + (rolFinal === 'ADMIN' ? 'dueño' : 'empleado'));
    res.json({ ok: true, user, codigo_recuperacion: creado.codigo });
  });
}));

router.post('/recuperar', handle((req, res) => {
  const { usuario, codigo, password } = req.body || {};
  if (!usuario || !codigo || !password) return res.status(400).json({ error: 'Usuario o email, código y nueva contraseña son obligatorios' });
  if (String(password).length < 4) return res.status(400).json({ error: 'La contraseña nueva debe tener al menos 4 caracteres' });
  const user = buscarPorUsuarioOEmail(String(usuario));
  if (!user || !user.recuperacion_hash) return res.status(400).json({ error: 'No se encontró una cuenta con ese usuario o email' });
  if (!bcrypt.compareSync(String(codigo).trim().toUpperCase(), user.recuperacion_hash)) {
    return res.status(400).json({ error: 'El código de recuperación no es válido' });
  }
  const nuevoCodigo = generarCodigoRecuperacion();
  const hash = bcrypt.hashSync(String(password), 10);
  const recuHash = bcrypt.hashSync(nuevoCodigo, 10);
  getDB().prepare(`UPDATE usuarios SET password_hash = ?, recuperacion_hash = ?, actualizado_en = datetime('now','localtime') WHERE id = ?`)
    .run(hash, recuHash, user.id);
  audit(user, 'RECUPERAR_PASSWORD', 'Recuperó su contraseña con código');
  res.json({ ok: true, codigo_recuperacion: nuevoCodigo });
}));

router.post('/usuarios', requireAuth, requireAdmin, handle((req, res) => {
  const { nombre, usuario, password, rol, email } = req.body || {};
  if (!['ADMIN', 'CAJERO'].includes(rol)) return res.status(400).json({ error: 'Rol inválido' });
  const creado = crearUsuario({ nombre, usuario, password, rol, email });
  if (creado.error) return res.status(400).json({ error: creado.error });
  audit(req.session.user, 'CREAR_USUARIO', usuario);
  res.json({ ok: true, codigo_recuperacion: creado.codigo });
}));

router.get('/usuarios', requireAuth, requireAdmin, handle((req, res) => {
  const rows = getDB().prepare('SELECT id, nombre, usuario, email, rol, esta_activo, creado_en FROM usuarios ORDER BY id').all();
  res.json(rows.map((u) => ({ ...u, email: u.email || '' })));
}));

router.put('/usuarios/:id', requireAuth, requireAdmin, handle((req, res) => {
  const id = Number(req.params.id);
  const db = getDB();
  const exists = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(id);
  if (!exists) return res.status(404).json({ error: 'Usuario no encontrado' });
  const { nombre, rol, esta_activo, password, email } = req.body || {};
  if (password !== undefined && password !== null && String(password) !== '' && String(password).length < 4) {
    return res.status(400).json({ error: 'La contraseña debe tener al menos 4 caracteres' });
  }
  if (email !== undefined && String(email).trim() !== '' && !EMAIL_RE.test(String(email).trim())) {
    return res.status(400).json({ error: 'El email no es válido' });
  }
  if (emailEnUso(email, id)) return res.status(400).json({ error: 'Ese email ya está en uso por otro usuario' });

  const nuevoNombre = nombre !== undefined ? String(nombre) : exists.nombre;
  const nuevoRol = rol !== undefined ? rol : exists.rol;
  const nuevoActivo = esta_activo === undefined ? exists.esta_activo : (esta_activo ? 1 : 0);
  const emailFinal = email !== undefined ? (String(email).trim() || null) : exists.email;
  let nuevoPassHash = exists.password_hash;
  let codigoRotado = null;
  if (password !== undefined && password !== null && String(password) !== '') {
    nuevoPassHash = bcrypt.hashSync(String(password), 10);
    const nuevoCodigo = generarCodigoRecuperacion();
    db.prepare('UPDATE usuarios SET recuperacion_hash = ? WHERE id = ?').run(bcrypt.hashSync(nuevoCodigo, 10), id);
    codigoRotado = nuevoCodigo;
  }
  db.prepare(`UPDATE usuarios SET nombre = ?, email = ?, rol = ?, esta_activo = ?, password_hash = ?,
    actualizado_en = datetime('now','localtime') WHERE id = ?`)
    .run(nuevoNombre, emailFinal, nuevoRol, nuevoActivo, nuevoPassHash, id);
  audit(req.session.user, 'EDITAR_USUARIO', exists.usuario);
  res.json({ ok: true, codigo_recuperacion: codigoRotado });
}));

module.exports = router;