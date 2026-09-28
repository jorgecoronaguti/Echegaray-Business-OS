-- LA CACHÉ DE LA FICHA SE INVALIDA CUANDO CAMBIA EL DATO, NO AL VENCER NI AL SINCRONIZAR (28/09/2026).
--
-- ═══ LO MEDIDO ═══
--
-- `pg_stat_statements`: `select public.refrescar_ficha_cliente_cache()` es el 88 % del tiempo total de
-- Postgres (2.298 llamadas, 3.130 ms de media). `cron.job_run_details`, 24 h: 720 corridas y ~95 s de
-- trabajo por hora, casi todo en las corridas donde algo venció (55 filas: 30 `pantalla_cliente`, 25
-- `hh_de_obra`). Con el vencimiento a 7 min (20260917T1700) TODO vence junto cada ~8 min y se recalcula
-- aunque nada haya cambiado.
--
-- ═══ POR QUÉ HAY DOS MECANISMOS, Y NO UN TRIGGER POR FILA EN TODO ═══
--
-- Las sincronizaciones REESCRIBEN tablas enteras sin que cambie nada: `sync-compras.mjs` borra y
-- reinserta `compra_sheet` y `costos_obra` cada 10 min, `sync-cobranzas.mjs` hace lo mismo con
-- `cobranzas`, `refrescar_obra_papel()` con `obra_papel`, y `jornales-espejo-bloques.mjs` actualiza
-- cada hora las 353 filas de `jornales_bloque_persona` sólo para mover `leido_en` (pg_stat_user_tables:
-- 540 k inserciones en `costos_obra` para 947 filas vivas). Un trigger por fila invalidaría la caché
-- entera en cada corrida y el ahorro real caería a ~20 %. Por eso:
--
--   A · POR FILA (`tr_ficha_inv_fila`, FOR EACH ROW) en las tablas que se escriben de a una — la web,
--       los scripts con `on conflict ... where ... is distinct from`. Un UPDATE que no cambia nada no
--       invalida; uno que MUEVE la fila de cliente u obra invalida al dueño viejo (OLD) y al nuevo (NEW).
--   B · POR HUELLA AL COMMIT en las tablas que las sincronizaciones reescriben. Un trigger por
--       SENTENCIA marca la tabla como tocada en esta transacción; un constraint trigger DIFERIDO, al
--       commit, calcula la huella del contenido por clave (cliente, obra o toda la tabla), la compara
--       con la guardada e invalida SÓLO las claves cuya huella cambió. Un `delete` + `insert` idéntico
--       adentro de UNA transacción no invalida nada. Las columnas que excluye la huella (`id`,
--       `sincronizado_en`, `leido_en`, `refrescado_en`) se verificaron en la base el 28/09: reescribir
--       con ids y sellos nuevos deja el JSON de las 55 filas idéntico (0 de 55 distintas).
--       Por qué no tablas de transición: sólo ven UNA sentencia, y el `delete` y el `insert` de una
--       sincronización son dos.
--
-- «Invalidar» es DEJAR UNA MARCA en `ficha_cliente_cache_pendiente`, nunca borrar de la caché: el
-- cron es el único que escribe `ficha_cliente_cache`, consume las marcas y recalcula con un COMMIT
-- por fila; la lectura no sirve una fila marcada. Ver «LAS MARCAS» y «EL CRON» más abajo.
--
-- `costos_obra` resuelve la obra por `obra_alias.alias = norm_obra(obra_texto)` —el camino de
-- `pantalla_cliente_en_vivo`— y no por su columna `obra_id`, que discrepa en el 45 % de las filas.
-- `compra_sheet` no tiene resolución barata y correcta a cliente (se junta por `referencia_externa`):
-- su huella es de toda la tabla, así que un cambio REAL en Compras invalida todo — uno por cambio,
-- no uno por sincronización. `jornales_bloque_persona` sólo entra a `hh_de_obra_en_vivo` por los
-- límites de quincena de cada persona: su huella es esa proyección y sólo invalida los `hh_de_obra`.
--
-- ═══ EL GRAFO: QUÉ TABLAS LEE LA FICHA (catálogo de la base viva, 28/09, sólo SELECT) ═══
--
-- Recorrido desde `pantalla_cliente_en_vivo` y `hh_de_obra_en_vivo`: las vistas por `pg_depend`
-- (exacto), las funciones por su `prosrc` (una arista es un `from`/`join` sobre una relación o una
-- llamada `f(`) más su `pg_depend`. 73 vistas y funciones, 53 tablas. Toda tabla del grafo tiene un
-- `trg_ficha_inv` más abajo o está en la lista siguiente; `ficha-cliente-cache-invalidacion.test.mjs`
-- lo verifica contra una copia literal del grafo y se pone rojo si una queda sin nada.
-- EL CONTROL DEL GRAFO es `orquestador/scripts/verificar-grafo-ficha-cache.mjs`: recorre el catálogo
-- VIVO (sólo SELECT) y sale con código ≠ 0 si una tabla que hoy lee la ficha no tiene trigger ni
-- está declarada acá. La copia literal del test envejece; el script no. Correrlo antes de aplicar y
-- después de toda migración que toque una vista o función de la ficha.
--
-- ═══ LO QUE QUEDA CUBIERTO SÓLO POR EL VENCIMIENTO (60 min, más la ventana de lectura) ═══
--
--   · Motor de cotización y planificación: `cotizacion_partida`, `analisis`, `analisis_linea`,
--     `recurso`, `recurso_precio`, `tipo_cambio`, `obra_actividad`, `obra_actividad_nota`,
--     `obra_actividad_paso`, `obra_ejecucion`, `obra_ejecucion_equipo`, `obra_documento`,
--     `tarea_tipo`, `cuadrilla`, `pedidos_materiales`: entran por varias vistas y no hay resolución
--     barata y correcta sin replicar la cascada adentro del trigger; y un trigger `todo` en
--     `tipo_cambio` (136 escrituras en pg_stat, casi todas borrados) recalcularía todo cada vez.
--   · `personas` fuera de `nombre_completo`/`nombre_para_mostrar` (que sí tienen trigger).
--   · No son tablas del grafo aunque el nombre aparezca en el texto (el auditor las listó por léxico):
--     `activo` (columna de `clientes` en `cliente_rotulo`), `carga_social` (literal
--     `'carga_social'` en `analisis_costo`), `causa_desvio` (columna en `actividad_horas`), `compras`
--     (sólo en comentarios de `pantalla_cliente_en_vivo`), `obras` (en `cliente_economia` es el
--     nombre de un CTE: `pg_depend` no la registra; la tabla legada tiene 0 escrituras).
--   · La carrera cron/escritura ya no existe: una marca que confirma durante un cálculo sobrevive a
--     la corrida (el cron borra sólo los pares (clave, txid) que leyó) y la lectura no sirve la fila
--     hasta que la corrida siguiente la recalcule.
--   · Fuera del alcance del recorrido: SQL dinámico (`execute format(...)`) y las tablas que leen las
--     policies RLS; la caché se calcula como Dirección, cuyos permisos cambian sólo por `perfiles`.
--
-- ═══ CÓMO SE APLICA (sin tirar el login: lo del 28/09 a las 19:08) ═══
--
-- `create or replace trigger` toma ShareRowExclusiveLock en 39 tablas y lo retiene hasta el commit:
-- no frena lecturas, pero sí escrituras, y con una sincronización a mitad de camino puede esperar o
-- trabarse. `lock_timeout = 3s` corta antes de hacer cola. El único `drop trigger` que queda es sobre
-- `ficha_cliente_cache_tocada`, tabla propia de esta migración. En este orden:
--
--   0. `node orquestador/scripts/verificar-grafo-ficha-cache.mjs` en verde (sólo lee el catálogo).
--   1. Pausar el cron: `select cron.alter_job(<jobid de 'refrescar_ficha_cliente_cache'>, active := false)`.
--      La migración cambia su comando a `call public.refrescar_ficha_cliente_cache()`: la función
--      vieja deja de existir, y un cron activo en el medio fallaría hasta el commit.
--   2. Verificar que no corran `sync-compras`, `sync-cobranzas`, `jornales-espejo-bloques` ni
--      `obras-economia-sync` (systemd / `pg_stat_activity`), y no arrancarlos hasta el paso 5.
--   3. Ensayar con `node orquestador/scripts/aplicar-migracion.mjs <este archivo>` (sin `--aplicar`:
--      corre y deshace; toma los mismos locks, por eso va después del paso 2). Si pasa, aplicar con
--      `--aplicar`.
--   4. Leer en el destino: filas de `ficha_cliente_cache_huella` por tabla (7 tablas), los
--      `trg_ficha_inv*` en `pg_trigger` (uno por tabla con trigger, más `trg_ficha_inv_al_commit`),
--      el `command` del job en `cron.job` y el `count(*)` de `ficha_cliente_cache`.
--   6. Después de reactivar: `cron.job_run_details` de las dos corridas siguientes en `succeeded`, y
--      `ficha_cliente_cache_pendiente` vaciándose (sólo quedan marcas de los últimos 2 min).
--   5. Reactivar el cron (`active := true`) y las sincronizaciones.
--
-- ═══ AHORRO ESTIMADO (ESTIMACIÓN sobre los `ms` medidos, no una medición del efecto) ═══
--
-- Hoy ~2.280 s/día. Sin cambios reales, el lote completo (~12 s) corre una vez por hora: ~290 s/día
-- de piso. Comparar huellas al commit, medido con ROLLBACK: 110-180 ms por sincronización (incluye
-- ida y vuelta), ≤ ~50 s/día con las corridas de hoy. Cada cambio real agrega su recálculo (~0,3 s
-- por fila de cliente; ~12 s si el cambio es en Compras, `perfiles` o `drive_index`). Del orden de
-- −75 % a −85 % según cuántos cambios reales de Compras haya por día.

