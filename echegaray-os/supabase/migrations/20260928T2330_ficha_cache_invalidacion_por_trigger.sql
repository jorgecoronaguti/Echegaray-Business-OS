-- LA CACHÉ DE LA FICHA SE INVALIDA POR ESCRITURA, NO POR RELOJ (28/09/2026, «optimización máxima»).
--
-- ═══ LO MEDIDO ═══
--
-- `pg_stat_statements`: `select public.refrescar_ficha_cliente_cache()` es el 88 % del tiempo total
-- de Postgres — 2.298 llamadas, 3.130 ms de media, 7.193 s acumulados desde el último reset
-- (25/09 16:56). `cron.job_run_details` de las últimas 24 h: 720 corridas (cada 2 min, como está
-- programado) y ~95 s de trabajo por hora — casi todo en las corridas donde algo venció (55 filas en
-- total: 30 `pantalla_cliente` de 5 clientes × 6 solapas, 25 `hh_de_obra`). Con el vencimiento a 7 min
-- (20260917T1700) TODO vence junto cada ~8 min y esa corrida recalcula las 55 filas aunque nada haya
-- cambiado: eso es el costo — no la frecuencia del cron, que ya está en 2 min.
--
-- ═══ POR QUÉ NO SE PUEDE INVALIDAR TODO POR TRIGGER, HONESTAMENTE ═══
--
-- Se inventariaron las tablas fuente por el grafo real de dependencias de `pantalla_cliente_en_vivo`
-- y `hh_de_obra_en_vivo` (`pg_depend` recursivo sobre las vistas que leen, no lectura a ojo). El
-- resultado tiene DOS familias:
--
--   · Tablas con una columna de cliente/obra que el CUERPO REALMENTE USA para resolver —verificado
--     contra el código de la función, no contra el nombre de la columna: `costos_obra.obra_id` EXISTE
--     y tiene FK a `obra_canonica`, pero el cuerpo NO lo usa — resuelve la obra por
--     `obra_alias.alias = norm_obra(c.obra_texto)`, y medido en la base real el 45 % de las filas con
--     `obra_id` DISCREPA de lo que ese join resuelve (426 de 947). Un trigger que confiara en la
--     columna FK invalidaría la caché del cliente equivocado casi la mitad de las veces. El trigger de
--     `costos_obra` usa el MISMO join que el cuerpo.
--   · Tablas del motor de cotización y de planificación (`cotizacion_partida`, `analisis`,
--     `analisis_linea`, `recurso`, `recurso_precio`, `tipo_cambio`, `obra_actividad`,
--     `obra_actividad_nota`, `obra_actividad_paso`, `obra_ejecucion`, `obra_ejecucion_equipo`,
--     `obra_documento`, `tarea_tipo`, `cuadrilla`) que `cotizacion_cascada` y `obra_plan_vs_real`
--     arrastran varias vistas adentro. Cambiar una PARTIDA sin tocar la fila de `cotizaciones`, o el
--     avance de una TAREA sin tocar `obra_actividad`, no dispara ningún trigger de este cambio.
--     LÍMITE DECLARADO: esas tablas quedan CUBIERTAS SÓLO por el vencimiento por tiempo, que por eso
--     no baja de una red de seguridad razonable (abajo). No se armó trigger ahí por el mismo motivo
--     que `costos_obra` casi sale mal: una resolución barata y CORRECTA no está disponible sin
--     replicar la cascada entera de vistas dentro del trigger, y una resolución barata pero
--     INCORRECTA es peor que no tener trigger.
--
-- `compra_sheet` tiene `obra_id` (FK a `obra_canonica`) pero el cuerpo tampoco lo usa: la junta con
-- `costos_obra` es por `referencia_externa`, no por obra. Blanket a propósito, no por costo sino
-- porque el join real no resuelve un cliente.
--
-- ═══ EL DISEÑO ═══
--
-- Un helper `ficha_cliente_cache_invalidar_lote(clientes, obras, todo)` hace el `delete` real
-- (SECURITY DEFINER: dispara desde triggers que corren con el rol de quien escribe, y la tabla no
-- tiene policies). Cinco funciones de trigger, statement-level con TABLAS DE TRANSICIÓN
-- (`old_rows`/`new_rows`: una sola consulta por lote de filas, no una por fila) para no repetir el
-- mismo cuerpo 22 veces:
--
--   · `tr_ficha_inv_cliente_col(col)`  — tablas con columna de cliente directa y CONFIRMADA por FK.
--   · `tr_ficha_inv_obra_col(col)`     — tablas con columna de obra directa y CONFIRMADA contra el
--                                        cuerpo de la vista que la usa (no contra el nombre).
--   · `tr_ficha_inv_costos_obra()`     — el join real (`obra_alias` + `norm_obra`), no la columna FK.
--   · `tr_ficha_inv_obra_canonica()`   — caso especial: en un DELETE la fila ya no está para hacer
--                                        join, así que toma `cliente_id` y `id` DE LA MISMA fila.
--   · `tr_ficha_inv_blanket()`         — no hay resolución barata y correcta: borra toda la caché.
--
-- `ficha_cliente_cache_invalidar_lote` con un `obra_ids` no vacío borra la fila `pantalla_cliente` del
-- cliente dueño de esa obra Y la fila `hh_de_obra` de esa obra, aunque la tabla que disparó (p. ej.
-- `obra_papel`) sólo afecte a `pantalla_cliente`: invalidar de más es barato (recalcular `hh_de_obra`
-- de una obra son ~33 ms medidos) e invalidar de menos deja la ficha vieja.
--
-- ═══ FRESCURA Y EL VENCIMIENTO QUE QUEDA ═══
--
-- El cron sigue cada 2 min (20260917T1700) y recalcula sólo lo que falta: con los triggers cubriendo
-- las escrituras de negocio, lo que falta la mayoría de las corridas es NADA. El vencimiento por
-- tiempo sube de 7 a 60 min: ya no es la vía principal de frescura (eso son los triggers, con un
-- cambio visible en ≤ 2 min: se borra al escribir, la corrida siguiente del cron —a lo sumo 2 min
-- después— la repone) sino la red de seguridad para lo declarado arriba y para cualquier escritura que
-- este inventario no haya visto.
--
-- ═══ AHORRO ESTIMADO (medido + calculado, no una promesa) ═══
--
-- Hoy: ~95 s/hora, ~2.280 s/día (medido, arriba). Con vencimiento a 60 min sin ningún trigger
-- disparando, el lote completo (55 filas, ~12 s medidos) correría 1 vez/hora en vez de cada ~8 min:
-- ~12 s/hora de piso por el solo cambio de TTL. Las escrituras reales (documentos, compras, cobranzas,
-- horas: unas 100-150/día por el conteo de filas vivas de sus tablas) agregan invalidaciones
-- puntuales de ~230-380 ms cada una (medido en `ficha_cliente_cache.ms`): ~30-55 s/día más. ESTIMADO
-- total ~300-350 s/día contra ~2.280 s/día medidos — una baja del orden del 85 %, ~1.950 s/día de
-- tiempo de Postgres liberados. Es una ESTIMACIÓN sobre los `ms` ya medidos, no una proyección nueva.

