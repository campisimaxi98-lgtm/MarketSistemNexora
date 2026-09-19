(function () {
  'use strict';

  function cargar() {
    var root = document.getElementById('view');
    U.api('GET', '/config').then(function (c) {
      root.querySelector('#cfg-nombre').value = c.nombre_comercio || '';
      root.querySelector('#cfg-direccion').value = c.direccion || '';
      root.querySelector('#cfg-tel').value = c.telefono || '';
      root.querySelector('#cfg-cuit').value = c.cuit || '';
      root.querySelector('#cfg-moneda').value = c.moneda || '$';
      root.querySelector('#cfg-min').value = c.stock_minimo_default || '10';
      root.querySelector('#cfg-ticket').value = c.formato_ticket || '80';
      root.querySelector('#cfg-msg').value = c.mensaje_ticket || '';
      root.querySelector('#cfg-gan').checked = String(c.incluir_ganancia_ticket) === '1';
      root.querySelector('#cfg-backup').checked = String(c.backup_automatico) !== '0';
      root.querySelector('#cfg-backup-hs').value = c.backup_frecuencia_hs || '24';
      root.querySelector('#cfg-usar-stock').checked = String(c.usar_stock || '1') !== '0';

      var met = root.querySelector('#metodos-body');
      met.innerHTML = (c.metodos_pago || []).map(function (m) {
        return '<tr><td>' + U.esc(m.nombre) + '</td><td><label class="center"><input type="checkbox" class="met-activo" data-id="' + m.id + '" ' + (m.activo ? 'checked' : '') + '></label></td></tr>';
      }).join('');

      var cats = root.querySelector('#cats-nuevas');
      cats.innerHTML = (c.categorias || []).map(function (cat) {
        return '<span class="badge badge-info" style="margin:2px">' + U.esc(cat.nombre) + '</span>';
      }).join('') + '<input id="cat-nueva" placeholder="Nueva categoría…">';
    }).catch(function (e) { U.toast(e.message, 'error'); });

    cargarUsuarios();
    cargarBackups();
  }

  function cargarUsuarios() {
    U.api('GET', '/auth/usuarios').then(function (rows) {
      var tbody = document.querySelector('#usuarios-body');
      if (!tbody) return;
      tbody.innerHTML = rows.map(function (u) {
        return '<tr><td>' + U.esc(u.nombre) + '</td><td>' + U.esc(u.usuario) + '</td>' +
          '<td>' + U.esc(u.email || '') + '</td>' +
          '<td>' + (u.rol === 'ADMIN' ? '<span class="badge badge-info">Dueño</span>' : '<span class="badge badge-muted">Empleado</span>') + '</td>' +
          '<td>' + (u.esta_activo ? '<span class="badge badge-ok">Activo</span>' : '<span class="badge badge-muted">Inactivo</span>') + '</td>' +
          '<td><button class="btn btn-sm" data-us="edit" data-id="' + u.id + '">Editar</button> <button class="btn btn-sm" data-us="toggle" data-id="' + u.id + '" data-act="' + u.esta_activo + '">' + (u.esta_activo ? 'Desactivar' : 'Activar') + '</button></td></tr>';
      }).join('') || U.tableEmpty(6, 'Sin usuarios');
    }).catch(function (e) {
      var tbody = document.querySelector('#usuarios-body');
      if (tbody) tbody.innerHTML = U.tableEmpty(6, e.message);
    });
  }

  function cargarBackups() {
    U.api('GET', '/backup/listar').then(function (files) {
      var tbody = document.querySelector('#backups-body');
      if (!tbody) return;
      tbody.innerHTML = files.map(function (f) {
        return '<tr><td>' + U.esc(f.nombre) + '</td><td>' + U.fechaHora(new Date(f.fecha).toLocaleString('es-AR')) + '</td>' +
          '<td class="num">' + Math.round(f.tamano / 1024) + ' KB</td>' +
          '<td><a class="btn btn-sm" href="/api/backup/descargar/' + encodeURIComponent(f.nombre) + '" download>⬇️</a> <button class="btn btn-sm btn-danger" data-bk="restaurar" data-nombre="' + U.esc(f.nombre) + '">↩️</button></td></tr>';
      }).join('') || U.tableEmpty(4, 'Todavía no hay backups');
    }).catch(function () {});
  }

  function guardarConfig() {
    var root = document.getElementById('view');
    var metodos = U.$$('.met-activo', root).map(function (ch) {
      return { id: Number(ch.getAttribute('data-id')), activo: ch.checked, nombre: null };
    });
    var c = U.$('#cat-nueva');
    var catsNuevas = c && c.value.trim() ? [c.value.trim()] : [];
    U.api('PUT', '/config', {
      nombre_comercio: root.querySelector('#cfg-nombre').value,
      direccion: root.querySelector('#cfg-direccion').value,
      telefono: root.querySelector('#cfg-tel').value,
      cuit: root.querySelector('#cfg-cuit').value,
      moneda: root.querySelector('#cfg-moneda').value,
      stock_minimo_default: root.querySelector('#cfg-min').value,
      formato_ticket: root.querySelector('#cfg-ticket').value,
      mensaje_ticket: root.querySelector('#cfg-msg').value,
      incluir_ganancia_ticket: root.querySelector('#cfg-gan').checked ? '1' : '0',
      backup_automatico: root.querySelector('#cfg-backup').checked ? '1' : '0',
      backup_frecuencia_hs: root.querySelector('#cfg-backup-hs').value,
      usar_stock: root.querySelector('#cfg-usar-stock').checked ? '1' : '0',
      metodos_pago: metodos,
      categorias_nuevas: catsNuevas
    }).then(function () {
      U.moneda = root.querySelector('#cfg-moneda').value || '$';
      U.toast('Configuración guardada', 'ok');
      cargar();
    }).catch(function (e) { U.toast(e.message, 'error'); });
  }

  function modalUsuario(u) {
    var esNuevo = !u;
    u = u || {};
    var html =
      '<label>Nombre<input id="us-nombre" value="' + U.esc(u.nombre || '') + '"></label>' +
      '<label>Usuario<input id="us-usuario" value="' + U.esc(u.usuario || '') + '" ' + (esNuevo ? '' : 'disabled') + '></label>' +
      '<label>Email <small>(para recuperar la contraseña)</small><input id="us-email" type="email" value="' + U.esc(u.email || '') + '"></label>' +
      '<div class="form-row">' +
      '<label>Rol<select id="us-rol"><option value="CAJERO"' + (u.rol === 'CAJERO' ? ' selected' : '') + '>Empleado</option><option value="ADMIN"' + (u.rol === 'ADMIN' ? ' selected' : '') + '>Dueño (administrador)</option></select></label>' +
      '<label>Contraseña' + (esNuevo ? '' : ' <small>(dejar vacío para no cambiar)</small>') + '<input id="us-pass" type="password"></label>' +
      '</div>';
    var m = U.modal({
      titulo: esNuevo ? 'Nuevo usuario' : 'Editar usuario',
      html: html,
      okText: esNuevo ? 'Crear' : 'Guardar',
      onOk: function () {
        var body = {
          nombre: m.el.querySelector('#us-nombre').value,
          usuario: m.el.querySelector('#us-usuario').value,
          email: m.el.querySelector('#us-email').value,
          rol: m.el.querySelector('#us-rol').value,
          password: m.el.querySelector('#us-pass').value
        };
        if (!esNuevo) delete body.usuario;
        var req = esNuevo ? U.api('POST', '/auth/usuarios', body) : U.api('PUT', '/auth/usuarios/' + u.id, body);
        req.then(function (r) {
          if (r.codigo_recuperacion) {
            U.modal({
              titulo: esNuevo ? 'Código de recuperación del usuario' : 'Código actualizado',
              okText: 'Entendido',
              html: '<p>Guardá este código para recuperar la contraseña de <strong>' + U.esc(body.nombre) + '</strong>:</p>' +
                '<div class="codigo-recu">' + U.esc(r.codigo_recuperacion) + '</div>'
            });
          } else {
            U.toast(esNuevo ? 'Usuario creado' : 'Usuario actualizado', 'ok');
          }
          m.close();
          cargarUsuarios();
        }).catch(function (e) { U.toast(e.message, 'error'); return false; });
        return false;
      }
    });
  }

  function restaurarBackup(nombre) {
    U.confirm('<strong>' + U.esc(nombre) + '</strong><br>Se reemplazará toda la base de datos actual. ¿Continuar?', function () {
      var a = document.createElement('a');
      a.href = '/api/backup/descargar/' + encodeURIComponent(nombre);
      fetch(a.href).then(function (res) {
        if (!res.ok) throw new Error('No se pudo leer el backup');
        return res.blob();
      }).then(function (blob) {
        return fetch('/api/backup/restaurar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/octet-stream' },
          body: blob
        });
      }).then(function (res) {
        if (!res.ok) return res.json().then(function (d) { throw new Error(d.error || 'Error'); });
        return res.json();
      }).then(function (d) {
        U.toast(d.mensaje || 'Backup restaurado', 'ok');
      }).catch(function (e) { U.toast(e.message, 'error'); });
    }, { danger: true, titulo: 'Restaurar backup', okText: 'Restaurar' });
  }

  function restaurarDesdeArchivo(file) {
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      fetch('/api/backup/restaurar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: reader.result
      }).then(function (res) {
        if (!res.ok) return res.json().then(function (d) { throw new Error(d.error || 'Error'); });
        return res.json();
      }).then(function (d) {
        U.toast(d.mensaje || 'Backup restaurado', 'ok');
      }).catch(function (e) { U.toast(e.message, 'error'); });
    };
    reader.readAsArrayBuffer(file);
  }

  App.page('config', {
    title: 'Configuración',
    admin: true,

    html: function () {
      return '<div class="grid cols-2">' +
        '<div class="card"><h3>Datos del comercio</h3>' +
        '<label>Nombre<input id="cfg-nombre"></label>' +
        '<label>Dirección<input id="cfg-direccion"></label>' +
        '<label>Teléfono<input id="cfg-tel"></label>' +
        '<label>CUIT<input id="cfg-cuit"></label>' +
        '<label>Moneda<input id="cfg-moneda" value="$" style="max-width:80px"></label>' +
        '<label>Stock mínimo por defecto<input id="cfg-min" type="number" min="0"></label>' +
        '<label>Formato de ticket<input id="cfg-ticket" placeholder="80"></label>' +
        '<label>Mensaje en ticket<input id="cfg-msg"></label>' +
        '<div class="flex mt"><label style="margin:0"><input type="checkbox" id="cfg-gan"> Incluir ganancia en ticket</label>' +
        '<label style="margin:0"><input type="checkbox" id="cfg-usar-stock"> Controlar stock en ventas</label></div>' +
        '<div class="flex mt"><label style="margin:0"><input type="checkbox" id="cfg-backup"> Backup automático</label>' +
        '<label style="margin:0">Cada <input id="cfg-backup-hs" type="number" min="1" style="width:70px"> horas</label></div>' +
        '<button class="btn btn-primary mt" id="btn-guardar-cfg">Guardar configuración</button>' +
        '</div>' +
        '<div class="card"><h3>Backup</h3>' +
        '<div class="flex mb"><button class="btn btn-primary" id="btn-backup-manual">💾 Hacer backup ahora</button>' +
        '<label style="margin:0" class="grow"><input type="file" id="backup-archivo" accept=".db"></label></div>' +
        '<div class="table-wrap" style="max-height:280px;overflow:auto"><table><thead><tr><th>Archivo</th><th>Fecha</th><th class="num">Tamaño</th><th></th></tr></thead><tbody id="backups-body"><tr><td colspan="4" class="center muted">Cargando…</td></tr></tbody></table></div>' +
        '</div>' +
        '</div>' +
        '<div class="card mt"><h3>Métodos de pago</h3>' +
        '<div class="table-wrap"><table><thead><tr><th>Método</th><th>Activo</th></tr></thead><tbody id="metodos-body"></tbody></table></div>' +
        '</div>' +
        '<div class="card mt"><h3>Categorías</h3><div id="cats-nuevas" class="flex flex-wrap"></div></div>' +
        '<div class="card mt"><h3>Usuarios</h3>' +
        '<div class="flex between mb"><span class="muted">Administradores y cajeros</span><button class="btn btn-primary" id="btn-nuevo-us">+ Nuevo usuario</button></div>' +
        '<div class="table-wrap"><table><thead><tr><th>Nombre</th><th>Usuario</th><th>Email</th><th>Rol</th><th>Estado</th><th></th></tr></thead><tbody id="usuarios-body"><tr><td colspan="6" class="center muted">Cargando…</td></tr></tbody></table></div>' +
        '</div>';
    },

    mounted: function () {
      cargar();
      document.querySelector('#btn-nuevo-us').addEventListener('click', function () { modalUsuario(null); });
      document.querySelector('#backup-archivo').addEventListener('change', function (e) { restaurarDesdeArchivo(e.target.files[0]); });
    },

    hooks: {
      'click #btn-guardar-cfg': function () { guardarConfig(); },
      'click #btn-backup-manual': function () {
        U.api('POST', '/backup/manual').then(function (r) {
          U.toast('Backup creado: ' + r.archivo, 'ok');
          cargarBackups();
        }).catch(function (e) { U.toast(e.message, 'error'); });
      },
      'click [data-bk="restaurar"]': function (e, t) { restaurarBackup(t.getAttribute('data-nombre')); },
      'click [data-us="edit"]': function (e, t) {
        var id = Number(t.getAttribute('data-id'));
        U.api('GET', '/auth/usuarios').then(function (rows) {
          var u = rows.find(function (r) { return r.id === id; });
          if (u) modalUsuario(u);
        }).catch(function (e) { U.toast(e.message, 'error'); });
      },
      'click [data-us="toggle"]': function (e, t) {
        var id = Number(t.getAttribute('data-id'));
        var activo = t.getAttribute('data-act') === '1';
        U.api('PUT', '/auth/usuarios/' + id, { esta_activo: !activo }).then(function () {
          U.toast('Usuario ' + (activo ? 'desactivado' : 'activado'), 'ok');
          cargarUsuarios();
        }).catch(function (e) { U.toast(e.message, 'error'); });
      }
    }
  });
})();