set lock_timeout = '3s';

-- Borradores de esta migración que borraban la caché desde el trigger (nunca aplicados).
drop function if exists public.ficha_cliente_cache_invalidar_lote(uuid[], text[], boolean);
drop function if exists public.ficha_cliente_cache_invalidar_lote(uuid[], text[], boolean, boolean);

-- ── EL VENCIMIENTO, DEFINIDO UNA VEZ ──────────────────────────────────────────────────────────────
-- Lo leen el cron (qué recalcula) y la lectura (qué sirve). La lectura sirve hasta 10 min más que el
-- vencimiento: el cron corre cada 2 min, corta a los 12 s y cede con carga, así que una fila recién
-- vencida puede tardar algunas corridas en reponerse — y mientras tanto no se sirve en vivo.
create or replace function public.ficha_cliente_cache_vigencia() returns interval
language sql immutable as $function$ select interval '60 minutes' $function$;

comment on function public.ficha_cliente_cache_vigencia() is
  'Edad a la que refrescar_ficha_cliente_cache recalcula una fila (20260928T2330). La lectura sirve '
  'hasta vigencia + 10 min. La frescura normal la dan los triggers trg_ficha_inv*; esto es la red.';

-- ── LAS MARCAS ────────────────────────────────────────────────────────────────────────────────────
-- Un trigger NUNCA toca `ficha_cliente_cache`: el cron retiene esas filas mientras calcula, y un
-- `delete` desde el trigger de `perfiles` o `liquidacion_linea` esperaba ese lock hasta el
-- `lock_timeout = 8s` de `authenticator` o cerraba un 40P01 (rechazo del auditor, 28/09). El trigger
-- deja una marca; la lectura no sirve lo marcado; el cron la consume.
--
-- La clave primaria lleva el `txid` A PROPÓSITO. Con una sola fila por clave (p. ej. un único «*»),
-- una transacción abierta que choca con la marca ya confirmada no deja rastro propio: si el cron la
-- consume antes de que esa transacción confirme, su cambio se pierde hasta el vencimiento. Y un
-- `do update` para evitarlo pondría en fila a todas las escrituras sobre esa marca. Con el `txid`, el
-- `on conflict do nothing` sólo colapsa las marcas de UNA transacción (una sincronización de 1.000
-- filas en modo `todo` deja una sola fila) y ninguna escritura espera a otra ni al cron.
-- Claves: «cliente:<uuid>», «obra:<id>», «hh:*» (sólo desgloses de horas), «*», «cliente:*» y
-- «obra:*» (las dos últimas, de una huella sin resolución, valen como «*»).
create table if not exists public.ficha_cliente_cache_pendiente (
  clave      text        not null,
  txid       bigint      not null default txid_current(),
  marcado_en timestamptz not null default clock_timestamp(),
  primary key (clave, txid)
);
-- Qué tablas de B tocó cada transacción (una fila por tabla y transacción): dispara la comparación.
create table if not exists public.ficha_cliente_cache_tocada (
  txid  bigint not null default txid_current(),
  tabla text   not null,
  primary key (txid, tabla)
);
create table if not exists public.ficha_cliente_cache_huella (
  tabla  text not null,
  clave  text not null,
  huella text not null,
  primary key (tabla, clave)
);
-- Sin policies a propósito: sólo las escriben las funciones SECURITY DEFINER de abajo.
alter table public.ficha_cliente_cache_pendiente enable row level security;
alter table public.ficha_cliente_cache_tocada enable row level security;
alter table public.ficha_cliente_cache_huella enable row level security;
revoke all on public.ficha_cliente_cache_pendiente, public.ficha_cliente_cache_tocada,
  public.ficha_cliente_cache_huella from public, anon, authenticated;

