const { app, BrowserWindow, Menu, dialog, shell } = require('electron');
const path = require('path');

app.setName('MarketSistemNexora');

let server = null;
let win = null;
let baseUrl = '';

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  app.whenReady().then(async () => {
    process.env.MINIMARKET_DATA = process.env.MINIMARKET_DATA || path.join(app.getPath('userData'), 'datos');

    let port;
    try {
      const started = await require('../server').start(Number(process.env.MARKET_PORT) || 0, '127.0.0.1');
      server = started.server;
      port = started.port;
    } catch (e) {
      dialog.showErrorBox('MarketSistemNexora', 'No se pudo iniciar el sistema:\n' + e.message);
      app.quit();
      return;
    }

    baseUrl = 'http://127.0.0.1:' + port;
    crearMenu();

    win = new BrowserWindow({
      width: 1400,
      height: 900,
      minWidth: 1024,
      minHeight: 640,
      title: 'MarketSistemNexora',
      backgroundColor: '#1f2430',
      autoHideMenuBar: true,
      show: false,
      webPreferences: { contextIsolation: true, nodeIntegration: false, spellcheck: false }
    });

    win.once('ready-to-show', () => win.show());
    win.on('closed', () => { win = null; });

    win.webContents.setWindowOpenHandler(({ url }) => {
      if (url.startsWith(baseUrl)) return { action: 'allow' };
      if (/^https?:/i.test(url)) { shell.openExternal(url); return { action: 'deny' }; }
      return { action: 'allow' };
    });

    win.webContents.on('did-fail-load', (e, code, desc) => {
      if (code === -3) return;
      dialog.showErrorBox('MarketSistemNexora', 'No se pudo cargar la interfaz:\n' + desc);
    });

    win.loadURL(baseUrl);

    if (process.env.MARKET_SMOKE) {
      win.webContents.once('did-finish-load', async () => {
        try {
          const r = await fetch(baseUrl + '/health');
          const j = await r.json();
          console.log('SMOKE health=' + j.ok + ' port=' + port);
          app.exit(j.ok ? 0 : 1);
        } catch (err) {
          console.log('SMOKE FAIL ' + err.message);
          app.exit(1);
        }
      });
    }
  });

  app.on('window-all-closed', () => app.quit());
  app.on('before-quit', () => { try { if (server) server.close(); } catch (e) {} });
}

function crearMenu() {
  const template = [
    {
      label: 'Archivo',
      submenu: [
        { label: 'Configuración', click: () => { if (win) win.loadURL(baseUrl + '#/config'); } },
        { type: 'separator' },
        { label: 'Salir', role: 'quit' }
      ]
    },
    {
      label: 'Ver',
      submenu: [
        { label: 'Recargar', role: 'reload' },
        { label: 'Pantalla completa', role: 'togglefullscreen' },
        { type: 'separator' },
        { label: 'Acercar', role: 'zoomIn' },
        { label: 'Alejar', role: 'zoomOut' },
        { label: 'Tamaño normal', role: 'resetZoom' },
        { type: 'separator' },
        { label: 'Herramientas de desarrollo', role: 'toggleDevTools' }
      ]
    },
    {
      label: 'Ayuda',
      submenu: [
        {
          label: 'Acerca de MarketSistemNexora',
          click: () => dialog.showMessageBox(win, {
            type: 'info',
            title: 'Acerca de',
            message: 'MarketSistemNexora',
            detail: 'Sistema de gestión para minimercados y drugstores.\nVersión ' + app.getVersion() + '\nDatos: ' + process.env.MINIMARKET_DATA
          })
        }
      ]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
