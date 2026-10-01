-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- HERRAMIENTAS · EL ARREGLO — qué se llevó al mecánico, quién lo llevó, cuándo vuelve y qué se le hizo
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- Dueño, 01/10/2026, textual: «nunca terminaste de hacer lo solicitado en módulo herramientas
-- mantenimiento en donde se registra un arreglo, que esté en el mecánico, que se le hizo, etc.»
--
-- ═══ POR QUÉ SE EXTIENDE `activo_evento` Y NO SE CREA UNA TABLA ═══
--
-- Un arreglo ES un evento del libro de vida: tiene tipo (reparación), situación (pendiente → en_taller → hecho),
-- taller, costo y referencia de compra, y el lugar donde cae el activo ya se mueve ahí (20260930T2300). Una tabla
-- paralela diría dos veces «está en el mecánico» y las dos podrían discrepar. Lo que le faltaba al evento para ser
-- un arreglo completo son CINCO datos del taller y una limitación: sólo valía para rodados.
--
--   llevado_por      quién lo llevó, si no fue quien carga (texto: puede ser un chofer o un tercero sin usuario)
--   ingreso_taller   el día que entró al taller (puede ser anterior a la carga: «lo llevé ayer»). Es el
--                    reloj de los días fuera; `fecha` no sirve: en un evento que venía de «hay que llevarlo»
--                    es el día del aviso, y al cerrarse pasa a ser el de la vuelta.
--   vuelta_estimada  cuándo prometió el mecánico devolverlo. Sin esto no hay «atrasado».
--   trabajo_hecho    qué se le hizo (`descripcion` sigue siendo la falla: lo que pasaba)
--   repuestos        qué se le puso
--   vuelta_en        el día que volvió
--   resultado        cómo quedó: 'operativo' o 'baja' (no tuvo arreglo → se da de baja, por la misma
--                    función de siempre: `dar_de_baja_activo`, motivo 'descartada')
--
-- Y las dos funciones de escritura valen ahora para herramientas y equipos además de rodados.
--
-- ═══ QUÉ NO HACE ═══
--
-- · No escribe en Compras: `compra_ref` es texto (el número del comprobante) y el costo vive acá, una vez.
-- · No admite lotes (cantidad > 1): el estado es del activo entero; marcar «en el mecánico» un lote de 20
--   baldes por uno roto los dejaría a todos como no disponibles. Un lote roto se reporta como siempre.
-- · No abre nada nuevo: la tabla sigue de sólo lectura para `authenticated` y escribe quien ya escribía
--   (`_activo_usuario()`: cualquier usuario logueado; el mismo criterio para todos los niveles del módulo).
--
-- ═══ SOBRE LAS FUNCIONES ═══
--
-- Se REEMPLAZAN (drop + create) en vez de sumar una sobrecarga: PostgREST resuelve por nombres de
-- parámetros y dos firmas con defaults le resultan ambiguas. La firma nueva es un superconjunto de la
-- vieja con todo lo nuevo en default null, así que quien llame con los argumentos de antes sigue andando.
--
-- Va DESPUÉS de 20260930T2300. SIN `begin/commit` PROPIOS: los pone `orquestador/scripts/aplicar-migracion.mjs`.

set local lock_timeout = '5s';

do $$
begin
  if to_regclass('public.activo_evento') is null then
    raise exception 'falta aplicar 20260930T2300_rodados_libro_de_vida: sin activo_evento no hay arreglos';
  end if;
end $$;

