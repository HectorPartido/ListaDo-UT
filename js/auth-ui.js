/* =============================================================================
   auth-ui.js — la puerta de entrada: iniciar sesión, crear cuenta, recuperar
   la contraseña y ponerse una nueva.

   Se pinta encima de todo en #gate. Mientras no haya sesión, la app no se ve.
   Expone window.LD.authUI
   ============================================================================= */
(function (global) {
  'use strict';

  var LD = global.LD || (global.LD = {});
  var U = LD.utils;
  var ico = LD.icons;
  var authUI = {};

  var raiz = null;
  var modo = 'entrar';          // entrar | registro | olvido | nueva-clave | correo-enviado
  var ocupado = false;

  function host() { return raiz || (raiz = U.$('#gate')); }

  authUI.visible = function () { return !!host() && !host().classList.contains('hidden'); };

  authUI.hide = function () {
    var h = host();
    if (h) { h.classList.add('hidden'); h.innerHTML = ''; }
  };

  authUI.show = function (nuevoModo) {
    modo = nuevoModo || 'entrar';
    ocupado = false;
    render();
  };

  /* ------------------------------- Pintado ------------------------------- */

  var TEXTOS = {
    entrar:          { titulo: 'Entra en tu cuenta',     accion: 'Entrar' },
    registro:        { titulo: 'Crea tu cuenta',         accion: 'Crear cuenta' },
    olvido:          { titulo: '¿Olvidaste la contraseña?', accion: 'Enviarme el enlace' },
    'nueva-clave':   { titulo: 'Elige una contraseña nueva', accion: 'Guardar contraseña' },
    'correo-enviado': { titulo: 'Mira tu correo',        accion: '' }
  };

  function render() {
    var h = host();
    if (!h) return;
    var t = TEXTOS[modo] || TEXTOS.entrar;

    var campos = '';
    if (modo === 'registro') {
      campos +=
        '<div class="field"><label for="g-name">Tu nombre</label>' +
        '<input id="g-name" class="input" autocomplete="name" placeholder="Como quieras que te vean tus compañeros"></div>';
    }
    if (modo !== 'nueva-clave' && modo !== 'correo-enviado') {
      campos +=
        '<div class="field"><label for="g-email">Correo</label>' +
        '<input id="g-email" class="input" type="email" autocomplete="email" ' +
        'inputmode="email" autocapitalize="off" spellcheck="false" placeholder="tu@correo.com" data-autofocus></div>';
    }
    if (modo === 'entrar' || modo === 'registro') {
      campos +=
        '<div class="field"><label for="g-pass">Contraseña</label>' +
        '<input id="g-pass" class="input" type="password" ' +
        'autocomplete="' + (modo === 'registro' ? 'new-password' : 'current-password') + '" ' +
        'placeholder="' + (modo === 'registro' ? 'Al menos 6 caracteres' : '') + '"></div>';
    }
    if (modo === 'nueva-clave') {
      campos +=
        '<div class="field"><label for="g-pass">Contraseña nueva</label>' +
        '<input id="g-pass" class="input" type="password" autocomplete="new-password" ' +
        'placeholder="Al menos 6 caracteres" data-autofocus></div>';
    }

    var pie = '';
    if (modo === 'entrar') {
      pie = '<p class="gate-alt">¿No tienes cuenta? <button type="button" data-gate="registro">Crear una</button></p>' +
            '<p class="gate-alt"><button type="button" data-gate="olvido">He olvidado la contraseña</button></p>';
    } else if (modo === 'registro') {
      pie = '<p class="gate-alt">¿Ya tienes cuenta? <button type="button" data-gate="entrar">Entrar</button></p>';
    } else if (modo === 'olvido') {
      pie = '<p class="gate-alt"><button type="button" data-gate="entrar">Volver</button></p>';
    }

    var explicacion = {
      entrar: 'Tus tareas, tu horario y tu equipo, en cualquier dispositivo.',
      registro: 'Con una cuenta podrás abrir ListaDo desde el móvil y desde el ordenador con los mismos datos.',
      olvido: 'Te mandamos un enlace al correo para poner una contraseña nueva.',
      'nueva-clave': 'Escribe la contraseña con la que quieras entrar a partir de ahora.',
      'correo-enviado': ''
    }[modo] || '';

    h.innerHTML =
      '<div class="gate-card">' +
        '<div class="gate-brand">' +
          '<span class="brand-mark">' + ico.svg('list-checks') + '</span>' +
          '<div class="brand-text"><strong>ListaDo</strong><small>Tareas de la uni</small></div>' +
        '</div>' +

        (modo === 'correo-enviado'
          ? '<div class="gate-ok">' + ico.svg('mail', { cls: 'ic-xl', width: 1.5 }) +
            '<h1>' + t.titulo + '</h1>' +
            '<p class="muted">' + U.esc(authUI.mensaje || '') + '</p>' +
            '<button class="btn btn-primary" data-gate="entrar">Volver a entrar</button>' +
            '</div>'
          : '<form class="gate-form" novalidate>' +
              '<h1>' + t.titulo + '</h1>' +
              (explicacion ? '<p class="muted small">' + explicacion + '</p>' : '') +
              campos +
              '<p class="err hidden" data-role="err"></p>' +
              '<button class="btn btn-primary gate-submit" type="submit">' + t.accion + '</button>' +
              pie +
            '</form>') +

        '<p class="gate-foot">' + ico.svg('lock') +
          'Tus datos quedan en tu cuenta. Nadie más puede verlos.</p>' +
      '</div>';

    h.classList.remove('hidden');

    var form = h.querySelector('form');
    if (form) form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      enviar();
    });

    U.$$('[data-gate]', h).forEach(function (b) {
      b.addEventListener('click', function () { authUI.show(b.dataset.gate); });
    });

    var primero = h.querySelector('[data-autofocus]');
    if (primero) primero.focus();
  }

  /* ------------------------------- Acciones ------------------------------ */

  function error(texto) {
    var e = U.$('[data-role="err"]', host());
    if (!e) return;
    e.textContent = texto;
    e.classList.remove('hidden');
  }

  function trabajando(si) {
    ocupado = si;
    var b = U.$('.gate-submit', host());
    if (!b) return;
    b.disabled = si;
    b.textContent = si ? 'Un momento…' : (TEXTOS[modo] || TEXTOS.entrar).accion;
  }

  /** Traduce los errores de Supabase a algo que se entienda. */
  function legible(err) {
    var m = String((err && err.message) || err || '');
    if (/Invalid login credentials/i.test(m)) return 'Ese correo y esa contraseña no coinciden.';
    if (/Email not confirmed/i.test(m)) return 'Aún no has confirmado la cuenta: mira tu correo.';
    if (/User already registered|already been registered/i.test(m)) return 'Ya existe una cuenta con ese correo. Entra en vez de crearla.';
    if (/Password should be at least/i.test(m)) return 'La contraseña necesita al menos 6 caracteres.';
    if (/rate limit|too many/i.test(m)) return 'Demasiados intentos seguidos. Espera un minuto.';
    if (/Unable to validate email|invalid format/i.test(m)) return 'Ese correo no parece válido.';
    if (/Failed to fetch|NetworkError/i.test(m)) return 'Sin conexión con el servidor. Revisa tu red.';
    return m || 'No se ha podido completar la operación.';
  }

  function enviar() {
    if (ocupado) return;
    var h = host();
    var api = LD.api;
    var email = (U.$('#g-email', h) || {}).value || '';
    var pass = (U.$('#g-pass', h) || {}).value || '';
    var nombre = (U.$('#g-name', h) || {}).value || '';

    if (modo === 'entrar' || modo === 'registro') {
      if (!email.trim()) return error('Escribe tu correo.');
      if (pass.length < 6) return error('La contraseña necesita al menos 6 caracteres.');
    }

    trabajando(true);

    if (modo === 'entrar') {
      api.signIn(email, pass).then(function () {
        // onAuthChange se encarga de arrancar la app
      }, function (err) { trabajando(false); error(legible(err)); });
      return;
    }

    if (modo === 'registro') {
      api.signUp(email, pass, nombre).then(function (data) {
        if (data && data.session) return;            // sesión directa: la app arranca sola
        authUI.mensaje = 'Te hemos enviado un correo a ' + email.trim() +
          ' para confirmar la cuenta. Ábrelo y vuelve aquí.';
        authUI.show('correo-enviado');
      }, function (err) { trabajando(false); error(legible(err)); });
      return;
    }

    if (modo === 'olvido') {
      if (!email.trim()) { trabajando(false); return error('Escribe tu correo.'); }
      api.sendPasswordReset(email).then(function () {
        authUI.mensaje = 'Si existe una cuenta con ' + email.trim() +
          ', ahí tienes el enlace para cambiar la contraseña.';
        authUI.show('correo-enviado');
      }, function (err) { trabajando(false); error(legible(err)); });
      return;
    }

    if (modo === 'nueva-clave') {
      if (pass.length < 6) { trabajando(false); return error('La contraseña necesita al menos 6 caracteres.'); }
      api.updatePassword(pass).then(function () {
        if (LD.ui) LD.ui.toast('Contraseña cambiada.');
        authUI.hide();
        if (LD.app) LD.app.afterLogin();
      }, function (err) { trabajando(false); error(legible(err)); });
    }
  }

  LD.authUI = authUI;
})(window);
