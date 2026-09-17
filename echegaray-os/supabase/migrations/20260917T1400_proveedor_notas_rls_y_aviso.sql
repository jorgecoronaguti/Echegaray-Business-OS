-- LAS NOTAS «QUÉ HACER» DE PROVEEDORES, LEGIBLES POR LA APP Y EN VIVO.
--
-- El dueño (17/09/2026): «lo que indica el Sheet Flujo de Fondos en Proveedores tiene que actualizarse
-- en tiempo real a Supabase y en app.ecsas.com.ar, y de vuelta también».
--
-- ═══ CÓMO ESTABA (leído en la base viva, sólo lectura, el 17/09/2026) ═══
--
--   · `relrowsecurity = false`: la tabla nació en 20260731180000 sin RLS.
--   · Ningún grant a `anon` ni a `authenticated`; sólo `service_role`. Hoy nadie de afuera la lee, pero
--     por AUSENCIA de grant, no por una política: el día que alguien le dé un `grant select`, quedaría
--     abierta a cualquier sesión — un empleado o un cliente del portal también son `authenticated`.
--   · 14 notas, un solo `file_id` (el Flujo de Caja). La escriben scripts por DATABASE_URL.
--
-- ═══ QUIÉN LA LEE ═══
--
-- La misma puerta que `proveedor_deuda` y `compra_sheet`: `es_administracion()` — dirección,
-- administración y jefe de obra. Son instrucciones de pago («pagar con cheque a 15», «no es
-- prioridad») al lado de lo que se debe: quien ve la deuda ve qué hacer con ella, y quien no la ve
-- tampoco ve esto. El portero va entre paréntesis con `select` para que Postgres lo evalúe una vez por
-- consulta y no una por fila (memoria «Porteros initplan»).
--
-- ═══ QUIÉN LA ESCRIBE ═══
--
-- Nadie por PostgREST. Sin política de INSERT/UPDATE/DELETE y sin grant de escritura: la app pide un
-- cambio con `proveedor_nota_pedir` (20260917T1410), y la nota cambia en la base recién cuando el
-- worker la escribió en el Sheet y la releyó. Si `authenticated` pudiera escribirla directo, la app
-- afirmaría una instrucción que el Sheet —donde el dueño la edita— nunca tuvo. Los scripts siguen
-- escribiendo por DATABASE_URL, que no pasa por RLS.
--
-- ═══ EN VIVO ═══
--
-- Lleva el trigger de aviso de 20260915T2100. Puede llevarlo porque NADIE la borra y la reinserta: la
-- sonda hace upsert por clave y borra sólo lo que el dueño borró, y `actualizado_en` es un sello, así
-- que un upsert que deja la misma nota no avisa.
--
-- ORDEN: antes que 20260917T1410 (la RPC lee esta tabla). No depende de nada que no esté aplicado:
-- `es_administracion()` y `avisar_cambio_de_tabla()` existen en la base viva.

set local lock_timeout = '2s';

alter table public.proveedor_notas enable row level security;

drop policy if exists proveedor_notas_select on public.proveedor_notas;
create policy proveedor_notas_select on public.proveedor_notas
  for select to authenticated using ((select public.es_administracion()));

revoke all on public.proveedor_notas from anon;
revoke insert, update, delete, truncate on public.proveedor_notas from authenticated;
grant select on public.proveedor_notas to authenticated;

comment on policy proveedor_notas_select on public.proveedor_notas is
  'La misma puerta que proveedor_deuda: quien ve lo que se debe ve qué hacer con cada proveedor. Escritura sólo por proveedor_nota_pedir + worker.';

do $do$
declare
  t text;
begin
  foreach t in array array[
    -- TABLAS-CON-AVISO:inicio
    'proveedor_notas'
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
