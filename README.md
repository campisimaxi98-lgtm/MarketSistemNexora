# MarketSistemNexora

Sistema de gestión para minimercados y drugstores: punto de venta con escáner de código de barras y QR, control de stock, precios (individuales y masivos), importación desde Excel, caja con arqueo, reportes y respaldos automáticos.

Todo funciona **local y sin Internet**: sin servicios externos, sin dependencias de frontend y con encoders de código de barras (EAN-13, Code128) y QR propios (sin librerías ni CDN).

## Requisitos

- Node.js **22.5 o superior** (usa `node:sqlite`, SQLite embebido, sin instalación extra).

## Puesta en marcha

1. Instalar dependencias (solo `express`): `npm install`
2. Iniciar el servidor: `node server.js`
3. Abrir en el navegador: <http://localhost:3000>

La primera vez crea la base de datos con el usuario por defecto:

- **Usuario:** `admin`
- **Contraseña:** `admin123`

> Cambiá la contraseña apenas instales (Configuración → Usuarios → Editar).

## Estructura

```
server.js             Punto de entrada (Express 5)
src/
  db.js               SQLite (node:sqlite), migraciones, backup/swap
  config.js           Configuración del comercio (persistida)
  helpers.js          Utilidades y auditoría
  pdf.js              Generación de tickets PDF (sin dependencias)
  middleware.js       Auth por sesión (cookie) + administrador
  routes/             auth, productos, precios, stock, caja, ventas,
                      reportes, excel, config, tickets, backup
public/
  index.html          SPA (login + app con sidebar)
  css/styles.css      Todo el estilo local
  js/
    qr.js             Encoder QR propio (window.MINIQ)
    barcode.js        Encoder EAN-13 / Code128 propio (window.BARCODE)
    utils.js          Helpers (fetch de API, modales, toasts, charts)
    app.js            Router hash, sesión, permisos
    pages/            Dashboard, POS, Productos, Importar/Precios, Stock,
                      Caja, Reportes, Tickets, Configuración
```

## Configuración de datos

Por defecto la base se guarda en `data/minimarket.db` (junto al proyecto). Se puede cambiar con la variable de entorno `MINIMARKET_DATA`, útil en instalaciones portables sobre memoria USB:

```
set MINIMARKET_DATA=D:\mi-market\datos
node server.js
```

Los backups se guardan en `<data>/backups`.