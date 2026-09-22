-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- EL RECIBO EMITIDO SE FIRMA — y la firma queda con el documento, en el legajo y en el teléfono
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- Diseño: docs/diseno/efectivo-a-rendir/efectivo-a-rendir.dc.html — D12, D13, M09, M10, M11.
--
-- ═══ QUÉ RECUPERA, Y DE DÓNDE ═══
--
-- `20260922T1600_recibo_pago.sql` construyó emitir, firmar con el dedo, subir el papel firmado, archivar,
-- observar y «la versión anterior no se borra». Se retiró entera el 22/09 (`20260922T2000`) porque el dueño
-- rechazó SU PANTALLA —un módulo aparte—, no sus funciones. Esta migración trae esas mismas capacidades a la
-- tabla de la UX que él sí aceptó (`recibo_liquidacion`, 20260922T2600): el recibo se arma al hacer clic en
-- el nombre de la persona, en el panel de Liquidación.
--
-- NO SE REPITE LA TABLA: `recibo_liquidacion` YA guarda la foto del papel (renglones sellados, horas, banco,
-- efectivo, total, nombre y categoría como texto). Lo que le faltaba era el CICLO: enviarlo a firmar, que la
-- persona lo firme, que se archive, y que nada se borre. Eso es lo que se agrega acá.
--
-- ═══ POR QUÉ HOY ES EXPOSICIÓN ═══
--
-- Se paga la quincena, se imprime un papel y de la conformidad no queda NINGÚN rastro digital:
-- `recibo_liquidacion` guardaba lo EMITIDO, nunca lo CONFORMADO. Y el recibo no le llegaba al teléfono de la
-- persona (`mi_recibo` lee `documentacion_legajo`, el PDF del estudio, donde esto no escribe). Las dos
-- puntas se cierran acá.
--
-- ═══ LO QUE NO CAMBIA ═══
--
-- · SIN BLANCO NI NEGRO: el CHECK `recibo_sin_blanco_ni_negro` sigue vigente y no se toca.
-- · NO HAY REVISIÓN PREVIA NI BLOQUEO (dueño, 22/09): emitir no pide aprobación de nadie.
-- · LAS CIFRAS NO SE RECALCULAN: firmar no vuelve a mirar la liquidación. Se firma el papel que salió.
-- · REEMITIR NO PISA: ya había varias emisiones por quincena y `es_ultimo` marca la última. El emitido
--   anterior queda: eso ES «la versión anterior no se borra» de D13.
--
-- ═══ EL PAPEL FIRMADO VA AL BUCKET QUE YA EXISTE ═══
--
-- `comprobantes`, carpeta `<uid>/recibo/…`, con las mismas policies por carpeta que usa la rendición de
-- efectivo. El bucket `recibos` de la versión retirada se borró y no se vuelve a crear: un bucket más es
-- una cerradura más que mantener, y las carpetas ya separan.
--
-- ═══ QUIÉN ═══
--
-- Escriben sólo funciones `security definer`. Emite, archiva y observa `liquida_sueldos()` (dirección y
-- administración, la misma puerta del panel). Firma con el dedo SÓLO la persona del recibo: nadie firma por
-- otro. El papel lo sube la persona o administración. Y se agrega lo que faltaba para M09: la persona LEE su
-- propio recibo — hasta hoy la policy era sólo de sueldos y el empleado no veía lo que se le emitió.
--
-- SIN `begin/commit` PROPIOS: los pone `orquestador/scripts/aplicar-migracion.mjs`.

-- ── EL NÚMERO DEL PAPEL ──────────────────────────────────────────────────────────────────────────
-- D12/D13/M10 lo muestran («REC-2026-0412»): es cómo se nombra un recibo entre personas, mejor que un uuid.
-- El año sale de la quincena y no de la emisión: una reimpresión de diciembre de un recibo de septiembre
-- sigue siendo el recibo de 2026-09.
alter table public.recibo_liquidacion
  add column if not exists numero integer generated always as identity;
