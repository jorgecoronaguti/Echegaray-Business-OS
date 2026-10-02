-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- UN RECIBO RE-EMITIDO REEMPLAZA AL ANTERIOR — estado `reemplazado` (dueño, 02/10/2026)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- Dueño: «dejá todo ok» y «no quiero que se me dupliquen otra vez». Cada vez que se volvía a emitir el recibo
-- de una persona para la misma quincena quedaba OTRO recibo numerado y el anterior seguía «vigente»: Aguero
-- tenía RP-000002, 03 y 04; Alaniz RP-000001 y 05. 20260922T2600 permitía las dos emisiones a propósito
-- («borrar el anterior sería perder la prueba de qué se le entregó»); eso sigue valiendo: acá NO se borra ni
-- se renumera nada. El anterior pasa a `reemplazado`, apuntando al nuevo, y deja de valer.
--
-- ═══ QUÉ CAMBIA ═══
--
-- 1. `estado = 'reemplazado'` + `reemplazado_por` (el recibo nuevo) + `reemplazado_en`. Los tres van juntos o
--    ninguno: un «reemplazado» sin decir por cuál no se puede auditar.
-- 2. `registrar_recibo_liquidacion` hace el reemplazo EN LA MISMA TRANSACCIÓN que el insert: no puede quedar
--    el nuevo sin que se haya tocado el anterior, ni al revés. Reemplaza sólo lo que nadie firmó (sin trazo,
--    sin foto, sin papel marcado, sin archivar). Si ya hay UNO FIRMADO de esa persona y quincena, NO emite:
--    una firma no se pisa con otro papel sin que el dueño lo decida (la confirmación no tiene pantalla todavía).
-- 3. Un reemplazado queda CONGELADO (trigger): ni la persona lo firma, ni se manda a firmar, ni se le sube
--    papel, ni se observa. Una sola cerradura para las cinco funciones que escriben, en vez de tocar cinco.
-- 4. La persona no lo ve: la policy `recibo_liquidacion_mio` lo excluye. Administración sí (ficha, atenuado).
-- 5. Arreglo de datos de hoy, idempotente y sin tocar lo firmado (al final).
--
-- `security definer` y no `invoker` en el reemplazo: la tabla no tiene grant de update para `authenticated` (la
-- única escritura es la función, 20260922T2600) y abrirlo sería abrir la puerta a cambiar cualquier estado.
-- Quien emite sigue siendo `liquida_sueldos()`, que la función exige antes de tocar nada.
--
-- SIN `begin/commit` PROPIOS: los pone `orquestador/scripts/aplicar-migracion.mjs`.

-- ── 1. COLUMNAS Y CHECKS ────────────────────────────────────────────────────────────────────────
alter table public.recibo_liquidacion
  add column if not exists reemplazado_por uuid references public.recibo_liquidacion(id) on delete restrict,
  add column if not exists reemplazado_en timestamptz;

alter table public.recibo_liquidacion drop constraint if exists recibo_estado_conocido;
alter table public.recibo_liquidacion add constraint recibo_estado_conocido
  check (estado in ('emitido', 'enviado', 'firmado_telefono', 'firmado_papel', 'archivado', 'observado', 'reemplazado'));

do $$
begin
  -- Un solo CHECK para el «sí y sólo si»: estado ⇔ los dos sellos. Y nunca reemplazado por sí mismo.
  if not exists (select 1 from pg_constraint where conname = 'recibo_reemplazado_completo') then
    alter table public.recibo_liquidacion add constraint recibo_reemplazado_completo
      check ((estado = 'reemplazado') = (reemplazado_por is not null and reemplazado_en is not null)
         and (reemplazado_por is null) = (reemplazado_en is null)
         and reemplazado_por is distinct from id);
  end if;
end $$;
create index if not exists recibo_liquidacion_reemplazado_por_idx
  on public.recibo_liquidacion (reemplazado_por) where reemplazado_por is not null;

comment on column public.recibo_liquidacion.reemplazado_por is
  'El recibo que lo reemplazó (misma persona y quincena). Lo pone registrar_recibo_liquidacion; el número del '
  'reemplazado no se reutiliza y la fila no se borra.';

