/* =============================================================================
   views/subjects.js — Asignaturas: ficha con su carga y sus próximas tareas.
   ============================================================================= */
(function (global) {
  'use strict';

  var LD = global.LD;
  var U = LD.utils, S = LD.store, ui = LD.ui, ico = LD.icons;

  var view = {
    id: 'subjects',
    label: 'Asignaturas',
    icon: 'graduation-cap',
    countKey: 'subjects',

    render: function () {
      var subjects = S.state.subjects;
      var orphans = S.state.tasks.filter(function (t) { return !t.subjectId; });

      var puedo = S.isGroupOwner();

      var html = '<div class="page-head">' +
        '<div><h1>Asignaturas</h1><p class="sub">' +
          subjects.length + ' ' + U.plural(subjects.length, 'asignatura') +
          (orphans.length ? ' · ' + orphans.length + ' ' + U.plural(orphans.length, 'tarea') + ' sin asignar' : '') +
        '</p></div>' +
        (puedo ? '<button class="btn btn-primary" data-app="new-subject">' + ico.svg('plus') + ' Nueva asignatura</button>' : '') +
      '</div>';

      if (!puedo) html += avisoMiembro();

      if (!subjects.length && !puedo) {
        return html + '<section class="card"><div class="card-body">' +
          ui.emptySmall('El grupo en el que estás todavía no tiene asignaturas.') +
          '</div></section>';
      }

      if (!subjects.length) {
        html += '<section class="card"><div class="card-body">' +
          ui.empty('graduation-cap', 'Sin asignaturas todavía',
            'Crea una asignatura por cada materia del cuatrimestre: así puedes filtrar, ver la carga de cada una y usar atajos como @BBDD.',
            { act: 'new-subject', label: '+ Nueva asignatura' }) +
          '</div></section>';
        return html;
      }

      html += '<div class="subj-grid">' + subjects.map(card).join('') +
        (orphans.length ? orphanCard(orphans) : '') + '</div>';

      return html;
    }
  };

  function card(subject) {
    var tasks = S.state.tasks.filter(function (t) { return t.subjectId === subject.id; });
    var open = tasks.filter(function (t) { return t.status !== 'hecha'; });
    var done = tasks.length - open.length;
    var today = U.today();
    var overdue = open.filter(function (t) { return U.isISO(t.due) && t.due < today; }).length;
    var hours = open.reduce(function (sum, t) { return sum + (Number(t.estimate) || 0); }, 0);
    var pct = tasks.length ? Math.round((done / tasks.length) * 100) : 0;

    var next = S.sortTasks(open.filter(function (t) { return U.isISO(t.due); }), 'due')[0];

    return '<article class="subj-card" style="--c:' + U.esc(subject.color) + '">' +
      '<div class="s-top">' +
        '<div style="flex:1;min-width:0">' +
          (subject.code ? '<div class="s-code">' + U.esc(subject.code) + '</div>' : '') +
          '<h3>' + U.esc(subject.name) + '</h3>' +
        '</div>' +
        (S.isGroupOwner()
          ? '<button class="btn btn-sm btn-icon btn-ghost" data-subject="edit" data-id="' + subject.id + '" title="Editar" aria-label="Editar">' + ico.svg('pencil') + '</button>'
          : '') +
      '</div>' +

      (subject.teacher ? '<div class="s-teacher">' + ico.svg('user') + U.esc(subject.teacher) + '</div>' : '') +

      '<div class="s-stats">' +
        '<span class="badge' + (open.length ? '' : ' t-ok') + '">' + open.length + ' sin terminar</span>' +
        (overdue ? '<span class="badge t-danger">' + overdue + ' atrasada' + (overdue === 1 ? '' : 's') + '</span>' : '') +
        (hours ? '<span class="badge">' + ico.svg('clock') + Math.round(hours * 10) / 10 + ' h</span>' : '') +
        '<span class="badge t-ok">' + done + ' hechas</span>' +
      '</div>' +

      '<div class="progress" title="' + pct + '% completado"><i style="width:' + pct + '%"></i></div>' +

      (next
        ? '<div class="small muted">Siguiente: <strong>' + U.esc(next.title) + '</strong><br>' +
          U.esc(U.dueInfo(next.due, next.dueTime).label) + '</div>'
        : '<div class="small muted">Nada pendiente con fecha.</div>') +

      '<div class="row">' +
        '<button class="btn btn-sm" data-subject="tasks" data-id="' + subject.id + '">Ver tareas</button>' +
        '<button class="btn btn-sm" data-subject="add-task" data-id="' + subject.id + '">+ Tarea</button>' +
      '</div>' +
    '</article>';
  }

  /** Aviso de que las asignaturas las gestiona el dueño del grupo. */
  function avisoMiembro() {
    return '<div class="notice">' + ico.svg('users') +
      '<span>Estás en un grupo compartido: las asignaturas y el horario los mantiene quien lo creó. ' +
      'Tus tareas y tus compañeros de equipo son sólo tuyos. ' +
      'Si quieres editarlos, en <a href="#/group">Grupo</a> puedes salir con una copia propia.</span></div>';
  }

  function orphanCard(orphans) {
    var open = orphans.filter(function (t) { return t.status !== 'hecha'; }).length;
    return '<article class="subj-card" style="--c:var(--muted)">' +
      '<div class="s-top"><div style="flex:1"><div class="s-code">SIN ASIGNAR</div>' +
      '<h3>Sin asignatura</h3></div></div>' +
      '<div class="s-stats"><span class="badge">' + open + ' sin terminar</span>' +
      '<span class="badge">' + orphans.length + ' en total</span></div>' +
      '<div class="small muted">Tareas que no tienen asignatura asociada.</div>' +
      '<div class="row"><button class="btn btn-sm" data-subject="tasks" data-id="none">Ver tareas</button></div>' +
    '</article>';
  }

  LD.views = LD.views || {};
  LD.views.subjects = view;
})(window);
