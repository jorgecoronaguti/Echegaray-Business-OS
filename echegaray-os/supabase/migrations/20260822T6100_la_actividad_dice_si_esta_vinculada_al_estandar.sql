-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- LA ACTIVIDAD DICE SI ESTÁ VINCULADA AL ESTÁNDAR — Y EL DEFAULT ES «NO»
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- ═══ EL HECHO MEDIDO EN LA BASE VIVA (22/08/2026) ═══
--
--   obra                 actividades   con tarea_tipo   con análisis   con cantidad   con hh_plan
--   san-francisco            124             0               0              0             0
--   quattropani              108             0               0              1             0
--   messina                   43             0               0              0             0
--   le-comedor                39             0               0              0             0
--   …
--
-- CERO. Las 350 actividades reales de la empresa entraron por el tracker de Drive
-- (`fuente='avances_de_obra_drive'`) y el motor nuevo —`tarea_tipo` + `analisis` + la vista
-- `estandar_productivo`, 199 tareas tipo cargadas— no conoce ninguna. No es que estén mal
-- vinculadas: no hay vínculo, y hasta hoy tampoco había manera de VER que no lo hay.
--
-- Ese es el defecto que esta migración arregla, y no es cosmético. Sin `tarea_tipo_id`:
--   · lo que la obra aprende no le enseña nada a la base maestra (el histórico se arma por tarea
--     tipo, no por nombre) — ya lo dice la solapa Rendimiento del panel;
--   · no hay hs/unidad contra la cual comparar, así que no hay desvío de rendimiento;
--   · y `hh_plan` queda en NULL para siempre, que es lo que hoy pasa en las 350.
--
-- ═══ POR QUÉ NO SE VINCULA NADA AUTOMÁTICAMENTE ACÁ ═══
--
-- Un `update ... from tarea_tipo t where lower(t.nombre) = lower(a.nombre)` engancharía 12 de 350 y
-- dejaría escrito en la base un vínculo que nadie miró. Un análisis colgado de la actividad
-- equivocada es peor que ninguno: el segundo se busca, el primero se cree — la misma regla que
-- gobierna `cruce-cheque-factura.mjs` y `documentacion-obra-vinculo.mjs`. Acá se MODELA el estado y
-- se hace visible; vincular es un acto de una persona (ver `actionsVinculacion.ts`) o una sugerencia
-- con su evidencia a la vista (ver 20260822T6110).
--
-- ═══ LOS CUATRO ESTADOS, Y POR QUÉ SON CUATRO Y NO DOS ═══
--
--   no_aplica     · la fila no es una tarea (`tipo` = 'resumen'/'hito') o es TIEMPO TÉCNICO. Un
--                   fragüe de hormigón no tiene rendimiento: consume días, no horas hombre.
--                   Pintarlo de «sin vincular» llenaría la pantalla de deuda falsa y el control
--                   dejaría de mirarse — que es exactamente cómo muere un control.
--   sin_vincular  · el DEFAULT. Una tarea de verdad sin `tarea_tipo_id`.
--   sin_analisis  · tiene tarea tipo pero no dice DE QUÉ ANÁLISIS saca el estándar. No es lo mismo:
--                   ya se sabe qué se está haciendo, falta con qué variante se mide. Una tarea tipo
--                   puede tener varias vigentes a la vez desde T4100 (PNC80 y PNC140), así que
--                   elegir una por el sistema sería elegir un rendimiento por la persona.
--   vinculada     · tarea tipo Y análisis.
--
-- ═══ LA COHERENCIA LA IMPONE LA BASE, NO LA COSTUMBRE ═══
--
-- `obra_actividad` tiene las dos FK sueltas: `tarea_tipo_id` → `tarea_tipo` y `analisis_id` →
-- `analisis`. Nada impedía que apuntaran a cosas distintas — una actividad «Tabique PNC» con el
-- análisis de «Contrapiso»— y la pantalla lo mostraría como vinculada. Un campo que forma parte de
-- la identidad del vínculo lo tiene que exigir la base.

