-- LOS CUATRO RUBROS DE LA OBRA, DEFINIDOS UNA SOLA VEZ, Y EL PRESUPUESTO POR RUBRO LEÍDO DEL DOCUMENTO.
--
-- ═══ POR QUÉ (dueño, 18/09/2026) ═══
--
-- «Están mal los datos de analíticas, porque inventás o empezás de cero y no buscás en las bases de
-- datos que ya existen. Lo contratado es un dato que ya tenemos en el CRM; lo que tenés que buscar en
-- los presupuestos son materiales, mano de obra, subcontratistas y en otros si hay alquileres de
-- maquinarias, servicios, etc. Y quiero que cada cosa quede aclarada diciendo qué contiene cada uno.»
-- Y después: «necesito que los datos estén perfectos leyendo de los mismos lugares en todo
-- app.ecsas.com.ar».
--
-- Hasta hoy el gasto tenía TRES rubros (mano de obra, subcontratos, materiales) y «materiales» era
-- todo comprobante que no fuera de un subcontratista: adentro iban el alquiler de la plataforma, el
-- baño químico, el gasoil y el flete. Y la cotización tenía otros tres (MO, CS, MA) que no eran los
-- mismos. No había con qué comparar rubro contra rubro.
--
-- ═══ LOS CUATRO RUBROS (la definición vive acá y en `orquestador/lib/presupuesto-rubros.mjs`) ═══
--
--   mano_obra        jornales del personal propio con sus cargas sociales. En la cotización: horas de
--                    oficial/ayudante (Análisis, unidad «hs») y sus cargas («hr» CARGA SOCIAL). En el
--                    gasto: `costo_mo_quincena` (recibo del estudio + parte en negro, por quincena).
--   materiales       lo que se compra y queda en la obra o se consume haciéndola: áridos, hierro,
--                    hormigón, chapa, madera, sanitarios, ferretería, EPP.
--   subcontratistas  trabajo contratado a terceros: proveedores marcados «Subcontratista» o la familia
--                    «Subcontratos y mano de obra» de Compras; en la cotización, insumos cotizados por
--                    unidad de obra (familia MANO DE OBRA por m², SUBCONTRATISTA).
--   otros            alquiler y uso de equipos (propios o alquilados), combustible, fletes y traslados,
--                    servicios de obra (baño, contenedor, agua, bomba), honorarios y servicios.
--
-- ═══ QUÉ CREA Y QUÉ CAMBIA ═══
--
--   1. `rubro_de_compra(...)`: la regla de los cuatro rubros para un comprobante de Compras. Una sola.
--   2. `obra_presupuesto_lectura` + `obra_presupuesto_rubro`: el presupuesto de cada obra POR RUBRO, con
--      el detalle (ítems, cantidades, importes) y la cita del documento de Drive. Lo carga
--      `orquestador/scripts/cargar-presupuesto-rubros.mjs`, que se vuelve a correr cuando cambia una
--      cotización. Una obra sin presupuesto localizable tiene su fila con el motivo: nunca un número.
--   3. `costo_de_obras_por_rubro(...)`: lo consumido por rubro, con su detalle (familias, proveedores,
--      quincenas). Misma base que `costo_de_obras_a_la_fecha`: `costo_de_obra_filas_iva` y
--      `costo_mo_de_obras`.
--   4. `costo_de_obras_a_la_fecha(text[], date, date, boolean)` publica `otros` y `materiales` DEJA de
--      incluirlo: el CRM, la ficha de la obra y Analíticas leen la misma función y ven los mismos cuatro
--      números. `analiticas_consumo_mensual` abre `otros` igual.
--   5. `obra_economia_rubros`: la vista que junta, por obra, lo contratado (la definición de siempre,
--      `contratado_de_obra`) y lo presupuestado por rubro con su detalle. Es la fuente de Analíticas, y
--      la que tiene que leer cualquier pantalla nueva que muestre estos conceptos.
--
-- ═══ LO QUE NO CAMBIA ═══
--
--   `presupuestos.costo_directo_presupuestado` (→ `obra_economia.costo_objetivo`, la ficha) sigue siendo
--   el total: el cargador verifica que la suma de los rubros leídos sea ese mismo número y se niega a
--   cargar si no. `compras_sin_obra_de_clientes` sigue publicando materiales + subcontratos: lo sin
--   obra es un cajón que no se compara con ningún presupuesto.

