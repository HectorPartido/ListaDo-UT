/* =============================================================================
   views/stats.js — Estadísticas: avance, carga por asignatura y por semanas.
   ============================================================================= */
(function (global) {
  'use strict';

  var LD = global.LD;
  var U = LD.utils, S = LD.store, ui = LD.ui, ico = LD.icons;

  var view = {
    id: 'stats',
    label: 'Estadísticas',
    icon: 'bar-chart',
    countKey: null,

    render: function () {
      var tasks = S.state.tasks;
      if (!tasks.length) {
        return '<div class="page-head"><div><h1>Estadísticas</h1></div></div>' +
          '<section class="card"><div class="card-body">' +
          ui.empty('bar-chart', 'Aún no hay datos', 'Cuando tengas tareas apuntadas verás aquí tu avance y tu carga de trabajo.',
            { act: 'new-task', label: '+ Nueva tarea' }) +
          '</div></section>';
      }

      var c = S.counts();
      var done = tasks.filter(function (t) { return t.status === 'hecha'; });
      var pct = Math.round((done.length / tasks.length) * 100);
      var today = U.today();

      var html = '<div class="page-head"><div><h1>Estadísticas</h1>' +
        '<p class="sub">' + tasks.length + ' ' + U.plural(tasks.length, 'tarea') + ' registradas en total</p></div></div>';

      html += '<div class="kpis">' +
        '<div class="kpi accent"><div class="k-label">Completado</div><div class="k-value">' + pct + '%</div>' +
          '<div class="k-foot">' + done.length + ' de ' + tasks.length + '</div></div>' +
        '<div class="kpi info"><div class="k-label">Horas pendientes</div><div class="k-value">' + pendingHours(tasks) + '</div>' +
          '<div class="k-foot">de las tareas sin terminar</div></div>' +
        '<div class="kpi ok"><div class="k-label">Hechas (7 días)</div><div class="k-value">' + doneLastDays(done, 7) + '</div>' +
          '<div class="k-foot">' + doneLastDays(done, 30) + ' en 30 días</div></div>' +
        '<div class="kpi ' + (c.overdue ? 'danger' : 'ok') + '"><div class="k-label">Atrasadas</div><div class="k-value">' + c.overdue + '</div>' +
          '<div class="k-foot">' + (c.overdue ? 'requieren atención' : 'ninguna, perfecto') + '</div></div>' +
      '</div>';

      html += '<div class="stat-grid">';

      /* Anillo de avance */
      html += '<section class="card"><div class="card-head"><h2>Avance general</h2></div>' +
        '<div class="card-body"><div class="ring-wrap">' + ring(pct) +
        '<div class="legend">' +
          legendRow('var(--ok)', 'Hechas', done.length) +
          legendRow('var(--accent)', 'En curso', c.inProgress) +
          legendRow('var(--border-strong)', 'Pendientes', c.open - c.inProgress) +
          legendRow('var(--danger)', 'Atrasadas', c.overdue) +
        '</div></div></div></section>';

      /* Carga por asignatura */
      html += '<section class="card"><div class="card-head"><h2>Carga por asignatura</h2>' +
        '<span class="tag">sin terminar</span></div>' +
        '<div class="card-body">' + subjectBars() + '</div></section>';

      /* Próximas semanas */
      html += '<section class="card"><div class="card-head"><h2>Vencimientos por semana</h2>' +
        '<span class="tag">próximas 6</span></div>' +
        '<div class="card-body">' + weekSpark(today) + '</div></section>';

      /* Tabla por tipo */
      html += '<section class="card"><div class="card-head"><h2>Por tipo de tarea</h2></div>' +
        '<div class="card-body">' + typeTable(tasks) + '</div></section>';

      html += '</div>';
      return html;
    }
  };

  function pendingHours(tasks) {
    var h = tasks.reduce(function (sum, t) {
      return t.status === 'hecha' ? sum : sum + (Number(t.estimate) || 0);
    }, 0);
    return (Math.round(h * 10) / 10) + ' h';
  }

  function doneLastDays(done, days) {
    var limit = Date.now() - days * 86400000;
    return done.filter(function (t) {
      return t.completedAt && new Date(t.completedAt).getTime() >= limit;
    }).length;
  }

  function ring(pct) {
    var r = 48, cx = 58, circ = 2 * Math.PI * r;
    var offset = circ * (1 - pct / 100);
    return '<div class="ring">' +
      '<svg viewBox="0 0 116 116" width="116" height="116" aria-hidden="true">' +
        '<circle cx="' + cx + '" cy="' + cx + '" r="' + r + '" fill="none" stroke="var(--surface-3)" stroke-width="11"></circle>' +
        '<circle cx="' + cx + '" cy="' + cx + '" r="' + r + '" fill="none" stroke="var(--ok)" stroke-width="11" ' +
          'stroke-linecap="round" stroke-dasharray="' + circ.toFixed(1) + '" stroke-dashoffset="' + offset.toFixed(1) + '"></circle>' +
      '</svg>' +
      '<div class="ring-txt">' + pct + '%</div>' +
    '</div>';
  }

  function legendRow(color, label, value) {
    return '<div class="li"><i class="dot" style="--c:' + color + '"></i>' +
      '<span>' + label + '</span><strong style="margin-left:auto">' + value + '</strong></div>';
  }

  function subjectBars() {
    var rows = S.state.subjects.map(function (s) {
      var tasks = S.state.tasks.filter(function (t) { return t.subjectId === s.id && t.status !== 'hecha'; });
      var hours = tasks.reduce(function (sum, t) { return sum + (Number(t.estimate) || 0); }, 0);
      return { label: s.code || s.name, name: s.name, color: s.color, n: tasks.length, hours: Math.round(hours * 10) / 10 };
    });

    var orphan = S.state.tasks.filter(function (t) { return !t.subjectId && t.status !== 'hecha'; });
    if (orphan.length) {
      rows.push({ label: 'Sin asignatura', name: '', color: 'var(--muted)', n: orphan.length,
        hours: Math.round(orphan.reduce(function (s2, t) { return s2 + (Number(t.estimate) || 0); }, 0) * 10) / 10 });
    }

    rows = rows.filter(function (r) { return r.n > 0; }).sort(function (a, b) { return b.n - a.n; });
    if (!rows.length) return '<p class="empty-sm">' + ico.svg('sparkles') + ' No hay tareas sin terminar.</p>';

    var max = Math.max.apply(null, rows.map(function (r) { return r.n; }));
    return '<div class="barlist">' + rows.map(function (r) {
      return '<div class="barrow">' +
        '<div class="bl"><span title="' + U.esc(r.name) + '">' + U.esc(r.label) + '</span>' +
        '<span class="v">' + r.n + ' ' + U.plural(r.n, 'tarea') + (r.hours ? ' · ' + r.hours + ' h' : '') + '</span></div>' +
        '<div class="track" style="--c:' + U.esc(r.color) + '"><i style="width:' + Math.round((r.n / max) * 100) + '%"></i></div>' +
      '</div>';
    }).join('') + '</div>';
  }

  function weekSpark(today) {
    var start = U.startOfWeek(today);
    var weeks = [];
    for (var i = 0; i < 6; i++) {
      var from = U.addDays(start, i * 7);
      var to = U.addDays(from, 6);
      var list = S.state.tasks.filter(function (t) {
        return t.status !== 'hecha' && U.isISO(t.due) && t.due >= from && t.due <= to;
      });
      var hours = list.reduce(function (sum, t) { return sum + (Number(t.estimate) || 0); }, 0);
      weeks.push({
        label: i === 0 ? 'Esta' : U.fmtShort(from),
        n: list.length,
        hours: Math.round(hours * 10) / 10,
        overloaded: hours > 15
      });
    }

    var max = Math.max(1, Math.max.apply(null, weeks.map(function (w) { return w.n; })));
    var overdue = S.open().filter(function (t) { return U.isISO(t.due) && t.due < today; }).length;

    return '<div class="spark">' + weeks.map(function (w) {
      var h = w.n ? Math.max(6, Math.round((w.n / max) * 88)) : 2;
      return '<div class="col" title="' + w.n + ' tareas · ' + w.hours + ' h">' +
        '<span class="val">' + (w.n || '') + '</span>' +
        '<div class="bar ' + (w.overloaded ? 'over' : (w.n ? '' : 'zero')) + '" style="height:' + h + 'px"></div>' +
        '<span class="lab">' + U.esc(w.label) + '</span>' +
      '</div>';
    }).join('') + '</div>' +
    '<p class="small muted" style="margin-top:8px">' +
      (overdue ? ico.svg('alert-triangle') + ' ' + overdue + ' ' + U.plural(overdue, 'tarea') + ' ya vencidas no aparecen en el gráfico. ' : '') +
      'Las barras rojas marcan semanas con más de 15 h estimadas.</p>';
  }

  function typeTable(tasks) {
    var rows = S.TYPES.map(function (ty) {
      var list = tasks.filter(function (t) { return t.type === ty.id; });
      var done = list.filter(function (t) { return t.status === 'hecha'; }).length;
      var hours = list.reduce(function (sum, t) { return t.status === 'hecha' ? sum : sum + (Number(t.estimate) || 0); }, 0);
      return { icon: ty.icon, label: ty.label, n: list.length, done: done, hours: Math.round(hours * 10) / 10 };
    }).filter(function (r) { return r.n > 0; }).sort(function (a, b) { return b.n - a.n; });

    return '<table class="table"><thead><tr>' +
      '<th>Tipo</th><th class="num">Total</th><th class="num">Hechas</th><th class="num">Horas pend.</th>' +
      '</tr></thead><tbody>' +
      rows.map(function (r) {
        return '<tr><td class="with-ic">' + ico.svg(r.icon) + r.label + '</td>' +
          '<td class="num">' + r.n + '</td>' +
          '<td class="num">' + r.done + '</td>' +
          '<td class="num">' + (r.hours || '—') + '</td></tr>';
      }).join('') +
      '</tbody></table>';
  }

  LD.views = LD.views || {};
  LD.views.stats = view;
})(window);
