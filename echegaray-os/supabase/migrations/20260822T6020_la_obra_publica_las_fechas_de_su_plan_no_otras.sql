-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- LA CABECERA Y EL RESUMEN DEJAN DE DECIR DOS FECHAS DISTINTAS DE LA MISMA OBRA
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- ═══ LO QUE SE MIDIÓ EN LA BASE PRODUCTIVA (22/08/2026) ═══
--
-- La cabecera de la ficha muestra «Fin plan» leyendo `obra_panel.fecha_fin_plan`, que es la columna
-- `obra_canonica.fecha_fin_plan` escrita a mano en el formulario. El bloque «Plan vs real» del
-- Resumen, tres centímetros más abajo, muestra «fin previsto» leyendo `obra_plan_vs_real.fin_plan`,
-- que es `max(fin_plan)` de las actividades. Sobre las 11 obras con plan cargado, las dos fechas
-- difieren en 8:
--
--     san-francisco          cabecera 30/01/2026   ·   plan de actividades 27/08/2026   (7 meses)
--     le-comedor             cabecera 03/07/2026   ·   plan de actividades 04/08/2026
--     quattropani            cabecera 19/12/2026   ·   plan de actividades 22/08/2026
--
-- Ninguna de las dos está «rota»: cada una es correcta según su propia cuenta. Eso es exactamente
-- lo que este sistema tiene prohibido — dos verdades sin un error.
--
-- Y `fecha_inicio_real`/`fecha_fin_real` de la obra son campos de un formulario: `instalacion-
-- electrica` declara inicio real 24/08/2026 con fecha de hoy 22/08. Una obra que arrancó pasado
-- mañana. Cinco obras más declaran fin real futuro (28/08, 30/09, 31/10) copiando el plan.
--
-- ═══ LA REGLA ═══
--
-- Cuando la obra TIENE plan, el plan de la obra ES el de sus actividades: la envolvente. El campo
-- del formulario queda como respaldo para la obra que todavía no tiene ni una actividad con fecha,
-- y se sigue publicando aparte (`*_declarado`) para poder mostrarlo rotulado sin confundirlo.
--
-- El REAL de la obra sale de la evidencia de sus actividades (partes e imputaciones). Se acepta el
-- declarado SÓLO si no hay evidencia y la fecha NO es futura: a nivel obra el dato declarado suele
-- ser el acta de inicio, que es un hecho; a nivel actividad era el arrastre del Sheet, que no lo
-- es. Futuro nunca, por ningún camino: eso lo filtra la fuente, no la pantalla.
--
-- El FIN REAL de la obra exige que no quede trabajo abierto: mientras una actividad viva no esté
-- terminada, la obra no terminó, diga lo que diga el formulario.

create or replace view public.obra_fechas with (security_invoker = true) as
with act as (
  select
    f.obra_id,
    min(f.inicio_plan)                                          as inicio_plan,
    max(f.fin_plan)                                             as fin_plan,
    min(f.inicio_base)                                          as inicio_base,
    max(f.fin_base)                                             as fin_base,
    min(f.inicio_real)                                          as inicio_real,
    max(f.fin_real)                                             as fin_real,
    max(f.forecast_fin)                                         as forecast_fin,
    count(*)                                                    as n_actividades,
    count(*) filter (where f.tiene_fecha_plan)                  as con_fecha_plan,
    count(*) filter (where not f.tiene_fecha)                   as sin_fecha,
    count(*) filter (where f.sellada_en is not null)            as con_baseline,
    -- ATRASADA: el plan venció y EL TRABAJO no está hecho. `terminada` mira el avance medido —la
    -- misma definición que publica la vista de control— y no el `pct` escrito a mano: Comedor,
    -- Galpón 9 y San Francisco tenían cada uno una actividad contada como atrasada que la medición
    -- ya daba al 100 %.
    count(*) filter (where f.tipo <> 'resumen'
                       and f.fin_plan is not null
                       and f.fin_plan < current_date
                       and not f.terminada)                      as atrasadas,
    count(*) filter (where f.tipo <> 'resumen' and not f.terminada) as abiertas
  from public.actividad_fechas f
  where not f.archivada
  group by f.obra_id
)
select
  o.id                                                          as obra_id,
  coalesce(a.inicio_plan, o.fecha_inicio_plan)                  as inicio_plan,
  coalesce(a.fin_plan,    o.fecha_fin_plan)                     as fin_plan,
  a.inicio_base,
  a.fin_base,
  -- REAL: el arranque es el HECHO MÁS TEMPRANO de los dos, no el que llegó primero al modelo. San
  -- Francisco tiene partes desde el 30/06/2026 y acta de inicio declarada el 27/06/2025: la obra
  -- arrancó en 2025 y los partes empezaron a cargarse un año después. Quedarse con la evidencia
  -- habría borrado un año de obra; quedarse con el declarado, la evidencia de las que no lo tienen.
  least(a.inicio_real,
        case when o.fecha_inicio_real <= current_date then o.fecha_inicio_real end)   as inicio_real,
  case
    when coalesce(a.abiertas, 0) > 0 then null
    when a.fin_real is not null then a.fin_real
    when o.fecha_fin_real <= current_date then o.fecha_fin_real
  end                                                           as fin_real,
  greatest(a.forecast_fin, coalesce(a.fin_plan, o.fecha_fin_plan)) as forecast_fin,
  case
    when a.inicio_plan is not null or a.fin_plan is not null then 'plan de actividades'
    when o.fecha_inicio_plan is not null or o.fecha_fin_plan is not null then 'declarado en la obra'
  end                                                           as origen_fechas_plan,
  case
    when a.inicio_real is not null and (o.fecha_inicio_real is null or o.fecha_inicio_real > current_date
                                        or a.inicio_real <= o.fecha_inicio_real)
      then 'evidencia de las actividades'
    when o.fecha_inicio_real <= current_date then 'declarado en la obra'
  end                                                           as origen_inicio_real,
  o.fecha_inicio_plan                                           as inicio_plan_declarado,
  o.fecha_fin_plan                                              as fin_plan_declarado,
  o.fecha_inicio_real                                           as inicio_real_declarado,
  o.fecha_fin_real                                              as fin_real_declarado,
  coalesce(a.n_actividades, 0)::integer                         as n_actividades,
  coalesce(a.con_fecha_plan, 0)::integer                        as n_con_fecha_plan,
  coalesce(a.sin_fecha, 0)::integer                             as n_sin_fecha,
  coalesce(a.con_baseline, 0)::integer                          as n_con_baseline,
  coalesce(a.atrasadas, 0)::integer                             as n_atrasadas,
  coalesce(a.abiertas, 0)::integer                              as n_abiertas
