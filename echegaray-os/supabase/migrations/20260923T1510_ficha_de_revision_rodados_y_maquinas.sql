-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- HERRAMIENTAS · LA FICHA DE REVISIÓN DE RODADOS Y MÁQUINAS — RTO, service, seguro, inspección
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- Dueño, 23/09/2026, textual: «rodados y maquinarias tienen que tener una ficha de revisión para ir
-- cargando los datos de revisión técnica; sería todo en la sección Mantenimiento, que se tiene que ir
-- guardando».
--
-- ═══ QUÉ ES UNA FILA ═══
--
-- UN hecho de revisión de UN rodado o máquina, con fecha: se hizo la RTO tal día en tal planta con tal
-- resultado y vence tal otro; se hizo el service a tantos km; se renovó el seguro hasta tal fecha; se
-- inspeccionó la máquina a tantas horas. Cada revisión nueva es una fila nueva: el historial no se pisa.
--
-- ═══ NO ES `activo_papel` ═══
--
-- `activo_papel` (20260922T2400) guarda el DOCUMENTO que llegó de Drive (el PDF del RTO, la póliza).
-- Esto guarda el HECHO que alguien carga desde la pantalla, con o sin papel. Se parecen en el vencimiento
-- y en eso la pantalla los cruza; no se fusionan porque uno lo escribe la carga de Drive y el otro una
-- persona, y borrar uno no puede borrar el otro.
--
-- ═══ LO QUE DICE LA RTO EN ARGENTINA (verificado 23/09/2026, argentina.gob.ar/seguridadvial/revisiontecnica) ═══
--
-- El certificado y la oblea llevan el MISMO número y la fecha de vigencia: por eso `numero`. El resultado
-- es apto, APTO CONDICIONAL o rechazado; el condicional se emite una sola vez y tiene que indicar el plazo
-- de la nueva verificación: por eso un `condicional` sin `vencimiento` se rechaza. Un rechazado no circula.
-- El service de maquinaria se lleva por horómetro (y el de rodados por km): por eso `lectura` en la unidad
-- que corresponde a la clase, sin inventar una tercera.
--
-- ═══ QUIÉN ESCRIBE ═══
--
-- Sólo `registrar_revision_activo`, `security definer`, como el resto del módulo (`_activo_usuario`).
-- La tabla no tiene policy de escritura. Leer, cualquiera autenticado.
--
-- SIN `begin/commit` PROPIOS: los pone `orquestador/scripts/aplicar-migracion.mjs`.

create table if not exists public.activo_revision (
  id            uuid primary key default gen_random_uuid(),
  activo_id     uuid not null references public.activo(id),
  tipo          text not null check (tipo in ('rto', 'service', 'seguro', 'inspeccion')),
  fecha         date not null,
  -- Hasta cuándo vale. Null = no vence o no se cargó (un service sin próximo previsto).
  vencimiento   date check (vencimiento is null or vencimiento >= fecha),
  -- km (rodado) u horas de horómetro (equipo) al momento de la revisión. Null = no se cargó.
  lectura       numeric(12, 1) check (lectura is null or lectura >= 0),
  resultado     text check (resultado is null or resultado in ('apto', 'condicional', 'rechazado')),
  -- Planta de RTO, taller del service, compañía del seguro, quién inspeccionó.
  lugar         text check (lugar is null or length(lugar) <= 160),
  -- Número de certificado/oblea, de póliza, de orden de trabajo. Lo que identifica ESA revisión.
  numero        text check (numero is null or length(numero) <= 80),
  costo         numeric(14, 2) check (costo is null or costo >= 0),
  observaciones text check (observaciones is null or length(observaciones) <= 1000),
  -- Foto del certificado o del ticket, en el bucket `herramientas` (el mismo de las fotos del módulo).
  adjunto_url   text,
  creado_en     timestamptz not null default now(),
  creado_por    uuid references auth.users(id),
  -- Un apto condicional sin plazo es un rechazo disfrazado: la RTO exige el plazo de la nueva verificación.
  constraint activo_revision_condicional_chk check (resultado is distinct from 'condicional' or vencimiento is not null)
);
create index if not exists activo_revision_activo_idx on public.activo_revision (activo_id, tipo, fecha desc);
create index if not exists activo_revision_vence_idx on public.activo_revision (vencimiento) where vencimiento is not null;
comment on table public.activo_revision is
  'Un hecho de revisión de un rodado o máquina (RTO, service, seguro, inspección) con fecha, vencimiento, '
  'lectura de km/horómetro y resultado. Escribe sólo registrar_revision_activo. El documento de Drive vive en activo_papel.';

