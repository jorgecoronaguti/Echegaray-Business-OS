-- UNA ACTIVIDAD NUEVA NUNCA PIERDE SU TIPO — y si nace sin él, se sabe.
--
-- ═══ POR QUÉ (27/08/2026) ═══
--
-- Clasificar 251 actividades históricas costó una campaña y sólo 3 se pudieron resolver por regla.
-- Lo que no puede pasar es tener que repetirla: cuando una actividad nace de una partida cotizada o
-- de una plantilla, el tipo de tarea ya se conoce en ese momento y sólo hay que no perderlo.
--
-- Los dos caminos que crean actividades —`convertir_partida_a_plan` y el alta desde la web— ya lo
-- copian. Lo que faltaba era dejar escrito DE DÓNDE vino, que es lo que hace auditable el vínculo, y
-- que no dependa de que cada camino nuevo se acuerde de rotularlo.
--
-- El disparador NO bloquea nada: una actividad puede nacer sin tipo —el jefe de obra carga un frente
-- que no está en ningún presupuesto y eso es legítimo— y queda simplemente sin clasificar. Frenar la
-- carga de una obra por una etiqueta sería poner el tablero antes que el trabajo.

create or replace function public.marcar_origen_tarea_tipo()
returns trigger
language plpgsql
as $$
begin
  -- ═══ SE MIRA SI EL TIPO CAMBIÓ, NO SI EL ORIGEN ESTÁ VACÍO ═══
  --
  -- Con la condición sobre `tarea_tipo_origen is null`, re-vincular una actividad ya clasificada
  -- dejaba las cuatro columnas describiendo el tipo ANTERIOR: la actividad pasaba a decir que es
  -- EXCAVACIONES con la evidencia de que su nombre coincide exactamente con REPLANTEO, y confianza
  -- EXACTO. Una evidencia que sobrevive al hecho que explicaba es peor que ninguna — y hay un camino
  -- de la web que lo dispara (`vinculacionEstandar.ts` re-vincula contra el estándar).
  if new.tarea_tipo_id is not null
     and (tg_op = 'INSERT' or old.tarea_tipo_id is distinct from new.tarea_tipo_id
          or new.tarea_tipo_origen is null) then
    -- El vínculo es nuevo, así que su rastro también: lo que explicaba al anterior no vale para éste.
    if tg_op = 'UPDATE' and old.tarea_tipo_id is distinct from new.tarea_tipo_id then
      new.tarea_tipo_evidencia := null;
    end if;
    new.tarea_tipo_origen := case
      when new.cotizacion_partida_id is not null then 'presupuesto'
      when new.analisis_id is not null           then 'plantilla'
      else 'manual' end;
    new.tarea_tipo_confianza := 'EXACTO';
    new.tarea_tipo_asignado_en := now();
  end if;
  -- Y si alguien BORRA el tipo, se van con él las cuatro columnas que lo explicaban: una evidencia
  -- que sobrevive al hecho que explicaba es peor que ninguna.
  if new.tarea_tipo_id is null then
    new.tarea_tipo_origen := null;
    new.tarea_tipo_confianza := null;
    new.tarea_tipo_evidencia := null;
    new.tarea_tipo_asignado_en := null;
  end if;
  return new;
end $$;

drop trigger if exists obra_actividad_origen_tarea_tipo on public.obra_actividad;
create trigger obra_actividad_origen_tarea_tipo
  before insert or update of tarea_tipo_id on public.obra_actividad
  for each row execute function public.marcar_origen_tarea_tipo();

comment on function public.marcar_origen_tarea_tipo() is
  'Deja escrito de dónde salió el tarea_tipo_id de una actividad, sin bloquear nunca la carga: una actividad puede nacer sin tipo y queda sin clasificar.';

-- ── QUÉ QUEDA SIN CLASIFICAR, PARA QUE NO SE ACUMULE EN SILENCIO ─────────────────────────────

create or replace view public.actividades_sin_clasificar
with (security_invoker = true) as
select a.obra_id, o.nombre as obra, a.id as actividad_id, a.nombre as actividad, a.unidad,
       a.creado_en, a.propuesta_tarea_tipo_id,
       t.codigo as propuesta_codigo, t.nombre as propuesta_nombre,
       a.propuesta_evidencia
  from public.obra_actividad a
  left join public.obra_canonica o on o.id = a.obra_id
  left join public.tarea_tipo t on t.id = a.propuesta_tarea_tipo_id
 where a.tarea_tipo_id is null and a.archivada is not true;

comment on view public.actividades_sin_clasificar is
  'Las actividades que todavía no se pueden reutilizar como experiencia, con la propuesta del modelo cuando la hay. Aceptar una propuesta es copiarla a tarea_tipo_id — decisión de una persona.';

grant select on public.actividades_sin_clasificar to authenticated, service_role;
