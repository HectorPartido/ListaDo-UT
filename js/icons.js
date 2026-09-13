/* =============================================================================
   icons.js — juego de iconos SVG en línea (trazo de 24×24, estilo Lucide).
   Van incrustados a propósito: nada de CDN ni fuentes de iconos, así la app
   sigue funcionando sin conexión y abriendo el archivo directamente.
   Heredan el color del texto (currentColor) y el tamaño de la fuente (1em).
   Uso: LD.icons.svg('calendar', { cls: 'ic-lg' })
   Expone window.LD.icons
   ============================================================================= */
(function (global) {
  'use strict';

  var LD = global.LD || (global.LD = {});

  /* Cada entrada es el contenido de un <svg viewBox="0 0 24 24">.
     Las partes rellenas llevan fill/stroke propios.                          */
  var REG = {

    /* --- Navegación ---------------------------------------------------- */
    home: '<path d="M4 11 12 4l8 7"/><path d="M6 10v10h12V10"/><path d="M10 20v-6h4v6"/>',
    'list-checks': '<path d="M10 6h10M10 12h10M10 18h10"/><path d="m3 6 1.6 1.6L7.4 4.8"/><path d="m3 12 1.6 1.6L7.4 10.8"/><path d="m3 18 1.6 1.6L7.4 16.8"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2.5"/><path d="M8 3v4M16 3v4M3 10h18"/>',
    'calendar-days': '<rect x="3" y="5" width="18" height="16" rx="2.5"/><path d="M8 3v4M16 3v4M3 10h18"/><circle cx="8.5" cy="14.5" r="1" fill="currentColor" stroke="none"/><circle cx="12" cy="14.5" r="1" fill="currentColor" stroke="none"/><circle cx="15.5" cy="14.5" r="1" fill="currentColor" stroke="none"/>',
    'calendar-off': '<rect x="3" y="5" width="18" height="16" rx="2.5"/><path d="M8 3v4M16 3v4M3 10h18"/><path d="M4.5 20.5 19.5 5.5"/>',
    'graduation-cap': '<path d="m2 9 10-5 10 5-10 5z"/><path d="M6 11.4V16c0 1.7 2.7 3 6 3s6-1.3 6-3v-4.6"/><path d="M21 10v5"/>',
    'bar-chart': '<path d="M3 21h18"/><path d="M6 21v-7M12 21V5M18 21v-11"/>',

    /* --- Acciones ------------------------------------------------------- */
    search: '<circle cx="11" cy="11" r="7"/><path d="m20.5 20.5-4.2-4.2"/>',
    'search-x': '<circle cx="11" cy="11" r="7"/><path d="m20.5 20.5-4.2-4.2"/><path d="m9 9 4 4M13 9l-4 4"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    pencil: '<path d="M4 20h4L20 8l-4-4L4 16z"/><path d="m14 6 4 4"/>',
    trash: '<path d="M4 7h16"/><path d="M9.5 7V4h5v3"/><path d="m6.5 7 1 13h9l1-13"/><path d="M10.5 11v5M13.5 11v5"/>',
    download: '<path d="M12 4v11"/><path d="m7.5 10.5 4.5 4.5 4.5-4.5"/><path d="M5 20h14"/>',
    upload: '<path d="M12 15V4"/><path d="m7.5 8.5 4.5-4.5 4.5 4.5"/><path d="M5 20h14"/>',
    'chevron-left': '<path d="m14.5 6-6 6 6 6"/>',
    'chevron-right': '<path d="m9.5 6 6 6-6 6"/>',
    check: '<path d="m5 13 4.5 4.5L19 7"/>',
    'file-plus': '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/><path d="M12 11v6M9 14h6"/>',

    /* --- Estado de la tarea --------------------------------------------- */
    circle: '<circle cx="12" cy="12" r="8"/>',
    'circle-half': '<circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor" stroke="none"/>',
    'circle-check': '<circle cx="12" cy="12" r="8"/><path d="m8.5 12 2.4 2.4 4.6-4.8"/>',

    /* --- Tipos de tarea -------------------------------------------------- */
    'file-text': '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/><path d="M9 12h6M9 16h4"/>',
    'clipboard-check': '<path d="M9 4h6v3H9z"/><path d="M9.5 5.5H7a1 1 0 0 0-1 1V20a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V6.5a1 1 0 0 0-1-1h-2.5"/><path d="m9.5 13 2 2 3.5-3.8"/>',
    flask: '<path d="M9 3h6"/><path d="M10 3v5.5L5.3 19A1.5 1.5 0 0 0 6.7 21h10.6a1.5 1.5 0 0 0 1.4-2L14 8.5V3"/><path d="M7.6 15h8.8"/>',
    layers: '<path d="m12 3 9 4.8-9 4.8-9-4.8z"/><path d="m3 13 9 4.8 9-4.8"/>',
    'book-open': '<path d="M12 6.5v14"/><path d="M12 6.5C10.4 5 7.6 4.5 4 4.5v13c3.6 0 6.4.5 8 2"/><path d="M12 6.5c1.6-1.5 4.4-2 8-2v13c-3.6 0-6.4.5-8 2"/>',
    headphones: '<path d="M4 14v-2a8 8 0 0 1 16 0v2"/><path d="M4 14h3v6H5.5A1.5 1.5 0 0 1 4 18.5z"/><path d="M20 14h-3v6h1.5a1.5 1.5 0 0 0 1.5-1.5z"/>',
    presentation: '<path d="M3 4h18"/><path d="M4.6 4v9.4a1.6 1.6 0 0 0 1.6 1.6h11.6a1.6 1.6 0 0 0 1.6-1.6V4"/><path d="M12 15v3.6"/><path d="m8.6 21.5 3.4-2.9 3.4 2.9"/>',
    tag: '<path d="M20.6 12.4 12.4 20.6a1.4 1.4 0 0 1-2 0l-7-7a1.4 1.4 0 0 1 0-2L11.6 3.4a1.4 1.4 0 0 1 1-.4h6.6a1.4 1.4 0 0 1 1.4 1.4v7a1.4 1.4 0 0 1-.4 1z"/><circle cx="16.3" cy="7.7" r="1.3" fill="currentColor" stroke="none"/>',

    /* --- Avisos y métricas ---------------------------------------------- */
    'alert-triangle': '<path d="M10.6 4.2 2.6 18a1.6 1.6 0 0 0 1.4 2.4h16a1.6 1.6 0 0 0 1.4-2.4l-8-13.8a1.6 1.6 0 0 0-2.8 0z"/><path d="M12 10v4"/><circle cx="12" cy="17.2" r="1" fill="currentColor" stroke="none"/>',
    clock: '<circle cx="12" cy="12" r="8"/><path d="M12 8v4.3l2.8 1.7"/>',
    target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none"/>',
    flag: '<path d="M6 21V4"/><path d="M6 4.5h11l-2.2 4L17 13H6"/>',
    inbox: '<path d="M3 13h5l1.6 2.6h4.8L16 13h5"/><path d="M6.2 4.5h11.6l3.2 8.5v6H3v-6z"/>',
    compass: '<circle cx="12" cy="12" r="9"/><path d="m15.6 8.4-2.2 5.2-5.2 2.2 2.2-5.2z"/>',
    sparkles: '<path d="m12 3.5 1.7 4.8 4.8 1.7-4.8 1.7L12 16.5l-1.7-4.8L5.5 10l4.8-1.7z"/><path d="m18.5 15.5.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z"/>',
    user: '<circle cx="12" cy="8" r="3.5"/><path d="M5 20c1.4-3.4 3.9-5 7-5s5.6 1.6 7 5"/>',

    /* --- Equipo y horario ------------------------------------------------ */
    users: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20c1.2-3.1 3.4-4.6 6-4.6s4.8 1.5 6 4.6"/><path d="M16.2 5.3a3.2 3.2 0 0 1 0 5.9"/><path d="M17.5 15.7c1.6.7 2.8 2 3.5 4.3"/>',
    'user-plus': '<circle cx="10" cy="8" r="3.2"/><path d="M3.5 20c1.2-3.1 3.4-4.6 6.5-4.6 1 0 1.9.1 2.7.4"/><path d="M18 14v6M15 17h6"/>',
    mail: '<rect x="3" y="5.5" width="18" height="13" rx="2.5"/><path d="m4 7.5 8 5.5 8-5.5"/>',
    phone: '<path d="M7.5 3.5h-2A2 2 0 0 0 3.5 5.7C4 13 11 20 18.3 20.5a2 2 0 0 0 2.2-2v-2l-4.3-1.6-2 2a15 15 0 0 1-4.6-4.6l2-2z"/>',
    table: '<rect x="3" y="4.5" width="18" height="15" rx="2.5"/><path d="M3 9.5h18M9 9.5v10M15 9.5v10"/>',
    'map-pin': '<path d="M12 21s6.5-5.6 6.5-11a6.5 6.5 0 0 0-13 0c0 5.4 6.5 11 6.5 11z"/><circle cx="12" cy="10" r="2.4"/>',
    'arrow-right': '<path d="M4 12h15"/><path d="m13.5 6.5 5.5 5.5-5.5 5.5"/>',
    activity: '<path d="M3 12h4l2.5-6 4 13 2.5-7h5"/>',
    coffee: '<path d="M4 8h13v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z"/><path d="M17 9h1.8a2.2 2.2 0 0 1 0 4.4H17"/><path d="M5 21h11"/>',

    /* --- Cuenta y sincronización ----------------------------------------- */
    'cloud-check': '<path d="M7 18.5h10a4 4 0 0 0 .7-7.9 5.6 5.6 0 0 0-10.7-1.2A3.6 3.6 0 0 0 7 18.5z"/><path d="m9.6 13.8 1.9 1.9 3.4-3.6"/>',
    'cloud-off': '<path d="M7 18.5h10a4 4 0 0 0 .7-7.9 5.6 5.6 0 0 0-10.7-1.2A3.6 3.6 0 0 0 7 18.5z"/><path d="M4 4l16 16"/>',
    refresh: '<path d="M20.5 11A8.5 8.5 0 0 0 6.3 6.3L3.5 9"/><path d="M3.5 4v5h5"/><path d="M3.5 13a8.5 8.5 0 0 0 14.2 4.7l2.8-2.7"/><path d="M20.5 20v-5h-5"/>',
    copy: '<rect x="9" y="9" width="11.5" height="11.5" rx="2.2"/><path d="M15 6.2A2.2 2.2 0 0 0 12.8 4H5.7A2.2 2.2 0 0 0 3.5 6.2v7.1A2.2 2.2 0 0 0 5.7 15.5"/>',
    'log-out': '<path d="M15 4H6.5A2.5 2.5 0 0 0 4 6.5v11A2.5 2.5 0 0 0 6.5 20H15"/><path d="m16.5 8.5 3.5 3.5-3.5 3.5"/><path d="M20 12H9.5"/>',
    key: '<circle cx="8.5" cy="14.5" r="4.5"/><path d="M11.8 11.2 20 3"/><path d="m16.8 6.2 3 3"/>',
    lock: '<rect x="4.5" y="10.5" width="15" height="10" rx="2.5"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>',

    /* --- Tema ----------------------------------------------------------- */
    sun: '<circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.2 5.2l1.4 1.4M17.4 17.4l1.4 1.4M18.8 5.2l-1.4 1.4M6.6 17.4l-1.4 1.4"/>',
    moon: '<path d="M20 14.7A8.6 8.6 0 0 1 9.3 4a8.6 8.6 0 1 0 10.7 10.7z"/>',
    monitor: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M9 20h6M12 16v4"/>'
  };

  var icons = {

    /**
     * Devuelve el SVG de un icono como cadena.
     * @param {string} name  clave del registro
     * @param {{cls?:string, width?:number, title?:string}} [opts]
     */
    svg: function (name, opts) {
      opts = opts || {};
      var body = REG[name];
      if (!body) {
        console.warn('[ListaDo] Icono desconocido:', name);
        body = REG.tag;
      }
      return '<svg class="ic' + (opts.cls ? ' ' + opts.cls : '') + '" viewBox="0 0 24 24" ' +
        'fill="none" stroke="currentColor" stroke-width="' + (opts.width || 1.9) + '" ' +
        'stroke-linecap="round" stroke-linejoin="round" ' +
        (opts.title ? 'role="img"><title>' + opts.title + '</title>' : 'aria-hidden="true" focusable="false">') +
        body + '</svg>';
    },

    has: function (name) { return !!REG[name]; },
    names: function () { return Object.keys(REG); }
  };

  LD.icons = icons;
})(window);
