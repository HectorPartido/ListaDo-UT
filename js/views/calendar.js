/* =============================================================================
   views/calendar.js — Vista mensual: dónde se acumulan las entregas.
   ============================================================================= */
(function (global) {
  'use strict';

  var LD = global.LD;
  var U = LD.utils, S = LD.store, ui = LD.ui, ico = LD.icons;
  var MAX_CHIPS = 3;

  var view = {
    id: 'calendar',
    label: 'Calendario',
    icon: 'calendar',
    countKey: null,

    render: function () {
      var month = S.ui.calMonth || U.today();
      var today = U.today();
      var selected = S.ui.calDay;

      // Índice fecha -> tareas (respeta el filtro de asignatura y la búsqueda)
      var byDay = {};
      S.query({ status: 'all', sort: 'priority' }).forEach(function (t) {
        if (!U.isISO(t.due)) return;
        (byDay[t.due] = byDay[t.due] || []).push(t);
      });

      var weeks = U.monthMatrix(month);
      var monthNum = U.fromISO(month).getMonth();

      var html = '';

      html += '<div class="page-head">' +
        '<div><h1>Calendario</h1><p class="sub">Pulsa un día para ver o añadir sus tareas.</p></div>' +
        '<button class="btn btn-primary" data-app="new-task">+ Nueva tarea</button>' +
      '</div>';

      html += '<section class="card">' +
        '<div class="card-head cal-top">' +
          '<h2>' + U.esc(U.cap(U.fmtMonth(month))) + '</h2>' +
          '<div class="spacer"></div>' +
          '<button class="btn btn-sm btn-icon" data-cal="prev" aria-label="Mes anterior">' + ico.svg('chevron-left') + '</button>' +
          '<button class="btn btn-sm" data-cal="today">Hoy</button>' +
          '<button class="btn btn-sm btn-icon" data-cal="next" aria-label="Mes siguiente">' + ico.svg('chevron-right') + '</button>' +
        '</div>' +
        '<div class="card-body tight">' +
          '<div class="cal-grid">' +
            ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'].map(function (d) {
              return '<div class="cal-dow">' + d + '</div>';
            }).join('') +
            weeks.map(function (week) {
              return week.map(function (iso) { return dayCell(iso, byDay[iso] || [], monthNum, today, selected); }).join('');
            }).join('') +
          '</div>' +
        '</div>' +
      '</section>';

      /* Detalle del día */
      var dayIso = selected || (byDay[today] ? today : '');
      if (dayIso) {
        var list = byDay[dayIso] || [];
        html += '<section class="card">' +
          '<div class="card-head">' +
            '<h2>' + U.cap(U.esc(U.fmtLong(dayIso))) + '</h2>' +
            (list.length ? '<span class="tag">' + list.length + '</span>' : '') +
            '<div class="spacer"></div>' +
            '<button class="btn btn-sm btn-primary" data-cal="add" data-date="' + dayIso + '">+ Añadir en este día</button>' +
          '</div>' +
          '<div class="card-body tight">' +
            (list.length ? ui.taskList(list, {}) : ui.emptySmall('Este día está libre.')) +
          '</div>' +
        '</section>';
      }

      /* Resumen de carga del mes */
      var monthTasks = Object.keys(byDay).filter(function (iso) {
        return U.fromISO(iso).getMonth() === monthNum && U.fromISO(iso).getFullYear() === U.fromISO(month).getFullYear();
      }).reduce(function (acc, iso) { return acc.concat(byDay[iso]); }, []);

      var pend = monthTasks.filter(function (t) { return t.status !== 'hecha'; });
      var hours = pend.reduce(function (sum, t) { return sum + (Number(t.estimate) || 0); }, 0);
      html += '<p class="small muted">' + U.esc(U.cap(U.fmtMonth(month))) + ': ' + monthTasks.length + ' ' +
        U.plural(monthTasks.length, 'tarea') + ' con fecha, ' + pend.length + ' sin terminar' +
        (hours ? ' (' + Math.round(hours * 10) / 10 + ' h estimadas)' : '') + '.</p>';

      return html;
    }
  };

  function dayCell(iso, tasks, monthNum, today, selected) {
    var d = U.fromISO(iso);
    var classes = ['cal-day'];
    if (d.getMonth() !== monthNum) classes.push('other');
    if (iso === today) classes.push('today');
    if (iso === selected) classes.push('selected');

    var pending = tasks.filter(function (t) { return t.status !== 'hecha'; });
    var hasOverdue = pending.some(function (t) { return iso < today; });

    var chips = tasks.slice(0, MAX_CHIPS).map(function (t) {
      return '<span class="cal-chip' + (t.status === 'hecha' ? ' done' : '') + '" ' +
        'style="--c:' + U.esc(S.subjectColor(t.subjectId)) + '" title="' + U.esc(t.title) + '">' +
        U.esc(t.title) + '</span>';
    }).join('');

    var more = tasks.length > MAX_CHIPS ? '<span class="cal-more">+' + (tasks.length - MAX_CHIPS) + ' más</span>' : '';

    return '<button class="' + classes.join(' ') + '" data-cal="day" data-date="' + iso + '">' +
      '<span class="n">' + d.getDate() + (hasOverdue ? '<i class="warn-dot"></i>' : '') + '</span>' +
      chips + more +
    '</button>';
  }

  LD.views = LD.views || {};
  LD.views.calendar = view;
})(window);