-- ── 1 · el estado, como función pura ──────────────────────────────────────────────────────────
--
-- Función y no un CASE metido adentro de la vista: el mismo estado lo van a leer la vista, el panel
-- de la tarea y el test. Tres CASE iguales en tres lugares son tres definiciones del mismo concepto,
-- y el día que se agregue un estado sólo se entera uno.
create or replace function public.estado_vinculacion_actividad(
  p_tipo            text,
  p_tiempo_tecnico  boolean,
  p_tarea_tipo_id   uuid,
  p_analisis_id     uuid
) returns text
language sql immutable parallel safe as $$
  select case
    when coalesce(p_tipo, 'tarea') <> 'tarea'   then 'no_aplica'
    when coalesce(p_tiempo_tecnico, false)      then 'no_aplica'
    when p_tarea_tipo_id is null                then 'sin_vincular'
    when p_analisis_id  is null                 then 'sin_analisis'
    else 'vinculada'
  end
$$;

comment on function public.estado_vinculacion_actividad(text, boolean, uuid, uuid) is
  'El estado de vinculación de una actividad con el motor de estándares. no_aplica (no es una '
  'tarea, o es tiempo técnico: un fragüe no tiene rendimiento) · sin_vincular (el DEFAULT: nadie '
  'dijo qué tarea tipo es) · sin_analisis (se sabe qué tarea es, falta con qué variante se mide) · '
  'vinculada. Espejo exacto de estadoVinculacion() en features/obras/services/vinculacionEstandar.ts.';

grant execute on function public.estado_vinculacion_actividad(text, boolean, uuid, uuid) to authenticated;
grant execute on function public.estado_vinculacion_actividad(text, boolean, uuid, uuid) to service_role;

-- ── 2 · el vínculo no puede apuntar a dos tareas distintas ────────────────────────────────────
create or replace function public.obra_actividad_vinculo_coherente()
returns trigger language plpgsql as $$
declare
  v_tt uuid;
begin
  if new.analisis_id is null then
    return new;
  end if;

  select a.tarea_tipo_id into v_tt from public.analisis a where a.id = new.analisis_id;

  -- EL ANÁLISIS MANDA CUANDO LA ACTIVIDAD NO DICE NADA. Completar en vez de rechazar: quien carga
  -- un análisis ya eligió la tarea tipo —el análisis pertenece a una sola—, y exigir que además la
  -- repita convertiría un dato derivable en un motivo de error.
  if new.tarea_tipo_id is null then
    new.tarea_tipo_id := v_tt;
    return new;
  end if;

  if v_tt is distinct from new.tarea_tipo_id then
    raise exception
      'el análisis % es de la tarea tipo % y la actividad dice ser de la %: un vínculo que apunta a dos tareas distintas se lee como vinculado y mide otra cosa',
      new.analisis_id, v_tt, new.tarea_tipo_id
      using errcode = 'check_violation';
  end if;

  return new;
end $$;

comment on function public.obra_actividad_vinculo_coherente() is
  'Impide que obra_actividad.analisis_id y obra_actividad.tarea_tipo_id apunten a tareas distintas '
  '—la pantalla lo mostraría como «vinculada» y el rendimiento se compararía contra el estándar de '
  'otra tarea— y completa tarea_tipo_id desde el análisis cuando la actividad no lo declara.';

drop trigger if exists obra_actividad_vinculo_coherente_t on public.obra_actividad;
create trigger obra_actividad_vinculo_coherente_t
  before insert or update of analisis_id, tarea_tipo_id on public.obra_actividad
  for each row execute function public.obra_actividad_vinculo_coherente();