set local lock_timeout = '5s';

-- ── 1 · la regla de los cuatro rubros para Compras ───────────────────────────────────────────────
create or replace function public.rubro_de_compra(p_es_subcontrato boolean, p_familia text, p_sub_rubro text)
returns text
language sql
immutable
as $$
  select case
    when coalesce(p_es_subcontrato, false) then 'subcontratistas'
    when p_familia = 'Subcontratos y mano de obra' then 'subcontratistas'
    when p_familia in ('Alquiler y traslado de equipos', 'Servicios de obra (baño, contenedor, agua)', 'Combustible de obra')
      then 'otros'
    when p_familia is null
     and p_sub_rubro in ('Combustible', 'Honorarios y servicios', 'Oficina e informática', 'Vehículos y taller', 'Equipos y rodados (inversión)')
      then 'otros'
    else 'materiales'
  end
$$;
comment on function public.rubro_de_compra(boolean, text, text) is
  'El rubro de un comprobante de Compras imputado a una obra: subcontratistas (proveedor marcado o familia «Subcontratos y mano de obra»), otros (alquiler y traslado de equipos, servicios de obra, combustible; o sin familia con sub-rubro de servicio/vehículo/equipo), materiales (todo lo demás). La mano de obra propia no pasa por acá: sale de costo_mo_quincena.';
revoke all on function public.rubro_de_compra(boolean, text, text) from public, anon;
grant execute on function public.rubro_de_compra(boolean, text, text) to authenticated, service_role;

-- ── 2 · el presupuesto por rubro, leído del documento ────────────────────────────────────────────
create table public.obra_presupuesto_lectura (
  obra_canonica_id   text primary key references public.obra_canonica(id),
  estado             text not null check (estado in ('leido', 'sin_presupuesto')),
  motivo             text,
  -- Σ de los rubros con monto. Tiene que ser el `costo_directo_presupuestado` del presupuesto aprobado.
  costo_directo      numeric,
  moneda             text not null default 'ARS' check (moneda in ('ARS', 'USD')),
  estimado           boolean not null default false,
  fuente_drive_id    text,
  fuente_nombre      text,
  fuente_fecha       date,
  fuente_modificado  timestamptz,
  cita               text,
  leido_en           timestamptz not null default now(),
  leido_por          text,
  constraint obra_presupuesto_lectura_leido_con_costo check ((estado = 'leido') = (costo_directo is not null)),
  constraint obra_presupuesto_lectura_sin_presupuesto_con_motivo
    check (estado = 'leido' or nullif(btrim(motivo), '') is not null),
  constraint obra_presupuesto_lectura_leido_con_fuente
    check (estado <> 'leido' or (fuente_drive_id is not null and nullif(btrim(cita), '') is not null))
);
comment on table public.obra_presupuesto_lectura is
  'Una fila por obra: de qué documento de Drive se leyó su presupuesto (o por qué no hay). El desglose está en obra_presupuesto_rubro. Lo escribe orquestador/scripts/cargar-presupuesto-rubros.mjs.';

