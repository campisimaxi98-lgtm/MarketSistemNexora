(function () {
  'use strict';

  var PAGES = {};
  var current = null;

  var App = {
    user: null,
    config: null,
    route: null,

    page: function (name, def) {
      PAGES[name] = def;
    },

    init: function () {
      var loginForm = document.getElementById('login-form');
      loginForm.addEventListener('submit', function (e) {
        e.preventDefault();
        App.login();
      });
      document.getElementById('btn-logout').addEventListener('click', App.logout);
      App.setFecha();
      App.check();
      window.addEventListener('hashchange', App.routeChange);
      document.querySelector('.brand').addEventListener('click', function () {
        document.querySelector('.sidebar').classList.remove('open');
      });
      window.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') {
          var modal = document.getElementById('modal-root');
          if (modal && modal.classList.contains('open')) modal.classList.remove('open');
        }
      });
    },

    setFecha: function () {
      var d = new Date();
      document.getElementById('topbar-date').textContent =
        d.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    },

    check: async function () {
      try {
        var r = await U.api('GET', '/auth/me');
        App.showApp(r.user);
      } catch (e) {
        App.showLogin();
      }
    },

    showLogin: function () {
      document.getElementById('app-view').hidden = true;
      document.getElementById('login-view').hidden = false;
      document.getElementById('login-usuario').focus();
    },

    showApp: async function (user) {
      App.user = user;
      document.getElementById('login-view').hidden = true;
      document.getElementById('app-view').hidden = false;
      document.getElementById('app-user').textContent = user.nombre;
      document.getElementById('app-rol').textContent = user.rol === 'ADMIN' ? 'Administrador' : 'Cajero';
      var nombre = (user.rol === 'ADMIN') ? await App.loadConfig() : null;
      document.getElementById('login-nombre').textContent = 'MarketSistemNexora';
      document.getElementById('app-nombre').textContent = (App.config && App.config.nombre_comercio) ? App.config.nombre_comercio : 'MarketSistemNexora';
      var nav = document.getElementById('main-nav');
      if (user.rol !== 'ADMIN') {
        var link = nav.querySelector('a[data-nav="config"]');
        if (link) link.style.display = 'none';
      }
      App.routeChange();
    },

    loadConfig: async function () {
      try {
        var c = await U.api('GET', '/config');
        App.config = c;
        U.moneda = c.moneda || '$';
        return c.nombre_comercio;
      } catch (e) {
        return null;
      }
    },

    logout: async function () {
      try { await U.api('POST', '/auth/logout'); } catch (e) {}
      App.user = null;
      App.config = null;
      App.showLogin();
    },

    login: async function () {
      var err = document.getElementById('login-error');
      err.hidden = true;
      try {
        var r = await U.api('POST', '/auth/login', {
          usuario: document.getElementById('login-usuario').value,
          password: document.getElementById('login-password').value
        });
        await App.showApp(r.user);
      } catch (e) {
        err.textContent = e.message;
        err.hidden = false;
      }
    },

    routeChange: async function () {
      if (!App.user) return;
      var hash = (location.hash || '#/').slice(1);
      var parts = hash.split('/').filter(function (p) { return p !== ''; });
      var name = parts.length ? parts[0] : 'dashboard';
      if (name === '') name = 'dashboard';
      var def = PAGES[name];
      if (!def) { location.hash = '#/'; return; }
      if (def.admin && App.user.rol !== 'ADMIN') {
        U.toast('Se requiere permiso de administrador', 'warn');
        location.hash = '#/';
        return;
      }
      App.route = { name: name, parts: parts };
      App.setNav(name);
      var view = document.getElementById('view');
      if (current && current.def.dispose) { try { current.def.dispose(); } catch (e) {} }
      current = { name: name, def: def };
      document.getElementById('page-title').textContent = def.title;
      view.innerHTML = def.html ? def.html(parts) : '';
      if (def.hooks) U.bindHooks(view, def.hooks);
      if (def.mounted) { try { def.mounted(view, parts); } catch (e) { console.error('page mount', name, e); U.toast('Error al cargar la página: ' + e.message, 'error'); } }
      view.scrollTop = 0;
    },

    setNav: function (name) {
      var links = document.querySelectorAll('#main-nav a');
      for (var i = 0; i < links.length; i++) {
        links[i].classList.toggle('active', links[i].getAttribute('data-nav') === name);
      }
    }
  };

  window.App = App;
})();