alter table public.recibo_liquidacion
  add column if not exists codigo text generated always as
    ('REC-' || lpad(extract(year from quincena_hasta)::text, 4, '0') || '-' || lpad(numero::text, 4, '0')) stored;

-- ── EL CICLO ─────────────────────────────────────────────────────────────────────────────────────
alter table public.recibo_liquidacion
  add column if not exists estado text not null default 'emitido',
  -- D12 · ENVIAR A FIRMAR: el recibo deja de estar sólo impreso y aparece en el teléfono de la persona.
  add column if not exists enviado_en timestamptz,
  add column if not exists enviado_por uuid,
  -- M10 · LA FIRMA CON EL DEDO: el trazo (un SVG de un path), cuándo, y desde dónde.
  add column if not exists trazo text,
  add column if not exists firmado_en timestamptz,
  -- DE DÓNDE: la obra donde la persona tenía horas ESE DÍA. Dato real o `null`; no se inventa un lugar.
  add column if not exists firmado_desde text,
  -- M11 · EL PAPEL FIRMADO, fotografiado: `comprobantes/<uid>/recibo/…`.
  add column if not exists papel_path text,
  add column if not exists papel_subido_por uuid,
  add column if not exists papel_subido_en timestamptz,
  -- D13 · VERIFICAR Y ARCHIVAR.
  add column if not exists verificacion jsonb,
  add column if not exists archivado_en timestamptz,
  add column if not exists archivado_por uuid,
  add column if not exists observacion text,
  add column if not exists observado_por uuid,
  add column if not exists observado_en timestamptz;

do $$
begin
  -- `not valid` no hace falta: la tabla arranca sin filas y todas las nuevas pasan por las funciones.
  if not exists (select 1 from pg_constraint where conname = 'recibo_estado_conocido') then
    alter table public.recibo_liquidacion add constraint recibo_estado_conocido
      check (estado in ('emitido', 'enviado', 'firmado_telefono', 'firmado_papel', 'archivado', 'observado'));
  end if;
  -- UNA FIRMA ES TRAZO Y SELLO DE TIEMPO, LOS DOS O NINGUNO: media firma no es firma.
  if not exists (select 1 from pg_constraint where conname = 'recibo_firma_completa') then
    alter table public.recibo_liquidacion add constraint recibo_firma_completa
      check ((trazo is null) = (firmado_en is null));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'recibo_papel_completo') then
    alter table public.recibo_liquidacion add constraint recibo_papel_completo
      check ((papel_path is null) = (papel_subido_en is null));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'recibo_archivado_completo') then
    alter table public.recibo_liquidacion add constraint recibo_archivado_completo
      check ((estado = 'archivado') = (archivado_en is not null));
  end if;
  -- OBSERVADO SIN MOTIVO NO SIRVE: «no coincide» sin decir qué no coincide no se puede corregir.
  if not exists (select 1 from pg_constraint where conname = 'recibo_observado_con_motivo') then
    alter table public.recibo_liquidacion add constraint recibo_observado_con_motivo
      check (estado <> 'observado' or observacion is not null);
  end if;
  -- ARCHIVADO ES DE UN FIRMADO: no se archiva lo que nadie firmó (ninguna de las dos formas).
  if not exists (select 1 from pg_constraint where conname = 'recibo_archivado_viene_de_firma') then
    alter table public.recibo_liquidacion add constraint recibo_archivado_viene_de_firma
      check (estado <> 'archivado' or firmado_en is not null or papel_subido_en is not null);
  end if;
end $$;

comment on column public.recibo_liquidacion.estado is
  'emitido → enviado → firmado_telefono | firmado_papel → archivado. observado = la persona o '
  'administración dijo que algo no coincide; se corrige emitiendo otro, éste no se borra.';

