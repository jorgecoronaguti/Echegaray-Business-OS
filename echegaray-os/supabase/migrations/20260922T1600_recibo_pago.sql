-- RECIBOS DE PAGO — el papel del pago de la quincena a cada persona: se emite, se firma, se archiva.
--
-- Diseño: docs/diseno/efectivo-a-rendir/efectivo-a-rendir.dc.html (D11, D12, D13, M09, M10, M11).
-- Decisiones del dueño del 22/09/2026 que mandan sobre el diseño:
--   · «Recibos de pago: hacelos, no hace falta revisión» del contador.
--   · Firma con el dedo = conformidad interna, alcanza. Papel y firma digital CONVIVEN: el trazo del
--     teléfono (M10) y la foto del papel firmado (M11) entran al mismo recibo; Administración verifica
--     y archiva cualquiera de los dos (D13).
--
-- ═══ NO ES `mi_recibo` ═══
--
-- `mi_recibo` publica los PDF de sueldo que liquida el ESTUDIO (el blanco). Esto es el recibo de lo que
-- la EMPRESA le paga a la persona por la quincena —banco + efectivo— y lo emite el OS. Conviven.
--
-- ═══ EL IMPORTE NO SE ESCRIBE ACÁ: ES UNA FOTO DE LA LÍNEA SELLADA ═══
--
-- El recibo se emite sobre `liquidacion_linea` de una quincena CERRADA. Es la misma regla que ya usa la
-- pantalla de Liquidación: una quincena cerrada muestra la foto del sello, columna por columna, y no se
-- pisa con valores manuales ni con el cálculo de hoy (`liquidacionSellada.ts`). El sello ya guardó el
-- valor manual cuando lo había: `cobra`, `total`, `por_banco` y `en_efectivo` de la línea sellada son lo
-- que se pagó. Emitir sobre una quincena abierta sería firmar un número que todavía cambia.
--
-- Al emitir se COPIAN los importes (quincena, horas, bruto, adelantos, total, banco, efectivo). Si la
-- liquidación cambia después —se reabre, se vuelve a sellar distinto— el recibo NO cambia: se ve
-- «desactualizado» (`recibo_pago_desactualizado`) y no se puede firmar ni archivar hasta reemitirlo.
--
-- «SIN TARIFA» NO ES $ 0 (lección `recibo-sin-liquidacion`): una línea sin importe no liquida y el
-- recibo no se emite. La función rechaza bruto ≤ 0, total ≤ 0 y una composición que no cierra.
--
-- ═══ NADA SE BORRA ═══
--
-- Escriben sólo las funciones `security definer`. Reemitir no pisa: el recibo anterior queda con
-- `reemplazado_por` y sigue ahí. Archivar el firmado lo deja vigente en el legajo; el emitido (la foto)
-- es la misma fila y no se toca. El archivo a Drive lo sube la VM (`recibos-a-drive.mjs`): la app no
-- escribe Drive.
--
-- ═══ QUIÉN VE ═══
--
-- Sueldos. Lee la persona su propio recibo (`mi_persona_id()`) y quien liquida (`liquida_sueldos()`:
-- Dirección y Administración, el mismo portero que `liquidacion_linea`). El jefe de obra NO ve los
-- sueldos de terceros (regla del 19/08, `20260913T1200`).
--
-- SIN `begin/commit` PROPIOS: los pone `orquestador/scripts/aplicar-migracion.mjs`.

