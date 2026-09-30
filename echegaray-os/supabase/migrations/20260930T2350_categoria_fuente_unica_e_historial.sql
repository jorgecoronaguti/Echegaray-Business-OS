-- CATEGORÍA: FUENTE ÚNICA E HISTORIAL CRONOLÓGICO (30/09/2026, orden del dueño).
--
-- «Quiero que en Supabase queden las categorías correctas de todo el personal y que todo app.ecsas
-- lea de la misma tabla … y que quede registro cronológico de pasos de categoría de cada empleado».
--
-- La fuente única de la categoría VIGENTE es `personas.categoria`. Lo que había pasado: el timer
-- `echegaray-espejo-legajos` (cada 6 h) la pisaba con la columna «cargo» de la planilla PERSONAL
-- (30/09 21:21Z revirtió a Petina y a González C. S., 29/09 subió a Castillo a oficial). Ese script
-- deja de escribir la categoría (sólo la carga en un alta nueva).
--
-- El HISTORIAL es `persona_categoria_historial`: un renglón por cada categoría que la persona tuvo,
-- con desde qué fecha, de qué documento sale (recibo del estudio, alta ARCA, recategorización
-- pedida al estudio, edición en el OS) y quién lo anotó. Se siembra desde los recibos ya cargados
-- (`recibo_sueldo_linea`, que sí son cronología formal: una categoría por quincena) y desde ahí
-- un trigger sobre `personas` agrega un renglón cada vez que la categoría vigente cambia.
-- `entidad_cambio` sigue siendo la bitácora cruda (incluye los ping-pong de los scripts); el
-- historial es la carrera de la persona.

create table if not exists public.persona_categoria_historial (
  id          uuid primary key default gen_random_uuid(),
  persona_id  uuid not null references public.personas(id) on delete cascade,
  categoria   text not null,
  desde       date not null,
  -- recibo · alta_arca · ieric · estudio (recategorización pedida) · os (edición en la app) · planilla
  fuente      text not null default 'os',
  referencia  text,
  autor       uuid,
  creado_en   timestamptz not null default now(),
  unique (persona_id, desde)
);
comment on table public.persona_categoria_historial is
  'Cronología de categoría de convenio por persona. La vigente es personas.categoria; acá queda cada paso con su fecha y su documento.';
create index if not exists persona_categoria_historial_persona on public.persona_categoria_historial (persona_id, desde desc);

alter table public.persona_categoria_historial enable row level security;
drop policy if exists persona_categoria_historial_lee on public.persona_categoria_historial;
create policy persona_categoria_historial_lee on public.persona_categoria_historial for select to authenticated
  using ((select public.es_administracion()) or persona_id = (select public.mi_persona_id()));
drop policy if exists persona_categoria_historial_srv on public.persona_categoria_historial;
create policy persona_categoria_historial_srv on public.persona_categoria_historial for all to service_role
  using (true) with check (true);
grant select on public.persona_categoria_historial to authenticated;
grant all on public.persona_categoria_historial to service_role;

-- EL TRIGGER: cada cambio de la vigente deja su renglón. Quien edita puede decir de dónde sale
-- con `set_config('os.categoria.fuente'|'os.categoria.referencia'|'os.categoria.desde', …, true)`;
-- sin eso queda «os», hoy, con el usuario de la sesión.
create or replace function public.personas_categoria_historial()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_desde date := coalesce(nullif(current_setting('os.categoria.desde', true), '')::date, current_date);
  v_fuente text := coalesce(nullif(current_setting('os.categoria.fuente', true), ''), 'os');
  v_ref text := nullif(current_setting('os.categoria.referencia', true), '');
begin
  if new.categoria is null then return null; end if;
  if tg_op = 'UPDATE' and new.categoria is not distinct from old.categoria then return null; end if;
  -- RESTAURAR LA VIGENTE NO ES UN PASO: si el último renglón del historial ya dice esta categoría, la
  -- vigente estaba pisada y vuelve a coincidir; el detalle crudo queda en entidad_cambio.
  if exists (select 1 from public.persona_categoria_historial h where h.persona_id = new.id
               and h.desde = (select max(desde) from public.persona_categoria_historial where persona_id = new.id)
               and h.categoria = new.categoria) then return null; end if;
  insert into public.persona_categoria_historial (persona_id, categoria, desde, fuente, referencia, autor)
  values (new.id, new.categoria, v_desde, v_fuente, v_ref, auth.uid())
  on conflict (persona_id, desde) do update
    set categoria = excluded.categoria, fuente = excluded.fuente, referencia = excluded.referencia,
        autor = excluded.autor, creado_en = now();
  return null;
end $$;
drop trigger if exists personas_categoria_historial on public.personas;
create trigger personas_categoria_historial after insert or update of categoria on public.personas
  for each row execute function public.personas_categoria_historial();

