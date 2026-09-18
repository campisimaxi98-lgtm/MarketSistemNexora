# Manual de uso — MarketSistemNexora

## 1. Ingreso

- Abrí el navegador en `http://localhost:3000`.
- Logueate con tu usuario y contraseña.
- **Funciones de administrador** (productos, precios, configuración): solo las ve quien tiene rol ADMIN.
- **Cajero**: puede vender, hacer entradas de stock, abrir/cerrar caja y ver reportes de su caja.

## 2. Ventas (POS)

- **Escáner físico**: poné el cursor en el campo de código y escaneá. El código aparece sin tipear nada.
- **Sin escáner**: escribí el código con el teclado y presioná `Enter`; también podés buscar por nombre en el buscador y tocar una sugerencia.
- Agregá cantidades, revisá el carrito y tocá **COBRAR**.
- Elegí los métodos de pago (efectivo, tarjeta, etc.). El sistema suma los pagos hasta cubrir el total.
- Confirmá el cobro: se descuenta stock, se registra en caja y se ofrece el **ticket en PDF** para imprimir.
- **Caja abierta**: antes de poder cobrar tenés que abrir la caja del día (pestaña Caja).

### Códigos de barras y QR

- Se acepta el código escaneado como **código interno**, **código de barras** o **código QR** impreso en etiquetas.
- Los códigos EAN-13 se validan (dígito verificador). Si el código no es EAN-13 válido, se interpreta/emite como Code128 automáticamente.

## 3. Productos

- **Listado** con búsqueda y filtros, orden y paginación.
- **Nuevo / Editar**: nombre, categoría, costo, precio de venta, stock, stock mínimo, códigos.
- **Generar códigos**: botón que genera un código interno único y un EAN-13 válido.
- **Precio**: actualiza el precio con historial (quién, cuándo, costo anterior y nuevo). No reetiqueta la fecha de modificación del producto.
- **Etiquetas**: generá etiquetas con QRs/códigos de barras (con el encoder propio, sin Internet) e imprimí desde el navegador.
- **Desactivar / Reactivar**: un producto desactivado no se vende ni aparece en el POS.

## 4. Importar / Precios

- **Importar Excel**: subí un `.xlsx` con las columnas de la plantilla descargable. Se previsualiza y podés **Aplicar** las filas válidas. Las filas con errores se ignoran y se muestran.
- **Precios masivos**: subir o bajar precios por porcentaje o monto, para todos, por categoría o por lista de productos, con redondeo opcional.
- **Precios individuales**: editar costo y precio de venta rápido con control del margen.

### Formato del Excel

Columnas (primera fila = encabezados):

| Columna | Requerido | Notas |
|---|---|---|
| nombre | sí | Nombre del producto |
| categoria | no | Si no existe, se crea |
| codigo_barras | no | EAN-13 se valida |
| codigo_interno | no | |
| precio_costo | no | Número con punto/coma decimal |
| precio_venta | sí | Si falta precio_venta, se rechaza la fila |
| stock | no | Cantidad inicial |
| stock_minimo | no | |

Precios en **pesos argentinos** (se aceptan `$ 1.234,50` o `1234.50`).

## 5. Stock

- **Reponer**: lista productos con falta (stock actual < stock mínimo vendible) o que no llegan al mínimo.
- **Entrada** (reponer) y **Ajuste** (corrección con motivo; en ajuste el costo se conserva).
- **Movimientos**: historial por producto y por fecha (entrada, salida, ajuste, anulación).

## 6. Caja

- **Abrir caja** con dinero inicial (se controla que no haya otra abierta).
- **Ingresos / Egresos / Retiros** manuales con concepto y método.
- **Cierre**: cargá el monto real contado; el sistema calcula **diferencia** y la audita.
- **Historial**: movimientos y cierres anteriores.

## 7. Reportes

- **Ventas** por día y por método de pago, con detalle por venta.
- **Ganancias**: por período (venta − costo al momento de la venta), con resumen.
- **Productos**: más vendidos (cantidad y facturación) del mes.
- **Mensual**: facturación, ganancia y evolución por mes del año.
- **Caja**: ingresos, egresos y retiros del período.
- Todos los reportes se pueden **exportar a Excel**.

## 8. Tickets

- Listado, filtros por número/fecha, **ver detalle** (con productos y pagos) y **descargar PDF**.
- **Anular una venta** (solo ADMIN): se marca anulada, se restituye el stock y se audita con el motivo.

## 9. Configuración (ADMIN)

- **Datos del comercio**: nombre (sale en el ticket), dirección, teléfono, CUIT, moneda, stock mínimo por defecto.
- **Ticket**: formato (ancho mm), mensaje al pie y opción de mostrar ganancia en el ticket.
- **Stock**: activar/desactivar el control de stock en ventas.
- **Backup**: hacer uno ahora, descargar, **restaurar** desde un archivo `.db` (valida que sea una base válida y guarda un backup previo de seguridad), y backup automático con frecuencia en horas (se mantienen hasta 30).
- **Métodos de pago**: activar/desactivar.
- **Categorías**: agregar categorías nuevas.
- **Usuarios**: crear/editar/activar usuarios (cajeros o administradores). La contraseña se puede cambiar dejando el campo vacío en edición.

## 10. Respaldos

- Manuales: Configuración → Backup → **Hacer backup ahora**. Se guardan en `<carpeta de datos>/backups`.
- Automáticos: cada N horas configurable, con depuración automática (últimos 30).
- **Restaurar**: adjuntar un `.db` o elegir uno de la lista. Antes de restaurar se guarda un backup de seguridad.
- Para respaldo manual externo: copiá la carpeta `data` completa (base + backups). Hacelo con el servidor **detenido**.

## 11. Anexo técnico

### Servidor

- Express 5, sesiones con cookie `sid`.
- Errores: respuestas JSON `{ error: "mensaje" }`, con código 400/401/403/404/500.
- Endpoints principales: `/api/auth/*`, `/api/productos`, `/api/precios`, `/api/stock/*`, `/api/caja/*`, `/api/ventas`, `/api/tickets/*`, `/api/reportes/*`, `/api/excel/*`, `/api/config`, `/api/backup/*`. Los que modifican datos requieren `POST/PUT` con JSON y sesión válida.

### Validación de encoders (referencias)

Los encoders propios se validaron byte a byte contra implementaciones de referencia:

- **EAN-13 y Code128**: paquete JsBarcode (local) — **13/13 casos idénticos**.
- **QR**: librería de Kazuhiko Arase (local) — documentos UTF-8 NXT/QR valen igual.

### Nota sobre Windows con "Control de aplicaciones y de carpetas" (Controlled Folder Access)

Este proyecto se desarrolló editando archivos dentro de `C:\Users\...\Documents`, y el Control de aplicaciones y de carpetas de Windows puede estar **bloqueando** que el editor especificado escriba ahí (resultando en "No permission to write"). Si te pasa lo mismo al editar:

1. Configuración de Seguridad de Windows → **Protección contra virus y amenazas** → **Protección contra ransomware** → **Control de aplicaciones y de carpetas**.
2. **Permitir una aplicación a través del control de carpetas** → Agregar el ejecutable de tu editor (y/o `node.exe`).
3. Alternativa más simple: mover el proyecto a una carpeta fuera de las protegidas (ej. `C:\MarketSistemNexora`).