from public.obra_canonica o
left join act a on a.obra_id = o.id;

grant select on public.obra_fechas to authenticated, service_role;

comment on view public.obra_fechas is
  'FUENTE ÚNICA de las fechas de una obra: la envolvente de actividad_fechas cuando hay plan, el '
  'campo declarado como respaldo, real sólo con evidencia o declaración pasada, nunca futuro.';

-- ── El portafolio y la cabecera de la ficha ───────────────────────────────────────────────────
-- Mismos nombres, mismo orden, mismos tipos (hay vistas colgadas: `cliente_panel`,
-- `obra_plan_vs_real`). Cambia de dónde sale el valor, y se agregan al final el declarado y el
-- forecast para poder mostrarlos rotulados.
create or replace view public.obra_panel with (security_invoker = true) as
select
  oc.id                                as obra_id,
  oc.nombre,
  oc.cliente_id,
  cl.slug                              as cliente_slug,
  coalesce(cl.nombre_comercial, oc.cliente_texto) as cliente_nombre,
  oc.cliente_texto,
  oc.estado,
  oc.tipo,
  oc.etapa,
  oc.jefe_obra,
  oc.orden,
  public.contratado_de_obra(oc.id)     as monto_contratado,
  f.inicio_plan                        as fecha_inicio_plan,
  f.fin_plan                           as fecha_fin_plan,
  f.inicio_real                        as fecha_inicio_real,
  f.fin_real                           as fecha_fin_real,
  oc.drive_carpeta_id,
  ocr.costo_real,
  ocr.n_comprobantes,
  case when public.contratado_de_obra(oc.id) > 0 and coalesce(ocr.costo_real, 0) > 0
    then round((public.contratado_de_obra(oc.id) - ocr.costo_real) / public.contratado_de_obra(oc.id) * 100, 1)
  end                                  as margen_sobre_contratado_pct,
  av.avance_pct,
  av.n_medidas::integer                as n_actividades_medidas,
  av.n_actividades::integer            as n_actividades,
  av.n_sin_planificar::integer         as n_actividades_sin_planificar,
  av.sincronizado_en                   as avance_sincronizado_en,
  (select count(*)::integer from public.obra_restriccion r
    where r.obra_id = oc.id and r.estado <> 'liberada')                       as restricciones_abiertas,
  (select count(*)::integer from public.obra_restriccion r
    where r.obra_id = oc.id and r.estado <> 'liberada'
      and r.fecha_compromiso is not null and r.fecha_compromiso < current_date) as restricciones_vencidas,
  f.inicio_plan_declarado              as fecha_inicio_plan_declarado,
  f.fin_plan_declarado                 as fecha_fin_plan_declarado,
  f.inicio_real_declarado              as fecha_inicio_real_declarado,
  f.fin_real_declarado                 as fecha_fin_real_declarado,
  f.origen_fechas_plan,
  f.origen_inicio_real,
  f.forecast_fin,
  f.n_sin_fecha                        as n_actividades_sin_fecha,
  -- La línea de tiempo del CLIENTE leía `obra_canonica` directo para dibujar «arrancó la obra»: con
  -- el campo declarado publicaba un arranque futuro en el CRM. Ahora lee de acá, y necesita el alta
  -- de la obra junto con las fechas.
  oc.created_at                        as creada_en