create table public.obra_presupuesto_rubro (
  obra_canonica_id text not null references public.obra_presupuesto_lectura(obra_canonica_id) on delete cascade,
  rubro            text not null check (rubro in ('mano_obra', 'materiales', 'subcontratistas', 'otros')),
  -- NULL = este rubro no tiene presupuesto (motivo dice por qué). 0 = el presupuesto lo previó en cero.
  monto            numeric,
  motivo           text,
  -- [{item, unidad, cantidad, importe, porque?, fuera_de_oferta?}] agregado por insumo o por ítem.
  detalle          jsonb not null default '[]'::jsonb,
  estimado         boolean not null default false,
  cita             text,
  primary key (obra_canonica_id, rubro),
  constraint obra_presupuesto_rubro_monto_o_motivo check (monto is not null or nullif(btrim(motivo), '') is not null),
  constraint obra_presupuesto_rubro_detalle_lista check (jsonb_typeof(detalle) = 'array')
);
comment on table public.obra_presupuesto_rubro is
  'El presupuesto de una obra abierto en los cuatro rubros (mano_obra, materiales, subcontratistas, otros), con el detalle de qué lo compone y la cita del documento. Monto NULL = sin presupuesto de ese rubro, con motivo.';
comment on column public.obra_presupuesto_rubro.rubro is
  'mano_obra: jornales propios + cargas · materiales: lo que se compra y queda en la obra · subcontratistas: trabajo de terceros · otros: equipos, combustible, fletes, servicios, honorarios.';

alter table public.obra_presupuesto_lectura enable row level security;
alter table public.obra_presupuesto_rubro enable row level security;
create policy obra_presupuesto_lectura_lee_quien_ve_economia on public.obra_presupuesto_lectura
  for select to authenticated using ((select public.ve_economia()));
create policy obra_presupuesto_rubro_lee_quien_ve_economia on public.obra_presupuesto_rubro
  for select to authenticated using ((select public.ve_economia()));
create policy obra_presupuesto_lectura_escribe_direccion on public.obra_presupuesto_lectura
  for all to authenticated
  using ((select public.current_rol()) in ('direccion', 'administracion'))
  with check ((select public.current_rol()) in ('direccion', 'administracion'));
create policy obra_presupuesto_rubro_escribe_direccion on public.obra_presupuesto_rubro
  for all to authenticated
  using ((select public.current_rol()) in ('direccion', 'administracion'))
  with check ((select public.current_rol()) in ('direccion', 'administracion'));
grant select, insert, update, delete on public.obra_presupuesto_lectura to authenticated;
grant select, insert, update, delete on public.obra_presupuesto_rubro to authenticated;
grant all on public.obra_presupuesto_lectura to service_role;
grant all on public.obra_presupuesto_rubro to service_role;

