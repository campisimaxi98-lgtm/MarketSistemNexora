(function () {
  'use strict';

  var rango = { desde: '', hasta: '' };

  function leerRango(root) {
    rango.desde = root.querySelector('#rp-desde').value;
    rango.hasta = root.querySelector('#rp-hasta').value;
  }

  function cargarVentas(root) {
    leerRango(root);
    if (!rango.desde || !rango.hasta) {
      U.toast('Definí el rango de fechas', 'warn');
      return;
    }
    var box = root.querySelector('#reporte-box');
    box.innerHTML = '<div class="center muted" style="padding:30px">Cargando…</div>';
    U.api('GET', '/reportes/ventas?desde=' + rango.desde + '&hasta=' + rango.hasta).then(function (d) {
      var r = d.resumen;
      box.innerHTML =
        '<div class="grid cols-4 mb">' +
        '<div class="stat"><div class="k">Facturación</div><div class="v">' + U.fmt(r.total) + '</div></div>' +
        '<div class="stat"><div class="k">Ventas</div><div class="v">' + U.fmtQty(r.ventas) + '</div></div>' +
        '<div class="stat"><div class="k">Unidades</div><div class="v">' + U.fmtQty(r.unidades) + '</div></div>' +
        '<div class="stat"><div class="k">Ganancia</div><div class="v">' + U.fmt(r.ganancia) + '</div></div>' +
        '</div>' +
        '<div class="grid cols-2 mb">' +
        '<div class="card"><h3>Ventas por día</h3><div id="rep-line"></div></div>' +
        '<div class="card"><h3>Por método de pago</h3><div id="rep-donut"></div></div>' +
        '</div>' +
        '<div class="card"><h3>Detalle</h3>' +
        '<div class="table-wrap" style="max-height:360px;overflow:auto"><table><thead><tr><th>N°</th><th>Fecha</th><th>Producto</th><th>Código</th><th class="num">Cant.</th><th class="num">P. unit.</th><th class="num">Total</th><th class="num">Ganancia</th></tr></thead><tbody>' +
        (d.detalle || []).map(function (f) {
          return '<tr><td>' + U.esc(f.numero) + '</td><td>' + U.fechaHora(f.creado_en) + '</td><td>' + U.esc(f.producto) + '</td><td>' + U.esc(f.codigo || '') + '</td>' +
            '<td class="num">' + U.fmtQty(f.cantidad) + '</td><td class="num">' + U.fmt(f.precio_unitario) + '</td><td class="num">' + U.fmt(f.total) + '</td><td class="num">' + U.fmt(f.ganancia) + '</td></tr>';
        }).join('') || U.tableEmpty(8, 'Sin ventas en el período') +
        '</tbody></table></div></div>' +
        '<div class="flex end mt"><button class="btn" data-act-excel="ventas">⬇️ Exportar Excel</button></div>';
      U.renderLine(box.querySelector('#rep-line'), (d.por_dia || []).map(function (x) { return { label: x.dia, value: x.total }; }));
      var metItems = (d.por_metodo || []).map(function (x) { return { label: x.metodo, value: x.total }; });
      renderDonut(box.querySelector('#rep-donut'), metItems);
    }).catch(function (e) {
      box.innerHTML = '<div class="alert alert-error">' + U.esc(e.message) + '</div>';
    });
  }

  function renderDonut(el, items) {
    var total = items.reduce(function (a, i) { return a + i.value; }, 0);
    if (!total) { el.innerHTML = '<div class="muted">Sin datos</div>'; return; }
    U.renderDonut(el, items);
    el.innerHTML += '<div class="legend">' + items.map(function (i, k) {
      return '<span class="muted">' + U.fmtQty(i.value) + '</span>';
    }).join('') + '</div>';
  }

  function cargarGanancias(root) {
    leerRango(root);
    if (!rango.desde || !rango.hasta) { U.toast('Definí el rango de fechas', 'warn'); return; }
    var box = root.querySelector('#reporte-box');
    box.innerHTML = '<div class="center muted" style="padding:30px">Cargando…</div>';
    U.api('GET', '/reportes/ganancias?desde=' + rango.desde + '&hasta=' + rango.hasta).then(function (d) {
      var t = d.total;
      box.innerHTML =
        '<div class="grid cols-4 mb">' +
        '<div class="stat"><div class="k">Facturación</div><div class="v">' + U.fmt(t.facturacion || 0) + '</div></div>' +
        '<div class="stat"><div class="k">Costos</div><div class="v">' + U.fmt(t.costo || 0) + '</div></div>' +
        '<div class="stat"><div class="k">Ganancia</div><div class="v" style="color:var(--ok)">' + U.fmt(t.ganancia || 0) + '</div></div>' +
        '<div class="stat"><div class="k">Ventas</div><div class="v">' + U.fmtQty(t.ventas || 0) + '</div></div>' +
        '</div>' +
        '<div class="card"><h3>Ganancia por día</h3><div id="gan-line"></div></div>';
      U.renderLine(box.querySelector('#gan-line'), (d.por_dia || []).map(function (x) { return { label: x.dia, value: x.ganancia }; }));
    }).catch(function (e) { box.innerHTML = '<div class="alert alert-error">' + U.esc(e.message) + '</div>'; });
  }

  function cargarProductosReporte(root) {
    leerRango(root);
    var tipo = root.querySelector('#pr-tipo').value;
    var box = root.querySelector('#reporte-box');
    box.innerHTML = '<div class="center muted" style="padding:30px">Cargando…</div>';
    var q = '/reportes/productos?limite=30';
    if (tipo === 'mas') q += '&mas_vendidos=1';
    else if (tipo === 'menos') { q += '&menos_vendidos=1'; if (rango.desde) q += '&desde=' + rango.desde + '&hasta=' + rango.hasta; }
    else if (tipo === 'sinmov') { q += '&sin_movimiento=1'; if (rango.desde) q += '&desde=' + rango.desde + '&hasta=' + rango.hasta; }
    else if (tipo === 'bajo') q += '&stock_bajo=1';
    else { q += '&mas_vendidos=1'; if (rango.desde) q += '&desde=' + rango.desde + '&hasta=' + rango.hasta; }
    U.api('GET', q).then(function (d) {
      var filas = d.filas || [];
      var cols = filas.length && filas[0].stock !== undefined ? 6 : 5;
      box.innerHTML = '<div class="card"><div class="table-wrap"><table><thead><tr>' +
        (filas.length && filas[0].stock !== undefined ? '<th>Producto</th><th>Código</th><th>Categoría</th><th class="num">Stock</th><th class="num">Precio</th><th></th>' : '<th>Producto</th><th class="num">Cantidad</th><th class="num">Total</th><th class="num">Ganancia</th><th></th>') +
        '</tr></thead><tbody>' +
        filas.map(function (f) {
          if (f.stock !== undefined) {
            return '<tr><td>' + U.esc(f.nombre) + '</td><td>' + U.esc(f.codigo_barras || '') + '</td><td>' + U.esc(f.categoria || '') + '</td><td class="num">' + U.fmtQty(f.stock) + '</td><td class="num">' + U.fmt(f.precio_venta) + '</td><td></td></tr>';
          }
          return '<tr><td>' + U.esc(f.nombre) + '</td><td class="num">' + U.fmtQty(f.cantidad) + '</td><td class="num">' + U.fmt(f.total) + '</td><td class="num">' + U.fmt(f.ganancia || 0) + '</td><td></td></tr>';
        }).join('') || U.tableEmpty(cols, 'Sin datos') +
        '</tbody></table></div></div>';
    }).catch(function (e) { box.innerHTML = '<div class="alert alert-error">' + U.esc(e.message) + '</div>'; });
  }

  function cargarResumenMensual(root) {
    var anio = root.querySelector('#rm-anio').value;
    var box = root.querySelector('#reporte-box');
    box.innerHTML = '<div class="center muted" style="padding:30px">Cargando…</div>';
    U.api('GET', '/reportes/resumen-mensual?anio=' + anio).then(function (d) {
      box.innerHTML = '<div class="card">' +
        '<div class="table-wrap"><table><thead><tr><th>Mes</th><th class="num">Facturación</th><th class="num">Costos</th><th class="num">Ganancia</th><th class="num">Gastos</th><th class="num">Ventas</th><th class="num">Unidades</th></tr></thead><tbody>' +
        d.filas.map(function (f) {
          return '<tr><td>' + ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'][f.mes - 1] + '</td>' +
            '<td class="num">' + U.fmt(f.facturacion) + '</td><td class="num">' + U.fmt(f.costos) + '</td><td class="num">' + U.fmt(f.ganancia) + '</td>' +
            '<td class="num">' + U.fmt(f.gastos) + '</td><td class="num">' + U.fmtQty(f.ventas) + '</td><td class="num">' + U.fmtQty(f.unidades) + '</td></tr>';
        }).join('') + '</tbody></table></div>' +
        '<div class="flex end mt"><button class="btn" data-act-excel="resumen" data-anio="' + anio + '">⬇️ Exportar Excel</button></div></div>';
    }).catch(function (e) { box.innerHTML = '<div class="alert alert-error">' + U.esc(e.message) + '</div>'; });
  }

  function cargarCajaReporte(root) {
    leerRango(root);
    if (!rango.desde || !rango.hasta) { U.toast('Definí el rango de fechas', 'warn'); return; }
    var box = root.querySelector('#reporte-box');
    box.innerHTML = '<div class="center muted" style="padding:30px">Cargando…</div>';
    U.api('GET', '/reportes/caja?desde=' + rango.desde + '&hasta=' + rango.hasta).then(function (d) {
      var r = d.resumen;
      box.innerHTML =
        '<div class="grid cols-4 mb">' +
        '<div class="stat"><div class="k">Ingresos</div><div class="v">' + U.fmt(r.ingresos) + '</div></div>' +
        '<div class="stat"><div class="k">Ingresos manuales</div><div class="v">' + U.fmt(r.ingreso_manual) + '</div></div>' +
        '<div class="stat"><div class="k">Egresos</div><div class="v" style="color:var(--danger)">' + U.fmt(r.egresos) + '</div></div>' +
        '<div class="stat"><div class="k">Retiros</div><div class="v" style="color:var(--danger)">' + U.fmt(r.retiros) + '</div></div>' +
        '</div>' +
        '<div class="card"><h3>Movimientos de caja</h3>' +
        '<div class="table-wrap" style="max-height:380px;overflow:auto"><table><thead><tr><th>Fecha</th><th>Concepto</th><th>Tipo</th><th class="num">Monto</th><th class="num">Saldo</th></tr></thead><tbody>' +
        (d.movimientos || []).map(function (m) {
          var badge = m.tipo === 'VENTA' ? 'badge-ok' : m.tipo === 'EGRESO' || m.tipo === 'RETIRO' ? 'badge-danger' : 'badge-info';
          return '<tr><td>' + U.fechaHora(m.creado_en) + '</td><td>' + U.esc(m.concepto || m.tipo) + (m.numero ? ' <span class="badge badge-muted">' + U.esc(m.numero) + '</span>' : '') + '</td>' +
            '<td><span class="badge ' + badge + '">' + m.tipo + '</span></td><td class="num">' + U.fmt(m.monto) + '</td><td class="num">' + U.fmt(m.saldo) + '</td></tr>';
        }).join('') || U.tableEmpty(5, 'Sin movimientos') +
        '</tbody></table></div></div>' +
        '<div class="flex end mt"><button class="btn" data-act-excel="caja">⬇️ Exportar Excel</button></div>';
    }).catch(function (e) { box.innerHTML = '<div class="alert alert-error">' + U.esc(e.message) + '</div>'; });
  }

  App.page('reportes', {
    title: 'Reportes',

    html: function () {
      return '<div class="flex mb" style="align-items:end;gap:10px">' +
        '<label style="margin:0">Desde<input type="date" id="rp-desde" value="' + U.hace7dias() + '"></label>' +
        '<label style="margin:0">Hasta<input type="date" id="rp-hasta" value="' + U.hoy() + '"></label>' +
        '</div>' +
        '<div class="tabs" data-global-tabs>' +
        '<button data-tab="ventas" class="active">Ventas</button>' +
        '<button data-tab="ganancias">Ganancias</button>' +
        '<button data-tab="productos">Productos</button>' +
        '<button data-tab="mensual">Resumen mensual</button>' +
        '<button data-tab="caja">Caja</button>' +
        '</div>' +
        '<div id="rp-productos-tools" class="hidden flex mb">' +
        '<select id="pr-tipo" style="max-width:220px"><option value="mas">Más vendidos</option><option value="menos">Menos vendidos</option><option value="sinmov">Sin movimiento</option><option value="bajo">Stock bajo</option></select>' +
        '<button class="btn btn-primary" id="pr-ok">Ver</button>' +
        '</div>' +
        '<div id="rm-tools" class="hidden flex mb">' +
        '<select id="rm-anio" style="max-width:140px"></select>' +
        '<button class="btn btn-primary" id="rm-ok">Ver</button>' +
        '</div>' +
        '<div id="reporte-box"><div class="center muted" style="padding:40px">Seleccioná un reporte.</div></div>';
    },

    mounted: function (root) {
      var anioSel = root.querySelector('#rm-anio');
      var a = new Date().getFullYear();
      for (var i = a; i >= a - 3; i--) anioSel.innerHTML += '<option value="' + i + '">' + i + '</option>';
      cargarVentas(root);
    },

    hooks: {
      'click [data-tab]': function (e, t) {
        var tabs = t.closest('[data-global-tabs]');
        U.$$('[data-tab]', tabs).forEach(function (b) { b.classList.toggle('active', b === t); });
        var tab = t.getAttribute('data-tab');
        var root = document.getElementById('view');
        root.querySelector('#rp-productos-tools').classList.toggle('hidden', tab !== 'productos');
        root.querySelector('#rm-tools').classList.toggle('hidden', tab !== 'mensual');
        if (tab === 'ventas') cargarVentas(root);
        else if (tab === 'ganancias') cargarGanancias(root);
        else if (tab === 'productos') cargarProductosReporte(root);
        else if (tab === 'mensual') cargarResumenMensual(root);
        else if (tab === 'caja') cargarCajaReporte(root);
      },
      'click #rp-ok': function () { cargarVentas(document.getElementById('view')); },
      'click #pr-ok': function () { cargarProductosReporte(document.getElementById('view')); },
      'click #rm-ok': function () { cargarResumenMensual(document.getElementById('view')); },
      'click [data-act-excel]': function (e, t) {
        var tipo = t.getAttribute('data-act-excel');
        if (tipo === 'ventas') exportarDirecto('ventas', { desde: rango.desde, hasta: rango.hasta });
        else if (tipo === 'caja') exportarDirecto('caja', { desde: rango.desde, hasta: rango.hasta });
        else exportarDirecto('resumen', { anio: t.getAttribute('data-anio') });
      }
    }
  });

  function exportarDirecto(tipo, extra) {
    fetch('/api/excel/exportar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.assign({ tipo: tipo }, extra))
    }).then(function (res) {
      if (!res.ok) return res.json().then(function (d) { throw new Error(d.error || 'Error'); });
      return res.blob();
    }).then(function (blob) { U.downloadBlob(blob, tipo + '.xlsx'); })
      .catch(function (e) { U.toast(e.message, 'error'); });
  }
})();