from public.obra_canonica oc
left join public.clientes cl on cl.id = oc.cliente_id
left join public.obra_costo_real ocr on ocr.obra_id = oc.id
left join public.obra_avance av on av.obra_id = oc.id
left join public.obra_fechas f on f.obra_id = oc.id;

-- ── Plan contra real de la obra ───────────────────────────────────────────────────────────────
-- El CTE `plazo` desaparece: era la tercera definición del plazo de la obra. Ahora las cuatro
-- fechas, el desvío y las cuentas de actividades salen de `obra_fechas`.
create or replace view public.obra_plan_vs_real with (security_invoker = true) as
with hh as (
  select r.obra_canonica_id as obra_id, sum(r.horas) as hh_real
  from public.registros_hh r where r.obra_canonica_id is not null group by 1
), hh_plan as (
  select a.obra_id, sum(a.hh_plan) as hh_plan
  from public.obra_actividad a where a.hh_plan is not null and not a.archivada group by 1
), pres as (
  select distinct on (p.obra_canonica_id)
    p.obra_canonica_id as obra_id, p.id as presupuesto_id,
    public.presupuesto_monto(p.id) as monto_presupuestado,
    p.costo_directo_presupuestado,
    public.presupuesto_margen(p.id) as margen_esperado,
    p.hh_estimada
  from public.presupuestos p where p.obra_canonica_id is not null
  order by p.obra_canonica_id, (p.estado = 'aprobado') desc, p.version desc
), cert as (
  select c.obra_canonica_id as obra_id, sum(c.monto_certificado) as certificado,
         sum(c.monto_facturado) as facturado, sum(c.monto_cobrado) as cobrado
  from public.certificados c where c.obra_canonica_id is not null group by 1
)
select
  op.obra_id,
  op.nombre,
  op.cliente_id,
  op.cliente_nombre,
  op.estado,
  op.etapa,
  f.inicio_plan,
  f.fin_plan,
  f.inicio_base,
  f.fin_base,
  case when f.fin_base is not null and f.fin_plan is not null then f.fin_plan - f.fin_base end as desvio_plazo_dias,
  f.n_atrasadas                        as actividades_atrasadas,
  f.n_con_baseline                     as actividades_con_baseline,
  op.avance_pct,
  op.n_actividades_medidas,
  op.n_actividades,
  hh_plan.hh_plan,
  pres.hh_estimada,
  hh.hh_real,
  case when coalesce(hh_plan.hh_plan, pres.hh_estimada) > 0 and hh.hh_real is not null
    then round((hh.hh_real - coalesce(hh_plan.hh_plan, pres.hh_estimada)) / coalesce(hh_plan.hh_plan, pres.hh_estimada) * 100, 1)
  end                                  as desvio_hh_pct,
  pres.presupuesto_id,
  pres.monto_presupuestado,
  pres.costo_directo_presupuestado     as costo_presupuestado,
  op.costo_real,
  case when pres.costo_directo_presupuestado > 0 and op.costo_real > 0
    then round((op.costo_real - pres.costo_directo_presupuestado) / pres.costo_directo_presupuestado * 100, 1)
  end                                  as desvio_costo_pct,
  op.monto_contratado,
  pres.margen_esperado,
  case when op.monto_contratado > 0 and op.costo_real > 0 then op.monto_contratado - op.costo_real end as margen_actual,
  cert.certificado,
  cert.facturado,
  cert.cobrado,
  case when public.es_administracion() and op.monto_contratado is not null
    then op.monto_contratado - coalesce(cert.certificado, 0) end as pendiente_certificar,
  coalesce(cert.certificado, 0) - coalesce(cert.cobrado, 0)      as pendiente_cobrar,
  -- ── LO NUEVO: el real, el forecast y lo que no tiene fecha ──
  f.inicio_real,
  f.fin_real,
  f.forecast_fin,
  case when f.fin_plan is not null and f.forecast_fin is not null
    then f.forecast_fin - f.fin_plan end as desvio_forecast_dias,
  f.n_sin_fecha                        as actividades_sin_fecha,
  f.origen_fechas_plan,
  f.fin_plan_declarado
from public.obra_panel op
left join hh on hh.obra_id = op.obra_id
left join hh_plan on hh_plan.obra_id = op.obra_id
left join pres on pres.obra_id = op.obra_id
left join cert on cert.obra_id = op.obra_id
left join public.obra_fechas f on f.obra_id = op.obra_id;
