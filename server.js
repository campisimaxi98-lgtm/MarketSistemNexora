const express = require('express');
const session = require('express-session');
const path = require('path');
const { openDB } = require('./src/db');
const { programarBackupAutomatico } = require('./src/routes/backup');

function createApp() {
  const app = express();

  app.use(express.json({ limit: '5mb' }));
  app.use(express.urlencoded({ extended: false }));

  app.use(session({
    secret: process.env.SESSION_SECRET || 'marketsistemnexora-secreto-local',
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, maxAge: 1000 * 60 * 60 * 24 * 15, sameSite: 'lax' }
  }));

  app.use('/api/auth', require('./src/routes/auth'));
  app.use('/api/config', require('./src/routes/config'));
  app.use('/api/productos', require('./src/routes/productos'));
  app.use('/api/ventas', require('./src/routes/ventas'));
  app.use('/api/precios', require('./src/routes/precios'));
  app.use('/api/stock', require('./src/routes/stock'));
  app.use('/api/caja', require('./src/routes/caja'));
  app.use('/api/reportes', require('./src/routes/reportes'));
  app.use('/api/excel', require('./src/routes/excel'));
  app.use('/api/backup', require('./src/routes/backup'));
  app.use('/api/tickets', require('./src/routes/tickets'));

  // Interfaz (si public/ existe, sirve estáticos)
  const PUBLIC = path.join(__dirname, 'public');
  app.use(express.static(PUBLIC));
  app.get(/^\/(?!api|health).*/, (req, res) => {
    res.sendFile(path.join(PUBLIC, 'index.html'));
  });

  app.use('/health', (req, res) => res.json({ ok: true, hora: new Date().toISOString() }));

  // Manejo de errores de la API
  app.use('/api', (err, req, res, next) => {
    console.error('API error:', err);
    res.status(500).json({ error: 'Error interno: ' + (err.message || 'desconocido') });
  });

  return app;
}

function start(port, host) {
  openDB();
  programarBackupAutomatico();
  const app = createApp();
  return new Promise((resolve, reject) => {
    const server = app.listen(port || 0, host || '0.0.0.0');
    server.once('error', reject);
    server.once('listening', () => resolve({ server, port: server.address().port }));
  });
}

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  start(PORT).then(({ port }) => {
    console.log('==========================================');
    console.log('  MarketSistemNexora - Sistema de gestión');
    console.log('  Abra el sistema en: http://localhost:' + port);
    console.log('  Primera vez: creá la cuenta de dueño desde "Crear cuenta"');
    console.log('==========================================');
  }).catch((err) => {
    console.error('No se pudo iniciar MarketSistemNexora:', err.message);
    process.exit(1);
  });
}

module.exports = { createApp, start };