-- ── 2. CONGELADO: LO REEMPLAZADO NO SE TOCA MÁS ──────────────────────────────────────────────────
create or replace function public._recibo_reemplazado_congelado() returns trigger
language plpgsql as $$
begin
  if old.estado = 'reemplazado' then
    raise exception '% fue reemplazado: ya no se firma, ni se envía, ni se modifica', old.codigo using errcode = 'P0001';
  end if;
  return new;
end $$;
drop trigger if exists recibo_liquidacion_reemplazado_congelado on public.recibo_liquidacion;
create trigger recibo_liquidacion_reemplazado_congelado before update on public.recibo_liquidacion
  for each row execute function public._recibo_reemplazado_congelado();

-- ── 3. LA VISTA TRAE LAS COLUMNAS NUEVAS (guarda la lista expandida: se rehace, como en 20260930T2200) ──
drop view if exists public.recibo_liquidacion_emitido;
create view public.recibo_liquidacion_emitido with (security_invoker = true) as
  select r.*,
         row_number() over (partition by r.persona_id, r.quincena_desde
                            order by r.emitido_en desc, r.id desc) = 1 as es_ultimo
    from public.recibo_liquidacion r;
grant select on public.recibo_liquidacion_emitido to authenticated;

-- ── 4. LA PERSONA NO VE LO REEMPLAZADO ───────────────────────────────────────────────────────────
drop policy if exists recibo_liquidacion_mio on public.recibo_liquidacion;
create policy recibo_liquidacion_mio on public.recibo_liquidacion
  for select to authenticated
  using (persona_id = (select public.mi_persona_id()) and estado <> 'reemplazado');

