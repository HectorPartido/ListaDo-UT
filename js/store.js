/* =============================================================================
   store.js — modelo de datos, persistencia en localStorage y operaciones CRUD.
   Todo cambio pasa por aquí: guarda y avisa a los suscriptores (re-render).
   Contiene tareas, asignaturas, compañeros de equipo y horario de clases.
   Expone window.LD.store
   ============================================================================= */
(function (global) {
  'use strict';

  var LD = global.LD || (global.LD = {});
  var U = LD.utils;
  var KEY = 'listado.v1';
  var VERSION = 2;

  /* Mientras se aplica lo que llega del servidor no hay que volver a
     encolarlo: si no, cada sincronización generaría escrituras nuevas. */
  var aplicandoRemoto = false;

  /* ------------------------- Catálogos fijos ----------------------------- */

  /* `icon` es el nombre de un icono de LD.icons, no un carácter. */
  var TYPES = [
    { id: 'entrega',  label: 'Entrega',  icon: 'file-text' },
    { id: 'examen',   label: 'Examen',   icon: 'clipboard-check' },
    { id: 'practica', label: 'Práctica', icon: 'flask' },
    { id: 'proyecto', label: 'Proyecto', icon: 'layers' },
    { id: 'exposicion', label: 'Exposición', icon: 'presentation' },
    { id: 'lectura',  label: 'Lectura',  icon: 'book-open' },
    { id: 'estudio',  label: 'Estudio',  icon: 'headphones' },
    { id: 'otro',     label: 'Otro',     icon: 'tag' }
  ];

  var PRIORITIES = [
    { id: 'alta',  label: 'Alta',  tone: 't-danger', rank: 0 },
    { id: 'media', label: 'Media', tone: 't-warn',   rank: 1 },
    { id: 'baja',  label: 'Baja',  tone: 't-info',   rank: 2 }
  ];

  var STATUSES = [
    { id: 'pendiente', label: 'Pendiente', tone: '',         icon: 'circle' },
    { id: 'curso',     label: 'En curso',  tone: 't-accent', icon: 'circle-half' },
    { id: 'hecha',     label: 'Hecha',     tone: 't-ok',     icon: 'circle-check' }
  ];

  var PALETTE = ['#4f46e5', '#0891b2', '#059669', '#65a30d', '#d97706',
                 '#dc2626', '#db2777', '#7c3aed', '#0284c7', '#475569'];

  /* ------------------------------ Estado --------------------------------- */

  function defaultState() {
    return {
      version: VERSION,
      subjects: [],
      tasks: [],
      members: [],
      schedule: [],
      group: null,      // {id, name, code, owner_id} cuando hay cuenta
      profile: null,    // {display_name}
      settings: { theme: 'auto', lastView: 'dashboard' }
    };
  }

  var store = {
    TYPES: TYPES,
    PRIORITIES: PRIORITIES,
    STATUSES: STATUSES,
    PALETTE: PALETTE,

    state: defaultState(),

    /** Estado de interfaz: filtros y navegación. No se persiste. */
    ui: {
      search: '',
      subjectId: 'all',
      status: 'open',      // all | open | pendiente | curso | hecha
      type: 'all',
      priority: 'all',
      memberId: 'all',     // all | none | <id>
      sort: 'due',         // due | priority | subject | created | title
      groupBy: 'due',      // due | subject | priority | type | none
      calMonth: U.today(),
      calDay: '',
      dashSubject: 'all',
      teamSearch: '',
      scheduleDay: 0       // 0 = semana completa, 1..7 = un día
    },

    listeners: [],

    /* --------------------------- Persistencia ---------------------------- */

    /**
     * La caché es por usuario: en un navegador compartido, dos cuentas no se
     * pisan los datos. Sin cuenta se usa la clave de siempre.
     */
    cacheKey: function () {
      var uid = LD.api && LD.api.enabled ? LD.api.userId() : null;
      return uid ? KEY + '.' + uid : KEY;
    },

    load: function () {
      try {
        var raw = localStorage.getItem(this.cacheKey());
        if (raw) this.state = migrate(JSON.parse(raw));
        else this.state = defaultState();
      } catch (err) {
        console.warn('[ListaDo] No se pudo leer el almacenamiento local:', err);
      }
      return this.state;
    },

    save: function () {
      try {
        localStorage.setItem(this.cacheKey(), JSON.stringify(this.state));
      } catch (err) {
        console.warn('[ListaDo] No se pudo guardar:', err);
        if (LD.ui) LD.ui.toast('No se pudo guardar en este navegador. Exporta tus datos por seguridad.');
      }
    },

    /** Apunta un cambio para que la cola lo suba a la nube. */
    remote: function (tipo, id) {
      if (aplicandoRemoto) return;
      if (LD.sync) LD.sync.push(tipo, id);
    },

    /**
     * Sustituye el estado por el que viene del servidor, PERO conservando lo
     * que todavía está en la cola de subida. Sin esto, cualquier cosa creada
     * aquí y no subida aún desaparecería al sincronizar.
     */
    applyRemote: function (res) {
      aplicandoRemoto = true;
      try {
        var anterior = this.state;
        var nuevo = migrate(res.state);
        var rescatadas = rescataNoSubidas(anterior, nuevo,
          LD.sync ? LD.sync.protegidos() : {});

        this.state = nuevo;
        this.state.group = res.group || null;
        this.state.profile = res.profile
          ? { display_name: res.profile.display_name || '' }
          : null;
        this.emit();

        if (rescatadas && LD.ui) {
          LD.ui.toast(rescatadas + ' ' + U.plural(rescatadas, 'cambio') +
            ' sin subir todavía; se conservan aquí.');
        }
      } finally {
        aplicandoRemoto = false;
      }
    },

    /* ------------------------------ Grupo -------------------------------- */

    group:        function () { return this.state.group || null; },
    groupId:      function () { return this.state.group ? this.state.group.id : null; },
    groupCode:    function () { return this.state.group ? this.state.group.code : ''; },

    /** ¿Soy quien creó el grupo? Sólo el dueño edita asignaturas y horario. */
    isGroupOwner: function () {
      if (!LD.api || !LD.api.enabled) return true;        // sin cuenta, todo es mío
      var g = this.state.group;
      if (!g) return true;
      return g.owner_id === LD.api.userId();
    },

    subscribe: function (fn) { this.listeners.push(fn); },

    /** Guarda y re-renderiza. */
    emit: function () {
      this.save();
      this.listeners.forEach(function (fn) { fn(); });
    },

    /* ------------------------------ Tareas ------------------------------- */

    newTask: function (patch) {
      var now = new Date().toISOString();
      var task = {
        id: U.uid(),
        title: '',
        notes: '',
        subjectId: '',
        type: 'entrega',
        due: '',
        dueTime: '',
        priority: 'media',
        status: 'pendiente',
        estimate: null,
        weight: null,
        subtasks: [],
        memberIds: [],
        createdAt: now,
        updatedAt: now,
        completedAt: null
      };
      Object.keys(patch || {}).forEach(function (k) {
        if (patch[k] !== undefined && patch[k] !== null && patch[k] !== '') task[k] = patch[k];
      });
      if (task.status === 'hecha' && !task.completedAt) task.completedAt = now;
      return task;
    },

    addTask: function (patch) {
      var task = this.newTask(patch);
      this.state.tasks.push(task);
      this.remote('task.save', task.id);
      this.emit();
      return task;
    },

    updateTask: function (id, patch) {
      var task = this.taskById(id);
      if (!task) return null;
      Object.assign(task, patch);
      task.updatedAt = new Date().toISOString();
      if (patch.status) {
        task.completedAt = patch.status === 'hecha' ? new Date().toISOString() : null;
      }
      this.remote('task.save', task.id);
      this.emit();
      return task;
    },

    deleteTask: function (id) {
      var idx = this.state.tasks.findIndex(function (t) { return t.id === id; });
      if (idx < 0) return null;
      var removed = this.state.tasks.splice(idx, 1)[0];
      this.remote('task.delete', removed.id);
      this.emit();
      return { task: removed, index: idx };
    },

    /** Vuelve a insertar una tarea borrada (para "deshacer"). */
    restoreTask: function (task, index) {
      this.state.tasks.splice(Math.min(index, this.state.tasks.length), 0, task);
      this.remote('task.save', task.id);
      this.emit();
    },

    toggleDone: function (id) {
      var task = this.taskById(id);
      if (!task) return;
      this.updateTask(id, { status: task.status === 'hecha' ? 'pendiente' : 'hecha' });
    },

    /** pendiente → en curso → hecha → pendiente */
    cycleStatus: function (id) {
      var task = this.taskById(id);
      if (!task) return;
      var order = ['pendiente', 'curso', 'hecha'];
      var next = order[(order.indexOf(task.status) + 1) % order.length];
      this.updateTask(id, { status: next });
    },

    toggleSubtask: function (taskId, subId) {
      var task = this.taskById(taskId);
      if (!task) return;
      var sub = (task.subtasks || []).find(function (s) { return s.id === subId; });
      if (!sub) return;
      sub.done = !sub.done;
      task.updatedAt = new Date().toISOString();
      this.remote('task.save', task.id);
      this.emit();
    },

    taskById: function (id) {
      return this.state.tasks.find(function (t) { return t.id === id; }) || null;
    },

    /* ---------------------------- Asignaturas ---------------------------- */

    addSubject: function (patch) {
      var subject = {
        id: U.uid(),
        name: (patch.name || 'Asignatura').trim(),
        code: (patch.code || '').trim(),
        teacher: (patch.teacher || '').trim(),
        color: patch.color || PALETTE[this.state.subjects.length % PALETTE.length]
      };
      this.state.subjects.push(subject);
      this.remote('subject.save', subject.id);
      if (!patch.silent) this.emit();
      return subject;
    },

    updateSubject: function (id, patch) {
      var subject = this.subjectById(id);
      if (!subject) return null;
      Object.assign(subject, patch);
      this.remote('subject.save', subject.id);
      this.emit();
      return subject;
    },

    /**
     * Borra la asignatura. Sus tareas quedan sin asignatura y sus clases
     * conservan el nombre como texto libre, para no vaciar el horario.
     */
    deleteSubject: function (id) {
      var subject = this.subjectById(id);
      var label = subject ? subject.name : '';   // hay que leerlo antes de borrarla

      this.state.subjects = this.state.subjects.filter(function (s) { return s.id !== id; });
      this.state.tasks.forEach(function (t) { if (t.subjectId === id) t.subjectId = ''; });
      this.state.schedule.forEach(function (c) {
        if (c.subjectId === id) { c.title = c.title || label; c.subjectId = ''; }
      });
      this.state.members.forEach(function (m) {
        if ((m.subjectIds || []).indexOf(id) < 0) return;
        m.subjectIds = m.subjectIds.filter(function (sid) { return sid !== id; });
        store.remote('member.save', m.id);
      });
      // Las tareas y clases afectadas ya quedaron sin asignatura: hay que
      // subirlas para que la nube refleje lo mismo.
      this.state.tasks.forEach(function (t) {
        if (t.subjectId === '') store.remote('task.save', t.id);
      });
      this.state.schedule.forEach(function (c) {
        if (!c.subjectId) store.remote('class.save', c.id);
      });
      this.remote('subject.delete', id);
      this.emit();
    },

    subjectById: function (id) {
      return this.state.subjects.find(function (s) { return s.id === id; }) || null;
    },

    subjectLabel: function (id) {
      var s = this.subjectById(id);
      return s ? (s.code || s.name) : 'Sin asignatura';
    },

    subjectColor: function (id) {
      var s = this.subjectById(id);
      return s ? s.color : 'var(--muted)';
    },

    /**
     * Tras cambiar de grupo, las asignaturas son otras filas con otros id.
     * Esto reapunta las tareas y los compañeros a la asignatura equivalente
     * emparejando por abreviatura o por nombre.
     * @param {Array} antiguas lista de asignaturas de antes del cambio
     * @returns {number} cuántas referencias se han reparado
     */
    remapSubjects: function (antiguas) {
      var self = this;
      var porId = {};
      (antiguas || []).forEach(function (s) { porId[s.id] = s; });

      var equivalente = function (viejoId) {
        var viejo = porId[viejoId];
        if (!viejo) return '';
        var s = (viejo.code && self.findSubjectByName(viejo.code)) || self.findSubjectByName(viejo.name);
        return s ? s.id : '';
      };

      var cambios = 0;

      this.state.tasks.forEach(function (t) {
        if (!t.subjectId || self.subjectById(t.subjectId)) return;   // vacía o aún válida
        t.subjectId = equivalente(t.subjectId);
        self.remote('task.save', t.id);
        cambios++;
      });

      this.state.members.forEach(function (m) {
        var ids = m.subjectIds || [];
        var validas = ids.filter(function (id) { return self.subjectById(id); });
        var recuperadas = ids
          .filter(function (id) { return !self.subjectById(id); })
          .map(equivalente)
          .filter(Boolean);
        var nuevas = validas.concat(recuperadas).filter(function (id, i, a) { return a.indexOf(id) === i; });
        if (nuevas.length === ids.length && nuevas.every(function (id, i) { return id === ids[i]; })) return;
        m.subjectIds = nuevas;
        self.remote('member.save', m.id);
        cambios++;
      });

      if (cambios) this.emit();
      return cambios;
    },

    /** Busca una asignatura por nombre o abreviatura (sin distinguir acentos). */
    findSubjectByName: function (text) {
      var key = U.norm(text);
      if (!key) return null;
      return this.state.subjects.find(function (s) {
        return U.norm(s.code) === key || U.norm(s.name) === key ||
               U.norm(s.name).indexOf(key) === 0 || key.indexOf(U.norm(s.name)) === 0;
      }) || null;
    },

    /* ------------------------- Equipo (compañeros) ------------------------ */

    addMember: function (patch) {
      var member = {
        id: U.uid(),
        name: (patch.name || 'Compañero').trim(),
        alias: (patch.alias || '').trim(),
        email: (patch.email || '').trim(),
        phone: (patch.phone || '').trim(),
        notes: (patch.notes || '').trim(),
        subjectIds: Array.isArray(patch.subjectIds) ? patch.subjectIds.slice() : [],
        color: patch.color || PALETTE[(this.state.members.length + 2) % PALETTE.length],
        createdAt: new Date().toISOString()
      };
      this.state.members.push(member);
      this.remote('member.save', member.id);
      this.emit();
      return member;
    },

    updateMember: function (id, patch) {
      var member = this.memberById(id);
      if (!member) return null;
      Object.assign(member, patch);
      this.remote('member.save', member.id);
      this.emit();
      return member;
    },

    /** Borra el compañero y lo quita de las tareas en las que estaba. */
    deleteMember: function (id) {
      this.state.members = this.state.members.filter(function (m) { return m.id !== id; });
      this.state.tasks.forEach(function (t) {
        if ((t.memberIds || []).indexOf(id) < 0) return;
        t.memberIds = t.memberIds.filter(function (mid) { return mid !== id; });
        store.remote('task.save', t.id);
      });
      this.remote('member.delete', id);
      this.emit();
    },

    memberById: function (id) {
      return this.state.members.find(function (m) { return m.id === id; }) || null;
    },

    membersOf: function (task) {
      var self = this;
      return (task.memberIds || []).map(function (id) { return self.memberById(id); })
        .filter(Boolean);
    },

    /** Iniciales para el avatar: "Ana López" -> "AL". */
    initials: function (name) {
      var parts = String(name || '').trim().split(/\s+/).slice(0, 2);
      return parts.map(function (p) { return p.charAt(0).toUpperCase(); }).join('') || '?';
    },

    /** Busca compañeros por nombre, alias, correo o asignatura. */
    searchMembers: function (text) {
      var key = U.norm(text);
      var self = this;
      var list = this.state.members.slice().sort(function (a, b) {
        return U.norm(a.name).localeCompare(U.norm(b.name), 'es');
      });
      if (!key) return list;
      return list.filter(function (m) {
        var hay = U.norm([m.name, m.alias, m.email, m.phone, m.notes,
          (m.subjectIds || []).map(function (id) {
            var s = self.subjectById(id);
            return s ? s.name + ' ' + s.code : '';
          }).join(' ')].join(' '));
        return hay.indexOf(key) >= 0;
      });
    },

    /** Nº de tareas sin terminar en las que participa un compañero. */
    memberLoad: function (id) {
      return this.state.tasks.filter(function (t) {
        return t.status !== 'hecha' && (t.memberIds || []).indexOf(id) >= 0;
      }).length;
    },

    /* ----------------------------- Horario ------------------------------- */

    /**
     * Una clase del horario semanal.
     * @param {{subjectId?:string, title?:string, day:number, start:string,
     *          end:string, room?:string, teacher?:string}} patch
     */
    addClass: function (patch) {
      var slot = {
        id: U.uid(),
        subjectId: patch.subjectId || '',
        title: (patch.title || '').trim(),
        day: U.clamp(parseInt(patch.day, 10) || 1, 1, 7),
        start: U.isTime(patch.start) ? patch.start : '09:00',
        end: U.isTime(patch.end) ? patch.end : '10:00',
        room: (patch.room || '').trim(),
        teacher: (patch.teacher || '').trim()
      };
      if (U.toMin(slot.end) <= U.toMin(slot.start)) slot.end = U.fromMin(U.toMin(slot.start) + 60);
      this.state.schedule.push(slot);
      this.remote('class.save', slot.id);
      if (!patch.silent) this.emit();
      return slot;
    },

    updateClass: function (id, patch) {
      var slot = this.classById(id);
      if (!slot) return null;
      Object.assign(slot, patch);
      slot.day = U.clamp(parseInt(slot.day, 10) || 1, 1, 7);
      if (U.toMin(slot.end) <= U.toMin(slot.start)) slot.end = U.fromMin(U.toMin(slot.start) + 60);
      this.remote('class.save', slot.id);
      this.emit();
      return slot;
    },

    deleteClass: function (id) {
      var idx = this.state.schedule.findIndex(function (c) { return c.id === id; });
      if (idx < 0) return null;
      var removed = this.state.schedule.splice(idx, 1)[0];
      this.remote('class.delete', removed.id);
      this.emit();
      return { slot: removed, index: idx };
    },

    restoreClass: function (slot, index) {
      this.state.schedule.splice(Math.min(index, this.state.schedule.length), 0, slot);
      this.remote('class.save', slot.id);
      this.emit();
    },

    clearSchedule: function () {
      var self = this;
      this.state.schedule.forEach(function (c) { self.remote('class.delete', c.id); });
      this.state.schedule = [];
      this.emit();
    },

    classById: function (id) {
      return this.state.schedule.find(function (c) { return c.id === id; }) || null;
    },

    classLabel: function (slot) {
      var s = this.subjectById(slot.subjectId);
      return s ? s.name : (slot.title || 'Clase');
    },

    classShort: function (slot) {
      var s = this.subjectById(slot.subjectId);
      return s ? (s.code || s.name) : (slot.title || 'Clase');
    },

    classColor: function (slot) {
      var s = this.subjectById(slot.subjectId);
      return s ? s.color : 'var(--muted)';
    },

    /** Clases de un día (1 = lunes), ordenadas por hora de inicio. */
    classesOn: function (day) {
      return this.state.schedule
        .filter(function (c) { return c.day === day; })
        .sort(function (a, b) { return U.toMin(a.start) - U.toMin(b.start); });
    },

    /** Pares de clases que se solapan el mismo día (para avisar en la vista). */
    overlaps: function () {
      var out = [];
      for (var day = 1; day <= 7; day++) {
        var list = this.classesOn(day);
        for (var i = 1; i < list.length; i++) {
          if (U.toMin(list[i].start) < U.toMin(list[i - 1].end)) out.push([list[i - 1], list[i]]);
        }
      }
      return out;
    },

    /**
     * Qué toca ahora, según el reloj del sistema.
     * @param {Date} [now] inyectable para poder probarlo
     * @returns {{now:Date, day:number, mins:number, today:Array, current:object|null,
     *            next:object|null, nextDayOffset:number, endsIn:number, startsIn:number,
     *            progress:number}}
     */
    nowInfo: function (now) {
      now = now || new Date();
      var day = U.dayOf(now);
      var mins = U.minutesOfDay(now);
      var today = this.classesOn(day);

      var current = today.find(function (c) {
        return U.toMin(c.start) <= mins && mins < U.toMin(c.end);
      }) || null;

      var next = today.find(function (c) { return U.toMin(c.start) > mins; }) || null;
      var nextDayOffset = next ? 0 : -1;

      if (!next) {
        for (var i = 1; i <= 7; i++) {
          var list = this.classesOn(((day - 1 + i) % 7) + 1);
          if (list.length) { next = list[0]; nextDayOffset = i; break; }
        }
      }

      var out = {
        now: now, day: day, mins: mins, today: today,
        current: current, next: next, nextDayOffset: nextDayOffset,
        endsIn: current ? U.toMin(current.end) - mins : 0,
        startsIn: next && nextDayOffset === 0 ? U.toMin(next.start) - mins : null,
        progress: 0
      };

      if (current) {
        var total = U.toMin(current.end) - U.toMin(current.start);
        out.progress = total > 0 ? Math.round(((mins - U.toMin(current.start)) / total) * 100) : 0;
      }
      return out;
    },

    /** Horas de clase a la semana. */
    weeklyHours: function () {
      var mins = this.state.schedule.reduce(function (sum, c) {
        return sum + Math.max(0, U.toMin(c.end) - U.toMin(c.start));
      }, 0);
      return Math.round((mins / 60) * 10) / 10;
    },

    /**
     * Mete en el horario una lista de clases ya normalizada (de un .ics o .csv).
     * @param {Array} slots
     * @param {{replace?:boolean, createSubjects?:boolean}} opts
     * @returns {{added:number, skipped:number, subjects:number}}
     */
    importSchedule: function (slots, opts) {
      opts = opts || {};
      var self = this;
      var res = { added: 0, skipped: 0, subjects: 0 };

      if (opts.replace) this.state.schedule = [];

      slots.forEach(function (raw) {
        var subjectId = '';
        var title = (raw.title || '').trim();

        if (title) {
          var found = self.findSubjectByName(title);
          if (found) {
            subjectId = found.id;
          } else if (opts.createSubjects) {
            subjectId = self.addSubject({ name: title, code: autoCode(title), silent: true }).id;
            res.subjects++;
          }
        }

        // Evita duplicados exactos (mismo día, horas y nombre)
        var dup = self.state.schedule.some(function (c) {
          return c.day === raw.day && c.start === raw.start && c.end === raw.end &&
            U.norm(self.classShort(c)) === U.norm(subjectId ? self.subjectLabel(subjectId) : title);
        });
        if (dup) { res.skipped++; return; }

        self.addClass({
          subjectId: subjectId,
          title: subjectId ? '' : title,
          day: raw.day, start: raw.start, end: raw.end,
          room: raw.room, teacher: raw.teacher,
          silent: true
        });
        res.added++;
      });

      this.emit();
      return res;
    },

    /* ---------------------------- Preferencias --------------------------- */

    /**
     * `theme` sí se sincroniza (quieres el mismo aspecto en todas partes);
     * `lastView` no: la vista en la que te quedaste es cosa de cada
     * dispositivo, y subirla en cada clic llenaba la cola de escrituras.
     */
    setSetting: function (key, value) {
      if (this.state.settings[key] === value) return;
      this.state.settings[key] = value;
      this.save();
      if (key === 'theme') this.remote('settings.save');
    },

    /* -------------------------- Import / export -------------------------- */

    /** Copia de seguridad. No incluye el grupo ni el perfil: son de la cuenta. */
    exportJSON: function () {
      var copia = Object.assign({}, this.state);
      delete copia.group;
      delete copia.profile;
      return JSON.stringify(copia, null, 2);
    },

    importJSON: function (text) {
      var data = JSON.parse(text);
      if (!data || !Array.isArray(data.tasks)) throw new Error('El archivo no tiene tareas de ListaDo.');

      var antes = this.snapshotIds();
      var grupo = this.state.group;      // el grupo no viaja en el archivo
      this.state = migrate(data);
      this.state.group = grupo;
      this.syncDiff(antes);
      this.emit();
      return {
        tasks: this.state.tasks.length,
        subjects: this.state.subjects.length,
        members: this.state.members.length,
        classes: this.state.schedule.length
      };
    },

    reset: function () {
      var antes = this.snapshotIds();
      var grupo = this.state.group;
      this.state = defaultState();
      this.state.group = grupo;
      this.syncDiff(antes);
      this.emit();
    },

    /** Identificadores actuales, para saber luego qué desapareció. */
    snapshotIds: function () {
      var ids = function (lista) { return lista.map(function (x) { return x.id; }); };
      return {
        tasks: ids(this.state.tasks),
        members: ids(this.state.members),
        subjects: ids(this.state.subjects),
        classes: ids(this.state.schedule)
      };
    },

    /**
     * Encola lo necesario para que la nube acabe igual que el estado local:
     * borra lo que ya no está y sube todo lo que hay.
     * @param {object} antes resultado de snapshotIds() previo al cambio
     */
    syncDiff: function (antes) {
      var self = this;
      var ahora = this.snapshotIds();
      var fuera = function (lista, actuales) {
        return lista.filter(function (id) { return actuales.indexOf(id) < 0; });
      };

      fuera(antes.tasks, ahora.tasks).forEach(function (id) { self.remote('task.delete', id); });
      fuera(antes.members, ahora.members).forEach(function (id) { self.remote('member.delete', id); });
      fuera(antes.subjects, ahora.subjects).forEach(function (id) { self.remote('subject.delete', id); });
      fuera(antes.classes, ahora.classes).forEach(function (id) { self.remote('class.delete', id); });

      // Las asignaturas primero: las tareas y las clases las referencian.
      ahora.subjects.forEach(function (id) { self.remote('subject.save', id); });
      ahora.members.forEach(function (id) { self.remote('member.save', id); });
      ahora.tasks.forEach(function (id) { self.remote('task.save', id); });
      ahora.classes.forEach(function (id) { self.remote('class.save', id); });
      self.remote('settings.save');
    },

    /** Sube a la cuenta todo lo que haya ahora mismo en este navegador. */
    pushEverything: function () {
      this.syncDiff({ tasks: [], members: [], subjects: [], classes: [] });
      return LD.sync ? LD.sync.flush() : Promise.resolve();
    },

    /* ----------------------------- Consultas ----------------------------- */

    /** Métricas de una tarea derivadas de sus subtareas. */
    progressOf: function (task) {
      var subs = task.subtasks || [];
      if (task.status === 'hecha') return 100;
      if (!subs.length) return task.status === 'curso' ? 50 : 0;
      var done = subs.filter(function (s) { return s.done; }).length;
      return Math.round((done / subs.length) * 100);
    },

    /** Aplica los filtros de `store.ui` (más los que se pasen) y ordena. */
    query: function (over) {
      var f = Object.assign({}, this.ui, over || {});
      var needle = U.norm(f.search);
      var self = this;

      var list = this.state.tasks.filter(function (t) {
        if (f.subjectId && f.subjectId !== 'all' && t.subjectId !== (f.subjectId === 'none' ? '' : f.subjectId)) return false;
        if (f.type && f.type !== 'all' && t.type !== f.type) return false;
        if (f.priority && f.priority !== 'all' && t.priority !== f.priority) return false;
        if (f.status === 'open' && t.status === 'hecha') return false;
        else if (f.status && f.status !== 'all' && f.status !== 'open' && t.status !== f.status) return false;

        if (f.memberId && f.memberId !== 'all') {
          var ids = t.memberIds || [];
          if (f.memberId === 'none' ? ids.length > 0 : ids.indexOf(f.memberId) < 0) return false;
        }

        if (needle) {
          var subject = self.subjectById(t.subjectId);
          var hay = U.norm([
            t.title, t.notes, self.subjectLabel(t.subjectId), subject ? subject.name : '',
            (t.subtasks || []).map(function (s) { return s.text; }).join(' '),
            self.membersOf(t).map(function (m) { return m.name + ' ' + m.alias; }).join(' ')
          ].join(' '));
          if (hay.indexOf(needle) < 0) return false;
        }
        return true;
      });

      return this.sortTasks(list, f.sort);
    },

    sortTasks: function (list, mode) {
      var self = this;
      var prank = function (t) { var p = PRIORITIES.find(function (x) { return x.id === t.priority; }); return p ? p.rank : 9; };
      var dueKey = function (t) { return U.isISO(t.due) ? t.due : '9999-99-99'; };

      var cmp = {
        due: function (a, b) {
          return dueKey(a).localeCompare(dueKey(b)) || prank(a) - prank(b) || a.title.localeCompare(b.title, 'es');
        },
        priority: function (a, b) {
          return prank(a) - prank(b) || dueKey(a).localeCompare(dueKey(b));
        },
        subject: function (a, b) {
          return U.norm(self.subjectLabel(a.subjectId)).localeCompare(U.norm(self.subjectLabel(b.subjectId)), 'es') ||
                 dueKey(a).localeCompare(dueKey(b));
        },
        created: function (a, b) { return String(b.createdAt).localeCompare(String(a.createdAt)); },
        title: function (a, b) { return a.title.localeCompare(b.title, 'es'); }
      }[mode] || cmpDueFallback;

      function cmpDueFallback(a, b) { return dueKey(a).localeCompare(dueKey(b)); }

      // Las hechas siempre al final, sin importar la ordenación elegida.
      return list.slice().sort(function (a, b) {
        var ad = a.status === 'hecha' ? 1 : 0, bd = b.status === 'hecha' ? 1 : 0;
        return (ad - bd) || cmp(a, b);
      });
    },

    /** Tareas abiertas (no hechas). */
    open: function () {
      return this.state.tasks.filter(function (t) { return t.status !== 'hecha'; });
    },

    /** Recuentos que alimentan la barra lateral y los KPIs. */
    counts: function () {
      var today = U.today();
      var weekEnd = U.addDays(today, 7);
      var open = this.open();
      var withDate = open.filter(function (t) { return U.isISO(t.due); });

      var overdue = withDate.filter(function (t) { return t.due < today; });
      var dueToday = withDate.filter(function (t) { return t.due === today; });
      var week = withDate.filter(function (t) { return t.due >= today && t.due <= weekEnd; });
      var noDate = open.filter(function (t) { return !U.isISO(t.due); });
      var hours = week.reduce(function (sum, t) { return sum + (Number(t.estimate) || 0); }, 0);

      return {
        open: open.length,
        total: this.state.tasks.length,
        done: this.state.tasks.length - open.length,
        overdue: overdue.length,
        today: dueToday.length,
        week: week.length,
        noDate: noDate.length,
        inProgress: open.filter(function (t) { return t.status === 'curso'; }).length,
        weekHours: Math.round(hours * 10) / 10,
        subjects: this.state.subjects.length,
        members: this.state.members.length,
        classes: this.state.schedule.length
      };
    },

    /** Tareas de un día concreto. */
    onDay: function (iso) {
      return this.sortTasks(this.state.tasks.filter(function (t) { return t.due === iso; }), 'priority');
    },

    /* --------------------------- Datos de ejemplo ------------------------- */

    seedDemo: function () {
      var t = U.today();
      var self = this;

      var ids = [
        { name: 'Programación Avanzada', code: 'PROG', teacher: 'M. Herrero', color: PALETTE[0] },
        { name: 'Estadística', code: 'EST', teacher: 'L. Cabrera', color: PALETTE[2] },
        { name: 'Bases de Datos', code: 'BBDD', teacher: 'J. Ruiz', color: PALETTE[4] },
        { name: 'Ética y Sociedad', code: 'ETIC', teacher: 'A. Sanz', color: PALETTE[7] }
      ].map(function (s) {
        var subject = { id: U.uid(), name: s.name, code: s.code, teacher: s.teacher, color: s.color };
        self.state.subjects.push(subject);
        self.remote('subject.save', subject.id);
        return subject.id;
      });

      var memberIds = [
        { name: 'Lucía Ferrer', alias: 'Lu', email: 'lucia.ferrer@uni.es', phone: '600 11 22 33',
          subjectIds: [ids[2], ids[0]], notes: 'Lleva la parte de SQL del proyecto.' },
        { name: 'Diego Márquez', alias: 'Die', email: 'd.marquez@uni.es',
          subjectIds: [ids[0]], notes: 'Coincide conmigo en las prácticas de los martes.' },
        { name: 'Nerea Ibáñez', email: 'nerea.ibanez@uni.es', phone: '655 44 33 22',
          subjectIds: [ids[3]], notes: 'Grupo del ensayo de Ética.' }
      ].map(function (m, i) {
        var member = {
          id: U.uid(), name: m.name, alias: m.alias || '', email: m.email || '', phone: m.phone || '',
          notes: m.notes || '', subjectIds: m.subjectIds, color: PALETTE[(i + 5) % PALETTE.length],
          createdAt: new Date().toISOString()
        };
        self.state.members.push(member);
        self.remote('member.save', member.id);
        return member.id;
      });

      [
        { title: 'Entregar práctica 2 (árboles binarios)', subjectId: ids[0], type: 'practica', due: U.addDays(t, -2), priority: 'alta', estimate: 4, weight: 15,
          notes: 'Falta el informe con la comparativa de complejidad.',
          memberIds: [memberIds[1]],
          subtasks: [{ text: 'Implementar inserción', done: true }, { text: 'Pruebas unitarias', done: true }, { text: 'Informe', done: false }] },
        { title: 'Test online tema 3', subjectId: ids[1], type: 'examen', due: t, dueTime: '23:59', priority: 'alta', estimate: 1.5, weight: 10 },
        { title: 'Leer capítulo 4 y hacer resumen', subjectId: ids[3], type: 'lectura', due: t, priority: 'baja', estimate: 2, status: 'curso' },
        { title: 'Diseñar el modelo E-R del proyecto', subjectId: ids[2], type: 'proyecto', due: U.addDays(t, 1), priority: 'media', estimate: 5, weight: 25,
          memberIds: [memberIds[0], memberIds[1]],
          subtasks: [{ text: 'Entidades y relaciones', done: false }, { text: 'Normalizar a 3FN', done: false }, { text: 'Diagrama en limpio', done: false }] },
        { title: 'Ejercicios de distribuciones continuas', subjectId: ids[1], type: 'entrega', due: U.addDays(t, 3), priority: 'media', estimate: 3 },
        { title: 'Preparar examen parcial', subjectId: ids[0], type: 'estudio', due: U.addDays(t, 9), priority: 'alta', estimate: 12, weight: 30 },
        { title: 'Consultas SQL avanzadas (boletín 5)', subjectId: ids[2], type: 'entrega', due: U.addDays(t, 5), priority: 'media', estimate: 2.5,
          memberIds: [memberIds[0]] },
        { title: 'Buscar bibliografía para el ensayo', subjectId: ids[3], type: 'otro', priority: 'baja', estimate: 1,
          memberIds: [memberIds[2]] },
        { title: 'Revisar apuntes de la clase de ayer', subjectId: ids[1], type: 'estudio', due: U.addDays(t, -1), priority: 'baja', status: 'hecha', estimate: 1 },
        { title: 'Formar grupo para el proyecto', subjectId: ids[2], type: 'otro', due: U.addDays(t, -4), priority: 'media', status: 'hecha',
          memberIds: [memberIds[0], memberIds[1]] }
      ].forEach(function (d) {
        var task = self.newTask(d);
        task.subtasks = (d.subtasks || []).map(function (s) { return { id: U.uid(), text: s.text, done: !!s.done }; });
        task.memberIds = d.memberIds || [];
        if (d.status === 'hecha') task.completedAt = new Date().toISOString();
        self.state.tasks.push(task);
        self.remote('task.save', task.id);
      });

      /* Horario semanal de ejemplo */
      [
        [1, '09:00', '11:00', ids[0], 'Aula 2.4'],
        [1, '11:30', '13:00', ids[1], 'Aula 1.1'],
        [1, '15:00', '17:00', ids[2], 'Lab 3'],
        [2, '08:30', '10:30', ids[2], 'Aula 2.4'],
        [2, '11:00', '13:00', ids[0], 'Lab 1'],
        [3, '09:00', '11:00', ids[1], 'Aula 1.1'],
        [3, '12:00', '14:00', ids[3], 'Aula 0.3'],
        [4, '09:00', '11:00', ids[0], 'Aula 2.4'],
        [4, '11:30', '13:30', ids[2], 'Lab 3'],
        [5, '10:00', '12:00', ids[3], 'Aula 0.3'],
        [5, '12:30', '14:00', ids[1], 'Aula 1.1']
      ].forEach(function (c) {
        self.addClass({ day: c[0], start: c[1], end: c[2], subjectId: c[3], room: c[4], silent: true });
      });

      this.emit();
    }
  };

  /**
   * Devuelve al estado nuevo las entidades que siguen en la cola de subida y
   * que el servidor todavía no conoce. Las que ya se subieron y no vienen es
   * porque se borraron desde otro dispositivo: ésas sí desaparecen.
   * @returns {number} cuántas se han rescatado
   */
  function rescataNoSubidas(anterior, nuevo, protegidos) {
    var pares = [['task', 'tasks'], ['member', 'members'],
                 ['subject', 'subjects'], ['class', 'schedule']];
    var total = 0;

    pares.forEach(function (par) {
      var ids = protegidos[par[0]] || [];

      var yaEsta = {};
      nuevo[par[1]].forEach(function (x) { yaEsta[x.id] = true; });

      anterior[par[1]].forEach(function (x) {
        if (yaEsta[x.id]) return;
        // Se rescata lo que está en la cola y, sobre todo, lo que el servidor
        // nunca confirmó: si algo se creó aquí y no llegó a subir, no se pierde
        // aunque la cola no lo supiera.
        if (ids.indexOf(x.id) >= 0 || !x.__nube) {
          nuevo[par[1]].push(x);
          total++;
        }
      });
    });

    return total;
  }

  /** Abreviatura automática a partir de un nombre ("Bases de Datos" -> "BDD"). */
  function autoCode(name) {
    var words = String(name).trim().split(/\s+/).filter(function (w) { return w.length > 2; });
    if (words.length >= 2) {
      return words.slice(0, 4).map(function (w) { return w.charAt(0).toUpperCase(); }).join('');
    }
    return String(name).trim().slice(0, 4).toUpperCase();
  }

  /* ---------------------- Normalización al cargar ------------------------ */

  /** Rellena campos que falten para tolerar datos antiguos o editados a mano. */
  function migrate(data) {
    var base = defaultState();
    var out = {
      version: VERSION,
      subjects: Array.isArray(data.subjects) ? data.subjects : [],
      tasks: Array.isArray(data.tasks) ? data.tasks : [],
      members: Array.isArray(data.members) ? data.members : [],
      schedule: Array.isArray(data.schedule) ? data.schedule : [],
      group: data.group || null,
      profile: data.profile || null,
      settings: Object.assign(base.settings, data.settings || {})
    };

    out.subjects = out.subjects.map(function (s, i) {
      return {
        __nube: !!s.__nube,
        id: s.id || U.uid(),
        name: String(s.name || 'Asignatura'),
        code: String(s.code || ''),
        teacher: String(s.teacher || ''),
        color: s.color || PALETTE[i % PALETTE.length]
      };
    });

    var validSubject = {};
    out.subjects.forEach(function (s) { validSubject[s.id] = true; });

    out.members = out.members.map(function (m, i) {
      return {
        __nube: !!m.__nube,
        id: m.id || U.uid(),
        name: String(m.name || 'Compañero'),
        alias: String(m.alias || ''),
        email: String(m.email || ''),
        phone: String(m.phone || ''),
        notes: String(m.notes || ''),
        subjectIds: (Array.isArray(m.subjectIds) ? m.subjectIds : []).filter(function (id) { return validSubject[id]; }),
        color: m.color || PALETTE[(i + 2) % PALETTE.length],
        createdAt: m.createdAt || new Date().toISOString()
      };
    });

    var validMember = {};
    out.members.forEach(function (m) { validMember[m.id] = true; });

    var ids = { types: {}, prio: {}, status: {} };
    TYPES.forEach(function (x) { ids.types[x.id] = true; });
    PRIORITIES.forEach(function (x) { ids.prio[x.id] = true; });
    STATUSES.forEach(function (x) { ids.status[x.id] = true; });

    out.tasks = out.tasks.map(function (t) {
      var now = new Date().toISOString();
      return {
        id: t.id || U.uid(),
        title: String(t.title || 'Sin título'),
        notes: String(t.notes || ''),
        subjectId: validSubject[t.subjectId] ? t.subjectId : '',
        type: ids.types[t.type] ? t.type : 'otro',
        due: U.isISO(t.due) ? t.due : '',
        dueTime: U.isTime(t.dueTime) ? t.dueTime : '',
        priority: ids.prio[t.priority] ? t.priority : 'media',
        status: ids.status[t.status] ? t.status : 'pendiente',
        estimate: t.estimate === 0 || t.estimate ? Number(t.estimate) : null,
        weight: t.weight === 0 || t.weight ? Number(t.weight) : null,
        __nube: !!t.__nube,
        subtasks: Array.isArray(t.subtasks) ? t.subtasks.map(function (s) {
          return { id: s.id || U.uid(), text: String(s.text || ''), done: !!s.done };
        }) : [],
        memberIds: (Array.isArray(t.memberIds) ? t.memberIds : []).filter(function (id) { return validMember[id]; }),
        createdAt: t.createdAt || now,
        updatedAt: t.updatedAt || now,
        completedAt: t.completedAt || null
      };
    });

    out.schedule = out.schedule.map(function (c) {
      var start = U.isTime(c.start) ? c.start : '09:00';
      var end = U.isTime(c.end) ? c.end : U.fromMin(U.toMin(start) + 60);
      if (U.toMin(end) <= U.toMin(start)) end = U.fromMin(U.toMin(start) + 60);
      return {
        __nube: !!c.__nube,
        id: c.id || U.uid(),
        subjectId: validSubject[c.subjectId] ? c.subjectId : '',
        title: String(c.title || ''),
        day: U.clamp(parseInt(c.day, 10) || 1, 1, 7),
        start: start,
        end: end,
        room: String(c.room || ''),
        teacher: String(c.teacher || '')
      };
    });

    return out;
  }

  LD.store = store;
})(window);
