/* =============================================================================
   api.js — todo el trato con Supabase: sesión, lectura completa, escrituras y
   operaciones de grupo. Traduce entre las filas de la base (snake_case, tablas
   separadas) y los objetos que usa la app (camelCase, subtareas y equipo
   anidados dentro de la tarea).

   Si js/config.js está vacío, `api.enabled` es false y la app funciona igual
   que antes: sólo con localStorage y sin login.

   Expone window.LD.api
   ============================================================================= */
(function (global) {
  'use strict';

  var LD = global.LD || (global.LD = {});
  var U = LD.utils;
  var api = {};

  var cfg = global.LD_CONFIG || {};
  var sb = null;

  api.enabled = !!(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY);

  /* ------------------------------ Arranque ------------------------------- */

  api.init = function () {
    if (!api.enabled) return false;

    if (!global.supabase || !global.supabase.createClient) {
      console.warn('[ListaDo] No se pudo cargar supabase-js; se trabajará sólo en local.');
      api.enabled = false;
      return false;
    }

    sb = global.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,        // la sesión sobrevive a cerrar el navegador
        autoRefreshToken: true,
        detectSessionInUrl: true,    // enlaces de recuperación de contraseña
        storageKey: 'listado.auth'
      }
    });
    return true;
  };

  api.client = function () { return sb; };

  /** Lanza un error legible si la respuesta de Supabase trae `error`. */
  function must(res, contexto) {
    if (res && res.error) {
      var e = new Error(res.error.message || 'Error de base de datos');
      e.code = res.error.code;
      e.contexto = contexto || '';
      throw e;
    }
    return res ? res.data : null;
  }

  /* ---------------------------- Autenticación ---------------------------- */

  api.getSession = function () {
    return sb.auth.getSession().then(function (r) { return r.data ? r.data.session : null; });
  };

  api.userId = function () {
    var s = sb.auth.__lastSession;
    return s ? s.user.id : null;
  };

  /* La sesión se guarda aquí para no tener que pedirla (asíncrona) en cada
     escritura: onAuthChange la mantiene al día. */
  api.setSession = function (session) { sb.auth.__lastSession = session; };

  api.onAuthChange = function (fn) {
    return sb.auth.onAuthStateChange(function (evento, session) {
      api.setSession(session);
      fn(evento, session);
    });
  };

  api.signIn = function (email, password) {
    return sb.auth.signInWithPassword({ email: email.trim(), password: password })
      .then(function (r) { return must(r, 'iniciar sesión'); });
  };

  api.signUp = function (email, password, displayName) {
    return sb.auth.signUp({
      email: email.trim(),
      password: password,
      options: { data: { display_name: (displayName || '').trim() } }
    }).then(function (r) { return must(r, 'crear la cuenta'); });
  };

  api.signOut = function () { return sb.auth.signOut(); };

  api.sendPasswordReset = function (email) {
    return sb.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: location.href.split('#')[0]
    }).then(function (r) { return must(r, 'enviar el correo de recuperación'); });
  };

  api.updatePassword = function (password) {
    return sb.auth.updateUser({ password: password })
      .then(function (r) { return must(r, 'cambiar la contraseña'); });
  };

  /* --------------------- Traducción fila ↔ objeto ------------------------ */

  var hhmm = function (t) { return t ? String(t).slice(0, 5) : ''; };
  var num = function (v) { return v === null || v === undefined || v === '' ? null : Number(v); };

  function taskToRow(t, userId) {
    return {
      id: t.id,
      user_id: userId,
      subject_id: t.subjectId || null,
      title: t.title,
      notes: t.notes || '',
      type: t.type,
      due: t.due || null,
      due_time: t.dueTime || null,
      priority: t.priority,
      status: t.status,
      estimate: num(t.estimate),
      weight: num(t.weight),
      created_at: t.createdAt,
      updated_at: new Date().toISOString(),
      completed_at: t.completedAt || null
    };
  }

  function taskFromRow(r) {
    return {
      __nube: true,            // viene del servidor: está confirmado
      id: r.id,
      title: r.title,
      notes: r.notes || '',
      subjectId: r.subject_id || '',
      type: r.type,
      due: r.due || '',
      dueTime: hhmm(r.due_time),
      priority: r.priority,
      status: r.status,
      estimate: num(r.estimate),
      weight: num(r.weight),
      subtasks: [],
      memberIds: [],
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      completedAt: r.completed_at || null
    };
  }

  function subjectToRow(s, groupId) {
    return {
      id: s.id, group_id: groupId, name: s.name,
      code: s.code || '', teacher: s.teacher || '', color: s.color
    };
  }

  function subjectFromRow(r) {
    return { __nube: true, id: r.id, name: r.name, code: r.code || '',
             teacher: r.teacher || '', color: r.color };
  }

  function classToRow(c, groupId) {
    return {
      id: c.id, group_id: groupId,
      subject_id: c.subjectId || null,
      title: c.title || '',
      day: c.day,
      start_time: c.start,
      end_time: c.end,
      room: c.room || '',
      teacher: c.teacher || ''
    };
  }

  function classFromRow(r) {
    return {
      __nube: true,
      id: r.id, subjectId: r.subject_id || '', title: r.title || '',
      day: Number(r.day), start: hhmm(r.start_time), end: hhmm(r.end_time),
      room: r.room || '', teacher: r.teacher || ''
    };
  }

  function memberToRow(m, userId) {
    return {
      id: m.id, user_id: userId, name: m.name, alias: m.alias || '',
      email: m.email || '', phone: m.phone || '', notes: m.notes || '',
      color: m.color, created_at: m.createdAt
    };
  }

  function memberFromRow(r) {
    return {
      __nube: true,
      id: r.id, name: r.name, alias: r.alias || '', email: r.email || '',
      phone: r.phone || '', notes: r.notes || '', color: r.color,
      subjectIds: [], createdAt: r.created_at
    };
  }

  api.map = {
    taskToRow: taskToRow, taskFromRow: taskFromRow,
    subjectToRow: subjectToRow, subjectFromRow: subjectFromRow,
    classToRow: classToRow, classFromRow: classFromRow,
    memberToRow: memberToRow, memberFromRow: memberFromRow
  };

  /* ------------------------- Lectura completa ---------------------------- */

  /**
   * Se trae todo lo del usuario y lo devuelve ya con la forma del estado de la
   * app. RLS se encarga de filtrar: las asignaturas y clases son las del grupo,
   * las tareas y compañeros sólo los propios.
   * @returns {Promise<{state:object, profile:object, group:object}>}
   */
  api.pull = function () {
    var uid = api.userId();
    if (!uid) return Promise.reject(new Error('Sin sesión'));

    return Promise.all([
      sb.from('profiles')
        .select('user_id, display_name, group_id, theme, last_view, group:groups(id, name, code, owner_id)')
        .eq('user_id', uid).maybeSingle(),
      sb.from('subjects').select('*').order('name'),
      sb.from('classes').select('*').order('day').order('start_time'),
      sb.from('tasks').select('*'),
      sb.from('subtasks').select('*').order('position'),
      sb.from('members').select('*').order('name'),
      sb.from('member_subjects').select('*'),
      sb.from('task_members').select('*')
    ]).then(function (res) {
      var perfil    = must(res[0], 'perfil');
      var subjects  = must(res[1], 'asignaturas') || [];
      var classes   = must(res[2], 'horario') || [];
      var tasks     = must(res[3], 'tareas') || [];
      var subtasks  = must(res[4], 'subtareas') || [];
      var members   = must(res[5], 'compañeros') || [];
      var memSubj   = must(res[6], 'asignaturas de compañeros') || [];
      var taskMem   = must(res[7], 'equipo de las tareas') || [];

      var porTarea = {};
      var tareas = tasks.map(function (r) {
        var t = taskFromRow(r);
        porTarea[t.id] = t;
        return t;
      });
      subtasks.forEach(function (s) {
        var t = porTarea[s.task_id];
        if (t) t.subtasks.push({ id: s.id, text: s.text, done: !!s.done });
      });
      taskMem.forEach(function (tm) {
        var t = porTarea[tm.task_id];
        if (t) t.memberIds.push(tm.member_id);
      });

      var porMiembro = {};
      var companeros = members.map(function (r) {
        var m = memberFromRow(r);
        porMiembro[m.id] = m;
        return m;
      });
      memSubj.forEach(function (ms) {
        var m = porMiembro[ms.member_id];
        if (m) m.subjectIds.push(ms.subject_id);
      });

      return {
        profile: perfil,
        group: perfil && perfil.group ? perfil.group : null,
        state: {
          version: 2,
          subjects: subjects.map(subjectFromRow),
          schedule: classes.map(classFromRow),
          tasks: tareas,
          members: companeros,
          settings: {
            theme: (perfil && perfil.theme) || 'auto',
            lastView: (perfil && perfil.last_view) || 'dashboard'
          }
        }
      };
    });
  };

  /* ---------------------------- Escrituras ------------------------------- */

  /** Borra las filas hijas que ya no están en la lista local. */
  function deleteMissing(tabla, columnaPadre, idPadre, columnaId, idsQueQuedan) {
    var q = sb.from(tabla).delete().eq(columnaPadre, idPadre);
    if (idsQueQuedan.length) q = q.not(columnaId, 'in', '(' + idsQueQuedan.join(',') + ')');
    return q.then(function (r) { return must(r, 'limpiar ' + tabla); });
  }

  /** Guarda la tarea con sus subtareas y su equipo. */
  api.saveTask = function (task) {
    var uid = api.userId();
    var subIds = (task.subtasks || []).map(function (s) { return s.id; });
    var memIds = (task.memberIds || []).slice();

    return sb.from('tasks').upsert(taskToRow(task, uid))
      .then(function (r) { must(r, 'guardar la tarea'); })
      .then(function () {
        return deleteMissing('subtasks', 'task_id', task.id, 'id', subIds);
      })
      .then(function () {
        if (!subIds.length) return null;
        return sb.from('subtasks').upsert((task.subtasks || []).map(function (s, i) {
          return { id: s.id, task_id: task.id, text: s.text, done: !!s.done, position: i };
        })).then(function (r) { return must(r, 'guardar subtareas'); });
      })
      .then(function () {
        return deleteMissing('task_members', 'task_id', task.id, 'member_id', memIds);
      })
      .then(function () {
        if (!memIds.length) return null;
        return sb.from('task_members').upsert(memIds.map(function (id) {
          return { task_id: task.id, member_id: id };
        })).then(function (r) { return must(r, 'guardar el equipo de la tarea'); });
      });
  };

  api.deleteTask = function (id) {
    return sb.from('tasks').delete().eq('id', id)
      .then(function (r) { must(r, 'borrar la tarea'); });
  };

  /** Guarda el compañero y las asignaturas que comparte. */
  api.saveMember = function (member) {
    var uid = api.userId();
    var subIds = (member.subjectIds || []).slice();

    return sb.from('members').upsert(memberToRow(member, uid))
      .then(function (r) { must(r, 'guardar el compañero'); })
      .then(function () {
        return deleteMissing('member_subjects', 'member_id', member.id, 'subject_id', subIds);
      })
      .then(function () {
        if (!subIds.length) return null;
        return sb.from('member_subjects').upsert(subIds.map(function (id) {
          return { member_id: member.id, subject_id: id };
        })).then(function (r) { return must(r, 'guardar sus asignaturas'); });
      });
  };

  api.deleteMember = function (id) {
    return sb.from('members').delete().eq('id', id)
      .then(function (r) { must(r, 'borrar el compañero'); });
  };

  api.saveSubject = function (subject, groupId) {
    return sb.from('subjects').upsert(subjectToRow(subject, groupId))
      .then(function (r) { must(r, 'guardar la asignatura'); });
  };

  api.deleteSubject = function (id) {
    return sb.from('subjects').delete().eq('id', id)
      .then(function (r) { must(r, 'borrar la asignatura'); });
  };

  api.saveClass = function (slot, groupId) {
    return sb.from('classes').upsert(classToRow(slot, groupId))
      .then(function (r) { must(r, 'guardar la clase'); });
  };

  api.deleteClass = function (id) {
    return sb.from('classes').delete().eq('id', id)
      .then(function (r) { must(r, 'borrar la clase'); });
  };

  api.saveSettings = function (settings) {
    return sb.from('profiles').update({
      theme: settings.theme || 'auto',
      last_view: settings.lastView || 'dashboard'
    }).eq('user_id', api.userId())
      .then(function (r) { must(r, 'guardar las preferencias'); });
  };

  /* ------------------------------- Grupo -------------------------------- */

  /** Crea perfil y grupo si el disparador de alta no llegó a hacerlo. */
  api.ensureProfile = function (displayName) {
    var uid = api.userId();
    return sb.from('profiles').select('user_id, group_id').eq('user_id', uid).maybeSingle()
      .then(function (r) {
        var perfil = must(r, 'comprobar el perfil');
        if (perfil && perfil.group_id) return perfil;

        var grupo = { id: U.uid(), name: 'Mi grupo', code: null, owner_id: uid };
        // El código lo genera la base; si hay que crear el grupo desde aquí,
        // se pide uno con la misma función.
        return sb.rpc('new_group_code').then(function (rc) {
          grupo.code = must(rc, 'generar el código del grupo');
          return sb.from('groups').insert(grupo).then(function (rg) {
            must(rg, 'crear el grupo');
            return sb.from('profiles').upsert({
              user_id: uid,
              display_name: displayName || '',
              group_id: grupo.id
            }).then(function (rp) { must(rp, 'crear el perfil'); return { user_id: uid, group_id: grupo.id }; });
          });
        });
      });
  };

  api.peekGroup = function (code) {
    return sb.rpc('peek_group', { p_code: code })
      .then(function (r) {
        var filas = must(r, 'consultar el grupo');
        return filas && filas.length ? filas[0] : null;
      });
  };

  api.joinGroup = function (code) {
    return sb.rpc('join_group', { p_code: code })
      .then(function (r) { return must(r, 'entrar en el grupo'); });
  };

  api.leaveGroup = function () {
    return sb.rpc('leave_group')
      .then(function (r) { return must(r, 'salir del grupo'); });
  };

  api.rotateCode = function () {
    return sb.rpc('rotate_group_code')
      .then(function (r) { return must(r, 'cambiar el código'); });
  };

  api.renameGroup = function (groupId, name) {
    return sb.from('groups').update({ name: name }).eq('id', groupId)
      .then(function (r) { must(r, 'renombrar el grupo'); });
  };

  /** Quién más está en mi grupo. */
  api.groupPeople = function (groupId) {
    return sb.from('profiles').select('user_id, display_name').eq('group_id', groupId)
      .then(function (r) { return must(r, 'ver quién está en el grupo') || []; });
  };

  LD.api = api;
})(window);
