(function () {
  'use strict';

  var preview = null;

  function exportarExcel(tipo, extra) {
    var body = Object.assign({ tipo: tipo }, extra || {});
    fetch('/api/excel/exportar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }).then(function (res) {
      if (!res.ok) return res.json().then(function (d) { throw new Error(d.error || 'Error'); });
      return res.blob();
    }).then(function (blob) {
      U.downloadBlob(blob, tipo + '.xlsx');
    }).catch(function (e) { U.toast(e.message, 'error'); });
  }

  function subirArchivo(file) {
    if (!file) return;
    var root = document.getElementById('view');
    root.querySelector('#archivo-label').textContent = file.name;
    var reader = new FileReader();
    reader.onload = function () {
      fetch('/api/excel/importar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: reader.result
      }).then(function (res) {
        if (!res.ok) return res.json().then(function (d) { throw new Error(d.error || 'Error al leer el archivo'); });
        return res.json();
      }).then(function (d) {
        preview = d;
        renderPreview();
      }).catch(function (e) {
        U.toast(e.message, 'error');
        preview = null;
        renderPreview();
      });
    };
    reader.readAsArrayBuffer(file);
  }

  function renderPreview() {
    var root = document.getElementById('view');
    var box = root.querySelector('#preview-box');
    if (!preview) {
      box.innerHTML = '';
      return;
    }
    var s = preview.resumen;
    box.innerHTML =
      '<div class="flex mb">' +
      '<span class="badge badge-info">total ' + s.total + '</span> ' +
      '<span class="badge badge-ok">nuevos ' + s.nuevos + '</span> ' +
      '<span class="badge badge-warn">actualizar ' + s.actualizar + '</span> ' +
      (s.conError ? '<span class="badge badge-danger">con error ' + s.conError + '</span>' : '') +
      '</div>' +
      '<div class="table-wrap" style="max-height:420px;overflow:auto"><table><thead><tr><th>Fila</th><th>Nombre</th><th>Código</th><th>Categoría</th><th class="num">Costo</th><th class="num">Venta</th><th>Estado</th></tr></thead><tbody>' +
      preview.filas.map(function (f) {
        var badge = f.estado === 'error' ? '<span class="badge badge-danger">Error</span>' :
          (f.estado === 'actualizar' ? '<span class="badge badge-warn">Actualizar</span>' : '<span class="badge badge-ok">Nuevo</span>');
        var det = f.error ? '<div class="muted" style="font-size:12px">' + U.esc(f.error) + '</div>' :
          (f.variacion !== null && f.variacion !== undefined ? '<div class="muted" style="font-size:12px">' + (f.precio_anterior !== null ? U.fmt(f.precio_anterior) + ' → ' : '') + U.fmt(f.precio_nuevo) + ' (' + U.fmtQty(f.variacion) + '%)</div>' : '');
        return '<tr><td>' + f.fila_excel + '</td><td>' + U.esc(f.nombre || '-') + det + '</td>' +
          '<td>' + U.esc(f.codigo_barras || f.codigo_interno || f.codigo_qr || '-') + '</td>' +
          '<td>' + U.esc(f.categoria_resuelta || f.categoria || '-') + '</td>' +
          '<td class="num">' + (f.precio_costo !== undefined ? U.fmt(f.precio_costo) : '-') + '</td>' +
          '<td class="num">' + (f.precio_venta !== undefined ? U.fmt(f.precio_venta) : '-') + '</td>' +
          '<td>' + badge + '</td></tr>';
      }).join('') + '</tbody></table></div>' +
      '<div class="flex end mt gap" style="gap:10px">' +
      '<button class="btn btn-primary" id="btn-aplicar">Aplicar importación</button>' +
      '<button class="btn btn-ghost" id="btn-preview-clear">Cancelar</button>' +
      '</div>';
  }

  function aplicar() {
    if (!preview) return;
    var filas = preview.filas.filter(function (f) { return f.estado !== 'error'; });
    U.api('POST', '/excel/aplicar', { filas: filas }).then(function (r) {
      U.toast('Importación aplicada: ' + r.creados + ' creados, ' + r.actualizados + ' actualizados, ' + r.conPrecio + ' con cambio de precio', 'ok');
      preview = null;
      renderPreview();
      document.getElementById('archivo').value = '';
      document.getElementById('archivo-label').textContent = 'Seleccioná un archivo .xlsx';
    }).catch(function (e) { U.toast(e.message, 'error'); });
  }

  function preciosMasivos() {
    var root = document.getElementById('view');
    var body = {
      alcance: root.querySelector('#ma-alcance').value,
      categoria_id: root.querySelector('#ma-cat') ? root.querySelector('#ma-cat').value : null,
      tipo: root.querySelector('#ma-tipo').value,
      operacion: root.querySelector('#ma-op').value,
      valor: root.querySelector('#ma-valor').value,
      redondear_a: root.querySelector('#ma-red').value || ''
    };
    U.api('POST', '/precios/masiva', body).then(function (r) {
      U.toast(r.contador + ' precios actualizados. Variación promedio: ' + r.variacion_promedio + '%', 'ok');
    }).catch(function (e) { U.toast(e.message, 'error'); });
  }

  function cargarPreciosIndividuales(root, search) {
    var url = '/productos?limit=60';
    if (search) url += '&search=' + encodeURIComponent(search);
    U.api('GET', url).then(function (d) {
      var box = root.querySelector('#precios-tabla');
      var tbody = box.querySelector('tbody');
      tbody.innerHTML = d.productos.map(function (p) {
        return '<tr data-pid="' + p.id + '"><td>' + U.esc(p.nombre) + '</td><td>' + U.esc(p.categoria) + '</td>' +
          '<td class="num"><input type="number" step="0.01" min="0" class="pi-costo" value="' + p.precio_costo + '"></td>' +
          '<td class="num"><input type="number" step="0.01" min="0" class="pi-venta" value="' + p.precio_venta + '"></td>' +
          '<td class="num">' + U.fmt(p.precio_venta - p.precio_costo) + '</td>' +
          '<td><button class="btn btn-sm btn-primary" data-act="guardar-precio">Guardar</button></td></tr>';
      }).join('') || U.tableEmpty(6, 'Sin productos');
    }).catch(function (e) { U.toast(e.message, 'error'); });
  }

  App.page('importar', {
    title: 'Importar / Precios',
    admin: true,

    html: function () {
      return '<div class="tabs" data-act="tabs">' +
        '<button data-tab="importar" class="active">Importar Excel</button>' +
        '<button data-tab="precios">Precios</button>' +
        '</div>' +
        '<div id="tab-importar">' +
        '<div class="card mb">' +
        '<h3>Importar productos desde Excel</h3>' +
        '<p class="muted">Formato: fila 1 con encabezados (Código de barras, Código interno, Código QR, Producto, Categoría, Stock, Stock mínimo, Precio costo, Precio venta). Se identifican por código; si existen, actualizan precios/stock.</p>' +
        '<div class="flex mt">' +
        '<label class="grow" style="margin:0"><input type="file" id="archivo" accept=".xlsx,.xls"></label>' +
        '<button class="btn" id="btn-plantilla">⬇️ Descargar plantilla</button>' +
        '</div>' +
        '<p class="muted" id="archivo-label">Ningún archivo seleccionado.</p>' +
        '</div>' +
        '<div id="preview-box"></div>' +
        '</div>' +
        '<div id="tab-precios" class="hidden">' +
        '<div class="card mb"><h3>Cambio masivo de precios</h3>' +
        '<div class="form-row">' +
        '<label>Alcance<select id="ma-alcance"><option value="todos">Todos los productos</option><option value="categoria">Por categoría</option></select></label>' +
        '<label id="wrap-ma-cat" class="hidden">Categoría<select id="ma-cat"></select></label>' +
        '<label>Tipo<select id="ma-tipo"><option value="porcentaje">Porcentaje (%)</option><option value="monto">Monto ($)</option></select></label>' +
        '<label>Operación<select id="ma-op"><option value="aumento">Aumento</option><option value="disminucion">Disminución</option></select></label>' +
        '<label>Valor<input id="ma-valor" type="number" step="0.01" min="0.01" placeholder="10"></label>' +
        '<label>Redondear a<select id="ma-red"><option value="">Sin redondeo</option><option value="10">$10</option><option value="50">$50</option><option value="100">$100</option></select></label>' +
        '</div><button class="btn btn-primary mt" id="btn-masiva">Aplicar cambio masivo</button></div>' +
        '<div class="toolbar"><div class="grow"><input id="pi-search" placeholder="Filtrar productos…"></div></div>' +
        '<div id="precios-tabla" class="table-wrap"><table><thead><tr><th>Producto</th><th>Categoría</th><th class="num">Costo</th><th class="num">Venta</th><th class="num">Ganancia</th><th></th></tr></thead><tbody><tr><td colspan="6" class="center muted">Cargando…</td></tr></tbody></table></div>' +
        '</div>';
    },

    mounted: function (root) {
      U.api('GET', '/config').then(function (c) {
        var sel = root.querySelector('#ma-cat');
        sel.innerHTML = c.categorias.map(function (cat) {
          return '<option value="' + cat.id + '">' + U.esc(cat.nombre) + '</option>';
        }).join('');
      }).catch(function () {});
      root.querySelector('#btn-plantilla').addEventListener('click', function () { exportarExcel('productos', { desde: '' }); });
      root.querySelector('#btn-masiva').addEventListener('click', preciosMasivos);
      root.querySelector('#ma-alcance').addEventListener('change', function (e) {
        root.querySelector('#wrap-ma-cat').classList.toggle('hidden', e.target.value !== 'categoria');
      });
      root.querySelector('#archivo').addEventListener('change', function (e) { subirArchivo(e.target.files[0]); });
      cargarPreciosIndividuales(root, '');
    },

    hooks: {
      'click [data-tab]': function (e, t) {
        U.$$('[data-tab]', t.closest('.tabs')).forEach(function (b) { b.classList.toggle('active', b === t); });
        var rootEl = document.getElementById('view');
        rootEl.querySelector('#tab-importar').classList.toggle('hidden', t.getAttribute('data-tab') !== 'importar');
        rootEl.querySelector('#tab-precios').classList.toggle('hidden', t.getAttribute('data-tab') !== 'precios');
      },
      'click #btn-aplicar': function () { aplicar(); },
      'click #btn-preview-clear': function () { preview = null; renderPreview(); U.$('#archivo').value = ''; U.$('#archivo-label').textContent = 'Ningún archivo seleccionado.'; },
      'input #pi-search': U.debounce(function (e, t) { cargarPreciosIndividuales(document.getElementById('view'), t.value); }, 350),
      'click [data-act="guardar-precio"]': function (e, t) {
        var tr = t.closest('tr');
        var id = tr.getAttribute('data-pid');
        var pc = tr.querySelector('.pi-costo').value;
        var pv = tr.querySelector('.pi-venta').value;
        U.api('PUT', '/precios/' + id, { precio_costo: pc, precio_venta: pv }).then(function () {
          U.toast('Precio guardado', 'ok');
          cargarPreciosIndividuales(document.getElementById('view'), U.$('#pi-search') ? U.$('#pi-search').value : '');
        }).catch(function (err) { U.toast(err.message, 'error'); });
      }
    }
  });
})();