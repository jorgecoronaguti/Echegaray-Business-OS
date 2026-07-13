-- ============================================================================
-- DESACOPLE DE CLAUDE CODE — Motor de razonamiento sobre API oficial de Anthropic
-- ----------------------------------------------------------------------------
-- Migración ADITIVA y REVERSIBLE. NO cambia el modelo de datos ni crea tablas.
-- No adelanta ningún componente de aprendizaje (Decision Ledger / orq.knowledge
-- / orq.prompts quedan explícitamente fuera de alcance de esta etapa).
--
-- Hace dos cosas:
--   1) REENRUTA las capacidades de RAZONAMIENTO (Director, especialistas,
--      consolidación, planner) al engine 'anthropic-api' (Reasoner 24×7). Deja
--      las capacidades de DESARROLLO (code.* / run.* / git.* / read.analyze /
--      doc.write) en 'claude-cli' (Builder), que usa herramientas locales.
--   2) CORRIGE el bloqueo de consolidación: claim_task consideraba una
--      dependencia "resuelta" sólo si estaba en 'succeeded'. Un especialista que
--      caía a dead_letter bloqueaba la consolidación PARA SIEMPRE. Ahora una
--      dependencia se considera resuelta cuando llega a cualquier estado TERMINAL
--      (succeeded | dead_letter | cancelled | rejected). El handler de
--      consolidación ya inspecciona a los hermanos y cierra en 'parcial' nombrando
--      a los caídos (no oculta fallos, no marca incompletos como succeeded).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. REENRUTAR RAZONAMIENTO → anthropic-api
--    (tenant único 'echegaray'; se filtra por scope/match_key para no tocar
--     rutas de desarrollo). Idempotente: re-ejecutar deja el mismo estado.
-- ----------------------------------------------------------------------------
update orq.model_routes
   set engine = 'anthropic-api'
 where engine = 'claude-cli'
   and (
        (scope = 'default'    and match_key = '*')
     or (scope = 'capability' and match_key in ('direction.plan', 'direction.report', 'direction.assess', 'plan.decompose'))
     or (scope = 'capability' and match_key like 'advise.%')
   );

-- default_engine de los agentes de razonamiento (usado sólo por el fallback duro
-- del router cuando no hay rutas): coherente con el reenrutamiento anterior.
update orq.agents
   set default_engine = 'anthropic-api'
 where default_engine = 'claude-cli'
   and slug not in ('software-architect', 'implementer'); -- éstos son desarrollo (Builder)

-- ----------------------------------------------------------------------------
-- 2. CONSOLIDACIÓN TOLERANTE A FALLOS — dependencia por estado TERMINAL.
--    Reemplaza sólo la condición de dependencia dentro de claim_task; el resto
--    del cuerpo es idéntico al de 20260711121000_orq_ledger.sql.
-- ----------------------------------------------------------------------------
create or replace function orq.claim_task(p_worker_id text, p_lease_seconds int)
returns setof orq.tasks
language plpgsql
set search_path = orq, pg_temp
as $$
declare
  v_task orq.tasks;
begin
  select t.* into v_task
  from orq.tasks t
  where t.state in ('ready','retrying')
    and (t.run_after is null or t.run_after <= now())
    and not exists (
      -- Bloquea SÓLO mientras alguna dependencia siga en un estado NO terminal.
      -- Al llegar todas a estado terminal (succeeded/dead_letter/cancelled/rejected)
      -- el dependiente (p.ej. la consolidación) se vuelve reclamable. El handler
      -- decide qué hacer con entradas parciales; nunca queda bloqueado for siempre.
      select 1 from orq.task_deps d
      join orq.tasks dt on dt.id = d.depends_on_task_id
      join orq.task_states ts on ts.state = dt.state
      where d.task_id = t.id and not ts.is_terminal
    )
  order by t.priority desc, t.created_at asc
  for update skip locked
  limit 1;

  if not found then
    return;                       -- conjunto vacío: no hay trabajo para este worker
  end if;

  update orq.tasks
     set state = 'claimed',
         locked_by = p_worker_id,
         lease_expires_at = now() + make_interval(secs => p_lease_seconds),
         heartbeat_at = now(),
         attempt = attempt + 1,
         updated_at = now()
   where id = v_task.id
   returning * into v_task;

  insert into orq.task_attempts (task_id, attempt_no, state, worker_id, engine)
    values (v_task.id, v_task.attempt, 'running', p_worker_id, v_task.engine);

  perform orq.emit_event(
    v_task.tenant_id, 'task', v_task.id, 'task.claimed', null, v_task.project_id,
    v_task.correlation_id, null, null,
    jsonb_build_object('worker_id', p_worker_id, 'attempt', v_task.attempt));

  return next v_task;
end;
$$;

-- ============================================================================
-- ROLLBACK (manual, si hiciera falta revertir esta etapa):
--   update orq.model_routes set engine='claude-cli'
--    where engine='anthropic-api'
--      and ((scope='default' and match_key='*')
--        or (scope='capability' and match_key in ('direction.plan','direction.report','direction.assess','plan.decompose'))
--        or (scope='capability' and match_key like 'advise.%'));
--   update orq.agents set default_engine='claude-cli'
--    where default_engine='anthropic-api' and slug not in ('software-architect','implementer');
--   -- y re-aplicar claim_task de 20260711121000_orq_ledger.sql (dep: dt.state <> 'succeeded').
-- ============================================================================
