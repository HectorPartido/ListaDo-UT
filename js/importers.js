/* =============================================================================
   importers.js — lectura de horarios desde archivos externos.

   Dos formatos:
     · .ics  (iCalendar) — lo que exportan Calendario.app, Google Calendar y
              la mayoría de campus virtuales. Se leen los VEVENT y sus reglas
              de repetición semanal (RRULE/BYDAY).
     · .csv / texto pegado — una clase por línea.

   Ambos devuelven la misma forma normalizada:
     { day: 1..7, start: 'HH:MM', end: 'HH:MM', title, room, teacher }

   Expone window.LD.importers
   ============================================================================= */
(function (global) {
  'use strict';

  var LD = global.LD || (global.LD = {});
  var U = LD.utils;
  var imp = {};

  /* ------------------------------- Comunes ------------------------------- */

  /** Normaliza una hora escrita de cualquier manera: 9, 9:5, 9.30, 9h -> 'HH:MM'. */
  function parseTime(text) {
    var raw = String(text == null ? '' : text).trim().toLowerCase().replace(/\s/g, '');
    var m = raw.match(/^(\d{1,2})(?:[:h.,](\d{1,2}))?h?$/);
    if (!m) return null;
    var h = parseInt(m[1], 10);
    var min = m[2] ? parseInt(m[2], 10) : 0;
    if (h > 23 || min > 59) return null;
    return U.fromMin(h * 60 + min);
  }

  var DAY_WORDS = {
    lunes: 1, lun: 1, l: 1, monday: 1, mon: 1, mo: 1,
    martes: 2, mar: 2, m: 2, tuesday: 2, tue: 2, tu: 2,
    miercoles: 3, mie: 3, mi: 3, x: 3, wednesday: 3, wed: 3, we: 3,
    jueves: 4, jue: 4, j: 4, thursday: 4, thu: 4, th: 4,
    viernes: 5, vie: 5, v: 5, friday: 5, fri: 5, fr: 5,
    sabado: 6, sab: 6, s: 6, saturday: 6, sat: 6, sa: 6,
    domingo: 7, dom: 7, d: 7, sunday: 7, sun: 7, su: 7
  };

  /** Día de la semana a partir de un número o de su nombre. */
  function parseDay(text) {
    var raw = U.norm(text).replace(/\./g, '');
    if (/^[1-7]$/.test(raw)) return parseInt(raw, 10);
    if (DAY_WORDS[raw] != null) return DAY_WORDS[raw];
    // "lunes 3" o "L-09:00": quédate con la primera palabra
    var first = raw.split(/[\s\-_/]+/)[0];
    return DAY_WORDS[first] != null ? DAY_WORDS[first] : null;
  }

  imp.parseTime = parseTime;
  imp.parseDay = parseDay;

  /** Adivina el formato de un texto para elegir el lector. */
  imp.detect = function (text) {
    return /BEGIN:VCALENDAR|BEGIN:VEVENT/i.test(String(text || '')) ? 'ics' : 'csv';
  };

  /** Lee cualquiera de los dos formatos. */
  imp.parse = function (text) {
    return imp.detect(text) === 'ics' ? imp.ics(text) : imp.csv(text);
  };

  /* ------------------------------ iCalendar ------------------------------ */

  var ICS_DAYS = { MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6, SU: 7 };

  /**
   * @param {string} text contenido de un archivo .ics
   * @returns {{slots:Array, errors:Array<string>, allDay:number, events:number}}
   */
  imp.ics = function (text) {
    var out = { slots: [], errors: [], allDay: 0, events: 0 };
    // Las líneas largas se parten con un salto + espacio: hay que volver a unirlas.
    var unfolded = String(text || '').replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '');
    var blocks = unfolded.split(/BEGIN:VEVENT/i).slice(1);

    blocks.forEach(function (block, i) {
      var body = block.split(/END:VEVENT/i)[0];
      out.events++;

      var summary = icsValue(body, 'SUMMARY');
      var location = icsValue(body, 'LOCATION');
      var start = icsDate(icsLine(body, 'DTSTART'));
      var end = icsDate(icsLine(body, 'DTEND'));

      if (!start) { out.errors.push('Evento ' + (i + 1) + ': sin fecha de inicio legible.'); return; }
      if (start.allDay || (end && end.allDay)) { out.allDay++; return; }

      var startTime = U.fromMin(start.mins);
      var endTime = end && !end.allDay ? U.fromMin(end.mins) : U.fromMin(start.mins + 60);
      if (U.toMin(endTime) <= U.toMin(startTime)) endTime = U.fromMin(U.toMin(startTime) + 60);

      // Días en los que cae: los de la RRULE semanal o, si no hay, el del propio evento.
      var days = [start.day];
      var rrule = icsValue(body, 'RRULE') || '';
      if (/FREQ=WEEKLY/i.test(rrule)) {
        var byday = (rrule.match(/BYDAY=([^;]+)/i) || [])[1];
        if (byday) {
          var parsed = byday.split(',')
            .map(function (d) { return ICS_DAYS[d.trim().slice(-2).toUpperCase()]; })
            .filter(Boolean);
          if (parsed.length) days = parsed;
        }
      }

      days.forEach(function (day) {
        out.slots.push({
          day: day,
          start: startTime,
          end: endTime,
          title: cleanText(summary),
          room: cleanText(location),
          teacher: ''
        });
      });
    });

    out.slots = dedupe(out.slots);
    return out;
  };

  /** Devuelve la línea completa de una propiedad (con sus parámetros). */
  function icsLine(body, prop) {
    var re = new RegExp('^' + prop + '([;:][^\\n]*)$', 'im');
    var m = body.match(re);
    return m ? prop + m[1] : '';
  }

  /** Devuelve sólo el valor de una propiedad. */
  function icsValue(body, prop) {
    var line = icsLine(body, prop);
    var idx = line.indexOf(':');
    return idx < 0 ? '' : line.slice(idx + 1).trim();
  }

  /**
   * Interpreta DTSTART/DTEND en sus tres variantes:
   *   DTSTART;VALUE=DATE:20260908            -> día completo (se descarta)
   *   DTSTART;TZID=Europe/Madrid:20260908T090000 -> hora local tal cual
   *   DTSTART:20260908T070000Z              -> UTC, se pasa a hora local
   */
  function icsDate(line) {
    if (!line) return null;
    var idx = line.indexOf(':');
    if (idx < 0) return null;
    var params = line.slice(0, idx).toUpperCase();
    var value = line.slice(idx + 1).trim();

    var m = value.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/);
    if (!m) return null;

    var y = +m[1], mo = +m[2], d = +m[3];
    if (!m[4] || /VALUE=DATE(?!-TIME)/.test(params)) {
      return { allDay: true, day: U.dayOf(new Date(y, mo - 1, d)), mins: 0 };
    }

    var date = m[7] === 'Z'
      ? new Date(Date.UTC(y, mo - 1, d, +m[4], +m[5], +(m[6] || 0)))  // UTC -> local
      : new Date(y, mo - 1, d, +m[4], +m[5], +(m[6] || 0));           // ya es hora local

    return { allDay: false, day: U.dayOf(date), mins: U.minutesOfDay(date) };
  }

  /** Quita los escapes de iCalendar (\, \; \n). */
  function cleanText(s) {
    return String(s || '')
      .replace(/\\n/gi, ' ')
      .replace(/\\([,;\\])/g, '$1')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  /* --------------------------------- CSV -------------------------------- */

  var COLS = {
    day: ['dia', 'día', 'day', 'diasemana', 'weekday'],
    start: ['inicio', 'empieza', 'desde', 'hora', 'horainicio', 'start', 'from'],
    end: ['fin', 'final', 'termina', 'hasta', 'horafin', 'end', 'to'],
    title: ['asignatura', 'clase', 'materia', 'nombre', 'subject', 'title', 'summary'],
    room: ['aula', 'sala', 'lugar', 'ubicacion', 'ubicación', 'room', 'location'],
    teacher: ['profesor', 'profesora', 'profe', 'docente', 'teacher']
  };

  /**
   * Una clase por línea. Con cabecera se respeta el orden de las columnas;
   * sin cabecera se asume: día, inicio, fin, asignatura, aula, profesor.
   * El separador (; , o tabulador) se detecta solo, y el rango de horas puede
   * venir junto en una sola columna ("9:00-11:00").
   * @returns {{slots:Array, errors:Array<string>, rows:number}}
   */
  imp.csv = function (text) {
    var out = { slots: [], errors: [], rows: 0 };
    var lines = String(text || '').replace(/\r\n/g, '\n').split('\n')
      .map(function (l) { return l.trim(); })
      .filter(function (l) { return l && l.charAt(0) !== '#'; });

    if (!lines.length) return out;

    var sep = pickSeparator(lines[0]);
    var header = null;
    var firstCells = splitRow(lines[0], sep);

    if (firstCells.some(function (c) { return COLS.day.indexOf(U.norm(c).replace(/\s/g, '')) >= 0; })) {
      header = firstCells.map(function (c) { return U.norm(c).replace(/\s/g, ''); });
      lines = lines.slice(1);
    }

    lines.forEach(function (line, i) {
      // Si una línea no trae el separador general, se detecta el suyo:
      // así aguanta un archivo con líneas pegadas de sitios distintos.
      var cells = splitRow(line, line.indexOf(sep) >= 0 ? sep : pickSeparator(line));
      out.rows++;

      var get = function (key, fallbackIndex) {
        if (header) {
          var idx = header.findIndex(function (h) { return COLS[key].indexOf(h) >= 0; });
          return idx >= 0 ? (cells[idx] || '') : '';
        }
        return cells[fallbackIndex] || '';
      };

      var day = parseDay(get('day', 0));
      var startRaw = get('start', 1);
      var endRaw = get('end', 2);

      // "9:00-11:00" o "9-11" en una sola celda
      var range = String(startRaw).match(/^(.+?)\s*(?:-|–|a|to)\s*(.+)$/i);
      if (range && !parseTime(startRaw)) {
        startRaw = range[1];
        if (!endRaw) endRaw = range[2];
      }

      var start = parseTime(startRaw);
      var end = parseTime(endRaw);
      var title = get('title', 3);

      if (!day) { out.errors.push('Línea ' + (i + 1) + ': no entiendo el día «' + get('day', 0) + '».'); return; }
      if (!start) { out.errors.push('Línea ' + (i + 1) + ': no entiendo la hora de inicio «' + startRaw + '».'); return; }
      if (!title) { out.errors.push('Línea ' + (i + 1) + ': falta el nombre de la asignatura.'); return; }
      if (!end) end = U.fromMin(U.toMin(start) + 60);
      if (U.toMin(end) <= U.toMin(start)) end = U.fromMin(U.toMin(start) + 60);

      out.slots.push({
        day: day, start: start, end: end,
        title: title.trim(),
        room: get('room', 4).trim(),
        teacher: get('teacher', 5).trim()
      });
    });

    out.slots = dedupe(out.slots);
    return out;
  };

  function pickSeparator(line) {
    var counts = [[';', (line.match(/;/g) || []).length],
                  ['\t', (line.match(/\t/g) || []).length],
                  [',', (line.match(/,/g) || []).length]];
    counts.sort(function (a, b) { return b[1] - a[1]; });
    return counts[0][1] > 0 ? counts[0][0] : ';';
  }

  /** Divide una fila respetando las comillas dobles. */
  function splitRow(line, sep) {
    var cells = [], cur = '', quoted = false;
    for (var i = 0; i < line.length; i++) {
      var ch = line[i];
      if (ch === '"') {
        if (quoted && line[i + 1] === '"') { cur += '"'; i++; }
        else quoted = !quoted;
      } else if (ch === sep && !quoted) {
        cells.push(cur); cur = '';
      } else {
        cur += ch;
      }
    }
    cells.push(cur);
    return cells.map(function (c) { return c.trim(); });
  }

  function dedupe(slots) {
    var seen = {};
    return slots.filter(function (s) {
      var key = [s.day, s.start, s.end, U.norm(s.title)].join('|');
      if (seen[key]) return false;
      seen[key] = true;
      return true;
    });
  }

  /** Texto de ejemplo que se ofrece como plantilla en el diálogo de importar. */
  imp.csvTemplate = function () {
    return [
      'dia;inicio;fin;asignatura;aula;profesor',
      'lunes;09:00;11:00;Programación Avanzada;Aula 2.4;M. Herrero',
      'lunes;11:30;13:00;Estadística;Aula 1.1;L. Cabrera',
      'martes;08:30;10:30;Bases de Datos;Aula 2.4;J. Ruiz',
      'miercoles;12:00;14:00;Ética y Sociedad;Aula 0.3;A. Sanz'
    ].join('\n');
  };

  LD.importers = imp;
})(window);