-- ── 3 · lo consumido por rubro, con su detalle ───────────────────────────────────────────────────
--
-- MISMA BASE QUE `costo_de_obras_a_la_fecha`: compras por `costo_de_obra_filas_iva` (a la fecha, neto
-- de IVA si se pide) y mano de obra por `costo_mo_de_obras`. Sólo agrupa distinto. El detalle:
--   materiales / otros   → por familia de Compras
--   subcontratistas      → por proveedor
--   mano_obra            → por quincena (personas, horas, real/estimado)
-- Devuelve nada a quien no ve economía: la misma puerta que `analiticas_costos`.
create or replace function public.costo_de_obras_por_rubro(p_obras text[], p_desde date default null, p_hasta date default null, p_neto boolean default true)
returns table (obra_id text, rubro text, monto numeric, monto_estimado numeric, n integer, detalle jsonb)
language sql
stable
set search_path to 'public'
as $$
  with
  ids as (
    select coalesce(p_obras, (select array_agg(o.obra_id) from public.obra_panel o)) as obras
  ),
  filas as materialized (
    select f.obra_id, f.fecha, f.a_la_fecha, f.proveedor,
           public.rubro_de_compra(f.es_subcontrato, s.familia_material, s.sub_rubro) as rubro,
           coalesce(nullif(btrim(s.familia_material), ''), nullif(btrim(s.sub_rubro), ''), 'sin familia') as familia
      from ids
      cross join lateral public.costo_de_obra_filas_iva(ids.obras, null, p_neto) f
      left join public.compra_sheet s on coalesce(s.sheet_id::text, s.fila::text) = f.referencia
     where (p_desde is null or f.fecha >= p_desde)
       and (p_hasta is null or f.fecha <= p_hasta)
  ),
  compras as (
    select f.obra_id, f.rubro, sum(f.a_la_fecha) as monto, null::numeric as monto_estimado, count(*)::int as n,
           (select coalesce(jsonb_agg(jsonb_build_object('grupo', g.grupo, 'n', g.n, 'monto', g.monto) order by g.monto desc), '[]'::jsonb)
              from (select case when x.rubro = 'subcontratistas' then coalesce(x.proveedor, 'sin proveedor') else x.familia end as grupo,
                           count(*)::int as n, sum(x.a_la_fecha) as monto
                      from filas x
                     where x.obra_id = f.obra_id and x.rubro = f.rubro
                     group by 1) g) as detalle
      from filas f
     group by f.obra_id, f.rubro
  ),
  mo_filas as materialized (
    select m.* from ids cross join lateral public.costo_mo_de_obras(ids.obras, p_desde, p_hasta) m
  ),
  mo_q as (
    select m.obra_canonica_id as obra_id, m.quincena_desde, m.quincena_hasta,
           count(distinct m.persona_id) filter (where m.estado <> 'falta_dato')::int as personas,
           sum(m.costo_total) filter (where m.estado <> 'falta_dato') as monto,
           sum(m.horas) filter (where m.estado <> 'falta_dato') as horas,
           sum(m.horas) filter (where m.estado = 'falta_dato') as horas_sin_dato,
           bool_or(m.estado = 'estimado') as estimado,
           sum(m.costo_total) filter (where m.estado = 'estimado') as monto_estimado
      from mo_filas m
     group by 1, 2, 3
  ),
  mo as (
    select q.obra_id, 'mano_obra'::text as rubro, sum(q.monto) as monto, nullif(sum(q.monto_estimado), 0) as monto_estimado,
           count(*)::int as n,
           jsonb_agg(jsonb_build_object(
             'grupo', to_char(q.quincena_desde, 'DD/MM') || ' a ' || to_char(q.quincena_hasta, 'DD/MM/YY'),
             'n', q.personas, 'monto', q.monto, 'horas', q.horas, 'estimado', q.estimado,
             'horas_sin_dato', nullif(q.horas_sin_dato, 0)) order by q.quincena_desde) as detalle
      from mo_q q
     group by q.obra_id
  )
  select t.obra_id, t.rubro, t.monto, t.monto_estimado, t.n, t.detalle
    from (select * from compras union all select * from mo) t
   where coalesce((select public.ve_economia()), false)
   order by t.obra_id, t.rubro
$$;
comment on function public.costo_de_obras_por_rubro(text[], date, date, boolean) is
  'Lo consumido por cada obra en los cuatro rubros (mano_obra, materiales, subcontratistas, otros), con detalle por familia/proveedor/quincena. Misma base que costo_de_obras_a_la_fecha; nada a quien no ve economía.';
revoke all on function public.costo_de_obras_por_rubro(text[], date, date, boolean) from public, anon;
grant execute on function public.costo_de_obras_por_rubro(text[], date, date, boolean) to authenticated, service_role;