-- ── EL HELPER QUE BORRA (SECURITY DEFINER: los triggers corren con el rol de quien escribe) ────────
create or replace function public.ficha_cliente_cache_invalidar_lote(
  p_cliente_ids uuid[] default null,
  p_obra_ids text[] default null,
  p_todo boolean default false
) returns void
language sql
volatile
security definer
set search_path to 'public'
as $function$
  delete from public.ficha_cliente_cache c
   where p_todo
      or (p_cliente_ids is not null and c.rpc = 'pantalla_cliente'
          and c.clave in (select k.slug from public.clientes k where k.id = any(p_cliente_ids)))
      or (p_obra_ids is not null and c.rpc = 'hh_de_obra' and c.clave = any(p_obra_ids))
      -- LA FICHA DEL CLIENTE TAMBIÉN SE ENSUCIA: sin esto, invalidar por obra sólo limpiaría el
      -- desglose de horas y la ficha (que también muestra HH y costo por obra) quedaría vieja hasta
      -- el vencimiento por tiempo.
      or (p_obra_ids is not null and c.rpc = 'pantalla_cliente'
          and c.clave in (select k.slug from public.clientes k
                            join public.obra_canonica o on o.cliente_id = k.id
                           where o.id = any(p_obra_ids)))
$function$;