-- ── LA VISTA DEL LEGAJO, CON LA FIRMA ────────────────────────────────────────────────────────────
-- `select r.*` ya arrastra las columnas nuevas, pero una vista guarda la lista de columnas EXPANDIDA el día
-- que se creó: `create or replace` no puede insertar las nuevas antes de `es_ultimo` («cannot change name of
-- view column»). Se tira y se rehace — no tiene dependientes, la leen la ficha y el teléfono por PostgREST.
drop view if exists public.recibo_liquidacion_emitido;
create view public.recibo_liquidacion_emitido with (security_invoker = true) as
  select r.*,
         row_number() over (partition by r.persona_id, r.quincena_desde
                            order by r.emitido_en desc, r.id desc) = 1 as es_ultimo
    from public.recibo_liquidacion r;
grant select on public.recibo_liquidacion_emitido to authenticated;

-- ── M09 · LA PERSONA VE LO SUYO ──────────────────────────────────────────────────────────────────
-- Hasta hoy la única policy era `liquida_sueldos()`: el empleado no veía el recibo que se le emitió, y cero
-- filas por falta de policy es indistinguible de cero filas de verdad. Su recibo es suyo.
drop policy if exists recibo_liquidacion_mio on public.recibo_liquidacion;
create policy recibo_liquidacion_mio on public.recibo_liquidacion
  for select to authenticated using (persona_id = (select public.mi_persona_id()));

-- ── EL PAPEL FIRMADO: carpeta propia dentro del bucket que ya existe ─────────────────────────────
-- Sube quien tiene un recibo suyo sin archivar, o quien liquida (M11 también la usa Administración cuando
-- la persona le acerca el papel).
drop policy if exists comprobantes_sube_recibo_firmado on storage.objects;
create policy comprobantes_sube_recibo_firmado on storage.objects for insert to authenticated
  with check (
    bucket_id = 'comprobantes'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
    and (storage.foldername(name))[2] = 'recibo'
    and ((select public.liquida_sueldos()) or exists (
          select 1 from public.recibo_liquidacion r
           where r.persona_id = (select public.mi_persona_id()) and r.estado <> 'archivado'))
  );
-- LEE lo suyo, y quien liquida lee todo: D13 muestra la foto para verificarla antes de archivar.
drop policy if exists comprobantes_lee_recibo_firmado on storage.objects;
create policy comprobantes_lee_recibo_firmado on storage.objects for select to authenticated
  using (bucket_id = 'comprobantes' and (storage.foldername(name))[2] = 'recibo'
         and ((storage.foldername(name))[1] = (select auth.uid()::text) or (select public.liquida_sueldos())));

-- ── LAS FUNCIONES QUE ESCRIBEN ───────────────────────────────────────────────────────────────────
create or replace function public._recibo_liq_exigir_sueldos() returns uuid
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'hace falta un usuario logueado' using errcode = '42501'; end if;
  if not public.liquida_sueldos() then
    raise exception 'los recibos los maneja Dirección o Administración' using errcode = '42501';
  end if;
  return auth.uid();
end $$;

-- D12 · ENVIAR A FIRMAR. Es lo que hace que el recibo aparezca en el teléfono (M09): antes de esto el papel
-- existía sólo impreso. Idempotente: reenviar un recibo ya enviado no falla ni pisa la fecha original.
create or replace function public.enviar_recibo_a_firmar(p_recibo uuid) returns timestamptz
language plpgsql security definer set search_path = public as $$
declare v_usr uuid := public._recibo_liq_exigir_sueldos(); r recibo_liquidacion;
begin
  select * into r from recibo_liquidacion where id = p_recibo for update;
  if r.id is null then raise exception 'el recibo no existe' using errcode = 'P0001'; end if;
  if r.estado in ('firmado_telefono', 'firmado_papel', 'archivado') then
    raise exception '% ya está firmado: no hace falta mandarlo de nuevo', r.codigo using errcode = 'P0001';
  end if;
  if r.enviado_en is not null and r.estado = 'enviado' then return r.enviado_en; end if;
  update recibo_liquidacion
     set estado = 'enviado', enviado_en = coalesce(enviado_en, now()), enviado_por = coalesce(enviado_por, v_usr)
   where id = p_recibo
   returning enviado_en into r.enviado_en;
  return r.enviado_en;
end $$;

