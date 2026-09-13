/* =============================================================================
   views/schedule.js — Horario semanal: rejilla proporcional por días, con la
   franja de "ahora" según el reloj del sistema, y la importación de .ics/.csv.
   ============================================================================= */
(function (global) {
  'use strict';

  var LD = global.LD;
  var U = LD.utils, S = LD.store, ui = LD.ui, ico = LD.icons;

  var PX_PER_MIN = 0.92;   // altura de la rejilla
  var FALLBACK = [8, 20];  // franja por defecto si aún no hay clases

  var view = {
    id: 'schedule',
    pxPerMin: PX_PER_MIN,
    label: 'Horario',
    icon: 'table',
    countKey: null,

    render: function () {
      var slots = S.state.schedule;
      var info = S.nowInfo();

      var puedo = S.isGroupOwner();

      var html = '<div class="page-head">' +
        '<div><h1>Horario</h1><p class="sub">' + headLine(slots) + '</p></div>' +
        (puedo
          ? '<div class="row">' +
              '<button class="btn" data-schedule="import">' + ico.svg('upload') + ' Importar</button>' +
              '<button class="btn btn-primary" data-schedule="new">' + ico.svg('plus') + ' Clase</button>' +
            '</div>'
          : '') +
      '</div>';

      if (!slots.length && !puedo) {
        return html + '<section class="card"><div class="card-body">' +
          ui.emptySmall('El grupo en el que estás todavía no tiene horario.') +
          '</div></section>';
      }

      if (!slots.length) {
        return html + '<section class="card"><div class="card-body">' +
          ui.empty('table', 'Aún no has puesto tu horario',
            'Impórtalo desde un .ics (Calendario.app, Google Calendar o el campus virtual) o desde una lista de texto. ' +
            'También puedes añadir las clases a mano.',
            { act: 'import-schedule', label: 'Importar horario' }) +
          '<p class="empty-sm">…o <button class="btn btn-sm" data-schedule="new">añadir una clase a mano</button></p>' +
          '</div></section>';
      }

      if (!puedo) html += avisoMiembro();

      /* Franja de ahora / siguiente */
      html += ui.nowStrip(info);

      /* Avisos de solapes */
      var overlaps = S.overlaps();
      if (overlaps.length) {
        html += '<div class="notice t-warn">' + ico.svg('alert-triangle') +
          '<span>' + overlaps.length + ' ' + U.plural(overlaps.length, 'solape') + ' en el horario: ' +
          overlaps.slice(0, 3).map(function (pair) {
            return U.cap(U.dayLabel(pair[0].day, true)) + ' ' + pair[1].start + ' (' +
              U.esc(S.classShort(pair[0])) + ' / ' + U.esc(S.classShort(pair[1])) + ')';
          }).join(', ') + '.</span></div>';
      }

      /* Selector semana / día */
      html += '<div class="row-between" style="flex-wrap:wrap;gap:10px">' +
        '<div class="segmented">' +
          '<button data-schedule-day="0" class="' + (S.ui.scheduleDay === 0 ? 'active' : '') + '">Semana</button>' +
          U.DAYS_SHORT.map(function (d, i) {
            var day = i + 1;
            if (day > 5 && !S.classesOn(day).length) return '';   // fin de semana sólo si hay clase
            return '<button data-schedule-day="' + day + '" class="' + (S.ui.scheduleDay === day ? 'active' : '') + '">' +
              U.cap(d) + '</button>';
          }).join('') +
        '</div>' +
        (puedo ? '<button class="btn btn-sm btn-ghost is-danger" data-schedule="clear">Vaciar horario</button>' : '') +
      '</div>';

      html += S.ui.scheduleDay === 0 ? weekGrid(info) : dayList(S.ui.scheduleDay, info);
      return html;
    },

    /** Refresco ligero cada minuto: sólo la franja de "ahora". */
    tick: function () {
      var host = U.$('[data-role="now-strip"]');
      if (!host) return;
      var tmp = document.createElement('div');
      tmp.innerHTML = ui.nowStrip(S.nowInfo());
      if (tmp.firstChild) host.replaceWith(tmp.firstChild);
      var line = U.$('[data-role="now-line"]');
      if (line) positionNowLine(line);
    }
  };

  /** Mismo aviso que en Asignaturas: aquí manda quien creó el grupo. */
  function avisoMiembro() {
    return '<div class="notice">' + ico.svg('users') +
      '<span>Este horario es del grupo en el que estás y lo mantiene quien lo creó. ' +
      'Para tener uno propio, sal del grupo con una copia desde <a href="#/group">Grupo</a>.</span></div>';
  }

  function headLine(slots) {
    if (!slots.length) return 'sin clases todavía';
    var days = {};
    slots.forEach(function (c) { days[c.day] = true; });
    var n = Object.keys(days).length;
    return slots.length + ' ' + U.plural(slots.length, 'clase') + ' · ' +
      n + ' ' + U.plural(n, 'día') + ' con clase · ' + S.weeklyHours() + ' h a la semana';
  }

  /* ----------------------------- Rejilla -------------------------------- */

  /** Franja horaria que hay que dibujar, redondeada a horas completas. */
  function range() {
    var slots = S.state.schedule;
    if (!slots.length) return FALLBACK;
    var min = Math.min.apply(null, slots.map(function (c) { return U.toMin(c.start); }));
    var max = Math.max.apply(null, slots.map(function (c) { return U.toMin(c.end); }));
    return [Math.floor(min / 60), Math.ceil(max / 60)];
  }

  function weekGrid(info) {
    var r = range();
    var fromMin = r[0] * 60;
    var height = (r[1] - r[0]) * 60 * PX_PER_MIN;

    var days = [1, 2, 3, 4, 5, 6, 7].filter(function (d) {
      return d <= 5 || S.classesOn(d).length;
    });

    var hours = '';
    for (var h = r[0]; h <= r[1]; h++) {
      hours += '<div class="tt-hour" style="top:' + ((h * 60 - fromMin) * PX_PER_MIN) + 'px">' +
        '<span>' + U.fromMin(h * 60) + '</span></div>';
    }

    var cols = days.map(function (day) {
      var isToday = day === info.day;
      var blocks = S.classesOn(day).map(function (slot) {
        var top = (U.toMin(slot.start) - fromMin) * PX_PER_MIN;
        var tall = Math.max(26, (U.toMin(slot.end) - U.toMin(slot.start)) * PX_PER_MIN);
        var live = info.current && info.current.id === slot.id;
        return '<button class="tt-block' + (live ? ' is-now' : '') + '" ' +
          'style="--c:' + U.esc(S.classColor(slot)) + ';top:' + top + 'px;height:' + tall + 'px" ' +
          (S.isGroupOwner() ? 'data-class="edit" data-id="' + slot.id + '" ' : 'disabled ') +
          'title="' + U.esc(S.classLabel(slot)) + ' · ' + ui.classTime(slot, true) +
            (slot.room ? ' · ' + U.esc(slot.room) : '') + '">' +
          '<span class="tt-name">' + U.esc(S.classShort(slot)) + '</span>' +
          '<span class="tt-when">' + slot.start + '–' + slot.end + '</span>' +
          (slot.room && tall > 52 ? '<span class="tt-room">' + U.esc(slot.room) + '</span>' : '') +
        '</button>';
      }).join('');

      return '<div class="tt-col' + (isToday ? ' is-today' : '') + '">' +
        '<div class="tt-head">' + U.cap(U.dayLabel(day, true)) +
          (isToday ? '<span class="tt-dot"></span>' : '') + '</div>' +
        '<div class="tt-body' + (S.isGroupOwner() ? '' : ' is-locked') + '" style="height:' + height + 'px" ' +
          (S.isGroupOwner() ? 'data-day="' + day + '" data-from="' + fromMin + '"' : '') + '>' +
          blocks +
          (isToday && info.mins >= fromMin && info.mins <= r[1] * 60
            ? '<div class="tt-now" data-role="now-line" data-from="' + fromMin + '" style="top:' +
              ((info.mins - fromMin) * PX_PER_MIN) + 'px"><span>' + U.fromMin(info.mins) + '</span></div>'
            : '') +
        '</div>' +
      '</div>';
    }).join('');

    return '<section class="card"><div class="card-body tight">' +
      '<div class="tt-scroll"><div class="tt">' +
        '<div class="tt-ruler"><div class="tt-head"></div>' +
          '<div class="tt-body" style="height:' + height + 'px">' + hours + '</div>' +
        '</div>' + cols +
      '</div></div>' +
      (S.isGroupOwner()
        ? '<p class="small muted" style="padding:10px 6px 2px">Pulsa una clase para editarla, o un hueco del día para añadir una nueva.</p>'
        : '') +
    '</div></section>';
  }

  /** Recoloca la línea de "ahora" en el refresco por minuto. */
  function positionNowLine(line) {
    var fromMin = parseInt(line.dataset.from, 10) || 0;
    var mins = U.minutesOfDay();
    line.style.top = ((mins - fromMin) * PX_PER_MIN) + 'px';
    var label = line.querySelector('span');
    if (label) label.textContent = U.fromMin(mins);
  }

  function dayList(day, info) {
    var list = S.classesOn(day);
    var mins = list.reduce(function (sum, c) { return sum + (U.toMin(c.end) - U.toMin(c.start)); }, 0);

    return '<section class="card">' +
      '<div class="card-head"><h2>' + U.cap(U.dayLabel(day)) + '</h2>' +
        (list.length ? '<span class="tag">' + U.fmtMins(mins) + '</span>' : '') +
        '<div class="spacer"></div>' +
        (S.isGroupOwner()
          ? '<button class="btn btn-sm btn-primary" data-schedule="new" data-day="' + day + '">' + ico.svg('plus') + ' Clase</button>'
          : '') +
      '</div>' +
      '<div class="card-body tight">' +
        (list.length
          ? '<div class="class-list">' + list.map(function (slot) {
              return ui.classRow(slot, {
                now: info.current && info.current.id === slot.id,
                readOnly: !S.isGroupOwner()
              });
            }).join('') + '</div>'
          : ui.emptySmall('No tienes clase este día.')) +
      '</div>' +
    '</section>';
  }

  LD.views = LD.views || {};
  LD.views.schedule = view;
})(window);
