-- LA ECONOMÍA DE CADA OBRA EN CARTERA, PERSISTIDA UNA VEZ: contratado, costo MO, costo materiales,
-- margen y plazo — lo que la pestaña OBRAS del Flujo de Caja publica obra por obra.
--
-- POR QUÉ (08/09/2026, orden del dueño): «en la pestaña OBRAS del Sheet Flujo de Fondos están los
-- montos contratados y los valores de costeo de mano de obra y materiales de cada obra; agregarlos
-- en Clientes». La web leía `obra_canonica.monto_contratado` (vacío en las nueve activas) y decía
-- «sin contrato»; el Sheet leía la Orden de Compra de Cobranzas y publicaba $346,7M. Dos verdades.
--
-- La escribe `orquestador/scripts/obras-economia-sync.mjs` (paso del pipeline del Flujo de Caja,
-- cada 2 h) con las MISMAS funciones que el generador de OBRAS. Réplica: nadie la edita a mano.

create table if not exists public.obra_economia_sheet (
  obra_canonica_id  text primary key references public.obra_canonica(id) on delete cascade,
  obra_clave        text not null,
  -- NULL = OBRAS no tiene el dato. Nunca 0: un cero diría «la obra vale cero».
  contratado        numeric(14,2),
  contratado_usd    numeric(14,2),
  costo_mo          numeric(14,2),
  costo_materiales  numeric(14,2),
  -- contratado − costo_mo − costo_materiales; NULL si falta cualquiera de los tres.
  margen            numeric(14,2),
  plazo_desde       date,
  plazo_hasta       date,
  -- Por cuál de los tres caminos salió el contratado: 'oc-pesos' | 'oc-usd-x-tc' | 'suma-viva' | NULL.
  origen            text check (origen is null or origen in ('oc-pesos', 'oc-usd-x-tc', 'suma-viva')),
  origen_fuente     text not null,
  leido_en          timestamptz not null,
  constraint obra_economia_sheet_margen_ck check (
    margen is null or (contratado is not null and costo_mo is not null and costo_materiales is not null)
  )
);

comment on table public.obra_economia_sheet is
  'Réplica por obra de lo que publica la pestaña OBRAS del Flujo de Caja: contratado (OC de Cobranzas > U$S×TC > suma viva), costo MO y materiales (suma de obra_egreso_proyectado), margen y plazo. La escribe obras-economia-sync.mjs. NULL = OBRAS no tiene el dato.';
comment on column public.obra_economia_sheet.origen is
  'Camino del contratado, el mismo que la columna D de OBRAS: oc-pesos (número tipeado en la Orden de Compra), oc-usd-x-tc (U$S declarados × TIPO_CAMBIO_USD), suma-viva (neto de sus filas no canceladas).';

alter table public.obra_economia_sheet enable row level security;

-- La fila la ve todo usuario interno; LAS COLUMNAS DE PRECIO NO. El jefe de obra no ve montos de
-- venta (decisión 19/08); los costos sí, igual que `obra_egreso_proyectado` y `obra_panel.costo_real`.
do $$ begin
  create policy obra_economia_sheet_lee on public.obra_economia_sheet
    for select to authenticated using (true);
exception when duplicate_object then null; end $$;

-- GRANT POR COLUMNA: `contratado`, `contratado_usd` y `margen` NO se conceden a authenticated. Se
-- leen a través de la vista `obra_economia_cartera`, que los gatea con ve_economia() como hace
-- `contratado_de_obra()`. (Una columna nueva nace sin permiso: si se agrega una, se concede acá.)
revoke all on public.obra_economia_sheet from authenticated;
grant select (obra_canonica_id, obra_clave, costo_mo, costo_materiales, plazo_desde, plazo_hasta, origen, origen_fuente, leido_en)
  on public.obra_economia_sheet to authenticated;
grant select, insert, update, delete on public.obra_economia_sheet to service_role;

-- LA CARA QUE LEE LA WEB. Sin security_invoker a propósito: corre con los privilegios del dueño de la
-- vista y decide por rol qué columnas devuelve — el mismo patrón que `obra_panel.monto_contratado`.
create or replace view public.obra_economia_cartera as
  select e.obra_canonica_id,
         e.obra_clave,
         case when public.ve_economia() or auth.uid() is null then e.contratado end     as contratado,
         case when public.ve_economia() or auth.uid() is null then e.contratado_usd end as contratado_usd,
         e.costo_mo,
         e.costo_materiales,
         case when public.ve_economia() or auth.uid() is null then e.margen end         as margen,
         e.plazo_desde,
         e.plazo_hasta,
         e.origen,
         e.leido_en
    from public.obra_economia_sheet e;

comment on view public.obra_economia_cartera is
  'obra_economia_sheet con los montos de venta (contratado, contratado_usd, margen) en NULL para quien no ve_economia(). Los costos los ve todo rol interno.';

grant select on public.obra_economia_cartera to authenticated;
grant select on public.obra_economia_cartera to service_role;
