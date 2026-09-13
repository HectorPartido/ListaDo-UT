-- =============================================================================
--  ListaDo · pruebas de seguridad del esquema
-- =============================================================================
--  Comprueba, con dos usuarios de verdad, que:
--    · al registrarse, cada uno recibe su grupo con su código
--    · un compañero que entra con el código ve tus asignaturas y tu horario
--    · pero NO ve tus tareas, ni tus compañeros, ni tus subtareas
--    · un miembro no puede editar ni borrar el horario del grupo (sólo el dueño)
--    · quien se sale se lleva una copia propia y ya puede editarla
--
--  Esto NO se ejecuta en Supabase: es para un PostgreSQL local.
--
--  Uso (el orden importa):
--    createdb listado_pruebas
--    psql -d listado_pruebas -f db/simulacro-auth.sql
--    psql -d listado_pruebas -f db/schema.sql
--    psql -d listado_pruebas -f db/pruebas-locales.sql
--
--  Si algo falla, el script se detiene con  FALLO: <motivo>.
-- =============================================================================

truncate auth.users cascade;   -- deja la base limpia para poder repetir

\set QUIET on
\set A '11111111-1111-1111-1111-111111111111'
\set B '22222222-2222-2222-2222-222222222222'

-- Helpers de identidad ------------------------------------------------------
create or replace function pg_temp.como(p_user text) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user)::text, false);
end $$;

create or replace function pg_temp.ok(p_cond boolean, p_label text) returns void
language plpgsql as $$
begin
  if p_cond then raise notice '  ok    %', p_label;
  else raise exception 'FALLO: %', p_label; end if;
end $$;

-- 1. Alta de los dos usuarios (el trigger debe crear grupo + perfil) --------
reset role;
insert into auth.users (id, email) values (:'A', 'ana@uni.es'), (:'B', 'bruno@uni.es');

do $$
declare ga uuid; gb uuid; ca text; cb text; n int;
begin
  select group_id into ga from public.profiles where user_id = '11111111-1111-1111-1111-111111111111';
  select group_id into gb from public.profiles where user_id = '22222222-2222-2222-2222-222222222222';
  select code into ca from public.groups where id = ga;
  select code into cb from public.groups where id = gb;
  perform pg_temp.ok(ga is not null and gb is not null, 'el alta crea perfil y grupo propio');
  perform pg_temp.ok(ga <> gb,                          'cada usuario arranca en su grupo');
  perform pg_temp.ok(ca ~ '^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$', 'código legible de 6 caracteres: ' || ca);
  perform pg_temp.ok(ca <> cb,                          'los códigos no se repiten');
end $$;

-- 2. Ana llena su grupo y sus tareas privadas -------------------------------
set role authenticated;
select pg_temp.como(:'A');

insert into public.subjects (group_id, name, code, color)
  values (public.my_group_id(), 'Bases de Datos', 'BBDD', '#d97706'),
         (public.my_group_id(), 'Estadistica',    'EST',  '#059669');
insert into public.classes (group_id, subject_id, day, start_time, end_time, room)
  select public.my_group_id(), id, 1, '09:00', '11:00', 'Aula 2.4' from public.subjects where code = 'BBDD';
insert into public.classes (group_id, subject_id, day, start_time, end_time, room)
  select public.my_group_id(), id, 3, '12:00', '14:00', 'Aula 1.1' from public.subjects where code = 'EST';
insert into public.classes (group_id, title, day, start_time, end_time)
  values (public.my_group_id(), 'Tutoria de proyecto', 5, '16:00', '17:00');

insert into public.members (user_id, name, alias) values (auth.uid(), 'Lucia Ferrer', 'Lu');
insert into public.tasks (user_id, subject_id, title, type, priority)
  select auth.uid(), id, 'Modelo E-R (privada de Ana)', 'proyecto', 'alta' from public.subjects where code = 'BBDD';
insert into public.tasks (user_id, title) values (auth.uid(), 'Segunda tarea de Ana');
insert into public.subtasks (task_id, text) select id, 'Normalizar a 3FN' from public.tasks where title like 'Modelo E-R%';
insert into public.task_members (task_id, member_id)
  select t.id, m.id from public.tasks t, public.members m where t.title like 'Modelo E-R%' and m.alias = 'Lu';