-- M10 · FIRMAR CON EL DEDO. Sólo la persona del recibo.
create or replace function public.firmar_recibo_liquidacion(p_recibo uuid, p_trazo text) returns timestamptz
language plpgsql security definer set search_path = public as $$
declare r recibo_liquidacion; v_desde text; v_en timestamptz;
begin
  if auth.uid() is null then raise exception 'hace falta un usuario logueado' using errcode = '42501'; end if;
  select * into r from recibo_liquidacion where id = p_recibo for update;
  if r.id is null then raise exception 'el recibo no existe' using errcode = 'P0001'; end if;
  if r.persona_id is distinct from public.mi_persona_id() then
    raise exception 'el recibo lo firma la persona a la que se le paga' using errcode = '42501';
  end if;
  if r.estado in ('firmado_telefono', 'firmado_papel', 'archivado') then
    raise exception 'este recibo ya está firmado' using errcode = 'P0001';
  end if;
  -- EL TRAZO ES UN SVG DE UN SOLO PATH Y NADA MÁS. Es el mismo formato y la misma validación que la
  -- conformidad del efectivo (`firmar_conformidad_entrega`, y `src/shared/firma/firma.ts` del lado de la
  -- pantalla): así nunca llega a un legajo —ni a un PDF— algo que no sea una firma.
  if p_trazo is null or length(p_trazo) > 60000 or p_trazo !~
     '^<svg xmlns="http://www\.w3\.org/2000/svg" viewBox="0 0 [0-9]+ [0-9]+"><path d="[ML0-9 l-]+" fill="none" stroke="#1F1F1E" stroke-width="2\.4" stroke-linecap="round" stroke-linejoin="round"/></svg>$' then
    raise exception 'falta la firma, o no tiene la forma de una firma' using errcode = 'P0001';
  end if;
  -- DESDE DÓNDE: la obra donde tenía horas imputadas ese día. Sin registro queda `null` y la pantalla dice
  -- «desde tu teléfono» a secas: un lugar inventado en un documento firmado es peor que ningún lugar.
  select o.nombre into v_desde
    from registros_hh h join obra_canonica o on o.id = h.obra_canonica_id
   where h.persona_id = r.persona_id and h.fecha = (now() at time zone 'America/Argentina/San_Juan')::date
   group by o.nombre order by sum(h.horas) desc, o.nombre limit 1;
  update recibo_liquidacion
     set trazo = p_trazo, firmado_en = now(), firmado_desde = v_desde, estado = 'firmado_telefono'
   where id = p_recibo
   returning firmado_en into v_en;
  return v_en;
end $$;

-- M11 · EL PAPEL FIRMADO. Convive con el trazo: si ya había firma con el dedo, el papel se suma y no la pisa
-- (dueño, 22/09: las dos formas conviven, no se elige una).
create or replace function public.subir_papel_recibo_liquidacion(p_recibo uuid, p_path text) returns void
language plpgsql security definer set search_path = public as $$
declare r recibo_liquidacion;
begin
  if auth.uid() is null then raise exception 'hace falta un usuario logueado' using errcode = '42501'; end if;
  select * into r from recibo_liquidacion where id = p_recibo for update;
  if r.id is null then raise exception 'el recibo no existe' using errcode = 'P0001'; end if;
  if r.persona_id is distinct from public.mi_persona_id() and not public.liquida_sueldos() then
    raise exception 'el papel lo sube la persona del recibo o Administración' using errcode = '42501';
  end if;
  if r.estado = 'archivado' then raise exception 'este recibo ya está archivado' using errcode = 'P0001'; end if;
  if split_part(coalesce(p_path, ''), '/', 1) <> auth.uid()::text or split_part(p_path, '/', 2) <> 'recibo' then
    raise exception 'la foto tiene que estar en tu carpeta' using errcode = '42501';
  end if;
  -- LA FOTO, LEÍDA EN SU DESTINO. Un `upload` que respondió que sí no prueba que el archivo esté.
  if not exists (select 1 from storage.objects where bucket_id = 'comprobantes' and name = p_path) then
    raise exception 'la foto no llegó al archivo: subila de nuevo' using errcode = 'P0001';
  end if;
  update recibo_liquidacion
     set papel_path = p_path, papel_subido_por = auth.uid(), papel_subido_en = now(),
         estado = case when r.estado = 'firmado_telefono' then r.estado else 'firmado_papel' end
   where id = p_recibo;
