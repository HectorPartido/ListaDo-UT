/* =============================================================================
   app.js — arranque, navegación por hash, delegación de eventos, atajos de
   teclado, tema y copias de seguridad.
   Expone window.LD.app
   ============================================================================= */
(function (global) {
  'use strict';

  var LD = global.LD;
  var U = LD.utils, S = LD.store, ui = LD.ui, modals = LD.modals, ico = LD.icons;

  var ORDER = ['dashboard', 'tasks', 'calendar', 'schedule', 'subjects', 'team', 'stats', 'group'];
  var app = { current: 'dashboard' };
  var focusFlag = null;

  /* ------------------------------ Navegación ----------------------------- */

  /**
   * Parte la ruta en vista y parámetro: '#/task/abc' -> {name:'task', arg:'abc'}
   * Lo necesita el editor de tareas, que es una vista con su propia URL.
   */
  function parseHash() {
    var crudo = (location.hash || '').replace(/^#\/?/, '').split('?')[0];
    var partes = crudo.split('/');
    return {
      name: LD.views[partes[0]] ? partes[0] : 'dashboard',
      arg: partes.slice(1).join('/')
    };
  }

  function viewFromHash() { return parseHash().name; }

  app.go = function (name) {
    if (location.hash === '#/' + name) render();
    else location.hash = '#/' + name;
  };

  function renderNav() {
    var counts = S.counts();
    U.$('#nav').innerHTML = ORDER.map(function (id, i) {
      var v = LD.views[id];
      var n = v.countKey ? counts[v.countKey] : 0;
      var tip = [v.label + ' (' + (i + 1) + ')'];
      var badges = '';

      if (id === 'dashboard') {
        // El panel avisa por separado de lo de hoy y de lo atrasado.
        if (counts.today) { badges += '<span class="count">' + counts.today + '</span>'; tip.push(counts.today + ' para hoy'); }
        if (counts.overdue) { badges += '<span class="count alert">' + counts.overdue + '</span>'; tip.push(counts.overdue + ' atrasadas'); }
      } else if (n) {
        badges = '<span class="count">' + n + '</span>';
      }

      return '<button class="nav-item' + (id === app.current ? ' active' : '') + '" data-view="' + id + '" ' +
        'title="' + U.esc(tip.join(' · ')) + '">' +
        ico.svg(v.icon, { cls: 'ic-nav' }) + '<span>' + U.esc(v.label) + '</span>' +
        badges +
      '</button>';
    }).join('');
  }

  function render() {
    var ruta = parseHash();
    var anterior = app.current;
    app.current = ruta.name;

    var v = LD.views[app.current];
    document.title = 'ListaDo · ' + v.label;

    // El editor de tareas no se recuerda como «última vista»: reabrir la app
    // en un formulario vacío no tendría sentido.
    if (!v.oculta) S.setSetting('lastView', app.current);

    // Al dejar una vista se le avisa, por si tiene algo que soltar.
    if (anterior && anterior !== app.current) {
      var previa = LD.views[anterior];
      if (previa && previa.leave) previa.leave();
    }

    var host = U.$('#view');
    host.innerHTML = v.render(ruta.arg);
    host.scrollTop = 0;
    renderNav();
    if (v.mounted) v.mounted();
    restorePendingFocus();
  }

  /** Abre el editor de tareas a pantalla completa. */
  function abreTarea(id, preset) { LD.views.task.open(id, preset); }
  app.openTask = abreTarea;

  /* Los campos de texto que filtran (buscador del equipo, por ejemplo) viven
     dentro de la vista, así que al re-pintar hay que devolverles el cursor. */
  var pendingFocus = null;

  function restorePendingFocus() {
    if (!pendingFocus) return;
    var el = document.getElementById(pendingFocus);
    pendingFocus = null;
    if (!el) return;
    el.focus();
    if (el.setSelectionRange) {
      var end = el.value.length;
      try { el.setSelectionRange(end, end); } catch (err) { /* type="time" y similares */ }
    }
  }

  app.render = render;

  /** Indica que tras el siguiente render hay que devolver el foco a un campo. */
  app.setFocusFlag = function (name) { focusFlag = name; };
  app.consumeFocusFlag = function (name) {
    if (focusFlag !== name) return false;
    focusFlag = null;
    return true;
  };

  /* --------------------------------- Tema -------------------------------- */

  var THEME_LABEL = { auto: 'automático', light: 'claro', dark: 'oscuro' };
  var THEME_ICON = { auto: 'monitor', light: 'sun', dark: 'moon' };

  function applyTheme() {
    var pref = S.state.settings.theme || 'auto';
    var dark = pref === 'dark' ||
      (pref === 'auto' && global.matchMedia && global.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');

    var btn = U.$('[data-app="theme"]');
    if (btn) {
      btn.title = 'Tema: ' + THEME_LABEL[pref];
      btn.innerHTML = ico.svg(THEME_ICON[pref]);
    }
  }

  function cycleTheme() {
    var order = ['auto', 'light', 'dark'];
    var next = order[(order.indexOf(S.state.settings.theme || 'auto') + 1) % order.length];
    S.setSetting('theme', next);
    applyTheme();
    ui.toast('Tema: ' + THEME_LABEL[next]);
  }

  /* ------------------------------- Acciones ------------------------------ */

  app.deleteTaskWithUndo = function (id) {
    var task = S.taskById(id);
    if (!task) return;
    var removed = S.deleteTask(id);
    ui.toast('Tarea borrada: ' + task.title.slice(0, 40), {
      undo: function () { S.restoreTask(removed.task, removed.index); ui.toast('Restaurada.'); }
    });
  };

  app.deleteClassWithUndo = function (id) {
    var slot = S.classById(id);
    if (!slot) return;
    var label = S.classLabel(slot);
    var removed = S.deleteClass(id);
    ui.toast('Clase borrada: ' + label, {
      undo: function () { S.restoreClass(removed.slot, removed.index); ui.toast('Restaurada.'); }
    });
  };

  function quickAdd() {
    var input = U.$('#quick-add');
    if (!input) return;
    var text = input.value.trim();
    if (!text) { input.focus(); return; }

    var parsed = U.parseQuickAdd(text, S.state.subjects, S.TYPES);
    if (!parsed.title) {
      ui.toast('Escribe también el nombre de la tarea.');
      input.focus();
      return;
    }

    var patch = { title: parsed.title };
    if (parsed.subjectId) patch.subjectId = parsed.subjectId;
    else if (S.ui.dashSubject && S.ui.dashSubject !== 'all' && S.ui.dashSubject !== 'none') patch.subjectId = S.ui.dashSubject;
    if (parsed.priority) patch.priority = parsed.priority;
    if (parsed.type) patch.type = parsed.type;
    if (parsed.due) patch.due = parsed.due;
    if (parsed.estimate != null) patch.estimate = parsed.estimate;
    if (parsed.weight != null) patch.weight = parsed.weight;

    input.value = '';
    app.setFocusFlag('quick-add');
    S.addTask(patch);

    var bits = [];
    if (patch.subjectId) bits.push(S.subjectLabel(patch.subjectId));
    if (patch.due) bits.push(U.dueInfo(patch.due).label.toLowerCase());
    ui.toast('Añadida' + (bits.length ? ' · ' + bits.join(' · ') : '') + '.');
  }

  /* ------------------------- Grupo y cuenta ------------------------------ */

  function copiarCodigo() {
    var codigo = S.groupCode();
    if (!codigo) return;

    var listo = function () { ui.toast('Código copiado: ' + codigo); };
    if (global.navigator.clipboard && global.navigator.clipboard.writeText) {
      global.navigator.clipboard.writeText(codigo).then(listo, seleccionar);
    } else {
      seleccionar();
    }

    // Si el navegador no deja copiar (http sin cifrar, por ejemplo), al menos
    // se deja el código seleccionado para copiarlo a mano.
    function seleccionar() {
      var nodo = U.$('[data-role="code"]');
      if (!nodo) return;
      var rango = document.createRange();
      rango.selectNodeContents(nodo);
      var sel = global.getSelection();
      sel.removeAllRanges();
      sel.addRange(rango);
      ui.toast('Copia el código seleccionado con ⌘C.');
    }
  }

  function cambiarCodigo() {
    modals.confirm({
      title: 'Cambiar el código del grupo',
      text: 'Se generará uno nuevo y el actual dejará de funcionar. Quien ya esté dentro sigue dentro, ' +
            'pero tendrás que repartir el código nuevo.',
      okLabel: 'Cambiar'
    }).then(function (ok) {
      if (!ok) return;
      return LD.api.rotateCode().then(function (codigo) {
        if (S.state.group) S.state.group.code = codigo;
        S.save();
        render();
        ui.toast('Código nuevo: ' + codigo);
      }, function (err) { ui.toast('No se pudo cambiar: ' + err.message); });
    });
  }

  function entrarEnGrupo() {
    var input = U.$('#join-code');
    if (!input) return;
    var codigo = (input.value || '').trim().toUpperCase();

    if (codigo.length < 4) {
      ui.toast('Escribe el código que te han dado.');
      input.focus();
      return;
    }

    LD.api.peekGroup(codigo).then(function (info) {
      if (!info) {
        ui.toast('No existe ningún grupo con el código ' + codigo + '.');
        input.focus();
        return;
      }

      return modals.confirm({
        title: 'Entrar en «' + info.name + '»',
        text: info.subjects + ' ' + U.plural(+info.subjects, 'asignatura') + ', ' +
              info.classes + ' ' + U.plural(+info.classes, 'clase') + ' y ' +
              info.people + ' ' + U.plural(+info.people, 'persona') + ' dentro. ' +
              'Tus asignaturas y tu horario se cambiarán por los de este grupo; tus tareas y tus compañeros se quedan como están.',
        okLabel: 'Entrar'
      }).then(function (ok) {
        if (!ok) return;
        var antiguas = S.state.subjects.slice();

        return LD.api.joinGroup(codigo)
          .then(function () { return LD.sync.pull(); })
          .then(function () {
            var reparadas = S.remapSubjects(antiguas);
            if (LD.views.group) LD.views.group.invalidate();
            render();
            ui.toast('Ya estás en «' + info.name + '»' +
              (reparadas ? ' · ' + reparadas + ' referencias reasignadas' : '') + '.');
          });
      });
    }).catch(function (err) {
      ui.toast('No se pudo entrar: ' + err.message);
    });
  }

  function salirDelGrupo() {
    modals.confirm({
      title: 'Salir del grupo',
      text: 'Te llevas una copia propia de las asignaturas y del horario, que ya podrás editar. ' +
            'Dejarás de ver los cambios que haga quien lo creó.',
      okLabel: 'Salir con mi copia'
    }).then(function (ok) {
      if (!ok) return;
      var antiguas = S.state.subjects.slice();

      return LD.api.leaveGroup()
        .then(function () { return LD.sync.pull(); })
        .then(function () {
          var reparadas = S.remapSubjects(antiguas);
          if (LD.views.group) LD.views.group.invalidate();
          render();
          ui.toast('Ahora tienes tu propio grupo' +
            (reparadas ? ' · ' + reparadas + ' referencias reasignadas' : '') + '.');
        }, function (err) { ui.toast('No se pudo salir: ' + err.message); });
    });
  }

  function subirTodo() {
    modals.confirm({
      title: 'Subir lo de este navegador',
      text: 'Se enviará a tu cuenta todo lo que hay ahora mismo aquí. Útil la primera vez, ' +
            'si tenías tareas guardadas sólo en este navegador.',
      okLabel: 'Subir'
    }).then(function (ok) {
      if (!ok) return;
      var n = LD.sync.pendientes();
      return S.pushEverything().then(function () {
        ui.toast('Subida en marcha (' + Math.max(n, LD.sync.pendientes()) + ' operaciones).');
      });
    });
  }

  function cambiarContrasena() {
    var sesion = LD.api.client().auth.__lastSession;
    var correo = sesion && sesion.user ? sesion.user.email : '';
    if (!correo) return;

    modals.confirm({
      title: 'Cambiar la contraseña',
      text: 'Te enviaremos un enlace a ' + correo + ' para elegir una nueva.',
      okLabel: 'Enviar el enlace'
    }).then(function (ok) {
      if (!ok) return;
      return LD.api.sendPasswordReset(correo).then(function () {
        ui.toast('Enlace enviado a ' + correo + '.');
      }, function (err) { ui.toast('No se pudo enviar: ' + err.message); });
    });
  }

  function cerrarSesion() {
    var pendientes = LD.sync.pendientes();
    modals.confirm({
      title: 'Cerrar sesión',
      text: pendientes
        ? 'Cuidado: quedan ' + pendientes + ' cambios sin subir. Si cierras sesión ahora se perderán.'
        : 'Podrás volver a entrar con tu correo y tu contraseña.',
      okLabel: 'Cerrar sesión',
      danger: !!pendientes
    }).then(function (ok) {
      if (!ok) return;
      return LD.api.signOut();
    });
  }

  function clearFilters() {
    S.ui.search = '';
    S.ui.subjectId = 'all';
    S.ui.status = 'open';
    S.ui.type = 'all';
    S.ui.priority = 'all';
    S.ui.memberId = 'all';
    var box = U.$('#search');
    if (box) box.value = '';
    render();
  }

  function doExport() {
    var stamp = U.today();
    U.download('listado-' + stamp + '.json', S.exportJSON());
    ui.toast('Copia descargada: listado-' + stamp + '.json');
  }

  function doImport(file) {
    var reader = new FileReader();
    reader.onload = function () {
      modals.confirm({
        title: 'Importar copia',
        text: 'Se reemplazarán las tareas y asignaturas actuales por las del archivo.',
        okLabel: 'Importar', danger: true
      }).then(function (ok) {
        if (!ok) return;
        try {
          var res = S.importJSON(String(reader.result));
          ui.toast('Importado: ' + res.tasks + ' tareas y ' + res.subjects + ' asignaturas.');
        } catch (err) {
          ui.toast('No se pudo importar: ' + err.message);
        }
      });
    };
    reader.onerror = function () { ui.toast('No se pudo leer el archivo.'); };
    reader.readAsText(file);
  }

  function doClearSchedule() {
    var n = S.state.schedule.length;
    modals.confirm({
      title: 'Vaciar el horario',
      text: 'Se borrarán las ' + n + ' ' + U.plural(n, 'clase') + ' del horario. Las tareas y asignaturas no se tocan.',
      okLabel: 'Vaciar', danger: true
    }).then(function (ok) {
      if (!ok) return;
      S.clearSchedule();
      ui.toast('Horario vaciado.');
    });
  }

  function doReset() {
    modals.confirm({
      title: 'Borrar todos los datos',
      text: 'Se eliminarán todas las tareas y asignaturas de este navegador. Esta acción no se puede deshacer: exporta una copia antes si te interesa.',
      okLabel: 'Borrar todo', danger: true
    }).then(function (ok) {
      if (!ok) return;
      S.reset();
      ui.toast('Todo borrado.');
    });
  }

  /* --------------------------- Eventos globales -------------------------- */

  function onClick(ev) {
    var el, id;

    /* Navegación de la barra lateral */
    if ((el = ev.target.closest('[data-view]'))) {
      app.go(el.dataset.view);
      U.$('#app').classList.remove('nav-open');
      return;
    }

    /* Editor de tareas (pantalla completa) */
    if ((el = ev.target.closest('[data-task]'))) {
      if (LD.views.task.accion(el.dataset.task, el)) return;
    }

    /* Acciones sobre tareas */
    if ((el = ev.target.closest('[data-action]'))) {
      id = el.dataset.id;
      switch (el.dataset.action) {
        case 'toggle-done': S.toggleDone(id); return;
        case 'cycle-status': S.cycleStatus(id); return;
        case 'edit': abreTarea(id); return;
        case 'delete': app.deleteTaskWithUndo(id); return;
        case 'toggle-subtask': S.toggleSubtask(id, el.dataset.sub); return;
      }
    }

    /* Asignaturas */
    if ((el = ev.target.closest('[data-subject]'))) {
      id = el.dataset.id;
      switch (el.dataset.subject) {
        case 'edit': modals.subjectForm(id); return;
        case 'add-task': abreTarea(null, { subjectId: id }); return;
        case 'tasks':
          S.ui.subjectId = id;
          S.ui.status = 'open';
          app.go('tasks');
          return;
      }
    }

    /* Calendario */
    if ((el = ev.target.closest('[data-cal]'))) {
      switch (el.dataset.cal) {
        case 'prev': S.ui.calMonth = U.shiftMonth(S.ui.calMonth, -1); render(); return;
        case 'next': S.ui.calMonth = U.shiftMonth(S.ui.calMonth, 1); render(); return;
        case 'today': S.ui.calMonth = U.today(); S.ui.calDay = U.today(); render(); return;
        case 'day':
          S.ui.calDay = S.ui.calDay === el.dataset.date ? '' : el.dataset.date;
          if (U.fromISO(el.dataset.date).getMonth() !== U.fromISO(S.ui.calMonth).getMonth()) {
            S.ui.calMonth = el.dataset.date;
          }
          render();
          return;
        case 'add': abreTarea(null, { due: el.dataset.date }); return;
      }
    }

    /* Equipo */
    if ((el = ev.target.closest('[data-member-act]'))) {
      id = el.dataset.id;
      switch (el.dataset.memberAct) {
        case 'edit': modals.memberForm(id); return;
        case 'add-task': abreTarea(null, { memberIds: [id] }); return;
        case 'tasks':
          S.ui.memberId = id;
          S.ui.status = 'all';
          app.go('tasks');
          return;
      }
    }

    /* Horario: clases */
    if ((el = ev.target.closest('[data-class]'))) {
      id = el.dataset.id;
      switch (el.dataset.class) {
        case 'edit': modals.classForm(id); return;
        case 'delete': app.deleteClassWithUndo(id); return;
      }
    }

    /* Horario: barra de acciones y selector de día */
    if ((el = ev.target.closest('[data-schedule]'))) {
      switch (el.dataset.schedule) {
        case 'new': modals.classForm(null, { day: parseInt(el.dataset.day, 10) || undefined }); return;
        case 'import': modals.importSchedule(); return;
        case 'clear': doClearSchedule(); return;
      }
    }
    if ((el = ev.target.closest('[data-schedule-day]'))) {
      S.ui.scheduleDay = parseInt(el.dataset.scheduleDay, 10) || 0;
      render();
      return;
    }
    // Hueco libre de la rejilla: crea una clase a esa hora, redondeada a 15 min
    if ((el = ev.target.closest('.tt-body[data-day]'))) {
      var rect = el.getBoundingClientRect();
      var scale = LD.views.schedule.pxPerMin || 1;
      var base = parseInt(el.dataset.from, 10) || 0;
      var mins = base + Math.round((ev.clientY - rect.top) / scale / 15) * 15;
      modals.classForm(null, {
        day: parseInt(el.dataset.day, 10),
        start: U.fromMin(U.clamp(mins, 0, 22 * 60 + 45))
      });
      return;
    }

    /* Grupo y cuenta */
    if ((el = ev.target.closest('[data-group]'))) {
      switch (el.dataset.group) {
        case 'copy':      copiarCodigo(); return;
        case 'rotate':    cambiarCodigo(); return;
        case 'join':      entrarEnGrupo(); return;
        case 'leave':     salirDelGrupo(); return;
        case 'sync':      LD.sync.pull().then(function (ok) {
                            render();
                            ui.toast(ok ? 'Sincronizado.' : 'No se pudo sincronizar ahora.');
                          }); return;
        case 'push-all':  subirTodo(); return;
        case 'password':  cambiarContrasena(); return;
        case 'signout':   cerrarSesion(); return;
      }
    }

    /* Acciones generales */
    if ((el = ev.target.closest('[data-app]'))) {
      switch (el.dataset.app) {
        case 'new-task': abreTarea(null); return;
        case 'new-subject': modals.subjectForm(null); return;
        case 'new-member': modals.memberForm(null); return;
        case 'import-schedule': modals.importSchedule(); return;
        case 'clear-team-search': S.ui.teamSearch = ''; render(); return;
        case 'quick-add': quickAdd(); return;
        case 'clear-filters': clearFilters(); return;
        case 'theme': cycleTheme(); return;
        case 'seed': S.seedDemo(); ui.toast('Datos de ejemplo cargados.'); return;
        case 'export': doExport(); return;
        case 'import': U.$('#import-file').click(); return;
        case 'reset': doReset(); return;
        case 'menu': U.$('#app').classList.toggle('nav-open'); return;
        case 'close-menu': U.$('#app').classList.remove('nav-open'); return;
      }
    }
  }

  /** Campos de texto que filtran y viven dentro de la vista. */
  var onTextFilter = U.debounce(function (key, value, id) {
    S.ui[key] = value;
    pendingFocus = id;
    render();
  }, 180);

  function onInput(ev) {
    var el = ev.target;
    if (el.dataset && el.dataset.filterText) {
      onTextFilter(el.dataset.filterText, el.value, el.id);
    }
  }

  function onChange(ev) {
    var el = ev.target;

    if (el.dataset && el.dataset.filter) {
      S.ui[el.dataset.filter] = el.value;
      render();
      return;
    }

    if (el.id === 'import-file' && el.files && el.files[0]) {
      doImport(el.files[0]);
      el.value = '';
    }
  }

  function onKeydown(ev) {
    /* Escape cierra modal o menú */
    if (ev.key === 'Escape') {
      if (modals.isOpen()) { modals.close(); return; }
      U.$('#app').classList.remove('nav-open');
      return;
    }

    /* Enter en el campo de añadir rápido */
    if (ev.key === 'Enter' && ev.target.id === 'quick-add') {
      ev.preventDefault();
      quickAdd();
      return;
    }

    /* Enter en el código de grupo */
    if (ev.key === 'Enter' && ev.target.id === 'join-code') {
      ev.preventDefault();
      entrarEnGrupo();
      return;
    }

    /* Espacio/Enter sobre el título de una tarea (accesible con teclado) */
    if ((ev.key === 'Enter' || ev.key === ' ') && ev.target.classList && ev.target.classList.contains('task-title')) {
      ev.preventDefault();
      abreTarea(ev.target.dataset.id);
      return;
    }

    if (modals.isOpen()) return;

    var typing = /^(INPUT|TEXTAREA|SELECT)$/.test(ev.target.tagName);

    /* "/" enfoca la búsqueda.
       El foco se mueve en el siguiente tick para que la propia tecla no acabe
       escrita dentro del campo que acabamos de enfocar. */
    if (ev.key === '/' && !typing) {
      ev.preventDefault();
      setTimeout(function () {
        var box = U.$('#search');
        box.focus();
        box.select();
      }, 0);
      return;
    }

    if (typing || ev.metaKey || ev.ctrlKey || ev.altKey) return;

    /* N: nueva tarea · 1-5: vistas */
    if (ev.key === 'n' || ev.key === 'N') {
      ev.preventDefault();
      setTimeout(function () { abreTarea(null); }, 0);
      return;
    }
    var num = parseInt(ev.key, 10);
    if (num >= 1 && num <= ORDER.length) {
      ev.preventDefault();
      app.go(ORDER[num - 1]);
    }
  }

  var onSearch = U.debounce(function (value) {
    S.ui.search = value;
    if (value && app.current !== 'tasks' && app.current !== 'calendar') app.go('tasks');
    else render();
  }, 180);

  /* -------------------------------- Arranque ----------------------------- */

  /** Rellena los huecos [data-icon] del HTML estático. */
  function hydrateIcons(root) {
    U.$$('[data-icon]', root || document).forEach(function (el) {
      el.innerHTML = ico.svg(el.dataset.icon);
    });
  }

  /* ----------------------------- Sesión ---------------------------------- */

  var sesionArrancada = false;

  function showApp(visible) {
    var app = U.$('#app');
    if (app) app.classList.toggle('hidden', !visible);
  }

  /** Reacciona a los cambios de sesión de Supabase. */
  function onAuth(evento, session) {
    if (evento === 'PASSWORD_RECOVERY') {
      showApp(false);
      LD.authUI.show('nueva-clave');
      return;
    }

    if (!session) {
      sesionArrancada = false;
      LD.sync.reset();
      showApp(false);
      LD.authUI.show('entrar');
      return;
    }

    if (evento === 'SIGNED_IN' || evento === 'INITIAL_SESSION') app.afterLogin();
  }

  /**
   * Arranca la app con sesión: primero lo que hay en caché (instantáneo y sin
   * red) y después lo que diga el servidor.
   */
  app.afterLogin = function () {
    if (sesionArrancada) return;
    sesionArrancada = true;

    LD.authUI.hide();
    S.load();                       // caché de ESTE usuario
    applyTheme();
    boot();

    LD.sync.start();
    LD.api.ensureProfile((S.state.profile || {}).display_name)
      .then(function () { return LD.sync.pull(); })
      .then(function (traido) {
        if (!traido) return;
        applyTheme();               // el tema vive en el perfil
        if (LD.views.group) LD.views.group.invalidate();
        render();
      })
      .catch(function (err) {
        /* Sin `code` es que se ha caído la red: se sigue con la copia local,
           que para eso está. Con `code` responde el servidor, y si no deja ni
           crear el perfil es que la cuenta ya no existe (borrada desde el panel
           de Supabase) aunque el navegador guarde todavía un token válido.
           Dejarlo pasar mostraría una app vacía sin explicación. */
        if (!err || !err.code) {
          console.warn('[ListaDo] Arranque con la nube incompleto:', err && err.message);
          ui.toast('No se pudo conectar con la nube; trabajas con la copia local.');
          return;
        }

        console.warn('[ListaDo] La cuenta ya no es válida:', err.code, err.message);
        sesionArrancada = false;
        LD.sync.reset();
        LD.api.signOut().then(function () {
          showApp(false);
          LD.authUI.mensaje = 'Tu sesión ya no es válida. Vuelve a entrar o crea una cuenta.';
          LD.authUI.show('entrar');
          ui.toast('Esa cuenta ya no existe. Entra de nuevo.');
        });
      });
  };

  /** Pinta el indicador de sincronización de la cabecera. */
  function renderSyncStatus(est) {
    var el = U.$('#sync-status');
    if (!el) return;

    if (est.estado === 'apagado' || est.estado === 'sin-sesion') {
      el.classList.add('hidden');
      return;
    }

    var mapa = {
      'al-dia':       ['cloud-check', '',            'Todo guardado en la nube'],
      pendiente:      ['refresh',     'is-working',  est.pendientes + ' cambio(s) por subir'],
      subiendo:       ['refresh',     'is-working',  'Subiendo cambios…'],
      'sin-conexion': ['cloud-off',   'is-offline',  'Sin conexión · ' + est.pendientes + ' cambio(s) en cola'],
      error:          ['cloud-off',   'is-error',    'No se ha podido subir; se reintentará'],
      atascado:       ['alert-triangle', 'is-error', est.atascadas + ' cambio(s) que el servidor rechaza. ' +
                                                     'Se conservan aquí; mira Grupo → Sincronización']
    };
    var conf = mapa[est.estado] || mapa['al-dia'];

    el.className = 'sync-pill ' + conf[1];
    el.title = conf[2];
    el.setAttribute('aria-label', conf[2]);
    el.innerHTML = ico.svg(conf[0]) +
      (est.pendientes ? '<span class="sp-n">' + est.pendientes + '</span>' : '');
  }

  /** Render inicial + latido. Se llama una vez haya datos que pintar. */
  function boot() {
    if (!location.hash) {
      var last = S.state.settings.lastView;
      location.replace('#/' + (LD.views[last] ? last : 'dashboard'));
    }
    showApp(true);
    render();
    startHeartbeat();
    atenderAtajos();
  }

  var latiendo = false;

  function startHeartbeat() {
    if (latiendo) return;
    latiendo = true;

    /* Al cambiar de día se re-pinta todo; el resto del tiempo sólo se refresca
       la franja de "ahora" (así no se pierde lo que estés escribiendo). */
    var day = U.today();
    setInterval(function () {
      if (U.today() !== day) {
        day = U.today();
        render();
        return;
      }
      var v = LD.views[app.current];
      if (v && v.tick && !modals.isOpen()) v.tick();
    }, 30000);
  }

  /* ------------------------- App instalable ------------------------------ */

  /**
   * Registra el service worker: es lo que hace que la app se pueda instalar en
   * el móvil y abrir sin conexión. En file:// no funciona (ni hace falta).
   */
  function registrarServiceWorker() {
    if (!('serviceWorker' in global.navigator)) return;
    if (location.protocol === 'file:') return;

    global.navigator.serviceWorker.register('sw.js').then(function () {
      var primeraVez = !global.navigator.serviceWorker.controller;
      global.navigator.serviceWorker.addEventListener('controllerchange', function () {
        if (primeraVez) return;          // no avisar en la primera instalación
        ui.toast('Hay una versión nueva de ListaDo. Recarga para usarla.', { ms: 8000 });
      });
    }, function (err) {
      console.warn('[ListaDo] No se pudo registrar el service worker:', err);
    });
  }

  /* Chrome avisa de que la app es instalable en cuanto procesa el manifest, y
     eso puede pasar ANTES de que arranque init(). Por eso se escucha aquí, en
     cuanto se carga el archivo, y se guarda la invitación para más tarde. */
  var invitacionInstalar = null;

  global.addEventListener('beforeinstallprompt', function (ev) {
    ev.preventDefault();                 // usamos nuestro botón, no el del navegador
    invitacionInstalar = ev;
    var boton = document.getElementById('install-btn');
    if (boton) boton.classList.remove('hidden');
  });

  /** Botón de instalar de la barra lateral. */
  function prepararInstalacion() {
    var boton = U.$('#install-btn');
    if (!boton) return;

    // Si el aviso llegó antes de llegar aquí, el botón se muestra ya.
    if (invitacionInstalar) boton.classList.remove('hidden');

    boton.addEventListener('click', function () {
      if (!invitacionInstalar) return;
      invitacionInstalar.prompt();
      invitacionInstalar.userChoice.then(function (res) {
        if (res.outcome === 'accepted') boton.classList.add('hidden');
        invitacionInstalar = null;
      });
    });

    global.addEventListener('appinstalled', function () {
      boton.classList.add('hidden');
      invitacionInstalar = null;
      ui.toast('ListaDo instalada. Ya puedes abrirla desde la pantalla de inicio.');
    });
  }

  /** Atajo del icono: ./?nueva=1 abre directamente el formulario. */
  function atenderAtajos() {
    if (location.search.indexOf('nueva') < 0) return;
    history.replaceState(null, '', location.pathname + location.hash);
    setTimeout(function () { abreTarea(null); }, 250);
  }

  function init() {
    hydrateIcons();
    registrarServiceWorker();
    prepararInstalacion();

    if (global.matchMedia) {
      var mq = global.matchMedia('(prefers-color-scheme: dark)');
      var onScheme = function () { if ((S.state.settings.theme || 'auto') === 'auto') applyTheme(); };
      if (mq.addEventListener) mq.addEventListener('change', onScheme);
      else if (mq.addListener) mq.addListener(onScheme);
    }

    document.addEventListener('click', onClick);
    document.addEventListener('change', onChange);
    document.addEventListener('input', onInput);
    document.addEventListener('keydown', onKeydown);
    U.$('#search').addEventListener('input', function (ev) { onSearch(ev.target.value); });

    /* Segmentos de agrupación de la vista Tareas */
    document.addEventListener('click', function (ev) {
      var el = ev.target.closest('[data-group]');
      if (!el) return;
      S.ui.groupBy = el.dataset.group;
      render();
    });

    global.addEventListener('hashchange', render);

    /* Las vistas `selfManaged` (el editor de tareas) se pintan solas: si se
       re-pintaran con cada cambio de datos —una sincronización, por ejemplo—
       se borraría lo que el usuario está escribiendo. */
    S.subscribe(function () {
      var v = LD.views[app.current];
      if (v && v.selfManaged) { renderNav(); return; }
      render();
    });

    /* Sin cuenta configurada, la app funciona como siempre: sólo local. */
    if (!LD.api.enabled) {
      S.load();
      applyTheme();
      LD.sync.setEstado('apagado');
      boot();
      return;
    }

    /* Con cuenta: nada se pinta hasta saber si hay sesión. */
    LD.api.init();
    LD.sync.onStatus(renderSyncStatus);
    showApp(false);
    LD.api.onAuthChange(onAuth);

    LD.api.getSession().then(function (session) {
      LD.api.setSession(session);
      if (session) app.afterLogin();
      else LD.authUI.show('entrar');
    }, function (err) {
      console.warn('[ListaDo] No se pudo comprobar la sesión:', err);
      LD.authUI.show('entrar');
    });
  }

  LD.app = app;

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})(window);