create table if not exists public.recibo_pago (
  id                    uuid primary key default gen_random_uuid(),
  numero                integer generated always as identity unique,
  anio                  smallint not null,
  codigo                text generated always as ('REC-' || anio::text || '-' || lpad(numero::text, 4, '0')) stored unique,
  -- DE DÓNDE SALIÓ. `on delete set null`: el recibo no traba ninguna operación de la liquidación; si la
  -- línea desaparece, el recibo conserva su foto y se ve desactualizado.
  liquidacion_linea_id  uuid references public.liquidacion_linea(id) on delete set null,
  liquidacion_id        uuid references public.liquidacion_quincena(id) on delete set null,
  persona_id            uuid not null references public.personas(id),
  -- LA FOTO, CONGELADA AL EMITIR.
  desde                 date not null,
  hasta                 date not null,
  grupo                 text not null,
  persona_nombre        text not null,
  categoria             text,
  obra                  text,
  horas                 numeric(10,2),
  valor_hora            numeric(14,2),
  bruto                 numeric(14,2) not null check (bruto > 0),
  adelanto              numeric(14,2) not null default 0 check (adelanto >= 0),
  ya_transferido        numeric(14,2) not null default 0 check (ya_transferido >= 0),
  total                 numeric(14,2) not null check (total > 0),
  por_banco             numeric(14,2) not null check (por_banco >= 0),
  en_efectivo           numeric(14,2) not null check (en_efectivo >= 0),
  emitido_por           uuid not null,
  emitido_en            timestamptz not null default now(),
  estado                text not null default 'emitido'
                          check (estado in ('emitido', 'firmado_telefono', 'firmado_papel', 'archivado', 'observado')),
  -- M10: el trazo con el dedo (un SVG de un solo path) y cuándo.
  trazo                 text,
  firmado_en            timestamptz,
  -- M11: la foto del papel firmado, en el bucket privado `recibos` (`<uid>/recibo/<id>-…`).
  papel_path            text,
  papel_subido_por      uuid,
  papel_subido_en       timestamptz,
  -- D13: lo que se verificó, quién archivó, y lo que se observó.
  verificacion          jsonb,
  archivado_por         uuid,
  archivado_en          timestamptz,
  observacion           text,
  observado_por         uuid,
  observado_en          timestamptz,
  -- La VM lo llena al subir el firmado al legajo.
  drive_file_id         text,
  drive_subido_en       timestamptz,
  -- Reemitir no borra: el anterior apunta al nuevo. Diferida porque el nuevo nace en la misma transacción.
  reemplazado_por       uuid references public.recibo_pago(id) deferrable initially deferred,
  reemplazado_en        timestamptz,
  constraint recibo_pago_compone check (abs(bruto - adelanto - ya_transferido - total) <= 1),
  constraint recibo_pago_cierra check (round(total, 2) = round(por_banco + en_efectivo, 2)),
  constraint recibo_pago_firma check ((trazo is null) = (firmado_en is null)),
  constraint recibo_pago_papel check ((papel_path is null) = (papel_subido_en is null)),
  constraint recibo_pago_archivado check ((estado = 'archivado') = (archivado_en is not null)),
  constraint recibo_pago_observado check (estado <> 'observado' or observacion is not null),
  constraint recibo_pago_reemplazo check ((reemplazado_por is null) = (reemplazado_en is null))
);
-- UN VIGENTE POR LÍNEA. Índice parcial: el `where` sí restringe (un índice único común sobre una columna
-- con NULL no restringiría nada).
create unique index if not exists recibo_pago_vigente_por_linea
  on public.recibo_pago (liquidacion_linea_id) where reemplazado_por is null and liquidacion_linea_id is not null;
create index if not exists recibo_pago_persona_idx on public.recibo_pago (persona_id);
create index if not exists recibo_pago_quincena_idx on public.recibo_pago (desde, hasta);

comment on table public.recibo_pago is
  'Recibo de pago de la quincena (banco + efectivo), foto de la liquidacion_linea sellada al emitir. '
  'No es mi_recibo (PDF del estudio). Escriben sólo las funciones *_recibo_pago.';

