/* =============================================================================
   views/tasks.js — Lista completa con filtros, ordenación y agrupación.
   ============================================================================= */
(function (global) {
  'use strict';

  var LD = global.LD;
  var U = LD.utils, S = LD.store, ui = LD.ui, ico = LD.icons;

  var view = {
    id: 'tasks',
    label: 'Tareas',
    icon: 'list-checks',
    countKey: 'open',

    render: function () {
      var f = S.ui;
      var tasks = S.query();

      var html = '';

      html += '<div class="page-head">' +
        '<div><h1>Tareas</h1>' +
        '<p class="sub">' + resultLine(tasks) + '</p></div>' +
        '<button class="btn btn-primary" data-app="new-task">+ Nueva tarea</button>' +
      '</div>';

      /* Filtros */
      html += '<div class="toolbar">' +
        sel('Asignatura', 'subjectId', ui.subjectOptions(f.subjectId, [['all', 'Todas'], ['none', 'Sin asignatura']])) +
        sel('Estado', 'status', ui.options(S.STATUSES, f.status, [['open', 'Sin terminar'], ['all', 'Todos']])) +
        sel('Tipo', 'type', ui.options(S.TYPES, f.type, [['all', 'Todos']])) +
        sel('Prioridad', 'priority', ui.options(S.PRIORITIES, f.priority, [['all', 'Todas']])) +
        (S.state.members.length
          ? sel('Compañero', 'memberId', ui.options(
              S.searchMembers('').map(function (m) { return { id: m.id, label: m.name }; }),
              f.memberId, [['all', 'Todos'], ['none', 'Sin equipo']]))
          : '') +
        sel('Ordenar por', 'sort', ui.options([
          { id: 'due', label: 'Fecha límite' },
          { id: 'priority', label: 'Prioridad' },
          { id: 'subject', label: 'Asignatura' },
          { id: 'created', label: 'Más recientes' },
          { id: 'title', label: 'Título' }
        ], f.sort)) +
        '<div class="field"><label>Agrupar</label><div class="segmented">' +
          ['due', 'subject', 'priority', 'type', 'none'].map(function (g) {
            var labels = { due: 'Fecha', subject: 'Asignatura', priority: 'Prioridad', type: 'Tipo', none: 'Sin grupos' };
            return '<button data-group="' + g + '" class="' + (f.groupBy === g ? 'active' : '') + '">' + labels[g] + '</button>';
          }).join('') +
        '</div></div>' +
        '<div class="spacer"></div>' +
        (isFiltered() ? '<button class="btn btn-sm" data-app="clear-filters">Quitar filtros</button>' : '') +
      '</div>';

      /* Resultados */
      if (!tasks.length) {
        html += '<section class="card"><div class="card-body">' +
          (S.state.tasks.length
            ? ui.empty('search-x', 'Ningún resultado', 'Prueba a cambiar los filtros o la búsqueda.', { act: 'clear-filters', label: 'Quitar filtros' })
            : ui.empty('file-plus', 'Todavía no hay tareas', 'Añade la primera y empieza a llevar el control.', { act: 'new-task', label: '+ Nueva tarea' })) +
          '</div></section>';
        return html;
      }

      var groups = groupTasks(tasks, f.groupBy);
      html += '<div>' + groups.map(function (g) {
        return (g.title ? '<div class="group-head ' + (g.tone || '') + '"><span>' + g.title + '</span>' +
                 '<span class="n">' + g.tasks.length + '</span></div>' : '') +
          '<div class="task-list">' + g.tasks.map(function (t) {
            return ui.taskCard(t, { hideSubject: f.groupBy === 'subject' });
          }).join('') + '</div>';
      }).join('') + '</div>';

      return html;
    }
  };

  function sel(label, key, options) {
    // Prefijo distinto al del formulario de tarea: si no, los `id` chocarían
    // cuando el modal se abre sobre esta vista.
    var id = 'flt-' + key;
    return '<div class="field"><label for="' + id + '">' + label + '</label>' +
      '<select id="' + id + '" data-filter="' + key + '">' + options + '</select></div>';
  }

  function isFiltered() {
    var f = S.ui;
    return !!(f.search || f.subjectId !== 'all' || f.status !== 'open' || f.type !== 'all' ||
              f.priority !== 'all' || f.memberId !== 'all');
  }

  function resultLine(tasks) {
    var n = tasks.length;
    var pend = tasks.filter(function (t) { return t.status !== 'hecha'; }).length;
    var hours = tasks.reduce(function (sum, t) { return t.status === 'hecha' ? sum : sum + (Number(t.estimate) || 0); }, 0);
    var bits = [n + ' ' + U.plural(n, 'tarea')];
    if (pend !== n) bits.push(pend + ' sin terminar');
    if (hours) bits.push(Math.round(hours * 10) / 10 + ' h estimadas');
    if (S.ui.search) bits.push('búsqueda: "' + S.ui.search + '"');
    if (S.ui.memberId && S.ui.memberId !== 'all') {
      var m = S.memberById(S.ui.memberId);
      bits.push(m ? 'con ' + m.name : 'sin equipo');
    }
    return bits.join(' · ');
  }

  /** Divide la lista ya ordenada en grupos con título. */
  function groupTasks(tasks, mode) {
    if (mode === 'none') return [{ title: '', tasks: tasks }];

    var buckets = [];
    var index = {};
    var push = function (key, title, tone, task, order) {
      if (!index[key]) {
        index[key] = { key: key, title: title, tone: tone || '', tasks: [], order: order };
        buckets.push(index[key]);
      }
      index[key].tasks.push(task);
    };

    tasks.forEach(function (t) {
      if (mode === 'due') {
        if (t.status === 'hecha') return push('z-done', 'Hechas', 't-ok', t, 99);
        var info = U.dueInfo(t.due, t.dueTime);
        var map = {
          overdue: ['1-overdue', 'Atrasadas', 't-danger', 1],
          today: ['2-today', 'Hoy', 't-danger', 2],
          tomorrow: ['3-tomorrow', 'Mañana', 't-warn', 3],
          week: ['4-week', 'Esta semana', '', 4],
          later: ['5-later', 'Más adelante', '', 5],
          nodate: ['6-nodate', 'Sin fecha', '', 6]
        }[info.bucket];
        push(map[0], map[1], map[2], t, map[3]);
      } else if (mode === 'subject') {
        var s = S.subjectById(t.subjectId);
        push(t.subjectId || 'zz-none',
          s ? (s.code ? s.code + ' · ' + U.esc(s.name) : U.esc(s.name)) : 'Sin asignatura',
          '', t, s ? 1 : 2);
      } else if (mode === 'priority') {
        var p = S.PRIORITIES.find(function (x) { return x.id === t.priority; });
        push(t.priority, 'Prioridad ' + (p ? p.label.toLowerCase() : t.priority), p ? p.tone : '', t, p ? p.rank : 9);
      } else if (mode === 'type') {
        var ty = S.TYPES.find(function (x) { return x.id === t.type; });
        push(t.type, ty ? ico.svg(ty.icon) + ty.label : t.type, '', t, S.TYPES.indexOf(ty));
      }
    });

    return buckets.sort(function (a, b) { return a.order - b.order || a.title.localeCompare(b.title, 'es'); });
  }

  LD.views = LD.views || {};
  LD.views.tasks = view;
})(window);
