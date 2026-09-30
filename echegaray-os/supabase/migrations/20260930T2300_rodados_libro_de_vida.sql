-- RODADOS · LIBRO DE VIDA Y ESTADO OPERATIVO (dueño, 30/09/2026).
--
-- «No puedo cargar en Rodados que le hice una reparación, o que está en el mecánico, o que hay que
-- llevarlo; todo lo que está en planilla es RTO y eso no es útil.»
--
-- El estado ya existía en activo.estado (operativo · requiere_mantenimiento · reparacion_externa ·
-- fuera_servicio); lo que faltaba era el HECHO que lo explica: qué pasó, cuándo, con cuántos km, en qué
-- taller, cuánto costó y cuándo toca el próximo service. Eso es `activo_evento`.
--
--   situacion = 'pendiente' → «hay que llevarlo»      (estado: requiere_mantenimiento)
--               'en_taller' → «está en el mecánico»   (estado: reparacion_externa; el rodado se MUEVE al
--                              lugar del taller y guarda de dónde salió)
--               'hecho'     → libro de vida            (vuelve a donde estaba; operativo si no queda otro abierto)
--
-- El próximo service por FECHA se escribe además como una fila de `activo_revision` (tipo service, sin costo:
-- el costo vive en el evento, una sola vez) para que salga en el MISMO semáforo de vencimientos que la RTO.
-- El próximo service por KM queda en el evento y se compara con el último km leído (lo hace la pantalla).
-- `compra_ref` es texto libre: la puerta para cruzar el gasto con Compras por activo_id, sin inventar un costo
-- por unidad que hoy no existe.
--
-- Como el resto del módulo, las tablas sólo se leen; escriben funciones security definer.

create table if not exists public.activo_evento (
  id               uuid primary key default gen_random_uuid(),
  activo_id        uuid not null references public.activo(id),
  tipo             text not null check (tipo in ('reparacion', 'service', 'neumaticos', 'bateria', 'chapa', 'otro')),
  situacion        text not null check (situacion in ('pendiente', 'en_taller', 'hecho')),
  fecha            date not null,
  km               numeric(12, 1) check (km is null or km >= 0),
  descripcion      text not null check (length(btrim(descripcion)) between 3 and 1000),
  proveedor_id     uuid references public.proveedores(id),
  taller_texto     text check (taller_texto is null or length(btrim(taller_texto)) between 2 and 160),
  costo            numeric(14, 2) check (costo is null or costo >= 0),
  compra_ref       text check (compra_ref is null or length(compra_ref) <= 120),
  proximo_km       numeric(12, 1) check (proximo_km is null or proximo_km >= 0),
  proximo_fecha    date,
  ubicacion_origen uuid references public.ubicacion(id),
  ubicacion_taller uuid references public.ubicacion(id),
  enviado_en       timestamptz,
  cerrado_en       timestamptz,
  cerrado_por      uuid references auth.users(id),
  creado_en        timestamptz not null default now(),
  creado_por       uuid references auth.users(id),
  constraint activo_evento_taller_chk check (situacion = 'pendiente' or proveedor_id is not null or taller_texto is not null),
  constraint activo_evento_cierre_chk check ((situacion = 'hecho') = (cerrado_en is not null)),
  constraint activo_evento_proximo_chk check (proximo_fecha is null or proximo_fecha >= fecha)
);
create index if not exists activo_evento_activo_idx on public.activo_evento (activo_id, fecha desc, creado_en desc);
create index if not exists activo_evento_abierto_idx on public.activo_evento (activo_id) where situacion <> 'hecho';
comment on table public.activo_evento is
  'Libro de vida de un rodado: lo que hay que llevar, lo que está en el mecánico y lo ya hecho. Escriben sólo '
  'registrar_evento_activo y avanzar_evento_activo. compra_ref es texto libre (puerta a Compras por activo_id).';

alter table public.activo_evento enable row level security;
revoke all on public.activo_evento from anon, public;
revoke insert, update, delete on public.activo_evento from authenticated;
grant select on public.activo_evento to authenticated;
drop policy if exists activo_evento_select on public.activo_evento;
create policy activo_evento_select on public.activo_evento for select to authenticated using (true);

