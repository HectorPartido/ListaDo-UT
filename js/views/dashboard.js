/* =============================================================================
   views/dashboard.js — Panel: qué toca hoy, qué se ha pasado y qué viene.
   ============================================================================= */
(function (global) {
  'use strict';

  var LD = global.LD;
  var U = LD.utils, S = LD.store, ui = LD.ui, ico = LD.icons;

  var view = {
    id: 'dashboard',
    label: 'Panel',
    icon: 'home',
    countKey: 'today',

    render: function () {
      var c = S.counts();
      var today = U.today();

      if (!S.state.tasks.length && !S.state.subjects.length) return welcome();

      var open = S.open();
      var subjFilter = S.ui.dashSubject;
      if (subjFilter && subjFilter !== 'all') {
        open = open.filter(function (t) { return t.subjectId === (subjFilter === 'none' ? '' : subjFilter); });
      }

      var withDate = open.filter(function (t) { return U.isISO(t.due); });
      var overdue = withDate.filter(function (t) { return t.due < today; });
      var dueToday = withDate.filter(function (t) { return t.due === today; });
      var next7 = withDate.filter(function (t) { return t.due > today && t.due <= U.addDays(today, 7); });
      var later = withDate.filter(function (t) { return t.due > U.addDays(today, 7); });
      var noDate = open.filter(function (t) { return !U.isISO(t.due); });

      var html = '';

      /* Encabezado */
      html += '<div class="page-head">' +
        '<div>' +
          '<h1>' + greeting() + '</h1>' +
          '<p class="sub">' + U.cap(U.fmtLong(today)) + ' · ' + statusLine(c) + '</p>' +
        '</div>' +
        '<div class="row">' +
          '<div class="field"><label for="d-subject">Asignatura</label>' +
          '<select id="d-subject" data-filter="dashSubject">' +
            ui.subjectOptions(subjFilter, [['all', 'Todas'], ['none', 'Sin asignatura']]) +
          '</select></div>' +
        '</div>' +
      '</div>';

      /* Qué clase toca ahora (o invitación a subir el horario) */
      html += scheduleBlock();

      /* Añadir rápido */
      html += '<div>' +
        '<div class="quick">' +
          '<input id="quick-add" class="input" placeholder="Añadir rápido: Memoria práctica 3 @BBDD !alta mañana ~3h #entrega" autocomplete="off">' +
          '<button class="btn btn-primary" data-app="quick-add">Añadir</button>' +
        '</div>' +
        '<p class="quick-hint"><code>@asignatura</code> · <code>!alta</code> <code>!media</code> <code>!baja</code> · ' +
        '<code>#entrega</code> <code>#examen</code>… · <code>~2h</code> horas · <code>%20</code> peso · ' +
        'fechas: <code>hoy</code> <code>mañana</code> <code>viernes</code> <code>12/03</code> <code>+5d</code></p>' +
      '</div>';

      /* KPIs */
      html += '<div class="kpis">' +
        kpi('danger', 'Atrasadas', c.overdue, c.overdue ? 'Empieza por aquí' : 'Todo al día') +
        kpi('warn', 'Para hoy', c.today, c.inProgress + ' en curso') +
        kpi('info', 'Próximos 7 días', c.week, c.weekHours + ' h estimadas') +
        kpi('ok', 'Completadas', c.done, c.total ? Math.round((c.done / c.total) * 100) + '% del total' : '—') +
      '</div>';

      /* Columnas */
      html += '<div class="cols">';

      html += block('alert-triangle', 'Atrasadas', overdue, { tag: overdue.length ? 'alert' : '' },
        'Sin retrasos. Buen trabajo.');

      html += block('flag', 'Hoy', dueToday, { tag: dueToday.length ? 'warn' : '' },
        'Hoy no vence nada.');

      html += block('calendar-days', 'Próximos 7 días', next7, {}, 'Semana despejada.');

      if (noDate.length) html += block('inbox', 'Sin fecha', noDate, {}, '');
      if (later.length) html += block('compass', 'Más adelante', later.slice(0, 8), { compact: true },
        '', later.length > 8 ? later.length - 8 : 0);

      html += '</div>';

      return html;
    },

    /** Se ejecuta tras insertar el HTML. */
    mounted: function () {
      var input = U.$('#quick-add');
      if (input && LD.app.consumeFocusFlag('quick-add')) input.focus();
    },

    /** Refresco por minuto: sólo la franja de la clase actual. */
    tick: function () {
      var host = U.$('[data-role="now-strip"]');
      if (!host || !S.state.schedule.length) return;
      var tmp = document.createElement('div');
      tmp.innerHTML = ui.nowStrip(S.nowInfo(), { link: true });
      if (tmp.firstChild) host.replaceWith(tmp.firstChild);
    }
  };

  /** Franja de "ahora", o aviso para importar el horario si no hay ninguno. */
  function scheduleBlock() {
    if (!S.state.schedule.length) {
      return '<section class="card hint-card"><div class="card-body">' +
        '<div class="row-between" style="flex-wrap:wrap;gap:12px">' +
          '<div class="row">' + ico.svg('table', { cls: 'ic-lg' }) +
            '<div><strong>Pon tu horario de clases</strong>' +
            '<p class="small muted">Impórtalo desde un .ics (Calendario.app, Google Calendar, campus virtual) ' +
            'o desde una lista de texto, y aquí te diré qué clase te toca en cada momento.</p></div>' +
          '</div>' +
          '<button class="btn btn-sm" data-app="import-schedule">Importar horario</button>' +
        '</div>' +
      '</div></section>';
    }
    return ui.nowStrip(S.nowInfo(), { link: true });
  }

  function kpi(tone, label, value, foot) {
    return '<div class="kpi ' + tone + '">' +
      '<div class="k-label">' + label + '</div>' +
      '<div class="k-value">' + value + '</div>' +
      '<div class="k-foot">' + U.esc(foot) + '</div>' +
    '</div>';
  }

  function block(icon, title, tasks, opts, emptyText, more) {
    opts = opts || {};
    var body = tasks.length
      ? '<div class="task-list">' + tasks.map(function (t) { return ui.taskCard(t, opts); }).join('') + '</div>' +
        (more ? '<p class="empty-sm">y ' + more + ' más · <a href="#/tasks">ver todas</a></p>' : '')
      : ui.emptySmall(emptyText || 'Nada por aquí.');

    return '<section class="card">' +
      '<div class="card-head"><h2>' + ico.svg(icon) + title + '</h2>' +
      (tasks.length ? '<span class="tag ' + (opts.tag || '') + '">' + tasks.length + '</span>' : '') +
      '</div>' +
      '<div class="card-body tight">' + body + '</div>' +
    '</section>';
  }

  function greeting() {
    var h = new Date().getHours();
    if (h < 6) return 'A estas horas…';
    if (h < 13) return 'Buenos días';
    if (h < 20) return 'Buenas tardes';
    return 'Buenas noches';
  }

  function statusLine(c) {
    if (!c.open) return 'no tienes tareas pendientes';
    var bits = [c.open + ' ' + U.plural(c.open, 'tarea') + ' pendiente' + (c.open === 1 ? '' : 's')];
    if (c.overdue) bits.push(c.overdue + ' atrasada' + (c.overdue === 1 ? '' : 's'));
    return bits.join(' · ');
  }

  function welcome() {
    return '<div class="page-head"><div><h1>Bienvenido a ListaDo</h1>' +
      '<p class="sub">Tu control de tareas, entregas y exámenes de la universidad.</p></div></div>' +
      '<section class="card"><div class="card-body">' +
      '<div class="empty">' +
        ico.svg('graduation-cap', { cls: 'ic-xl', width: 1.5 }) +
        '<strong>Empieza en dos pasos</strong>' +
        '<span>Crea tus asignaturas y luego añade las tareas que te vayan saliendo.<br>' +
        'Todo se guarda en este navegador: no hace falta cuenta ni conexión.</span>' +
        '<div class="row" style="justify-content:center;flex-wrap:wrap">' +
          '<button class="btn btn-primary" data-app="new-subject">Crear mi primera asignatura</button>' +
          '<button class="btn" data-app="seed">Cargar datos de ejemplo</button>' +
        '</div>' +
      '</div>' +
      '</div></section>';
  }

  LD.views = LD.views || {};
  LD.views.dashboard = view;
})(window);
