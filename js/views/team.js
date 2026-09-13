/* =============================================================================
   views/team.js — Equipo: fichero de compañeros para acordarse de quién es
   quién, con buscador y acceso a las tareas compartidas.
   ============================================================================= */
(function (global) {
  'use strict';

  var LD = global.LD;
  var U = LD.utils, S = LD.store, ui = LD.ui, ico = LD.icons;

  var view = {
    id: 'team',
    label: 'Equipo',
    icon: 'users',
    countKey: 'members',

    render: function () {
      var text = S.ui.teamSearch;
      var all = S.state.members;
      var list = S.searchMembers(text);

      var html = '<div class="page-head">' +
        '<div><h1>Equipo</h1><p class="sub">' + headLine(all, list, text) + '</p></div>' +
        '<button class="btn btn-primary" data-app="new-member">' + ico.svg('user-plus') + ' Nuevo compañero</button>' +
      '</div>';

      if (!all.length) {
        return html + '<section class="card"><div class="card-body">' +
          ui.empty('users', 'Todavía no hay nadie en tu equipo',
            'Apunta a los compañeros con los que haces prácticas o proyectos: luego podrás buscarlos y asignarlos a cualquier tarea.',
            { act: 'new-member', label: 'Añadir al primero' }) +
          '</div></section>';
      }

      /* Buscador */
      html += '<div class="toolbar">' +
        '<div class="field grow">' +
          '<label for="team-search">Buscar</label>' +
          '<input id="team-search" class="input" data-filter-text="teamSearch" autocomplete="off" ' +
            'placeholder="Nombre, alias, correo o asignatura…" value="' + U.esc(text) + '">' +
        '</div>' +
        (text ? '<button class="btn btn-sm" data-app="clear-team-search">Quitar filtro</button>' : '') +
      '</div>';

      if (!list.length) {
        return html + '<section class="card"><div class="card-body">' +
          ui.empty('search-x', 'Sin coincidencias', 'Nadie encaja con «' + text + '».',
            { act: 'clear-team-search', label: 'Ver todos' }) +
          '</div></section>';
      }

      html += '<div class="subj-grid">' + list.map(card).join('') + '</div>';
      return html;
    }
  };

  function headLine(all, list, text) {
    if (text) return list.length + ' de ' + all.length + ' ' + U.plural(all.length, 'compañero');
    var busy = all.filter(function (m) { return S.memberLoad(m.id) > 0; }).length;
    return all.length + ' ' + U.plural(all.length, 'compañero') +
      (busy ? ' · ' + busy + ' con tareas en marcha' : '');
  }

  function card(member) {
    var open = S.memberLoad(member.id);
    var total = S.state.tasks.filter(function (t) { return (t.memberIds || []).indexOf(member.id) >= 0; }).length;
    var subjects = (member.subjectIds || []).map(function (id) { return S.subjectById(id); }).filter(Boolean);

    return '<article class="subj-card member-card" style="--c:' + U.esc(member.color) + '">' +
      '<div class="s-top">' +
        ui.avatar(member, { cls: 'avatar-lg' }) +
        '<div style="flex:1;min-width:0">' +
          '<h3>' + U.esc(member.name) + '</h3>' +
          (member.alias ? '<div class="small muted">«' + U.esc(member.alias) + '»</div>' : '') +
        '</div>' +
        '<button class="btn btn-sm btn-icon btn-ghost" data-member-act="edit" data-id="' + member.id + '" ' +
          'title="Editar" aria-label="Editar">' + ico.svg('pencil') + '</button>' +
      '</div>' +

      (subjects.length
        ? '<div class="s-stats">' + subjects.map(function (s) {
            return '<span class="chip-subject" style="--c:' + U.esc(s.color) + '"><i class="dot"></i>' +
              U.esc(s.code || s.name) + '</span>';
          }).join('') + '</div>'
        : '') +

      '<div class="s-stats">' +
        '<span class="badge' + (open ? ' t-accent' : '') + '">' + open + ' sin terminar</span>' +
        '<span class="badge">' + total + ' en total</span>' +
      '</div>' +

      (member.email || member.phone
        ? '<div class="contact">' +
            (member.email ? '<a class="badge" href="mailto:' + U.esc(member.email) + '" title="' + U.esc(member.email) + '">' +
              ico.svg('mail') + U.esc(member.email) + '</a>' : '') +
            (member.phone ? '<a class="badge" href="tel:' + U.esc(member.phone.replace(/\s/g, '')) + '">' +
              ico.svg('phone') + U.esc(member.phone) + '</a>' : '') +
          '</div>'
        : '') +

      (member.notes ? '<p class="small muted" style="white-space:pre-wrap">' + U.esc(member.notes) + '</p>' : '') +

      '<div class="row">' +
        '<button class="btn btn-sm" data-member-act="tasks" data-id="' + member.id + '">Ver tareas</button>' +
        '<button class="btn btn-sm" data-member-act="add-task" data-id="' + member.id + '">' + ico.svg('plus') + ' Tarea</button>' +
      '</div>' +
    '</article>';
  }

  LD.views = LD.views || {};
  LD.views.team = view;
})(window);
