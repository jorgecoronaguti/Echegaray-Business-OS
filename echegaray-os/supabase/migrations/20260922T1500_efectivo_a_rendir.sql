-- EFECTIVO A RENDIR — etapa 1: la entrega, la devolución, el vínculo con Compras y el saldo.
--
-- Diseño: docs/diseno/efectivo-a-rendir/efectivo-a-rendir.dc.html. Decisiones del dueño del 22/09/2026
-- que mandan sobre el diseño:
--   · SIN plazo de rendición, SIN tope por persona, SIN autorización por encima del tope y SIN bloqueo
--     por rendición vencida («no considerar»). No hay columnas para eso: una regla que no existe no se
--     modela «por si acaso».
--   · Firma con el dedo = conformidad interna. Papel y firma digital conviven.
--   · Permisos: los mismos que Compras (`es_administracion()`: Dirección, Administración y Jefe de
--     obra). Además, cada persona ve SUS entregas (el teléfono, etapa 2).
--
-- ═══ ENTREGAR PLATA NO ES GASTARLA ═══
--
-- La entrega saca efectivo de la caja y lo pone a nombre de una persona: NO es costo de obra. El gasto
-- nace cuando el comprobante se imputa y escribe su fila de Compras, con Tipo pago «A rendir». Esa fila
-- es la única verdad del gasto; acá sólo se guarda el VÍNCULO (qué fila rinde qué entrega).
--
-- La caja física se descuenta UNA vez: en la entrega. La fila «A rendir» de Compras no vuelve a restar
-- (no dice «Efectivo»). La devolución vuelve a entrar a la caja.
--
--   en su poder = entregado − rendido (filas de Compras vinculadas) − devuelto
--
-- ═══ NADA SE BORRA ═══
--
-- Escriben sólo las funciones `security definer`. Una entrega mal cargada se ANULA con motivo, y sólo
-- si todavía no tiene rendiciones ni devoluciones.
--
-- SIN `begin/commit` PROPIOS: los pone `orquestador/scripts/aplicar-migracion.mjs`.

create table if not exists public.efectivo_entrega (
  id               uuid primary key default gen_random_uuid(),
  numero           integer generated always as identity unique,
  codigo           text generated always as ('ER-' || lpad(numero::text, 4, '0')) stored,
  persona_id       uuid not null references public.personas(id),
  obra_id          text references public.obra_canonica(id),
  estructura       boolean not null default false,
  monto            numeric(14,2) not null check (monto > 0),
  para_que         text,
  fecha            date not null default (now() at time zone 'America/Argentina/San_Juan')::date,
  entregada_por    uuid not null,
  creada_en        timestamptz not null default now(),
  conformidad_en   timestamptz,
  conformidad_trazo text,
  conformidad_papel_url text,
  cerrada_en       timestamptz,
  anulada_en       timestamptz,
  anulada_por      uuid,
  anulada_motivo   text,
  -- Cuándo se le avisó a la persona por el canal de Rendiciones (lo pone el proceso de la VM).
  avisada_en       timestamptz,
  aviso_post_id    text,
  -- Toda entrega nace con obra o con «estructura». No hay tercera opción (principio del diseño).
  constraint efectivo_entrega_destino check ((obra_id is not null) <> estructura),
  constraint efectivo_entrega_anulada check ((anulada_en is null) = (anulada_motivo is null))
);
create index if not exists efectivo_entrega_persona_idx on public.efectivo_entrega (persona_id);
create index if not exists efectivo_entrega_obra_idx on public.efectivo_entrega (obra_id);

comment on table public.efectivo_entrega is
  'Efectivo entregado a una persona para rendir. Sale de la caja física en su fecha; NO es costo de obra. '
  'Escribe sólo entregar_efectivo / firmar_conformidad_entrega / anular_entrega.';