insert into public.member_subjects (member_id, subject_id)
  select m.id, s.id from public.members m, public.subjects s where m.alias = 'Lu' and s.code = 'BBDD';

do $$ begin
  perform pg_temp.ok((select count(*) from public.subjects) = 2, 'Ana ve sus 2 asignaturas');
  perform pg_temp.ok((select count(*) from public.classes)  = 3, 'Ana ve sus 3 clases');
  perform pg_temp.ok((select count(*) from public.tasks)    = 2, 'Ana ve sus 2 tareas');
end $$;

-- 3. Bruno, en su propio grupo, no ve NADA de Ana ---------------------------
select pg_temp.como(:'B');
do $$ begin
  perform pg_temp.ok((select count(*) from public.subjects) = 0, 'Bruno no ve las asignaturas de Ana');
  perform pg_temp.ok((select count(*) from public.classes)  = 0, 'Bruno no ve el horario de Ana');
  perform pg_temp.ok((select count(*) from public.tasks)    = 0, 'Bruno no ve las tareas de Ana');
  perform pg_temp.ok((select count(*) from public.members)  = 0, 'Bruno no ve los compañeros de Ana');
  perform pg_temp.ok((select count(*) from public.subtasks) = 0, 'Bruno no ve las subtareas de Ana');
end $$;

-- 4. Bruno entra con el código de Ana --------------------------------------
do $$
declare codigo text; g public.groups;
begin
  reset role;
  select code into codigo from public.groups g2
    join public.profiles p on p.group_id = g2.id
   where p.user_id = '11111111-1111-1111-1111-111111111111';
  set role authenticated;
  perform pg_temp.como('22222222-2222-2222-2222-222222222222');

  -- vista previa antes de entrar
  perform pg_temp.ok((select subjects from public.peek_group(codigo)) = 2, 'peek_group informa antes de entrar');
  select * into g from public.join_group(lower(codigo));   -- en minúsculas, debe aceptarlo
  perform pg_temp.ok(g.owner_id = '11111111-1111-1111-1111-111111111111', 'join_group acepta el código sin distinguir mayúsculas');
end $$;

do $$ begin
  perform pg_temp.ok((select count(*) from public.subjects) = 2, 'Bruno YA ve las 2 asignaturas del grupo');
  perform pg_temp.ok((select count(*) from public.classes)  = 3, 'Bruno YA ve las 3 clases del grupo');
  perform pg_temp.ok((select count(*) from public.tasks)    = 0, 'pero las tareas de Ana siguen siendo privadas');
  perform pg_temp.ok((select count(*) from public.members)  = 0, 'y sus compañeros también');
end $$;

-- 5. Bruno es miembro, no dueño: no puede tocar el horario ------------------
do $$
declare permitido boolean := false; n int;
begin
  begin
    insert into public.subjects (group_id, name) values (public.my_group_id(), 'Colada');
    permitido := true;
  exception when others then null; end;
  perform pg_temp.ok(not permitido, 'un miembro no puede añadir asignaturas al grupo');

  update public.subjects set name = 'Secuestrada' where code = 'BBDD';
  get diagnostics n = row_count;
  perform pg_temp.ok(n = 0, 'un miembro no puede editar las asignaturas del grupo');

  delete from public.classes;
  get diagnostics n = row_count;
  perform pg_temp.ok(n = 0, 'un miembro no puede borrar el horario del grupo');

  begin
    permitido := false;
    perform public.rotate_group_code();
    permitido := true;
  exception when others then null; end;
  perform pg_temp.ok(not permitido, 'un miembro no puede cambiar el código del grupo');
end $$;

-- 6. Bruno sí crea sus propias tareas sobre las asignaturas compartidas -----
insert into public.tasks (user_id, subject_id, title)
  select auth.uid(), id, 'Boletin 5 (privada de Bruno)' from public.subjects where code = 'BBDD';
do $$ begin
  perform pg_temp.ok((select count(*) from public.tasks) = 1, 'Bruno crea su tarea sobre una asignatura compartida');
end $$;