-- ── ¿SIGUE DICIENDO LO QUE DICE LA LIQUIDACIÓN? ─────────────────────────────────────────────────
-- `null` = al día. Un texto = por qué no. Es la misma regla que `motivoDesactualizado` en
-- `src/features/recibos/logica.ts`, que la pantalla usa para explicar la diferencia.
create or replace function public.recibo_pago_desactualizado(r public.recibo_pago) returns text
language sql stable security definer set search_path = public as $$
  select case
    when l.id is null then 'la línea de la liquidación ya no existe'
    when q.estado is distinct from 'cerrada' then 'la quincena se reabrió: la liquidación puede cambiar'
    when round(l.horas, 2) is distinct from r.horas
      or round(l.cobra, 2) <> r.bruto or round(l.adelanto, 2) <> r.adelanto
      or round(l.ya_transferido, 2) <> r.ya_transferido or round(l.total, 2) <> r.total
      or round(l.por_banco, 2) <> r.por_banco or round(l.en_efectivo, 2) <> r.en_efectivo
      then 'la liquidación cambió después de emitir'
  end
  from (select 1) x
  left join public.liquidacion_linea l on l.id = r.liquidacion_linea_id
  left join public.liquidacion_quincena q on q.id = l.liquidacion_id
$$;

-- ── LO QUE LEEN LAS PANTALLAS ────────────────────────────────────────────────────────────────────
-- Corre como su dueño porque tiene que comparar contra `liquidacion_linea`, que la persona no puede
-- leer. La cerradura es el WHERE (el patrón de `20260913T1200`): cada uno lo suyo, o quien liquida.
create or replace view public.recibo_pago_estado with (security_invoker = false) as
  select r.*,
         (r.reemplazado_por is null) as vigente,
         public.recibo_pago_desactualizado(r) as desactualizado
    from public.recibo_pago r
   where r.persona_id = public.mi_persona_id() or public.liquida_sueldos();
comment on view public.recibo_pago_estado is
  'recibo_pago + vigente + desactualizado (motivo o null). Portero en el WHERE: la persona lo suyo, liquida_sueldos() todo.';

-- ── PERMISOS: RLS NO ES GRANT, SE PONEN LOS DOS ──────────────────────────────────────────────────
alter table public.recibo_pago enable row level security;
drop policy if exists recibo_pago_select on public.recibo_pago;
create policy recibo_pago_select on public.recibo_pago for select to authenticated
  using (persona_id = (select public.mi_persona_id()) or (select public.liquida_sueldos()));
revoke all on public.recibo_pago from anon, public;
revoke insert, update, delete on public.recibo_pago from authenticated;
grant select on public.recibo_pago to authenticated;
revoke all on public.recibo_pago_estado from anon, public;
grant select on public.recibo_pago_estado to authenticated;
revoke all on function public.recibo_pago_desactualizado(public.recibo_pago) from public, anon;
grant execute on function public.recibo_pago_desactualizado(public.recibo_pago) to authenticated;