-- ── 4 · `costo_de_obras_a_la_fecha` y `analiticas_consumo_mensual` abren «otros» ─────────────────
--
-- Lo único que cambia respecto de 20260917T1900: `materiales` deja de incluir lo que la regla de los
-- rubros manda a `otros` (alquileres, servicios, combustible, fletes) y aparecen `otros`, `n_otros`,
-- `otros_por_vencer`. Los subcontratos entran también por la familia «Subcontratos y mano de obra».
CREATE OR REPLACE FUNCTION public.costo_de_obras_a_la_fecha(p_obras text[], p_desde date, p_hasta date, p_neto boolean)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  with
  filas as (
    select f.*, public.rubro_de_compra(f.es_subcontrato, s.familia_material, s.sub_rubro) as rubro
      from public.costo_de_obra_filas_iva(p_obras, null, p_neto) f
      left join public.compra_sheet s on coalesce(s.sheet_id::text, s.fila::text) = f.referencia
     where (p_desde is null or f.fecha >= p_desde)
       and (p_hasta is null or f.fecha <= p_hasta)
  ),
  materiales as (
    select f.obra_id,
           sum(f.a_la_fecha) filter (where f.rubro = 'materiales')                   as materiales,
           sum(f.a_la_fecha) filter (where f.rubro = 'subcontratistas')              as subcontratos,
           sum(f.a_la_fecha) filter (where f.rubro = 'otros')                        as otros,
           count(*)          filter (where f.rubro = 'materiales')::int              as n_comprobantes,
           count(*)          filter (where f.rubro = 'subcontratistas')::int         as n_subcontratos,
           count(*)          filter (where f.rubro = 'otros')::int                   as n_otros,
           max(f.fecha)      filter (where f.rubro <> 'subcontratistas')             as ultimo_comprobante,
           count(*)          filter (where f.tomado_al_total)::int                   as n_sin_iva_discriminado,
           nullif(sum(f.por_vencer) filter (where f.rubro = 'materiales'), 0)        as materiales_por_vencer,
           nullif(sum(f.por_vencer) filter (where f.rubro = 'subcontratistas'), 0)   as subcontratos_por_vencer,
           nullif(sum(f.por_vencer) filter (where f.rubro = 'otros'), 0)             as otros_por_vencer,
           nullif(sum(f.por_vencer), 0)                                              as comprometido_futuro,
           jsonb_agg(jsonb_build_object(
                       'proveedor', f.proveedor, 'comprobante', f.comprobante, 'fecha', f.fecha,
                       'total', f.total, 'a_la_fecha', f.a_la_fecha, 'por_vencer', f.por_vencer,
                       'motivo', coalesce(f.motivo_subcontrato, 'familia'))
                     order by f.a_la_fecha desc)
             filter (where f.rubro = 'subcontratistas')                              as subcontratos_detalle
      from filas f
     group by f.obra_id
  ),
  mano_obra as (
    select m.obra_canonica_id as obra_id,
           sum(m.costo_total) filter (where m.estado <> 'falta_dato') as mano_obra,
           sum(m.costo_total) filter (where m.estado = 'real')        as mano_obra_real,
           sum(m.costo_total) filter (where m.estado = 'estimado')    as mano_obra_estimada,
           sum(m.horas)       filter (where m.estado <> 'falta_dato') as horas_valorizadas,
           sum(m.horas)       filter (where m.estado = 'falta_dato')  as horas_sin_tarifa,
           count(distinct m.persona_id) filter (where m.estado = 'falta_dato')::int as personas_sin_tarifa,
           jsonb_agg(jsonb_build_object('persona_id', m.persona_id, 'nombre', pe.nombre_completo,
                                        'quincena', m.quincena_desde, 'horas', m.horas, 'origen', m.origen)
                     order by m.quincena_desde, pe.nombre_completo)
             filter (where m.estado = 'falta_dato') as falta_dato,
           max(m.quincena_hasta) filter (where m.sellado_en is not null) as sellado_hasta
      from public.costo_mo_de_obras(p_obras, p_desde, p_hasta) m
      left join public.personas pe on pe.id = m.persona_id
     group by m.obra_canonica_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'obra_id', o.obra_id,
           'materiales', k.materiales, 'subcontratos', k.subcontratos, 'otros', k.otros,
           'n_comprobantes', k.n_comprobantes, 'n_subcontratos', coalesce(k.n_subcontratos, 0), 'n_otros', coalesce(k.n_otros, 0),
           'subcontratos_detalle', coalesce(k.subcontratos_detalle, '[]'::jsonb),
           'ultimo_comprobante', k.ultimo_comprobante,
           'comprometido_futuro', k.comprometido_futuro,
           'materiales_por_vencer', k.materiales_por_vencer, 'subcontratos_por_vencer', k.subcontratos_por_vencer,
           'otros_por_vencer', k.otros_por_vencer,
           'mano_obra', h.mano_obra, 'mano_obra_real', h.mano_obra_real,
           'mano_obra_estimada', h.mano_obra_estimada, 'horas_valorizadas', h.horas_valorizadas,
           'horas_sin_tarifa', h.horas_sin_tarifa, 'personas_sin_tarifa', coalesce(h.personas_sin_tarifa, 0),
           'falta_dato', coalesce(h.falta_dato, '[]'::jsonb), 'sellado_hasta', h.sellado_hasta,
           'puede_ver_tarifas', public.liquida_sueldos(),
           'corte', current_date)
           -- EL RANGO SÓLO VIAJA CUANDO LO HAY: sin él, la respuesta es idéntica a la de la firma vieja.
           || case when p_desde is null and p_hasta is null then '{}'::jsonb
                   else jsonb_build_object('desde', p_desde, 'hasta', p_hasta) end
           -- NETO SÓLO VIAJA CUANDO SE PIDE: sin él la respuesta es byte a byte la de antes.
           || case when p_neto then jsonb_build_object('neto_de_iva', true, 'n_sin_iva_discriminado', coalesce(k.n_sin_iva_discriminado, 0))
                   else '{}'::jsonb end), '[]'::jsonb)
    from (select distinct unnest(p_obras) as obra_id) o
    left join materiales k on k.obra_id = o.obra_id
    left join mano_obra h on h.obra_id = o.obra_id
   where k.obra_id is not null or h.obra_id is not null