revoke all on function public.ficha_cliente_cache_invalidar_lote(uuid[], text[], boolean) from public, anon;
grant execute on function public.ficha_cliente_cache_invalidar_lote(uuid[], text[], boolean) to authenticated;

comment on function public.ficha_cliente_cache_invalidar_lote(uuid[], text[], boolean) is
  'Borra de ficha_cliente_cache lo que un cambio real puede haber ensuciado: por cliente, por obra '
  '(ficha del cliente dueño + su desglose de horas) o todo. La llaman los triggers tr_ficha_inv_* '
  '(20260928T2330), nunca directo.';

-- ── LAS CINCO FORMAS DE RESOLVER ──────────────────────────────────────────────────────────────────
--
-- FILA POR FILA, NO TABLAS DE TRANSICIÓN: Postgres las prohíbe en un trigger que combina INSERT,
-- UPDATE y DELETE en una sola declaración («transition tables cannot be specified for triggers with
-- more than one event» — se probó al ensayar esta migración, no es una elección de estilo). Separar
-- cada tabla en tres triggers (uno por evento) para poder usarlas hubiera triplicado el archivo sin
-- necesidad real: medidas, las tablas que las necesitarían son chicas (`registros_hh` 3.873 filas,
-- `costos_obra` 947, el resto por debajo de 250) — hasta un `delete` + `insert` completo de la más
-- grande es un lote de miles de filas, no de cientos de miles, y cada llamada del helper es un
-- `delete` por clave primaria. Una sola declaración por tabla, `for each row`.

-- Tablas con columna de cliente directa y confirmada por FK (`clientes`, `cliente_contacto`,
-- `cliente_documento`, `cliente_nota`, `cliente_orden`, `cotizaciones`, `cobranzas`). `TG_ARGV[0]` es
-- el nombre de esa columna («id» para `clientes`, «cliente_id» para el resto).
create or replace function public.tr_ficha_inv_cliente_col() returns trigger
language plpgsql as $function$
declare
  v_col text := TG_ARGV[0];
  v_id  uuid;
begin
  v_id := (case when TG_OP = 'DELETE' then to_jsonb(OLD) else to_jsonb(NEW) end ->> v_col)::uuid;
  if v_id is not null then
    perform public.ficha_cliente_cache_invalidar_lote(array[v_id], null, false);
  end if;
  return null;
end
$function$;

-- Tablas con columna de obra directa Y CONFIRMADA contra el cuerpo de la vista que la lee (no contra
-- el nombre): `registros_hh`, `certificados`, `obra_contrato`, `obra_economia_sheet`, `obra_papel`,
-- `obra_carpeta_drive`, `obra_restriccion`.
create or replace function public.tr_ficha_inv_obra_col() returns trigger
language plpgsql as $function$
declare
  v_col text := TG_ARGV[0];
  v_id  text;
begin
  v_id := case when TG_OP = 'DELETE' then to_jsonb(OLD) else to_jsonb(NEW) end ->> v_col;
  if v_id is not null then
    perform public.ficha_cliente_cache_invalidar_lote(null, array[v_id], false);
  end if;
  return null;
end
$function$;

-- `costos_obra`: la obra no sale de su columna `obra_id` (discrepa en el 45 % de las filas medidas):
-- sale del MISMO join que usa `pantalla_cliente_en_vivo` — `obra_alias.alias = norm_obra(obra_texto)`.
-- En un UPDATE que cambia `obra_texto` se invalidan las DOS obras (la vieja y la nueva).
create or replace function public.tr_ficha_inv_costos_obra() returns trigger
language plpgsql as $function$
declare
  v_ids text[];
begin
  select array_agg(distinct a.obra_id) filter (where a.obra_id is not null)
    into v_ids
    from public.obra_alias a
   where a.alias in (
     public.norm_obra(case when TG_OP <> 'INSERT' then OLD.obra_texto end),
     public.norm_obra(case when TG_OP <> 'DELETE' then NEW.obra_texto end)
   );
  if v_ids is not null then
    perform public.ficha_cliente_cache_invalidar_lote(null, v_ids, false);
  end if;
  return null;
end
$function$;

