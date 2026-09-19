(function () {
  'use strict';

  var estado = { search: '', cat: '', bajo: '', inact: '0', page: 1, categorias: [], etiquetas: [] };

  function filtrarProds() {
    var q = [];
    if (estado.search) q.push('search=' + encodeURIComponent(estado.search));
    if (estado.cat) q.push('categoria=' + estado.cat);
    if (estado.bajo) q.push('solo_bajo=1');
    if (estado.inact === '1') q.push('incluir_inactivos=1');
    q.push('page=' + estado.page, 'limit=20');
    return '/productos?' + q.join('&');
  }

  function badgeStock(p) {
    if (p.bajo) return '<span class="badge badge-warn">' + U.fmtQty(p.stock) + '</span>';
    return '<span class="badge badge-ok">' + U.fmtQty(p.stock) + '</span>';
  }

  function modalProducto(p) {
    var editar = !!p;
    var esAdmin = App.user && App.user.rol === 'ADMIN';
    p = p || {};
    var numLock = esAdmin ? '' : ' disabled';
    var html =
      (editar ? '<input type="hidden" id="mp-id" value="' + p.id + '">' : '') +
      '<label>Nombre *<input id="mp-nombre" value="' + U.esc(p.nombre || '') + '"></label>' +
      '<div class="form-row">' +
      '<label>Categoría<select id="mp-cat">' + estado.categorias.map(function (c) {
        return '<option value="' + c.id + '"' + (p.id_categoria === c.id ? ' selected' : '') + '>' + U.esc(c.nombre) + '</option>';
      }).join('') + '</select></label>' +
      '</div>' +
      '<div class="form-row">' +
      '<label>Código de barras<div class="flex"><input id="mp-cb" value="' + U.esc(p.codigo_barras || '') + '"><button type="button" class="btn btn-sm" data-gen-cb>Generar</button></div></label>' +
      '<label>Código interno<div class="flex"><input id="mp-ci" value="' + U.esc(p.codigo_interno || '') + '"><button type="button" class="btn btn-sm" data-gen-ci>Generar</button></div></label>' +
      '<label>Código QR<div class="flex"><input id="mp-cq" value="' + U.esc(p.codigo_qr || '') + '"><button type="button" class="btn btn-sm" data-gen-cq>Generar</button></div></label>' +
      '</div>' +
      '<div class="form-row">' +
      '<label>Precio costo<input id="mp-pc" type="number" step="0.01" min="0" value="' + (p.precio_costo || 0) + '"' + numLock + '></label>' +
      '<label>Precio venta<input id="mp-pv" type="number" step="0.01" min="0" value="' + (p.precio_venta || 0) + '"' + numLock + '></label>' +
      '<label>Stock<input id="mp-stock" type="number" step="0.01" min="0" value="' + (p.stock || 0) + '"' + numLock + '></label>' +
      '<label>Stock mínimo<input id="mp-min" type="number" step="0.01" min="0" value="' + (p.stock_minimo === undefined || p.stock_minimo === null ? 10 : p.stock_minimo) + '"' + numLock + '></label>' +
      '</div>' +
      (editar ? '<label><input type="checkbox" id="mp-activo" ' + (p.esta_activo ? 'checked' : '') + '> Producto activo</label>' : '');
    var m = U.modal({
      titulo: editar ? 'Editar producto' : 'Nuevo producto',
      html: html,
      okText: editar ? 'Guardar' : 'Crear',
      onOk: function () {
        var body = {
          nombre: m.el.querySelector('#mp-nombre').value,
          id_categoria: m.el.querySelector('#mp-cat').value || null,
          codigo_barras: m.el.querySelector('#mp-cb').value,
          codigo_interno: m.el.querySelector('#mp-ci').value,
          codigo_qr: m.el.querySelector('#mp-cq').value
        };
        if (esAdmin) {
          body.precio_costo = m.el.querySelector('#mp-pc').value;
          body.precio_venta = m.el.querySelector('#mp-pv').value;
          body.stock = m.el.querySelector('#mp-stock').value;
          body.stock_minimo = m.el.querySelector('#mp-min').value;
        }
        var req = editar ? U.api('PUT', '/productos/' + estado.editarId, body) : U.api('POST', '/productos', body);
        req.then(function (r) {
          U.toast(editar ? 'Producto actualizado' : 'Producto creado', 'ok');
          m.close();
          cargar();
        }).catch(function (e) {
          U.toast(e.message, 'error');
          if (editar) return false;
        });
        return false;
      }
    });
    if (editar) estado.editarId = p.id;
    ['cb', 'ci', 'cq'].forEach(function (tipo) {
      m.el.querySelector('[data-gen-' + tipo + ']').addEventListener('click', function () {
        var pre = { cb: '8', ci: 'P', cq: 'https://' }[tipo];
        U.$('#mp-' + tipo).value = pre + String(Date.now()).slice(-8) + Math.floor(Math.random() * 90 + 10);
      });
    });
  }

  function modalPrecio(p) {
    var m = U.modal({
      titulo: 'Precio de ' + p.nombre,
      html:
        '<div class="alert alert-info">Precio actual de venta: <strong>' + U.fmt(p.precio_venta) + '</strong></div>' +
        '<label>Precio de venta nuevo<input id="mpv" type="number" step="0.01" min="0" value="' + p.precio_venta + '"></label>' +
        '<label>Precio de costo<input id="mpc" type="number" step="0.01" min="0" value="' + p.precio_costo + '"></label>',
      okText: 'Guardar precio',
      onOk: function () {
        U.api('PUT', '/productos/' + p.id, {
          precio_venta: m.el.querySelector('#mpv').value,
          precio_costo: m.el.querySelector('#mpc').value
        }).then(function () {
          U.toast('Precio actualizado', 'ok');
          m.close();
          cargar();
        }).catch(function (e) { U.toast(e.message, 'error'); return false; });
        return false;
      }
    });
  }

  function modalHistorial(p) {
    U.api('GET', '/productos/' + p.id).then(function (d) {
      var rows = (d.historial || []).map(function (h) {
        return '<tr><td>' + U.fechaHora(h.creado_en) + '</td><td class="num">' + U.fmt(h.precio_costo) + '</td><td class="num">' + U.fmt(h.precio_venta) + '</td></tr>';
      }).join('') || U.tableEmpty(3, 'Sin cambios de precio');
      U.modal({
        titulo: 'Historial de precios · ' + p.nombre,
        lg: true,
        html: '<div class="table-wrap"><table><thead><tr><th>Fecha</th><th class="num">Costo</th><th class="num">Venta</th></tr></thead><tbody>' + rows + '</tbody></table></div>',
        buttons: true
      });
    }).catch(function (e) { U.toast(e.message, 'error'); });
  }

  function generarEtiqueta(p) {
    var qr = null, bar = null;
    try { var q = MINIQ.build(p.codigo_qr || String(p.id)); qr = MINIQ.toSVG(p.codigo_qr || String(p.id), { cells: 4, margin: 2 }); } catch (e) { qr = '<span class="muted">QR no disponible</span>'; }
    try { bar = BARCODE.toSVG(p.codigo_barras || String(p.id), { barWidth: 2, height: 46, withText: true, text: p.codigo_barras || p.codigo_interno || String(p.id) }); } catch (e) {}
    return '<div class="etiqueta"><div class="qr-preview">' + qr + '</div><div class="nm">' + U.esc(p.nombre) + '</div><div class="pv">' + U.fmt(p.precio_venta) + '</div>' + (bar ? '<div class="bar-preview">' + bar + '</div>' : '') + '</div>';
  }

  function modalEtiquetas(productos) {
    estado.etiquetas = productos || [];
    var m = U.modal({
      titulo: 'Etiquetas (' + estado.etiquetas.length + ')',
      lg: true,
      html: '<p class="muted">Etiquetas generadas con QR y código de barras. Para imprimirlas usá el botón.</p><div id="etiquetas-real" class="center"></div>',
      okText: '🖨️ Imprimir',
      onOk: function () {
        var w = window.open('', '_blank');
        if (!w) { U.toast('Permití ventanas emergentes para imprimir', 'warn'); return false; }
        w.document.write('<html><head><title>Etiquetas</title><style>@page{size:auto;margin:4mm}body{font-family:sans-serif;padding:10px}.wrap{display:flex;flex-wrap:wrap}</style></head><body><div class="wrap">' + U.$('#etiquetas-real').innerHTML + '</div><script>window.print();<\/script></body></html>');
        w.document.close();
        m.close();
      }
    });
    var box = m.el.querySelector('#etiquetas-real');
    box.innerHTML = estado.etiquetas.map(generarEtiqueta).join('') || '<div class="muted">Nada para imprimir</div>';
  }

  function toggleProducto(p) {
    if (p.esta_activo) {
      U.confirm('<strong>' + U.esc(p.nombre) + '</strong><br>¿Desactivar este producto? No aparecerá en el POS.', function () {
        U.api('DELETE', '/productos/' + p.id, { confirmar: true }).then(function () { U.toast('Producto desactivado', 'ok'); cargar(); }).catch(function (e) { U.toast(e.message, 'error'); });
      }, { danger: true, titulo: 'Desactivar producto', okText: 'Desactivar' });
    } else {
      U.api('PUT', '/productos/' + p.id, { esta_activo: true }).then(function () { U.toast('Producto reactivado', 'ok'); cargar(); }).catch(function (e) { U.toast(e.message, 'error'); });
    }
  }

  function cargar() {
    var root = document.getElementById('view');
    U.api('GET', filtrarProds()).then(function (d) {
      if (!document.querySelector('#tabla-productos')) return;
      var tbody = document.querySelector('#tabla-productos tbody');
      tbody.innerHTML = d.productos.map(function (p) {
        return '<tr>' +
          '<td>' + U.esc(p.nombre) + '<div class="muted" style="font-size:12px">' + U.esc(p.codigo_barras || p.codigo_interno || p.codigo_qr || 'sin código') + '</div></td>' +
          '<td>' + U.esc(p.categoria) + '</td>' +
          '<td class="num">' + U.fmt(p.precio_costo) + '</td>' +
          '<td class="num">' + U.fmt(p.precio_venta) + '</td>' +
          '<td class="num">' + U.fmt(p.ganancia) + '</td>' +
          '<td>' + badgeStock(p) + '</td>' +
          '<td>' + (p.esta_activo ? '<span class="badge badge-ok">activo</span>' : '<span class="badge badge-muted">inactivo</span>') + '</td>' +
          '<td style="white-space:nowrap">' +
          '<button class="btn btn-sm" data-acc="edit" data-id="' + p.id + '">✏️</button> ' +
          (App.user && App.user.rol === 'ADMIN' ? '<button class="btn btn-sm" data-acc="precio" data-id="' + p.id + '">$</button> ' : '') +
          '<button class="btn btn-sm" data-acc="precios" data-id="' + p.id + '">📜</button> ' +
          '<button class="btn btn-sm" data-acc="etiqueta" data-id="' + p.id + '">🏷️</button> ' +
          (App.user && App.user.rol === 'ADMIN' ? '<button class="btn btn-sm" data-acc="toggle" data-id="' + p.id + '">' + (p.esta_activo ? '⛔' : '✅') + '</button>' : '') +
          '</td></tr>';
      }).join('') || U.tableEmpty(8, 'No hay productos');
      document.getElementById('prods-total').textContent = 'Total: ' + d.total + ' · Página ' + d.page;
      var prev = document.getElementById('pg-prev'), next = document.getElementById('pg-next');
      if (prev) prev.disabled = d.page <= 1;
      if (next) next.disabled = d.page >= Math.max(1, Math.ceil(d.total / d.limit));
    }).catch(function (e) {
      if (document.querySelector('#tabla-productos tbody')) {
        document.querySelector('#tabla-productos tbody').innerHTML = U.tableEmpty(8, 'Error: ' + e.message);
      }
    });
  }

  App.page('productos', {
    title: 'Productos',

    html: function () {
      return '<div class="toolbar">' +
        '<div class="grow"><input id="f-search" placeholder="Buscar por nombre o código…"></div>' +
        '<select id="f-cat" style="max-width:200px"><option value="">Todas las categorías</option></select>' +
        '<label style="margin:0"><input type="checkbox" id="f-bajo"> Stock bajo</label>' +
        '<label style="margin:0"><input type="checkbox" id="f-inact"> Incluir inactivos</label>' +
        '<button class="btn btn-primary" data-act="nuevo">+ Nuevo producto</button>' +
        '<button class="btn" data-act="etiquetas">🏷️ Etiquetas página</button>' +
        '</div>' +
        '<div id="tabla-productos" class="table-wrap"><table><thead><tr>' +
        '<th>Producto</th><th>Categoría</th><th class="num">Costo</th><th class="num">Venta</th><th class="num">Ganancia</th><th>Stock</th><th>Estado</th><th></th>' +
        '</tr></thead><tbody><tr><td colspan="8" class="center muted">Cargando…</td></tr></tbody></table></div>' +
        '<div class="flex between mt"><span class="muted" id="prods-total"></span><span><button class="btn btn-sm" id="pg-prev">← Anterior</button> <button class="btn btn-sm" id="pg-next">Siguiente →</button></span></div>';
    },

    mounted: function (root) {
      U.api('GET', '/config').then(function (c) {
        estado.categorias = c.categorias || [];
        var sel = root.querySelector('#f-cat');
        sel.innerHTML = '<option value="">Todas las categorías</option>' + estado.categorias.map(function (cat) {
          return '<option value="' + cat.id + '">' + U.esc(cat.nombre) + '</option>';
        }).join('');
      }).catch(function () {});
      cargar();
    },

    hooks: {
      'input #f-search': U.debounce(function (e, t) { estado.search = t.value; estado.page = 1; cargar(); }, 350),
      'change #f-cat': function (e, t) { estado.cat = t.value; estado.page = 1; cargar(); },
      'change #f-bajo': function (e, t) { estado.bajo = t.checked ? '1' : ''; estado.page = 1; cargar(); },
      'change #f-inact': function (e, t) { estado.inact = t.checked ? '1' : '0'; estado.page = 1; cargar(); },
      'click #pg-prev': function () { if (estado.page > 1) { estado.page--; cargar(); } },
      'click #pg-next': function () { estado.page++; cargar(); },
      'click [data-act="nuevo"]': function () { modalProducto(null); },
      'click [data-act="etiquetas"]': function () {
        U.api('GET', filtrarProds()).then(function (d) { modalEtiquetas(d.productos); }).catch(function (e) { U.toast(e.message, 'error'); });
      },
      'click [data-acc]': function (e, t) {
        var id = Number(t.getAttribute('data-id'));
        var acc = t.getAttribute('data-acc');
        U.api('GET', '/productos/' + id).then(function (d) {
          var p = d.producto;
          if (acc === 'edit') modalProducto(p);
          else if (acc === 'precio') modalPrecio(p);
          else if (acc === 'precios') modalHistorial(p);
          else if (acc === 'etiqueta') modalEtiquetas([p]);
          else if (acc === 'toggle') toggleProducto(p);
        }).catch(function (err) { U.toast(err.message, 'error'); });
      }
    }
  });
})();