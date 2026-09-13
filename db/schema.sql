-- =============================================================================
--  ListaDo · esquema de base de datos (PostgreSQL / Supabase)
-- =============================================================================
--  Cómo ejecutarlo:
--    Supabase → tu proyecto → SQL Editor → New query → pegar todo → Run.
--    Es idempotente: puedes volver a ejecutarlo sin romper nada.
--
--  Modelo en una frase:
--    Las ASIGNATURAS y el HORARIO pertenecen a un GRUPO que se comparte con un
--    código; las TAREAS y los COMPAÑEROS son privados de cada usuario.
--
--    · Al registrarte se te crea automáticamente tu propio grupo con su código.
--    · Si le pasas el código a un compañero, él ve tus mismas asignaturas y tu
--      mismo horario (en vivo: si cambias un aula, lo ve).
--    · Sus tareas y sus compañeros siguen siendo sólo suyos.
--    · Quien se sale de un grupo se lleva una copia propia para editarla a gusto.
--
--  Seguridad: RLS activado en todas las tablas. Nadie puede leer ni escribir
--  filas de otro usuario, ni de un grupo al que no pertenezca.
-- =============================================================================

create extension if not exists pgcrypto;   -- gen_random_uuid()

-- =============================================================================
--  1. Tablas
-- =============================================================================