$function$;

CREATE OR REPLACE FUNCTION public.analiticas_consumo_mensual(p_obras text[] DEFAULT NULL::text[])
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  with
  ids as (
    select coalesce(p_obras, (select array_agg(o.obra_id) from public.obra_panel o)) as obras
  ),
  compras as (
    select f.obra_id, date_trunc('month', f.fecha)::date as mes,
           sum(f.a_la_fecha) filter (where r.rubro = 'materiales')      as materiales,
           sum(f.a_la_fecha) filter (where r.rubro = 'subcontratistas') as subcontratos,
           sum(f.a_la_fecha) filter (where r.rubro = 'otros')           as otros
      from ids cross join lateral public.costo_de_obra_filas_iva(ids.obras, null, true) f
      left join public.compra_sheet s on coalesce(s.sheet_id::text, s.fila::text) = f.referencia
      cross join lateral (select public.rubro_de_compra(f.es_subcontrato, s.familia_material, s.sub_rubro) as rubro) r
     group by 1, 2
  ),
  mano_obra as (
    select m.obra_canonica_id as obra_id, date_trunc('month', m.quincena_desde)::date as mes,
           sum(m.costo_total) filter (where m.estado <> 'falta_dato') as mano_obra,
           sum(m.costo_total) filter (where m.estado = 'estimado')    as mano_obra_estimada
      from ids cross join lateral public.costo_mo_de_obras(ids.obras, null::date, null::date) m
     group by 1, 2
  )
  select case
    when not coalesce((select public.ve_economia()), false) then null::jsonb
    else (select coalesce(jsonb_agg(jsonb_build_object(
                   'obra_id', coalesce(c.obra_id, h.obra_id), 'mes', coalesce(c.mes, h.mes),
                   'materiales', c.materiales, 'subcontratos', c.subcontratos, 'otros', c.otros,
                   'mano_obra', h.mano_obra, 'mano_obra_estimada', h.mano_obra_estimada)
                 order by coalesce(c.obra_id, h.obra_id), coalesce(c.mes, h.mes)), '[]'::jsonb)
            from compras c
            full join mano_obra h on h.obra_id = c.obra_id and h.mes = c.mes)
  end