comment on table public.ficha_cliente_cache_pendiente is
  'Marcas de invalidación de ficha_cliente_cache (20260928T2330). Las escriben los triggers '
  'trg_ficha_inv* e invalidar_ficha_cliente_cache; las consume refrescar_ficha_cliente_cache.';

create or replace function public.ficha_cliente_cache_marcar(p_claves text[]) returns void
language sql
volatile
security definer
set search_path to 'public', 'pg_temp'
as $function$
  insert into public.ficha_cliente_cache_pendiente (clave)
  select distinct k from unnest(p_claves) k where k is not null
  on conflict do nothing;
$function$;

revoke all on function public.ficha_cliente_cache_marcar(text[]) from public, anon, authenticated;

-- ¿Hay una marca sin consumir que ensucie esta fila? La lee `ficha_cliente_cache_leer`: entre la
-- escritura y la próxima corrida del cron (≤ 2 min) la pantalla calcula en vivo, como cuando el
-- trigger borraba la fila.
create or replace function public.ficha_cliente_cache_marcada(p_rpc text, p_clave text)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
  select exists (
    select 1 from public.ficha_cliente_cache_pendiente p
     where p.clave in ('*', 'cliente:*', 'obra:*')
        or (p_rpc = 'hh_de_obra' and p.clave in ('hh:*', 'obra:' || p_clave))
        -- LA FICHA DEL CLIENTE DUEÑO TAMBIÉN SE ENSUCIA: muestra HH y costo por obra.
        or (p_rpc = 'pantalla_cliente' and p.clave in (
              select 'cliente:' || k.id from public.clientes k where k.slug = p_clave
              union all
              select 'obra:' || o.id from public.clientes k
                join public.obra_canonica o on o.cliente_id = k.id where k.slug = p_clave)))
$function$;

revoke all on function public.ficha_cliente_cache_marcada(text, text) from public, anon, authenticated;

-- La RPC de la web (`invalidarFicha.ts`) marca igual que un trigger: tampoco espera al cron.
create or replace function public.invalidar_ficha_cliente_cache(p_cliente_id uuid default null)
returns void
language sql
security definer
set search_path to 'public'
as $function$
  select public.ficha_cliente_cache_marcar(
           case when p_cliente_id is null then array['*']
                else array['cliente:' || p_cliente_id]
                     || array(select 'obra:' || o.id from public.obra_canonica o
                               where o.cliente_id = p_cliente_id) end)
   where public.ve_economia();