alter table public.activo_revision enable row level security;
revoke all on public.activo_revision from anon, public;
revoke insert, update, delete on public.activo_revision from authenticated;
grant select on public.activo_revision to authenticated;
drop policy if exists activo_revision_select on public.activo_revision;
create policy activo_revision_select on public.activo_revision for select to authenticated using (true);

-- ── LA REVISIÓN VIGENTE DE CADA TIPO, Y CUÁNTO LE QUEDA ─────────────────────────────────────────
-- La última por (activo, tipo) según la fecha de la revisión (no según el vencimiento: una RTO rechazada de
-- hoy manda sobre una apta del año pasado). `dias` negativo = vencida; null = no vence o no se cargó.
create or replace view public.activo_revision_vigente with (security_invoker = true) as
  select distinct on (r.activo_id, r.tipo)
         r.*,
         case when r.vencimiento is null then null
              else (r.vencimiento - (now() at time zone 'America/Argentina/San_Juan')::date) end as dias
    from public.activo_revision r
   order by r.activo_id, r.tipo, r.fecha desc, r.creado_en desc;
grant select on public.activo_revision_vigente to authenticated;

-- ── REGISTRAR UNA REVISIÓN ──────────────────────────────────────────────────────────────────────
create or replace function public.registrar_revision_activo(
  p_activo uuid, p_tipo text, p_fecha date, p_vencimiento date default null, p_lectura numeric default null,
  p_resultado text default null, p_lugar text default null, p_numero text default null, p_costo numeric default null,
  p_observaciones text default null, p_adjunto_url text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_usr uuid := public._activo_usuario(); v_act activo%rowtype; v_id uuid;
begin
  select * into v_act from activo where id = p_activo;
  if v_act.id is null then raise exception 'el activo no existe' using errcode = 'P0001'; end if;
  if v_act.clase not in ('rodado', 'equipo') then
    raise exception 'la ficha de revisión es de rodados y máquinas, no de herramientas de mano' using errcode = 'P0001';
  end if;
  if v_act.estado = 'baja' then raise exception 'el activo está dado de baja: no se le cargan revisiones' using errcode = 'P0001'; end if;
  if p_fecha is null then raise exception 'la fecha de la revisión es obligatoria' using errcode = 'P0001'; end if;
  if p_fecha > (now() at time zone 'America/Argentina/San_Juan')::date then
    raise exception 'la fecha de la revisión no puede ser futura' using errcode = 'P0001';
  end if;
  if p_vencimiento is not null and p_vencimiento < p_fecha then
    raise exception 'el vencimiento no puede ser anterior a la revisión' using errcode = 'P0001';
  end if;
  if p_resultado = 'condicional' and p_vencimiento is null then
    raise exception 'un apto condicional lleva el plazo de la nueva verificación' using errcode = 'P0001';
  end if;
  insert into activo_revision (activo_id, tipo, fecha, vencimiento, lectura, resultado, lugar, numero, costo, observaciones, adjunto_url, creado_por)
  values (p_activo, p_tipo, p_fecha, p_vencimiento, p_lectura, nullif(trim(p_resultado), ''), nullif(trim(p_lugar), ''),
          nullif(trim(p_numero), ''), p_costo, nullif(trim(p_observaciones), ''), nullif(trim(p_adjunto_url), ''), v_usr)
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.registrar_revision_activo(uuid, text, date, date, numeric, text, text, text, numeric, text, text) from public, anon;
grant execute on function public.registrar_revision_activo(uuid, text, date, date, numeric, text, text, text, numeric, text, text) to authenticated;

notify pgrst, 'reload schema';