-- `obra_canonica`: en un DELETE la fila ya no existe para resolver el cliente por join (la obra
-- desaparecida no tiene con qué reencontrar a su dueño); `cliente_id` sale de la MISMA fila que
-- cambió, antes o después según el caso. En un UPDATE que reasigna la obra a otro cliente (o cambia
-- su `id`, que no pasa en la práctica pero el trigger no lo asume) invalida a los dos.
create or replace function public.tr_ficha_inv_obra_canonica() returns trigger
language plpgsql as $function$
declare
  v_clientes uuid[];
  v_obras text[];
begin
  select array_agg(distinct x.cliente_id) filter (where x.cliente_id is not null),
         array_agg(distinct x.id) filter (where x.id is not null)
    into v_clientes, v_obras
    from (
      select (case when TG_OP <> 'INSERT' then OLD.cliente_id end) as cliente_id,
             (case when TG_OP <> 'INSERT' then OLD.id end)         as id
      union all
      select (case when TG_OP <> 'DELETE' then NEW.cliente_id end),
             (case when TG_OP <> 'DELETE' then NEW.id end)
    ) x;
  if v_clientes is not null or v_obras is not null then
    perform public.ficha_cliente_cache_invalidar_lote(v_clientes, v_obras, false);
  end if;
  return null;
end
$function$;

-- Sin resolución barata Y CORRECTA disponible (ver la cabecera): `compra_sheet`, `perfiles`,
-- `persona_tarifa`, `costo_hora_alicuota`, `drive_index`, `obra_alias`. Todas de escritura rara o
-- chica (medido: perfiles 2 ins/12 upd/2 del, obra_alias 4 ins, en lo que corre pg_stat_statements).
create or replace function public.tr_ficha_inv_blanket() returns trigger
language plpgsql as $function$
begin
  perform public.ficha_cliente_cache_invalidar_lote(null, null, true);
  return null;
end
$function$;

comment on function public.tr_ficha_inv_cliente_col() is
  'Trigger FOR EACH ROW: invalida por el id de cliente de TG_ARGV[0] de la fila que cambió.';
comment on function public.tr_ficha_inv_obra_col() is
  'Trigger FOR EACH ROW: invalida por el id de obra de TG_ARGV[0] de la fila que cambió.';
comment on function public.tr_ficha_inv_costos_obra() is
  'Trigger de costos_obra: resuelve la obra por obra_alias + norm_obra(obra_texto), el mismo camino '
  'que pantalla_cliente_en_vivo — no por la columna obra_id, que discrepa en el 45% de las filas.';
comment on function public.tr_ficha_inv_obra_canonica() is
  'Trigger de obra_canonica: toma cliente_id y id de la fila misma (un DELETE no puede hacer join).';
comment on function public.tr_ficha_inv_blanket() is
  'Trigger de tablas sin resolución barata y correcta: borra toda la caché (20260928T2330).';

-- ── LOS 22 TRIGGERS ───────────────────────────────────────────────────────────────────────────────
-- Mismo nombre (`trg_ficha_inv`) en cada tabla: como cada una tiene UN solo trigger de este sistema,
-- `drop ... if exists` antes de cada `create` hace esta migración reaplicable sin duplicar triggers.

drop trigger if exists trg_ficha_inv on public.clientes;
create trigger trg_ficha_inv after insert or update or delete on public.clientes
  for each row execute function public.tr_ficha_inv_cliente_col('id');

drop trigger if exists trg_ficha_inv on public.cliente_contacto;
create trigger trg_ficha_inv after insert or update or delete on public.cliente_contacto
  for each row execute function public.tr_ficha_inv_cliente_col('cliente_id');

drop trigger if exists trg_ficha_inv on public.cliente_documento;
create trigger trg_ficha_inv after insert or update or delete on public.cliente_documento
  for each row execute function public.tr_ficha_inv_cliente_col('cliente_id');

drop trigger if exists trg_ficha_inv on public.cliente_nota;
create trigger trg_ficha_inv after insert or update or delete on public.cliente_nota
  for each row execute function public.tr_ficha_inv_cliente_col('cliente_id');

drop trigger if exists trg_ficha_inv on public.cliente_orden;
create trigger trg_ficha_inv after insert or update or delete on public.cliente_orden
  for each row execute function public.tr_ficha_inv_cliente_col('cliente_id');

