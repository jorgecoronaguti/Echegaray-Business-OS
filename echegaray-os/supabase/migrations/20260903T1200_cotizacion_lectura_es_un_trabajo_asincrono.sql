-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- COTIZAR UN PLANO DEJA DE SER UNA LLAMADA HTTP BLOQUEANTE
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- Medido en producción: «no se pudo alcanzar XSAS: The operation was aborted due to timeout ·
-- 56541 ms». No era un problema de red — `src/app/api/xsas/route.ts` tiene `maxDuration = 60` y
-- aborta a los 55s, y el pipeline del plano llama al modelo DOS VECES por lámina (interpretar +
-- medir): tarda minutos. Ningún ajuste del timeout alcanza porque el techo es de la conexión HTTP,
-- no del cómputo.
--
-- La solución: la web ENCOLA una tarea en el worker 24×7 que ya corre (`orq.tasks`, el mismo Work
-- Fabric de siempre) y consulta el progreso leyendo esta fila — nunca espera en la misma conexión.
--
-- ═══ POR QUÉ UN RPC Y NO UN INSERT DIRECTO DESDE LA WEB ═══
--
-- `orq.tasks` y `orq.xsas_adjunto` viven en el schema `orq`, que NO está expuesto a PostgREST (ver
-- 20260902T1100: «RLS aunque el esquema orq no esté expuesto a PostgREST»). La web no tiene forma
-- de insertar ahí con la sesión del usuario. El patrón que este repo ya usa para este mismo problema
-- es `public.orq_submit_objective` (20260712140000): un RPC SECURITY DEFINER hace, en una sola
-- transacción, lo que PostgREST no puede — acá: guardar los adjuntos, crear la lectura y encolar la
-- tarea. `public.cotizacion_lectura` sí vive en `public` porque la pantalla necesita LEERLA con RLS
-- normal (GET por polling), y eso PostgREST sí lo sabe hacer.
--
-- ═══ QUÉ NO HACE ESTA MIGRACIÓN ═══
--
-- No se aplica sola — el dueño la aplica desde el árbol principal. No toca `orq.tasks` ni
-- `orq.xsas_adjunto`: los usa tal como están.

-- ── 1 · LA FILA DE PROGRESO QUE LA PANTALLA LEE POR POLLING ──────────────────────────────────
create table public.cotizacion_lectura (
  id             uuid primary key default gen_random_uuid(),
  actor_id       uuid not null references auth.users(id),
  mensaje        text,
  estado         text not null default 'ENCOLADO' check (estado in ('ENCOLADO','LEYENDO','LISTO','ERROR')),
  etapa          text,                          -- qué está haciendo AHORA, en castellano y corto
  pasos          jsonb not null default '[]'::jsonb,   -- el contrato de pasos-vista.mjs
  certeza        jsonb,                          -- certezaDeLectura(pasos)
  computo        jsonb,                          -- {grupos:[{pasoId,rotulo,titulo,subtotal,items}]}
  cascada        jsonb,                          -- la cascada real de cotizacion_cascada, o null
  documentos     jsonb not null default '[]'::jsonb,   -- [{nombre,laminas,leido,porQue}]
  presupuesto_id uuid,                           -- la cotización persistida (public.cotizaciones)
  error          text,
  task_id        uuid,                           -- la tarea en orq.tasks que la está procesando
  creado         timestamptz not null default now(),
  actualizado    timestamptz not null default now()
);

comment on table public.cotizacion_lectura is
  'El progreso de una lectura de plano que corre en el worker (orq.tasks type=cotizacion.plano). '
  'La web encola con public.cotizacion_encolar_lectura() y consulta esta fila por polling — nunca '
  'espera al motor en la misma conexión HTTP.';

create index cotizacion_lectura_actor_idx on public.cotizacion_lectura (actor_id, creado desc);

create or replace function public.cotizacion_lectura_set_actualizado()
returns trigger language plpgsql as $$
begin
  new.actualizado = now();
  return new;
end;
$$;

create trigger cotizacion_lectura_set_actualizado before update on public.cotizacion_lectura
  for each row execute function public.cotizacion_lectura_set_actualizado();

-- ── 2 · RLS: el actor ve y crea lo suyo; direccion/administracion ven todo ───────────────────
-- `ve_economia()` (20260819T4900) es exactamente esos dos roles y nadie más — el mismo portero que
-- ya protege la cascada comercial del cotizador. Una policy sin GRANT da 'denied' en este repo
-- (lección pagada): el GRANT va aparte, después de las policies.
alter table public.cotizacion_lectura enable row level security;

create policy cotizacion_lectura_select on public.cotizacion_lectura for select to authenticated
  using (actor_id = (select auth.uid()) or (select public.ve_economia()));

-- Sólo defensa en profundidad: en la práctica sólo escribe el RPC (SECURITY DEFINER, corre con los
-- privilegios de su dueño) y el worker (conexión directa a Postgres, fuera de PostgREST). Ningún
-- INSERT/UPDATE directo desde la app está pensado, pero si algo lo intentara con la sesión del
-- usuario, sólo puede crear SU propia fila.
create policy cotizacion_lectura_insert on public.cotizacion_lectura for insert to authenticated
  with check (actor_id = (select auth.uid()));

