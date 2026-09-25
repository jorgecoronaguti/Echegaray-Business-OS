-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- DICTAR PARTE — el audio del jefe, su transcripción y la PROPUESTA de parte que sale de ella
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- Aprobado por el dueño el 25/09/2026 sobre la maqueta: el jefe toca «Dictar parte» en ERP Obras ›
-- Parte diario, cuenta cómo fue el día y el formulario de siempre se completa solo. NADA se guarda
-- hasta que toca «Guardar parte»; y cuando lo toca, el parte entra por las MISMAS puertas que el
-- parte tipeado (asistencia, avance, pedido de material, novedad). Esta tabla no es el parte: es la
-- cola del audio y la evidencia de lo que dijo.
--
-- ═══ EL CIRCUITO ═══
--
--   navegador  graba PCM 16 kHz → WAV → sube al bucket `partes-dictados` con la sesión del usuario
--   app        inserta la fila `pendiente` (sólo el renglón: la Server Action tiene 1 MB de techo)
--   VM         `procesar-dictados-parte.mjs` (timer de 15 s) la toma → `transcribiendo` → transcribe
--              LOCAL (parakeet, el audio no sale de la VM) → arma la propuesta → `listo` | `error`
--   app        muestra la propuesta; Guardar la manda por las puertas del parte → `guardado`;
--              Descartar → `descartado`. El audio queda: es lo que dijo, y se puede volver a oír.
--
-- ═══ QUIÉN ═══
--
-- El jefe de obra y Administración. `es_administracion()` ya cubre direccion/administracion/jefe_obra
-- y `ve_obra()` es el eje de obra de toda la base. El OPERARIO no: no tiene Parte diario, y un
-- operario asignado a la obra (que `ve_obra` sí deja pasar) tampoco dicta ni lee lo dictado.