end $$;

-- D13 · ARCHIVAR EL FIRMADO. `p_verificacion` es lo que se tildó antes de archivar; queda con el documento.
create or replace function public.archivar_recibo_liquidacion(p_recibo uuid, p_verificacion jsonb default null)
returns void
language plpgsql security definer set search_path = public as $$
declare v_usr uuid := public._recibo_liq_exigir_sueldos(); r recibo_liquidacion;
begin
  select * into r from recibo_liquidacion where id = p_recibo for update;
  if r.id is null then raise exception 'el recibo no existe' using errcode = 'P0001'; end if;
  if r.estado = 'archivado' then raise exception '% ya está archivado', r.codigo using errcode = 'P0001'; end if;
  if r.firmado_en is null and r.papel_subido_en is null then
    raise exception 'se archiva un recibo firmado: % todavía no lo firmó nadie', r.codigo using errcode = 'P0001';
  end if;
  if p_verificacion is not null and jsonb_typeof(p_verificacion) <> 'object' then
    raise exception 'la verificación es un objeto' using errcode = 'P0001';
  end if;
  update recibo_liquidacion
     set estado = 'archivado', archivado_en = now(), archivado_por = v_usr, verificacion = p_verificacion
   where id = p_recibo;
end $$;

-- OBSERVAR. Quien liquida, sobre cualquiera no archivado («Observar y pedir de nuevo», D13); o la persona
-- ANTES de firmar («No coincide», M09). Lo observado se corrige emitiendo otro recibo: éste queda.
create or replace function public.observar_recibo_liquidacion(p_recibo uuid, p_motivo text) returns void
language plpgsql security definer set search_path = public as $$
declare r recibo_liquidacion;
begin
  if auth.uid() is null then raise exception 'hace falta un usuario logueado' using errcode = '42501'; end if;
  if nullif(trim(p_motivo), '') is null then raise exception 'decí qué no coincide' using errcode = 'P0001'; end if;
  select * into r from recibo_liquidacion where id = p_recibo for update;
  if r.id is null then raise exception 'el recibo no existe' using errcode = 'P0001'; end if;
  if r.estado = 'archivado' then raise exception 'este recibo ya está archivado' using errcode = 'P0001'; end if;
  if not public.liquida_sueldos() then
    if r.persona_id is distinct from public.mi_persona_id() then
      raise exception 'sólo la persona del recibo o Administración' using errcode = '42501';
    end if;
    if r.firmado_en is not null or r.papel_subido_en is not null then
      raise exception 'después de firmar, el reclamo se hace por otra vía' using errcode = 'P0001';
    end if;
  end if;
  update recibo_liquidacion
     set estado = 'observado', observacion = trim(p_motivo), observado_por = auth.uid(), observado_en = now()
   where id = p_recibo;
end $$;

-- ── PERMISOS: RLS NO ES GRANT, SE PONEN LOS DOS ──────────────────────────────────────────────────
revoke all on function public._recibo_liq_exigir_sueldos(), public.enviar_recibo_a_firmar(uuid),
  public.firmar_recibo_liquidacion(uuid, text), public.subir_papel_recibo_liquidacion(uuid, text),
  public.archivar_recibo_liquidacion(uuid, jsonb), public.observar_recibo_liquidacion(uuid, text)
  from public, anon;
grant execute on function public.enviar_recibo_a_firmar(uuid), public.firmar_recibo_liquidacion(uuid, text),
  public.subir_papel_recibo_liquidacion(uuid, text), public.archivar_recibo_liquidacion(uuid, jsonb),
  public.observar_recibo_liquidacion(uuid, text) to authenticated;

notify pgrst, 'reload schema';
