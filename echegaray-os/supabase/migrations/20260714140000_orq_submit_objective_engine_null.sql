-- ============================================================================
-- CORRECTIVA — orq_submit_objective: default null + endurecimiento de engine
-- ----------------------------------------------------------------------------
-- Defecto detectado en validación: la web pasaba p_engine='claude-cli', que se
-- persistía en tasks.engine y el handler del Director lo tomaba como override,
-- corriendo Director y consolidación en claude-cli en vez de la API.
--
-- Cambio MÍNIMO, aditivo, idempotente (create or replace) y reversible:
--   1) p_engine default-ea a NULL (antes 'claude-cli').
--   2) cuando p_engine es null -> la tarea raíz se crea SIN clave 'engine'
--      (sin override); el router (orq.model_routes) decide direction.plan.
--   3) endurecimiento: 'claude-cli' se IGNORA (nullif) — esta RPC crea sólo
--      objetivos de Dirección (razonamiento), donde claude-cli nunca es válido;
--      así la web (o cualquier cliente normal) no puede volver a fijarlo.
--   4) se preservan otros engines explícitos (p.ej. 'fixture' en tests) para
--      usos técnicos legítimos.
-- NO rediseña la RPC: misma firma (text,text,int,text), mismos grants (create or
-- replace preserva privilegios), misma tabla de retorno, mismo control de auth.
-- ============================================================================

create or replace function public.orq_submit_objective(
  p_title text, p_goal text, p_priority int default 0, p_engine text default null
)
returns public.orq_direction
language plpgsql
security definer
set search_path = public, orq, pg_temp
as $$
declare
  v_id     uuid;
  v_engine text;
  v_task   jsonb;
begin
  if auth.uid() is null then raise exception 'no autorizado'; end if;
  if coalesce(trim(p_goal),'') = '' then raise exception 'el objetivo no puede estar vacío'; end if;

  -- 'claude-cli' nunca es válido para un objetivo de Dirección (razonamiento):
  -- se ignora para que el router resuelva direction.plan -> anthropic-api.
  v_engine := nullif(p_engine, 'claude-cli');

  v_task := jsonb_build_object(
    'type','direction', 'title', p_title, 'goal', p_goal, 'priority', p_priority,
    'capability_slug','direction.plan', 'agent_slug','director-general'
  );
  -- Sólo se persiste 'engine' cuando hay un override REAL (no null): así la tarea
  -- raíz queda sin override y el router gobierna.
  if v_engine is not null then
    v_task := v_task || jsonb_build_object('engine', v_engine);
  end if;

  v_id := orq.enqueue_task(v_task);
  return (select d from public.orq_direction d where d.id = v_id);
end;
$$;

-- Grants: 'create or replace' preserva los privilegios existentes de la función
-- (definidos en 20260712140000). No se re-otorgan para no ampliar el alcance.

-- ============================================================================
-- ROLLBACK (manual): re-aplicar la definición de 20260712140000_orq_direccion_ia.sql
-- (p_engine text default 'claude-cli' y jsonb con 'engine', p_engine directo).
-- ============================================================================