-- ── 1. EL BUCKET ────────────────────────────────────────────────────────────────────────────────
-- Sólo WAV: el navegador graba PCM mono a 16 kHz y arma el WAV él mismo, así la VM no necesita ffmpeg
-- ni decodificar Opus. Tres minutos de audio son 5,8 MB; 12 MB es el techo con margen.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('partes-dictados', 'partes-dictados', false, 12582912, array['audio/wav', 'audio/x-wav'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists partes_dictados_lee on storage.objects;
create policy partes_dictados_lee on storage.objects for select to authenticated
  using (
    bucket_id = 'partes-dictados'
    and (select public.es_administracion())
    and (storage.foldername(name))[1] = 'obra'
    and public.ve_obra((storage.foldername(name))[2])
  );

drop policy if exists partes_dictados_sube on storage.objects;
create policy partes_dictados_sube on storage.objects for insert to authenticated
  with check (
    bucket_id = 'partes-dictados'
    and (select public.es_administracion())
    and (storage.foldername(name))[1] = 'obra'
    and public.ve_obra((storage.foldername(name))[2])
  );
-- Sin UPDATE ni DELETE sobre el objeto: lo que se dijo no se reescribe ni se borra con un clic.

-- ── 2. LA TABLA ─────────────────────────────────────────────────────────────────────────────────
create table if not exists public.parte_dictado (
  id                uuid primary key default gen_random_uuid(),
  obra_id           text not null references public.obra_canonica (id) on delete cascade,
  -- El día del PARTE (el que estaba elegido en la pantalla), no el día en que se grabó.
  fecha             date not null,
  dictado_por       uuid not null default auth.uid() references public.perfiles (id),

  audio_path        text not null unique,
  audio_bytes       integer not null check (audio_bytes > 44 and audio_bytes <= 12582912),
  -- Lo mide el navegador; el techo de la pantalla es 3 minutos.
  duracion_s        numeric(6, 1) not null check (duracion_s > 0 and duracion_s <= 200),

  estado            text not null default 'pendiente'
                    check (estado in ('pendiente', 'transcribiendo', 'listo', 'error', 'guardado', 'descartado')),
  intentos          smallint not null default 0,
  motivo            text,

  -- Lo que escribe la VM. `propuesta` es el JSON de `orquestador/lib/ml/voz-parte.mjs`
  -- (`estado: 'propuesta'`): personas, avances, materiales, novedades, marcas y resumen.
  transcripcion     text,
  propuesta         jsonb,
  modelo            text,
  ms_transcripcion  integer,

  creado_en         timestamptz not null default now(),
  tomado_en         timestamptz,
  listo_en          timestamptz,

  -- Lo que escribe la app al guardar o descartar. `resultado` es el acuse de cada puerta.
  cerrado_en        timestamptz,
  cerrado_por       uuid references public.perfiles (id),
  resultado         jsonb,

  constraint parte_dictado_ruta_coherente
    check (audio_path like ('obra/' || obra_id || '/' || to_char(fecha, 'YYYY-MM-DD') || '/%')),
  constraint parte_dictado_listo_con_propuesta
    check (estado not in ('listo', 'guardado') or propuesta is not null),
  constraint parte_dictado_cierre_coherente
    check ((estado in ('guardado', 'descartado')) = (cerrado_en is not null))
);

create index if not exists parte_dictado_cola_idx
  on public.parte_dictado (creado_en) where estado in ('pendiente', 'transcribiendo');
create index if not exists parte_dictado_obra_fecha_idx
  on public.parte_dictado (obra_id, fecha desc, creado_en desc);

comment on table public.parte_dictado is
  'Dictar parte (ERP Obras › Parte diario): el audio del jefe, su transcripción LOCAL y la PROPUESTA de parte. No es el parte: al guardar, el parte entra por las mismas puertas que el tipeado.';
comment on column public.parte_dictado.propuesta is
  'JSON de proponerParte() (orquestador/lib/ml/voz-parte.mjs). Siempre estado=propuesta: una persona la confirma antes de que sea un registro.';

-- ── 3. LAS TRANSICIONES QUE PUEDE HACER UNA PERSONA ─────────────────────────────────────────────
-- La VM (service_role / postgres) mueve pendiente → transcribiendo → listo|error. Una sesión web sólo
-- CIERRA: listo → guardado, o pendiente|transcribiendo|listo|error → descartado. Una policy no ve el
-- valor viejo; este trigger sí.
create or replace function public.parte_dictado_transicion()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'authenticated' then
    return new;
  end if;
  if new.estado = old.estado then
    raise exception 'un dictado sólo se guarda o se descarta' using errcode = '42501';
  end if;
  if not (
       (old.estado = 'listo' and new.estado = 'guardado')
    or (old.estado in ('pendiente', 'transcribiendo', 'listo', 'error') and new.estado = 'descartado')
  ) then
    raise exception 'un dictado % no puede pasar a %', old.estado, new.estado using errcode = '42501';
  end if;
  new.cerrado_en := now();
  new.cerrado_por := auth.uid();
  return new;
end;
$$;

drop trigger if exists parte_dictado_transicion on public.parte_dictado;
create trigger parte_dictado_transicion before update on public.parte_dictado
  for each row execute function public.parte_dictado_transicion();

-- ── 4. RLS ──────────────────────────────────────────────────────────────────────────────────────
alter table public.parte_dictado enable row level security;

drop policy if exists parte_dictado_select on public.parte_dictado;
create policy parte_dictado_select on public.parte_dictado for select to authenticated
  using ((select public.es_administracion()) and public.ve_obra(obra_id));

drop policy if exists parte_dictado_insert on public.parte_dictado;
create policy parte_dictado_insert on public.parte_dictado for insert to authenticated
  with check (
    (select public.es_administracion())
    and public.ve_obra(obra_id)
    and dictado_por = (select auth.uid())
    and audio_path like ('obra/' || obra_id || '/' || to_char(fecha, 'YYYY-MM-DD') || '/%')
  );

drop policy if exists parte_dictado_update on public.parte_dictado;
create policy parte_dictado_update on public.parte_dictado for update to authenticated
  using ((select public.es_administracion()) and public.ve_obra(obra_id))
  with check ((select public.es_administracion()) and public.ve_obra(obra_id));

-- Sin DELETE: descartar es un estado, y el audio queda.

-- ── 5. GRANT ────────────────────────────────────────────────────────────────────────────────────
-- Los privilegios por defecto (20260923T2000) reparten DML entero a `authenticated`: se revoca y se
-- da POR COLUMNA. Una sesión web no puede escribir la transcripción ni la propuesta (eso es de la VM)
-- ni el estado inicial (nace `pendiente` por default).
revoke all on public.parte_dictado from authenticated, anon;
grant select on public.parte_dictado to authenticated;
grant insert (obra_id, fecha, dictado_por, audio_path, audio_bytes, duracion_s)
  on public.parte_dictado to authenticated;
grant update (estado, resultado) on public.parte_dictado to authenticated;
grant select, insert, update, delete on public.parte_dictado to service_role;
