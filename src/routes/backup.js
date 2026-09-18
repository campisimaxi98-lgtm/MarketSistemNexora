const express = require('express');
const fs = require('fs');
const path = require('path');
const { getDB, DB_PATH, BACKUP_DIR, swapDBFromFile } = require('../db');
const { getConfig } = require('../config');
const { audit } = require('../helpers');
const { requireAdmin, handle } = require('../middleware');

const router = express.Router();

function nombreArchivo() {
  const d = new Date();
  const s = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}_${String(d.getHours()).padStart(2, '0')}-${String(d.getMinutes()).padStart(2, '0')}`;
  return `backup_${getConfig('nombre_comercio')}_${s}.db`;
}

function hacerBackup(tipo) {
  const db = getDB();
  const destino = path.join(BACKUP_DIR, nombreArchivo());
  const temp = path.join(BACKUP_DIR, '.tmp_backup.db');
  // checkpoint WAL para que el archivo principal quede consistente
  try { db.exec('PRAGMA wal_checkpoint(TRUNCATE)'); } catch (e) {}
  fs.copyFileSync(DB_PATH, temp);
  fs.renameSync(temp, destino);
  // depurado: mantener últimos 30 backups automáticos
  const files = fs.readdirSync(BACKUP_DIR).filter((f) => f.startsWith('backup_') && f.endsWith('.db')).sort();
  while (files.length > 30) {
    fs.unlinkSync(path.join(BACKUP_DIR, files.shift()));
  }
  return destino;
}

router.get('/listar', requireAdmin, handle((req, res) => {
  const files = fs.readdirSync(BACKUP_DIR).filter((f) => f.endsWith('.db')).sort().reverse().map((f) => {
    const st = fs.statSync(path.join(BACKUP_DIR, f));
    return { nombre: f, fecha: st.mtime, tamano: st.size };
  });
  res.json(files);
}));

router.post('/manual', requireAdmin, handle((req, res) => {
  const destino = hacerBackup('manual');
  audit(req.session.user, 'BACKUP_MANUAL', path.basename(destino));
  res.json({ ok: true, archivo: path.basename(destino) });
}));

router.get('/descargar/:nombre', requireAdmin, handle((req, res) => {
  const nombre = path.basename(req.params.nombre);
  const full = path.join(BACKUP_DIR, nombre);
  if (!fs.existsSync(full)) return res.status(404).json({ error: 'Backup no encontrado' });
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(nombre)}"`);
  res.setHeader('Content-Type', 'application/octet-stream');
  fs.createReadStream(full).pipe(res);
}));

router.post('/restaurar', express.raw({ type: () => true, limit: '50mb' }),
  requireAdmin, handle(async (req, res) => {
    const buf = req.body;
    if (!buf || buf.length < 100) return res.status(400).json({ error: 'Archivo inválido' });
    const tmp = path.join(BACKUP_DIR, '.restore_test.db');
    fs.writeFileSync(tmp, buf);
    // validar que sea una base SQLite válida
    const check = Buffer.from(buf.slice(0, 16));
    const ok = check.includes(Buffer.from('SQLite format 3'));
    if (!ok) { fs.unlinkSync(tmp); return res.status(400).json({ error: 'El archivo no es una base de datos de MarketSistemNexora válida' }); }
    try {
      const { DatabaseSync } = require('node:sqlite');
      const test = new DatabaseSync(tmp);
      const t = test.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='productos'").get();
      test.close();
      if (!t) { fs.unlinkSync(tmp); return res.status(400).json({ error: 'La base no contiene tablas del sistema' }); }
    } catch (e) {
      fs.unlinkSync(tmp);
      return res.status(400).json({ error: 'No se pudo leer el backup' });
    }
    // backup de seguridad antes de restaurar
    const previo = path.join(BACKUP_DIR, 'backup_antes_restaurar_' + Date.now() + '.db');
    fs.copyFileSync(DB_PATH, previo);
    swapDBFromFile(tmp);
    try { fs.unlinkSync(tmp); } catch (e) {}
    audit(req.session.user, 'RESTAURAR_BACKUP', 'Restaurado desde archivo. Backup previo: ' + path.basename(previo));
    res.json({ ok: true, mensaje: 'Base restaurada. Backup previo guardado.' });
  }));

function programarBackupAutomatico() {
  if (!global.__autoBackupTimer) {
    global.__autoBackupTimer = setInterval(() => {
      try {
        const activo = getConfig('backup_automatico');
        const hs = Number(getConfig('backup_frecuencia_hs')) || 24;
        if (activo !== '0' && hs > 0) {
          const files = fs.readdirSync(BACKUP_DIR).filter((f) => f.startsWith('backup_') && f.endsWith('.db'));
          let ultimo = 0;
          for (const f of files) {
            const t = fs.statSync(path.join(BACKUP_DIR, f)).mtimeMs;
            if (t > ultimo) ultimo = t;
          }
          if (Date.now() - ultimo > hs * 3600 * 1000) {
            hacerBackup('auto');
          }
        }
      } catch (e) {
        console.error('Auto backup:', e.message);
      }
    }, 10 * 60 * 1000);
  }
}

module.exports = router;
module.exports.programarBackupAutomatico = programarBackupAutomatico;