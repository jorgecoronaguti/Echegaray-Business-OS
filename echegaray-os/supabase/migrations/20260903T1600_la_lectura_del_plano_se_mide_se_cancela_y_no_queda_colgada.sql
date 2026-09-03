-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- LA LECTURA DEL PLANO SE MIDE, SE CANCELA Y NO QUEDA COLGADA
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- `20260903T1200_cotizacion_lectura_es_un_trabajo_asincrono` sacó la corrida de la conexión HTTP.
-- Lo que quedó afuera es todo lo que hace falta para OPERARLA sin una sesión de Claude Code abierta:
--
--   1 · NO SE PODÍA MEDIR. `pipeline.correr()` ya devuelve `ia` (llamadas, tokens, usd, ms por
--       llamada, cuántas salieron del caché) y `metricas`, y el handler los tiraba. Sin eso no se
--       puede probar NINGUNA mejora de velocidad ni de costo: no hay contra qué comparar. Peor —
--       una corrida que falló a los cuatro minutos es justamente la que hay que poder mirar, y de
--       esa no quedaba ni el tiempo ni la plata gastada.
--
--   2 · NO SE PODÍA CANCELAR. Subir el legajo equivocado costaba minutos y TODAS las llamadas de
--       visión que se pagaran mientras tanto. No había forma de frenar.
--
--   3 · UN TRABAJO COLGADO NO SE CERRABA SOLO. Si el worker muere entre LEYENDO y el LISTO final,
--       la fila queda en LEYENDO para siempre y la pantalla sondea infinito. Destrabarla exigía
--       SSH + UPDATE a mano: exactamente el caso «no funciona sin Claude Code».
--
-- ═══ POR QUÉ CANCELAR ES UNA POLICY Y VENCER ES UN SECURITY DEFINER ═══
--
-- Cancelar es una INTENCIÓN DEL USUARIO sobre su propio trabajo: alcanza con RLS y el mínimo
-- privilegio posible — puede escribir UNA columna (`estado`), sólo el valor 'CANCELADO', sólo sobre
-- su fila, sólo si todavía no terminó. No hace falta elevar privilegios para eso, y el `update
-- ... select()` de PostgREST devuelve la fila afectada: la app puede distinguir «cancelé» de «no
-- había nada que cancelar» sin creerle a un 204 (lección pagada: un 204 no prueba escritura).
--
-- Vencer es un VEREDICTO DEL SISTEMA sobre un trabajo que se murió, y el texto de ese veredicto no
-- lo puede dictar el cliente: si el motivo viniera por parámetro, cualquiera podría dejar escrito
-- en la fila que «falló el modelo» cuando no falló nada. Por eso es una función SECURITY DEFINER
-- sin argumentos de contenido: recibe el id, comprueba visibilidad, y el motivo y el umbral los
-- pone la base.
--
-- ═══ EL UMBRAL: 10 MINUTOS SIN LATIDO ═══
--
-- El handler late (`actualizado = now()`) cada 60 s mientras corre, además de escribir por cada
-- lámina/vista terminada. 10 minutos son DIEZ latidos perdidos seguidos: no hay corrida viva que
-- los pierda, y una corrida muerta se destraba sola en menos de lo que tarda el dueño en pedir
-- ayuda. Sólo vence LEYENDO — ver el límite declarado al pie.
--
-- ═══ QUÉ NO HACE ESTA MIGRACIÓN ═══
--
-- No se aplica sola: el dueño la aplica desde el árbol principal. No toca `orq.tasks` — una fila
-- vencida o cancelada NO cancela la tarea del worker (ver límite al pie).

-- ── 1 · LA MEDICIÓN DE CADA CORRIDA ──────────────────────────────────────────────────────────
alter table public.cotizacion_lectura add column medicion jsonb;

comment on column public.cotizacion_lectura.medicion is
  'Lo que costó la corrida, tal como lo devuelve pipeline.correr(): '
  '{ms, cancelada, ia:{llamadas,deCache,usd,tokensIn,tokensOut,msIa,usos:[{modelo,ms,usd,...}]}, '
  'metricas, progreso:{fase,hecho,total}}. Se guarda TAMBIÉN cuando la corrida termina en ERROR o '
  'CANCELADO: la corrida que falló a los cuatro minutos es la que hay que poder mirar. '
  'Consulta típica: select medicion->>''ms'', medicion->''ia''->>''llamadas'', '
  'medicion->''ia''->>''usd'', medicion->''ia''->>''deCache'' from public.cotizacion_lectura;';

-- El GRANT de select vive a nivel TABLA (migración 20260903T1200), así que una columna nueva queda
-- cubierta. Se repite igual por columna porque en este repo ya se pagó el caso inverso —una columna
-- que nace sin permiso porque el grant original era por columna— y un grant redundante no rompe
-- nada, mientras que el faltante falla EN SILENCIO.
grant select (medicion) on public.cotizacion_lectura to authenticated;

-- ── 2 · CANCELADO ES UN ESTADO TERMINAL MÁS ──────────────────────────────────────────────────
-- La pantalla lo trata igual que LISTO/ERROR: deja de sondear. Un trabajo cancelado NO es un error
-- (nadie falló) ni un éxito (no hay presupuesto): necesita su propio nombre o se miente en los dos
-- sentidos.
alter table public.cotizacion_lectura drop constraint cotizacion_lectura_estado_check;
alter table public.cotizacion_lectura add constraint cotizacion_lectura_estado_check
  check (estado in ('ENCOLADO','LEYENDO','LISTO','ERROR','CANCELADO'));