-- SIEMBRA 1: los recibos del estudio, colapsados en tramos (un renglón cuando la categoría cambia).
-- Q1 arranca el 1, Q2 el 16. Las liquidaciones finales no son quincenas.
with recibos as (
  select persona_id,
         lower(replace(trim(categoria), ' ', '_')) categoria,
         periodo,
         make_date(substr(periodo, 7, 4)::int, substr(periodo, 4, 2)::int, case when periodo like 'Q1%' then 1 else 16 end) desde
    from public.recibo_sueldo_linea
   where periodo ~ '^Q[12]-\d\d/\d{4}$' and categoria is not null
), tramos as (
  select persona_id, categoria, periodo, desde,
         lag(categoria) over (partition by persona_id order by desde) anterior
    from recibos
)
insert into public.persona_categoria_historial (persona_id, categoria, desde, fuente, referencia)
select persona_id, categoria, desde, 'recibo', 'Recibo de sueldo ' || periodo || ' (estudio contable)'
  from tramos where anterior is null or anterior <> categoria
on conflict (persona_id, desde) do nothing;

-- SIEMBRA 2: quien no tiene recibo cargado arranca con la categoría vigente desde su ingreso.
insert into public.persona_categoria_historial (persona_id, categoria, desde, fuente, referencia)
select p.id, p.categoria, coalesce(p.fecha_ingreso, current_date), 'os', 'Categoría vigente en personas al sembrar el historial (30/09/2026)'
  from public.personas p
 where p.categoria is not null
   and not exists (select 1 from public.persona_categoria_historial h where h.persona_id = p.id)
on conflict (persona_id, desde) do nothing;

-- SIEMBRA 3: la recategorización desde Q2-09/2026 pedida al estudio el 18/09 (memoria del dueño):
-- González Tobares Juan Guillermo y Reta → oficial; Pastrán y Quiroga Sebastián Adolfo → oficial
-- especializado. Ya están así en personas; el historial dice desde cuándo y por qué.
insert into public.persona_categoria_historial (persona_id, categoria, desde, fuente, referencia)
select p.id, p.categoria, date '2026-09-16', 'estudio', 'Recategorización pedida al estudio contable el 18/09/2026, vigente desde Q2-09/2026'
  from public.personas p
 where p.id in ('a7af0d4d-d79d-4ee0-bb87-c636fc76a3e3', 'b7f61a6e-8c14-43f7-832b-fbed3c03fdd6',
                '1fee0bee-a2ef-4470-9afc-e4a0bbfa768d', '48703f23-6bc3-4d95-a08c-b7a4a739bf50')
on conflict (persona_id, desde) do nothing;

-- Castillo arranca ayudante desde su ingreso (renglón sembrado con la vigente pisada «oficial»).
update public.persona_categoria_historial
   set categoria = 'ayudante', fuente = 'alta_arca', referencia = 'Alta ARCA 31/08/2026 cód. 004212 (Drive 1TXV_Uhk3fMRoIQo4cumTdk4FlTC3PJjE), inicio 01/09/2026; libreta IERIC 000006096693 también AYUDANTE'
 where persona_id = '82d2cb78-9411-4a5e-851c-cc9d8e66e0b7' and desde = date '2026-09-01';

-- CORRECCIÓN de las tres que el timer pisó (regla del 14/09: manda el documento formal, no la planilla).
-- Petina y González Carlos Samuel: recibos Q2-04→Q1-09/2026 todos OFICIAL. Castillo Benitez: alta
-- ARCA 31/08/2026 y libreta IERIC dicen AYUDANTE; la planilla «M OF» no manda.
select set_config('os.categoria.fuente', 'recibo', true);
select set_config('os.categoria.referencia', 'Recibos Q2-04→Q1-09/2026 OFICIAL; restaurada el 30/09/2026 tras pisada del timer espejo-legajos', true);
update public.personas set categoria = 'oficial',
  notas = coalesce(notas, '') || ' · 30/09/2026 (OS): restaurada oficial; el timer espejo-legajos la había pisado con la planilla a las 21:21Z. Desde ahora la planilla no escribe la categoría.'
 where id in ('61947a1c-71a6-4295-8932-158c80ec30f8', 'bf59433b-fde2-438e-beb4-8b6910926d44') and categoria <> 'oficial';
select set_config('os.categoria.fuente', 'alta_arca', true);
select set_config('os.categoria.referencia', 'Alta ARCA 31/08/2026 cód. 004212 y libreta IERIC: AYUDANTE; restaurada el 30/09/2026 tras pisada del timer espejo-legajos (planilla «M OF»)', true);
update public.personas set categoria = 'ayudante',
  notas = coalesce(notas, '') || ' · 30/09/2026 (OS): restaurada ayudante (alta ARCA/IERIC); el timer espejo-legajos la había subido a oficial con la planilla el 29/09. Desde ahora la planilla no escribe la categoría.'
 where id = '82d2cb78-9411-4a5e-851c-cc9d8e66e0b7' and categoria <> 'ayudante';
select set_config('os.categoria.fuente', '', true);
select set_config('os.categoria.referencia', '', true);

