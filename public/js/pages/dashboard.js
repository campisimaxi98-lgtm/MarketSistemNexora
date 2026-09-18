(function () {
  'use strict';

  function icon(v) { return v; }

  App.page('dashboard', {
    title: 'Dashboard',

    html: function () {
      return '<div id="dash-root">' + U.tableEmpty(1, 'Cargando datos…') + '</div>';
    },

    mounted: async function (root) {
      var data;
      try {
        data = await U.api('GET', '/reportes/dashboard');
      } catch (e) {
        root.innerHTML = '<div class="alert alert-error">' + U.esc(e.message) + '</div>';
        return;
      }
      U.moneda = data.moneda || U.moneda;
      document.getElementById('app-nombre').textContent = data.nombre_comercio || 'MarketSistemNexora';
      document.getElementById('login-nombre').textContent = data.nombre_comercio || 'MarketSistemNexora';

      var rh = data.resumen_hoy || {};
      var cajaHtml = data.caja_abierta
        ? '<span class="badge badge-ok">Caja abierta</span> <span class="right" style="font-size:18px;font-weight:700">' + U.fmt(data.saldo_caja) + '</span>'
        : '<span class="badge badge-danger">Caja cerrada</span>';

      var semana = data.ventas_7_dias || [];
      var carreras = (data.top_productos || []).map(function (p) { return { label: p.nombre, value: p.cantidad }; });
      var catGrid = (data.ventas_por_categoria || []).map(function (c) { return { label: c.categoria, value: c.total }; });

      root.innerHTML =
        '<div class="grid cols-4 mb">' +
          '<div class="stat"><div class="k">Ventas de hoy</div><div class="v">' + U.fmt(rh.total) + '</div><div class="d">' + U.fmtQty(rh.ventas) + ' ventas · ' + U.fmtQty(rh.unidades) + ' unidades</div></div>' +
          '<div class="stat"><div class="k">Ganancia de hoy</div><div class="v">' + U.fmt(rh.ganancia) + '</div><div class="d">Margen ' + U.fmtQty(rh.margen) + '%</div></div>' +
          '<div class="stat"><div class="k">Stock bajo</div><div class="v" style="color:' + (data.stock_bajo > 0 ? 'var(--warn)' : 'var(--ok)') + '">' + U.fmtQty(data.stock_bajo) + '</div><div class="d">Productos a reponer</div></div>' +
          '<div class="stat"><div class="k">Estado de caja</div><div class="v" style="font-size:16px;margin-top:8px">' + cajaHtml + '</div></div>' +
        '</div>' +
        '<div class="flex mb">' +
          '<button class="btn btn-primary" data-go="pos">' + icon('🛒') + ' Ir al Punto de venta</button>' +
          '<button class="btn" data-go="caja">' + icon('💰') + ' Abrir/cerrar caja</button>' +
          '<button class="btn" data-go="importar">' + icon('📥') + ' Importar Excel</button>' +
          '<button class="btn" data-go="reportes">' + icon('📈') + ' Ver reportes</button>' +
        '</div>' +
        '<div class="grid cols-2">' +
          '<div class="card"><h3>Ventas últimos 7 días</h3><div id="dash-line"></div></div>' +
          '<div class="card"><h3>Productos más vendidos hoy</h3><div id="dash-top"></div></div>' +
        '</div>' +
        '<div class="card mt"><h3>Ventas del mes por categoría</h3><div id="dash-cat"></div></div>';

      U.renderLine(root.querySelector('#dash-line'), semana.map(function (s) { return { label: s.dia, value: s.total }; }));
      root.querySelector('#dash-top').innerHTML = carreras.length
        ? '<div id="dash-top-bars">' + (function () {
            var total = carreras.reduce(function (a, b) { return a + b.value; }, 0) || 1;
            return carreras.map(function (c) {
              return '<div class="pos-resumen" style="padding:4px 0"><div>' + U.esc(c.label) + '</div><div class="pv" style="font-size:15px">' + U.fmtQty(c.value) + '</div></div>';
            }).join('');
          })() + '</div>'
        : U.tableEmpty(1, 'Todavía no hay ventas hoy');
      U.renderBarsHor(root.querySelector('#dash-cat'), catGrid);
      if (!catGrid.length) root.querySelector('#dash-cat').innerHTML = '<div class="muted">Sin ventas en el mes</div>';
    },

    hooks: {
      'click [data-go]': function (e, t) {
        location.hash = '#/' + t.getAttribute('data-go');
      }
    }
  });
})();