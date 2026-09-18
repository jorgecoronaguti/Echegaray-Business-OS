-- UNA SOLA DEFINICIÓN DEL MARGEN COTIZADO, LAS HORAS DEL DOCUMENTO Y LA PUERTA DE LOS COSTOS (18/09/2026).
--
-- ═══ D1: «MARGEN COTIZADO» DABA DOS NÚMEROS ═══
--
-- Quattropani: la ficha decía $ 45.683.167 · 32,8 % (`obra_economia`, resta gastos generales) y el chat
-- $ 55.581.395 · 39,9 % (contratado − presupuestado, sin gastos generales). Playón de azufre, $ 36,6 M
-- contra $ 52,6 M. La definición vive ahora UNA vez, en `obra_economia_rubros.margen_cotizado`:
-- contratado − costo directo presupuestado − gastos generales de la cotización. La ficha y el chat la leen.
--
-- ═══ D6: «LA COTIZACIÓN NO PREVIÓ HORAS» CON 3.900 HS EN LA LISTA ═══
--
-- La vista tomaba `presupuestos.hh_estimada`, nulo en Quattropani, Entrepiso, Le Comedor y Pisos 120,
-- mientras el detalle listaba las horas del documento. `obra_presupuesto_lectura.hh_cotizadas` guarda la
-- suma que el cargador lee ítem por ítem (unidad «hs»; las cargas sociales «hr» no son horas).
--
-- ═══ LA PUERTA DE `costo_de_obras_por_rubro` ES LA DE LOS COSTOS ═══
--
-- Era `ve_economia()`: la ficha de la obra va a leer el consumido de acá, y el jefe de obra ve los costos
-- de su obra (regla del 19/08, confirmada hoy en 20260918T0910 del jefe). Pasa a
-- `es_administracion() or ve_economia()`. La mano de obra sigue detrás de su propia puerta
-- (`costo_mo_quincena`: liquida_sueldos o ve_economia).
--
-- Todo lo que cambia acá lo lee SÓLO esta rama. `contrato_cita` y `contrato_nota` se siguen leyendo de
-- `obra_economia_cartera`, que los enmascara con `ve_economia()` (20260918T1100): la máscara se conserva.
set local lock_timeout = '5s';

alter table public.obra_presupuesto_lectura add column if not exists hh_cotizadas numeric;
comment on column public.obra_presupuesto_lectura.hh_cotizadas is
  'Horas hombre que implica el costo cotizado: Σ cantidad × coeficiente × horas por unidad de los insumos en «hs» (sin cargas sociales «hr»). En un ítem cotizado en dólares el coeficiente es el tipo de cambio y no multiplica las horas.';

create or replace view public.obra_economia_rubros with (security_invoker = true) as
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
),
aprob as (
  select p.obra_canonica_id, p.hh_estimada, p.costo_indirecto_presupuestado
    from public.presupuestos p
   where p.estado = 'aprobado' and p.obra_canonica_id is not null
)
select oc.id                        as obra_canonica_id,
       oc.nombre,
       oc.cliente_id,
       oc.estado,
       oc.obra_padre_id,
       public.contratado_de_obra(oc.id) as contratado,
       e.contratado_usd,
       coalesce(e.contrato_fuente, e.origen, case when e.obra_canonica_id is null and public.contratado_de_obra(oc.id) is not null then 'formulario' end) as contratado_origen,
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
       coalesce(r.por_rubro, '{}'::jsonb) as presupuesto_rubros,
       -- LAS HORAS SON LAS DEL DOCUMENTO (D6): Σ de las horas de oficial y ayudante que el cargador leyó
       -- ítem por ítem. `presupuestos.hh_estimada` queda sólo de respaldo (Pisos 120, sin lectura por insumo).
       coalesce(l.hh_cotizadas, nullif(h.hh_estimada, 0))::numeric(10,2) as presupuesto_hh,
       case when l.hh_cotizadas is not null then 'documento' when nullif(h.hh_estimada, 0) is not null then 'presupuestos' end as presupuesto_hh_origen,
       -- ═══ EL MARGEN COTIZADO: UNA SOLA DEFINICIÓN (D1, 18/09/2026) ═══
       -- contratado − costo directo presupuestado − gastos generales de la cotización. Es la única cifra
       -- que la app llama «margen cotizado»: la ficha de la obra y el chat la leen de acá. Sin alguna de
       -- las tres patas —o con un contratado que es la suma viva de Cobranzas— es NULL, nunca un número
       -- parcial.
       h.costo_indirecto_presupuestado as gastos_generales_cotizados,
       case when l.estado = 'leido' and public.contratado_de_obra(oc.id) is not null
             and coalesce(e.origen, '') <> 'suma-viva' and h.costo_indirecto_presupuestado is not null
            then public.contratado_de_obra(oc.id) - l.costo_directo - h.costo_indirecto_presupuestado
       end as margen_cotizado
  from public.obra_canonica oc
  left join public.obra_economia_cartera e on e.obra_canonica_id = oc.id
  left join public.obra_presupuesto_lectura l on l.obra_canonica_id = oc.id
  left join rubros r on r.obra_canonica_id = oc.id
  left join aprob h on h.obra_canonica_id = oc.id
 where oc.fusionada_en is null;
grant select on public.obra_economia_rubros to authenticated, service_role;

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
           public.rubro_de_compra(f.es_subcontrato, s.familia_material, s.sub_rubro, concat_ws(' ', f.concepto, f.detalle_obra), f.proveedor) as rubro,
           coalesce(nullif(nullif(btrim(s.familia_material), ''), 'SIN CLASIFICAR'), nullif(btrim(s.sub_rubro), ''), 'SIN CLASIFICAR en Compras') as familia
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
   where coalesce((select public.es_administracion()), false) or coalesce((select public.ve_economia()), false) or (select auth.uid()) is null
   order by t.obra_id, t.rubro
$$;