-- ── LAS COLUMNAS: una columna nueva nace sin permiso por columna, pero `activo_evento` se lee con grant de tabla
-- (se verifica al final). Todas nulas: lo cargado antes de hoy no tiene estos datos y no se inventan.
alter table public.activo_evento
  add column if not exists llevado_por     text check (llevado_por is null or length(btrim(llevado_por)) between 2 and 120),
  add column if not exists ingreso_taller  date,
  add column if not exists vuelta_estimada date,
  add column if not exists trabajo_hecho   text check (trabajo_hecho is null or length(btrim(trabajo_hecho)) between 3 and 1000),
  add column if not exists repuestos       text check (repuestos is null or length(btrim(repuestos)) between 2 and 500),
  add column if not exists vuelta_en       date,
  add column if not exists resultado       text check (resultado is null or resultado in ('operativo', 'baja'));

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'activo_evento_fechas_taller_chk') then
    alter table public.activo_evento add constraint activo_evento_fechas_taller_chk check (
      (vuelta_estimada is null or ingreso_taller is null or vuelta_estimada >= ingreso_taller)
      and (vuelta_en is null or ingreso_taller is null or vuelta_en >= ingreso_taller));
  end if;
  -- Un resultado sólo existe en un evento cerrado.
  if not exists (select 1 from pg_constraint where conname = 'activo_evento_resultado_cierre_chk') then
    alter table public.activo_evento add constraint activo_evento_resultado_cierre_chk check (resultado is null or situacion = 'hecho');
  end if;
end $$;

-- Lo que ya pasó por el mecánico antes de hoy: el día de ingreso sale de cuándo se envió (hora de San Juan) y,
-- si ya volvió, la vuelta es la fecha del cierre (nunca anterior al ingreso).
update public.activo_evento
   set ingreso_taller = (enviado_en at time zone 'America/Argentina/San_Juan')::date
 where ingreso_taller is null and enviado_en is not null;
update public.activo_evento
   set vuelta_en = greatest(fecha, ingreso_taller)
 where vuelta_en is null and situacion = 'hecho' and ingreso_taller is not null;

comment on column public.activo_evento.ingreso_taller is 'Día que entró al taller. Reloj de los días fuera; null = nunca pasó por el mecánico.';
comment on column public.activo_evento.vuelta_estimada is 'Cuándo prometió el mecánico devolverlo; pasada y sin volver = atrasado.';
comment on column public.activo_evento.vuelta_en is 'Día que volvió del taller.';
comment on column public.activo_evento.trabajo_hecho is 'Qué se le hizo (descripcion es la falla).';
comment on column public.activo_evento.resultado is 'Cómo quedó al cerrar: operativo o baja.';

-- El próximo service por fecha entra al semáforo de vencimientos sólo para lo que se revisa (rodados y equipos):
-- `registrar_revision_activo` ya rechaza la herramienta de mano, y esta puerta no tiene por qué abrirla.
create or replace function public._evento_asentar_service(p_evento uuid) returns void
language plpgsql security definer set search_path = public as $$
declare e activo_evento%rowtype;
begin
  select * into e from activo_evento where id = p_evento;
  if e.proximo_fecha is null then return; end if;
  if not exists (select 1 from activo where id = e.activo_id and clase in ('rodado', 'equipo')) then return; end if;
  insert into activo_revision (activo_id, tipo, fecha, vencimiento, lectura, lugar, observaciones, creado_por)
  values (e.activo_id, 'service', e.fecha, e.proximo_fecha, e.km, left(coalesce(e.taller_texto, ''), 160),
          left('Del libro de vida: ' || e.descripcion, 1000), e.cerrado_por);
end $$;

drop function if exists public.registrar_evento_activo(uuid, text, text, date, text, numeric, uuid, text, numeric, text, numeric, date);
drop function if exists public.avanzar_evento_activo(uuid, text, date, numeric, uuid, text, numeric, text, numeric, date, text);