$function$;

-- ── A · POR FILA ──────────────────────────────────────────────────────────────────────────────────
-- TG_ARGV: [0] modo (`cliente` | `obra` | `obra_canonica` | `cliente_y_obra` | `todo`), [1] columna
-- de la clave (la obra en `obra_canonica` y `cliente_y_obra`, que toman el cliente de `cliente_id`),
-- [2] columnas que no cuentan como cambio, separadas por coma (sellos de tiempo del indexador).
create or replace function public.tr_ficha_inv_fila() returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_modo text   := TG_ARGV[0];
  v_col  text   := TG_ARGV[1];
  v_ign  text[] := string_to_array(coalesce(TG_ARGV[2], ''), ',');
  v_old  jsonb  := case when TG_OP <> 'INSERT' then to_jsonb(OLD) end;
  v_new  jsonb  := case when TG_OP <> 'DELETE' then to_jsonb(NEW) end;
  v_ids  text[];
begin
  -- UN UPDATE QUE NO CAMBIA NADA NO ENSUCIA NADA (`set x = x`, o un upsert que sólo mueve el sello).
  if TG_OP = 'UPDATE' and (v_old - v_ign) = (v_new - v_ign) then
    return null;
  end if;
  if v_modo = 'todo' then
    perform public.ficha_cliente_cache_marcar(array['*']);
    return null;
  end if;
  -- EL DUEÑO VIEJO Y EL NUEVO: un UPDATE que mueve la fila de cliente u obra ensucia a los dos.
  v_ids := array(select distinct x from unnest(array[v_old ->> v_col, v_new ->> v_col]) x
                  where x is not null);
  if v_modo = 'cliente' then
    perform public.ficha_cliente_cache_marcar(array(select 'cliente:' || x from unnest(v_ids) x));
  elsif v_modo = 'obra' then
    perform public.ficha_cliente_cache_marcar(array(select 'obra:' || x from unnest(v_ids) x));
  elsif v_modo in ('obra_canonica', 'cliente_y_obra') then
    -- En un DELETE la obra ya no está para hacer join: el cliente sale de la fila misma. Lo mismo
    -- cuando la fila tiene cliente propio que puede no coincidir con el dueño de su obra.
    perform public.ficha_cliente_cache_marcar(
      array(select 'cliente:' || x from unnest(array[v_old ->> 'cliente_id', v_new ->> 'cliente_id']) x)
      || array(select 'obra:' || x from unnest(v_ids) x));
  end if;
  return null;
end
$function$;

revoke all on function public.tr_ficha_inv_fila() from public, anon, authenticated;

comment on function public.tr_ficha_inv_fila() is
  'Trigger FOR EACH ROW (20260928T2330): marca la clave de OLD y de NEW en ficha_cliente_cache_pendiente; '
  'un UPDATE sin cambios (fuera de las columnas de TG_ARGV[2]) no marca. No toca ficha_cliente_cache.';

-- ── B · POR HUELLA AL COMMIT ──────────────────────────────────────────────────────────────────────
comment on table public.ficha_cliente_cache_huella is
  'Huella del contenido, por clave, de las tablas que las sincronizaciones reescriben enteras. Clave: '
  '«cliente:<uuid>», «obra:<id>», «hh:*» (sólo desgloses de horas) o «*» (todo). 20260928T2330.';

-- Qué cuenta como contenido de cada tabla y a qué clave pertenece cada fila. Una fila puede aportar a
-- más de una clave (`cobranzas`: su cliente y su obra; invalidar de más es barato).
create or replace function public.ficha_cliente_cache_huellas(p_tabla text)
returns table (clave text, huella text)
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  return query
  select x.k, md5(string_agg(x.h, '' order by x.h))
    from (
      select '*'::text as k, md5((to_jsonb(t) - 'sincronizado_en')::text) as h
        from public.compra_sheet t where p_tabla = 'compra_sheet'
      union all
      select 'cliente:' || coalesce(t.cliente_id::text, '*'), md5((to_jsonb(t) - 'id' - 'sincronizado_en')::text)
        from public.cobranzas t where p_tabla = 'cobranzas'
      union all
      select 'obra:' || t.obra_id, md5((to_jsonb(t) - 'id' - 'sincronizado_en')::text)
        from public.cobranzas t where p_tabla = 'cobranzas' and t.obra_id is not null
      union all
      select 'obra:' || a.obra_id, md5((to_jsonb(t) - 'id' - 'sincronizado_en')::text)
        from public.costos_obra t
        join public.obra_alias a on a.alias = public.norm_obra(t.obra_texto)
       where p_tabla = 'costos_obra' and a.obra_id is not null
      union all
      select 'obra:' || t.obra_id, md5((to_jsonb(t) - 'refrescado_en')::text)
        from public.obra_papel t where p_tabla = 'obra_papel'
      union all
      select 'obra:' || coalesce(t.obra_canonica_id, '*'), md5((to_jsonb(t) - 'leido_en')::text)
        from public.obra_economia_sheet t where p_tabla = 'obra_economia_sheet'
      union all
      -- Sin obra, la fila cuenta por el rótulo de cliente del Sheet (texto, sin resolución barata).
      select 'obra:' || coalesce(t.obra_id, '*'), md5((to_jsonb(t) - 'sincronizado_en')::text)
        from public.compra_obra_asignada t where p_tabla = 'compra_obra_asignada'
      union all
      select 'hh:*', md5(concat_ws('|', t.persona_id, t.quincena_desde, t.quincena_hasta))
        from public.jornales_bloque_persona t where p_tabla = 'jornales_bloque_persona'
    ) x
   group by x.k;