select pg_temp.como(:'A');
do $$ begin
  perform pg_temp.ok((select count(*) from public.tasks) = 2, 'Ana sigue viendo sólo sus 2 tareas, no la de Bruno');
end $$;

-- 7. Aislamiento fino: subtareas y uniones ajenas ---------------------------
select pg_temp.como(:'B');
do $$
declare permitido boolean := false; tarea_de_ana uuid;
begin
  reset role;
  select id into tarea_de_ana from public.tasks where title like 'Modelo E-R%';
  set role authenticated;
  perform pg_temp.como('22222222-2222-2222-2222-222222222222');
  begin
    insert into public.subtasks (task_id, text) values (tarea_de_ana, 'colada');
    permitido := true;
  exception when others then null; end;
  perform pg_temp.ok(not permitido, 'no se pueden colgar subtareas de la tarea de otro');
end $$;

-- 8. Restricciones de datos -------------------------------------------------
select pg_temp.como(:'A');
do $$
declare permitido boolean;
begin
  permitido := false;
  begin insert into public.classes (group_id, title, day, start_time, end_time)
        values (public.my_group_id(), 'Mal', 2, '12:00', '10:00'); permitido := true;
  exception when others then null; end;
  perform pg_temp.ok(not permitido, 'se rechaza una clase que acaba antes de empezar');

  permitido := false;
  begin insert into public.classes (group_id, title, day, start_time, end_time)
        values (public.my_group_id(), 'Mal', 9, '10:00', '11:00'); permitido := true;
  exception when others then null; end;
  perform pg_temp.ok(not permitido, 'se rechaza un día fuera de 1..7');

  permitido := false;
  begin insert into public.tasks (user_id, title, weight) values (auth.uid(), 'Mal', 150); permitido := true;
  exception when others then null; end;
  perform pg_temp.ok(not permitido, 'se rechaza un peso mayor que 100%');
end $$;

-- 9. Borrado en cascada -----------------------------------------------------
do $$
declare t uuid;
begin
  select id into t from public.tasks where title like 'Modelo E-R%';
  delete from public.tasks where id = t;
  perform pg_temp.ok((select count(*) from public.subtasks where task_id = t) = 0, 'al borrar la tarea se van sus subtareas');
  perform pg_temp.ok((select count(*) from public.task_members where task_id = t) = 0, 'y sus asignaciones de equipo');
end $$;

-- 10. Bruno se sale y se lleva su copia ------------------------------------
select pg_temp.como(:'B');
do $$
declare antiguo uuid; nuevo public.groups; n int;
begin
  antiguo := public.my_group_id();
  select * into nuevo from public.leave_group();
  perform pg_temp.ok(nuevo.id <> antiguo,                  'leave_group crea un grupo nuevo');
  perform pg_temp.ok(nuevo.owner_id = auth.uid(),          'del que Bruno ya es dueño');
  perform pg_temp.ok((select count(*) from public.subjects) = 2, 'con copia de las 2 asignaturas');
  perform pg_temp.ok((select count(*) from public.classes)  = 3, 'y de las 3 clases');
  perform pg_temp.ok((select count(*) from public.classes where subject_id is not null) = 2,
                     'las clases copiadas siguen apuntando a su asignatura');

  -- y ahora sí puede editarlas
  update public.subjects set teacher = 'Nuevo profe' where code = 'BBDD';
  get diagnostics n = row_count;
  perform pg_temp.ok(n = 1, 'en su propio grupo Bruno ya puede editar');
  perform pg_temp.ok((select count(*) from public.tasks) = 1, 'y conserva su tarea');
end $$;

-- 11. peek_group también para quien no ha entrado (rol anon) ---------------
do $$
declare codigo text; n bigint;
begin
  reset role;
  select g.code into codigo from public.groups g where g.owner_id = '11111111-1111-1111-1111-111111111111';
  set role anon;
  perform set_config('request.jwt.claims', '', false);
  select subjects into n from public.peek_group(codigo);
  perform pg_temp.ok(n = 2, 'peek_group funciona sin sesión (para la pantalla de unirse)');
  reset role;
end $$;

\echo ''
\echo '  TODAS LAS PRUEBAS PASARON'
