-- Fundación de trazabilidad y roles (2026-07-09).
--
-- Hallazgo real verificado antes de esta migración: las 26 tablas de `public` tienen
-- una única policy `using(true)` para cualquier `authenticated` (sin diferenciación de
-- rol, pese a que `perfiles.rol` ya distingue direccion/administracion/jefe_obra), y
-- ninguna tabla registra quién creó o modificó una fila. Esto es lo primero que hay que
-- corregir para que "todo pase por el OS" (alta/baja/modificación) sea trazable y no un
-- acceso plano para cualquiera. La diferenciación de RLS por rol tabla por tabla es el
-- siguiente incremento (requiere revisar cada policy con cuidado); esta migración pone
-- la base común primero.

create or replace function set_actualizado_en()
returns trigger
language plpgsql
as $$
begin
  new.actualizado_en = now();
  new.actualizado_por = coalesce(auth.uid(), new.actualizado_por);
  return new;
end;
$$;

do $$
declare
  t text;
begin
  for t in
    select table_name from information_schema.tables
    where table_schema = 'public' and table_type = 'BASE TABLE'
  loop
    execute format('alter table public.%I add column if not exists creado_por uuid references perfiles(id) default auth.uid()', t);
    execute format('alter table public.%I add column if not exists actualizado_por uuid references perfiles(id)', t);
    execute format('alter table public.%I add column if not exists actualizado_en timestamptz not null default now()', t);
    execute format(
      'drop trigger if exists trg_actualizado_en on public.%I; create trigger trg_actualizado_en before update on public.%I for each row execute function set_actualizado_en()',
      t, t
    );
  end loop;
end $$;

-- Preparar el rol de Campo (interfaz mínima) en el modelo. No se fabrica ninguna cuenta:
-- solo queda disponible el valor para cuando existan usuarios reales de Campo.
alter table perfiles drop constraint perfiles_rol_check;
alter table perfiles add constraint perfiles_rol_check
  check (rol = any(array['direccion','administracion','jefe_obra','campo']));
