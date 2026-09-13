-- =============================================================================
--  ListaDo · simulacro del `auth` de Supabase — SÓLO para pruebas locales
-- =============================================================================
--  En Supabase esto ya existe y no hay que ejecutarlo. Sirve para poder cargar
--  db/schema.sql en un PostgreSQL normal y comprobar las reglas de seguridad.
--
--  Orden correcto en local:
--    psql -d listado_pruebas -f db/simulacro-auth.sql
--    psql -d listado_pruebas -f db/schema.sql
--    psql -d listado_pruebas -f db/pruebas-locales.sql
-- =============================================================================

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
end $$;

create schema if not exists auth;
create extension if not exists pgcrypto;

create table if not exists auth.users (
  id                 uuid primary key default gen_random_uuid(),
  email              text unique,
  raw_user_meta_data jsonb default '{}'::jsonb
);

-- Misma implementación que usa Supabase: saca el 'sub' del JWT de la sesión.
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'sub', '')::uuid
$$;

grant usage on schema auth to anon, authenticated;
grant select on auth.users to authenticated;
