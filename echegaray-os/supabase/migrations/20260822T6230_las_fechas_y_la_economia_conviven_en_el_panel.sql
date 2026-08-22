-- ═══ LAS FECHAS Y LA ECONOMÍA CONVIVEN EN EL PANEL (22/08/2026) ═══
--
-- Dos frentes del mismo día recrearon las mismas vistas sin verse: T6020 (fechas canónicas) colgó
-- `obra_panel` y `obra_plan_vs_real` de `obra_fechas`; T6210 (economía honesta) las volvió a crear
-- desde la forma anterior — retiró bien el falso margen y cableó las cobranzas, pero se llevó
-- puestas las fechas canónicas: la cabecera volvió a leer `obra_canonica` (el fin declarado a mano)
-- y las columnas de real/forecast desaparecieron. El mismo patrón que el auditor encontró en la
-- regla de caja: el que se aplica último se devora al otro. Esta migración es la UNIÓN DELIBERADA:
--
--   · de T6210: sin `margen_actual` ni `margen_sobre_contratado_pct` (no eran margen), certificado
--     y facturado de `certificados`, cobrado/por_cobrar de `obra_cobranza`, `costo_mano_de_obra`.
--   · de T6020: las fechas salen de `obra_fechas` (plan agregado, real por evidencia y nunca
--     futuro, forecast, declaradas rotuladas, SIN FECHA contado).

drop view if exists public.cliente_panel;
drop view if exists public.obra_plan_vs_real;
drop view if exists public.obra_panel;

create view public.obra_panel with (security_invoker = true) as
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
  ocr.costo_mano_de_obra,
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
  oc.created_at                        as creada_en
from public.obra_canonica oc
left join public.clientes cl on cl.id = oc.cliente_id
left join public.obra_costo_real ocr on ocr.obra_id = oc.id
left join public.obra_avance av on av.obra_id = oc.id
left join public.obra_fechas f on f.obra_id = oc.id;
comment on view public.obra_panel is
  'La cabecera de cada obra. Fechas de obra_fechas (fuente única: plan agregado, real por evidencia '
  'y nunca futuro, forecast, declaradas rotuladas); costo de obra_costo_real; avance de obra_avance. '
  'NO publica margen: el margen vive en obra_economia.';

create view public.obra_plan_vs_real with (security_invoker = true) as
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
  -- CERTIFICADO Y FACTURADO Y NADA MÁS: `cobrado` sale de `obra_cobranza` (20260822T6200).
  select c.obra_canonica_id as obra_id, sum(c.monto_certificado) as certificado,
         sum(c.monto_facturado) as facturado
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
  -- `margen_actual` NO ESTÁ Y NO VUELVE: contratado − gastado no es margen (20260822T6210).
  cert.certificado,
  cert.facturado,
  cob.cobrado,
  cob.cobrado_neto,
  case when public.es_administracion() and op.monto_contratado is not null
    then op.monto_contratado - coalesce(cert.certificado, 0) end as pendiente_certificar,
  cob.por_cobrar_proyectado,
  cob.n_cobranzas,
  -- ── el real, el forecast y lo que no tiene fecha (20260822T6020) ──
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
left join public.obra_cobranza cob on cob.obra_id = op.obra_id
left join public.obra_fechas f on f.obra_id = op.obra_id;
comment on view public.obra_plan_vs_real is
  'Plan contra real de cada obra: plazo (de obra_fechas), avance, HH, costo y ciclo comercial. NO '
  'publica margen — margen_actual (contratado − costo real) se retiró el 22/08 por no ser margen; el '
  'margen vive en obra_economia. cobrado y por_cobrar_proyectado salen de obra_cobranza.';

create view public.cliente_panel with (security_invoker = true) as
select
  c.id                                 as cliente_id,
  c.slug,
  c.nombre_comercial,
  c.razon_social,
  c.cuit,
  c.direccion,
  c.telefono,
  c.email,
  c.responsable_id,
  p.nombre                             as responsable_nombre,
  c.drive_carpeta_id,
  c.activo,
  c.notas,
  count(op.obra_id)::integer           as n_obras,
  count(op.obra_id) filter (where op.estado = 'activa')::integer as n_obras_activas,
  sum(op.monto_contratado)             as contratado,
  sum(op.costo_real)                   as costo_real,
  sum(op.restricciones_abiertas)::integer as restricciones_abiertas,
  max(op.avance_sincronizado_en)       as avance_sincronizado_en,
  (select count(*)::integer from public.cliente_contacto ct where ct.cliente_id = c.id) as n_contactos,
  (select count(*)::integer from public.cliente_documento cd where cd.cliente_id = c.id) as n_documentos
from public.clientes c
left join public.perfiles p on p.id = c.responsable_id
left join public.obra_panel op on op.cliente_id = c.id
group by c.id, c.slug, c.nombre_comercial, c.razon_social, c.cuit, c.direccion, c.telefono, c.email,
         c.responsable_id, p.nombre, c.drive_carpeta_id, c.activo, c.notas;

grant select on public.obra_panel, public.obra_plan_vs_real, public.cliente_panel
  to authenticated, service_role;
