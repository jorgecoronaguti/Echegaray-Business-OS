-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- LA COLUMNA «OBRA ACTUAL» MOSTRABA EL IDENTIFICADOR DE LA URL, NO EL NOMBRE DE LA OBRA
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- Se vio en la captura del listado de Personal: decía `limpieza-de-escombros` donde el dueño lee
-- «Limpieza de Escombros». `obra_canonica.id` es un slug —sirve para la URL y para las claves
-- foráneas— y NO es algo que se le muestre a nadie: en el resto del OS (el portafolio, el Gantt, la
-- ficha del cliente) la obra siempre aparece por su nombre.
--
-- El nombre se agrega A LA VISTA y no se resuelve en la pantalla: si cada pantalla hiciera su propio
-- join, la que se olvide seguiría mostrando el slug y nadie lo notaría hasta ver una captura.
--
-- `security_invoker = true` SE REPITE: Postgres NO lo hereda de la definición anterior, y una vista
-- que lo pierde saltea el RLS de sus tablas. Es exactamente cómo `cliente_panel` volvió a filtrar.

-- ═══ POR QUÉ VA `drop` Y NO `create or replace` ═══
--
-- Postgres deja AGREGAR columnas al final de una vista con `create or replace`, pero no deja
-- INSERTAR una en el medio: lo lee como renombrar las que vienen después y lo rechaza
-- («cannot change name of view column "rol_en_obra" to "obra_actual"»). La columna nueva va al lado
-- de `obra_actual_id`, donde se lee, y no al final por comodidad del motor.
drop view if exists public.persona_directorio;
create view public.persona_directorio
with (security_invoker = true) as
select
  p.id,
  p.nombre_completo,
  p.categoria,
  p.especialidad,
  p.puesto,
  p.fecha_ingreso,
  p.fecha_egreso,
  ci.cuadrilla_id,
  cu.nombre as cuadrilla,
  a.obra_id as obra_actual_id,
  oc.nombre as obra_actual,
  a.rol     as rol_en_obra,
  a.desde   as asignada_desde
from public.personas p
-- La cuadrilla vigente. Es UNA por el índice único `cuadrilla_integrante_una_vigente`.
left join public.cuadrilla_integrante ci on ci.persona_id = p.id and ci.hasta is null
left join public.cuadrilla cu on cu.id = ci.cuadrilla_id
-- La asignación vigente. Si hubiera más de una (alguien repartido entre dos obras) se muestra la
-- más reciente y el resto se ve en la ficha: la columna del listado tiene lugar para una sola.
left join lateral (
  select oa.obra_id, oa.rol, oa.desde
  from public.obra_asignacion oa
  where oa.persona_id = p.id and public.asignacion_vigente(oa.desde, oa.hasta)
  order by oa.desde desc nulls last, oa.creado_en desc
  limit 1
) a on true
left join public.obra_canonica oc on oc.id = a.obra_id;

comment on view public.persona_directorio is
  'El listado de Personal: quién es, su cuadrilla vigente y su obra actual DERIVADA de la asignación vigente. Sin DNI, CUIL ni sueldo.';

grant select on public.persona_directorio to authenticated;
