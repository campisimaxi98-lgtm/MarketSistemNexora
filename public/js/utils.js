(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.U = factory();
})(typeof window !== 'undefined' ? window : this, function () {
  'use strict';

  var U = {};

  U.$ = function (sel, ctx) { return (ctx || document).querySelector(sel); };
  U.$$ = function (sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); };

  U.esc = function (s) {
    if (s === null || s === undefined) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  };

  U.moneda = '$';

  U.fmt = function (v) {
    var n = Number(v) || 0;
    return U.moneda + n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  U.fmtQty = function (v) {
    var n = Number(v) || 0;
    return (Number.isInteger(n) ? n.toLocaleString('es-AR') : n.toLocaleString('es-AR', { maximumFractionDigits: 2 }));
  };

  U.fechaHora = function (s) {
    if (!s) return '';
    var p = String(s).split(' ');
    return p[0] + ' ' + (p[1] ? p[1].slice(0, 5) : '');
  };

  U.hoy = function () {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  };

  U.hace7dias = function () {
    var d = new Date(); d.setDate(d.getDate() - 6);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  };

  U.api = async function (method, url, body) {
    var opts = { method: method, headers: {} };
    if (body !== undefined) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
    var res = await fetch('/api' + url, opts);
    var data = null;
    var ct = res.headers.get('content-type') || '';
    if (ct.indexOf('application/json') > -1) {
      try { data = await res.json(); } catch (e) { data = null; }
    }
    if (!res.ok) {
      var msg = (data && data.error) || ('Error ' + res.status);
      var err = new Error(msg);
      err.status = res.status;
      throw err;
    }
    return data;
  };

  U.apiBlob = async function (url) {
    var res = await fetch('/api' + url);
    if (!res.ok) {
      var data = null;
      try { data = await res.json(); } catch (e) {}
      throw new Error((data && data.error) || ('Error ' + res.status));
    }
    return await res.blob();
  };

  U.downloadBlob = function (blob, filename) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 800);
  };

  U.downloadUrl = function (url, filename) {
    var a = document.createElement('a');
    a.href = '/api' + url;
    a.download = filename || '';
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  U.toast = function (msg, tipo) {
    var box = U.$('#toasts');
    var el = document.createElement('div');
    el.className = 'toast' + (tipo ? ' ' + tipo : '');
    el.textContent = msg;
    box.appendChild(el);
    setTimeout(function () { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; }, 2400);
    setTimeout(function () { el.remove(); }, 2800);
  };

  U.modal = function (opts) {
    var root = U.$('#modal-root');
    var dw = document.createElement('div');
    dw.className = 'modal' + (opts.lg ? ' modal-lg' : '');
    dw.innerHTML =
      '<div class="modal-head"><h3>' + U.esc(opts.titulo) + '</h3><button class="btn btn-ghost btn-sm" data-uclose>x</button></div>' +
      opts.html;
    if (opts.buttons !== false && !opts.noFooter) {
      var foot = document.createElement('div');
      foot.className = 'flex end mt';
      if (opts.okText !== undefined) {
        var ok = document.createElement('button');
        ok.className = 'btn btn-primary';
        ok.textContent = opts.okText || 'Aceptar';
        ok.addEventListener('click', function () {
          if (opts.onOk && opts.onOk(ok) === false) return;
          close();
        });
        foot.appendChild(ok);
      }
      foot.appendChild((function () {
        var c = document.createElement('button');
        c.className = 'btn btn-ghost';
        c.textContent = 'Cancelar';
        c.addEventListener('click', close);
        return c;
      })());
      dw.appendChild(foot);
    }
    function close() {
      root.classList.remove('open');
      root.innerHTML = '';
      if (opts.onClose) opts.onClose();
    }
    if (opts.dangerOk) {
      var okBtn = dw.querySelector('.btn-primary');
      if (okBtn) okBtn.classList.replace('btn-primary', 'btn-danger');
    }
    dw.addEventListener('click', function (e) {
      if (e.target && e.target.hasAttribute('data-uclose')) close();
    });
    root.innerHTML = '';
    root.appendChild(dw);
    root.classList.add('open');
    var first = dw.querySelector('input, select');
    if (first) setTimeout(function () { first.focus(); }, 30);
    return { el: dw, close: close };
  };

  U.confirm = function (msg, onOk, opts) {
    opts = opts || {};
    var html = '<div class="alert ' + (opts.danger ? 'alert-warn' : 'alert-info') + '">' + msg + '</div>';
    U.modal({
      titulo: opts.titulo || 'Confirmar',
      html: html,
      okText: opts.okText || 'Confirmar',
      dangerOk: !!opts.danger,
      onOk: function () { onOk(); }
    });
  };

  U.confirmForm = function (opts) {
    var html = '<div class="alert ' + (opts.danger ? 'alert-error' : 'alert-warn') + '">' + U.esc(opts.msg) + '</div>';
    if (opts.input) {
      html += '<label>' + U.esc(opts.input.label) + '<textarea id="cf-input" placeholder="' + U.esc(opts.input.placeholder || '') + '" rows="3"></textarea></label>';
    }
    return U.modal({
      titulo: opts.titulo,
      html: html,
      okText: opts.okText || 'Confirmar',
      dangerOk: !!opts.danger,
      onOk: function () {
        var valor = opts.input ? (U.$('#cf-input', this.el).value || '') : '';
        opts.onOk(valor);
      }
    });
  };

  U.bindHooks = function (rootEl, hooks) {
    if (!hooks || !hooks.events) return;
    Object.keys(hooks.events).forEach(function (key) {
      var parts = key.trim().split(/\s+/);
      var evt = parts[0];
      var sel = parts.slice(1).join(' ');
      rootEl.addEventListener(evt, function (e) {
        var t = e.target;
        while (t && t !== rootEl) {
          if (sel === '' || t.matches(sel)) { hooks.events[key](e, t); return; }
          t = t.parentElement;
        }
      });
    });
  };

  U.debounce = function (fn, ms) {
    var t = null;
    return function () {
      var args = arguments, self = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(self, args); }, ms || 300);
    };
  };

  U.renderBarsHor = function (el, items) {
    var max = 0;
    items.forEach(function (i) { if (i.value > max) max = i.value; });
    if (!max) max = 1;
    var html = items.map(function (i) {
      var pct = Math.round((i.value / max) * 100);
      return '<div class="bar-row" style="margin-bottom:8px">' +
        '<div style="display:flex;justify-content:space-between;font-size:12px"><span>' + U.esc(i.label) + '</span><span class="muted">' + U.fmtQty(i.value) + '</span></div>' +
        '<div style="background:#eff6ff;border-radius:6px;height:12px;margin-top:3px"><div class="bar" style="width:' + pct + '%;height:100%;background:' + (i.color || '#2563eb') + ';border-radius:6px"></div></div>' +
        '</div>';
    }).join('');
    el.innerHTML = html;
  };

  U.renderLine = function (el, items, opts) {
    opts = opts || {};
    var w = 640, h = 180, padL = 44, padB = 26, padT = 12;
    var max = 0;
    items.forEach(function (i) { if (i.value > max) max = i.value; });
    if (!max) max = 1;
    var n = Math.max(items.length, 2);
    var innerW = w - padL - 12, innerH = h - padT - padB;
    var x = function (i) { return padL + (innerW * i) / (n - 1); };
    var y = function (v) { return padT + innerH - (innerH * v) / max; };
    var pts = items.map(function (i, k) { return x(k) + ',' + y(i.value); }).join(' ');
    var area = padL + ',' + y(0) + ' ' + pts + ' ' + x(n - 1) + ',' + y(0);
    var svg = '<svg viewBox="0 0 ' + w + ' ' + h + '" class="chart" preserveAspectRatio="xMidYMid meet">' +
      '<polygon points="' + area + '" fill="#2563eb" opacity="0.10"/>' +
      '<polyline points="' + pts + '" fill="none" stroke="#2563eb" stroke-width="2.5"/>' +
      items.map(function (i, k) {
        return '<circle cx="' + x(k) + '" cy="' + y(i.value) + '" r="3.5" fill="#2563eb"/>' +
          '<text x="' + x(k) + '" y="' + (y(i.value) - 8) + '" text-anchor="middle" font-size="10" fill="#64748b">' + U.fmtQty(i.value) + '</text>';
      }).join('') +
      items.map(function (i, k) {
        return '<text x="' + x(k) + '" y="' + (h - 8) + '" text-anchor="middle" font-size="10" fill="#64748b">' + U.esc(U.shortDia(i.label)) + '</text>';
      }).join('') +
      '</svg>';
    el.innerHTML = svg;
  };

  U.shortDia = function (s) {
    var d = new Date(s + 'T00:00:00');
    if (isNaN(d)) return String(s).slice(0, 5);
    return ['do', 'lu', 'ma', 'mi', 'ju', 'vi', 'sa'][d.getDay()];
  };

  U.renderDonut = function (el, items) {
    var total = 0;
    items.forEach(function (i) { total += i.value; });
    if (total <= 0) { el.innerHTML = '<div class="muted">Sin datos</div>'; return; }
    var colors = ['#2563eb', '#16a34a', '#d97706', '#dc2626', '#7c3aed', '#0891b2', '#be185d'];
    var acc = 0;
    var stops = items.map(function (i, k) {
      var from = (acc / total) * 100;
      acc += i.value;
      var to = (acc / total) * 100;
      return (i.color || colors[k % colors.length]) + ' ' + from + '% ' + to + '%';
    });
    var inner = 62;
    var gradient = 'conic-gradient(' + stops.join(', ') + ')';
    el.innerHTML =
      '<div style="position:relative;width:150px;height:150px;margin:0 auto;border-radius:50%;background:' + gradient + '">' +
      '<div style="position:absolute;inset:22%;border-radius:50%;background:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:16px">' + U.fmt(total) + '</div></div>';
  };

  U.tableEmpty = function (cols, msg) {
    return '<tr><td colspan="' + cols + '" class="center muted" style="padding:26px">' + U.esc(msg || 'Sin datos') + '</td></tr>';
  };

  U.obj = function () { return {}; };

  return U;
});