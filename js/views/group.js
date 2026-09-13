/* =============================================================================
   views/group.js — Grupo y cuenta.

   El GRUPO es el marco académico compartido: sus asignaturas y su horario los
   ven todos los que entran con el código. Las tareas y los compañeros de
   equipo siguen siendo privados de cada uno.
   ============================================================================= */
(function (global) {
  'use strict';

  var LD = global.LD;
  var U = LD.utils, S = LD.store, ui = LD.ui, ico = LD.icons;

  var gente = null;        // se carga al entrar en la vista

  var view = {
    id: 'group',
    label: 'Grupo',
    icon: 'key',
    countKey: null,

    render: function () {
      if (!LD.api.enabled) return sinCuenta();

      var grupo = S.group();
      var dueno = S.isGroupOwner();
      var sesion = LD.api.client().auth.__lastSession;
      var correo = sesion && sesion.user ? sesion.user.email : '';

      var html = '<div class="page-head">' +
        '<div><h1>Grupo y cuenta</h1>' +
        '<p class="sub">' + (dueno
          ? 'Comparte el código y tus compañeros tendrán tus mismas asignaturas y tu mismo horario.'
          : 'Estás en un grupo compartido: las asignaturas y el horario los gestiona quien lo creó.') +
        '</p></div>' +
      '</div>';

      /* ---- El código ---- */
      html += '<section class="card">' +
        '<div class="card-head"><h2>' + ico.svg('key') + 'Código del grupo</h2>' +
          '<span class="tag' + (dueno ? '' : ' warn') + '">' + (dueno ? 'eres el dueño' : 'eres miembro') + '</span>' +
        '</div>' +
        '<div class="card-body">' +
          (grupo
            ? '<div class="code-row">' +
                '<code class="group-code" data-role="code">' + U.esc(grupo.code || '—') + '</code>' +
                '<button class="btn btn-sm" data-group="copy">' + ico.svg('copy') + ' Copiar</button>' +
                (dueno ? '<button class="btn btn-sm btn-ghost" data-group="rotate" ' +
                  'title="Genera uno nuevo; el anterior deja de servir">' + ico.svg('refresh') + ' Cambiar</button>' : '') +
              '</div>' +
              '<p class="small muted">' + (dueno
                ? 'Quien use este código verá tus asignaturas y tu horario, pero nunca tus tareas ni tus compañeros de equipo.'
                : 'Este es el código del grupo en el que estás.') + '</p>'
            : '<p class="empty-sm">Todavía no se ha cargado tu grupo. Comprueba tu conexión.</p>') +
        '</div>' +
      '</section>';

      /* ---- Quién está dentro ---- */
      html += '<div class="cols">';
      html += '<section class="card">' +
        '<div class="card-head"><h2>' + ico.svg('users') + 'Quién usa este grupo</h2>' +
          (gente ? '<span class="tag">' + gente.length + '</span>' : '') +
        '</div>' +
        '<div class="card-body" data-role="gente">' +
          (gente === null
            ? '<p class="empty-sm">Consultando…</p>'
            : (gente.length
                ? '<div class="people">' + gente.map(function (p) {
                    var yo = p.user_id === LD.api.userId();
                    var nombre = (p.display_name || '').trim() || (yo ? 'Tú' : 'Compañero');
                    return '<span class="chip-member" style="--c:' + (yo ? 'var(--accent)' : 'var(--muted)') + '">' +
                      '<span class="avatar avatar-xs" style="--c:' + (yo ? 'var(--accent)' : 'var(--muted)') + '">' +
                      U.esc(S.initials(nombre)) + '</span>' + U.esc(nombre) + (yo ? ' · tú' : '') + '</span>';
                  }).join('') + '</div>'
                : '<p class="empty-sm">Sólo tú, por ahora.</p>')) +
        '</div>' +
      '</section>';

      /* ---- Entrar o salir ---- */
      html += '<section class="card">' +
        '<div class="card-head"><h2>' + ico.svg('arrow-right') + 'Cambiar de grupo</h2></div>' +
        '<div class="card-body">' +
          '<div class="field">' +
            '<label for="join-code">Entrar con el código de un compañero</label>' +
            '<div class="code-row">' +
              '<input id="join-code" class="input join-input" maxlength="6" autocapitalize="characters" ' +
                'autocomplete="off" spellcheck="false" placeholder="ABC123">' +
              '<button class="btn btn-primary" data-group="join">Entrar</button>' +
            '</div>' +
          '</div>' +
          '<p class="small muted">Tus asignaturas y tu horario actuales se cambiarán por los del grupo. ' +
            'Tus tareas se conservan y se reasignan por nombre. Podrás volver con tu propio código.</p>' +
          (grupo && (gente === null || gente.length > 1 || !S.isGroupOwner())
            ? '<hr class="sep">' +
              '<button class="btn btn-sm" data-group="leave">Salir del grupo con una copia propia</button>' +
              '<p class="small muted">Te llevas las asignaturas y el horario como tuyos, para editarlos a tu gusto.</p>'
            : '') +
        '</div>' +
      '</section>';
      html += '</div>';

      /* ---- Sincronización ---- */
      var est = LD.sync.status();
      html += '<section class="card">' +
        '<div class="card-head"><h2>' + ico.svg('cloud-check') + 'Sincronización</h2>' +
          '<span class="tag">' + U.esc(etiquetaEstado(est)) + '</span>' +
        '</div>' +
        '<div class="card-body">' +
          '<div class="row" style="flex-wrap:wrap">' +
            '<button class="btn btn-sm" data-group="sync">' + ico.svg('refresh') + ' Sincronizar ahora</button>' +
            '<button class="btn btn-sm" data-group="push-all">Subir lo de este navegador</button>' +
          '</div>' +
          '<p class="small muted">Los cambios se guardan al momento en este dispositivo y se suben en segundo plano. ' +
            'Sin conexión se quedan en cola y salen solos al volver la red.</p>' +
        '</div>' +
      '</section>';

      /* ---- Cuenta ---- */
      html += '<section class="card">' +
        '<div class="card-head"><h2>' + ico.svg('user') + 'Cuenta</h2></div>' +
        '<div class="card-body">' +
          '<p class="row"><strong>' + U.esc(correo || '—') + '</strong></p>' +
          '<div class="row" style="flex-wrap:wrap">' +
            '<button class="btn btn-sm" data-group="password">' + ico.svg('key') + ' Cambiar contraseña</button>' +
            '<button class="btn btn-sm is-danger" data-group="signout">' + ico.svg('log-out') + ' Cerrar sesión</button>' +
          '</div>' +
        '</div>' +
      '</section>';

      return html;
    },

    mounted: function () {
      var grupo = S.group();
      if (!grupo || !LD.api.enabled) return;
      if (gente !== null) return;

      LD.api.groupPeople(grupo.id).then(function (lista) {
        gente = lista;
        if (LD.app.current === 'group') LD.app.render();
      }, function () {
        gente = [];
      });
    },

    /** Fuerza recargar la lista de gente la próxima vez. */
    invalidate: function () { gente = null; }
  };

  function etiquetaEstado(est) {
    return {
      'al-dia': 'todo subido',
      pendiente: est.pendientes + ' en cola',
      subiendo: 'subiendo…',
      'sin-conexion': 'sin conexión · ' + est.pendientes + ' en cola',
      error: 'error al subir',
      'sin-sesion': 'sin sesión',
      apagado: 'sólo en este navegador'
    }[est.estado] || est.estado;
  }

  function sinCuenta() {
    return '<div class="page-head"><div><h1>Grupo y cuenta</h1></div></div>' +
      '<section class="card"><div class="card-body">' +
      ui.empty('cloud-off', 'Sin cuenta configurada',
        'Esta copia de ListaDo guarda todo sólo en este navegador. Para compartir el horario con tus ' +
        'compañeros y abrir la app desde el móvil hay que rellenar js/config.js con los datos de Supabase.') +
      '</div></section>';
  }

  LD.views = LD.views || {};
  LD.views.group = view;
})(window);
