/* =============================================================================
   views/task-editor.js — pantalla completa para crear y editar tareas.

   Antes era un modal. Ahora es una vista con dos zonas:

     · el formulario
     · un calendario que resalta los días en que tienes clase de la asignatura
       elegida, con atajos del tipo «la próxima clase de BBDD» — que es como
       de verdad se dictan las entregas.

   En el móvil no hay dos columnas: el calendario se coloca justo debajo de la
   fecha (donde hace falta) y los botones de guardar viven pegados abajo, al
   alcance del pulgar.

   La vista se declara `selfManaged`: no se re-pinta cuando cambian los datos,
   porque eso borraría lo que estás escribiendo.
   ============================================================================= */
(function (global) {
  'use strict';

  var LD = global.LD;
  var U = LD.utils, S = LD.store, ui = LD.ui, ico = LD.icons;

  /* Estado de la pantalla mientras está abierta */
  var draft = null;        // copia de trabajo de la tarea
  var editando = null;     // id de la tarea que se edita, o null si es nueva
  var mesVisible = '';     // mes que muestra el calendario
  var retorno = '#/tasks'; // a dónde volver al guardar o cancelar

  var view = {
    id: 'task',
    label: 'Tarea',
    icon: 'file-text',
    countKey: null,
    oculta: true,          // no sale en la barra lateral
    selfManaged: true,     // no re-pintar mientras se escribe

    /**
     * Prepara la pantalla y navega hasta ella.
     * @param {string|null} taskId  null = tarea nueva
     * @param {object} [preset]     valores iniciales (asignatura, fecha, equipo…)
     */
    open: function (taskId, preset) {
      var task = taskId ? S.taskById(taskId) : null;

      editando = task ? task.id : null;
      draft = task
        ? JSON.parse(JSON.stringify(task))
        : S.newTask(Object.assign({ subjectId: asignaturaSugerida() }, preset || {}));

      mesVisible = U.isISO(draft.due) ? draft.due : U.today();

      var actual = location.hash || '';
      if (actual.indexOf('#/task') !== 0) retorno = actual || '#/tasks';

      var destino = '#/task/' + (task ? task.id : 'new');
      if (location.hash === destino) LD.app.render();
      else location.hash = destino;
    },

    /** @param {string} arg  el id de la tarea (o 'new') que viene en la ruta */
    render: function (arg) {
      // Si se llega por la URL directamente (recarga, enlace), se prepara aquí.
      if (!draft || (arg && arg !== 'new' && arg !== editando)) {
        var task = arg && arg !== 'new' ? S.taskById(arg) : null;
        if (!task && arg && arg !== 'new') return noExiste();
        editando = task ? task.id : null;
        draft = task ? JSON.parse(JSON.stringify(task)) : S.newTask({ subjectId: asignaturaSugerida() });
        mesVisible = U.isISO(draft.due) ? draft.due : U.today();
      }

      var isNew = !editando;

      return '<div class="editor">' +
        cabecera(isNew) +
        '<div class="editor-grid">' +
          '<div class="editor-a">' + camposPrincipales() + '</div>' +
          '<aside class="editor-cal">' + panelCalendario() + '</aside>' +
          '<div class="editor-b">' + camposSecundarios() + '</div>' +
        '</div>' +
        barraAcciones(isNew) +
      '</div>';
    },

    /** Engancha los eventos y pone el foco donde toca. */
    mounted: function () {
      if (!draft) return;
      var raiz = U.$('.editor');
      if (!raiz) return;

      pintaSubtareas();
      pintaEquipo();

      // La asignatura manda en el calendario: al cambiarla, se repinta
      var selAsig = U.$('#f-subject');
      if (selAsig) selAsig.addEventListener('change', function () {
        draft.subjectId = selAsig.value;
        refrescaCalendario();
      });

      var campoFecha = U.$('#f-due');
      if (campoFecha) campoFecha.addEventListener('change', function () {
        draft.due = campoFecha.value;
        if (U.isISO(draft.due)) mesVisible = draft.due;
        refrescaCalendario();
      });

      var buscador = U.$('#f-member-search');
      if (buscador) buscador.addEventListener('input', pintaEquipo);

      raiz.addEventListener('keydown', function (ev) {
        if (ev.key !== 'Enter') return;
        if (ev.target.id === 'f-member-search') {
          ev.preventDefault();
          var primero = U.$('[data-role="mlist"] [data-member], [data-role="mlist"] [data-role="create-member"]');
          if (primero) primero.click();
          return;
        }
        if (ev.target.id === 'f-title') { ev.preventDefault(); guardar(); return; }
        if (ev.target.matches && ev.target.matches('[data-role="subs"] .input')) {
          ev.preventDefault();
          nuevaSubtarea();
        }
      });

      if (!editando) {
        var titulo = U.$('#f-title');
        if (titulo) titulo.focus();
      }
    },

    /** Clics de la pantalla; los reparte app.js por delegación. */
    accion: function (que, el) {
      switch (que) {
        case 'save':      guardar(); return true;
        case 'cancel':    salir(); return true;
        case 'delete':    borrar(); return true;
        case 'add-sub':   nuevaSubtarea(); return true;
        case 'rm-sub':    quitaSubtarea(el.dataset.sub); return true;
        case 'pick-day':  eligeDia(el.dataset.date, el.dataset.time); return true;
        case 'cal-prev':  mesVisible = U.shiftMonth(mesVisible, -1); refrescaCalendario(); return true;
        case 'cal-next':  mesVisible = U.shiftMonth(mesVisible, 1); refrescaCalendario(); return true;
        case 'member':    alternaMiembro(el.dataset.member); return true;
        case 'unpick':    quitaMiembro(el.dataset.member); return true;
        case 'new-member':creaMiembro(el.dataset.name); return true;
      }
      return false;
    },

    /** Al salir de la pantalla se olvida el borrador. */
    leave: function () { draft = null; editando = null; }
  };

  /* =========================== Trozos de pantalla ======================== */

  function cabecera(isNew) {
    return '<div class="editor-head">' +
      '<button class="btn btn-ghost btn-icon" data-task="cancel" aria-label="Volver">' +
        ico.svg('chevron-left') + '</button>' +
      '<div class="eh-text">' +
        '<h1>' + (isNew ? 'Nueva tarea' : 'Editar tarea') + '</h1>' +
        '<p class="sub">' + (isNew
          ? 'Elige la asignatura y el calendario te dirá cuándo tienes clase.'
          : 'Los cambios se guardan al pulsar el botón.') + '</p>' +
      '</div>' +
      (isNew ? '' :
        '<button class="btn btn-ghost btn-icon is-danger" data-task="delete" title="Borrar tarea" ' +
        'aria-label="Borrar tarea">' + ico.svg('trash') + '</button>') +
    '</div>';
  }

  function camposPrincipales() {
    var sinAsignaturas = S.state.subjects.length === 0;

    return '<section class="card"><div class="card-body">' +
      '<div class="field">' +
        '<label for="f-title">Título</label>' +
        '<input id="f-title" class="input input-lg" placeholder="Ej.: Entregar memoria de la práctica 3" ' +
          'value="' + U.esc(draft.title) + '">' +
      '</div>' +

      '<div class="form-grid" style="margin-top:13px">' +
        '<div class="field">' +
          '<label for="f-subject">Asignatura</label>' +
          '<select id="f-subject">' + ui.subjectOptions(draft.subjectId, [['', 'Sin asignatura']]) + '</select>' +
          (sinAsignaturas
            ? '<span class="small muted">Aún no tienes asignaturas. <a href="#/subjects">Crea la primera</a>.</span>'
            : '') +
        '</div>' +
        '<div class="field">' +
          '<label for="f-type">Tipo</label>' +
          '<select id="f-type">' + ui.options(S.TYPES, draft.type) + '</select>' +
        '</div>' +
        '<div class="field">' +
          '<label for="f-due">Fecha límite</label>' +
          '<input id="f-due" class="input" type="date" value="' + U.esc(draft.due) + '">' +
        '</div>' +
        '<div class="field">' +
          '<label for="f-time">Hora (opcional)</label>' +
          '<input id="f-time" class="input" type="time" value="' + U.esc(draft.dueTime) + '">' +
        '</div>' +
      '</div>' +
      '<p class="err hidden" data-role="err"></p>' +
    '</div></section>';
  }

  function camposSecundarios() {
    return '<section class="card"><div class="card-body">' +
      '<div class="form-grid">' +
        '<div class="field">' +
          '<label for="f-priority">Prioridad</label>' +
          '<select id="f-priority">' + ui.options(S.PRIORITIES, draft.priority) + '</select>' +
        '</div>' +
        '<div class="field">' +
          '<label for="f-status">Estado</label>' +
          '<select id="f-status">' + ui.options(S.STATUSES, draft.status) + '</select>' +
        '</div>' +
        '<div class="field">' +
          '<label for="f-estimate">Horas estimadas</label>' +
          '<input id="f-estimate" class="input" type="number" min="0" step="0.5" placeholder="p. ej. 3" ' +
            'value="' + (draft.estimate != null ? draft.estimate : '') + '">' +
        '</div>' +
        '<div class="field">' +
          '<label for="f-weight">Peso en la nota (%)</label>' +
          '<input id="f-weight" class="input" type="number" min="0" max="100" step="1" placeholder="p. ej. 20" ' +
            'value="' + (draft.weight != null ? draft.weight : '') + '">' +
        '</div>' +
        '<div class="field span2">' +
          '<label for="f-notes">Notas</label>' +
          '<textarea id="f-notes" placeholder="Enunciado, criterios de evaluación, enlaces, dudas…">' +
            U.esc(draft.notes) + '</textarea>' +
        '</div>' +
        '<div class="field span2">' +
          '<label for="f-member-search">Equipo</label>' +
          '<div class="picker">' +
            '<div class="picker-chips" data-role="chips"></div>' +
            '<input id="f-member-search" class="input" autocomplete="off" ' +
              'placeholder="Buscar compañero por nombre, alias o asignatura…">' +
            '<div class="picker-list" data-role="mlist"></div>' +
          '</div>' +
        '</div>' +
        '<div class="field span2">' +
          '<label>Subtareas</label>' +
          '<div class="sub-editor" data-role="subs"></div>' +
          '<div><button type="button" class="btn btn-sm" data-task="add-sub">' +
            ico.svg('plus') + ' Añadir subtarea</button></div>' +
        '</div>' +
      '</div>' +
    '</div></section>';
  }

  function barraAcciones(isNew) {
    return '<div class="editor-bar">' +
      '<button class="btn" data-task="cancel">Cancelar</button>' +
      '<button class="btn btn-primary" data-task="save">' +
        (isNew ? 'Crear tarea' : 'Guardar cambios') + '</button>' +
    '</div>';
  }

  function noExiste() {
    return '<div class="editor">' +
      '<section class="card"><div class="card-body">' +
      ui.empty('search-x', 'Esa tarea ya no existe',
        'Puede que la hayas borrado o que estuviera en otro dispositivo.',
        { act: 'new-task', label: '+ Nueva tarea' }) +
      '</div></section></div>';
  }

  /* ============================== Calendario ============================= */

  /** Clases de una asignatura, ordenadas por día y hora. */
  function clasesDe(subjectId) {
    if (!subjectId) return [];
    return S.state.schedule
      .filter(function (c) { return c.subjectId === subjectId; })
      .sort(function (a, b) { return (a.day - b.day) || (U.toMin(a.start) - U.toMin(b.start)); });
  }

  /**
   * Próximas veces que toca esa asignatura, a partir de ahora mismo. Si hoy hay
   * clase pero ya ha empezado, no cuenta.
   * @returns {Array<{iso:string, slot:object}>}
   */
  function proximasClases(subjectId, cuantas) {
    var slots = clasesDe(subjectId);
    if (!slots.length) return [];

    var tope = cuantas || 2;
    var hoy = U.today();
    var ahora = U.minutesOfDay();
    var salida = [];

    for (var i = 0; i < 21 && salida.length < tope; i++) {
      var iso = U.addDays(hoy, i);
      var dia = U.dayOf(iso);
      slots.forEach(function (c) {
        if (salida.length >= tope || c.day !== dia) return;
        if (i === 0 && U.toMin(c.start) <= ahora) return;   // la de hoy ya pasó
        salida.push({ iso: iso, slot: c });
      });
    }
    return salida;
  }

  function panelCalendario() {
    var asignatura = S.subjectById(draft.subjectId);
    var color = asignatura ? asignatura.color : 'var(--muted)';
    var slots = clasesDe(draft.subjectId);
    var proximas = proximasClases(draft.subjectId, 2);

    /* --- Atajos --- */
    var chips = [
      atajo('Hoy', U.today(), ''),
      atajo('Mañana', U.addDays(U.today(), 1), '')
    ];
    proximas.forEach(function (p, i) {
      chips.push(atajo(
        (i === 0 ? 'Próxima clase' : 'La siguiente') + ' · ' + U.cap(U.fmtDow(p.iso)) + ' ' + U.fmtDate(p.iso),
        p.iso, p.slot.start, 'es-clase'
      ));
    });
    chips.push(atajo('En una semana', U.addDays(U.today(), 7), ''));
    if (draft.due) chips.push('<button type="button" class="chip-toggle" data-task="pick-day" data-date="">' +
      ico.svg('x') + ' Sin fecha</button>');

    /* --- Rejilla del mes --- */
    var diasDeClase = {};
    slots.forEach(function (c) { diasDeClase[c.day] = c; });

    var conCualquierClase = {};
    S.state.schedule.forEach(function (c) { conCualquierClase[c.day] = true; });

    var mes = U.fromISO(mesVisible).getMonth();
    var semanas = U.monthMatrix(mesVisible);
    var hoy = U.today();

    var rejilla = U.DAYS_SHORT.map(function (d) {
      return '<span class="cm-dow">' + U.cap(d) + '</span>';
    }).join('');

    semanas.forEach(function (semana) {
      semana.forEach(function (iso) {
        var fecha = U.fromISO(iso);
        var clase = diasDeClase[U.dayOf(iso)];
        var tareas = S.state.tasks.filter(function (t) {
          return t.due === iso && t.status !== 'hecha' && t.id !== draft.id;
        }).length;

        var clases = ['cm-day'];
        if (fecha.getMonth() !== mes) clases.push('otro');
        if (iso === hoy) clases.push('es-hoy');
        if (iso === draft.due) clases.push('elegido');
        if (clase) clases.push('con-clase');

        var titulo = U.cap(U.fmtLong(iso));
        if (clase) titulo += ' · clase de ' + S.classShort(clase) + ' a las ' + clase.start;
        if (tareas) titulo += ' · ya tienes ' + tareas + ' ' + U.plural(tareas, 'tarea');

        rejilla += '<button type="button" class="' + clases.join(' ') + '" ' +
          'data-task="pick-day" data-date="' + iso + '"' +
          (clase ? ' data-time="' + clase.start + '"' : '') +
          ' title="' + U.esc(titulo) + '">' +
          '<span class="cm-n">' + fecha.getDate() + '</span>' +
          (clase ? '<span class="cm-clase">' + clase.start.slice(0, 2) + 'h</span>' : '') +
          (tareas ? '<span class="cm-tareas">' + (tareas > 3 ? '3+' : tareas) + '</span>' : '') +
        '</button>';
      });
    });

    /* --- Pie explicativo --- */
    var pie;
    if (!S.state.schedule.length) {
      pie = 'No has puesto tu horario todavía. <a href="#/schedule">Impórtalo</a> y aquí verás ' +
            'los días de clase de cada asignatura.';
    } else if (!asignatura) {
      pie = 'Elige una asignatura arriba y se marcarán sus días de clase.';
    } else if (!slots.length) {
      pie = U.esc(asignatura.name) + ' no tiene clases en tu horario.';
    } else {
      var dias = slots.map(function (c) { return U.dayLabel(c.day); })
        .filter(function (d, i, a) { return a.indexOf(d) === i; });
      pie = '<strong>' + U.esc(asignatura.name) + '</strong> tiene clase los ' +
        dias.join(', ').replace(/, ([^,]*)$/, ' y $1') +
        ' · ' + slots[0].start + (slots[0].room ? ' · ' + U.esc(slots[0].room) : '');
    }

    return '<section class="card cal-mini" style="--c:' + U.esc(color) + '">' +
      '<div class="card-head">' +
        '<h2>' + ico.svg('calendar-days') + 'Cuándo se entrega</h2>' +
      '</div>' +
      '<div class="card-body">' +
        '<div class="when-chips">' + chips.join('') + '</div>' +
        '<div class="cm-top">' +
          '<button class="btn btn-sm btn-icon btn-ghost" data-task="cal-prev" aria-label="Mes anterior">' +
            ico.svg('chevron-left') + '</button>' +
          '<strong>' + U.esc(U.cap(U.fmtMonth(mesVisible))) + '</strong>' +
          '<button class="btn btn-sm btn-icon btn-ghost" data-task="cal-next" aria-label="Mes siguiente">' +
            ico.svg('chevron-right') + '</button>' +
        '</div>' +
        '<div class="cm-grid">' + rejilla + '</div>' +
        '<p class="small muted cm-pie">' + pie + '</p>' +
      '</div>' +
    '</section>';
  }

  function atajo(texto, iso, hora, extra) {
    var activo = draft.due === iso;
    return '<button type="button" class="chip-toggle' + (activo ? ' on' : '') +
      (extra ? ' ' + extra : '') + '" data-task="pick-day" data-date="' + iso + '"' +
      (hora ? ' data-time="' + hora + '"' : '') + '>' +
      (extra === 'es-clase' ? ico.svg('table') : '') + U.esc(texto) + '</button>';
  }

  /** Repinta sólo el panel del calendario, sin tocar lo que se está escribiendo. */
  function refrescaCalendario() {
    var host = U.$('.editor-cal');
    if (!host) return;
    leeFormulario();                 // para que el panel vea la asignatura actual
    host.innerHTML = panelCalendario();
  }

  function eligeDia(iso, hora) {
    leeFormulario();
    draft.due = iso || '';
    if (U.isISO(iso)) mesVisible = iso;

    var campoFecha = U.$('#f-due');
    if (campoFecha) campoFecha.value = draft.due;

    // Si el día se ha elegido por ser día de clase, se propone esa hora
    var campoHora = U.$('#f-time');
    if (campoHora && hora && !campoHora.value) {
      campoHora.value = hora;
      draft.dueTime = hora;
    }
    if (!iso && campoHora) { campoHora.value = ''; draft.dueTime = ''; }

    refrescaCalendario();
  }

  /* ============================== Subtareas ============================== */

  function pintaSubtareas() {
    var host = U.$('[data-role="subs"]');
    if (!host) return;

    if (!draft.subtasks.length) {
      host.innerHTML = '<span class="small muted">Divide la tarea en pasos si es larga (opcional).</span>';
      return;
    }
    host.innerHTML = draft.subtasks.map(function (s) {
      return '<div class="se-row" data-sub="' + s.id + '">' +
        '<input type="checkbox" data-role="sub-done"' + (s.done ? ' checked' : '') + ' aria-label="Hecha">' +
        '<input class="input" data-role="sub-text" value="' + U.esc(s.text) + '" placeholder="Paso…">' +
        '<button type="button" class="btn btn-sm btn-icon btn-ghost" data-task="rm-sub" ' +
          'data-sub="' + s.id + '" aria-label="Quitar">' + ico.svg('x') + '</button>' +
      '</div>';
    }).join('');
  }

  function nuevaSubtarea() {
    leeSubtareas();
    draft.subtasks.push({ id: U.uid(), text: '', done: false });
    pintaSubtareas();
    var campos = U.$$('[data-role="subs"] .input');
    if (campos.length) campos[campos.length - 1].focus();
  }

  function quitaSubtarea(id) {
    leeSubtareas();
    draft.subtasks = draft.subtasks.filter(function (s) { return s.id !== id; });
    pintaSubtareas();
  }

  function leeSubtareas() {
    var filas = U.$$('[data-role="subs"] .se-row');
    if (!filas.length) return;
    draft.subtasks = filas.map(function (fila) {
      return {
        id: fila.dataset.sub,
        text: fila.querySelector('[data-role="sub-text"]').value,
        done: fila.querySelector('[data-role="sub-done"]').checked
      };
    });
  }

  /* ================================ Equipo =============================== */

  function pintaEquipo() {
    var chips = U.$('[data-role="chips"]');
    var lista = U.$('[data-role="mlist"]');
    if (!chips || !lista) return;

    var texto = (U.$('#f-member-search') || {}).value || '';
    var elegidos = draft.memberIds.map(function (id) { return S.memberById(id); }).filter(Boolean);

    chips.innerHTML = elegidos.length
      ? elegidos.map(function (m) { return ui.memberChip(m, { remove: true }); }).join('')
      : '<span class="small muted">Nadie asignado. Busca y selecciona a quien participe.</span>';

    if (!S.state.members.length && !texto) {
      lista.innerHTML = '<p class="small muted" style="padding:8px 10px">' +
        'Todavía no tienes compañeros. Escribe un nombre aquí para crear el primero, ' +
        'o gestiónalos en la vista Equipo.</p>';
      return;
    }

    var resultados = S.searchMembers(texto).slice(0, 8);
    var exacto = S.state.members.some(function (m) { return U.norm(m.name) === U.norm(texto); });

    var filas = resultados.map(function (m) {
      var on = draft.memberIds.indexOf(m.id) >= 0;
      var asigs = (m.subjectIds || []).map(function (id) { return S.subjectLabel(id); }).join(' · ');
      return '<button type="button" class="pick-row' + (on ? ' on' : '') + '" ' +
        'data-task="member" data-member="' + m.id + '">' +
        ui.avatar(m) +
        '<span class="pr-text"><strong>' + U.esc(m.name) + '</strong>' +
          (m.alias || asigs ? '<small>' + U.esc([m.alias, asigs].filter(Boolean).join(' · ')) + '</small>' : '') +
        '</span>' +
        '<span class="pr-check">' + (on ? ico.svg('check') : '') + '</span>' +
      '</button>';
    });

    if (texto.trim() && !exacto) {
      filas.push('<button type="button" class="pick-row pick-new" data-task="new-member" ' +
        'data-name="' + U.esc(texto.trim()) + '">' + ico.svg('user-plus') +
        '<span class="pr-text">Crear «' + U.esc(texto.trim()) + '» como compañero</span></button>');
    }

    lista.innerHTML = filas.length
      ? filas.join('')
      : '<p class="small muted" style="padding:8px 10px">Sin coincidencias.</p>';
  }

  function alternaMiembro(id) {
    var at = draft.memberIds.indexOf(id);
    if (at >= 0) draft.memberIds.splice(at, 1);
    else draft.memberIds.push(id);
    pintaEquipo();
  }

  function quitaMiembro(id) {
    draft.memberIds = draft.memberIds.filter(function (x) { return x !== id; });
    pintaEquipo();
  }

  function creaMiembro(nombre) {
    var miembro = S.addMember({ name: nombre });
    draft.memberIds.push(miembro.id);
    var buscador = U.$('#f-member-search');
    if (buscador) buscador.value = '';
    pintaEquipo();
    ui.toast('Compañero creado: ' + miembro.name);
  }

  /* ============================== Guardar ================================ */

  /** Pasa al borrador lo que hay ahora mismo en los campos. */
  function leeFormulario() {
    var valor = function (sel) { var el = U.$(sel); return el ? el.value : ''; };
    var numero = function (sel) { var v = valor(sel); return v === '' ? null : Number(v); };

    draft.title = valor('#f-title');
    draft.subjectId = valor('#f-subject');
    draft.type = valor('#f-type') || draft.type;
    draft.due = valor('#f-due');
    draft.dueTime = valor('#f-time');
    draft.priority = valor('#f-priority') || draft.priority;
    draft.status = valor('#f-status') || draft.status;
    draft.estimate = numero('#f-estimate');
    draft.weight = numero('#f-weight');
    draft.notes = valor('#f-notes');
    leeSubtareas();
  }

  function guardar() {
    leeFormulario();

    var titulo = (draft.title || '').trim();
    if (!titulo) {
      var err = U.$('[data-role="err"]');
      if (err) { err.textContent = 'Ponle un título a la tarea.'; err.classList.remove('hidden'); }
      var campo = U.$('#f-title');
      if (campo) { campo.focus(); campo.scrollIntoView({ block: 'center' }); }
      return;
    }

    var patch = {
      title: titulo,
      subjectId: draft.subjectId,
      type: draft.type,
      due: draft.due,
      dueTime: draft.dueTime,
      priority: draft.priority,
      status: draft.status,
      estimate: draft.estimate,
      weight: draft.weight,
      notes: (draft.notes || '').trim(),
      subtasks: draft.subtasks.filter(function (s) { return s.text.trim(); }),
      memberIds: draft.memberIds.slice()
    };

    if (editando) {
      S.updateTask(editando, patch);
      ui.toast('Cambios guardados.');
    } else {
      S.addTask(patch);
      ui.toast('Tarea creada.');
    }
    salir();
  }

  function borrar() {
    var id = editando;
    if (!id) return;
    salir();
    LD.app.deleteTaskWithUndo(id);
  }

  function salir() {
    draft = null;
    editando = null;
    location.hash = retorno || '#/tasks';
  }

  /**
   * Asignatura sugerida al crear: la única que hay, la del filtro activo o,
   * en su defecto, la de la última tarea creada.
   */
  function asignaturaSugerida() {
    var subs = S.state.subjects;
    if (!subs.length) return '';
    if (subs.length === 1) return subs[0].id;
    if (S.ui.subjectId && S.ui.subjectId !== 'all' && S.ui.subjectId !== 'none') return S.ui.subjectId;
    if (S.ui.dashSubject && S.ui.dashSubject !== 'all' && S.ui.dashSubject !== 'none') return S.ui.dashSubject;

    var reciente = S.state.tasks.slice().sort(function (a, b) {
      return String(b.createdAt).localeCompare(String(a.createdAt));
    }).find(function (t) { return t.subjectId; });
    return reciente ? reciente.subjectId : '';
  }

  LD.views = LD.views || {};
  LD.views.task = view;
})(window);