$function$;

-- ── 5 · la vista: contratado y presupuestado por rubro, por obra ─────────────────────────────────
--
-- CONTRATADO es `contratado_de_obra(obra)`, la misma función que `obra_panel.monto_contratado` y
-- `obra_economia.venta_contratada` (la ficha) y la misma regla que el CRM (contrato desglosado, si no
-- OBRAS, si no el formulario). `contratado_origen` dice por qué camino salió: una pantalla que no
-- quiera llamar precio a una `suma-viva` de Cobranzas lo decide con esa columna, no con otro número.
-- Los importes salen NULL a quien no ve economía (`contratado_de_obra` y las tablas ya lo hacen).
create view public.obra_economia_rubros with (security_invoker = true) as
with rubros as (
  select r.obra_canonica_id,
         jsonb_object_agg(r.rubro, jsonb_build_object(
           'monto', r.monto, 'motivo', r.motivo, 'estimado', r.estimado, 'cita', r.cita, 'detalle', r.detalle)) as por_rubro,
         max(r.monto) filter (where r.rubro = 'mano_obra')       as mano_obra,
         max(r.monto) filter (where r.rubro = 'materiales')      as materiales,
         max(r.monto) filter (where r.rubro = 'subcontratistas') as subcontratistas,
         max(r.monto) filter (where r.rubro = 'otros')           as otros,
         bool_or(r.estimado) as estimado
    from public.obra_presupuesto_rubro r
   group by r.obra_canonica_id
)
select oc.id                        as obra_canonica_id,
       oc.nombre,
       oc.cliente_id,
       oc.estado,
       oc.obra_padre_id,
       public.contratado_de_obra(oc.id) as contratado,
       e.contratado_usd,
       coalesce(e.contrato_fuente, e.origen, case when oc.monto_contratado is not null then 'formulario' end) as contratado_origen,
       e.referencia                 as contratado_referencia,
       e.contrato_mano_obra,
       e.contrato_mano_obra_usd,
       e.contrato_materiales,
       e.contrato_materiales_usd,
       e.contrato_total,
       e.contrato_fuente_drive_id,
       e.contrato_fuente_nombre,
       e.contrato_cita,
       e.tipo_cambio,
       l.estado                     as presupuesto_estado,
       l.motivo                     as presupuesto_motivo,
       l.costo_directo              as presupuestado_total,
       l.moneda                     as presupuesto_moneda,
       coalesce(r.estimado, l.estimado, false) as presupuesto_estimado,
       l.fuente_drive_id            as presupuesto_fuente_drive_id,
       l.fuente_nombre              as presupuesto_fuente_nombre,
       l.fuente_fecha               as presupuesto_fecha,
       l.fuente_modificado          as presupuesto_fuente_modificado,
       l.cita                       as presupuesto_cita,
       l.leido_en                   as presupuesto_leido_en,
       r.mano_obra                  as presupuestado_mano_obra,
       r.materiales                 as presupuestado_materiales,
       r.subcontratistas            as presupuestado_subcontratistas,
       r.otros                      as presupuestado_otros,
       coalesce(r.por_rubro, '{}'::jsonb) as presupuesto_rubros
  from public.obra_canonica oc
  left join public.obra_economia_cartera e on e.obra_canonica_id = oc.id
  left join public.obra_presupuesto_lectura l on l.obra_canonica_id = oc.id
  left join rubros r on r.obra_canonica_id = oc.id
 where oc.fusionada_en is null;
comment on view public.obra_economia_rubros is
  'Por obra: lo contratado (contratado_de_obra, la misma definición que obra_panel, la ficha y el CRM) y lo presupuestado en los cuatro rubros con su detalle y su documento. Lo consumido por rubro sale de costo_de_obras_por_rubro(...) porque lleva período.';
grant select on public.obra_economia_rubros to authenticated, service_role;
