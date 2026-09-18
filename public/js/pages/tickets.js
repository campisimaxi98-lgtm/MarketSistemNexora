(function () {
  'use strict';

  var filtro = { numero: '', desde: '', hasta: '' };

  function cargar() {
    var q = '?limite=100';
    if (filtro.numero) q += '&numero=' + encodeURIComponent(filtro.numero);
    if (filtro.desde) q += '&desde=' + filtro.desde;
    if (filtro.hasta) q += '&hasta=' + filtro.hasta;
    var tbody = document.querySelector('#ventas-body');
    U.api('GET', '/ventas' + q).then(function (rows) {
      tbody.innerHTML = rows.map(function (v) {
        var badge = v.estado === 'COMPLETADA' ? '<span class="badge badge-ok">Completada</span>' : '<span class="badge badge-danger">Anulada</span>';
        return '<tr>' +
          '<td>' + U.esc(v.numero) + '</td>' +
          '<td>' + U.fechaHora(v.creado_en) + '</td>' +
          '<td>' + U.esc(v.vendedor || '') + '</td>' +
          '<td class="num">' + U.fmt(v.total) + '</td>' +
          '<td>' + badge + '</td>' +
          '<td style="white-space:nowrap">' +
          '<button class="btn btn-sm" data-acc="ver" data-id="' + v.id + '">Ver</button> ' +
          '<a class="btn btn-sm" target="_blank" href="/api/tickets/' + v.id + '/pdf">🧾 PDF</a> ' +
          (v.estado === 'COMPLETADA' && App.user.rol === 'ADMIN' ? '<button class="btn btn-sm btn-danger" data-acc="anular" data-id="' + v.id + '">Anular</button>' : '') +
          '</td></tr>';
      }).join('') || U.tableEmpty(6, 'No hay ventas');
    }).catch(function (e) {
      tbody.innerHTML = U.tableEmpty(6, 'Error: ' + e.message);
    });
  }

  function verVenta(id) {
    U.api('GET', '/ventas/' + id).then(function (v) {
      var html = '<p>N° <strong>' + U.esc(v.numero) + '</strong> · ' + U.fechaHora(v.creado_en) + ' · ' + U.esc(v.vendedor || '') + '</p>' +
        '<div class="table-wrap"><table><thead><tr><th>Producto</th><th class="num">Cant.</th><th class="num">P. unit.</th><th class="num">Total</th></tr></thead><tbody>' +
        v.detalle.map(function (d) {
          return '<tr><td>' + U.esc(d.nombre) + '</td><td class="num">' + U.fmtQty(d.cantidad) + '</td><td class="num">' + U.fmt(d.precio_unitario) + '</td><td class="num">' + U.fmt(d.total) + '</td></tr>';
        }).join('') +
        '<tr class="totals"><td colspan="3">TOTAL</td><td class="num">' + U.fmt(v.total) + '</td></tr>' +
        '</tbody></table></div>' +
        '<p class="mt">Pagos: ' + (v.pagos || []).map(function (p) { return U.esc(p.metodo) + ' ' + U.fmt(p.monto); }).join(' • ') + '</p>' +
        (v.estado !== 'COMPLETADA' ? '<p class="alert alert-error">Venta anulada</p>' : '');
      U.modal({
        titulo: 'Venta ' + v.numero,
        lg: true,
        html: html,
        okText: 'Imprimir PDF',
        onOk: function () { window.open('/api/tickets/' + v.id + '/pdf', '_blank'); }
      });
    }).catch(function (e) { U.toast(e.message, 'error'); });
  }

  function anular(id) {
    U.confirmForm({
      titulo: 'Anular venta',
      msg: 'La venta se marcará como anulada y se restituirá el stock. Indicá el motivo:',
      input: { label: 'Motivo de anulación', placeholder: 'Error de cobro / devolución' },
      okText: 'Anular venta',
      danger: true,
      onOk: function (motivo) {
        if (!motivo.trim()) { U.toast('El motivo es obligatorio', 'warn'); return; }
        U.api('POST', '/ventas/' + id + '/anular', { motivo: motivo }).then(function () {
          U.toast('Venta anulada', 'ok');
          cargar();
        }).catch(function (e) { U.toast(e.message, 'error'); });
      }
    });
  }

  App.page('tickets', {
    title: 'Tickets y ventas',

    html: function () {
      return '<div class="toolbar">' +
        '<div><input id="tv-num" placeholder="N° de venta…" value="' + U.esc(filtro.numero) + '"></div>' +
        '<input type="date" id="tv-desde" value="' + filtro.desde + '">' +
        '<input type="date" id="tv-hasta" value="' + filtro.hasta + '">' +
        '<button class="btn btn-primary" id="tv-filtrar">Filtrar</button>' +
        '<button class="btn btn-ghost" id="tv-limpiar">Limpiar</button>' +
        '</div>' +
        '<div class="table-wrap"><table><thead><tr><th>N°</th><th>Fecha</th><th>Vendedor</th><th class="num">Total</th><th>Estado</th><th></th></tr></thead><tbody id="ventas-body"><tr><td colspan="6" class="center muted">Cargando…</td></tr></tbody></table></div>';
    },

    mounted: function () { cargar(); },

    hooks: {
      'click #tv-filtrar': function () {
        filtro.numero = U.$('#tv-num').value;
        filtro.desde = U.$('#tv-desde').value;
        filtro.hasta = U.$('#tv-hasta').value;
        cargar();
      },
      'click #tv-limpiar': function () {
        filtro = { numero: '', desde: '', hasta: '' };
        U.$('#tv-num').value = '';
        U.$('#tv-desde').value = '';
        U.$('#tv-hasta').value = '';
        cargar();
      },
      'input #tv-num': U.debounce(function () {
        filtro.numero = U.$('#tv-num').value;
        cargar();
      }, 400),
      'click [data-acc="ver"]': function (e, t) { verVenta(Number(t.getAttribute('data-id'))); },
      'click [data-acc="anular"]': function (e, t) { anular(Number(t.getAttribute('data-id'))); }
    }
  });
})();