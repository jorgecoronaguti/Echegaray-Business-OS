-- «FIRMÓ EN PAPEL» SIN FOTO — el recibo que se firmó en la mano y cuyo papel queda en la oficina.
--
-- Dueño, 30/09/2026: «¿qué pasa cuando ya se firma de manera personal, no virtual?». Hasta hoy la única forma
-- de dejar rastro del papel era subir la foto (`subir_papel_recibo_liquidacion`), y el CHECK
-- `recibo_papel_completo` obliga a que path y fecha de la foto vayan juntos: marcar «firmó» sin foto no
-- cabía. Se agrega un sello PROPIO (quién y cuándo marcó que el papel está firmado y archivado en la oficina)
-- en vez de aflojar ese CHECK: una foto sin archivo sigue sin poder existir, y «marcado sin foto» queda
-- distinguible de «foto cargada» en vez de confundirse con ella.
--
-- Sólo quien liquida sueldos la marca (`liquida_sueldos()`): la persona no se firma a sí misma un papel.
-- Sin begin/commit: lo envuelve el aplicador.

alter table public.recibo_liquidacion
  add column if not exists papel_sin_foto_en timestamptz,
  add column if not exists papel_sin_foto_por uuid;

-- Sello completo o ninguno: media marca no dice quién respondió por el papel.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'recibo_papel_sin_foto_completo') then
    alter table public.recibo_liquidacion add constraint recibo_papel_sin_foto_completo
      check ((papel_sin_foto_en is null) = (papel_sin_foto_por is null));
  end if;
end $$;

-- ARCHIVADO SIGUE SIENDO DE UN FIRMADO: ahora el papel marcado en la oficina también cuenta como firma.
alter table public.recibo_liquidacion drop constraint if exists recibo_archivado_viene_de_firma;
alter table public.recibo_liquidacion add constraint recibo_archivado_viene_de_firma
  check (estado <> 'archivado' or firmado_en is not null or papel_subido_en is not null or papel_sin_foto_en is not null);

-- La vista guarda la lista de columnas expandida el día que se creó: se rehace para que traiga las nuevas.
drop view if exists public.recibo_liquidacion_emitido;
create view public.recibo_liquidacion_emitido with (security_invoker = true) as
  select r.*,
         row_number() over (partition by r.persona_id, r.quincena_desde
                            order by r.emitido_en desc, r.id desc) = 1 as es_ultimo
    from public.recibo_liquidacion r;
grant select on public.recibo_liquidacion_emitido to authenticated;

create or replace function public.marcar_recibo_firmado_en_papel(p_recibo uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_usr uuid := public._recibo_liq_exigir_sueldos(); r recibo_liquidacion;
begin
  select * into r from recibo_liquidacion where id = p_recibo for update;
  if r.id is null then raise exception 'el recibo no existe' using errcode = 'P0001'; end if;
  -- Sólo lo que está esperando firma. Lo firmado con el dedo, ya con papel, archivado u observado no se pisa.
  if r.estado not in ('emitido', 'enviado') then
    raise exception '% está «%»: sólo se marca en papel un recibo emitido o enviado', r.codigo, r.estado
      using errcode = 'P0001';
  end if;
  if r.firmado_en is not null or r.papel_subido_en is not null or r.papel_sin_foto_en is not null then
    raise exception '% ya tiene firma', r.codigo using errcode = 'P0001';
  end if;
  update recibo_liquidacion
     set estado = 'firmado_papel', papel_sin_foto_en = now(), papel_sin_foto_por = v_usr
   where id = p_recibo;
end $$;

-- ARCHIVAR: la regla no cambia, sólo reconoce el papel marcado como firma.
create or replace function public.archivar_recibo_liquidacion(p_recibo uuid, p_verificacion jsonb default null)
returns void
language plpgsql security definer set search_path = public as $$
declare v_usr uuid := public._recibo_liq_exigir_sueldos(); r recibo_liquidacion;
begin
  select * into r from recibo_liquidacion where id = p_recibo for update;
  if r.id is null then raise exception 'el recibo no existe' using errcode = 'P0001'; end if;
  if r.estado = 'archivado' then raise exception '% ya está archivado', r.codigo using errcode = 'P0001'; end if;
  if r.firmado_en is null and r.papel_subido_en is null and r.papel_sin_foto_en is null then
    raise exception 'se archiva un recibo firmado: % todavía no lo firmó nadie', r.codigo using errcode = 'P0001';
  end if;
  if p_verificacion is not null and jsonb_typeof(p_verificacion) <> 'object' then
    raise exception 'la verificación es un objeto' using errcode = 'P0001';
  end if;
  update recibo_liquidacion
     set estado = 'archivado', archivado_en = now(), archivado_por = v_usr, verificacion = p_verificacion
   where id = p_recibo;
end $$;

-- OBSERVAR: después de firmar (también en papel marcado) la persona ya no reclama por acá.
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
    if r.firmado_en is not null or r.papel_subido_en is not null or r.papel_sin_foto_en is not null then
      raise exception 'después de firmar, el reclamo se hace por otra vía' using errcode = 'P0001';
    end if;
  end if;
  update recibo_liquidacion
     set estado = 'observado', observacion = trim(p_motivo), observado_por = auth.uid(), observado_en = now()
   where id = p_recibo;
end $$;

revoke all on function public.marcar_recibo_firmado_en_papel(uuid) from public, anon;
grant execute on function public.marcar_recibo_firmado_en_papel(uuid) to authenticated;

notify pgrst, 'reload schema';
