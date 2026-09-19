(function () {
  'use strict';

  function cargarReponer(root) {
    var body = root.querySelector('#reponer-body');
    U.api('GET', '/stock/reponer').then(function (d) {
      body.innerHTML = d.productos.map(function (p) {
        return '<tr><td>' + U.esc(p.nombre) + '<div class="muted" style="font-size:12px">' + U.esc(p.codigo_barras || p.codigo_interno || '') + '</div></td>' +
          '<td>' + U.esc(p.categoria) + '</td>' +
          '<td class="num">' + U.fmtQty(p.stock) + '</td>' +
          '<td class="num">' + U.fmtQty(p.stock_minimo) + '</td>' +
          '<td class="num" style="color:var(--warn);font-weight:600">' + U.fmtQty(p.faltan) + '</td>' +
          '<td class="num">' + U.fmt(p.precio_venta) + '</td>' +
          '<td style="white-space:nowrap">' +
          '<button class="btn btn-sm btn-ok" data-acc="entrada" data-id="' + p.id + '" data-nombre="' + U.esc(p.nombre) + '" data-cant="' + p.faltan + '" data-stock="' + p.stock + '">Reponer</button> ' +
          '<button class="btn btn-sm" data-acc="ajuste" data-id="' + p.id + '" data-nombre="' + U.esc(p.nombre) + '" data-stock="' + p.stock + '">Ajustar</button>' +
          '</td></tr>';
      }).join('') || U.tableEmpty(7, 'No hay productos por reponer');
      document.getElementById('reponer-total').textContent = 'Productos por reponer: ' + d.total;
    }).catch(function (e) {
      body.innerHTML = U.tableEmpty(7, 'Error: ' + e.message);
    });
  }

  function modalMovStock(p, tipo) {
    var esEntrada = tipo === 'entrada';
    var cantDef = esEntrada ? (p.dataset.cant || 1) : p.dataset.stock;
    var m = U.modal({
      titulo: (esEntrada ? 'Reponer stock' : 'Ajustar stock') + ' · ' + p.dataset.nombre,
      html: (esEntrada ? '<p class="muted">Stock actual: <strong>' + U.fmtQty(p.dataset.stock) + '</strong></p>' : '') +
        '<label>Cantidad<input id="ms-cant" type="number" step="0.01" min="' + (esEntrada ? '0.01' : '0') + '" value="' + cantDef + '"></label>' +
        '<label>Motivo<input id="ms-mot" value="' + (esEntrada ? 'Reposición de mercadería' : 'Ajuste manual') + '"></label>',
      okText: esEntrada ? 'Registrar entrada' : 'Aplicar ajuste',
      onOk: function () {
        var cuerpo = esEntrada
          ? { id_producto: Number(p.dataset.id), cantidad: m.el.querySelector('#ms-cant').value, motivo: m.el.querySelector('#ms-mot').value }
          : { id_producto: Number(p.dataset.id), nuevo_stock: m.el.querySelector('#ms-cant').value, motivo: m.el.querySelector('#ms-mot').value };
        U.api('POST', esEntrada ? '/stock/entrada' : '/stock/ajuste', cuerpo).then(function (r) {
          U.toast(esEntrada ? 'Entrada registrada. Stock: ' + r.stock : 'Ajuste aplicado. Stock: ' + r.stock, 'ok');
          m.close();
          cargarReponer(document.getElementById('view'));
          cargarMovimientos(document.getElementById('view'));
        }).catch(function (e) { U.toast(e.message, 'error'); return false; });
        return false;
      }
    });
  }

  function cargarMovimientos(root) {
    var q = '/stock/movimientos?limite=200';
    var pid = root.querySelector('#mv-prod') ? root.querySelector('#mv-prod').value : '';
    var desde = root.querySelector('#mv-desde') ? root.querySelector('#mv-desde').value : '';
    var hasta = root.querySelector('#mv-hasta') ? root.querySelector('#mv-hasta').value : '';
    if (pid) q += '&producto_id=' + pid;
    if (desde) q += '&desde=' + desde;
    if (hasta) q += '&hasta=' + hasta;
    var tbody = root.querySelector('#mv-body');
    U.api('GET', q).then(function (rows) {
      tbody.innerHTML = rows.map(function (m) {
        var badge = m.tipo === 'ENTRADA' || m.tipo === 'INICIAL' ? '<span class="badge badge-ok">' + m.tipo + '</span>'
          : m.tipo === 'SALIDA' ? '<span class="badge badge-danger">' + m.tipo + '</span>'
          : '<span class="badge badge-info">' + m.tipo + '</span>';
        var signo = m.tipo === 'SALIDA' ? '-' : '+';
        return '<tr><td>' + U.fechaHora(m.creado_en) + '</td><td>' + U.esc(m.nombre) + '</td>' +
          '<td>' + badge + '</td><td class="num">' + signo + U.fmtQty(m.cantidad) + '</td>' +
          '<td class="num">' + U.fmtQty(m.stock_anterior) + ' → ' + U.fmtQty(m.stock_nuevo) + '</td>' +
          '<td>' + U.esc(m.motivo || '') + '</td></tr>';
      }).join('') || U.tableEmpty(6, 'Sin movimientos');
    }).catch(function (e) {
      tbody.innerHTML = U.tableEmpty(6, 'Error: ' + e.message);
    });
  }

  function cargarProductosSelect(root) {
    U.api('GET', '/productos?limit=200').then(function (d) {
      var sel = root.querySelector('#mv-prod');
      sel.innerHTML = '<option value="">Todos los productos</option>' + d.productos.map(function (p) {
        return '<option value="' + p.id + '">' + U.esc(p.nombre) + '</option>';
      }).join('');
    }).catch(function () {});
  }

  App.page('stock', {
    title: 'Stock',

    html: function () {
      return '<div class="tabs" data-global-tabs>' +
        '<button data-tab="reponer" class="active">Reponer / mercadería</button>' +
        '<button data-tab="movimientos">Movimientos de stock</button>' +
        '</div>' +
        '<div id="st-reponer">' +
        '<div class="flex between mb"><span class="muted" id="reponer-total"></span>' +
        '<button class="btn" id="btn-refrescar-reponer">↻ Actualizar</button></div>' +
        '<div class="table-wrap"><table><thead><tr><th>Producto</th><th>Categoría</th><th class="num">Stock</th><th class="num">Mínimo</th><th class="num">Faltan</th><th class="num">Precio venta</th><th></th></tr></thead><tbody id="reponer-body"><tr><td colspan="7" class="center muted">Cargando…</td></tr></tbody></table></div>' +
        '</div>' +
        '<div id="st-mov" class="hidden">' +
        '<div class="toolbar">' +
        '<select id="mv-prod" style="max-width:280px"><option value="">Todos los productos</option></select>' +
        '<input type="date" id="mv-desde"><input type="date" id="mv-hasta">' +
        '<button class="btn" id="btn-mv-filtro">Filtrar</button>' +
        '</div>' +
        '<div class="table-wrap"><table><thead><tr><th>Fecha</th><th>Producto</th><th>Tipo</th><th class="num">Cantidad</th><th class="num">Stock antes → después</th><th>Motivo</th></tr></thead><tbody id="mv-body"><tr><td colspan="6" class="center muted">Cargando…</td></tr></tbody></table></div>' +
        '</div>';
    },

    mounted: function (root) {
      cargarReponer(root);
      cargarProductosSelect(root);
      var h = root.querySelector("#mv-hasta");
      var d = root.querySelector("#mv-desde");
      d.value = U.hace7dias();
      h.value = U.hoy();
      cargarMovimientos(root);
    },

    hooks: {
      'click [data-tab]': function (e, t) {
        var tabs = t.closest('[data-global-tabs]');
        U.$$('[data-tab]', tabs).forEach(function (b) { b.classList.toggle('active', b === t); });
        var tab = t.getAttribute('data-tab');
        document.getElementById('st-reponer').classList.toggle('hidden', tab !== 'reponer');
        document.getElementById('st-mov').classList.toggle('hidden', tab !== 'movimientos');
      },
      'click #btn-refrescar-reponer': function () { cargarReponer(document.getElementById('view')); },
      'click [data-acc="entrada"]': function (e, t) { modalMovStock(t, 'entrada'); },
      'click [data-acc="ajuste"]': function (e, t) { modalMovStock(t, 'ajuste'); },
      'click #btn-mv-filtro': function () { cargarMovimientos(document.getElementById('view')); }
    }
  });
})();