-- ── 5. EMITIR: REEMPLAZA A LOS ANTERIORES SIN FIRMA, EN LA MISMA TRANSACCIÓN ────────────────────────
-- Misma firma y mismo cuerpo que 20261002T1200 más (a) el aviso del firmado y (b) el reemplazo. Las
-- condiciones de «firmado» y «reemplazable» son las de `src/shared/recibo/reemplazo.ts`.
create or replace function public.registrar_recibo_liquidacion(
  p_persona uuid, p_desde date, p_hasta date, p_nombre text, p_renglones jsonb,
  p_categoria text default null, p_horas numeric default null, p_banco numeric default null,
  p_efectivo numeric default null, p_total numeric default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid := gen_random_uuid(); v_numero integer; v_firmado text;
begin
  if auth.uid() is null then
    raise exception 'hace falta un usuario logueado' using errcode = '42501';
  end if;
  if not public.liquida_sueldos() then
    raise exception 'sólo dirección y administración emiten recibos' using errcode = '42501';
  end if;
  if not exists (select 1 from personas where id = p_persona) then
    raise exception 'la persona no existe' using errcode = 'P0001';
  end if;
  if coalesce(trim(p_nombre), '') = '' then
    raise exception 'el recibo tiene que decir a nombre de quién es' using errcode = 'P0001';
  end if;
  -- UN PAPEL VACÍO NO SE EMITE: si no dice ni horas ni medios, no hay nada que la persona firme.
  if coalesce(jsonb_array_length(p_renglones -> 'horas'), 0)
   + coalesce(jsonb_array_length(p_renglones -> 'medios'), 0) = 0 then
    raise exception 'el recibo no dice nada: no se emite' using errcode = 'P0001';
  end if;
  -- DOS EMISIONES A LA VEZ DE LA MISMA PERSONA Y QUINCENA SE ATIENDEN DE A UNA: sin este lock las dos
  -- actualizarían «los anteriores» sin ver a la otra, y quedarían los dos vigentes.
  perform pg_advisory_xact_lock(hashtextextended('recibo_liquidacion:' || p_persona || ':' || p_desde || ':' || p_hasta, 0));
  -- UNA FIRMA NO SE PISA. Antes de tomar número: lo rechazado no consume uno.
  select codigo into v_firmado from recibo_liquidacion
   where persona_id = p_persona and quincena_desde = p_desde and quincena_hasta = p_hasta
     and (firmado_en is not null or papel_path is not null or papel_sin_foto_en is not null or archivado_en is not null)
   order by serie_numero limit 1;
  if v_firmado is not null then
    raise exception 'Ya hay un recibo firmado de esta quincena: %', v_firmado using errcode = 'P0001';
  end if;
  v_numero := public.tomar_numero_de_recibo('RP',
    'recibo_liquidacion:' || v_id || ' · ' || trim(p_nombre) || ' · quincena ' || p_desde || '/' || p_hasta);
  insert into recibo_liquidacion (id, persona_id, quincena_desde, quincena_hasta, nombre, categoria,
                                  horas, banco, efectivo, total, renglones, emitido_por,
                                  serie_numero, codigo)
  values (v_id, p_persona, p_desde, p_hasta, trim(p_nombre), nullif(trim(p_categoria), ''),
          p_horas, p_banco, p_efectivo, p_total, p_renglones, auth.uid(),
          v_numero, public.codigo_de_recibo('RP', v_numero))
  returning id into v_id;
  -- LOS ANTERIORES SIN FIRMA DE ESA PERSONA Y QUINCENA, REEMPLAZADOS POR ÉSTE. Nada se borra y ningún número
  -- se reutiliza. Lo firmado ya no puede estar acá (se rechazó arriba), pero la condición se repite: si
  -- alguien firma entre el chequeo y el update, su firma no se pisa.
  update recibo_liquidacion
     set estado = 'reemplazado', reemplazado_por = v_id, reemplazado_en = now()
   where persona_id = p_persona and quincena_desde = p_desde and quincena_hasta = p_hasta
     and id <> v_id and estado <> 'reemplazado' and estado <> 'archivado'
     and firmado_en is null and papel_path is null and papel_sin_foto_en is null and archivado_en is null;
  return v_id;
end $$;
revoke all on function public.registrar_recibo_liquidacion(uuid, date, date, text, jsonb, text, numeric, numeric, numeric, numeric) from public, anon;
grant execute on function public.registrar_recibo_liquidacion(uuid, date, date, text, jsonb, text, numeric, numeric, numeric, numeric) to authenticated;

-- ── 6. ARREGLO DE DATOS DE HOY (Q2-09, 16–30/09/2026) ────────────────────────────────────────────
-- «Dejá todo ok»: quedan vigentes RP-000004 (Aguero) y RP-000005 (Alaniz). Se ubican por código, y la
-- persona y la quincena se verifican en el WHERE: si un código apunta a otra cosa, no toca nada. Lo que ya
-- tenga firma o papel NO se toca. Idempotente: la segunda corrida no encuentra nada que cambiar. El UPDATE
-- pasa por el congelado sin problema (el viejo no está reemplazado todavía).
do $$
declare v_n integer; v_total integer := 0; r record;
begin
  for r in select * from (values ('RP-000004', 'RP-000002'), ('RP-000004', 'RP-000003'), ('RP-000005', 'RP-000001'))
           as t(vigente, viejo)
  loop
    update public.recibo_liquidacion v
       set estado = 'reemplazado', reemplazado_por = n.id, reemplazado_en = now()
      from public.recibo_liquidacion n
     where n.codigo = r.vigente and v.codigo = r.viejo
       and n.persona_id = v.persona_id
       and n.quincena_desde = '2026-09-16' and n.quincena_hasta = '2026-09-30'
       and v.quincena_desde = n.quincena_desde and v.quincena_hasta = n.quincena_hasta
       and n.estado <> 'reemplazado' and n.serie_numero > v.serie_numero
       and v.estado <> 'reemplazado' and v.estado <> 'archivado'
       and v.firmado_en is null and v.papel_path is null and v.papel_sin_foto_en is null and v.archivado_en is null;
    get diagnostics v_n = row_count;
    v_total := v_total + v_n;
    raise notice '% → reemplazado por %: % fila(s)', r.viejo, r.vigente, v_n;
  end loop;
  raise notice 'reemplazados en total: % (esperado 3 la primera vez, 0 las siguientes)', v_total;
end $$;

notify pgrst, 'reload schema';
