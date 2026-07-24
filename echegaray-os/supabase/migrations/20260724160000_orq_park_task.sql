-- PARKEAR UNA TAREA IA CUANDO EL RAZONADOR ESTÁ SIN CRÉDITO — no matarla.
--
-- POR QUÉ (24/07). El dueño: "el OS no puede parar por falta de créditos". Fase 1+2 ya hacen que el
-- chat degrade con gracia. Falta el worker: hoy, si Anthropic se queda sin crédito, una tarea IA
-- (specialist/direction/plan/…) falla, gasta sus intentos y termina en dead_letter — se PIERDE. Este
-- park la devuelve a un estado reclamable ('retrying') con run_after futuro y, clave, SIN consumir el
-- intento (deshace el attempt+1 que hizo el claim): así la MISMA tarea se reintenta sola cuando vuelve
-- el crédito, en vez de morir. Es el equivalente a "poné esto en pausa hasta que vuelva el cerebro".

create or replace function orq.park_task(
  p_task_id       uuid,
  p_worker_id     text,
  p_reason        text default 'razonador sin crédito',
  p_delay_seconds int  default 600
)
returns text
language plpgsql
set search_path = orq, pg_temp
as $$
declare
  v_task orq.tasks;
begin
  select * into v_task from orq.tasks where id = p_task_id for update;
  if not found then raise exception 'tarea % inexistente', p_task_id; end if;

  -- El claim insertó un task_attempts 'running' para este intento: como el parkeo NO cuenta como
  -- intento gastado, lo marcamos 'cancelled' (no 'failed', que sumaría al conteo de fracasos).
  update orq.task_attempts
     set state = 'cancelled', finished_at = now(), error = p_reason
   where task_id = p_task_id and attempt_no = v_task.attempt and state = 'running';

  -- Volver a 'retrying' (reclamable), soltar el lease, y DESHACER el intento del claim. run_after
  -- futuro evita el reintento en caliente; cuando el crédito vuelve, el claim normal la toma.
  update orq.tasks
     set state = 'retrying',
         attempt = greatest(0, attempt - 1),
         run_after = now() + make_interval(secs => p_delay_seconds),
         locked_by = null,
         lease_expires_at = null,
         error = p_reason,
         updated_at = now()
   where id = p_task_id
   returning * into v_task;

  perform orq.emit_event(
    v_task.tenant_id, 'task', v_task.id, 'task.parked', null, v_task.project_id,
    v_task.correlation_id, null, null,
    jsonb_build_object('reason', p_reason, 'run_after', v_task.run_after, 'attempt', v_task.attempt));

  return v_task.state;
end;
$$;

comment on function orq.park_task(uuid, text, text, int) is
  'Parkea una tarea IA (la devuelve a retrying con run_after futuro, sin consumir intento) cuando el razonador está sin crédito. Se reanuda sola al volver el crédito, en vez de ir a dead_letter.';
