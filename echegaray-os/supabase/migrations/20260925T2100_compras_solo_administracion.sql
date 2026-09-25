-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- COMPRAS EN LA BASE: SÓLO ADMINISTRACIÓN (el jefe de obra y el operario no leen ni escriben)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- Auditoría por nivel del 25/09/2026. Desde el 24/09 el jefe de obra no entra a Compras (dueño: «jefe
-- de obra de crm admin no tiene acceso a clientes, compras, impuestos y presupuestos, tampoco a
-- liquidación»), pero la base seguía abierta a `es_administracion()` —que incluye a `jefe_obra`—:
-- con su sesión, PostgREST devolvía las 1.006 filas de `compra_sheet` (con las de «Sueldos») y
-- `compra_obra_asignar` le dejaba cambiar la obra de cualquier compra. La pantalla era más angosta
-- que la base.
--
-- QUÉ CAMBIA
--   1. `compra_sheet` y `compra_obra_asignada`: SELECT sólo con `ve_economia()` (dirección +
--      administración). Ninguna de las dos tiene grant de escritura para `authenticated`; se escribe
--      sólo por funciones.
--   2. Las cuatro funciones que escriben Compras desde la app (`compra_obra_asignar`,
--      `compra_pago_registrar`, `compra_pago_cancelar`, `compra_pago_comprobante_registrar`) pasan de
--      `es_administracion()` a `ve_economia()`. Las de efectivo ya exigían `ve_economia()`.
--   3. `obra_costo_real` (invoker; la leen `obra_panel`, `obra_economia` y Operación › Compras de la
--      obra) miraba `compra_sheet` sólo para descontar las filas ANULADAS. Sin acceso a la tabla, el
--      jefe vería sumadas las anuladas. Esa pregunta pasa a `_compras_anuladas()`, security definer,
--      que devuelve SÓLO la referencia de las filas anuladas: ni importes, ni proveedores, ni conceptos.
--
-- QUÉ NO CAMBIA PARA EL JEFE: el costo de SU obra sigue saliendo de `costos_obra` (policy por
-- `mis_alias_de_obra()`), y la mano de obra de `costo_de_obras_a_la_fecha` sale de `costo_mo_de_obras`,
-- que no toca Compras. Lo que deja de recibir de esa función son los materiales, que ninguna pantalla
-- suya dibuja (Economía es de Administración desde el 23/09).
--
-- SIN `begin/commit` PROPIOS: los pone `orquestador/scripts/aplicar-migracion.mjs`.

-- 1 · Lectura
drop policy if exists compra_sheet_select on public.compra_sheet;
create policy compra_sheet_select on public.compra_sheet for select to authenticated
  using ((select public.ve_economia()));

drop policy if exists compra_obra_asignada_select on public.compra_obra_asignada;
create policy compra_obra_asignada_select on public.compra_obra_asignada for select to authenticated
  using ((select public.ve_economia()));

-- 2 · Escritura: el mismo portero en las cuatro funciones. Se reescribe la definición viva (no una copia
-- a mano del cuerpo) y se exige que el reemplazo haya ocurrido: si la guarda cambió de forma, la
-- migración falla en vez de dejar una función abierta en silencio.
do $$
declare
  f text;
  def text;
  nuevo text;
begin
  foreach f in array array['compra_obra_asignar', 'compra_pago_registrar', 'compra_pago_cancelar', 'compra_pago_comprobante_registrar'] loop
    select pg_get_functiondef(p.oid) into def
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = f;
    if def is null then raise exception 'no existe public.%', f; end if;
    nuevo := replace(def, 'if not public.es_administracion() then', 'if not public.ve_economia() then');
    if nuevo = def then raise exception 'public.% no tiene la guarda es_administracion() esperada', f; end if;
    execute nuevo;
  end loop;
end $$;

-- 3 · Las filas anuladas, sin abrir la tabla
create or replace function public._compras_anuladas()
returns setof text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(cs.sheet_id::text, cs.fila::text) from public.compra_sheet cs where cs.anulada
$$;
comment on function public._compras_anuladas() is
  'Referencias (sheet_id o fila) de las filas de Compras anuladas. La usa obra_costo_real para no sumarlas '
  'sin abrirle compra_sheet a quien no es Administración. No devuelve importes ni proveedores.';
revoke all on function public._compras_anuladas() from public, anon;
grant execute on function public._compras_anuladas() to authenticated, service_role;

create or replace view public.obra_costo_real with (security_invoker = true) as
 SELECT oc.id AS obra_id,
    oc.nombre AS obra_nombre,
    oc.estado,
    oc.tipo,
    (count(c.*))::integer AS n_comprobantes,
    COALESCE(sum(c.total), (0)::numeric) AS costo_real,
    COALESCE(sum(c.total) FILTER (WHERE (c.area = 'personas'::text)), (0)::numeric) AS costo_mano_de_obra
   FROM (obra_canonica oc
     LEFT JOIN costos_obra c ON (((c.obra_id = oc.id) AND (NOT (EXISTS ( SELECT 1
           FROM public._compras_anuladas() a(referencia)
          WHERE (a.referencia = c.referencia_externa)))))))
  GROUP BY oc.id, oc.nombre, oc.estado, oc.tipo;
-- `NOT EXISTS` y no `NOT IN`: con `referencia_externa` nula, `NOT IN` daría NULL y la fila se caería del
-- costo; el original era `NOT EXISTS` y una referencia nula SÍ suma.

-- 4 · `costos_obra` (la proyección de Compras por obra): quien no es Administración deja de leer las
-- filas SIN obra —ahí están los sueldos, las cargas, los honorarios y la estructura: 34 filas «personas»
-- por $49,6 M el 25/09— y las de área «personas». Le quedan las compras imputadas a obras que ve
-- (`mis_alias_de_obra()`), que es lo que sostiene `obra_costo_real` y el costo de la cabecera. La
-- solapa Operación › Compras ya era sólo de Administración (`TabOperacion`, `veEconomia`).
drop policy if exists costos_obra_select on public.costos_obra;
create policy costos_obra_select on public.costos_obra for select to authenticated using (
  (select public.ve_economia())
  or (
    obra_id is not null
    and area is distinct from 'personas'
    and norm_obra(obra_texto) in (select public.mis_alias_de_obra())
  )
);
