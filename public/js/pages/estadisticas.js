(function () {
  'use strict';

  var filtro = { desde: '', hasta: '', key: 'hoy', msg: '' };

  function dstr(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function rangoPara(key) {
    var now = new Date();
    var from;
    switch (key) {
      case 'hoy': return { desde: dstr(now), hasta: dstr(now) };
      case '7d':
        from = new Date(); from.setDate(from.getDate() - 6);
        return { desde: dstr(from), hasta: dstr(now) };
      case 'mes':
        return { desde: dstr(new Date(now.getFullYear(), now.getMonth(), 1)), hasta: dstr(now) };
      case 'mesant': {
        var y = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
        var m = now.getMonth() === 0 ? 0 : now.getMonth() - 1;
        return { desde: dstr(new Date(y, m, 1)), hasta: dstr(new Date(y, m + 1, 0)) };
      }
      case 'anio':
        return { desde: now.getFullYear() + '-01-01', hasta: dstr(now) };
      default:
        return null;
    }
  }

  function etiquetaRango() {
    var op = { hoy: 'Hoy', '7d': 'Últimos 7 días', mes: 'Este mes', mesant: 'Mes anterior', anio: 'Este año', rango: 'Rango personalizado' };
    return op[filtro.key] || '';
  }

  function kpi(titulo, valor, det) {
    return '<div class="stat"><div class="k">' + U.esc(titulo) + '</div><div class="v">' + valor + '</div>' + (det ? '<div class="d">' + det + '</div>' : '') + '</div>';
  }

  function cargar() {
    if (!filtro.desde || !filtro.hasta) return;
    var root = document.getElementById('view');
    U.api('GET', '/reportes/estadisticas?desde=' + filtro.desde + '&hasta=' + filtro.hasta).then(function (d) {
      if (!document.getElementById('st-kpis')) return;
      var r = d.resumen || {};
      var metodos = d.por_metodo || [];
      var ef = metodos.find(function (m) { return /efectiv/i.test(m.metodo); });
      var efTotal = ef ? ef.total : 0;
      var otros = metodos.reduce(function (a, m) { return a + (ef && m.metodo === ef.metodo ? 0 : m.total); }, 0);
      var perdida = d.flujo ? d.flujo.perdida : 0;

      document.getElementById('st-titulo').textContent = etiquetaRango() +
        ' · ' + filtro.desde + (filtro.desde !== filtro.hasta ? ' → ' + filtro.hasta : '');

      document.getElementById('st-kpis').innerHTML =
        kpi('Ventas totales', U.fmt(r.total), U.fmtQty(r.ventas) + ' ventas · ' + U.fmtQty(r.unidades) + ' unidades') +
        kpi('Ganancias', U.fmt(r.ganancia), 'Margen ' + U.fmtQty(r.margen) + '%') +
        kpi('Ticket promedio', U.fmt(r.ticket_promedio), 'Por venta') +
        kpi('N° de ventas', U.fmtQty(r.ventas), U.fmtQty(r.unidades) + ' unidades vendidas') +
        kpi('Efectivo recibido', U.fmt(efTotal), metodos.length ? 'Sobre ' + U.fmt(metodos.reduce(function (a, m) { return a + m.total; }, 0)) : '') +
        kpi('Otros métodos', U.fmt(otros), perdida > 0 ? 'Gastos: −' + U.fmt(perdida) : 'Sin gastos');

      var dias = d.diario || [];
      U.renderLine(document.getElementById('st-line-ventas'), dias.map(function (x) { return { label: x.dia, value: x.total }; }));
      U.renderLine(document.getElementById('st-line-gan'), dias.map(function (x) { return { label: x.dia, value: x.ganancia }; }), { color: '#34d399' });
      U.renderMultiLine(document.getElementById('st-igs'), dias.map(function (x) { return x.dia; }), [
        { name: 'Ingresos (ventas)', color: '#34d399', data: dias.map(function (x) { return x.total; }) },
        { name: 'Gastos / retiros', color: '#f87171', data: dias.map(function (x) { return x.egresos; }) }
      ]);
      U.renderDonut(document.getElementById('st-donut'), metodos.map(function (m) { return { label: m.metodo, value: m.total }; }));
      U.renderBarsVert(document.getElementById('st-top'), (d.top_productos || []).map(function (p) { return { label: p.nombre, value: p.cantidad }; }), { short: false, legend: [{ color: 'var(--accent)', label: 'Cantidad vendida' }] });
      U.renderBarsVert(document.getElementById('st-menos'), (d.menos_productos || []).map(function (p) { return { label: p.nombre, value: p.cantidad }; }), { short: false, legend: [{ color: '#8b9bb4', label: 'Cantidad vendida' }] });
      U.renderBarsVert(document.getElementById('st-dias'), (d.dias_top || []).map(function (x) { return { label: x.dia, value: x.total }; }), { short: true, legend: [{ color: 'var(--accent)', label: 'Ventas del día' }] });
    }).catch(function (e) {
      document.getElementById('st-kpis').innerHTML = '<div class="alert alert-error">' + U.esc(e.message) + '</div>';
    });
  }

  App.page('estadisticas', {
    title: 'Estadísticas',

    html: function () {
      return '<div class="toolbar">' +
        '<div class="chips" id="st-chips">' +
        ['hoy|Hoy', '7d|Últimos 7 días', 'mes|Este mes', 'mesant|Mes anterior', 'anio|Este año', 'rango|Rango personalizado'].map(function (c) {
          var k = c.split('|')[0], l = c.split('|')[1];
          return '<button class="chip' + (filtro.key === k ? ' active' : '') + '" data-rango="' + k + '">' + l + '</button>';
        }).join('') +
        '</div>' +
        '<span class="rango-custom hidden" id="rango-custom">' +
        '<input type="date" id="rc-desde" value="' + filtro.desde + '"><span>→</span><input type="date" id="rc-hasta" value="' + filtro.hasta + '">' +
        '<button class="btn btn-sm btn-primary" id="rc-aplicar">Aplicar</button>' +
        '</span>' +
        '</div>' +
        '<p class="muted" id="st-titulo"></p>' +
        '<div class="grid cols-3 mb" id="st-kpis"></div>' +
        '<div class="grid cols-2 mb">' +
        '<div class="card"><h3>Evolución de ventas</h3><div id="st-line-ventas"></div></div>' +
        '<div class="card"><h3>Evolución de ganancias</h3><div id="st-line-gan"></div></div>' +
        '</div>' +
        '<div class="grid cols-2 mb">' +
        '<div class="card"><h3>Ingresos vs gastos</h3><div id="st-igs"></div></div>' +
        '<div class="card"><h3>Ventas por método de pago</h3><div id="st-donut"></div></div>' +
        '</div>' +
        '<div class="grid cols-2 mb">' +
        '<div class="card"><h3>Más vendidos</h3><div style="min-height:190px" id="st-top"></div></div>' +
        '<div class="card"><h3>Menos vendidos</h3><div style="min-height:190px" id="st-menos"></div></div>' +
        '</div>' +
        '<div class="card"><h3>Días con más ventas</h3><div style="min-height:170px" id="st-dias"></div></div>';
    },

    mounted: function (root) {
      if (!filtro.desde || !filtro.hasta) {
        var r = rangoPara('7d');
        filtro.desde = r.desde; filtro.hasta = r.hasta; filtro.key = '7d';
      }
      root.querySelector('#rc-desde').value = filtro.desde;
      root.querySelector('#rc-hasta').value = filtro.hasta;
      cargar();
    },

    hooks: {
      'click [data-rango]': function (e, t) {
        var key = t.getAttribute('data-rango');
        filtro.key = key;
        U.$$('[data-rango]', document.getElementById('st-chips')).forEach(function (b) { b.classList.toggle('active', b === t); });
        var custom = document.getElementById('rango-custom');
        custom.classList.toggle('hidden', key !== 'rango');
        if (key === 'rango') return;
        var r = rangoPara(key);
        filtro.desde = r.desde; filtro.hasta = r.hasta;
        document.getElementById('rc-desde').value = filtro.desde;
        document.getElementById('rc-hasta').value = filtro.hasta;
        cargar();
      },
      'click #rc-aplicar': function () {
        var d1 = document.getElementById('rc-desde').value;
        var d2 = document.getElementById('rc-hasta').value;
        if (!d1 || !d2) { U.toast('Elegí las fechas desde y hasta', 'warn'); return; }
        if (d1 > d2) { U.toast('La fecha "desde" no puede ser mayor a "hasta"', 'warn'); return; }
        filtro.desde = d1; filtro.hasta = d2;
        cargar();
      }
    }
  });
})();