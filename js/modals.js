/* =============================================================================
   modals.js — diálogos: formulario de tarea, formulario de asignatura y
   confirmación. Sólo hay un modal abierto a la vez.
   Expone window.LD.modals
   ============================================================================= */
(function (global) {
  'use strict';

  var LD = global.LD || (global.LD = {});
  var U = LD.utils;
  var S = LD.store;
  var ui = LD.ui;
  var ico = LD.icons;
  var modals = {};

  var root = null;
  var lastFocus = null;

  function getRoot() { return root || (root = U.$('#modal-root')); }

  modals.isOpen = function () { return !!getRoot().firstChild; };

  modals.close = function () {
    getRoot().innerHTML = '';
    document.body.style.overflow = '';
    if (lastFocus && lastFocus.isConnected) lastFocus.focus();
    lastFocus = null;
  };

  /**
   * Pinta un modal.
   * @param {string} html contenido de .modal
   * @param {{narrow?:boolean, onMount?:Function}} [opts]
   */
  function open(html, opts) {
    opts = opts || {};
    lastFocus = document.activeElement;
    var wrap = document.createElement('div');
    wrap.className = 'modal-backdrop';
    wrap.innerHTML = '<div class="modal' + (opts.narrow ? ' narrow' : '') + '" role="dialog" aria-modal="true">' + html + '</div>';

    wrap.addEventListener('mousedown', function (ev) {
      if (ev.target === wrap) modals.close();
    });

    getRoot().innerHTML = '';
    getRoot().appendChild(wrap);
    document.body.style.overflow = 'hidden';

    if (opts.onMount) opts.onMount(wrap);

    var first = wrap.querySelector('[data-autofocus]') || wrap.querySelector('input, textarea, select, button');
    if (first) first.focus();
    return wrap;
  }

  modals.open = open;

  /* --------------------------- Confirmación ------------------------------ */

  /**
   * @returns {Promise<boolean>}
   */
  modals.confirm = function (o) {
    return new Promise(function (resolve) {
      var wrap = open(
        '<div class="modal-head"><h2>' + U.esc(o.title) + '</h2></div>' +
        '<div class="modal-body"><p>' + U.esc(o.text || '') + '</p></div>' +
        '<div class="modal-foot">' +
        '<button class="btn" data-role="cancel">Cancelar</button>' +
        '<button class="btn ' + (o.danger ? 'btn-danger' : 'btn-primary') + '" data-role="ok" data-autofocus>' +
        U.esc(o.okLabel || 'Aceptar') + '</button>' +
        '</div>', { narrow: true });

      var finish = function (value) { modals.close(); resolve(value); };
      wrap.querySelector('[data-role="cancel"]').addEventListener('click', function () { finish(false); });
      wrap.querySelector('[data-role="ok"]').addEventListener('click', function () { finish(true); });
      wrap.addEventListener('mousedown', function (ev) { if (ev.target === wrap) resolve(false); });
    });
  };

  /* ------------------------ Formulario de tarea -------------------------- */

  /**
   * Crea o edita una tarea.
   * @param {string|null} taskId  null = nueva
   * @param {object} [preset]     valores iniciales al crear
   */
  /**
   * Compatibilidad: el formulario de tarea ya no es un modal, es la vista
   * completa js/views/task-editor.js (con el calendario de clases al lado).
   * Se mantiene el nombre para no romper las llamadas de siempre.
   */
  modals.taskForm = function (taskId, preset) {
    LD.views.task.open(taskId, preset);
  };

  /* --------------------- Formulario de asignatura ------------------------ */

  modals.subjectForm = function (subjectId) {
    if (!S.isGroupOwner()) {
      ui.toast('Las asignaturas las gestiona quien creó el grupo.');
      return;
    }
    var subject = subjectId ? S.subjectById(subjectId) : null;
    var isNew = !subject;
    var color = subject ? subject.color : S.PALETTE[S.state.subjects.length % S.PALETTE.length];

    var html =
      '<div class="modal-head"><h2>' + (isNew ? 'Nueva asignatura' : 'Editar asignatura') + '</h2>' +
      '<button class="btn btn-ghost btn-sm btn-icon" data-role="x" aria-label="Cerrar">' + ico.svg('x') + '</button></div>' +
      '<div class="modal-body">' +
        '<div class="field">' +
          '<label for="s-name">Nombre</label>' +
          '<input id="s-name" class="input" data-autofocus placeholder="Ej.: Bases de Datos" value="' + U.esc(subject ? subject.name : '') + '">' +
        '</div>' +
        '<div class="form-grid">' +
          '<div class="field">' +
            '<label for="s-code">Abreviatura</label>' +
            '<input id="s-code" class="input" placeholder="BBDD" maxlength="10" value="' + U.esc(subject ? subject.code : '') + '">' +
            '<span class="small muted">Se usa en las etiquetas y en <code>@BBDD</code>.</span>' +
          '</div>' +
          '<div class="field">' +
            '<label for="s-teacher">Profesor/a</label>' +
            '<input id="s-teacher" class="input" placeholder="Opcional" value="' + U.esc(subject ? subject.teacher : '') + '">' +
          '</div>' +
          '<div class="field span2">' +
            '<label>Color</label>' + ui.swatches(color) +
          '</div>' +
        '</div>' +
        '<p class="err hidden" data-role="err"></p>' +
      '</div>' +
      '<div class="modal-foot">' +
        (isNew ? '' : '<button class="btn btn-ghost is-danger left" data-role="del">Borrar</button>') +
        '<button class="btn" data-role="cancel">Cancelar</button>' +
        '<button class="btn btn-primary" data-role="save">' + (isNew ? 'Crear' : 'Guardar') + '</button>' +
      '</div>';

    var wrap = open(html, {
      narrow: false,
      onMount: function (w) {
        w.querySelector('[data-role="swatches"]').addEventListener('click', function (ev) {
          var sw = ev.target.closest('.swatch');
          if (!sw) return;
          color = sw.dataset.color;
          U.$$('.swatch', w).forEach(function (n) { n.classList.toggle('active', n === sw); });
        });

        w.querySelector('[data-role="x"]').addEventListener('click', modals.close);
        w.querySelector('[data-role="cancel"]').addEventListener('click', modals.close);
        w.querySelector('[data-role="save"]').addEventListener('click', save);
        w.addEventListener('keydown', function (ev) {
          if (ev.key === 'Enter' && ev.target.classList.contains('input')) { ev.preventDefault(); save(); }
        });

        var del = w.querySelector('[data-role="del"]');
        if (del) del.addEventListener('click', function () {
          var n = S.state.tasks.filter(function (t) { return t.subjectId === subject.id; }).length;
          modals.close();
          modals.confirm({
            title: 'Borrar "' + subject.name + '"',
            text: n ? 'Sus ' + n + ' ' + U.plural(n, 'tarea') + ' no se borran: quedarán como "Sin asignatura".'
                    : 'No tiene tareas asociadas.',
            okLabel: 'Borrar', danger: true
          }).then(function (ok) {
            if (!ok) return;
            S.deleteSubject(subject.id);
            ui.toast('Asignatura borrada.');
          });
        });
      }
    });

    function save() {
      var name = wrap.querySelector('#s-name').value.trim();
      var err = wrap.querySelector('[data-role="err"]');
      if (!name) {
        err.textContent = 'La asignatura necesita un nombre.';
        err.classList.remove('hidden');
        return;
      }
      var patch = {
        name: name,
        code: wrap.querySelector('#s-code').value.trim(),
        teacher: wrap.querySelector('#s-teacher').value.trim(),
        color: color
      };
      if (isNew) { S.addSubject(patch); ui.toast('Asignatura creada.'); }
      else { S.updateSubject(subject.id, patch); ui.toast('Asignatura actualizada.'); }
      modals.close();
    }
  };

  /* ---------------------- Formulario de compañero ------------------------ */

  modals.memberForm = function (memberId) {
    var member = memberId ? S.memberById(memberId) : null;
    var isNew = !member;
    var color = member ? member.color : S.PALETTE[(S.state.members.length + 2) % S.PALETTE.length];
    var subjectIds = member ? (member.subjectIds || []).slice() : [];

    var html =
      '<div class="modal-head"><h2>' + (isNew ? 'Nuevo compañero' : 'Editar compañero') + '</h2>' +
      '<button class="btn btn-ghost btn-sm btn-icon" data-role="x" aria-label="Cerrar">' + ico.svg('x') + '</button></div>' +
      '<div class="modal-body">' +
        '<div class="field">' +
          '<label for="m-name">Nombre</label>' +
          '<input id="m-name" class="input" data-autofocus placeholder="Ej.: Lucía Ferrer" value="' + U.esc(member ? member.name : '') + '">' +
        '</div>' +
        '<div class="form-grid">' +
          '<div class="field">' +
            '<label for="m-alias">Cómo le llamas</label>' +
            '<input id="m-alias" class="input" placeholder="Alias (opcional)" value="' + U.esc(member ? member.alias : '') + '">' +
          '</div>' +
          '<div class="field">' +
            '<label for="m-email">Correo</label>' +
            '<input id="m-email" class="input" type="email" placeholder="nombre@uni.es" value="' + U.esc(member ? member.email : '') + '">' +
          '</div>' +
          '<div class="field">' +
            '<label for="m-phone">Teléfono</label>' +
            '<input id="m-phone" class="input" placeholder="Opcional" value="' + U.esc(member ? member.phone : '') + '">' +
          '</div>' +
          '<div class="field">' +
            '<label>Color</label>' + ui.swatches(color) +
          '</div>' +
          '<div class="field span2">' +
            '<label>Asignaturas que comparte</label>' +
            (S.state.subjects.length
              ? '<div class="toggle-chips" data-role="subj-toggles">' + S.state.subjects.map(function (sub) {
                  var on = subjectIds.indexOf(sub.id) >= 0;
                  return '<button type="button" class="chip-toggle' + (on ? ' on' : '') + '" ' +
                    'style="--c:' + U.esc(sub.color) + '" data-subject="' + sub.id + '">' +
                    '<i class="dot"></i>' + U.esc(sub.code || sub.name) + '</button>';
                }).join('') + '</div>'
              : '<span class="small muted">Crea antes alguna asignatura.</span>') +
          '</div>' +
          '<div class="field span2">' +
            '<label for="m-notes">Notas</label>' +
            '<textarea id="m-notes" placeholder="De qué se encarga, cuándo coincidís, cómo contactarle…">' + U.esc(member ? member.notes : '') + '</textarea>' +
          '</div>' +
        '</div>' +
        '<p class="err hidden" data-role="err"></p>' +
      '</div>' +
      '<div class="modal-foot">' +
        (isNew ? '' : '<button class="btn btn-ghost is-danger left" data-role="del">Borrar</button>') +
        '<button class="btn" data-role="cancel">Cancelar</button>' +
        '<button class="btn btn-primary" data-role="save">' + (isNew ? 'Crear' : 'Guardar') + '</button>' +
      '</div>';

    var wrap = open(html, {
      onMount: function (w) {
        w.querySelector('[data-role="swatches"]').addEventListener('click', function (ev) {
          var sw = ev.target.closest('.swatch');
          if (!sw) return;
          color = sw.dataset.color;
          U.$$('.swatch', w).forEach(function (n) { n.classList.toggle('active', n === sw); });
        });

        var toggles = w.querySelector('[data-role="subj-toggles"]');
        if (toggles) toggles.addEventListener('click', function (ev) {
          var chip = ev.target.closest('[data-subject]');
          if (!chip) return;
          var id = chip.dataset.subject;
          var at = subjectIds.indexOf(id);
          if (at >= 0) subjectIds.splice(at, 1);
          else subjectIds.push(id);
          chip.classList.toggle('on', at < 0);
        });

        w.querySelector('[data-role="x"]').addEventListener('click', modals.close);
        w.querySelector('[data-role="cancel"]').addEventListener('click', modals.close);
        w.querySelector('[data-role="save"]').addEventListener('click', save);
        w.addEventListener('keydown', function (ev) {
          if (ev.key === 'Enter' && ev.target.classList.contains('input')) { ev.preventDefault(); save(); }
        });

        var del = w.querySelector('[data-role="del"]');
        if (del) del.addEventListener('click', function () {
          var n = S.state.tasks.filter(function (t) { return (t.memberIds || []).indexOf(member.id) >= 0; }).length;
          modals.close();
          modals.confirm({
            title: 'Borrar a ' + member.name,
            text: n ? 'Se quitará de las ' + n + ' ' + U.plural(n, 'tarea') + ' en las que participa. Las tareas no se borran.'
                    : 'No participa en ninguna tarea.',
            okLabel: 'Borrar', danger: true
          }).then(function (ok) {
            if (!ok) return;
            S.deleteMember(member.id);
            ui.toast('Compañero borrado.');
          });
        });
      }
    });

    function save() {
      var name = wrap.querySelector('#m-name').value.trim();
      var err = wrap.querySelector('[data-role="err"]');
      if (!name) {
        err.textContent = 'Hace falta un nombre.';
        err.classList.remove('hidden');
        return;
      }
      var patch = {
        name: name,
        alias: wrap.querySelector('#m-alias').value.trim(),
        email: wrap.querySelector('#m-email').value.trim(),
        phone: wrap.querySelector('#m-phone').value.trim(),
        notes: wrap.querySelector('#m-notes').value.trim(),
        subjectIds: subjectIds,
        color: color
      };
      if (isNew) { S.addMember(patch); ui.toast('Compañero añadido.'); }
      else { S.updateMember(member.id, patch); ui.toast('Compañero actualizado.'); }
      modals.close();
    }
  };

  /* -------------------------- Formulario de clase ------------------------ */

  /**
   * @param {string|null} classId null = nueva
   * @param {{day?:number, start?:string}} [preset]
   */
  modals.classForm = function (classId, preset) {
    if (!S.isGroupOwner()) {
      ui.toast('El horario lo gestiona quien creó el grupo.');
      return;
    }
    var slot = classId ? S.classById(classId) : null;
    var isNew = !slot;
    preset = preset || {};
    var base = slot || {
      subjectId: S.state.subjects.length === 1 ? S.state.subjects[0].id : '',
      title: '', day: preset.day || U.dayOf(new Date()),
      start: preset.start || '09:00', end: preset.start ? U.fromMin(U.toMin(preset.start) + 60) : '11:00',
      room: '', teacher: ''
    };
    var days = [base.day];

    var html =
      '<div class="modal-head"><h2>' + (isNew ? 'Nueva clase' : 'Editar clase') + '</h2>' +
      '<button class="btn btn-ghost btn-sm btn-icon" data-role="x" aria-label="Cerrar">' + ico.svg('x') + '</button></div>' +
      '<div class="modal-body">' +
        '<div class="form-grid">' +
          '<div class="field span2">' +
            '<label for="c-subject">Asignatura</label>' +
            '<select id="c-subject" data-autofocus>' + ui.subjectOptions(base.subjectId, [['', 'Otra (escribir nombre)']]) + '</select>' +
          '</div>' +
          '<div class="field span2' + (base.subjectId ? ' hidden' : '') + '" data-role="title-field">' +
            '<label for="c-title">Nombre de la clase</label>' +
            '<input id="c-title" class="input" placeholder="Ej.: Tutoría de proyecto" value="' + U.esc(base.title) + '">' +
          '</div>' +
          '<div class="field">' +
            '<label for="c-start">Empieza</label>' +
            '<input id="c-start" class="input" type="time" value="' + U.esc(base.start) + '">' +
          '</div>' +
          '<div class="field">' +
            '<label for="c-end">Termina</label>' +
            '<input id="c-end" class="input" type="time" value="' + U.esc(base.end) + '">' +
          '</div>' +
          '<div class="field">' +
            '<label for="c-room">Aula</label>' +
            '<input id="c-room" class="input" placeholder="Opcional" value="' + U.esc(base.room) + '">' +
          '</div>' +
          '<div class="field">' +
            '<label for="c-teacher">Profesor/a</label>' +
            '<input id="c-teacher" class="input" placeholder="Opcional" value="' + U.esc(base.teacher) + '">' +
          '</div>' +
          '<div class="field span2">' +
            '<label>' + (isNew ? 'Días (puedes marcar varios)' : 'Día') + '</label>' +
            '<div class="toggle-chips" data-role="days">' +
              U.DAYS.map(function (name, i) {
                var d = i + 1;
                return '<button type="button" class="chip-toggle' + (days.indexOf(d) >= 0 ? ' on' : '') + '" data-day="' + d + '">' +
                  U.cap(U.DAYS_SHORT[i]) + '</button>';
              }).join('') +
            '</div>' +
            (isNew ? '<span class="small muted">Se creará la misma clase en cada día marcado.</span>' : '') +
          '</div>' +
        '</div>' +
        '<p class="err hidden" data-role="err"></p>' +
      '</div>' +
      '<div class="modal-foot">' +
        (isNew ? '' : '<button class="btn btn-ghost is-danger left" data-role="del">Borrar</button>') +
        '<button class="btn" data-role="cancel">Cancelar</button>' +
        '<button class="btn btn-primary" data-role="save">' + (isNew ? 'Añadir al horario' : 'Guardar') + '</button>' +
      '</div>';

    var wrap = open(html, {
      onMount: function (w) {
        // El nombre libre sólo aparece si no hay asignatura elegida
        w.querySelector('#c-subject').addEventListener('change', function (ev) {
          w.querySelector('[data-role="title-field"]').classList.toggle('hidden', !!ev.target.value);
        });

        w.querySelector('[data-role="days"]').addEventListener('click', function (ev) {
          var chip = ev.target.closest('[data-day]');
          if (!chip) return;
          var d = parseInt(chip.dataset.day, 10);
          if (isNew) {
            var at = days.indexOf(d);
            if (at >= 0) days.splice(at, 1);
            else days.push(d);
          } else {
            days = [d];
          }
          U.$$('[data-day]', w).forEach(function (n) {
            n.classList.toggle('on', days.indexOf(parseInt(n.dataset.day, 10)) >= 0);
          });
        });

        w.querySelector('[data-role="x"]').addEventListener('click', modals.close);
        w.querySelector('[data-role="cancel"]').addEventListener('click', modals.close);
        w.querySelector('[data-role="save"]').addEventListener('click', save);

        var del = w.querySelector('[data-role="del"]');
        if (del) del.addEventListener('click', function () {
          modals.close();
          LD.app.deleteClassWithUndo(slot.id);
        });
      }
    });

    function save() {
      var w = wrap;
      var err = w.querySelector('[data-role="err"]');
      var fail = function (msg) {
        err.textContent = msg;
        err.classList.remove('hidden');
      };

      var subjectId = w.querySelector('#c-subject').value;
      var title = w.querySelector('#c-title').value.trim();
      var start = w.querySelector('#c-start').value;
      var end = w.querySelector('#c-end').value;

      if (!subjectId && !title) return fail('Elige una asignatura o escribe el nombre de la clase.');
      if (!U.isTime(start) || !U.isTime(end)) return fail('Pon la hora de inicio y de fin.');
      if (U.toMin(end) <= U.toMin(start)) return fail('La clase no puede terminar antes de empezar.');
      if (!days.length) return fail('Marca al menos un día.');

      var patch = {
        subjectId: subjectId,
        title: subjectId ? '' : title,
        start: start, end: end,
        room: w.querySelector('#c-room').value.trim(),
        teacher: w.querySelector('#c-teacher').value.trim()
      };

      if (isNew) {
        days.forEach(function (d, i) {
          S.addClass(Object.assign({}, patch, { day: d, silent: i < days.length - 1 }));
        });
        ui.toast(days.length > 1 ? days.length + ' clases añadidas.' : 'Clase añadida.');
      } else {
        S.updateClass(slot.id, Object.assign({}, patch, { day: days[0] }));
        ui.toast('Clase actualizada.');
      }
      modals.close();
    }
  };

  /* ------------------------- Importar el horario ------------------------- */

  modals.importSchedule = function () {
    if (!S.isGroupOwner()) {
      ui.toast('El horario lo gestiona quien creó el grupo.');
      return;
    }
    var html =
      '<div class="modal-head"><h2>Importar horario</h2>' +
      '<button class="btn btn-ghost btn-sm btn-icon" data-role="x" aria-label="Cerrar">' + ico.svg('x') + '</button></div>' +
      '<div class="modal-body">' +
        '<p class="small muted">' +
          'Vale un archivo <strong>.ics</strong> (lo que exportan Calendario.app, Google Calendar o el campus ' +
          'virtual) o una <strong>lista de clases</strong> en texto. También puedes pegar el contenido aquí abajo.' +
        '</p>' +

        '<div class="row" style="flex-wrap:wrap">' +
          '<button class="btn btn-sm" data-role="pick-file">' + ico.svg('upload') + ' Elegir archivo…</button>' +
          '<button class="btn btn-sm" data-role="template">Rellenar con una plantilla</button>' +
          '<input type="file" data-role="file" accept=".ics,.csv,.txt,text/calendar,text/csv,text/plain" hidden>' +
        '</div>' +

        '<div class="field">' +
          '<label for="imp-text">Contenido</label>' +
          '<textarea id="imp-text" style="min-height:150px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.82rem" ' +
            'placeholder="lunes;09:00;11:00;Programación Avanzada;Aula 2.4&#10;martes;08:30;10:30;Bases de Datos;Lab 3"></textarea>' +
        '</div>' +

        '<div class="row" style="flex-wrap:wrap;gap:14px">' +
          '<label class="check-inline"><input type="checkbox" data-role="create-subjects" checked> Crear las asignaturas que no existan</label>' +
          '<label class="check-inline"><input type="checkbox" data-role="replace"> Reemplazar el horario actual</label>' +
        '</div>' +

        '<div data-role="preview"></div>' +
      '</div>' +
      '<div class="modal-foot">' +
        '<button class="btn" data-role="cancel">Cancelar</button>' +
        '<button class="btn btn-primary" data-role="save" disabled>Importar</button>' +
      '</div>';

    var parsed = { slots: [], errors: [] };

    var wrap = open(html, {
      onMount: function (w) {
        var textarea = w.querySelector('#imp-text');
        var fileInput = w.querySelector('[data-role="file"]');

        var refresh = function () {
          parsed = LD.importers.parse(textarea.value);
          renderPreview(w, parsed, textarea.value);
        };

        textarea.addEventListener('input', U.debounce(refresh, 250));

        w.querySelector('[data-role="pick-file"]').addEventListener('click', function () { fileInput.click(); });
        fileInput.addEventListener('change', function () {
          var file = fileInput.files && fileInput.files[0];
          if (!file) return;
          var reader = new FileReader();
          reader.onload = function () {
            textarea.value = String(reader.result);
            refresh();
            ui.toast('Archivo leído: ' + file.name);
          };
          reader.onerror = function () { ui.toast('No se pudo leer el archivo.'); };
          reader.readAsText(file);
        });

        w.querySelector('[data-role="template"]').addEventListener('click', function () {
          textarea.value = LD.importers.csvTemplate();
          refresh();
          textarea.focus();
        });

        w.querySelector('[data-role="x"]').addEventListener('click', modals.close);
        w.querySelector('[data-role="cancel"]').addEventListener('click', modals.close);
        w.querySelector('[data-role="save"]').addEventListener('click', function () {
          if (!parsed.slots.length) return;
          var res = S.importSchedule(parsed.slots, {
            replace: w.querySelector('[data-role="replace"]').checked,
            createSubjects: w.querySelector('[data-role="create-subjects"]').checked
          });
          modals.close();
          ui.toast(res.added + ' ' + U.plural(res.added, 'clase') + ' importadas' +
            (res.subjects ? ' · ' + res.subjects + ' ' + U.plural(res.subjects, 'asignatura') + ' nuevas' : '') +
            (res.skipped ? ' · ' + res.skipped + ' repetidas' : '') + '.');
        });
      }
    });

    function renderPreview(w, res, raw) {
      var host = w.querySelector('[data-role="preview"]');
      var btn = w.querySelector('[data-role="save"]');

      if (!raw.trim()) {
        host.innerHTML = '';
        btn.disabled = true;
        return;
      }

      var kind = LD.importers.detect(raw) === 'ics' ? 'archivo .ics' : 'lista de texto';
      var byDay = {};
      res.slots.forEach(function (s) { (byDay[s.day] = byDay[s.day] || []).push(s); });

      host.innerHTML =
        '<div class="card" style="margin-top:4px">' +
          '<div class="card-head"><h3>' + ico.svg('table') + 'Vista previa</h3>' +
            '<span class="tag' + (res.slots.length ? '' : ' alert') + '">' + res.slots.length + ' ' + U.plural(res.slots.length, 'clase') + '</span>' +
          '</div>' +
          '<div class="card-body">' +
            '<p class="small muted">Detectado como ' + kind + '.' +
              (res.allDay
                ? (res.allDay === 1
                    ? ' Se ha ignorado 1 evento de día completo.'
                    : ' Se han ignorado ' + res.allDay + ' eventos de día completo.')
                : '') + '</p>' +
            (res.slots.length
              ? '<div class="prev-list">' + Object.keys(byDay).sort().map(function (d) {
                  return '<div class="prev-day"><strong>' + U.cap(U.dayLabel(+d)) + '</strong>' +
                    byDay[d].sort(function (a, b) { return U.toMin(a.start) - U.toMin(b.start); })
                      .map(function (s) {
                        return '<span class="badge">' + s.start + '–' + s.end + ' · ' + U.esc(s.title) +
                          (s.room ? ' · ' + U.esc(s.room) : '') + '</span>';
                      }).join('') +
                  '</div>';
                }).join('') + '</div>'
              : '<p class="small">No se ha reconocido ninguna clase.</p>') +
            (res.errors.length
              ? '<details class="prev-errors"><summary>' + res.errors.length + ' ' + U.plural(res.errors.length, 'línea') + ' sin importar</summary>' +
                '<ul>' + res.errors.slice(0, 12).map(function (e) { return '<li>' + U.esc(e) + '</li>'; }).join('') + '</ul></details>'
              : '') +
          '</div>' +
        '</div>';

      btn.disabled = !res.slots.length;
    }
  };

  LD.modals = modals;
})(window);