end
$function$;

revoke all on function public.ficha_cliente_cache_huellas(text) from public, anon, authenticated;

-- POR SENTENCIA: anota la tabla como tocada en esta transacción (una fila por tabla y transacción;
-- las sentencias siguientes chocan con el `on conflict` y no encolan otra comparación).
create or replace function public.tr_ficha_inv_marcar() returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  insert into public.ficha_cliente_cache_tocada (txid, tabla)
  values (txid_current(), TG_TABLE_NAME)
  on conflict do nothing;
  return null;
end
$function$;

-- AL COMMIT (constraint trigger diferido sobre `tocada`): compara, marca lo que cambió y guarda la
-- huella nueva. Corre adentro de la transacción de la sincronización: por eso sólo marca.
create or replace function public.tr_ficha_inv_comparar() returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_claves  text[];
  v_huellas text[];
begin
  delete from public.ficha_cliente_cache_tocada p where p.txid = NEW.txid and p.tabla = NEW.tabla;
  -- Las claves cuya huella cambió; `huella` null = la clave desapareció.
  select array_agg(coalesce(n.clave, v.clave)), array_agg(n.huella)
    into v_claves, v_huellas
    from public.ficha_cliente_cache_huellas(NEW.tabla) n
    full join (select h.clave, h.huella from public.ficha_cliente_cache_huella h
                where h.tabla = NEW.tabla) v on v.clave = n.clave
   where n.huella is distinct from v.huella;
  if v_claves is null then
    return null;                            -- la sincronización no cambió nada: la caché queda intacta
  end if;
  -- Las claves de la huella ya son claves de marca («cliente:*» y «obra:*» valen como «*»).
  perform public.ficha_cliente_cache_marcar(v_claves);
  delete from public.ficha_cliente_cache_huella h
   using unnest(v_claves, v_huellas) d(clave, huella)
   where h.tabla = NEW.tabla and h.clave = d.clave and d.huella is null;
  insert into public.ficha_cliente_cache_huella (tabla, clave, huella)
  select NEW.tabla, d.clave, d.huella from unnest(v_claves, v_huellas) d(clave, huella)
   where d.huella is not null
  on conflict (tabla, clave) do update set huella = excluded.huella;
  return null;
end
$function$;

revoke all on function public.ficha_cliente_cache_huellas(text), public.tr_ficha_inv_marcar(),
  public.tr_ficha_inv_comparar() from public, anon, authenticated;

-- `create or replace` no acepta CONSTRAINT TRIGGER: acá queda el `drop`, sobre una tabla propia de
-- esta migración que sólo escriben las sincronizaciones (pausadas durante la aplicación).
drop trigger if exists trg_ficha_inv_al_commit on public.ficha_cliente_cache_tocada;
create constraint trigger trg_ficha_inv_al_commit
  after insert on public.ficha_cliente_cache_tocada
  deferrable initially deferred
  for each row execute function public.tr_ficha_inv_comparar();

-- LA HUELLA DE HOY: sin esto, la primera sincronización después de aplicar invalidaría todo.
delete from public.ficha_cliente_cache_huella;
insert into public.ficha_cliente_cache_huella (tabla, clave, huella)
select t.tabla, h.clave, h.huella
  from unnest(array['compra_sheet', 'compra_obra_asignada', 'cobranzas', 'costos_obra', 'obra_papel',
                    'obra_economia_sheet', 'jornales_bloque_persona']) t(tabla)
 cross join lateral public.ficha_cliente_cache_huellas(t.tabla) h;

-- ── LOS TRIGGERS ──────────────────────────────────────────────────────────────────────────────────
-- Un `trg_ficha_inv` por tabla. `create or replace trigger` (PG14+; la base es 17.6) la hace
-- reaplicable tomando ShareRowExclusiveLock, que frena escrituras pero NO lecturas. `drop trigger`
-- toma AccessExclusiveLock: con `perfiles`, `clientes` o `personas` bloqueadas, cada SELECT del login
-- espera detrás (lo que tiró la app 25 min el 28/09).

-- A · por fila, con cliente directo (FK confirmada).
create or replace trigger trg_ficha_inv after insert or update or delete on public.clientes
  for each row execute function public.tr_ficha_inv_fila('cliente', 'id');
create or replace trigger trg_ficha_inv after insert or update or delete on public.cliente_contacto
  for each row execute function public.tr_ficha_inv_fila('cliente', 'cliente_id');
create or replace trigger trg_ficha_inv after insert or update or delete on public.cliente_documento
  for each row execute function public.tr_ficha_inv_fila('cliente', 'cliente_id');
create or replace trigger trg_ficha_inv after insert or update or delete on public.cliente_nota
  for each row execute function public.tr_ficha_inv_fila('cliente', 'cliente_id');
