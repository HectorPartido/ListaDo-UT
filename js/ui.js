/* =============================================================================
   ui.js — piezas de interfaz reutilizables (tarjeta de tarea, etiquetas,
   selectores, avisos). Devuelven HTML como cadena; los clics se gestionan
   por delegación en app.js a través de atributos data-action.
   Expone window.LD.ui
   ============================================================================= */
(function (global) {
  'use strict';

  var LD = global.LD || (global.LD = {});
  var U = LD.utils;
  var S = LD.store;
  var ico = LD.icons;
  var ui = {};

  /* ---------------------------- Etiquetas -------------------------------- */

  ui.typeBadge = function (typeId) {
    var t = S.TYPES.find(function (x) { return x.id === typeId; }) || S.TYPES[S.TYPES.length - 1];
    return '<span class="badge">' + ico.svg(t.icon) + t.label + '</span>';
  };

  ui.priorityBadge = function (priorityId) {
    var p = S.PRIORITIES.find(function (x) { return x.id === priorityId; });
    if (!p) return '';
    return '<span class="badge ' + p.tone + '">' + p.label + '</span>';
  };

  ui.statusBadge = function (statusId, taskId) {
    var s = S.STATUSES.find(function (x) { return x.id === statusId; }) || S.STATUSES[0];
    return '<button class="badge ' + s.tone + '" data-action="cycle-status" data-id="' + taskId +
      '" title="Cambiar estado">' + ico.svg(s.icon) + s.label + '</button>';
  };

  ui.subjectChip = function (subjectId) {
    var s = S.subjectById(subjectId);
    if (!s) return '<span class="badge">Sin asignatura</span>';
    return '<span class="chip-subject" style="--c:' + U.esc(s.color) + '" title="' + U.esc(s.name) + '">' +
      '<i class="dot"></i>' + U.esc(s.code || s.name) + '</span>';
  };

  ui.dueBadge = function (task) {
    var info = U.dueInfo(task.due, task.dueTime);
    if (info.bucket === 'nodate') return '<span class="badge">' + ico.svg('calendar-off') + 'Sin fecha</span>';
    var name = info.bucket === 'overdue' ? 'alert-triangle' : 'calendar-days';
    return '<span class="badge ' + info.tone + '">' + ico.svg(name) + U.esc(info.label) + '</span>';
  };

  /* ----------------------------- Equipo ---------------------------------- */

  /** Avatar redondo con las iniciales del compañero. */
  ui.avatar = function (member, opts) {
    opts = opts || {};
    return '<span class="avatar' + (opts.cls ? ' ' + opts.cls : '') + '" ' +
      'style="--c:' + U.esc(member.color) + '" title="' + U.esc(member.name) + '">' +
      U.esc(S.initials(member.name)) + '</span>';
  };

  /** Chip con avatar y nombre. */
  ui.memberChip = function (member, opts) {
    opts = opts || {};
    return '<span class="chip-member" style="--c:' + U.esc(member.color) + '"' +
      (opts.attrs || '') + '>' + ui.avatar(member, { cls: 'avatar-xs' }) +
      U.esc(member.alias || member.name) +
      (opts.remove ? '<button class="chip-x" data-role="unpick" data-member="' + member.id +
        '" aria-label="Quitar a ' + U.esc(member.name) + '">' + ico.svg('x') + '</button>' : '') +
      '</span>';
  };

  /** Grupo de avatares apilados (para la tarjeta de tarea). */
  ui.memberStack = function (members, max) {
    if (!members.length) return '';
    max = max || 4;
    var shown = members.slice(0, max);
    var rest = members.length - shown.length;
    return '<span class="avatar-stack" title="' + U.esc(members.map(function (m) { return m.name; }).join(', ')) + '">' +
      shown.map(function (m) { return ui.avatar(m); }).join('') +
      (rest ? '<span class="avatar avatar-rest">+' + rest + '</span>' : '') +
      '</span>';
  };

  /* ----------------------------- Horario --------------------------------- */

  /**
   * Franja "qué toca ahora": clase en curso (con cuenta atrás) y la siguiente.
   * La comparte el Panel y la vista Horario; se refresca cada minuto.
   * @param {object} info resultado de store.nowInfo()
   * @param {{cls?:string, link?:boolean}} [opts]
   */
  ui.nowStrip = function (info, opts) {
    opts = opts || {};
    var html = '<section class="now-strip' + (opts.cls ? ' ' + opts.cls : '') + '" data-role="now-strip">';

    if (info.current) {
      html += '<div class="now-main is-live" style="--c:' + U.esc(S.classColor(info.current)) + '">' +
        '<div class="now-tag">' + ico.svg('activity') + 'Ahora' + '</div>' +
        '<div class="now-body">' +
          '<h2>' + U.esc(S.classLabel(info.current)) + '</h2>' +
          '<div class="now-meta">' +
            '<span class="badge">' + ico.svg('clock') + ui.classTime(info.current) + '</span>' +
            (info.current.room ? '<span class="badge">' + ico.svg('map-pin') + U.esc(info.current.room) + '</span>' : '') +
            '<span class="badge t-accent">Quedan ' + U.fmtMins(info.endsIn) + '</span>' +
          '</div>' +
          '<div class="progress"><i style="width:' + info.progress + '%"></i></div>' +
        '</div>' +
      '</div>';
    } else {
      html += '<div class="now-main">' +
        '<div class="now-tag">' + ico.svg('coffee') + 'Ahora' + '</div>' +
        '<div class="now-body"><h2>Sin clase</h2>' +
        '<p class="small muted">' + U.cap(U.dayLabel(info.day)) + ', ' + U.fromMin(info.mins) +
        (info.today.length ? ' · ' + info.today.length + ' ' + U.plural(info.today.length, 'clase') + ' hoy' : ' · hoy no tienes clase') +
        '</p></div>' +
      '</div>';
    }

    if (info.next) {
      var when = info.nextDayOffset === 0
        ? 'en ' + U.fmtMins(info.startsIn)
        : (info.nextDayOffset === 1 ? 'mañana' : U.dayLabel(info.next.day)) + ' a las ' + info.next.start;
      html += '<div class="now-next">' +
        '<div class="nn-label">' + ico.svg('arrow-right') + 'Después</div>' +
        '<div><strong>' + U.esc(S.classLabel(info.next)) + '</strong>' +
          '<div class="small muted">' + U.cap(when) +
            (info.nextDayOffset === 0 ? ' · ' + info.next.start : '') +
            (info.next.room ? ' · ' + U.esc(info.next.room) : '') + '</div>' +
        '</div>' +
      '</div>';
    }

    if (opts.link) {
      html += '<a class="now-link" href="#/schedule">' + ico.svg('table') + 'Ver horario completo</a>';
    }

    return html + '</section>';
  };


  /** Rango horario de una clase: "09:00 – 11:00 · 2 h". */
  ui.classTime = function (slot, withDuration) {
    var mins = U.toMin(slot.end) - U.toMin(slot.start);
    return slot.start + ' – ' + slot.end + (withDuration ? ' · ' + U.fmtMins(mins) : '');
  };

  /** Fila de clase reutilizable (vista Horario y detalle del día). */
  ui.classRow = function (slot, opts) {
    opts = opts || {};
    var color = S.classColor(slot);
    return '<article class="class-row' + (opts.now ? ' is-now' : '') + '" style="--c:' + U.esc(color) + '" data-id="' + slot.id + '">' +
      '<div class="cr-time">' + slot.start + '<small>' + slot.end + '</small></div>' +
      '<div class="cr-body">' +
        '<div class="cr-title">' + U.esc(S.classLabel(slot)) +
          (opts.now ? '<span class="badge t-accent">' + ico.svg('activity') + 'Ahora</span>' : '') +
        '</div>' +
        '<div class="cr-meta">' +
          (slot.room ? '<span class="badge">' + ico.svg('map-pin') + U.esc(slot.room) + '</span>' : '') +
          (slot.teacher ? '<span class="badge">' + ico.svg('user') + U.esc(slot.teacher) + '</span>' : '') +
          '<span class="badge">' + ico.svg('clock') + U.fmtMins(U.toMin(slot.end) - U.toMin(slot.start)) + '</span>' +
        '</div>' +
      '</div>' +
      (opts.readOnly ? '' :
        '<div class="cr-tools">' +
          '<button data-class="edit" data-id="' + slot.id + '" title="Editar" aria-label="Editar">' + ico.svg('pencil') + '</button>' +
          '<button class="del" data-class="delete" data-id="' + slot.id + '" title="Borrar" aria-label="Borrar">' + ico.svg('trash') + '</button>' +
        '</div>') +
    '</article>';
  };

  /* -------------------------- Tarjeta de tarea --------------------------- */

  ui.taskCard = function (task, opts) {
    opts = opts || {};
    var done = task.status === 'hecha';
    var info = U.dueInfo(task.due, task.dueTime);
    var overdue = !done && info.bucket === 'overdue';
    var subs = task.subtasks || [];
    var subsDone = subs.filter(function (s) { return s.done; }).length;

    var classes = ['task', 'p-' + task.priority];
    if (done) classes.push('is-done');
    if (overdue) classes.push('is-overdue');

    var html = '<article class="' + classes.join(' ') + '" data-id="' + task.id + '">';

    html += '<button class="check" data-action="toggle-done" data-id="' + task.id + '" ' +
      'aria-label="' + (done ? 'Marcar como pendiente' : 'Marcar como hecha') + '">' + ico.svg('check', { width: 3 }) + '</button>';

    html += '<div class="task-body">';

    html += '<div class="task-top">' +
      '<div class="task-title" data-action="edit" data-id="' + task.id + '" role="button" tabindex="0" title="Editar tarea">' +
      U.esc(task.title) + '</div>' +
      '<div class="task-tools">' +
      '<button data-action="edit" data-id="' + task.id + '" title="Editar" aria-label="Editar">' + ico.svg('pencil') + '</button>' +
      '<button class="del" data-action="delete" data-id="' + task.id + '" title="Borrar" aria-label="Borrar">' + ico.svg('trash') + '</button>' +
      '</div></div>';

    var meta = [];
    if (!opts.hideSubject) meta.push(ui.subjectChip(task.subjectId));
    if (!opts.hideDue) meta.push(ui.dueBadge(task));
    meta.push(ui.typeBadge(task.type));
    if (!done) meta.push(ui.priorityBadge(task.priority));
    meta.push(ui.statusBadge(task.status, task.id));
    if (task.estimate) meta.push('<span class="badge">' + ico.svg('clock') + task.estimate + ' h</span>');
    if (task.weight) meta.push('<span class="badge">' + ico.svg('target') + task.weight + '% nota</span>');

    var members = S.membersOf(task);
    if (members.length && !opts.hideMembers) meta.push(ui.memberStack(members));
    html += '<div class="task-meta">' + meta.join('') + '</div>';

    if (task.notes && !opts.compact) {
      html += '<p class="task-notes">' + U.esc(task.notes) + '</p>';
    }

    if (subs.length) {
      var pct = Math.round((subsDone / subs.length) * 100);
      html += '<div class="progress" title="' + subsDone + ' de ' + subs.length + ' subtareas"><i style="width:' + pct + '%"></i></div>';
      if (!opts.compact) {
        html += '<div class="subtasks">' + subs.map(function (s) {
          return '<button class="subtask' + (s.done ? ' done' : '') + '" data-action="toggle-subtask" ' +
            'data-id="' + task.id + '" data-sub="' + s.id + '">' +
            '<span class="box">' + ico.svg('check', { width: 3.4 }) + '</span><span>' + U.esc(s.text) + '</span></button>';
        }).join('') + '</div>';
      }
    }

    html += '</div></article>';
    return html;
  };

  ui.taskList = function (tasks, opts) {
    if (!tasks.length) return ui.emptySmall((opts && opts.emptyText) || 'Nada por aquí.');
    return '<div class="task-list">' + tasks.map(function (t) { return ui.taskCard(t, opts); }).join('') + '</div>';
  };

  /* ------------------------ Estados vacíos y avisos ---------------------- */

  ui.emptySmall = function (text) {
    return '<p class="empty-sm">' + U.esc(text) + '</p>';
  };

  /** @param {string} icon nombre de icono de LD.icons */
  ui.empty = function (icon, title, text, action) {
    return '<div class="empty">' + ico.svg(icon, { cls: 'ic-xl', width: 1.5 }) +
      '<strong>' + U.esc(title) + '</strong>' +
      '<span>' + U.esc(text || '') + '</span>' +
      (action ? '<div><button class="btn btn-primary" data-app="' + action.act + '">' + U.esc(action.label) + '</button></div>' : '') +
      '</div>';
  };

  var toastTimers = [];

  /**
   * Aviso flotante. `undo` añade un botón "Deshacer".
   * @param {string} text
   * @param {{undo?:Function, ms?:number}} [opts]
   */
  ui.toast = function (text, opts) {
    opts = opts || {};
    var root = U.$('#toast-root');
    if (!root) return;
    var node = document.createElement('div');
    node.className = 'toast';
    node.innerHTML = '<span>' + U.esc(text) + '</span>';

    if (opts.undo) {
      var btn = document.createElement('button');
      btn.className = 'undo';
      btn.textContent = 'Deshacer';
      btn.addEventListener('click', function () {
        opts.undo();
        node.remove();
      });
      node.appendChild(btn);
    }

    root.appendChild(node);
    var timer = setTimeout(function () { node.remove(); }, opts.ms || (opts.undo ? 6000 : 2600));
    toastTimers.push(timer);
    if (toastTimers.length > 4) clearTimeout(toastTimers.shift());
  };

  /* ---------------------------- Formularios ------------------------------ */

  /**
   * Genera <option>s.
   * @param {Array<{id:string,label:string}>} items
   * @param {string} selected
   * @param {Array<[string,string]>} [extra] pares [valor, etiqueta] al principio
   */
  ui.options = function (items, selected, extra) {
    var out = (extra || []).map(function (pair) {
      return '<option value="' + U.esc(pair[0]) + '"' + (String(selected) === pair[0] ? ' selected' : '') + '>' + U.esc(pair[1]) + '</option>';
    });
    items.forEach(function (it) {
      out.push('<option value="' + U.esc(it.id) + '"' + (String(selected) === String(it.id) ? ' selected' : '') + '>' +
        U.esc(it.label != null ? it.label : it.name) + '</option>');
    });
    return out.join('');
  };

  ui.subjectOptions = function (selected, extra) {
    var items = S.state.subjects.map(function (s) {
      return { id: s.id, label: s.code ? s.code + ' · ' + s.name : s.name };
    });
    return ui.options(items, selected, extra);
  };

  /** Selector de color con la paleta de la app. */
  ui.swatches = function (selected) {
    return '<div class="swatches" data-role="swatches">' + S.PALETTE.map(function (c) {
      return '<button type="button" class="swatch' + (c === selected ? ' active' : '') + '" style="--c:' + c + '" ' +
        'data-color="' + c + '" aria-label="Color ' + c + '"></button>';
    }).join('') + '</div>';
  };

  LD.ui = ui;
})(window);