drop trigger if exists trg_ficha_inv on public.cotizaciones;
create trigger trg_ficha_inv after insert or update or delete on public.cotizaciones
  for each row execute function public.tr_ficha_inv_cliente_col('cliente_id');

drop trigger if exists trg_ficha_inv on public.cobranzas;
create trigger trg_ficha_inv after insert or update or delete on public.cobranzas
  for each row execute function public.tr_ficha_inv_cliente_col('cliente_id');

drop trigger if exists trg_ficha_inv on public.registros_hh;
create trigger trg_ficha_inv after insert or update or delete on public.registros_hh
  for each row execute function public.tr_ficha_inv_obra_col('obra_canonica_id');

drop trigger if exists trg_ficha_inv on public.certificados;
create trigger trg_ficha_inv after insert or update or delete on public.certificados
  for each row execute function public.tr_ficha_inv_obra_col('obra_canonica_id');

drop trigger if exists trg_ficha_inv on public.obra_contrato;
create trigger trg_ficha_inv after insert or update or delete on public.obra_contrato
  for each row execute function public.tr_ficha_inv_obra_col('obra_id');

drop trigger if exists trg_ficha_inv on public.obra_economia_sheet;
create trigger trg_ficha_inv after insert or update or delete on public.obra_economia_sheet
  for each row execute function public.tr_ficha_inv_obra_col('obra_canonica_id');

drop trigger if exists trg_ficha_inv on public.obra_papel;
create trigger trg_ficha_inv after insert or update or delete on public.obra_papel
  for each row execute function public.tr_ficha_inv_obra_col('obra_id');

drop trigger if exists trg_ficha_inv on public.obra_carpeta_drive;
create trigger trg_ficha_inv after insert or update or delete on public.obra_carpeta_drive
  for each row execute function public.tr_ficha_inv_obra_col('obra_id');

drop trigger if exists trg_ficha_inv on public.obra_restriccion;
create trigger trg_ficha_inv after insert or update or delete on public.obra_restriccion
  for each row execute function public.tr_ficha_inv_obra_col('obra_id');

drop trigger if exists trg_ficha_inv on public.costos_obra;
create trigger trg_ficha_inv after insert or update or delete on public.costos_obra
  for each row execute function public.tr_ficha_inv_costos_obra();

drop trigger if exists trg_ficha_inv on public.obra_canonica;
create trigger trg_ficha_inv after insert or update or delete on public.obra_canonica
  for each row execute function public.tr_ficha_inv_obra_canonica();

drop trigger if exists trg_ficha_inv on public.compra_sheet;
create trigger trg_ficha_inv after insert or update or delete on public.compra_sheet
  for each statement execute function public.tr_ficha_inv_blanket();

drop trigger if exists trg_ficha_inv on public.perfiles;
create trigger trg_ficha_inv after insert or update or delete on public.perfiles
  for each statement execute function public.tr_ficha_inv_blanket();

drop trigger if exists trg_ficha_inv on public.persona_tarifa;
create trigger trg_ficha_inv after insert or update or delete on public.persona_tarifa
  for each statement execute function public.tr_ficha_inv_blanket();

drop trigger if exists trg_ficha_inv on public.costo_hora_alicuota;
create trigger trg_ficha_inv after insert or update or delete on public.costo_hora_alicuota
  for each statement execute function public.tr_ficha_inv_blanket();

drop trigger if exists trg_ficha_inv on public.drive_index;
create trigger trg_ficha_inv after insert or update or delete on public.drive_index
  for each statement execute function public.tr_ficha_inv_blanket();

drop trigger if exists trg_ficha_inv on public.obra_alias;
create trigger trg_ficha_inv after insert or update or delete on public.obra_alias
  for each statement execute function public.tr_ficha_inv_blanket();

-- ── EL VENCIMIENTO POR TIEMPO PASA A SER LA RED DE SEGURIDAD, NO LA VÍA PRINCIPAL ───────────────────
--
-- Igual al cuerpo de 20260917T1700: sólo cambia 7 → 60 minutos. La frescura normal ya la dan los
-- triggers (invalidan al escribir; el cron, cada 2 min, repone lo invalidado). 60 min es la red para
-- lo que este inventario no cubre (motor de cotización/planificación, ver cabecera) y para cualquier
-- escritura futura que llegue por una tabla no contemplada acá — nunca sirve más de 10 min por
-- `ficha_cliente_cache_leer` (20260913T1500), así que 60 es un techo de cuánto puede tardar en
-- REPONERSE algo vencido, no de cuánto puede servirse viejo.
CREATE OR REPLACE FUNCTION public.refrescar_ficha_cliente_cache(p_slug text DEFAULT NULL::text)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_uid     uuid;
  v_rpc     text;
  v_clave   text;
  v_solapa  text;
  v_json    jsonb;
  v_desde   timestamptz;
  v_inicio  timestamptz := clock_timestamp();
  v_n       integer := 0;