create or replace trigger trg_ficha_inv after insert or update or delete on public.cliente_orden
  for each row execute function public.tr_ficha_inv_fila('cliente', 'cliente_id');
create or replace trigger trg_ficha_inv after insert or update or delete on public.cotizaciones
  for each row execute function public.tr_ficha_inv_fila('cliente', 'cliente_id');
-- `cliente_de_sesion` la lee; los sellos de ingreso del portal no cambian qué sesión es de quién.
create or replace trigger trg_ficha_inv after insert or update or delete on public.cliente_acceso
  for each row execute function public.tr_ficha_inv_fila('cliente', 'cliente_id',
                                                          'primer_ingreso_at,ultimo_ingreso_at,ultimo_dispositivo');
-- Plata: la cuenta corriente del cliente (`cuenta_corriente_de_clientes`). La web cambia el estado y
-- una sincronización la reescribe de a una fila; mover sólo el sello no invalida.
create or replace trigger trg_ficha_inv after insert or update or delete on public.certificado_cliente
  for each row execute function public.tr_ficha_inv_fila('cliente_y_obra', 'obra_id',
                                                          'sincronizado_en,actualizado_at');

-- A · por fila, con obra directa (confirmada contra el cuerpo de la vista que la lee).
create or replace trigger trg_ficha_inv after insert or update or delete on public.registros_hh
  for each row execute function public.tr_ficha_inv_fila('obra', 'obra_canonica_id');
create or replace trigger trg_ficha_inv after insert or update or delete on public.certificados
  for each row execute function public.tr_ficha_inv_fila('obra', 'obra_canonica_id');
create or replace trigger trg_ficha_inv after insert or update or delete on public.obra_contrato
  for each row execute function public.tr_ficha_inv_fila('obra', 'obra_id');
create or replace trigger trg_ficha_inv after insert or update or delete on public.obra_carpeta_drive
  for each row execute function public.tr_ficha_inv_fila('obra', 'obra_id');
create or replace trigger trg_ficha_inv after insert or update or delete on public.obra_restriccion
  for each row execute function public.tr_ficha_inv_fila('obra', 'obra_id');
create or replace trigger trg_ficha_inv after insert or update or delete on public.obra_canonica
  for each row execute function public.tr_ficha_inv_fila('obra_canonica', 'id');
-- Las tres entran por `costo_mo_quincena_calculo` / `costo_mo_quincena` con la obra en la fila.
create or replace trigger trg_ficha_inv after insert or update or delete on public.obra_asignacion
  for each row execute function public.tr_ficha_inv_fila('obra', 'obra_id');
create or replace trigger trg_ficha_inv after insert or update or delete on public.subcontrato
  for each row execute function public.tr_ficha_inv_fila('obra', 'obra_id');
create or replace trigger trg_ficha_inv after insert or update or delete on public.costo_obra_quincena
  for each row execute function public.tr_ficha_inv_fila('obra', 'obra_canonica_id');

-- A · por fila, todo: sin resolución barata y correcta a cliente u obra. Escritura rara, salvo
-- `drive_index`, cuyo indexador reescribe `indexed_at`/`actualizado_at` sin cambiar el archivo.
create or replace trigger trg_ficha_inv after insert or update or delete on public.perfiles
  for each row execute function public.tr_ficha_inv_fila('todo');
create or replace trigger trg_ficha_inv after insert or update or delete on public.persona_tarifa
  for each row execute function public.tr_ficha_inv_fila('todo');
create or replace trigger trg_ficha_inv after insert or update or delete on public.costo_hora_alicuota
  for each row execute function public.tr_ficha_inv_fila('todo');
create or replace trigger trg_ficha_inv after insert or update or delete on public.obra_alias
  for each row execute function public.tr_ficha_inv_fila('todo');
create or replace trigger trg_ficha_inv after insert or update or delete on public.drive_index
  for each row execute function public.tr_ficha_inv_fila('todo', '', 'indexed_at,actualizado_at');
-- Plata: la mano de obra (`costo_mo_quincena_calculo`). La fila es de una PERSONA, y su costo se
-- reparte entre las obras donde cargó horas esa quincena: resolverlo acá sería repetir el cálculo.
create or replace trigger trg_ficha_inv after insert or update or delete on public.liquidacion_linea
  for each row execute function public.tr_ficha_inv_fila('todo', '', 'actualizado_en');
create or replace trigger trg_ficha_inv after insert or update or delete on public.liquidacion_quincena
  for each row execute function public.tr_ficha_inv_fila('todo');
create or replace trigger trg_ficha_inv after insert or update or delete on public.recibo_sueldo_linea
  for each row execute function public.tr_ficha_inv_fila('todo', '', 'cargado_en');
create or replace trigger trg_ficha_inv after insert or update or delete on public.convenio_escala
  for each row execute function public.tr_ficha_inv_fila('todo', '', 'cargada_en');
-- Mueve los días hábiles de toda obra (o de una, con `obra_id`); se escribe pocas veces al año.
create or replace trigger trg_ficha_inv after insert or update or delete on public.calendario_no_laborable
  for each row execute function public.tr_ficha_inv_fila('todo');
-- `presupuesto_monto` lo lee por id desde la cotización, sin pasar por la obra: la columna
-- `obra_canonica_id` no alcanza para saber a quién ensucia.
create or replace trigger trg_ficha_inv after insert or update or delete on public.presupuestos
  for each row execute function public.tr_ficha_inv_fila('todo');