-- Índice para el barrido de colgados (y para la consulta de medición por estado). Parcial: las
-- filas terminadas —la enorme mayoría con el tiempo— no entran al índice.
create index cotizacion_lectura_en_curso_idx on public.cotizacion_lectura (actualizado)
  where estado in ('ENCOLADO','LEYENDO');

-- ── 3 · CANCELAR: RLS + GRANT POR COLUMNA, EL MÍNIMO PRIVILEGIO QUE ALCANZA ───────────────────
-- `using` decide QUÉ FILA puede tocar (la suya, y sólo si todavía no terminó); `with check` decide
-- EN QUÉ ESTADO puede dejarla (sólo CANCELADO — no puede declarar LISTO su propio trabajo ni
-- inventarse un presupuesto). El grant es sobre UNA columna: `pasos`, `computo`, `cascada`,
-- `presupuesto_id` y `medicion` siguen siendo escritura exclusiva del worker.
--
-- A propósito NO se usa ve_economia() acá: ver todos los trabajos (select) no es lo mismo que
-- frenar el de otro. Cancelar es sobre lo propio.
create policy cotizacion_lectura_cancelar on public.cotizacion_lectura for update to authenticated
  using (actor_id = (select auth.uid()) and estado in ('ENCOLADO','LEYENDO'))
  with check (actor_id = (select auth.uid()) and estado = 'CANCELADO');

grant update (estado) on public.cotizacion_lectura to authenticated;

-- ── 4 · VENCER UN TRABAJO COLGADO ────────────────────────────────────────────────────────────
-- Devuelve la fila si la venció, `null` si no había nada que vencer (ya terminó, todavía late, o no
-- es visible para quien pregunta). El motivo es ACCIONABLE: dice qué pasó y qué hacer.
create or replace function public.cotizacion_lectura_vencer(p_id uuid)
returns public.cotizacion_lectura
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_fila public.cotizacion_lectura;
begin
  if auth.uid() is null then raise exception 'no autorizado'; end if;

  select * into v_fila from public.cotizacion_lectura where id = p_id;
  -- Mismo criterio que la policy de select: el actor ve lo suyo, direccion/administracion ven todo.
  -- Un id que no es visible se responde igual que uno que no existe — no se confirma que exista.
  if not found then return null; end if;
  if not (v_fila.actor_id = auth.uid() or public.ve_economia()) then return null; end if;

  update public.cotizacion_lectura
     set estado = 'ERROR',
         etapa  = null,
         error  = 'el trabajo se cortó antes de terminar (el servidor dejó de responder hace más '
               || 'de 10 minutos). Volvé a intentar la lectura: no se perdió nada más que el tiempo '
               || 'de esta corrida.'
   where id = p_id
     and estado = 'LEYENDO'
     and actualizado < now() - interval '10 minutes'
  returning * into v_fila;

  if not found then return null; end if;
  return v_fila;
end;
$$;

revoke all on function public.cotizacion_lectura_vencer(uuid) from public;
grant execute on function public.cotizacion_lectura_vencer(uuid) to authenticated, service_role;

comment on function public.cotizacion_lectura_vencer(uuid) is
  'Cierra como ERROR una lectura que quedó en LEYENDO sin latir por más de 10 minutos — el worker '
  'murió a mitad de camino. Devuelve la fila vencida, o null si no había nada que vencer. El motivo '
  'lo escribe la base, nunca el cliente.';

-- El worker escribe por conexión directa (fuera de PostgREST), pero service_role tiene que poder
-- leer y mantener estas filas para diagnóstico y para un barrido futuro.
grant select, insert, update on public.cotizacion_lectura to service_role;

-- ═══ LÍMITES DECLARADOS ═══════════════════════════════════════════════════════════════════════
--
-- · ENCOLADO NO VENCE. Una fila puede quedar encolada legítimamente mucho tiempo si el worker está
--   ocupado con OTRA lectura (una corrida de plano dura minutos). Desde la base no hay forma de
--   distinguir «el worker está muerto» de «el worker está ocupado», y vencer una tarea que después
--   se va a procesar deja la fila peor que antes. Además, una tarea encolada no gasta plata. El día
--   que haga falta, el dato que lo desambigua es el latido del worker (orq.tasks), no esta tabla.
--
-- · CANCELAR MARCA LA FILA, NO MATA EL PROCESO. El handler consulta el estado entre unidades de
--   trabajo y corta ahí; una llamada de visión ya en vuelo se termina de pagar. Cancelar tampoco
--   toca `orq.tasks`: la tarea llega a su fin normalmente, sólo que sin publicar resultado.
--
-- · EL VENCIMIENTO PUEDE DAR UN FALSO POSITIVO si el worker estuvo diez minutos sin poder escribir
--   en Postgres pero siguió vivo. En ese caso el propio worker pisa el ERROR con su resultado real
--   al terminar — la verdad la tiene el que hizo el trabajo, no el que lo dio por muerto.