grant select, insert on public.cotizacion_lectura to authenticated;

-- ── 3 · EL RPC: guarda los adjuntos, crea la lectura, encola la tarea — todo en una transacción ─
-- Mismo patrón que public.orq_submit_objective. `p_adjuntos` es un array de
-- {nombre, hash, contenido_base64} — el hash lo calcula la ruta (Node, sha256, igual que
-- `hashDe()` en lib/xsas-archivos.mjs) porque acá no se pudo verificar que `pgcrypto` esté
-- instalado en un schema alcanzable por `search_path`, y esta migración no se aplica ni se prueba
-- desde este worktree para poder confirmarlo. El shape final es el mismo que ya acepta el pipeline
-- (documentosEnMemoria en lib/plano/pipeline.mjs).
create or replace function public.cotizacion_encolar_lectura(p_mensaje text, p_adjuntos jsonb)
returns public.cotizacion_lectura
language plpgsql
security definer
set search_path = public, orq, pg_temp
as $$
declare
  v_actor      uuid := auth.uid();
  v_lectura_id uuid;
  v_task_id    uuid;
  v_hashes     text[] := '{}';
  v_elem       jsonb;
  v_bytes      bytea;
  v_hash       text;
  v_nombre     text;
begin
  if v_actor is null then raise exception 'no autorizado'; end if;
  if p_adjuntos is null or jsonb_typeof(p_adjuntos) <> 'array' or jsonb_array_length(p_adjuntos) = 0 then
    raise exception 'necesito al menos un plano adjunto';
  end if;
  if jsonb_array_length(p_adjuntos) > 10 then
    raise exception 'como máximo 10 adjuntos por cotización';
  end if;

  insert into public.cotizacion_lectura (actor_id, mensaje, estado, etapa)
  values (v_actor, nullif(trim(coalesce(p_mensaje, '')), ''), 'ENCOLADO', 'en cola')
  returning id into v_lectura_id;

  -- El hash NO se calcula acá: lo trae la web, calculado en Node con el mismo `sha256` que
  -- `hashDe()` en lib/xsas-archivos.mjs — así el mismo contenido produce la misma identidad sin
  -- depender de que `pgcrypto` esté instalado en un schema que `search_path` alcance (no se pudo
  -- verificar en qué schema vive en este proyecto, y una migración que no se puede aplicar ni
  -- probar por RAZONES DE PERMISO no es el lugar para una apuesta). Se valida que TENGA forma de
  -- sha256: 64 caracteres hexadecimales, nada más — quien lo declara mal sólo rompe su propio caché.
  for v_elem in select * from jsonb_array_elements(p_adjuntos) loop
    v_nombre := left(coalesce(v_elem->>'nombre', 'adjunto'), 200);
    v_hash := lower(coalesce(v_elem->>'hash', ''));
    v_bytes := decode(coalesce(v_elem->>'contenido_base64', ''), 'base64');
    if length(v_bytes) = 0 then continue; end if;
    if length(v_bytes) > 8 * 1024 * 1024 then
      raise exception 'el adjunto % supera los 8 MB', v_nombre;
    end if;
    if v_hash !~ '^[0-9a-f]{64}$' then
      raise exception 'el adjunto % no trae un hash sha256 válido', v_nombre;
    end if;
    insert into orq.xsas_adjunto (actor_id, correlation_id, hash, nombre, tamano, contenido_b64)
    values (v_actor::text, v_lectura_id::text, v_hash, v_nombre, length(v_bytes), v_elem->>'contenido_base64')
    on conflict (actor_id, hash) do update set
      correlation_id = excluded.correlation_id,
      nombre = excluded.nombre,
      tamano = excluded.tamano,
      contenido_b64 = excluded.contenido_b64;
    v_hashes := array_append(v_hashes, v_hash);
  end loop;

  if array_length(v_hashes, 1) is null then
    raise exception 'ningún adjunto tenía contenido legible';
  end if;

  v_task_id := orq.enqueue_task(jsonb_build_object(
    'type', 'cotizacion.plano',
    'title', 'Leer plano y cotizar — ' || coalesce(nullif(trim(coalesce(p_mensaje, '')), ''), 'sin mensaje'),
    'inputs', jsonb_build_object('lectura_id', v_lectura_id, 'actor_id', v_actor, 'hashes', to_jsonb(v_hashes))
  ));

  update public.cotizacion_lectura set task_id = v_task_id where id = v_lectura_id;

  return (select l from public.cotizacion_lectura l where l.id = v_lectura_id);
end;
$$;

revoke all on function public.cotizacion_encolar_lectura(text, jsonb) from public;
grant execute on function public.cotizacion_encolar_lectura(text, jsonb) to authenticated;

comment on function public.cotizacion_encolar_lectura(text, jsonb) is
  'Guarda los adjuntos en orq.xsas_adjunto, crea la fila de progreso en cotizacion_lectura y '
  'encola orq.tasks type=cotizacion.plano — todo en una transacción. Responde en milisegundos: '
  'el trabajo real lo hace el worker, no esta llamada.';