-- ── 3 · la vista que publica el estado y lo que el estándar aportaría ─────────────────────────
--
-- Vista NUEVA y no una columna más en `obra_actividad_control`: esa vista ya tiene 60 columnas y
-- diez LATERAL, y agregarle una obliga a reescribirla entera en cada cambio (CREATE OR REPLACE no
-- admite reordenar ni quitar). Ésta se lee sola, por actividad, y sólo cuando hace falta.
--
-- `hh_plan_sugerida` es SUGERENCIA, no plan: se publica únicamente cuando hay las tres puntas
-- (estándar + cantidad + hh_plan todavía vacío) y las unidades coinciden. m² y m³ NO se convierten
-- —el factor es el espesor, que no está en ninguna de las dos filas—, misma regla que ya aplica
-- `compararComputoContraPlan`. Cuando falta una punta va NULL y `motivo_sin_sugerencia` dice cuál:
-- un 0 en su lugar se leería como «este trabajo no lleva horas».
create or replace view public.obra_actividad_vinculacion
with (security_invoker = true) as
select
  a.obra_id,
  a.id                                    as actividad_id,
  a.nombre,
  a.codigo,
  a.tipo,
  a.tiempo_tecnico,
  a.archivada,
  public.estado_vinculacion_actividad(a.tipo, a.tiempo_tecnico, a.tarea_tipo_id, a.analisis_id)
                                          as estado,
  a.tarea_tipo_id,
  t.codigo                                as tarea_tipo_codigo,
  t.nombre                                as tarea_tipo_nombre,
  a.analisis_id,
  an.variante,
  an.version                              as analisis_version,
  -- Un análisis vinculado que dejó de ser el vigente NO es un error: es la versión con la que se
  -- planificó. Se publica el hecho para que la pantalla pueda ofrecer revisarlo, no para pisarlo.
  an.vigente                              as analisis_vigente,
  a.unidad                                as unidad_actividad,
  t.unidad                                as unidad_estandar,
  a.cantidad_objetivo,
  a.hh_plan,
  e.hh_por_unidad,
  case
    when e.hh_por_unidad is null            then null
    when a.cantidad_objetivo is null        then null
    when a.hh_plan is not null              then null
    when a.unidad is not null and t.unidad is not null
     and public.norm_area_txt(a.unidad) is distinct from public.norm_area_txt(t.unidad)
                                            then null
    else round(e.hh_por_unidad * a.cantidad_objetivo, 2)
  end                                     as hh_plan_sugerida,
  case
    when a.tarea_tipo_id is null            then 'la actividad no está vinculada a ninguna tarea tipo'
    when a.analisis_id is null              then 'la tarea tipo está elegida pero falta decir con qué análisis se mide'
    when an.vigente is not true             then 'el análisis vinculado ya no es el vigente de esta tarea tipo'
    when e.hh_por_unidad is null            then 'el análisis no publica hs por unidad'
    when a.cantidad_objetivo is null        then 'la actividad no tiene cantidad objetivo cargada'
    when a.hh_plan is not null              then null
    when a.unidad is not null and t.unidad is not null
     and public.norm_area_txt(a.unidad) is distinct from public.norm_area_txt(t.unidad)
      then 'la actividad se mide en ' || a.unidad || ' y el estándar en ' || t.unidad ||
           ' — no se convierte'
    else null
  end                                     as motivo_sin_sugerencia
from public.obra_actividad a
left join public.tarea_tipo t          on t.id = a.tarea_tipo_id
left join public.analisis an           on an.id = a.analisis_id
left join public.estandar_productivo e on e.analisis_id = a.analisis_id;

comment on view public.obra_actividad_vinculacion is
  'El estado de vinculación de cada actividad con el motor de estándares, y lo que el estándar '
  'APORTARÍA si se vinculara. El default visible es sin_vincular: al 22/08/2026 las 350 actividades '
  'reales de la empresa están en ese estado, importadas del tracker de Drive. hh_plan_sugerida es '
  'una sugerencia y va NULL —con motivo escrito— cuando falta el estándar, falta la cantidad, ya '
  'hay hh_plan cargado (no se pisa lo real) o las unidades no coinciden (m² y m³ no se convierten).';

grant select on public.obra_actividad_vinculacion to authenticated;
grant select on public.obra_actividad_vinculacion to service_role;
