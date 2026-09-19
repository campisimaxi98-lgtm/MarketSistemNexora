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
    if (!hooks) return;
    var map = hooks.events || hooks;
    Object.keys(map).forEach(function (key) {
      var parts = key.trim().split(/\s+/);
      var evt = parts[0];
      var sel = parts.slice(1).join(' ');
      rootEl.addEventListener(evt, function (e) {
        var t = e.target;
        while (t && t !== rootEl) {
          if (sel === '' || (t.matches && t.matches(sel))) { map[key](e, t); return; }
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

  U.chartEmpty = function (el, msg) {
    el.innerHTML = '<div class="chart-empty">' + U.esc(msg || 'No hay suficientes datos para generar esta gráfica.') + '</div>';
  };

  U.renderBarsHor = function (el, items) {
    if (!items || !items.length) return U.chartEmpty(el);
    var max = 0;
    items.forEach(function (i) { if (i.value > max) max = i.value; });
    if (!max) return U.chartEmpty(el);
    var html = items.map(function (i) {
      var pct = Math.round((i.value / max) * 100);
      return '<div class="bar-row" style="margin-bottom:8px">' +
        '<div style="display:flex;justify-content:space-between;font-size:12px"><span>' + U.esc(i.label) + '</span><span class="muted">' + U.fmtQty(i.value) + '</span></div>' +
        '<div class="bar-track"><div class="bar" style="width:' + pct + '%;background:' + (i.color || 'var(--accent)') + '"></div></div>' +
        '</div>';
    }).join('');
    el.innerHTML = html;
  };

  U.renderBarsVert = function (el, items, opts) {
    opts = opts || {};
    if (!items || !items.length) return U.chartEmpty(el);
    var max = 0;
    items.forEach(function (i) { if (Number(i.value) > max) max = Number(i.value); });
    if (!max) return U.chartEmpty(el);
    var cols = items.map(function (i) {
      var h = Math.max(3, Math.round((Number(i.value) / max) * 100));
      return '<div class="bv-col">' +
        '<div class="bv-bar" style="height:' + h + '%;background:' + (i.color || 'var(--accent)') + '"><span class="bv-val">' + U.fmtQty(i.value) + '</span></div>' +
        '<div class="bv-label" title="' + U.esc(i.label) + '">' + U.esc(opts.short ? U.shortDia(i.label) : i.label) + '</div>' +
        '</div>';
    }).join('');
    el.innerHTML = '<div class="bv-wrap">' + cols + '</div>' + (opts.legend ? '<div class="legend">' + opts.legend.map(function (l) { return '<span><i style="background:' + l.color + '"></i>' + U.esc(l.label) + '</span>'; }).join('') + '</div>' : '');
  };

  U.renderMultiLine = function (el, labels, series) {
    if (!labels || !labels.length || !series || !series.length) return U.chartEmpty(el);
    var w = 640, h = 190, padL = 46, padB = 26, padT = 12;
    var max = 0, k;
    series.forEach(function (s) { s._d = s.data.map(function (v) { return Number(v) || 0; }); s._d.forEach(function (v) { if (v > max) max = v; }); });
    if (!max) return U.chartEmpty(el);
    var n = Math.max(labels.length, 2);
    var innerW = w - padL - 12, innerH = h - padT - padB;
    var x = function (i) { return padL + (innerW * i) / (n - 1); };
    var y = function (v) { return padT + innerH - (innerH * v) / max; };
    var grid = '';
    for (var g = 0; g <= 4; g++) {
      var gy = padT + (innerH * g) / 4;
      grid += '<line x1="' + padL + '" y1="' + gy + '" x2="' + (w - 12) + '" y2="' + gy + '" stroke="rgba(99,102,241,.08)" stroke-width="1"/>';
    }
    var lines = series.map(function (s, si) {
      var pts = labels.map(function (_, i) { return x(i) + ',' + y(s._d[i]); }).join(' ');
      var area = padL + ',' + y(0) + ' ' + pts + ' ' + x(n - 1) + ',' + y(0);
      return '<polygon points="' + area + '" fill="' + s.color + '" opacity="0.07"/>' +
        '<polyline points="' + pts + '" fill="none" stroke="' + s.color + '" stroke-width="2.5" stroke-linejoin="round"/>';
    }).join('');
    var legend = '<div class="legend">' + series.map(function (s) { return '<span><i style="background:' + s.color + '"></i>' + U.esc(s.name) + '</span>'; }).join('') + '</div>';
    el.innerHTML =
      '<svg viewBox="0 0 ' + w + ' ' + h + '" class="chart" preserveAspectRatio="xMidYMid meet">' + grid + lines +
      labels.map(function (l, i) {
        return '<text x="' + x(i) + '" y="' + (h - 8) + '" text-anchor="middle" font-size="10" fill="#64748b">' + U.esc(U.shortDia(l)) + '</text>';
      }).join('') +
      '</svg>' + legend;
  };

  U.renderLine = function (el, items, opts) {
    opts = opts || {};
    if (!items || !items.length) return U.chartEmpty(el);
    var w = 640, h = 180, padL = 44, padB = 26, padT = 12;
    var max = 0, c = opts.color || 'var(--accent)';
    items.forEach(function (i) { if (Number(i.value) > max) max = Number(i.value); });
    if (!max) return U.chartEmpty(el);
    if (items.length === 1) items = items.concat([{ label: items[0].label, value: 0 }]);
    var n = Math.max(items.length, 2);
    var innerW = w - padL - 12, innerH = h - padT - padB;
    var x = function (i) { return padL + (innerW * i) / (n - 1); };
    var y = function (v) { return padT + innerH - (innerH * v) / max; };
    var grid = '';
    for (var g = 0; g <= 4; g++) {
      var gy = padT + (innerH * g) / 4;
      grid += '<line x1="' + padL + '" y1="' + gy + '" x2="' + (w - 12) + '" y2="' + gy + '" stroke="rgba(99,102,241,.08)" stroke-width="1"/>';
    }
    var pts = items.map(function (i, k) { return x(k) + ',' + y(Number(i.value)); }).join(' ');
    var area = padL + ',' + y(0) + ' ' + pts + ' ' + x(n - 1) + ',' + y(0);
    var svg = '<svg viewBox="0 0 ' + w + ' ' + h + '" class="chart" preserveAspectRatio="xMidYMid meet">' +
      grid +
      '<polygon points="' + area + '" fill="' + c + '" opacity="0.08"/>' +
      '<polyline points="' + pts + '" fill="none" stroke="' + c + '" stroke-width="2.5" stroke-linejoin="round"/>' +
      items.map(function (i, k) {
        return '<circle cx="' + x(k) + '" cy="' + y(Number(i.value)) + '" r="3.5" fill="' + c + '"/>' +
          '<text x="' + x(k) + '" y="' + (y(Number(i.value)) - 8) + '" text-anchor="middle" font-size="10" fill="#64748b">' + U.fmtQty(i.value) + '</text>';
      }).join('') +
      items.map(function (i, k) {
        return '<text x="' + x(k) + '" y="' + (h - 8) + '" text-anchor="middle" font-size="10" fill="#64748b">' + U.esc(U.shortDia(i.label)) + '</text>';
      }).join('') +
      '</svg>';
    el.innerHTML = svg;
  };

  U.shortDia = function (s) {
    var d = new Date(String(s).slice(0, 10) + 'T00:00:00');
    if (isNaN(d.getTime())) return String(s).slice(0, 5);
    return ['do', 'lu', 'ma', 'mi', 'ju', 'vi', 'sa'][d.getDay()] + ' ' + String(d.getDate()).padStart(2, '0');
  };

  U.renderDonut = function (el, items) {
    if (!items || !items.length) return U.chartEmpty(el);
    var total = 0;
    items.forEach(function (i) { total += i.value; });
    if (total <= 0) return U.chartEmpty(el);
    var colors = ['#22d3ee', '#34d399', '#fbbf24', '#f87171', '#a78bfa', '#f472b6', '#2dd4bf'];
    var acc = 0;
    var stops = items.map(function (i, k) {
      var from = (acc / total) * 100;
      acc += i.value;
      var to = (acc / total) * 100;
      return (i.color || colors[k % colors.length]) + ' ' + from + '% ' + to + '%';
    });
    var gradient = 'conic-gradient(' + stops.join(', ') + ')';
    var legend = items.map(function (i, k) {
      var pct = Math.round(((i.value || 0) / total) * 100);
      return '<span><i style="background:' + (i.color || colors[k % colors.length]) + '"></i>' + U.esc(i.label) + ' · <strong>' + U.fmt(i.value) + '</strong> (' + pct + '%)</span>';
    }).join('');
    el.innerHTML =
      '<div class="donut" style="background:' + gradient + '">' +
      '<div class="donut-inner">' + U.fmt(total) + '</div></div>' +
      '<div class="legend">' + legend + '</div>';
  };

  U.tableEmpty = function (cols, msg) {
    return '<tr><td colspan="' + cols + '" class="center muted" style="padding:26px">' + U.esc(msg || 'Sin datos') + '</td></tr>';
  };

  U.obj = function () { return {}; };

  return U;
});