create table if not exists public.efectivo_devolucion (
  id               uuid primary key default gen_random_uuid(),
  entrega_id       uuid not null references public.efectivo_entrega(id),
  monto            numeric(14,2) not null check (monto > 0),
  fecha            date not null default (now() at time zone 'America/Argentina/San_Juan')::date,
  recibida_por     uuid references public.personas(id),
  registrada_por   uuid not null,
  registrada_en    timestamptz not null default now(),
  nota             text
);
create index if not exists efectivo_devolucion_entrega_idx on public.efectivo_devolucion (entrega_id);
comment on table public.efectivo_devolucion is
  'Efectivo que vuelve a la caja desde una entrega. Baja el saldo de la persona; no anula la entrega.';

-- El VÍNCULO entre una fila de Compras y la entrega que rinde. La fila de Compras es la verdad del
-- gasto (importe, proveedor, obra); acá sólo se dice de qué entrega salió la plata. La clave es la de
-- `compra_sheet.clave` (CUIT + tipo + número), la misma que usa el circuito de comprobantes para no
-- cargar dos veces. Se llena en la etapa 3 (imputar).
create table if not exists public.efectivo_rendicion (
  id               uuid primary key default gen_random_uuid(),
  entrega_id       uuid not null references public.efectivo_entrega(id),
  compra_clave     text not null unique,
  monto            numeric(14,2) not null check (monto > 0),
  imputada_por     uuid not null,
  imputada_en      timestamptz not null default now()
);
create index if not exists efectivo_rendicion_entrega_idx on public.efectivo_rendicion (entrega_id);
comment on table public.efectivo_rendicion is
  'Qué fila de Compras (clave) rinde qué entrega. El monto es el importe de esa fila al imputarla.';

-- ── LA CUENTA DE CADA ENTREGA, SIEMPRE IGUAL ─────────────────────────────────────────────────────
create or replace view public.efectivo_entrega_saldo with (security_invoker = true) as
  select e.id, e.codigo, e.persona_id, p.nombre_completo as persona, e.obra_id, o.nombre as obra,
         e.estructura, e.fecha, e.monto as entregado,
         coalesce(r.rendido, 0)  as rendido,  coalesce(r.filas, 0) as filas_rendidas,
         coalesce(d.devuelto, 0) as devuelto,
         e.monto - coalesce(r.rendido, 0) - coalesce(d.devuelto, 0) as en_su_poder,
         (e.conformidad_en is not null or e.conformidad_papel_url is not null) as conformidad,
         case when e.anulada_en is not null then 'anulada'
              when e.cerrada_en is not null then 'cerrada'
              else 'abierta' end as estado,
         e.para_que, e.conformidad_en, e.cerrada_en, e.anulada_en, e.anulada_motivo
    from public.efectivo_entrega e
    join public.personas p on p.id = e.persona_id
    left join public.obra_canonica o on o.id = e.obra_id
    left join lateral (select sum(monto) rendido, count(*) filas from public.efectivo_rendicion where entrega_id = e.id) r on true
    left join lateral (select sum(monto) devuelto from public.efectivo_devolucion where entrega_id = e.id) d on true;

-- ── LO QUE LEE LA RÉPLICA DEL SHEET (_EFECTIVO_RAW) ───────────────────────────────────────────────
-- Una fila por movimiento de caja física: la entrega SALE, la devolución ENTRA. Las anuladas no
-- existen para la caja (nunca salió plata, o se corrigió el error de carga).
create or replace view public.efectivo_movimiento_caja with (security_invoker = true) as
  select e.fecha, e.codigo, p.nombre_completo as persona,
         coalesce(o.nombre, 'Estructura') as destino, 'Entrega'::text as movimiento,
         -e.monto as importe, e.creada_en as registrado_en
    from public.efectivo_entrega e
    join public.personas p on p.id = e.persona_id
    left join public.obra_canonica o on o.id = e.obra_id
   where e.anulada_en is null
  union all
  select d.fecha, e.codigo, p.nombre_completo, coalesce(o.nombre, 'Estructura'), 'Devolución', d.monto, d.registrada_en
    from public.efectivo_devolucion d
    join public.efectivo_entrega e on e.id = d.entrega_id
    join public.personas p on p.id = e.persona_id
    left join public.obra_canonica o on o.id = e.obra_id
   where e.anulada_en is null;

