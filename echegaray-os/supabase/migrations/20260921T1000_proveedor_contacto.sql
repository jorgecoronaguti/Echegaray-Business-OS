-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- LOS CONTACTOS DE UN PROVEEDOR — con quién se habla en la empresa que nos vende
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- Pedido del dueño, 21/09/2026, textual: «no tengo forma de agregar personas a los proveedores en
-- app.ecsas.com.ar, no puedo dejar asentado un nombre un contacto nada».
--
-- ═══ QUÉ EXISTÍA Y POR QUÉ NO ALCANZABA ═══
--
-- `public.proveedores` no tiene ninguna columna de contacto, y la ficha lo decía en su pie: «no se
-- dibujan porque no habría dónde guardarlos». Agregar `telefono`/`contacto` a `proveedores` guarda UNA
-- persona, y un proveedor tiene varias: quien vende, quien factura, quien cobra. El cliente ya tiene
-- resuelto exactamente esto con `cliente_contacto` (20260818120000): una fila por persona colgando de
-- la entidad. Ésta es la MISMA forma —mismas columnas, misma validación (`src/shared/contactos`),
-- mismo bloque en la ficha— con la FK al proveedor. No es un segundo modelo de contacto.
--
-- `rol` es texto libre corto («administración», «comercial», «cobranzas», «dueño»): con una lista
-- cerrada, el primer proveedor que tenga un «encargado de depósito» obligaría a mentir o a migrar.
--
-- ═══ LA BAJA ES UN DELETE, COMO EN EL CLIENTE ═══
--
-- Un contacto no es evidencia de nada económico ni fiscal: es una libreta. Si la persona dejó la
-- empresa, se borra. Por eso sí `on delete cascade` —a diferencia de `proveedor_documento`, cuyo
-- contrato no puede irse con el proveedor—; y de todos modos la baja de un proveedor en este OS es
-- `activo = false`, no un delete.
--
-- NO SE APLICA DESDE UN AGENTE. La aplica el dueño; mientras no esté, la ficha lo dice y no escribe.

create table if not exists public.proveedor_contacto (
  id            uuid primary key default gen_random_uuid(),
  proveedor_id  uuid not null references public.proveedores(id) on delete cascade,
  -- Los topes son los mismos del formulario y de `contactoSchema`: la base no guarda lo que la
  -- pantalla no deja escribir, y una escritura por fuera de la web no se saltea la regla.
  nombre        text not null check (length(btrim(nombre)) between 2 and 120),
  rol           text check (rol is null or length(rol) <= 120),
  email         text check (email is null or length(email) <= 160),
  telefono      text check (telefono is null or length(telefono) <= 60),
  notas         text check (notas is null or length(notas) <= 400),
  creado_en     timestamptz not null default now()
);

-- La ficha pide exactamente esto: los contactos de un proveedor, por nombre.
create index if not exists proveedor_contacto_proveedor_idx
  on public.proveedor_contacto (proveedor_id, nombre);

comment on table public.proveedor_contacto is
  'Las personas con las que se habla en un proveedor (vendedor, administración, cobranzas). Misma forma que cliente_contacto; validación en src/shared/contactos/contacto.ts.';

-- ── RLS ─────────────────────────────────────────────────────────────────────────────────────────
--
-- La misma puerta que la ficha y que `proveedor_documento`: `es_administracion()` — Dirección,
-- Administración y jefe de obra (decisión del dueño del 19/08: el jefe de obra ES Administración, y
-- es quien tiene al proveedor adelante en la obra). Cuatro policies y no un `for all`: un `for all`
-- también gobierna SELECT y eso ya se pagó cinco veces (`orquestador/lib/politicas-for-all.test.mjs`).
-- Los porteros van en `(select …)` para que Postgres los evalúe una vez por consulta, no por fila.
alter table public.proveedor_contacto enable row level security;

drop policy if exists proveedor_contacto_select on public.proveedor_contacto;
create policy proveedor_contacto_select on public.proveedor_contacto
  for select to authenticated using ((select public.es_administracion()));

drop policy if exists proveedor_contacto_insert on public.proveedor_contacto;
create policy proveedor_contacto_insert on public.proveedor_contacto
  for insert to authenticated with check ((select public.es_administracion()));

drop policy if exists proveedor_contacto_update on public.proveedor_contacto;
create policy proveedor_contacto_update on public.proveedor_contacto
  for update to authenticated
  using ((select public.es_administracion())) with check ((select public.es_administracion()));

drop policy if exists proveedor_contacto_delete on public.proveedor_contacto;
create policy proveedor_contacto_delete on public.proveedor_contacto
  for delete to authenticated using ((select public.es_administracion()));

-- ── GRANTS ──────────────────────────────────────────────────────────────────────────────────────
--
-- RLS NO ES GRANT: en esta base una tabla nueva nace sin permiso, y sin esto el alta rebota con
-- «permission denied for table proveedor_contacto». El UPDATE va por columna y deja afuera
-- `proveedor_id`: mudar un contacto a otro proveedor no es una edición, y con el grant abierto se
-- podría hacer desde el navegador. `creado_en` tampoco: es cuándo entró a la libreta.
grant select, delete on public.proveedor_contacto to authenticated;
grant insert (proveedor_id, nombre, rol, email, telefono, notas) on public.proveedor_contacto to authenticated;
grant update (nombre, rol, email, telefono, notas) on public.proveedor_contacto to authenticated;
-- El chat y los scripts del orquestador leen con la llave de servicio.
grant select, insert, update, delete on public.proveedor_contacto to service_role;

-- ── TIEMPO REAL ─────────────────────────────────────────────────────────────────────────────────
--
-- Lleva el trigger de aviso de 20260915T2100: nadie la borra y la reinserta, así que avisa sólo
-- cuando una persona cambió algo. La lista entre marcas la lee `planDeRefresco.test.ts` y tiene que
-- coincidir con `src/shared/tiempo-real/tablas.ts`.
do $do$
declare
  t text;
begin
  foreach t in array array[
    -- TABLAS-CON-AVISO:inicio
    'proveedor_contacto'
    -- TABLAS-CON-AVISO:fin
  ]
  loop
    if exists (
      select 1 from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = t and c.relkind in ('r', 'p')
    ) then
      execute format('drop trigger if exists zz_avisar_insert on public.%I', t);
      execute format('drop trigger if exists zz_avisar_update on public.%I', t);
      execute format('drop trigger if exists zz_avisar_delete on public.%I', t);
      execute format(
        'create trigger zz_avisar_insert after insert on public.%I referencing new table as nuevas '
        'for each statement execute function public.avisar_cambio_de_tabla()', t);
      execute format(
        'create trigger zz_avisar_update after update on public.%I referencing old table as viejas new table as nuevas '
        'for each statement execute function public.avisar_cambio_de_tabla()', t);
      execute format(
        'create trigger zz_avisar_delete after delete on public.%I referencing old table as viejas '
        'for each statement execute function public.avisar_cambio_de_tabla()', t);
    else
      raise notice 'tiempo real: public.% no es una tabla en esta base, sin aviso', t;
    end if;
  end loop;
end;
$do$;

-- PostgREST recarga su caché de esquema: sin esto, los primeros minutos contesta PGRST205.
notify pgrst, 'reload schema';