-- El lugar de un taller: el del proveedor del padrón si hay; si no, un tercero con ese nombre (se reusa).
create or replace function public._lugar_de_taller(p_proveedor uuid, p_texto text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_nombre text := nullif(btrim(p_texto), '');
begin
  if p_proveedor is not null then return public.ubicacion_de_proveedor(p_proveedor, 'servicio_tecnico'); end if;
  if v_nombre is null then raise exception 'falta el taller: elegí un proveedor o escribí el nombre' using errcode = 'P0001'; end if;
  select id into v_id from ubicacion
   where proveedor_id is null and tipo in ('servicio_tecnico', 'tercero') and lower(nombre) = lower(v_nombre)
   order by archivada, creado_en limit 1;
  if v_id is null then
    insert into ubicacion (tipo, nombre) values ('tercero', v_nombre) returning id into v_id;
  else
    update ubicacion set archivada = false where id = v_id and archivada;
  end if;
  return v_id;
end $$;

-- El próximo service por fecha entra al semáforo de vencimientos (activo_revision tipo service, sin costo).
create or replace function public._evento_asentar_service(p_evento uuid) returns void
language plpgsql security definer set search_path = public as $$
declare e activo_evento%rowtype;
begin
  select * into e from activo_evento where id = p_evento;
  if e.proximo_fecha is null then return; end if;
  insert into activo_revision (activo_id, tipo, fecha, vencimiento, lectura, lugar, observaciones, creado_por)
  values (e.activo_id, 'service', e.fecha, e.proximo_fecha, e.km, left(coalesce(e.taller_texto, ''), 160),
          left('Del libro de vida: ' || e.descripcion, 1000), e.cerrado_por);
end $$;

-- Un evento nuevo, en la situación en que está hoy.
create or replace function public.registrar_evento_activo(
  p_activo uuid, p_tipo text, p_situacion text, p_fecha date, p_descripcion text,
  p_km numeric default null, p_proveedor uuid default null, p_taller text default null, p_costo numeric default null,
  p_compra_ref text default null, p_proximo_km numeric default null, p_proximo_fecha date default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_usr uuid := public._activo_usuario(); v_act activo%rowtype; v_id uuid := gen_random_uuid();
  v_hoy date := (now() at time zone 'America/Argentina/San_Juan')::date;
  v_lugar uuid; v_origen uuid;
begin
  select * into v_act from activo where id = p_activo for update;
  if v_act.id is null then raise exception 'el activo no existe' using errcode = 'P0001'; end if;
  if v_act.clase <> 'rodado' then raise exception 'el libro de vida es de rodados' using errcode = 'P0001'; end if;
  if v_act.estado = 'baja' then raise exception '% está dado de baja: no se le cargan eventos', v_act.codigo using errcode = 'P0001'; end if;
  if p_situacion not in ('pendiente', 'en_taller', 'hecho') then raise exception 'situación no válida: %', p_situacion using errcode = 'P0001'; end if;
  if p_fecha is null then raise exception 'la fecha es obligatoria' using errcode = 'P0001'; end if;
  if p_fecha > v_hoy then raise exception 'la fecha no puede ser futura' using errcode = 'P0001'; end if;
  if p_situacion = 'en_taller' and p_proveedor is null and nullif(btrim(p_taller), '') is null then
    raise exception 'falta el taller: elegí un proveedor o escribí el nombre' using errcode = 'P0001';
  end if;
  if p_situacion = 'hecho' and p_proveedor is null and nullif(btrim(p_taller), '') is null then
    raise exception 'falta dónde se hizo: elegí un proveedor o escribí el nombre (o «propio»)' using errcode = 'P0001';
  end if;

  if p_situacion = 'en_taller' then
    v_lugar := public._lugar_de_taller(p_proveedor, p_taller);
    v_origen := v_act.ubicacion_id;
  end if;

  insert into activo_evento (id, activo_id, tipo, situacion, fecha, km, descripcion, proveedor_id, taller_texto, costo, compra_ref,
                             proximo_km, proximo_fecha, ubicacion_origen, ubicacion_taller, enviado_en, cerrado_en, cerrado_por, creado_por)
  values (v_id, p_activo, p_tipo, p_situacion, p_fecha, p_km, btrim(p_descripcion), p_proveedor, nullif(btrim(p_taller), ''), p_costo,
          nullif(btrim(p_compra_ref), ''), p_proximo_km, p_proximo_fecha, v_origen, v_lugar,
          case when p_situacion = 'en_taller' then now() end,
          case when p_situacion = 'hecho' then now() end, case when p_situacion = 'hecho' then v_usr end, v_usr);

  if p_situacion = 'pendiente' and v_act.estado = 'operativo' then
    perform public.cambiar_estado_activo(p_activo, 'requiere_mantenimiento', 'Hay que llevarlo: ' || btrim(p_descripcion));
  elsif p_situacion = 'en_taller' then
    if v_lugar is distinct from v_act.ubicacion_id then
      perform public.mover_activos(array[p_activo], v_lugar, 'Al taller: ' || btrim(p_descripcion), true);
    end if;
    perform public.cambiar_estado_activo(p_activo, 'reparacion_externa', 'En el taller: ' || btrim(p_descripcion));
  end if;
  if p_situacion = 'hecho' then perform public._evento_asentar_service(v_id); end if;
  return v_id;
end $$;

-- Un evento abierto avanza: pendiente → en_taller → hecho (o pendiente → hecho, si se resolvió sin taller).
create or replace function public.avanzar_evento_activo(
  p_evento uuid, p_situacion text, p_fecha date default null, p_km numeric default null,
  p_proveedor uuid default null, p_taller text default null, p_costo numeric default null, p_compra_ref text default null,
  p_proximo_km numeric default null, p_proximo_fecha date default null, p_descripcion text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_usr uuid := public._activo_usuario(); e activo_evento%rowtype; v_act activo%rowtype;
  v_hoy date := (now() at time zone 'America/Argentina/San_Juan')::date;
  v_lugar uuid; v_en_taller int; v_pend int; v_fecha date;
begin
  select * into e from activo_evento where id = p_evento for update;
  if e.id is null then raise exception 'el evento no existe' using errcode = 'P0001'; end if;
  if e.situacion = 'hecho' then raise exception 'el evento ya está cerrado' using errcode = 'P0001'; end if;
  if p_situacion not in ('en_taller', 'hecho') or (p_situacion = 'en_taller' and e.situacion = 'en_taller') then
    raise exception 'de % sólo se avanza a %', e.situacion,
      case when e.situacion = 'pendiente' then 'en_taller o hecho' else 'hecho' end using errcode = 'P0001';
  end if;
  select * into v_act from activo where id = e.activo_id for update;
  if v_act.estado = 'baja' then raise exception '% está dado de baja', v_act.codigo using errcode = 'P0001'; end if;
  v_fecha := coalesce(p_fecha, e.fecha);
  if v_fecha > v_hoy then raise exception 'la fecha no puede ser futura' using errcode = 'P0001'; end if;
  if p_proximo_fecha is not null and p_proximo_fecha < v_fecha then
    raise exception 'el próximo service no puede ser anterior al evento' using errcode = 'P0001';
  end if;

  if p_situacion = 'en_taller' then
    v_lugar := public._lugar_de_taller(coalesce(p_proveedor, e.proveedor_id), coalesce(nullif(btrim(p_taller), ''), e.taller_texto));
    update activo_evento set situacion = 'en_taller', proveedor_id = coalesce(p_proveedor, proveedor_id),
           taller_texto = coalesce(nullif(btrim(p_taller), ''), taller_texto), km = coalesce(p_km, km),
           descripcion = coalesce(nullif(btrim(p_descripcion), ''), descripcion),
           ubicacion_origen = v_act.ubicacion_id, ubicacion_taller = v_lugar, enviado_en = now()
     where id = p_evento;
    if v_lugar is distinct from v_act.ubicacion_id then
      perform public.mover_activos(array[e.activo_id], v_lugar, 'Al taller', true);
    end if;
    perform public.cambiar_estado_activo(e.activo_id, 'reparacion_externa', 'En el taller: ' || e.descripcion);
    return;
  end if;

  -- hecho: se cierra y vuelve a donde estaba (si sigue en el lugar del taller)
  if coalesce(p_proveedor, e.proveedor_id) is null and coalesce(nullif(btrim(p_taller), ''), e.taller_texto) is null then
    raise exception 'falta dónde se hizo: elegí un proveedor o escribí el nombre (o «propio»)' using errcode = 'P0001';
  end if;
  update activo_evento set situacion = 'hecho', fecha = v_fecha, km = coalesce(p_km, km),
         proveedor_id = coalesce(p_proveedor, proveedor_id), taller_texto = coalesce(nullif(btrim(p_taller), ''), taller_texto),
         costo = coalesce(p_costo, costo), compra_ref = coalesce(nullif(btrim(p_compra_ref), ''), compra_ref),
         proximo_km = coalesce(p_proximo_km, proximo_km), proximo_fecha = coalesce(p_proximo_fecha, proximo_fecha),
         descripcion = coalesce(nullif(btrim(p_descripcion), ''), descripcion),
         cerrado_en = now(), cerrado_por = v_usr
   where id = p_evento;
  if e.ubicacion_taller is not null and v_act.ubicacion_id = e.ubicacion_taller and e.ubicacion_origen is not null
     and exists (select 1 from ubicacion where id = e.ubicacion_origen and not archivada) then
    perform public.mover_activos(array[e.activo_id], e.ubicacion_origen, 'Vuelve del taller', false);
  end if;
  select count(*) filter (where situacion = 'en_taller'), count(*) filter (where situacion = 'pendiente')
    into v_en_taller, v_pend from activo_evento where activo_id = e.activo_id and situacion <> 'hecho';
  if v_en_taller = 0 and v_pend = 0 then
    perform public.cambiar_estado_activo(e.activo_id, 'operativo', 'Reparación hecha: ' || e.descripcion);
  elsif v_en_taller = 0 and v_act.estado = 'reparacion_externa' then
    perform public.cambiar_estado_activo(e.activo_id, 'requiere_mantenimiento', 'Queda algo por llevar');
  end if;
  perform public._evento_asentar_service(p_evento);
end $$;

revoke all on function public._lugar_de_taller(uuid, text), public._evento_asentar_service(uuid) from public, anon, authenticated;
revoke all on function public.registrar_evento_activo(uuid, text, text, date, text, numeric, uuid, text, numeric, text, numeric, date) from public, anon;
revoke all on function public.avanzar_evento_activo(uuid, text, date, numeric, uuid, text, numeric, text, numeric, date, text) from public, anon;
grant execute on function public.registrar_evento_activo(uuid, text, text, date, text, numeric, uuid, text, numeric, text, numeric, date) to authenticated;
grant execute on function public.avanzar_evento_activo(uuid, text, date, numeric, uuid, text, numeric, text, numeric, date, text) to authenticated;

-- ── CONSISTENCIA (al aplicar) ────────────────────────────────────────────────────────────────────
do $$
declare n int;
begin
  select count(*) into n from pg_policies where schemaname = 'public' and tablename = 'activo_evento' and cmd <> 'SELECT';
  if n > 0 then raise exception 'activo_evento tiene una policy de escritura: sólo se escribe por funciones'; end if;
  if has_table_privilege('authenticated', 'public.activo_evento', 'INSERT, UPDATE, DELETE') then
    raise exception 'authenticated puede escribir activo_evento directo';
  end if;
  if has_table_privilege('anon', 'public.activo_evento', 'SELECT') then raise exception 'anon lee activo_evento'; end if;
  if not has_table_privilege('authenticated', 'public.activo_evento', 'SELECT') then raise exception 'authenticated no lee activo_evento'; end if;
  select count(*) into n from pg_proc where pronamespace = 'public'::regnamespace
     and proname in ('registrar_evento_activo', 'avanzar_evento_activo', '_lugar_de_taller', '_evento_asentar_service')
     and prosecdef and exists (select 1 from unnest(proconfig) c where c like 'search_path=%');
  if n <> 4 then raise exception 'faltan funciones del libro de vida (% de 4)', n; end if;
  if has_function_privilege('anon', 'public.registrar_evento_activo(uuid,text,text,date,text,numeric,uuid,text,numeric,text,numeric,date)', 'EXECUTE') then
    raise exception 'anon ejecuta registrar_evento_activo';
  end if;
  select count(*) into n from activo a where a.clase = 'rodado' and a.estado = 'reparacion_externa'
     and not exists (select 1 from activo_evento e where e.activo_id = a.id and e.situacion <> 'hecho');
  if n > 0 then raise notice '% rodado(s) en reparación externa sin evento abierto: cargar el evento para completar el libro', n; end if;
end $$;

notify pgrst, 'reload schema';
