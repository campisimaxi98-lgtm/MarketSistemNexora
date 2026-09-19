(function () {
  'use strict';

  function cargar(root) {
    U.api('GET', '/caja/estado').then(function (d) {
      pintarEstado(root, d);
      pintarHistorial(root);
    }).catch(function (e) {
      root.querySelector('#caja-body').innerHTML = '<div class="alert alert-error">' + U.esc(e.message) + '</div>';
    });
  }

  function pintarEstado(root, d) {
    var body = root.querySelector('#caja-body');
    var metodos = d.metodos || [];
    if (!d.detalle) {
      body.innerHTML =
        '<div class="card" style="max-width:420px">' +
        '<h3>La caja está cerrada</h3>' +
        '<label>Monto de apertura<input id="ap-monto" type="number" step="0.01" min="0" value="0"></label>' +
        '<button class="btn btn-primary btn-block mt" id="btn-apertura">Abrir caja</button>' +
        '</div>';
      return;
    }
    var det = d.detalle;
    var metMap = {};
    metodos.forEach(function (m) { metMap[m.id] = m.nombre; });
    body.innerHTML =
      '<div class="grid cols-3 mb">' +
      '<div class="stat"><div class="k">Ventas del día</div><div class="v">' + U.fmt(det.total_ventas) + '</div><div class="d">Apertura: ' + U.fmt(det.total_apertura) + '</div></div>' +
      '<div class="stat"><div class="k">Ingresos / egresos</div><div class="v">' + U.fmt(det.total_ingresos) + '</div><div class="d">Manual +' + U.fmt(det.total_ingresos) + ' · Egresos −' + U.fmt(det.total_egresos) + ' · Retiros −' + U.fmt(det.total_retiros) + '</div></div>' +
      '<div class="stat"><div class="k">Saldo actual</div><div class="v">' + U.fmt(det.saldo) + '</div><div class="d">Esperado: ' + U.fmt(det.esperado) + '</div></div>' +
      '</div>' +
      '<div class="card mb"><h3>Ventas por método de pago</h3><div id="caja-por-metodo"></div></div>' +
      '<div class="card mb"><h3>Movimientos</h3><div class="table-wrap" style="max-height:300px;overflow:auto"><table><thead><tr><th>Fecha</th><th>Concepto</th><th>Tipo</th><th class="num">Monto</th><th class="num">Saldo</th></tr></thead><tbody>' +
      (det.movimientos || []).map(function (m) {
        var badge = m.tipo === 'VENTA' ? 'badge-ok' : m.tipo === 'EGRESO' || m.tipo === 'RETIRO' ? 'badge-danger' : 'badge-info';
        var signo = m.tipo === 'EGRESO' || m.tipo === 'RETIRO' ? '−' : '+';
        return '<tr><td>' + U.fechaHora(m.creado_en) + '</td><td>' + U.esc(m.concepto || m.tipo) + (m.numero ? ' <span class="badge badge-muted">' + U.esc(m.numero) + '</span>' : '') + '</td>' +
          '<td><span class="badge ' + badge + '">' + m.tipo + '</span></td>' +
          '<td class="num">' + signo + U.fmt(m.monto) + '</td><td class="num">' + U.fmt(m.saldo) + '</td></tr>';
      }).join('') || U.tableEmpty(5, 'Sin movimientos') +
      '</tbody></table></div></div>' +
      '<div class="flex end gap" style="gap:10px">' +
      '<button class="btn btn-mov" data-tipo="INGRESO">+ Ingreso</button>' +
      '<button class="btn btn-mov" data-tipo="EGRESO">− Egreso</button>' +
      '<button class="btn" data-tipo="RETIRO" data-act-retiro>Retirar</button>' +
      '<button class="btn btn-danger" id="btn-cierre">Cerrar caja</button>' +
      '</div>';
    U.renderBarsHor(root.querySelector('#caja-por-metodo'), Object.keys(det.por_metodo || {}).map(function (k) {
      return { label: metMap[Number(k)] || ('Método ' + k), value: det.por_metodo[k] };
    }));
  }

  function pintarHistorial(root) {
    U.api('GET', '/caja/historial').then(function (rows) {
      var td = root.querySelector('#historial-body');
      td.innerHTML = rows.map(function (c) {
        return '<tr><td>#' + c.id + '</td><td class="num">' + U.fmt(c.monto_apertura) + '</td>' +
          '<td class="num">' + U.fmt(c.total_ventas || 0) + '</td>' +
          '<td class="num">' + (c.monto_cierre !== null ? U.fmt(c.monto_cierre) : '—') + '</td>' +
          '<td class="num" style="color:' + ((c.diferencia || 0) === 0 ? 'var(--ok)' : ((c.diferencia || 0) < 0 ? 'var(--danger)' : 'var(--warn)')) + '">' + (c.diferencia !== null ? U.fmt(c.diferencia) : '—') + '</td>' +
          '<td>' + U.fechaHora(c.abierta_en) + '</td><td>' + U.fechaHora(c.cerrada_en || '') + '</td>' +
          '<td>' + U.esc(c.abrio || '') + (c.cerro ? ' → ' + U.esc(c.cerro) : '') + '</td></tr>';
      }).join('') || U.tableEmpty(8, 'Sin cajas registradas');
    }).catch(function () {});
  }

  function modalMovimiento(tipo, nombre, metodos) {
    var esEgreso = tipo === 'EGRESO' || tipo === 'RETIRO';
    var m = U.modal({
      titulo: (esEgreso ? 'Registrar egreso' : 'Registrar ingreso'),
      html: '<label>Concepto<input id="mov-con" value="' + (tipo === 'INGRESO' ? 'Ingreso manual' : tipo === 'EGRESO' ? 'Gasto' : 'Retiro de caja') + '"></label>' +
        '<label>Método<select id="mov-met">' + metodos.map(function (x) { return '<option value="' + x.id + '">' + U.esc(x.nombre) + '</option>'; }).join('') + '</select></label>' +
        '<label>Monto<input id="mov-monto" type="number" step="0.01" min="0.01"></label>',
      okText: 'Registrar',
      onOk: function () {
        var body = {
          concepto: m.el.querySelector('#mov-con').value,
          id_metodo_pago: Number(m.el.querySelector('#mov-met').value),
          monto: m.el.querySelector('#mov-monto').value
        };
        U.api('POST', '/caja/' + (tipo === 'INGRESO' ? 'ingreso' : tipo === 'EGRESO' ? 'egreso' : 'retiro'), body).then(function () {
          U.toast((esEgreso ? 'Egreso' : 'Ingreso') + ' registrado', 'ok');
          m.close();
          cargar(document.getElementById('view'));
        }).catch(function (e) { U.toast(e.message, 'error'); return false; });
        return false;
      }
    });
  }

  App.page('caja', {
    title: 'Caja',

    html: function () {
      return '<div id="caja-body"><div class="center muted" style="padding:40px">Cargando…</div></div>' +
        '<div class="card mt"><h3>Historial de cajas</h3>' +
        '<div class="table-wrap"><table><thead><tr><th>Caja</th><th class="num">Apertura</th><th class="num">Ventas</th><th class="num">Cierre</th><th class="num">Diferencia</th><th>Abierta</th><th>Cerrada</th><th>Responsables</th></tr></thead><tbody id="historial-body"><tr><td colspan="8" class="center muted">Cargando…</td></tr></tbody></table></div></div>';
    },

    mounted: function (root) {
      cargar(root);
    },

    hooks: {
      'click #btn-apertura': function () {
        U.api('POST', '/caja/apertura', { monto: U.$('#ap-monto').value }).then(function () {
          U.toast('Caja abierta', 'ok');
          cargar(document.getElementById('view'));
        }).catch(function (e) { U.toast(e.message, 'error'); });
      },
      'click .btn-mov': function (e, t) {
        var tipo = t.getAttribute('data-tipo');
        U.api('GET', '/caja/estado').then(function (d) { modalMovimiento(tipo, '', d.metodos || []); });
      },
      'click [data-act-retiro]': function (e, t) {
        U.api('GET', '/caja/estado').then(function (d) { modalMovimiento('RETIRO', '', d.metodos || []); });
      },
      'click #btn-cierre': function () {
        U.api('GET', '/caja/estado').then(function (d) {
          if (!d.detalle) return;
          var esperado = d.detalle.esperado;
          U.modal({
            titulo: 'Cierre de caja',
            html: '<div class="alert alert-info">Saldo esperado: <strong>' + U.fmt(esperado) + '</strong><br>Contá el dinero real de la caja e ingresalo abajo.</div>' +
              '<label>Monto real<input id="cierre-real" type="number" step="0.01" min="0" value="' + esperado + '"></label>',
            okText: 'Cerrar caja',
            dangerOk: true,
            onOk: function (btn) {
              var montoReal = Number(U.$('#cierre-real', btn.closest('.modal')).value);
              U.api('POST', '/caja/cierre', { monto_real: montoReal }).then(function (r) {
                var dif = r.cierre.diferencia;
                U.toast('Caja cerrada. Diferencia: ' + U.fmt(dif), dif === 0 ? 'ok' : 'warn');
                cargar(document.getElementById('view'));
              }).catch(function (e) { U.toast(e.message, 'error'); return false; });
              return false;
            }
          });
        });
      }
    }
  });
})();