-- Grupo: el marco académico compartido (asignaturas + horario).
create table if not exists public.groups (
  id         uuid primary key default gen_random_uuid(),
  name       text not null default 'Mi grupo',
  code       text not null unique,
  owner_id   uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

comment on table  public.groups is 'Marco académico compartido mediante código.';
comment on column public.groups.code is 'Código corto que se comparte con los compañeros.';

-- Perfil: preferencias del usuario y a qué grupo pertenece (uno a la vez).
create table if not exists public.profiles (
  user_id      uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '',
  group_id     uuid references public.groups (id) on delete set null,
  theme        text not null default 'auto' check (theme in ('auto', 'light', 'dark')),
  last_view    text not null default 'dashboard',
  updated_at   timestamptz not null default now()
);

-- Asignatura: del GRUPO, no del usuario.
create table if not exists public.subjects (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null references public.groups (id) on delete cascade,
  name       text not null,
  code       text not null default '',
  teacher    text not null default '',
  color      text not null default '#4f46e5',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Clase del horario semanal: también del GRUPO.
create table if not exists public.classes (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null references public.groups (id) on delete cascade,
  subject_id uuid references public.subjects (id) on delete set null,
  title      text not null default '',          -- sólo si no hay asignatura
  day        smallint not null check (day between 1 and 7),   -- 1 = lunes
  start_time time not null,
  end_time   time not null,
  room       text not null default '',
  teacher    text not null default '',
  updated_at timestamptz not null default now(),
  constraint classes_horas_coherentes check (end_time > start_time)
);

-- Tarea: PRIVADA de cada usuario, aunque apunte a una asignatura compartida.
create table if not exists public.tasks (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  subject_id   uuid references public.subjects (id) on delete set null,
  title        text not null,
  notes        text not null default '',
  -- `type` va sin restricción a propósito: el catálogo de tipos vive en el
  -- cliente (js/store.js) y añadir uno nuevo no debe exigir tocar la base.
  type         text not null default 'entrega',
  due          date,
  due_time     time,
  priority     text not null default 'media'     check (priority in ('alta', 'media', 'baja')),
  status       text not null default 'pendiente' check (status in ('pendiente', 'curso', 'hecha')),
  estimate     numeric(6, 2) check (estimate is null or estimate >= 0),
  weight       numeric(5, 2) check (weight   is null or (weight >= 0 and weight <= 100)),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.subtasks (
  id       uuid primary key default gen_random_uuid(),
  task_id  uuid not null references public.tasks (id) on delete cascade,
  text     text not null default '',
  done     boolean not null default false,
  position integer not null default 0
);

-- Compañero de equipo: ficha PRIVADA de cada usuario.
create table if not exists public.members (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  name       text not null,
  alias      text not null default '',
  email      text not null default '',
  phone      text not null default '',
  notes      text not null default '',
  color      text not null default '#0891b2',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Asignaturas que comparto con un compañero.
create table if not exists public.member_subjects (
  member_id  uuid not null references public.members (id)  on delete cascade,
  subject_id uuid not null references public.subjects (id) on delete cascade,
  primary key (member_id, subject_id)
);

-- Quién participa en cada tarea.
create table if not exists public.task_members (
  task_id   uuid not null references public.tasks (id)   on delete cascade,
  member_id uuid not null references public.members (id) on delete cascade,
  primary key (task_id, member_id)
);

-- =============================================================================
--  2. Índices
-- =============================================================================

create index if not exists idx_profiles_group    on public.profiles (group_id);
create index if not exists idx_subjects_group    on public.subjects (group_id);
create index if not exists idx_classes_group_day on public.classes  (group_id, day, start_time);
create index if not exists idx_classes_subject   on public.classes  (subject_id);
create index if not exists idx_tasks_user_due    on public.tasks    (user_id, due);
create index if not exists idx_tasks_user_status on public.tasks    (user_id, status);
create index if not exists idx_tasks_subject     on public.tasks    (subject_id);
create index if not exists idx_subtasks_task     on public.subtasks (task_id, position);
create index if not exists idx_members_user      on public.members  (user_id);

-- =============================================================================
--  3. Utilidades
-- =============================================================================

-- Marca updated_at en cada UPDATE.
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['profiles', 'subjects', 'classes', 'tasks', 'members'] loop
    execute format('drop trigger if exists trg_touch_%1$s on public.%1$s', t);
    execute format(
      'create trigger trg_touch_%1$s before update on public.%1$s
       for each row execute function public.touch_updated_at()', t);
  end loop;
end $$;

-- Código de grupo legible: 6 caracteres, sin 0/O/1/I para que no se confundan.
create or replace function public.new_group_code()
returns text language plpgsql security definer set search_path = public as $$
declare
  alfabeto text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  codigo   text;
  i        integer;
begin
  loop
    codigo := '';
    for i in 1 .. 6 loop
      codigo := codigo || substr(alfabeto, 1 + floor(random() * length(alfabeto))::integer, 1);
    end loop;
    exit when not exists (select 1 from public.groups where code = codigo);
  end loop;
  return codigo;
end $$;

-- Mi grupo actual. SECURITY DEFINER para que las políticas puedan consultarlo
-- sin entrar en recursión con el propio RLS de `profiles`.
create or replace function public.my_group_id()
returns uuid language sql stable security definer set search_path = public as $$
  select group_id from public.profiles where user_id = auth.uid()
$$;

-- ¿Soy el dueño de este grupo?
create or replace function public.owns_group(p_group uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.groups where id = p_group and owner_id = auth.uid()
  )
$$;

-- =============================================================================
--  4. Alta de usuario: perfil + grupo propio, automáticos
-- =============================================================================

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  nuevo_grupo uuid;
begin
  insert into public.groups (name, code, owner_id)
  values ('Mi grupo', public.new_group_code(), new.id)
  returning id into nuevo_grupo;

  insert into public.profiles (user_id, display_name, group_id)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', ''), nuevo_grupo)
  on conflict (user_id) do update set group_id = excluded.group_id;

  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =============================================================================
--  5. Operaciones de grupo (RPC que llama el cliente)
-- =============================================================================

-- Ver de qué va un grupo antes de entrar, con sólo el código.
create or replace function public.peek_group(p_code text)
returns table (name text, subjects bigint, classes bigint, people bigint)
language sql stable security definer set search_path = public as $$
  select g.name,
         (select count(*) from public.subjects s where s.group_id = g.id),
         (select count(*) from public.classes  c where c.group_id = g.id),
         (select count(*) from public.profiles p where p.group_id = g.id)
  from public.groups g
  where g.code = upper(trim(p_code))
$$;

-- Entrar en el grupo de un compañero con su código.
create or replace function public.join_group(p_code text)
returns public.groups
language plpgsql security definer set search_path = public as $$
declare
  destino public.groups;
begin
  if auth.uid() is null then
    raise exception 'Hay que iniciar sesión.';
  end if;

  select * into destino from public.groups where code = upper(trim(p_code));
  if destino.id is null then
    raise exception 'No existe ningún grupo con el código %.', upper(trim(p_code));
  end if;

  update public.profiles set group_id = destino.id where user_id = auth.uid();
  return destino;
end $$;

-- Salir del grupo llevándose una copia propia de asignaturas y horario.
-- Devuelve el grupo nuevo; el cliente reapunta sus tareas emparejando por nombre.
create or replace function public.leave_group()
returns public.groups
language plpgsql security definer set search_path = public as $$
declare
  anterior uuid;
  nuevo    public.groups;
begin
  if auth.uid() is null then
    raise exception 'Hay que iniciar sesión.';
  end if;

  select group_id into anterior from public.profiles where user_id = auth.uid();

  insert into public.groups (name, code, owner_id)
  values ('Mi grupo', public.new_group_code(), auth.uid())
  returning * into nuevo;

  -- Copia las asignaturas conservando la correspondencia vieja → nueva
  -- para poder copiar después las clases ya reapuntadas.
  with copiadas as (
    insert into public.subjects (group_id, name, code, teacher, color)
    select nuevo.id, s.name, s.code, s.teacher, s.color
    from public.subjects s
    where s.group_id = anterior
    returning id, name, code
  )
  insert into public.classes (group_id, subject_id, title, day, start_time, end_time, room, teacher)
  select nuevo.id, c2.id, c.title, c.day, c.start_time, c.end_time, c.room, c.teacher
  from public.classes c
  left join public.subjects s  on s.id = c.subject_id
  left join copiadas       c2  on c2.name = s.name and c2.code = s.code
  where c.group_id = anterior;

  update public.profiles set group_id = nuevo.id where user_id = auth.uid();
  return nuevo;
end $$;

-- Cambiar el código (si se ha compartido de más). Sólo el dueño.
create or replace function public.rotate_group_code()
returns text language plpgsql security definer set search_path = public as $$
declare
  nuevo_codigo text;
  afectadas    integer;
begin
  nuevo_codigo := public.new_group_code();
  update public.groups
     set code = nuevo_codigo
   where id = public.my_group_id() and owner_id = auth.uid();
  get diagnostics afectadas = row_count;

  if afectadas = 0 then
    raise exception 'Sólo el dueño del grupo puede cambiar su código.';
  end if;
  return nuevo_codigo;
end $$;

-- =============================================================================
--  6. Row Level Security
-- =============================================================================

alter table public.groups          enable row level security;
alter table public.profiles        enable row level security;
alter table public.subjects        enable row level security;
alter table public.classes         enable row level security;
alter table public.tasks           enable row level security;
alter table public.subtasks        enable row level security;
alter table public.members         enable row level security;
alter table public.member_subjects enable row level security;
alter table public.task_members    enable row level security;

-- Quitar políticas previas para poder reejecutar el archivo.
do $$
declare p record;
begin
  for p in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in ('groups', 'profiles', 'subjects', 'classes', 'tasks',
                        'subtasks', 'members', 'member_subjects', 'task_members')
  loop
    execute format('drop policy %I on %I.%I', p.policyname, p.schemaname, p.tablename);
  end loop;
end $$;

-- ---- Grupos: veo el mío y los que poseo; sólo el dueño los modifica --------
create policy groups_select on public.groups for select
  using (id = public.my_group_id() or owner_id = auth.uid());
create policy groups_insert on public.groups for insert
  with check (owner_id = auth.uid());
create policy groups_update on public.groups for update
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy groups_delete on public.groups for delete
  using (owner_id = auth.uid());

-- ---- Perfiles: el mío entero; de los del grupo, sólo para saber quién hay --
create policy profiles_select on public.profiles for select
  using (user_id = auth.uid() or group_id = public.my_group_id());
create policy profiles_insert on public.profiles for insert
  with check (user_id = auth.uid());
create policy profiles_update on public.profiles for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---- Asignaturas y horario: las lee todo el grupo, las edita el dueño -----
--  Si algún día quieres que tus compañeros también puedan corregir el horario,
--  sustituye `public.owns_group(group_id)` por `true` en las cuatro políticas
--  de escritura de subjects y classes.
create policy subjects_select on public.subjects for select
  using (group_id = public.my_group_id());
create policy subjects_insert on public.subjects for insert
  with check (group_id = public.my_group_id() and public.owns_group(group_id));
create policy subjects_update on public.subjects for update
  using (group_id = public.my_group_id() and public.owns_group(group_id))
  with check (group_id = public.my_group_id() and public.owns_group(group_id));
create policy subjects_delete on public.subjects for delete
  using (group_id = public.my_group_id() and public.owns_group(group_id));

create policy classes_select on public.classes for select
  using (group_id = public.my_group_id());
create policy classes_insert on public.classes for insert
  with check (group_id = public.my_group_id() and public.owns_group(group_id));
create policy classes_update on public.classes for update
  using (group_id = public.my_group_id() and public.owns_group(group_id))
  with check (group_id = public.my_group_id() and public.owns_group(group_id));
create policy classes_delete on public.classes for delete
  using (group_id = public.my_group_id() and public.owns_group(group_id));

-- ---- Tareas, subtareas, compañeros y sus uniones: privados ----------------
create policy tasks_all on public.tasks for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy subtasks_all on public.subtasks for all
  using (exists (select 1 from public.tasks t
                  where t.id = subtasks.task_id and t.user_id = auth.uid()))
  with check (exists (select 1 from public.tasks t
                  where t.id = subtasks.task_id and t.user_id = auth.uid()));

create policy members_all on public.members for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy member_subjects_all on public.member_subjects for all
  using (exists (select 1 from public.members m
                  where m.id = member_subjects.member_id and m.user_id = auth.uid()))
  with check (exists (select 1 from public.members m
                  where m.id = member_subjects.member_id and m.user_id = auth.uid())
         and exists (select 1 from public.subjects s
                  where s.id = member_subjects.subject_id and s.group_id = public.my_group_id()));

create policy task_members_all on public.task_members for all
  using (exists (select 1 from public.tasks t
                  where t.id = task_members.task_id and t.user_id = auth.uid()))
  with check (exists (select 1 from public.tasks t
                  where t.id = task_members.task_id and t.user_id = auth.uid())
         and exists (select 1 from public.members m
                  where m.id = task_members.member_id and m.user_id = auth.uid()));

-- =============================================================================
--  7. Permisos
-- =============================================================================

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;

-- Supabase concede acceso a las tablas al rol público `anon` por omisión. RLS ya
-- lo bloquea todo (auth.uid() es nulo sin sesión), pero la app nunca necesita
-- ese rol para leer tablas: se lo quitamos para que ni un descuido futuro en una
-- política pueda filtrar nada a quien no ha iniciado sesión.
revoke all on all tables in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;
grant execute on function public.peek_group(text)      to anon, authenticated;
grant execute on function public.join_group(text)       to authenticated;
grant execute on function public.leave_group()          to authenticated;
grant execute on function public.rotate_group_code()    to authenticated;
grant execute on function public.my_group_id()          to authenticated;
grant execute on function public.owns_group(uuid)       to authenticated;