-- ── UN EVENTO NUEVO, EN LA SITUACIÓN EN QUE ESTÁ HOY ────────────────────────────────────────────
create or replace function public.registrar_evento_activo(
  p_activo uuid, p_tipo text, p_situacion text, p_fecha date, p_descripcion text,
  p_km numeric default null, p_proveedor uuid default null, p_taller text default null, p_costo numeric default null,
  p_compra_ref text default null, p_proximo_km numeric default null, p_proximo_fecha date default null,
  p_llevado_por text default null, p_vuelta_estimada date default null, p_trabajo text default null,
  p_repuestos text default null, p_resultado text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_usr uuid := public._activo_usuario(); v_act activo%rowtype; v_id uuid := gen_random_uuid();
  v_hoy date := (now() at time zone 'America/Argentina/San_Juan')::date;
  v_lugar uuid; v_origen uuid; v_trabajo text; v_res text := coalesce(nullif(btrim(p_resultado), ''), 'operativo');
begin
  select * into v_act from activo where id = p_activo for update;
  if v_act.id is null then raise exception 'el activo no existe' using errcode = 'P0001'; end if;
  if v_act.estado = 'baja' then raise exception '% está dado de baja: no se le cargan eventos', v_act.codigo using errcode = 'P0001'; end if;
  if v_act.cantidad > 1 then
    raise exception '% es un lote de % unidades: el arreglo es de una unidad; reportá el problema del lote', v_act.codigo, v_act.cantidad using errcode = 'P0001';
  end if;
  if p_situacion not in ('pendiente', 'en_taller', 'hecho') then raise exception 'situación no válida: %', p_situacion using errcode = 'P0001'; end if;
  if p_fecha is null then raise exception 'la fecha es obligatoria' using errcode = 'P0001'; end if;
  if p_fecha > v_hoy then raise exception 'la fecha no puede ser futura' using errcode = 'P0001'; end if;
  if p_situacion <> 'pendiente' and p_proveedor is null and nullif(btrim(p_taller), '') is null then
    raise exception 'falta el taller: elegí un proveedor o escribí el nombre (o «propio»)' using errcode = 'P0001';
  end if;
  if p_situacion = 'en_taller' and p_vuelta_estimada is not null and p_vuelta_estimada < p_fecha then
    raise exception 'la vuelta estimada no puede ser anterior al ingreso al taller' using errcode = 'P0001';
  end if;
  if v_res not in ('operativo', 'baja') then raise exception 'el resultado es operativo o baja' using errcode = 'P0001'; end if;
  -- Ya hecho de una vez: qué se le hizo es lo que se cuenta; si no se dijo aparte, es la propia descripción.
  v_trabajo := case when p_situacion = 'hecho' then coalesce(nullif(btrim(p_trabajo), ''), btrim(p_descripcion)) end;

  if p_situacion = 'en_taller' then
    v_lugar := public._lugar_de_taller(p_proveedor, p_taller);
    v_origen := v_act.ubicacion_id;
  end if;

  insert into activo_evento (id, activo_id, tipo, situacion, fecha, km, descripcion, proveedor_id, taller_texto, costo, compra_ref,
                             proximo_km, proximo_fecha, ubicacion_origen, ubicacion_taller, enviado_en, cerrado_en, cerrado_por, creado_por,
                             llevado_por, ingreso_taller, vuelta_estimada, trabajo_hecho, repuestos, resultado)
  values (v_id, p_activo, p_tipo, p_situacion, p_fecha, p_km, btrim(p_descripcion), p_proveedor, nullif(btrim(p_taller), ''), p_costo,
          nullif(btrim(p_compra_ref), ''), p_proximo_km, p_proximo_fecha, v_origen, v_lugar,
          case when p_situacion = 'en_taller' then now() end,
          case when p_situacion = 'hecho' then now() end, case when p_situacion = 'hecho' then v_usr end, v_usr,
          nullif(btrim(p_llevado_por), ''), case when p_situacion = 'en_taller' then p_fecha end,
          case when p_situacion = 'en_taller' then p_vuelta_estimada end, v_trabajo, nullif(btrim(p_repuestos), ''),
          case when p_situacion = 'hecho' then v_res end);

  if p_situacion = 'pendiente' and v_act.estado = 'operativo' then
    perform public.cambiar_estado_activo(p_activo, 'requiere_mantenimiento', 'Hay que llevarlo: ' || btrim(p_descripcion));
  elsif p_situacion = 'en_taller' then
    if v_lugar is distinct from v_act.ubicacion_id then
      perform public.mover_activos(array[p_activo], v_lugar, 'Al taller: ' || btrim(p_descripcion), true);
    end if;
    perform public.cambiar_estado_activo(p_activo, 'reparacion_externa', 'En el taller: ' || btrim(p_descripcion));
  elsif p_situacion = 'hecho' and v_res = 'baja' then
    perform public.dar_de_baja_activo(p_activo, 'descartada', left('No tuvo arreglo: ' || v_trabajo, 400));
  end if;
  if p_situacion = 'hecho' and v_res = 'operativo' then perform public._evento_asentar_service(v_id); end if;
  return v_id;
end $$;

-- ── UN EVENTO ABIERTO AVANZA: pendiente → en_taller → hecho (o pendiente → hecho sin taller) ─────
create or replace function public.avanzar_evento_activo(
  p_evento uuid, p_situacion text, p_fecha date default null, p_km numeric default null,
  p_proveedor uuid default null, p_taller text default null, p_costo numeric default null, p_compra_ref text default null,
  p_proximo_km numeric default null, p_proximo_fecha date default null, p_descripcion text default null,
  p_llevado_por text default null, p_vuelta_estimada date default null, p_trabajo text default null,
  p_repuestos text default null, p_resultado text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_usr uuid := public._activo_usuario(); e activo_evento%rowtype; v_act activo%rowtype;
  v_hoy date := (now() at time zone 'America/Argentina/San_Juan')::date;
  v_lugar uuid; v_en_taller int; v_pend int; v_fecha date; v_trabajo text;
  v_res text := coalesce(nullif(btrim(p_resultado), ''), 'operativo');
begin
  select * into e from activo_evento where id = p_evento for update;
  if e.id is null then raise exception 'el evento no existe' using errcode = 'P0001'; end if;
  if e.situacion = 'hecho' then raise exception 'el evento ya está cerrado' using errcode = 'P0001'; end if;
  if p_situacion not in ('en_taller', 'hecho') or (p_situacion = 'en_taller' and e.situacion = 'en_taller') then
    raise exception 'de % sólo se avanza a %', e.situacion,
      case when e.situacion = 'pendiente' then 'en_taller o hecho' else 'hecho' end using errcode = 'P0001';
  end if;
  if v_res not in ('operativo', 'baja') then raise exception 'el resultado es operativo o baja' using errcode = 'P0001'; end if;
  select * into v_act from activo where id = e.activo_id for update;
  if v_act.estado = 'baja' then raise exception '% está dado de baja', v_act.codigo using errcode = 'P0001'; end if;
  -- Al taller: el día que entró (hoy si no se dijo). Al cierre: el día que volvió (hoy si venía del mecánico).
  v_fecha := coalesce(p_fecha, case when p_situacion = 'en_taller' or e.situacion = 'en_taller' then v_hoy else e.fecha end);
  if v_fecha > v_hoy then raise exception 'la fecha no puede ser futura' using errcode = 'P0001'; end if;
  if p_proximo_fecha is not null and p_proximo_fecha < v_fecha then
    raise exception 'el próximo service no puede ser anterior al evento' using errcode = 'P0001';
  end if;

  if p_situacion = 'en_taller' then
    if p_vuelta_estimada is not null and p_vuelta_estimada < v_fecha then
      raise exception 'la vuelta estimada no puede ser anterior al ingreso al taller' using errcode = 'P0001';
    end if;
    v_lugar := public._lugar_de_taller(coalesce(p_proveedor, e.proveedor_id), coalesce(nullif(btrim(p_taller), ''), e.taller_texto));
    update activo_evento set situacion = 'en_taller', proveedor_id = coalesce(p_proveedor, proveedor_id),
           taller_texto = coalesce(nullif(btrim(p_taller), ''), taller_texto), km = coalesce(p_km, km),
           descripcion = coalesce(nullif(btrim(p_descripcion), ''), descripcion),
           llevado_por = coalesce(nullif(btrim(p_llevado_por), ''), llevado_por), vuelta_estimada = p_vuelta_estimada,
           ingreso_taller = v_fecha, ubicacion_origen = v_act.ubicacion_id, ubicacion_taller = v_lugar, enviado_en = now()
     where id = p_evento;
    if v_lugar is distinct from v_act.ubicacion_id then
      perform public.mover_activos(array[e.activo_id], v_lugar, 'Al taller', true);
    end if;
    perform public.cambiar_estado_activo(e.activo_id, 'reparacion_externa', 'En el taller: ' || e.descripcion);
    return;
  end if;

  -- hecho: se cierra. «Qué se le hizo» es obligatorio: un arreglo cerrado sin eso no le sirve a nadie.
  if coalesce(p_proveedor, e.proveedor_id) is null and coalesce(nullif(btrim(p_taller), ''), e.taller_texto) is null then
    raise exception 'falta dónde se hizo: elegí un proveedor o escribí el nombre (o «propio»)' using errcode = 'P0001';
  end if;
  v_trabajo := coalesce(nullif(btrim(p_trabajo), ''), e.trabajo_hecho);
  if v_trabajo is null or length(v_trabajo) < 3 then
    raise exception 'contá qué se le hizo (3 letras o más)' using errcode = 'P0001';
  end if;
  if e.ingreso_taller is not null and v_fecha < e.ingreso_taller then
    raise exception 'no puede haber vuelto antes de entrar al taller (entró el %)', to_char(e.ingreso_taller, 'DD/MM/YYYY') using errcode = 'P0001';
  end if;
  update activo_evento set situacion = 'hecho', fecha = v_fecha, km = coalesce(p_km, km),
         proveedor_id = coalesce(p_proveedor, proveedor_id), taller_texto = coalesce(nullif(btrim(p_taller), ''), taller_texto),
         costo = coalesce(p_costo, costo), compra_ref = coalesce(nullif(btrim(p_compra_ref), ''), compra_ref),
         proximo_km = coalesce(p_proximo_km, proximo_km), proximo_fecha = coalesce(p_proximo_fecha, proximo_fecha),
         descripcion = coalesce(nullif(btrim(p_descripcion), ''), descripcion),
         trabajo_hecho = v_trabajo, repuestos = coalesce(nullif(btrim(p_repuestos), ''), repuestos), resultado = v_res,
         vuelta_en = case when ingreso_taller is not null then v_fecha end,
         cerrado_en = now(), cerrado_por = v_usr
   where id = p_evento;

  -- Sin arreglo: se da de baja donde está (la baja no se mueve más) y no se vuelve a nada.
  if v_res = 'baja' then
    perform public.dar_de_baja_activo(e.activo_id, 'descartada', left('No tuvo arreglo: ' || v_trabajo, 400));
    return;
  end if;

  if e.ubicacion_taller is not null and v_act.ubicacion_id = e.ubicacion_taller and e.ubicacion_origen is not null
     and exists (select 1 from ubicacion where id = e.ubicacion_origen and not archivada) then
    perform public.mover_activos(array[e.activo_id], e.ubicacion_origen, 'Vuelve del taller', false);
  end if;
  select count(*) filter (where situacion = 'en_taller'), count(*) filter (where situacion = 'pendiente')
    into v_en_taller, v_pend from activo_evento where activo_id = e.activo_id and situacion <> 'hecho';
  if v_en_taller = 0 and v_pend = 0 then
    perform public.cambiar_estado_activo(e.activo_id, 'operativo', 'Reparación hecha: ' || v_trabajo);
  elsif v_en_taller = 0 and v_act.estado = 'reparacion_externa' then
    perform public.cambiar_estado_activo(e.activo_id, 'requiere_mantenimiento', 'Queda algo por llevar');
  end if;
  perform public._evento_asentar_service(p_evento);
end $$;

revoke all on function public._evento_asentar_service(uuid) from public, anon, authenticated;
revoke all on function public.registrar_evento_activo(uuid, text, text, date, text, numeric, uuid, text, numeric, text, numeric, date, text, date, text, text, text) from public, anon;
revoke all on function public.avanzar_evento_activo(uuid, text, date, numeric, uuid, text, numeric, text, numeric, date, text, text, date, text, text, text) from public, anon;
grant execute on function public.registrar_evento_activo(uuid, text, text, date, text, numeric, uuid, text, numeric, text, numeric, date, text, date, text, text, text) to authenticated;
grant execute on function public.avanzar_evento_activo(uuid, text, date, numeric, uuid, text, numeric, text, numeric, date, text, text, date, text, text, text) to authenticated;

-- ── CONSISTENCIA (al aplicar) ────────────────────────────────────────────────────────────────────
do $$
declare n int; c text;
begin
  -- Seguimos sin abrir escritura directa: ni policy ni grant.
  select count(*) into n from pg_policies where schemaname = 'public' and tablename = 'activo_evento' and cmd <> 'SELECT';
  if n > 0 then raise exception 'activo_evento tiene una policy de escritura: sólo se escribe por funciones'; end if;
  if has_table_privilege('authenticated', 'public.activo_evento', 'INSERT, UPDATE, DELETE') then
    raise exception 'authenticated puede escribir activo_evento directo';
  end if;
  if has_table_privilege('anon', 'public.activo_evento', 'SELECT') then raise exception 'anon lee activo_evento'; end if;
  -- Una columna nueva nace sin permiso si el grant era por columna: acá es de tabla, pero se prueba columna a columna.
  foreach c in array array['llevado_por', 'ingreso_taller', 'vuelta_estimada', 'trabajo_hecho', 'repuestos', 'vuelta_en', 'resultado'] loop
    if not has_column_privilege('authenticated', 'public.activo_evento', c, 'SELECT') then
      raise exception 'authenticated no lee activo_evento.%', c;
    end if;
    if has_column_privilege('anon', 'public.activo_evento', c, 'SELECT') then raise exception 'anon lee activo_evento.%', c; end if;
  end loop;
  -- Una sola firma de cada función, con search_path fijo, y anon sin ejecutar.
  select count(*) into n from pg_proc where pronamespace = 'public'::regnamespace and proname in ('registrar_evento_activo', 'avanzar_evento_activo');
  if n <> 2 then raise exception 'tiene que quedar UNA firma de registrar/avanzar_evento_activo (hay %)', n; end if;
  select count(*) into n from pg_proc where pronamespace = 'public'::regnamespace
     and proname in ('registrar_evento_activo', 'avanzar_evento_activo', '_lugar_de_taller', '_evento_asentar_service')
     and prosecdef and exists (select 1 from unnest(proconfig) cfg where cfg like 'search_path=%');
  if n <> 4 then raise exception 'faltan funciones del libro de vida (% de 4)', n; end if;
  if has_function_privilege('anon', 'public.registrar_evento_activo(uuid,text,text,date,text,numeric,uuid,text,numeric,text,numeric,date,text,date,text,text,text)', 'EXECUTE')
     or has_function_privilege('anon', 'public.avanzar_evento_activo(uuid,text,date,numeric,uuid,text,numeric,text,numeric,date,text,text,date,text,text,text)', 'EXECUTE') then
    raise exception 'anon ejecuta una función de arreglos';
  end if;
  -- Un activo «en reparación externa» sin evento abierto no se puede ubicar ni medir: se avisa, no se inventa.
  select count(*) into n from activo a where a.estado = 'reparacion_externa'
     and not exists (select 1 from activo_evento e where e.activo_id = a.id and e.situacion <> 'hecho');
  if n > 0 then raise notice '% activo(s) en reparación externa sin arreglo cargado: cargarlo para ver desde cuándo y dónde', n; end if;
end $$;

notify pgrst, 'reload schema';