-- Deciden qué fila de Compras es de qué obra y cliente, y con qué nombre (`costo_de_obra_filas`).
create or replace trigger trg_ficha_inv after insert or update or delete on public.proveedores
  for each row execute function public.tr_ficha_inv_fila('todo', '', 'updated_at,actualizado_en');
create or replace trigger trg_ficha_inv after insert or update or delete on public.proveedor_alias
  for each row execute function public.tr_ficha_inv_fila('todo', '', 'actualizado_en');
create or replace trigger trg_ficha_inv after insert or update or delete on public.cliente_alias
  for each row execute function public.tr_ficha_inv_fila('todo');
-- El nombre de la persona sale en el desglose de horas de toda obra donde trabajó.
create or replace trigger trg_ficha_inv after update of nombre_completo, nombre_para_mostrar on public.personas
  for each row execute function public.tr_ficha_inv_fila('todo');

-- B · por huella al commit: las que las sincronizaciones reescriben.
create or replace trigger trg_ficha_inv after insert or update or delete or truncate on public.compra_sheet
  for each statement execute function public.tr_ficha_inv_marcar();
-- `sync-compras.mjs` la borra y reinserta entera en cada corrida (546 k inserciones para 947 filas).
create or replace trigger trg_ficha_inv after insert or update or delete or truncate on public.compra_obra_asignada
  for each statement execute function public.tr_ficha_inv_marcar();
create or replace trigger trg_ficha_inv after insert or update or delete or truncate on public.cobranzas
  for each statement execute function public.tr_ficha_inv_marcar();
create or replace trigger trg_ficha_inv after insert or update or delete or truncate on public.costos_obra
  for each statement execute function public.tr_ficha_inv_marcar();
create or replace trigger trg_ficha_inv after insert or update or delete or truncate on public.obra_papel
  for each statement execute function public.tr_ficha_inv_marcar();
create or replace trigger trg_ficha_inv after insert or update or delete or truncate on public.obra_economia_sheet
  for each statement execute function public.tr_ficha_inv_marcar();
create or replace trigger trg_ficha_inv after insert or update or delete or truncate on public.jornales_bloque_persona
  for each statement execute function public.tr_ficha_inv_marcar();

-- ── EL CRON: consume las marcas y recalcula UNA fila por transacción ───────────────────────────────
-- 20260917T1700 era una función: una sola transacción de hasta 12 s con las filas recalculadas
-- bloqueadas hasta el final. Ahora es un PROCEDURE con COMMIT después de consumir y después de cada
-- fila: ningún lock suyo dura más que un cálculo (~0,3 s).

-- Consume las marcas VISIBLES al empezar y borra EXACTAMENTE esos pares (clave, txid). Una marca que
-- confirma mientras tanto no está en el arreglo, no se borra y la consume la corrida siguiente; hasta
-- entonces la lectura no sirve lo marcado.
create or replace function public.ficha_cliente_cache_consumir() returns integer
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_claves text[];
  v_txids  bigint[];
begin
  delete from public.ficha_cliente_cache c
   where (c.rpc = 'pantalla_cliente' and not exists (select 1 from public.clientes k where k.slug = c.clave))
      or (c.rpc = 'hh_de_obra' and not exists (select 1 from public.obra_canonica o where o.id = c.clave));
  select array_agg(p.clave), array_agg(p.txid) into v_claves, v_txids
    from public.ficha_cliente_cache_pendiente p;
  if v_claves is null then
    return 0;
  end if;
  -- Borrar la fila es lo que la hace recalcular primero (el lote ordena por `calculado_en` nulo).
  delete from public.ficha_cliente_cache c
   where v_claves && array['*', 'cliente:*', 'obra:*']
      or (c.rpc = 'hh_de_obra' and ('hh:*' = any(v_claves) or 'obra:' || c.clave = any(v_claves)))
      or (c.rpc = 'pantalla_cliente'
          and c.clave in (select k.slug from public.clientes k where 'cliente:' || k.id = any(v_claves)
                          union all
                          select k.slug from public.clientes k
                            join public.obra_canonica o on o.cliente_id = k.id
                           where 'obra:' || o.id = any(v_claves)));
  delete from public.ficha_cliente_cache_pendiente p
   using unnest(v_claves, v_txids) d(clave, txid)
   where p.clave = d.clave and p.txid = d.txid;
  return cardinality(v_claves);
end
$function$;

-- Una fila, calculada como un perfil real de Dirección. El `exception` vive acá porque un bloque con
-- `exception` no admite COMMIT: el procedure no puede atrapar el error él mismo.
create or replace function public.ficha_cliente_cache_calcular(
  p_uid uuid, p_rpc text, p_clave text, p_solapa text
) returns boolean
language plpgsql
set search_path to 'public'
as $function$
declare
  v_json  jsonb;
  v_desde timestamptz := clock_timestamp();