-- ── PERMISOS: RLS NO ES GRANT, SE PONEN LOS DOS ──────────────────────────────────────────────────
alter table public.efectivo_entrega    enable row level security;
alter table public.efectivo_devolucion enable row level security;
alter table public.efectivo_rendicion  enable row level security;
create policy efectivo_entrega_select on public.efectivo_entrega for select to authenticated
  using (public.es_administracion() or persona_id = public.mi_persona_id());
create policy efectivo_devolucion_select on public.efectivo_devolucion for select to authenticated
  using (public.es_administracion() or exists (
    select 1 from public.efectivo_entrega e where e.id = entrega_id and e.persona_id = public.mi_persona_id()));
create policy efectivo_rendicion_select on public.efectivo_rendicion for select to authenticated
  using (public.es_administracion() or exists (
    select 1 from public.efectivo_entrega e where e.id = entrega_id and e.persona_id = public.mi_persona_id()));
revoke all on public.efectivo_entrega, public.efectivo_devolucion, public.efectivo_rendicion from anon, public;
revoke insert, update, delete on public.efectivo_entrega, public.efectivo_devolucion, public.efectivo_rendicion from authenticated;
grant select on public.efectivo_entrega, public.efectivo_devolucion, public.efectivo_rendicion to authenticated;
revoke all on public.efectivo_entrega_saldo, public.efectivo_movimiento_caja from anon, public;
grant select on public.efectivo_entrega_saldo, public.efectivo_movimiento_caja to authenticated;

-- ── LAS FUNCIONES QUE ESCRIBEN ───────────────────────────────────────────────────────────────────
create or replace function public._efectivo_exigir_administracion() returns uuid
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'hace falta un usuario logueado' using errcode = '42501'; end if;
  if not public.es_administracion() then
    raise exception 'entregar y recibir efectivo es de Dirección, Administración o Jefe de obra' using errcode = '42501';
  end if;
  return auth.uid();
end $$;

-- ENTREGAR: cuatro datos. Devuelve el código (ER-0001).
create or replace function public.entregar_efectivo(
  p_persona uuid, p_obra text, p_estructura boolean, p_monto numeric, p_para_que text default null,
  p_fecha date default null
) returns text
language plpgsql security definer set search_path = public as $$
declare v_usr uuid := public._efectivo_exigir_administracion(); v_codigo text;
begin
  if p_monto is null or p_monto <= 0 then raise exception 'el monto tiene que ser mayor que cero' using errcode = 'P0001'; end if;
  if (p_obra is not null) = coalesce(p_estructura, false) then
    raise exception 'la entrega va a una obra o a «Estructura»: una de las dos' using errcode = 'P0001';
  end if;
  if not exists (select 1 from personas where id = p_persona) then
    raise exception 'la persona no existe' using errcode = 'P0001';
  end if;
  if p_obra is not null and not exists (select 1 from obra_canonica where id = p_obra) then
    raise exception 'la obra % no está en el índice de obras', p_obra using errcode = 'P0001';
  end if;
  insert into efectivo_entrega (persona_id, obra_id, estructura, monto, para_que, fecha, entregada_por)
  values (p_persona, p_obra, coalesce(p_estructura, false), round(p_monto, 2), nullif(trim(p_para_que), ''),
          coalesce(p_fecha, (now() at time zone 'America/Argentina/San_Juan')::date), v_usr)
  returning codigo into v_codigo;
  return v_codigo;
end $$;