begin
  if not pg_try_advisory_xact_lock(hashtext('public.refrescar_ficha_cliente_cache')) then
    return 0;
  end if;

  if p_slug is null and (select count(*) from pg_stat_activity a
                          where a.state = 'active' and a.backend_type = 'client backend'
                            and a.pid <> pg_backend_pid()) > 3 then
    return 0;
  end if;

  select p.id into v_uid
    from public.perfiles p
   where p.rol = 'direccion' and p.es_prueba = false
   order by p.created_at, p.id
   limit 1;
  if v_uid is null then
    return 0;
  end if;

  perform set_config('request.jwt.claims',
                     jsonb_build_object('sub', v_uid, 'role', 'authenticated')::text, true);

  delete from public.ficha_cliente_cache c
   where (c.rpc = 'pantalla_cliente' and not exists (select 1 from public.clientes k where k.slug = c.clave))
      or (c.rpc = 'hh_de_obra' and not exists (select 1 from public.obra_canonica o where o.id = c.clave));

  for v_rpc, v_clave, v_solapa in
    select x.rpc, x.clave, x.solapa
      from (
        select 'pantalla_cliente'::text as rpc, k.slug as clave, s.solapa
          from public.clientes k
         cross join unnest(array['obras', 'ordenes', 'cobranzas', 'presupuestos', 'documentos', 'actividad'])
                 as s(solapa)
         where p_slug is null or k.slug = p_slug
        union all
        select 'hh_de_obra', o.id, ''
          from public.obra_canonica o
          join public.clientes k on k.id = o.cliente_id
         where p_slug is null or k.slug = p_slug
      ) x
      left join public.ficha_cliente_cache c
        on c.rpc = x.rpc and c.clave = x.clave and c.solapa = x.solapa
     where p_slug is not null or c.calculado_en is null
        -- 60 MIN (28/09/2026): red de seguridad, no la vía principal — ver la cabecera de esta migración.
        or c.calculado_en < clock_timestamp() - interval '60 minutes'
     order by (c.calculado_en is not null), c.calculado_en nulls first
  loop
    exit when p_slug is null and clock_timestamp() - v_inicio > interval '12 seconds';
    v_desde := clock_timestamp();
    begin
      set local role authenticated;
      if v_rpc = 'pantalla_cliente' then
        v_json := public.pantalla_cliente_en_vivo(v_clave, v_solapa) - 'perfil';
      else
        v_json := public.hh_de_obra_en_vivo(v_clave, null);
      end if;
      reset role;
    exception when others then
      raise warning 'ficha_cliente_cache: % % % no se pudo calcular: %', v_rpc, v_clave, v_solapa, sqlerrm;
      continue;
    end;
    continue when v_json is null;
    insert into public.ficha_cliente_cache as c (rpc, clave, solapa, json, calculado_en, rol_calculo, ms)
    values (v_rpc, v_clave, v_solapa, v_json, v_desde, 'direccion',
            (extract(epoch from clock_timestamp() - v_desde) * 1000)::integer)
    on conflict (rpc, clave, solapa) do update
       set json = excluded.json, calculado_en = excluded.calculado_en,
           rol_calculo = excluded.rol_calculo, ms = excluded.ms;
    v_n := v_n + 1;
  end loop;
  return v_n;
end
$function$;

comment on function public.refrescar_ficha_cliente_cache(text) is
  'Llena ficha_cliente_cache calculando como un perfil real de Dirección. Sin argumento: lo que falta '
  'o quedó invalidado por un trigger (20260928T2330) o tiene más de 60 min (red de seguridad, no la '
  'vía principal de frescura); corta a los 12 s y cede con más de 3 backends activos. Con slug: ese '
  'cliente entero.';

notify pgrst, 'reload schema';