begin
  perform set_config('request.jwt.claims',
                     jsonb_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  begin
    set local role authenticated;
    if p_rpc = 'pantalla_cliente' then
      v_json := public.pantalla_cliente_en_vivo(p_clave, p_solapa) - 'perfil';
    else
      v_json := public.hh_de_obra_en_vivo(p_clave, null);
    end if;
    reset role;
  exception when others then
    raise warning 'ficha_cliente_cache: % % % no se pudo calcular: %', p_rpc, p_clave, p_solapa, sqlerrm;
    return false;
  end;
  if v_json is null then
    return false;
  end if;
  insert into public.ficha_cliente_cache as c (rpc, clave, solapa, json, calculado_en, rol_calculo, ms)
  values (p_rpc, p_clave, p_solapa, v_json, v_desde, 'direccion',
          (extract(epoch from clock_timestamp() - v_desde) * 1000)::integer)
  on conflict (rpc, clave, solapa) do update
     set json = excluded.json, calculado_en = excluded.calculado_en,
         rol_calculo = excluded.rol_calculo, ms = excluded.ms;
  return true;
end
$function$;

revoke all on function public.ficha_cliente_cache_consumir(),
  public.ficha_cliente_cache_calcular(uuid, text, text, text) from public, anon, authenticated;

-- Un procedure no puede llevar `set search_path` y hacer COMMIT: todo va calificado con `public.`.
-- El candado es de SESIÓN (el de transacción se soltaría en el primer COMMIT); pg_cron abre una
-- conexión por corrida, así que un error a mitad de camino también lo suelta.
drop function if exists public.refrescar_ficha_cliente_cache(text);
create or replace procedure public.refrescar_ficha_cliente_cache()
language plpgsql
as $procedure$
declare
  v_uid    uuid;
  v_inicio timestamptz := clock_timestamp();
  r        record;
begin
  if not pg_try_advisory_lock(hashtext('public.refrescar_ficha_cliente_cache')) then
    return;
  end if;
  if (select count(*) from pg_catalog.pg_stat_activity a
       where a.state = 'active' and a.backend_type = 'client backend' and a.pid <> pg_backend_pid()) > 3
  then
    perform pg_advisory_unlock(hashtext('public.refrescar_ficha_cliente_cache'));
    return;
  end if;
  select p.id into v_uid
    from public.perfiles p
   where p.rol = 'direccion' and p.es_prueba = false
   order by p.created_at, p.id
   limit 1;
  if v_uid is not null then
    perform public.ficha_cliente_cache_consumir();
    commit;
    -- Un FOR con COMMIT adentro materializa la lista: se calcula una vez, después de consumir.
    for r in
      select x.rpc, x.clave, x.solapa
        from (
          select 'pantalla_cliente'::text as rpc, k.slug as clave, s.solapa
            from public.clientes k
           cross join unnest(array['obras', 'ordenes', 'cobranzas', 'presupuestos', 'documentos',
                                   'actividad']) as s(solapa)
          union all
          select 'hh_de_obra', o.id, ''
            from public.obra_canonica o
            join public.clientes k on k.id = o.cliente_id
        ) x
        left join public.ficha_cliente_cache c
          on c.rpc = x.rpc and c.clave = x.clave and c.solapa = x.solapa
       where c.calculado_en is null
          or c.calculado_en < clock_timestamp() - public.ficha_cliente_cache_vigencia()
       order by (c.calculado_en is not null), c.calculado_en nulls first
    loop
      exit when clock_timestamp() - v_inicio > interval '12 seconds';
      perform public.ficha_cliente_cache_calcular(v_uid, r.rpc, r.clave, r.solapa);
      commit;
    end loop;
  end if;
  perform pg_advisory_unlock(hashtext('public.refrescar_ficha_cliente_cache'));
end
$procedure$;

revoke all on procedure public.refrescar_ficha_cliente_cache() from public, anon, authenticated;

comment on procedure public.refrescar_ficha_cliente_cache() is
  'Cron (20260928T2330): consume las marcas de ficha_cliente_cache_pendiente y recalcula lo que falta '
  'o venció, con COMMIT por fila; corta a los 12 s y cede con más de 3 backends activos.';

-- Una función se llama con SELECT; un procedure con COMMIT adentro sólo corre con CALL, sola en la
-- sentencia (pg_cron manda el comando tal cual). Queda pausado: lo reactiva el paso 5.
select cron.alter_job(j.jobid, command := 'call public.refrescar_ficha_cliente_cache()')
  from cron.job j
 where j.jobname = 'refrescar_ficha_cliente_cache';

-- ── LA LECTURA: igual a 20260913T1500, con la ventana atada al vencimiento y sin servir lo marcado ──
-- Con 10 min fijos, subir el vencimiento no ahorraba nada visible: la fila seguía en la tabla pero la
-- pantalla calculaba en vivo desde el minuto 10.
create or replace function public.ficha_cliente_cache_leer(p_rpc text, p_clave text, p_solapa text)
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $function$
  select c.json || jsonb_build_object('cache_calculado_en', c.calculado_en)
    from public.ficha_cliente_cache c
   where c.rpc = p_rpc
     and c.clave = p_clave
     and c.solapa = p_solapa
     and c.calculado_en > now() - (public.ficha_cliente_cache_vigencia() + interval '10 minutes')
     and c.rol_calculo = public.current_rol()
     and not public.sesion_es_de_prueba()
     and not public.ficha_cliente_cache_marcada(p_rpc, p_clave)
$function$;

revoke all on function public.ficha_cliente_cache_leer(text, text, text) from public, anon;
grant execute on function public.ficha_cliente_cache_leer(text, text, text) to authenticated;

notify pgrst, 'reload schema';
