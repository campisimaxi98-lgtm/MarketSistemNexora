# MarketSistemNexora

Aplicación de gestión para minimercados y drugstores: punto de venta con escáner de código de barras y QR, control de stock, precios (individuales y masivos), importación desde Excel, caja con arqueo, reportes y respaldos automáticos.

Se puede usar de dos formas:

- **App de escritorio** (recomendada): se instala como cualquier programa de Windows y abre en su propia ventana.
- **Modo web**: se ejecuta el servidor y se accede desde el navegador.

Todo funciona **local y sin Internet**: sin servicios externos, sin dependencias de frontend y con encoders de código de barras (EAN-13, Code128) y QR propios (sin librerías ni CDN).

## Primer uso: crear la cuenta

La primera vez **no hay usuarios**: al abrir el sistema te pide **Crear cuenta**.

- La **primera cuenta** que se registra queda como **Dueño** (administrador).
- Después, las cuentas nuevas que se registran desde la pantalla de inicio son **Empleados**.
- El dueño puede crear/editar usuarios y asignar rol (Dueño o Empleado) desde **Configuración → Usuarios**.

## Opción A — App de escritorio (Windows)

### Usar el instalador

1. Ejecutá `MarketSistemNexora Setup 1.0.0.exe` y seguí el asistente (crea acceso directo en el escritorio).
2. Abrí **MarketSistemNexora** desde el menú Inicio o el escritorio.
3. Creá la cuenta de dueño y empezá a usar.

También existe la versión **portable** (`MarketSistemNexora 1.0.0.exe`): no se instala, se ejecuta directamente (ideal para llevar en un pendrive junto a la carpeta de datos).

### Compilar el instalador (para desarrollo)

```bash
npm install
npm run dist
```

Los archivos se generan en `dist/`:

- `MarketSistemNexora Setup 1.0.0.exe` (instalador NSIS)
- `MarketSistemNexora 1.0.0.exe` (portable)

Otros scripts: `npm run app` (abre la app en modo desarrollo) y `npm start` (solo servidor web).

### ¿Dónde se guardan los datos en la app?

En `%APPDATA%\MarketSistemNexora\datos` (base `minimarket.db` y carpetas de backups). No se pierde al actualizar la app.

## Opción B — Modo web

1. `npm install`
2. `npm start` (o `node server.js`)
3. Abrir <http://localhost:3000> y **crear la cuenta de dueño**.

## Estructura

```
electron/main.js      Proceso principal de la app de escritorio
server.js             Servidor Express 5 (usado por la app y por el modo web)
scripts/make-icon.js  Genera el ícono de la app (sin dependencias)
build/icon.ico        Ícono de la aplicación
src/
  db.js               SQLite (node:sqlite), migraciones, backup/swap
  config.js           Configuración del comercio (persistida)
  helpers.js          Utilidades y auditoría
  pdf.js              Generación de tickets PDF (sin dependencias)
  middleware.js       Auth por sesión (cookie) + administrador
  routes/             auth, productos, precios, stock, caja, ventas,
                      reportes, excel, config, tickets, backup
public/
  index.html          SPA (login/registro + app con sidebar)
  css/styles.css      Todo el estilo local
  js/
    qr.js             Encoder QR propio (window.MINIQ)
    barcode.js        Encoder EAN-13 / Code128 propio (window.BARCODE)
    utils.js          Helpers (fetch de API, modales, toasts, charts)
    app.js            Router hash, sesión, registro, permisos
    pages/            Dashboard, POS, Productos, Importar/Precios, Stock,
                      Caja, Reportes, Tickets, Configuración
```

## Configuración de datos

- **App de escritorio**: `%APPDATA%\MarketSistemNexora\datos`.
- **Modo web**: `data/minimarket.db` (junto al proyecto).

Se puede cambiar la carpeta con la variable de entorno `MINIMARKET_DATA`, útil para instalaciones portables sobre pendrive:

```
set MINIMARKET_DATA=D:\mi-market\datos
npm start
```

Los backups se guardan en `<carpeta de datos>\backups`.

## Requisitos (desarrollo)

- Node.js **22.5 o superior** (usa `node:sqlite`, SQLite embebido, sin instalación extra).

## Licencia

MIT
