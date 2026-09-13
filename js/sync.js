/* =============================================================================
   sync.js — sincronización local-first.

   Idea: la app nunca espera a la red. Cada cambio se aplica en memoria, se
   guarda en localStorage y se apunta en una COLA de intenciones. La cola se
   vacía en segundo plano contra Supabase.

   La cola guarda intenciones («hay que guardar la tarea X»), no copias de los
   datos: al subirla se lee el estado actual. Así, veinte ediciones seguidas de
   la misma tarea sin conexión se convierten en una sola escritura.

   Expone window.LD.sync
   ============================================================================= */
(function (global) {
  'use strict';

  var LD = global.LD || (global.LD = {});
  var U = LD.utils;
  var KEY = 'listado.outbox';
  var sync = {};

  var cola = [];
  var subiendo = false;
  var reintento = null;
  var fallos = 0;
  var estado = 'apagado';       // apagado | sin-sesion | al-dia | pendiente |
                                // subiendo | sin-conexion | error | atascado
  var oyentes = [];
  var ultimoAviso = 0;

  /* ------------------------------- Estado -------------------------------- */

  sync.status = function () {
    return {
      estado: estado,
      pendientes: cola.length,
      atascadas: cola.filter(function (op) { return op.err; }).length,
      sinConexion: !navigator.onLine
    };
  };

  /**
   * Entidades con cambios sin subir, por tipo: lo que no puede pisar el
   * servidor al sincronizar. Lo usa store.applyRemote().
   * @returns {{task?:string[], member?:string[], subject?:string[], class?:string[]}}
   */
  sync.protegidos = function () {
    var out = {};
    cola.forEach(function (op) {
      if (!op.id || op.t.indexOf('.save') < 0) return;
      var tipo = op.t.split('.')[0];
      (out[tipo] = out[tipo] || []).push(op.id);
    });
    return out;
  };

  sync.onStatus = function (fn) { oyentes.push(fn); };

  function anuncia(nuevo) {
    if (nuevo) estado = nuevo;
    var s = sync.status();
    oyentes.forEach(function (fn) { fn(s); });
  }

  sync.setEstado = anuncia;

  /* -------------------------------- Cola --------------------------------- */

  function guardaCola() {
    try {
      localStorage.setItem(KEY, JSON.stringify(cola));
    } catch (err) {
      console.warn('[ListaDo] No se pudo guardar la cola de sincronización:', err);
    }
  }

  function cargaCola() {
    try {
      cola = JSON.parse(localStorage.getItem(KEY) || '[]');
      if (!Array.isArray(cola)) cola = [];
    } catch (err) {
      cola = [];
    }
  }

  /**
   * Apunta una intención. Una sola por entidad: la nueva sustituye a la que
   * hubiera pendiente (guardar y volver a guardar es guardar una vez; borrar
   * después de guardar es sólo borrar).
   * @param {string} tipo p. ej. 'task.save' o 'class.delete'
   * @param {string} [id]
   */
  sync.push = function (tipo, id) {
    if (!LD.api.enabled) return;

    var clave = tipo.split('.')[0] + ':' + (id || '-');
    cola = cola.filter(function (op) { return op.k !== clave; });
    cola.push({ k: clave, t: tipo, id: id || null });
    guardaCola();

    anuncia('pendiente');
    programa(400);               // agrupa ráfagas de cambios
  };

  function programa(ms) {
    clearTimeout(reintento);
    reintento = setTimeout(function () { sync.flush(); }, ms);
  }

  sync.pendientes = function () { return cola.length; };

  /* ---------------------------- Subir la cola ---------------------------- */

  /** Traduce una intención en la llamada correspondiente. */
  function ejecuta(op) {
    var S = LD.store, api = LD.api;
    var grupo = S.groupId();

    switch (op.t) {
      case 'task.save': {
        var t = S.taskById(op.id);
        return t ? api.saveTask(t) : Promise.resolve();     // si ya no existe, nada que hacer
      }
      case 'task.delete':
        return api.deleteTask(op.id);

      case 'member.save': {
        var m = S.memberById(op.id);
        return m ? api.saveMember(m) : Promise.resolve();
      }
      case 'member.delete':
        return api.deleteMember(op.id);

      case 'subject.save': {
        var s = S.subjectById(op.id);
        if (!s) return Promise.resolve();
        if (!S.isGroupOwner()) return Promise.resolve();    // un miembro no edita el grupo
        return api.saveSubject(s, grupo);
      }
      case 'subject.delete':
        return S.isGroupOwner() ? api.deleteSubject(op.id) : Promise.resolve();

      case 'class.save': {
        var c = S.classById(op.id);
        if (!c) return Promise.resolve();
        if (!S.isGroupOwner()) return Promise.resolve();
        return api.saveClass(c, grupo);
      }
      case 'class.delete':
        return S.isGroupOwner() ? api.deleteClass(op.id) : Promise.resolve();

      case 'settings.save':
        return api.saveSettings(S.state.settings);

      default:
        console.warn('[ListaDo] Intención desconocida en la cola:', op.t);
        return Promise.resolve();
    }
  }

  /**
   * Vacía la cola en orden. Se detiene en el primer fallo de red y reintenta
   * con espera creciente. Los fallos que no son de red (permisos, datos
   * inválidos) descartan la operación para que no bloqueen la cola entera.
   */
  sync.flush = function () {
    if (!LD.api.enabled || subiendo) return Promise.resolve();
    if (!LD.api.userId()) { anuncia('sin-sesion'); return Promise.resolve(); }
    if (!cola.length) { anuncia('al-dia'); return Promise.resolve(); }
    if (!navigator.onLine) { anuncia('sin-conexion'); return Promise.resolve(); }

    subiendo = true;
    anuncia('subiendo');

    var quita = function (op) {
      var i = cola.indexOf(op);
      if (i >= 0) cola.splice(i, 1);
    };

    var siguiente = function () {
      // Las marcadas con error se saltan para no bloquear a las demás, pero
      // NO se borran: son el único registro de esos datos.
      var op = cola.filter(function (o) { return !o.err; })[0];

      if (!op) {
        subiendo = false;
        fallos = 0;
        anuncia(cola.length ? 'atascado' : 'al-dia');
        return Promise.resolve();
      }

      return ejecuta(op).then(function () {
        confirma(op);            // ya está en el servidor: deja de ser rescatable
        quita(op);
        guardaCola();
        return siguiente();
      }, function (err) {
        subiendo = false;

        if (err && err.code) {
          /* Error del servidor (permisos, restricción, una fila que aún no
             existe...). Se reintenta UNA vez al final de la cola: muchas veces
             es cuestión de orden — una tarea que menciona a un compañero que
             todavía no se ha subido. Si vuelve a fallar se marca y se queda
             ahí; así los datos no se pierden y se ven en el indicador. */
          op.intentos = (op.intentos || 0) + 1;
          quita(op);
          if (op.intentos < 2) {
            cola.push(op);
          } else {
            op.err = err.message || err.code;
            cola.push(op);
            console.warn('[ListaDo] Cambio sin subir:', op.t, err.code, err.message);
            avisaUnaVez('Algo no se pudo guardar en la nube: ' + op.err);
          }
          guardaCola();
          programa(300);
          return Promise.resolve();
        }

        // Sin código: se ha caído la red. Se reintenta más tarde.
        fallos++;
        anuncia(navigator.onLine ? 'error' : 'sin-conexion');
        programa(Math.min(60000, 4000 * fallos));
        return Promise.resolve();
      });
    };

    return siguiente();
  };

  /**
   * Marca la entidad como confirmada en el servidor. Mientras no lo esté,
   * store.applyRemote() la rescata en vez de dejar que la borre una
   * sincronización: es la red de seguridad para cualquier dato que, por el
   * motivo que sea, no haya llegado a subir.
   */
  function confirma(op) {
    if (!op.id || op.t.indexOf('.save') < 0) return;
    var S = LD.store;
    var entidad = {
      task: S.taskById, member: S.memberById,
      subject: S.subjectById, class: S.classById
    }[op.t.split('.')[0]];
    if (!entidad) return;

    var x = entidad.call(S, op.id);
    if (x && !x.__nube) {
      x.__nube = true;
      S.save();
    }
  }

  /** Evita empapelar al usuario con el mismo aviso una y otra vez. */
  function avisaUnaVez(texto) {
    var ahora = Date.now();
    if (ahora - ultimoAviso < 8000) return;
    ultimoAviso = ahora;
    if (LD.ui) LD.ui.toast(texto);
  }

  /* -------------------------- Traer de la nube --------------------------- */

  /**
   * Sube lo pendiente y luego se trae el estado del servidor, que pasa a ser el
   * bueno. Ese orden importa: si no, lo remoto pisaría cambios locales que
   * todavía no se habían subido.
   */
  sync.pull = function () {
    if (!LD.api.enabled || !LD.api.userId()) return Promise.resolve(false);
    if (!navigator.onLine) { anuncia('sin-conexion'); return Promise.resolve(false); }

    return sync.flush().then(function () {
      // Si queda algo que todavía puede subir, no se trae nada: primero sube.
      // Con lo atascado sí se sincroniza, porque applyRemote lo protege.
      var porSubir = cola.filter(function (op) { return !op.err; }).length;
      if (porSubir) return false;

      return LD.api.pull().then(function (res) {
        LD.store.applyRemote(res);
        // Si quedan cambios rechazados hay que seguir diciéndolo: "al día" con
        // cosas sin subir sería mentira.
        anuncia(cola.length ? 'atascado' : 'al-dia');
        return true;
      }, function (err) {
        console.warn('[ListaDo] No se pudo traer los datos:', err.message);
        anuncia(navigator.onLine ? 'error' : 'sin-conexion');
        return false;
      });
    });
  };

  /* ------------------------------ Arranque ------------------------------- */

  sync.start = function () {
    if (!LD.api.enabled) { anuncia('apagado'); return; }
    cargaCola();

    // Al abrir la app se vuelve a intentar lo que quedó atascado: puede que la
    // causa (una fila que faltaba, un permiso) ya no exista.
    cola.forEach(function (op) { delete op.err; delete op.intentos; });
    guardaCola();

    anuncia(cola.length ? 'pendiente' : 'al-dia');

    global.addEventListener('online', function () {
      anuncia('pendiente');
      programa(200);
    });
    global.addEventListener('offline', function () { anuncia('sin-conexion'); });

    // Al volver a la pestaña: subir lo pendiente y refrescar desde la nube.
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') sync.pull();
    });

    // Red de seguridad cada 5 minutos.
    setInterval(function () { sync.pull(); }, 300000);
  };

  /** Se llama al cerrar sesión. */
  sync.reset = function () {
    cola = [];
    guardaCola();
    fallos = 0;
    clearTimeout(reintento);
    anuncia('sin-sesion');
  };

  LD.sync = sync;
})(window);