-- CONFORMIDAD: la firma la persona que recibió (trazo del teléfono) o Administración sube el papel.
create or replace function public.firmar_conformidad_entrega(p_entrega uuid, p_trazo text default null, p_papel_url text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare e efectivo_entrega;
begin
  if auth.uid() is null then raise exception 'hace falta un usuario logueado' using errcode = '42501'; end if;
  select * into e from efectivo_entrega where id = p_entrega for update;
  if e.id is null then raise exception 'la entrega no existe' using errcode = 'P0001'; end if;
  if e.anulada_en is not null then raise exception '% está anulada', e.codigo using errcode = 'P0001'; end if;
  if nullif(trim(p_trazo), '') is null and nullif(trim(p_papel_url), '') is null then
    raise exception 'falta la firma: el trazo o la foto del papel' using errcode = 'P0001';
  end if;
  if nullif(trim(p_trazo), '') is not null then
    -- El trazo lo pone sólo quien recibió la plata: nadie firma por otro.
    if e.persona_id is distinct from public.mi_persona_id() then
      raise exception 'la conformidad con el dedo la firma quien recibió el efectivo' using errcode = '42501';
    end if;
    if e.conformidad_en is not null then raise exception '% ya tiene la conformidad firmada', e.codigo using errcode = 'P0001'; end if;
    update efectivo_entrega set conformidad_en = now(), conformidad_trazo = p_trazo where id = p_entrega;
  else
    perform public._efectivo_exigir_administracion();
    update efectivo_entrega set conformidad_papel_url = p_papel_url where id = p_entrega;
  end if;
end $$;

-- DEVOLVER: entra a la caja. Si con esto la entrega queda en cero y no hay nada más, se cierra (si se pide).
create or replace function public.registrar_devolucion_efectivo(
  p_entrega uuid, p_monto numeric, p_recibida_por uuid default null, p_cerrar boolean default true,
  p_nota text default null, p_fecha date default null
) returns numeric
language plpgsql security definer set search_path = public as $$
declare v_usr uuid := public._efectivo_exigir_administracion(); e efectivo_entrega; v_poder numeric;
begin
  select * into e from efectivo_entrega where id = p_entrega for update;
  if e.id is null then raise exception 'la entrega no existe' using errcode = 'P0001'; end if;
  if e.anulada_en is not null then raise exception '% está anulada', e.codigo using errcode = 'P0001'; end if;
  if e.cerrada_en is not null then raise exception '% ya está cerrada', e.codigo using errcode = 'P0001'; end if;
  if p_monto is null or p_monto <= 0 then raise exception 'el monto tiene que ser mayor que cero' using errcode = 'P0001'; end if;
  select en_su_poder into v_poder from efectivo_entrega_saldo where id = p_entrega;
  if round(p_monto, 2) > v_poder then
    raise exception '% tiene % en su poder: no puede devolver %', e.codigo, v_poder, p_monto using errcode = 'P0001';
  end if;
  insert into efectivo_devolucion (entrega_id, monto, fecha, recibida_por, registrada_por, nota)
  values (p_entrega, round(p_monto, 2), coalesce(p_fecha, (now() at time zone 'America/Argentina/San_Juan')::date),
          p_recibida_por, v_usr, nullif(trim(p_nota), ''));
  v_poder := v_poder - round(p_monto, 2);
  -- El cierre no fuerza el cero: si devuelve menos, sigue abierta con el resto.
  if coalesce(p_cerrar, true) and v_poder = 0 then
    update efectivo_entrega set cerrada_en = now() where id = p_entrega;
  end if;
  return v_poder;
end $$;

-- ANULAR: sólo un error de carga, antes de que tenga rendiciones o devoluciones. Queda con motivo.
create or replace function public.anular_entrega_efectivo(p_entrega uuid, p_motivo text) returns void
language plpgsql security definer set search_path = public as $$
declare v_usr uuid := public._efectivo_exigir_administracion(); e efectivo_entrega;
begin
  if nullif(trim(p_motivo), '') is null then raise exception 'anular pide el motivo' using errcode = 'P0001'; end if;
  select * into e from efectivo_entrega where id = p_entrega for update;
  if e.id is null then raise exception 'la entrega no existe' using errcode = 'P0001'; end if;
  if e.anulada_en is not null then return; end if;
  if exists (select 1 from efectivo_rendicion where entrega_id = p_entrega)
     or exists (select 1 from efectivo_devolucion where entrega_id = p_entrega) then
    raise exception '% ya tiene rendiciones o devoluciones: no se anula, se cierra con devolución', e.codigo using errcode = 'P0001';
  end if;
  update efectivo_entrega set anulada_en = now(), anulada_por = v_usr, anulada_motivo = trim(p_motivo) where id = p_entrega;
end $$;

revoke all on function public._efectivo_exigir_administracion(),
  public.entregar_efectivo(uuid, text, boolean, numeric, text, date),
  public.firmar_conformidad_entrega(uuid, text, text),
  public.registrar_devolucion_efectivo(uuid, numeric, uuid, boolean, text, date),
  public.anular_entrega_efectivo(uuid, text) from public, anon;
grant execute on function
  public.entregar_efectivo(uuid, text, boolean, numeric, text, date),
  public.firmar_conformidad_entrega(uuid, text, text),
  public.registrar_devolucion_efectivo(uuid, numeric, uuid, boolean, text, date),
  public.anular_entrega_efectivo(uuid, text) to authenticated;

-- ── RENDIR: EL TICKET ENTRA POR LA MISMA COLA QUE YA CARGA COMPRAS ─────────────────────────────
--
-- La foto del ticket se sube al bucket privado `comprobantes` y entra a `comprobante_entrada` con
-- origen «rendicion». El worker de la VM la procesa con EL MISMO circuito que el bot y la pantalla de
-- Compras (lectura, ARCA, duplicados, escritura con freno de mano) y le fuerza dos datos que el papel
-- no dice: Tipo pago «A rendir» y la obra de la entrega. Con la fila escrita, el worker registra el
-- vínculo en `efectivo_rendicion` y el saldo de la persona baja.
--
-- SIN APROBACIÓN PREVIA: el dueño decidió el 13/08 que el bot escribe Compras sin preguntar. Lo que
-- falta (proveedor ilegible, sin CUIT, duplicado) queda OBSERVADO con el motivo, y se completa.
alter table public.comprobante_entrada drop constraint if exists comprobante_entrada_origen_check;
alter table public.comprobante_entrada add constraint comprobante_entrada_origen_check
  check (origen in ('web', 'rendicion', 'mattermost'));

create table if not exists public.efectivo_comprobante (
  id               uuid primary key default gen_random_uuid(),
  entrega_id       uuid not null references public.efectivo_entrega(id),
  entrada_id       uuid unique references public.comprobante_entrada(id),
  -- Lo que entra por Mattermost no pasa por la cola web: se registra con su post.
  mm_post_id       text unique,
  canal            text not null check (canal in ('app', 'mattermost')),
  enviado_por      uuid,
  enviado_en       timestamptz not null default now(),
  observacion      text,
  observado_por    uuid,
  observado_en     timestamptz,
  respuesta        text,
  respondido_en    timestamptz,
  descartado_en    timestamptz,
  descartado_motivo text,
  constraint efectivo_comprobante_origen check ((entrada_id is not null) <> (mm_post_id is not null))
);
create index if not exists efectivo_comprobante_entrega_idx on public.efectivo_comprobante (entrega_id);
comment on table public.efectivo_comprobante is
  'Cada ticket que una persona manda para rendir una entrega. El archivo y su lectura viven en '
  'comprobante_entrada (o en el post de Mattermost); la fila de Compras que produce, en efectivo_rendicion.';

alter table public.efectivo_rendicion add column if not exists comprobante_id uuid references public.efectivo_comprobante(id);

-- El estado que ve la gente, derivado — nunca tipeado:
--   leyendo · en_compras · observado · respondido · duplicado · error · descartado
-- `respondido`: la persona ya contestó lo que faltaba y la carga todavía no se completó. Sin este
-- estado el ticket seguía «observado» después de contestar: le pedía a la persona algo que ya dio.
create or replace view public.efectivo_comprobante_estado with (security_invoker = true) as
  select c.id, c.entrega_id, e.codigo as entrega, e.persona_id, c.canal, c.enviado_en,
         ce.storage_path, ce.nombre_archivo, ce.media_type, ce.estado as estado_cola, ce.motivo,
         ce.resultado, r.compra_clave, r.monto as monto_rendido,
         c.observacion, c.observado_en, c.respuesta, c.respondido_en, c.descartado_en, c.descartado_motivo,
         case
           when c.descartado_en is not null then 'descartado'
           when r.id is not null then 'en_compras'
           when c.observacion is not null and c.respondido_en is null then 'observado'
           when ce.estado in ('pendiente', 'procesando') then 'leyendo'
           when ce.estado = 'ya_estaba' then 'duplicado'
           when c.respondido_en is not null and ce.estado in ('en_espera', 'rechazado') then 'respondido'
           when ce.estado in ('en_espera', 'rechazado') then 'observado'
           when ce.estado = 'error' then 'error'
           when ce.estado = 'cargado' then 'leyendo'   -- escrito, falta el vínculo (lo pone el worker)
           else 'leyendo'
         end as estado
    from public.efectivo_comprobante c
    join public.efectivo_entrega e on e.id = c.entrega_id
    left join public.comprobante_entrada ce on ce.id = c.entrada_id
    left join lateral (
      select r.* from public.efectivo_rendicion r
       where r.entrega_id = c.entrega_id
         and (r.compra_clave = any (select x->>'clave' from jsonb_array_elements(coalesce(ce.resultado->'comprobantes', '[]'::jsonb)) x)
              or r.comprobante_id = c.id)
       limit 1) r on true;


alter table public.efectivo_comprobante enable row level security;
create policy efectivo_comprobante_select on public.efectivo_comprobante for select to authenticated
  using (public.es_administracion() or exists (
    select 1 from public.efectivo_entrega e where e.id = entrega_id and e.persona_id = public.mi_persona_id()));
revoke all on public.efectivo_comprobante from anon, public;
revoke insert, update, delete on public.efectivo_comprobante from authenticated;
grant select on public.efectivo_comprobante to authenticated;
revoke all on public.efectivo_comprobante_estado from anon, public;
grant select on public.efectivo_comprobante_estado to authenticated;

-- La persona que rinde ve SU ticket en la cola (la pantalla de Compras sigue siendo de Administración).
drop policy if exists comprobante_entrada_select_rendicion on public.comprobante_entrada;
create policy comprobante_entrada_select_rendicion on public.comprobante_entrada for select to authenticated
  using (origen = 'rendicion' and subido_por = (select auth.uid()));

-- Subir la foto: quien tiene una entrega abierta, a SU carpeta `<uid>/rendicion/…`.
drop policy if exists comprobantes_sube_rendicion on storage.objects;
create policy comprobantes_sube_rendicion on storage.objects for insert to authenticated
  with check (
    bucket_id = 'comprobantes'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
    and (storage.foldername(name))[2] = 'rendicion'
    and exists (select 1 from public.efectivo_entrega e
                 where e.persona_id = (select public.mi_persona_id()) and e.anulada_en is null and e.cerrada_en is null)
  );
drop policy if exists comprobantes_lee_rendicion on storage.objects;
create policy comprobantes_lee_rendicion on storage.objects for select to authenticated
  using (bucket_id = 'comprobantes' and (storage.foldername(name))[1] = (select auth.uid()::text)
         and (storage.foldername(name))[2] = 'rendicion');

-- ENCOLAR: después de subir la foto. Quien rinde es la persona de la entrega, o Administración por ella.
create or replace function public.rendir_comprobante(
  p_entrega uuid, p_storage_path text, p_nombre text, p_media_type text, p_bytes bigint, p_lote uuid default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare e efectivo_entrega; v_entrada uuid; v_id uuid;
begin
  if auth.uid() is null then raise exception 'hace falta un usuario logueado' using errcode = '42501'; end if;
  select * into e from efectivo_entrega where id = p_entrega;
  if e.id is null then raise exception 'la entrega no existe' using errcode = 'P0001'; end if;
  if e.persona_id is distinct from public.mi_persona_id() and not public.es_administracion() then
    raise exception 'sólo rinde quien recibió el efectivo, o Administración' using errcode = '42501';
  end if;
  if e.anulada_en is not null or e.cerrada_en is not null then
    raise exception '% está %: no recibe comprobantes', e.codigo, case when e.anulada_en is not null then 'anulada' else 'cerrada' end using errcode = 'P0001';
  end if;
  if split_part(p_storage_path, '/', 1) <> auth.uid()::text or split_part(p_storage_path, '/', 2) <> 'rendicion' then
    raise exception 'el archivo tiene que estar en tu carpeta de rendiciones' using errcode = '42501';
  end if;
  insert into comprobante_entrada (origen, storage_path, lote, nombre_archivo, media_type, bytes, subido_por)
  values ('rendicion', p_storage_path, coalesce(p_lote, gen_random_uuid()), p_nombre, p_media_type, p_bytes, auth.uid())
  returning id into v_entrada;
  insert into efectivo_comprobante (entrega_id, entrada_id, canal, enviado_por)
  values (p_entrega, v_entrada, 'app', auth.uid()) returning id into v_id;
  return v_id;
end $$;

-- OBSERVAR: Administración dice qué falta. RESPONDER: la persona completa el dato.
create or replace function public.observar_comprobante_rendicion(p_comprobante uuid, p_falta text) returns void
language plpgsql security definer set search_path = public as $$
declare v_usr uuid := public._efectivo_exigir_administracion();
begin
  if nullif(trim(p_falta), '') is null then raise exception 'decí qué falta' using errcode = 'P0001'; end if;
  update efectivo_comprobante set observacion = trim(p_falta), observado_por = v_usr, observado_en = now(),
         respuesta = null, respondido_en = null
   where id = p_comprobante and descartado_en is null;
  if not found then raise exception 'el comprobante no existe o está descartado' using errcode = 'P0001'; end if;
end $$;

create or replace function public.responder_observacion_rendicion(p_comprobante uuid, p_dato text) returns void
language plpgsql security definer set search_path = public as $$
declare c efectivo_comprobante; v_persona uuid;
begin
  if auth.uid() is null then raise exception 'hace falta un usuario logueado' using errcode = '42501'; end if;
  select * into c from efectivo_comprobante where id = p_comprobante for update;
  if c.id is null then raise exception 'el comprobante no existe' using errcode = 'P0001'; end if;
  select persona_id into v_persona from efectivo_entrega where id = c.entrega_id;
  if v_persona is distinct from public.mi_persona_id() and not public.es_administracion() then
    raise exception 'contesta quien mandó el ticket, o Administración' using errcode = '42501';
  end if;
  if nullif(trim(p_dato), '') is null then raise exception 'falta el dato' using errcode = 'P0001'; end if;
  update efectivo_comprobante set respuesta = trim(p_dato), respondido_en = now() where id = p_comprobante;
end $$;

create or replace function public.descartar_comprobante_rendicion(p_comprobante uuid, p_motivo text) returns void
language plpgsql security definer set search_path = public as $$
declare v_usr uuid := public._efectivo_exigir_administracion();
begin
  if nullif(trim(p_motivo), '') is null then raise exception 'descartar pide el motivo' using errcode = 'P0001'; end if;
  if exists (select 1 from efectivo_rendicion where comprobante_id = p_comprobante) then
    raise exception 'ya está en Compras: se corrige la fila, no se descarta el ticket' using errcode = 'P0001';
  end if;
  update efectivo_comprobante set descartado_en = now(), descartado_motivo = trim(p_motivo) where id = p_comprobante;
  if not found then raise exception 'el comprobante no existe' using errcode = 'P0001'; end if;
end $$;

revoke all on function public.rendir_comprobante(uuid, text, text, text, bigint, uuid),
  public.observar_comprobante_rendicion(uuid, text), public.responder_observacion_rendicion(uuid, text),
  public.descartar_comprobante_rendicion(uuid, text) from public, anon;
grant execute on function public.rendir_comprobante(uuid, text, text, text, bigint, uuid),
  public.observar_comprobante_rendicion(uuid, text), public.responder_observacion_rendicion(uuid, text),
  public.descartar_comprobante_rendicion(uuid, text) to authenticated;

-- ── EL VÍNCULO SE RECONCILIA, NO SE CONFÍA AL MOMENTO DE LA CARGA ─────────────────────────────────
--
-- Un ticket puede quedar en espera (proveedor fuera del desplegable, dato ilegible) y escribirse en
-- Compras horas después, cuando alguien lo completa. Si el vínculo sólo se pusiera al cargar, ese
-- gasto quedaría rendido en Compras y la persona seguiría debiéndolo. Esta función mira el REGISTRO
-- de lo escrito (`comunicacion.comprobantes_cargados`, la evidencia en su destino) y vincula lo que
-- falte. La llaman la cola web y el canal en cada vuelta; es idempotente.
create or replace function public.vincular_rendiciones_pendientes() returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  insert into efectivo_rendicion (entrega_id, compra_clave, monto, imputada_por, comprobante_id)
  select distinct on (cc.clave) c.entrega_id, cc.clave, round(cc.total::numeric, 2),
         coalesce(c.enviado_por, e.entregada_por), c.id
    from efectivo_comprobante c
    join efectivo_entrega e on e.id = c.entrega_id and e.anulada_en is null
    left join comprobante_entrada ce on ce.id = c.entrada_id
    join comunicacion.comprobantes_cargados cc
      on (c.mm_post_id is not null and cc.plataforma = 'mattermost' and cc.post_id = c.mm_post_id)
      or (ce.id is not null and exists (
            select 1 from comunicacion.comprobante_fajos f
             where f.id = cc.fajo_id and f.plataforma = 'web' and f.channel_id = ce.lote::text))
   where c.descartado_en is null and cc.clave is not null and coalesce(cc.total, 0) > 0
   order by cc.clave, c.enviado_en
  on conflict (compra_clave) do nothing;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.vincular_rendiciones_pendientes() from public, anon, authenticated;

-- El área del canal de rendiciones: el binding canal → área es un DATO (comunicacion.canales_area),
-- y el área tiene que existir para que el especialista la reclame.
insert into public.area_canonica (clave, nombre, orden)
select 'rendicion', 'Rendiciones de efectivo', coalesce(max(orden), 0) + 1 from public.area_canonica
on conflict (clave) do nothing;

-- ── TIEMPO REAL ──────────────────────────────────────────────────────────────────────────────────
do $do$
declare
  t text;
begin
  foreach t in array array[
    -- TABLAS-CON-AVISO:inicio
    'efectivo_entrega', 'efectivo_devolucion', 'efectivo_rendicion', 'efectivo_comprobante'
    -- TABLAS-CON-AVISO:fin
  ]
  loop
    execute format('drop trigger if exists zz_avisar_insert on public.%I', t);
    execute format('drop trigger if exists zz_avisar_update on public.%I', t);
    execute format('drop trigger if exists zz_avisar_delete on public.%I', t);
    execute format(
      'create trigger zz_avisar_insert after insert on public.%I referencing new table as nuevas '
      'for each statement execute function public.avisar_cambio_de_tabla()', t);
    execute format(
      'create trigger zz_avisar_update after update on public.%I referencing old table as viejas new table as nuevas '
      'for each statement execute function public.avisar_cambio_de_tabla()', t);
    execute format(
      'create trigger zz_avisar_delete after delete on public.%I referencing old table as viejas '
      'for each statement execute function public.avisar_cambio_de_tabla()', t);
  end loop;
end;
$do$;

notify pgrst, 'reload schema';
