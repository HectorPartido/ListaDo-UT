/* =============================================================================
   utils.js — helpers de DOM, fechas, texto y el parser de "añadir rápido".
   Expone window.LD.utils
   ============================================================================= */
(function (global) {
  'use strict';

  var LD = global.LD || (global.LD = {});
  var U = {};

  /* ----------------------------- DOM ------------------------------------- */

  U.$ = function (sel, root) { return (root || document).querySelector(sel); };
  U.$$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  /**
   * UUID v4. Tiene que ser un UUID de verdad (no un id inventado) porque las
   * claves de la base de datos son de tipo `uuid` y el cliente las genera él
   * mismo: así se pueden crear tareas sin conexión y subirlas luego tal cual.
   */
  U.uid = function () {
    var c = global.crypto;
    if (c && c.randomUUID) return c.randomUUID();          // navegador moderno en contexto seguro

    var bytes;
    if (c && c.getRandomValues) {
      bytes = c.getRandomValues(new Uint8Array(16));
    } else {
      bytes = new Uint8Array(16);
      for (var i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
    }
    bytes[6] = (bytes[6] & 0x0f) | 0x40;                   // versión 4
    bytes[8] = (bytes[8] & 0x3f) | 0x80;                   // variante RFC 4122

    var hex = [];
    for (var j = 0; j < 16; j++) hex.push((bytes[j] + 0x100).toString(16).slice(1));
    return hex.slice(0, 4).join('') + '-' + hex.slice(4, 6).join('') + '-' +
           hex.slice(6, 8).join('') + '-' + hex.slice(8, 10).join('') + '-' +
           hex.slice(10, 16).join('');
  };

  /** Escapa texto para insertarlo en HTML. */
  U.esc = function (value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };

  U.debounce = function (fn, ms) {
    var t;
    return function () {
      var args = arguments, self = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(self, args); }, ms || 200);
    };
  };

  U.download = function (filename, text) {
    var blob = new Blob([text], { type: 'application/json;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  };

  U.clamp = function (n, min, max) { return Math.min(max, Math.max(min, n)); };

  U.plural = function (n, singular, plural) { return n === 1 ? singular : (plural || singular + 's'); };

  /* ----------------------------- Texto ----------------------------------- */

  /** minúsculas + sin acentos, para comparar y buscar. */
  U.norm = function (s) {
    return String(s == null ? '' : s)
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();
  };

  U.cap = function (s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : ''; };

  /* ----------------------------- Fechas ---------------------------------- */
  /* Las fechas se guardan como cadenas ISO locales 'YYYY-MM-DD' (sin zona
     horaria) para que no se desplacen de día al serializar.               */

  var pad = function (n) { return (n < 10 ? '0' : '') + n; };

  U.toISO = function (date) {
    return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
  };

  /** 'YYYY-MM-DD' -> Date a medianoche local. */
  U.fromISO = function (iso) {
    var p = String(iso).split('-');
    return new Date(+p[0], (+p[1]) - 1, +p[2]);
  };

  U.isISO = function (iso) { return /^\d{4}-\d{2}-\d{2}$/.test(String(iso || '')); };

  U.today = function () { return U.toISO(new Date()); };

  U.addDays = function (iso, n) {
    var d = U.fromISO(iso);
    d.setDate(d.getDate() + n);
    return U.toISO(d);
  };

  /** Días naturales de `a` a `b` (negativo si `b` es anterior). */
  U.diffDays = function (a, b) {
    return Math.round((U.fromISO(b) - U.fromISO(a)) / 86400000);
  };

  /** Lunes de la semana de `iso`. */
  U.startOfWeek = function (iso) {
    var d = U.fromISO(iso);
    var dow = (d.getDay() + 6) % 7; // 0 = lunes
    d.setDate(d.getDate() - dow);
    return U.toISO(d);
  };

  var fmtLong = new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
  var fmtShort = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short' });
  var fmtShortY = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
  var fmtMonth = new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric' });
  var fmtDow = new Intl.DateTimeFormat('es-ES', { weekday: 'short' });

  U.fmtLong = function (iso) { return fmtLong.format(U.fromISO(iso)); };
  U.fmtShort = function (iso) { return fmtShort.format(U.fromISO(iso)).replace('.', ''); };
  U.fmtMonth = function (iso) { return fmtMonth.format(U.fromISO(iso)); };
  U.fmtDow = function (iso) { return fmtDow.format(U.fromISO(iso)).replace('.', ''); };

  U.fmtDate = function (iso) {
    if (!U.isISO(iso)) return '';
    var sameYear = U.fromISO(iso).getFullYear() === new Date().getFullYear();
    return (sameYear ? fmtShort : fmtShortY).format(U.fromISO(iso)).replace('.', '');
  };

  /**
   * Estado del vencimiento de una fecha respecto a hoy.
   * @returns {{days:number, label:string, tone:string, bucket:string}}
   */
  U.dueInfo = function (iso, time) {
    if (!U.isISO(iso)) return { days: null, label: 'Sin fecha', tone: '', bucket: 'nodate' };
    var days = U.diffDays(U.today(), iso);
    var hhmm = time ? ' · ' + time : '';
    var out;
    if (days < 0) {
      out = { days: days, tone: 't-danger', bucket: 'overdue',
        label: days === -1 ? 'Ayer' : 'Hace ' + Math.abs(days) + ' días' };
    } else if (days === 0) {
      out = { days: 0, tone: 't-danger', bucket: 'today', label: 'Hoy' };
    } else if (days === 1) {
      out = { days: 1, tone: 't-warn', bucket: 'tomorrow', label: 'Mañana' };
    } else if (days <= 7) {
      out = { days: days, tone: 't-info', bucket: 'week', label: U.cap(U.fmtDow(iso)) + ' ' + U.fmtDate(iso) };
    } else {
      out = { days: days, tone: '', bucket: 'later', label: U.fmtDate(iso) };
    }
    out.label += hhmm;
    return out;
  };

  /** Matriz de 6 semanas × 7 días (lunes primero) que contiene el mes de `iso`. */
  U.monthMatrix = function (iso) {
    var first = U.fromISO(iso);
    first.setDate(1);
    var start = U.startOfWeek(U.toISO(first));
    var weeks = [];
    for (var w = 0; w < 6; w++) {
      var days = [];
      for (var d = 0; d < 7; d++) days.push(U.addDays(start, w * 7 + d));
      weeks.push(days);
    }
    return weeks;
  };

  U.shiftMonth = function (iso, n) {
    var d = U.fromISO(iso);
    d.setDate(1);
    d.setMonth(d.getMonth() + n);
    return U.toISO(d);
  };

  /* ------------------------- Horas y días -------------------------------- */
  /* Las horas del horario se guardan como 'HH:MM' y los días como 1..7
     (1 = lunes), independientes de la zona horaria.                        */

  U.DAYS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
  U.DAYS_SHORT = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'];

  U.dayLabel = function (day, short) {
    var list = short ? U.DAYS_SHORT : U.DAYS;
    return list[U.clamp(day, 1, 7) - 1];
  };

  /** Día de la semana (1 = lunes) de una fecha o de un ISO. */
  U.dayOf = function (dateOrIso) {
    var d = typeof dateOrIso === 'string' ? U.fromISO(dateOrIso) : dateOrIso;
    return ((d.getDay() + 6) % 7) + 1;
  };

  U.isTime = function (t) { return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(t || '')); };

  /** 'HH:MM' -> minutos desde medianoche. */
  U.toMin = function (t) {
    if (!U.isTime(t)) return null;
    var p = String(t).split(':');
    return (+p[0]) * 60 + (+p[1]);
  };

  /** minutos -> 'HH:MM' */
  U.fromMin = function (n) {
    n = U.clamp(Math.round(n), 0, 24 * 60 - 1);
    return pad(Math.floor(n / 60)) + ':' + pad(n % 60);
  };

  /** Duración en lenguaje natural: 95 -> "1 h 35 min". */
  U.fmtMins = function (n) {
    n = Math.max(0, Math.round(n));
    var h = Math.floor(n / 60), m = n % 60;
    if (!h) return m + ' min';
    if (!m) return h + ' h';
    return h + ' h ' + m + ' min';
  };

  /** Minutos desde medianoche de un objeto Date (reloj del sistema). */
  U.minutesOfDay = function (date) {
    date = date || new Date();
    return date.getHours() * 60 + date.getMinutes();
  };

  /* --------------------- Parser de "añadir rápido" ------------------------ */

  var DOW = { lunes: 1, martes: 2, miercoles: 3, jueves: 4, viernes: 5, sabado: 6, domingo: 7 };

  /**
   * Interpreta una línea de texto y extrae los campos de la tarea.
   *   "Memoria de prácticas @PROG !alta mañana ~3h #entrega"
   * Sintaxis: @asignatura  !prioridad  #tipo  ~horas  %peso  y fechas
   * en lenguaje natural (hoy, mañana, lunes, 12/03, +5d).
   */
  U.parseQuickAdd = function (text, subjects, types) {
    var out = { title: '', subjectId: '', priority: '', type: '', due: '', estimate: null, weight: null };
    var rest = [];
    var tokens = String(text || '').trim().split(/\s+/);

    tokens.forEach(function (tk) {
      var low = U.norm(tk);
      var m;

      // @asignatura
      if (tk[0] === '@' && tk.length > 1) {
        var key = U.norm(tk.slice(1));
        var found = (subjects || []).find(function (s) {
          var name = U.norm(s.name);
          var acro = name.split(/\s+/).map(function (w) { return w[0]; }).join('');
          return U.norm(s.code) === key || name === key || name.replace(/\s+/g, '') === key ||
                 name.indexOf(key) === 0 || acro === key;
        });
        if (found) { out.subjectId = found.id; return; }
        rest.push(tk);
        return;
      }

      // !prioridad
      if (tk[0] === '!' && tk.length > 1) {
        var p = U.norm(tk.slice(1));
        var map = { alta: 'alta', a: 'alta', 1: 'alta', media: 'media', m: 'media', 2: 'media', baja: 'baja', b: 'baja', 3: 'baja' };
        if (map[p]) { out.priority = map[p]; return; }
        rest.push(tk);
        return;
      }

      // #tipo
      if (tk[0] === '#' && tk.length > 1) {
        var t = U.norm(tk.slice(1));
        var hit = (types || []).find(function (x) { return U.norm(x.id) === t || U.norm(x.label).indexOf(t) === 0; });
        if (hit) { out.type = hit.id; return; }
        rest.push(tk);
        return;
      }

      // ~horas estimadas  (~3, ~3h, ~1.5h)
      if ((m = low.match(/^~(\d+(?:[.,]\d+)?)h?$/))) {
        out.estimate = parseFloat(m[1].replace(',', '.'));
        return;
      }

      // %peso en la nota  (%20, 20%)
      if ((m = low.match(/^%(\d+(?:[.,]\d+)?)$/)) || (m = low.match(/^(\d+(?:[.,]\d+)?)%$/))) {
        out.weight = parseFloat(m[1].replace(',', '.'));
        return;
      }

      // Fechas
      if (!out.due) {
        var iso = parseDateToken(low);
        if (iso) { out.due = iso; return; }
      }

      rest.push(tk);
    });

    // "en 3 dias" / "en 2 semanas" (multi-palabra)
    var joined = rest.join(' ');
    var rel = U.norm(joined).match(/\ben\s+(\d+)\s+(dias?|semanas?)\b/);
    if (rel && !out.due) {
      var n = parseInt(rel[1], 10) * (rel[2].indexOf('semana') === 0 ? 7 : 1);
      out.due = U.addDays(U.today(), n);
      joined = joined.replace(new RegExp(rel[0], 'i'), '').replace(/\s{2,}/g, ' ');
    }

    out.title = joined.trim();
    return out;
  };

  /** Convierte un token normalizado en fecha ISO, o devuelve null. */
  function parseDateToken(low) {
    var m, today = U.today();

    if (low === 'hoy') return today;
    if (low === 'manana' || low === 'mnn') return U.addDays(today, 1);
    if (low === 'pasado') return U.addDays(today, 2);

    // +5d / +2s (semanas)
    if ((m = low.match(/^\+(\d+)([ds])?$/))) {
      return U.addDays(today, parseInt(m[1], 10) * (m[2] === 's' ? 7 : 1));
    }

    // día de la semana → la próxima vez que ocurra
    if (DOW[low] != null) {
      var target = DOW[low];
      var cur = ((U.fromISO(today).getDay() + 6) % 7) + 1;
      var delta = (target - cur + 7) % 7;
      return U.addDays(today, delta === 0 ? 7 : delta);
    }

    // 12/3, 12-3, 12/3/2026
    if ((m = low.match(/^(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?$/))) {
      var day = +m[1], mon = +m[2], year = m[3] ? +m[3] : null;
      if (mon < 1 || mon > 12 || day < 1 || day > 31) return null;
      if (year != null && year < 100) year += 2000;
      if (year == null) {
        // sin año: el próximo que aún no haya pasado
        var nowY = new Date().getFullYear();
        var candidate = nowY + '-' + pad(mon) + '-' + pad(day);
        year = U.diffDays(today, candidate) < 0 ? nowY + 1 : nowY;
      }
      return year + '-' + pad(mon) + '-' + pad(day);
    }

    return null;
  }

  LD.utils = U;
})(window);
