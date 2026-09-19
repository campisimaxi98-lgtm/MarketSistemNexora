(function () {
  'use strict';

  var state = null;

  function reset() {
    state = {
      cart: [],
      metodos: [],
      metSel: null,
      recibido: null,
      teclado: { buf: '', t: null },
      sugerencias: [],
      selSug: -1,
      usableStock: true
    };
  }
  reset();

  function addProducto(p, qty) {
    qty = qty || 1;
    var exist = state.cart.find(function (i) { return i.id_producto === p.id; });
    var nuevoCant = qty;
    if (exist) nuevoCant = Math.round((exist.cantidad + qty) * 100) / 100;
    var maxStock = p.stock && p.stock > 0 ? p.stock : Number.MAX_SAFE_INTEGER;
    if (state.usableStock && nuevoCant > p.stock + 0.0001) {
      U.toast('Stock insuficiente de ' + p.nombre + ' (stock: ' + U.fmtQty(p.stock) + ')', 'warn');
      nuevoCant = p.stock;
    }
    if (exist) {
      exist.cantidad = nuevoCant;
    } else {
      state.cart.push({
        id_producto: p.id, nombre: p.nombre, codigo: p.codigo_barras || p.codigo_interno || p.codigo_qr || '',
        precio_unitario: p.precio_venta, cantidad: nuevoCant, maxStock: maxStock
      });
    }
    reRenderCarrito();
    reRenderPagos();
    focusBuscar();
  }

  function totalCarrito() {
    return Math.round(state.cart.reduce(function (a, i) { return a + i.precio_unitario * i.cantidad; }, 0) * 100) / 100;
  }

  function recibidoActual() {
    return state.recibido === null || isNaN(Number(state.recibido)) ? totalCarrito() : Number(state.recibido);
  }

  function reRenderCarrito() {
    var root = document.getElementById('pos-cart-body');
    if (!root) return;
    if (!state.cart.length) {
      root.innerHTML = '<div class="center muted" style="padding:30px">El carrito está vacío.<br>Escaneá un código o buscá un producto.</div>';
    } else {
      root.innerHTML = state.cart.map(function (i) {
        return '<div class="pos-cart-item" data-id="' + i.id_producto + '">' +
          '<div class="nm">' + U.esc(i.nombre) +
          '<small>' + U.esc(i.codigo || '') + '</small></div>' +
          '<span style="white-space:nowrap">' + U.fmt(i.precio_unitario) + '</span>' +
          '<input type="number" min="0.01" step="0.01" data-act-cant value="' + i.cantidad + '" style="width:70px">' +
          '<strong style="white-space:nowrap;min-width:84px;text-align:right">' + U.fmt(i.precio_unitario * i.cantidad) + '</strong>' +
          '<button class="btn btn-danger btn-sm" data-act-del title="Quitar">✕</button>' +
          '</div>';
      }).join('');
    }
    var total = totalCarrito();
    document.getElementById('pos-total').textContent = U.fmt(total);
    document.getElementById('pos-count').textContent = state.cart.length + ' ítem(s)';
    var btn = document.getElementById('btn-cobrar');
    if (btn) btn.disabled = state.cart.length === 0;
  }

  function actualizarPendiente() {
    var total = totalCarrito();
    var rec = recibidoActual();
    var pend = document.getElementById('pos-pendiente');
    if (pend) pend.textContent = U.fmt(Math.max(0, Math.round((total - rec) * 100) / 100));
    var vuelto = document.getElementById('pos-vuelto');
    if (vuelto) {
      vuelto.textContent = rec - total > 0.005 ? 'Vuelto: ' + U.fmt(Math.round((rec - total) * 100) / 100)
        : (Math.abs(rec - total) <= 0.005 ? 'Pago exacto' : 'Falta: ' + U.fmt(Math.round((total - rec) * 100) / 100));
      vuelto.classList.toggle('ok', rec - total > 0.005 || Math.abs(rec - total) <= 0.005);
    }
    var btn = document.getElementById('btn-cobrar');
    if (btn) {
      btn.disabled = !(state.cart.length > 0 && rec + 0.005 >= total);
      btn.textContent = '💵 Cobrar ' + U.fmt(total);
    }
  }

  function reRenderPagos(force) {
    var host = document.getElementById('pos-pagos');
    if (!host) return;
    if (!state.metodos.length) {
      host.innerHTML = '<p class="muted">No hay métodos de pago activos.</p>';
      return;
    }
    if (!state.metodos.some(function (m) { return m.id === state.metSel; })) {
      state.metSel = (state.metodos.find(function (m) { return /efectiv/i.test(m.nombre); }) || state.metodos[0]).id;
    }
    var sel = state.metodos.find(function (m) { return m.id === state.metSel; });
    var total = totalCarrito();
    host.innerHTML =
      '<div class="metodos-pago" role="radiogroup" aria-label="Método de pago">' +
      state.metodos.map(function (m) {
        var act = m.id === state.metSel;
        return '<div class="mp-item' + (act ? ' active' : '') + '" data-act-met="' + m.id + '" role="radio" aria-checked="' + act + '" tabindex="0">' +
          '<span class="mp-radio">' + (act ? '◉' : '○') + '</span>' + U.esc(m.nombre) + '</div>';
      }).join('') +
      '</div>' +
      '<div id="pos-pagos-det">' +
      '<div class="pos-resumen">' +
      '<span>Método: <strong>' + U.esc(sel ? sel.nombre : '') + '</strong></span>' +
      '<span style="display:inline-flex;align-items:center;gap:8px">' +
      '<label style="margin:0;font-size:12px">Monto recibido<input type="number" min="0" step="0.01" data-act-recibido value="' + (Math.max(0, recibidoActual())).toFixed(2) + '" style="width:110px"></label>' +
      '</span>' +
      '</div>' +
      '<div class="pos-vuelto" id="pos-vuelto"></div>' +
      '<p class="right">Falta cobrar (pendiente): <strong id="pos-pendiente"></strong></p>' +
      '</div>';
    actualizarPendiente();
    var recInput = host.querySelector('[data-act-recibido]');
    if (recInput) recInput.disabled = state.cart.length === 0;
  }

  function focusBuscar() {
    var el = document.getElementById('pos-buscar');
    if (el) el.focus();
  }

  function cerrarSugerencias() {
    var s = document.getElementById('pos-suggest');
    if (s) s.remove();
    state.sugerencias = [];
  }

  function mostrarSugerencias(items) {
    state.sugerencias = items;
    state.selSug = -1;
    var box = document.getElementById('pos-search');
    var ant = document.getElementById('pos-suggest');
    if (ant) ant.remove();
    if (!items.length) return;
    var div = document.createElement('div');
    div.className = 'pos-suggest';
    div.id = 'pos-suggest';
    div.innerHTML = items.map(function (it, k) {
      return '<div class="opt" data-sug="' + k + '"><span>' + U.esc(it.label) +
        '<span class="small" style="display:block">' + U.esc(it.p.categoria || '') + ' · stock ' + U.fmtQty(it.p.stock) + '</span></span>' +
        '<span class="small">' + U.fmt(it.p.precio_venta) + '</span></div>';
    }).join('');
    box.appendChild(div);
  }

  function buscarCodigo(codigo) {
    codigo = String(codigo || '').trim();
    if (!codigo) return;
    U.api('POST', '/productos/buscar', { codigo: codigo }).then(function (r) {
      if (r.producto) {
        addProducto(r.producto, 1);
        U.$('#pos-buscar').value = '';
        cerrarSugerencias();
      } else {
        U.toast('No se encontró el código ' + codigo, 'warn');
        U.$('#pos-buscar').value = '';
        cerrarSugerencias();
      }
    }).catch(function (e) { U.toast(e.message, 'error'); });
  }

  function addSug(idx) {
    var it = state.sugerencias[idx];
    if (!it) return;
    addProducto(it.p, 1);
    U.$('#pos-buscar').value = '';
    cerrarSugerencias();
  }

  function teclaScanner(e) {
    var t = document.activeElement;
    if (t && t.tagName && /^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName)) return;
    var enConfirmacion = !document.getElementById('pos-buscar');
    if (enConfirmacion) {
      if (/^[0-9A-Za-z#\-]$/.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) {
        state.teclado.buf += e.key;
      }
      if (e.key === 'Enter' || state.teclado.buf.length >= 3) {
        state.teclado.buf = '';
        clearTimeout(state.teclado.t);
        App.routeChange();
      }
      return;
    }
    if (e.key === 'Enter') {
      var b = state.teclado.buf;
      state.teclado.buf = '';
      if (b.length >= 3) buscarCodigo(b);
      return;
    }
    if (/^[0-9A-Za-z#\-]$/.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) {
      state.teclado.buf += e.key;
      clearTimeout(state.teclado.t);
      state.teclado.t = setTimeout(function () {
        var b = state.teclado.buf;
        state.teclado.buf = '';
        if (b.length >= 3) buscarCodigo(b);
      }, 400);
    }
  }

  function cobrar() {
    var items = state.cart.map(function (i) {
      return { id_producto: i.id_producto, cantidad: i.cantidad };
    });
    var total = totalCarrito();
    var sel = state.metodos.find(function (m) { return m.id === state.metSel; });
    if (!sel) { U.toast('Seleccioná un método de pago', 'warn'); return; }
    var rec = recibidoActual();
    if (rec + 0.005 < total) { U.toast('Falta dinero para completar el cobro', 'warn'); return; }
    var pagos = [{ id_metodo_pago: sel.id, monto: total }];
    U.api('POST', '/ventas', { items: items, pagos: pagos }).then(function (r) {
      U.toast('Venta ' + r.numero + ' registrada', 'ok');
      var root = document.getElementById('view');
      var vuelto = Math.round((rec - total) * 100) / 100;
      root.innerHTML =
        '<div class="card" style="max-width:520px;margin:20px auto;text-align:center">' +
        '<div style="font-size:46px">✅</div>' +
        '<h2>Venta registrada</h2>' +
        '<p>N° <strong>' + U.esc(r.numero) + '</strong></p>' +
        (sel.nombre !== 'Efectivo' ? '<p>Se cobró con <strong>' + U.esc(sel.nombre) + '</strong></p>' : '') +
        '<p class="v" style="font-size:26px;font-weight:700">' + U.fmt(r.total) + '</p>' +
        (vuelto > 0.005 ? '<p>Vuelto: <strong>' + U.fmt(vuelto) + '</strong></p>' : '') +
        '<div class="flex center mt" style="justify-content:center">' +
        '<a class="btn btn-primary" target="_blank" href="/api/tickets/' + r.id + '/pdf">🧾 Imprimir ticket</a>' +
        '<button class="btn btn-ghost" data-act-nueva>Nueva venta</button>' +
        '</div></div>';
      document.getElementById('page-title').textContent = 'Venta confirmada';
      state = null; reset();
    }).catch(function (e) { U.toast(e.message, 'error'); });
  }

  App.page('pos', {
    title: 'Punto de venta',

    html: function () {
      return [
        '<div class="pos-cols">',
        '<div class="card">',
        '<div class="pos-search" id="pos-search">',
        '<input id="pos-buscar" placeholder="Buscá o escaneá un código…" autocomplete="off">',
        '</div>',
        '<div class="card mt" id="pos-cart"><h3>Carrito <span class="muted" id="pos-count">0 ítem(s)</span></h3><div id="pos-cart-body"><div class="center muted" style="padding:30px">El carrito está vacío.<br>Escaneá un código o buscá un producto.</div></div>',
        '<div class="pos-total"><span>Total</span><span id="pos-total">' + U.fmt(0) + '</span></div></div>',
        '</div>',
        '<div class="card" id="pos-panel">',
        '<h3>Cobro</h3>',
        '<div id="pos-pagos" class="mb"></div>',
        '<button class="btn btn-primary btn-block" id="btn-cobrar" disabled style="padding:12px;font-size:16px">💵 Cobrar ' + U.fmt(0) + '</button>',
        '</div>',
        '</div>'
      ].join('');
    },

    mounted: async function (root) {
      reset();
      try {
        var conf = await U.api('GET', '/config');
        state.metodos = (conf.metodos_pago || []).filter(function (m) { return m.activo; });
        state.usableStock = String(conf.usar_stock || '1') !== '0';
        var defaultMet = state.metodos.find(function (m) { return /efectiv/i.test(m.nombre); }) || state.metodos[0];
        state.metSel = defaultMet ? defaultMet.id : null;
      } catch (e) {
        state.metodos = [{ id: 1, nombre: 'Efectivo' }];
        state.metSel = 1;
      }
      reRenderCarrito();
      reRenderPagos(true);
      var input = root.querySelector('#pos-buscar');
      input.addEventListener('input', U.debounce(function () {
        var q = input.value.trim();
        if (q.length < 1) { cerrarSugerencias(); return; }
        U.api('GET', '/productos/sugerencias?q=' + encodeURIComponent(q)).then(function (items) {
          mostrarSugerencias(items);
          if (!items.length) cerrarSugerencias();
        }).catch(function () {});
      }, 260));
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          var q = input.value.trim();
          if (q) {
            if (/^\d+$/.test(q)) buscarCodigo(q);
            else if (state.sugerencias.length) addSug(0);
            else buscarCodigo(q);
          }
        } else if (e.key === 'ArrowDown' && state.sugerencias.length) {
          e.preventDefault();
          state.selSug = Math.min(state.selSug + 1, state.sugerencias.length - 1);
          resaltarSug();
        } else if (e.key === 'ArrowUp' && state.sugerencias.length) {
          e.preventDefault();
          state.selSug = Math.max(state.selSug - 1, 0);
          resaltarSug();
        }
      });
      window.addEventListener('keydown', teclaScanner);
      focusBuscar();
    },

    dispose: function () {
      window.removeEventListener('keydown', teclaScanner);
      clearTimeout(state.teclado.t);
    },

    hooks: {
      'click [data-sug]': function (e, t) {
        addSug(Number(t.getAttribute('data-sug')));
      },
      'click [data-act-del]': function (e, t) {
        var id = Number(t.closest('.pos-cart-item').getAttribute('data-id'));
        state.cart = state.cart.filter(function (i) { return i.id_producto !== id; });
        reRenderCarrito();
        reRenderPagos();
      },
      'input [data-act-cant]': function (e, t) {
        var id = Number(t.closest('.pos-cart-item').getAttribute('data-id'));
        var it = state.cart.find(function (i) { return i.id_producto === id; });
        var v = Number(t.value);
        if (!(v > 0)) { U.toast('Cantidad inválida', 'warn'); t.value = it.cantidad; return; }
        if (state.usableStock && v > it.maxStock + 0.0001) {
          U.toast('Stock insuficiente (máx ' + U.fmtQty(it.maxStock) + ')', 'warn');
          v = it.maxStock; t.value = v;
        }
        it.cantidad = v;
        reRenderCarrito();
        reRenderPagos();
      },
      'input [data-act-recibido]': function (e, t) {
        state.recibido = Number(t.value) || 0;
        actualizarPendiente();
      },
      'click [data-act-met]': function (e, t) {
        var mid = Number(t.getAttribute('data-act-met'));
        if (!state.metodos.some(function (m) { return m.id === mid; })) return;
        state.metSel = mid;
        state.recibido = null;
        reRenderPagos(true);
        focusBuscar();
      },
      'keydown [data-act-met]': function (e, t) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          t.click();
        }
      },
      'click #btn-cobrar': function () {
        cobrar();
      },
      'click [data-act-nueva]': function () {
        state = null; reset();
        App.routeChange();
      }
    }
  });

  function resaltarSug() {
    var opts = document.querySelectorAll('#pos-suggest .opt');
    opts.forEach(function (o, k) { o.classList.toggle('sel', k === state.selSug); });
  }
})();