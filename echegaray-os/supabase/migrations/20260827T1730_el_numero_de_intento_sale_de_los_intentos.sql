-- EL WORKER 24×7 MORÍA EN BUCLE POR UN NÚMERO DE INTENTO REPETIDO.
--
-- `orq.claim_task` numeraba el intento con el contador `orq.tasks.attempt`, que puede quedar
-- desalineado con lo que hay en `orq.task_attempts`. Cuando se desalinea, el insert viola la única
-- `(task_id, attempt_no)`, la función levanta, el worker aborta, systemd lo reinicia, y vuelve a
-- tomar la misma tarea: **17.660 reinicios** medidos el 27/08/2026, con el Work Fabric caído.
--
-- Dos partes, y las dos hacen falta: la función deja de confiar en el contador, y la tarea que
-- estaba trabada se realinea para que el bucle corte ya.

CREATE OR REPLACE FUNCTION orq.claim_task(p_worker_id text, p_lease_seconds integer, p_queue text DEFAULT 'default'::text)
 RETURNS SETOF orq.tasks
 LANGUAGE plpgsql
 SET search_path TO 'orq', 'pg_temp'
AS $function$
declare
  v_attempt_no integer;
  v_task orq.tasks;
begin
  select t.* into v_task
  from orq.tasks t
  where t.state in ('ready','retrying')
    and t.queue = p_queue                       -- ← aislamiento por lane (atómico)
    and (t.run_after is null or t.run_after <= now())
    and not exists (
      select 1 from orq.task_deps d
      join orq.tasks dt on dt.id = d.depends_on_task_id
      join orq.task_states ts on ts.state = dt.state
      where d.task_id = t.id and not ts.is_terminal
    )
  order by t.priority desc, t.created_at asc
  for update skip locked
  limit 1;

  if not found then
    return;
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

  -- ═══ EL NÚMERO DE INTENTO SALE DE LOS INTENTOS, NO DEL CONTADOR (27/08/2026) ═══
  --
  -- Antes se insertaba `v_task.attempt` a secas. El contador de la tarea y la tabla de intentos
  -- pueden desincronizarse por cualquier camino —una cancelación, un `reap_expired_leases`, una
  -- corrección a mano— y cuando eso pasa el insert choca con la única `(task_id, attempt_no)`, la
  -- función levanta, el worker aborta y systemd lo reinicia para que vuelva a tomar LA MISMA tarea.
  --
  -- Medido el 27/08/2026: la tarea `84dbaf32` quedó en `retrying` con `attempt = 0` y un intento
  -- nº 1 ya escrito. El worker acumuló **17.660 reinicios** en ese bucle y el 24×7 estuvo caído sin
  -- que nadie lo notara: cada arranque escribía «daemon iniciado» antes de morir.
  --
  -- El número correcto es el siguiente al máximo REAL. Se toma el mayor de los dos para no retroceder
  -- si el contador va adelantado.
  select greatest(v_task.attempt, coalesce(max(attempt_no), 0) + 1)
    into v_attempt_no
    from orq.task_attempts where task_id = v_task.id;

  insert into orq.task_attempts (task_id, attempt_no, state, worker_id, engine)
    values (v_task.id, v_attempt_no, 'running', p_worker_id, v_task.engine);

  perform orq.emit_event(
    v_task.tenant_id, 'task', v_task.id, 'task.claimed', null, v_task.project_id,
    v_task.correlation_id, null, null,
    jsonb_build_object('worker_id', p_worker_id, 'attempt', v_task.attempt, 'queue', v_task.queue));

  return next v_task;
end;
$function$
;

-- La tarea que disparaba el bucle, y cualquier otra igual: el contador se pone al día con los
-- intentos que existen de verdad.
update orq.tasks t
   set attempt = a.maximo, updated_at = now()
  from (select task_id, max(attempt_no) as maximo from orq.task_attempts group by task_id) a
 where a.task_id = t.id and t.attempt < a.maximo;