-- ── EL PAPEL FIRMADO: BUCKET PRIVADO, UNA CARPETA POR USUARIO ────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('recibos', 'recibos', false, 10485760,
        array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Sube a SU carpeta `<uid>/recibo/…` quien tiene un recibo por firmar, o quien liquida.
drop policy if exists recibos_sube on storage.objects;
create policy recibos_sube on storage.objects for insert to authenticated
  with check (
    bucket_id = 'recibos'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
    and (storage.foldername(name))[2] = 'recibo'
    and ((select public.liquida_sueldos()) or exists (
          select 1 from public.recibo_pago r
           where r.persona_id = (select public.mi_persona_id())
             and r.reemplazado_por is null and r.estado in ('emitido', 'firmado_telefono')))
  );
-- Lee lo suyo, y quien liquida lee todo (D13 muestra la foto para verificarla).
drop policy if exists recibos_lee on storage.objects;
create policy recibos_lee on storage.objects for select to authenticated
  using (bucket_id = 'recibos'
         and ((storage.foldername(name))[1] = (select auth.uid()::text) or (select public.liquida_sueldos())));

-- ── LAS FUNCIONES QUE ESCRIBEN ───────────────────────────────────────────────────────────────────
create or replace function public._recibo_exigir_liquidacion() returns uuid
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'hace falta un usuario logueado' using errcode = '42501'; end if;
  if not public.liquida_sueldos() then
    raise exception 'los recibos de pago los emite y archiva Dirección o Administración' using errcode = '42501';
  end if;
  return auth.uid();
end $$;

-- EMITIR: toda la quincena (p_persona null) o una persona. Devuelve lo emitido y lo rechazado con su
-- motivo: una línea que no se puede emitir no frena a las demás, pero se dice.
create or replace function public.emitir_recibos_pago(p_desde date, p_hasta date, p_persona uuid default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_usr uuid := public._recibo_exigir_liquidacion();
  f record; v_previo recibo_pago; v_motivo text; v_nuevo uuid; v_codigo text;
  v_emitidos jsonb := '[]'::jsonb; v_rechazados jsonb := '[]'::jsonb;
begin
  if p_desde is null or p_hasta is null or p_hasta < p_desde then
    raise exception 'quincena inválida' using errcode = 'P0001';
  end if;
  for f in
    select l.*, q.estado as q_estado, q.grupo as q_grupo, p.nombre_completo,
           coalesce(l.categoria_sellada, p.categoria) as cat
      from liquidacion_quincena q
      join liquidacion_linea l on l.liquidacion_id = q.id
      join personas p on p.id = l.persona_id
     where q.desde = p_desde and q.hasta = p_hasta
       and (p_persona is null or l.persona_id = p_persona)
     order by p.nombre_completo
  loop
    v_motivo := case
      when f.q_estado <> 'cerrada' then 'la quincena está abierta: el recibo sale de la foto sellada al cerrarla'
      when f.cobra is null or f.cobra <= 0 then 'no liquida: sin importe en la liquidación'
      when f.total <= 0 then 'el total a pagar es cero o negativo: no se emite un recibo en $ 0'
      when abs(f.cobra - f.adelanto - f.ya_transferido - f.total) > 1 then 'la composición no cierra: bruto − adelantos ≠ total'
      when f.por_banco < 0 or f.en_efectivo < 0 then 'banco o efectivo negativo'
    end;
    select * into v_previo from recibo_pago
     where liquidacion_linea_id = f.id and reemplazado_por is null for update;
    if v_motivo is null and v_previo.id is not null
       and v_previo.estado <> 'observado' and public.recibo_pago_desactualizado(v_previo) is null then
      v_motivo := v_previo.codigo || ' ya está vigente y al día';
    end if;
    if v_motivo is not null then
      v_rechazados := v_rechazados || jsonb_build_object('persona_id', f.persona_id, 'nombre', f.nombre_completo, 'motivo', v_motivo);
      continue;
    end if;
    v_nuevo := gen_random_uuid();
    if v_previo.id is not null then
      update recibo_pago set reemplazado_por = v_nuevo, reemplazado_en = now() where id = v_previo.id;
    end if;
    insert into recibo_pago (id, anio, liquidacion_linea_id, liquidacion_id, persona_id, desde, hasta, grupo,
                             persona_nombre, categoria, obra, horas, valor_hora, bruto, adelanto, ya_transferido,
                             total, por_banco, en_efectivo, emitido_por)
    values (v_nuevo, extract(year from p_hasta)::smallint, f.id, f.liquidacion_id, f.persona_id, p_desde, p_hasta,
            f.q_grupo, f.nombre_completo, nullif(trim(f.cat), ''),
            -- LA OBRA DE LA QUINCENA: la de más horas imputadas en la ventana. Sin horas, sin obra (no se inventa).
            (select o.nombre from registros_hh h join obra_canonica o on o.id = h.obra_canonica_id
              where h.persona_id = f.persona_id and h.fecha between p_desde and p_hasta
              group by o.nombre order by sum(h.horas) desc, o.nombre limit 1),
            f.horas, f.valor_hora, round(f.cobra, 2), round(f.adelanto, 2), round(f.ya_transferido, 2),
            round(f.total, 2), round(f.por_banco, 2), round(f.en_efectivo, 2), v_usr)
    returning codigo into v_codigo;
    v_emitidos := v_emitidos || jsonb_build_object('id', v_nuevo, 'codigo', v_codigo, 'persona_id', f.persona_id,
                                                   'reemplaza', v_previo.codigo);
  end loop;
  return jsonb_build_object('emitidos', v_emitidos, 'rechazados', v_rechazados);
end $$;

-- Lo común a firmar y subir el papel: el recibo existe, es el vigente y dice lo que dice la liquidación.
create or replace function public._recibo_firmable(p_recibo uuid) returns public.recibo_pago
language plpgsql security definer set search_path = public as $$
declare r recibo_pago; v_desact text;
begin
  if auth.uid() is null then raise exception 'hace falta un usuario logueado' using errcode = '42501'; end if;
  select * into r from recibo_pago where id = p_recibo for update;
  if r.id is null then raise exception 'el recibo no existe' using errcode = 'P0001'; end if;
  if r.reemplazado_por is not null then raise exception '% fue reemplazado por otro: se firma el nuevo', r.codigo using errcode = 'P0001'; end if;
  v_desact := public.recibo_pago_desactualizado(r);
  if v_desact is not null then raise exception '% está desactualizado (%): hay que reemitirlo', r.codigo, v_desact using errcode = 'P0001'; end if;
  return r;
end $$;

-- M10 · FIRMAR CON EL DEDO: sólo la persona del recibo. Nadie firma por otro.
create or replace function public.firmar_recibo_pago(p_recibo uuid, p_trazo text) returns void
language plpgsql security definer set search_path = public as $$
declare r recibo_pago := public._recibo_firmable(p_recibo);
begin
  if r.persona_id is distinct from public.mi_persona_id() then
    raise exception 'el recibo lo firma la persona a la que se le paga' using errcode = '42501';
  end if;
  if r.estado <> 'emitido' then raise exception '% ya está %', r.codigo, replace(r.estado, '_', ' ') using errcode = 'P0001'; end if;
  -- EL TRAZO ES UN SVG DE UN SOLO PATH, NADA MÁS (el mismo formato que la conformidad del efectivo): se
  -- valida entero para que nunca viaje a una pantalla algo que no sea una firma.
  if p_trazo is null or length(p_trazo) > 60000 or p_trazo !~
     '^<svg xmlns="http://www\.w3\.org/2000/svg" viewBox="0 0 [0-9]+ [0-9]+"><path d="[ML0-9 l-]+" fill="none" stroke="#1F1F1E" stroke-width="2\.4" stroke-linecap="round" stroke-linejoin="round"/></svg>$' then
    raise exception 'falta la firma, o no tiene la forma de una firma' using errcode = 'P0001';
  end if;
  update recibo_pago set trazo = p_trazo, firmado_en = now(), estado = 'firmado_telefono' where id = p_recibo;
end $$;

-- M11 · EL PAPEL FIRMADO: lo sube la persona o quien liquida. Convive con el trazo si ya lo había.
create or replace function public.subir_papel_recibo_pago(p_recibo uuid, p_path text) returns void
language plpgsql security definer set search_path = public as $$
declare r recibo_pago := public._recibo_firmable(p_recibo);
begin
  if r.persona_id is distinct from public.mi_persona_id() and not public.liquida_sueldos() then
    raise exception 'el papel lo sube la persona del recibo o Administración' using errcode = '42501';
  end if;
  if r.estado not in ('emitido', 'firmado_telefono') then
    raise exception '% ya está %', r.codigo, replace(r.estado, '_', ' ') using errcode = 'P0001';
  end if;
  if split_part(coalesce(p_path, ''), '/', 1) <> auth.uid()::text or split_part(p_path, '/', 2) <> 'recibo' then
    raise exception 'la foto tiene que estar en tu carpeta' using errcode = '42501';
  end if;
  if not exists (select 1 from storage.objects where bucket_id = 'recibos' and name = p_path) then
    raise exception 'la foto no llegó al archivo: subila de nuevo' using errcode = 'P0001';
  end if;
  update recibo_pago set papel_path = p_path, papel_subido_por = auth.uid(), papel_subido_en = now(),
         estado = 'firmado_papel' where id = p_recibo;
end $$;

-- D13 · ARCHIVAR: quien liquida, sobre un firmado al día. El firmado queda vigente en el legajo.
create or replace function public.archivar_recibo_pago(p_recibo uuid, p_verificacion jsonb default null) returns void
language plpgsql security definer set search_path = public as $$
declare v_usr uuid := public._recibo_exigir_liquidacion(); r recibo_pago := public._recibo_firmable(p_recibo);
begin
  if r.estado not in ('firmado_telefono', 'firmado_papel') then
    raise exception 'se archiva un recibo firmado; % está %', r.codigo, replace(r.estado, '_', ' ') using errcode = 'P0001';
  end if;
  if p_verificacion is not null and jsonb_typeof(p_verificacion) <> 'object' then
    raise exception 'la verificación es un objeto' using errcode = 'P0001';
  end if;
  update recibo_pago set estado = 'archivado', archivado_en = now(), archivado_por = v_usr,
         verificacion = p_verificacion where id = p_recibo;
end $$;

-- OBSERVAR: quien liquida, sobre cualquiera no archivado («Observar y pedir de nuevo»); o la persona,
-- ANTES de firmar («No coincide»). Lo observado se reemite con `emitir_recibos_pago`.
create or replace function public.observar_recibo_pago(p_recibo uuid, p_motivo text) returns void
language plpgsql security definer set search_path = public as $$
declare r recibo_pago;
begin
  if auth.uid() is null then raise exception 'hace falta un usuario logueado' using errcode = '42501'; end if;
  if nullif(trim(p_motivo), '') is null then raise exception 'decí qué no coincide' using errcode = 'P0001'; end if;
  select * into r from recibo_pago where id = p_recibo for update;
  if r.id is null then raise exception 'el recibo no existe' using errcode = 'P0001'; end if;
  if r.reemplazado_por is not null then raise exception '% ya fue reemplazado', r.codigo using errcode = 'P0001'; end if;
  if not public.liquida_sueldos() then
    if r.persona_id is distinct from public.mi_persona_id() then
      raise exception 'sólo la persona del recibo o Administración' using errcode = '42501';
    end if;
    if r.estado <> 'emitido' then
      raise exception 'después de firmar, el reclamo se hace por otra vía' using errcode = 'P0001';
    end if;
  end if;
  if r.estado = 'archivado' then raise exception '% ya está archivado', r.codigo using errcode = 'P0001'; end if;
  update recibo_pago set estado = 'observado', observacion = trim(p_motivo), observado_por = auth.uid(),
         observado_en = now() where id = p_recibo;
end $$;

revoke all on function public._recibo_exigir_liquidacion(), public._recibo_firmable(uuid),
  public.emitir_recibos_pago(date, date, uuid), public.firmar_recibo_pago(uuid, text),
  public.subir_papel_recibo_pago(uuid, text), public.archivar_recibo_pago(uuid, jsonb),
  public.observar_recibo_pago(uuid, text) from public, anon;
grant execute on function public.emitir_recibos_pago(date, date, uuid), public.firmar_recibo_pago(uuid, text),
  public.subir_papel_recibo_pago(uuid, text), public.archivar_recibo_pago(uuid, jsonb),
  public.observar_recibo_pago(uuid, text) to authenticated;

-- ── TIEMPO REAL ──────────────────────────────────────────────────────────────────────────────────
do $do$
declare
  t text;
begin
  foreach t in array array[
    -- TABLAS-CON-AVISO:inicio
    'recibo_pago'
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
