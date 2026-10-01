-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- EFECTIVO · EL RECIBO DEL GASTO MANUAL SE FIRMA EN LA PANTALLA (dueño, 01/10/2026)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- «Necesito q el módulo efectivo, al rendir un gasto manual, cree un modelo de recibo para hacerle firmar al
-- proveedor del servicio» y, sobre el primer intento (un PDF para imprimir): «quiero q sea algo digital como la
-- firma de conformidad de entrega de efectivo, rehacer».
--
-- El proveedor NO es usuario de la app: firma con el dedo (o el mouse) en el dispositivo de quien rinde, que se
-- lo alcanza. Por eso la firma la REGISTRA quien rinde (`registrado_por`) y el nombre de quien firma viaja
-- como texto (`aclaracion`), igual que el trazo.
--
-- ═══ POR QUÉ UNA TABLA Y NO COLUMNAS EN `efectivo_rendicion` ═══
--
-- Una rendición manual se edita y se borra (`editar_rendicion_efectivo`, `_efectivo_soltar_manual`). Lo firmado
-- no puede cambiar con ella. La firma lleva SU PROPIA FOTO de lo que se firmó (monto, fecha, concepto,
-- proveedor): el PDF sale de ahí, no de la rendición viva. Sin FK a propósito: borrar el gasto no borra el
-- recibo que el proveedor ya firmó (evidencia), y un FK haría fallar esa función con un error de la base.
--
-- ═══ QUIÉN ═══
--
-- Firma-registra quien puede rendir contra la entrega: la misma puerta de todas las funciones de rendir
-- (`_efectivo_actua_por`: el jefe de obra dueño de la entrega, Administración o Dirección). Una firma por
-- rendición; una vez firmada no se pisa ni se borra (trigger): corregirla es otra decisión, no un UPDATE.
-- Lee quien ve la entrega (mismo criterio que `efectivo_rendicion`).
--
-- SIN `begin/commit` PROPIOS: los pone `orquestador/scripts/aplicar-migracion.mjs`.

create table if not exists public.efectivo_recibo_firma (
  rendicion_id   uuid primary key,
  entrega_id     uuid not null references public.efectivo_entrega(id),
  -- Lo que se firmó, tal como estaba en la rendición al firmar.
  monto          numeric(14,2) not null check (monto > 0),
  fecha          date not null,
  concepto       text,
  proveedor      text,
  -- La firma: el SVG de un path (el mismo formato de `conformidad_trazo`), quién firma y su documento.
  trazo          text not null check (length(trazo) <= 60000 and trazo ~ '^<svg [^>]*viewBox="0 0 [0-9]+ [0-9]+">' and trazo like '%</svg>'),
  aclaracion     text not null check (length(aclaracion) between 3 and 120),
  dni            text check (dni ~ '^[0-9]{6,8}$'),
  firmado_en     timestamptz not null default now(),
  registrado_por uuid not null
);
create index if not exists efectivo_recibo_firma_entrega_idx on public.efectivo_recibo_firma (entrega_id);
comment on table public.efectivo_recibo_firma is
  'Recibo de un gasto manual firmado en pantalla por el proveedor del servicio. Escribe sólo firmar_recibo_gasto_manual.';

-- UNA VEZ FIRMADO NO SE PISA: ni UPDATE ni DELETE, ni por la API ni por otra función.
create or replace function public._efectivo_recibo_firma_inmutable() returns trigger
language plpgsql as $$
begin
  raise exception 'el recibo firmado no se modifica ni se borra' using errcode = 'P0001';
end $$;
drop trigger if exists efectivo_recibo_firma_inmutable on public.efectivo_recibo_firma;
create trigger efectivo_recibo_firma_inmutable before update or delete on public.efectivo_recibo_firma
  for each row execute function public._efectivo_recibo_firma_inmutable();

-- LECTURA: quien ve la entrega. Escritura: nadie por la API (sólo la función de abajo).
alter table public.efectivo_recibo_firma enable row level security;
drop policy if exists efectivo_recibo_firma_select on public.efectivo_recibo_firma;
create policy efectivo_recibo_firma_select on public.efectivo_recibo_firma for select to authenticated
  using ((select public.es_administracion()) or exists (
    select 1 from public.efectivo_entrega e where e.id = entrega_id and e.persona_id = (select public.mi_persona_id())));
revoke all on public.efectivo_recibo_firma from anon, public, authenticated;
grant select on public.efectivo_recibo_firma to authenticated;

-- ── FIRMAR ───────────────────────────────────────────────────────────────────────────────────────
create or replace function public.firmar_recibo_gasto_manual(
  p_rendicion uuid, p_trazo text, p_aclaracion text, p_dni text default null)
returns timestamptz
language plpgsql security definer set search_path = public as $$
declare
  v_usr uuid := auth.uid();
  r public.efectivo_rendicion;
  e public.efectivo_entrega;
  v_acl text := nullif(btrim(regexp_replace(coalesce(p_aclaracion, ''), '\s+', ' ', 'g')), '');
  v_dni text := nullif(regexp_replace(coalesce(p_dni, ''), '\D', '', 'g'), '');
  v_en timestamptz;
begin
  if v_usr is null then raise exception 'hace falta un usuario logueado' using errcode = '42501'; end if;
  -- `for update`: dos pantallas firmando a la vez no llegan las dos al insert.
  select * into r from public.efectivo_rendicion where id = p_rendicion for update;
  if r.id is null then raise exception 'ese gasto no existe' using errcode = 'P0001'; end if;
  if r.origen is distinct from 'manual' then
    raise exception 'sólo los gastos cargados a mano llevan recibo firmado: un ticket ya tiene su comprobante' using errcode = 'P0001';
  end if;
  select * into e from public.efectivo_entrega where id = r.entrega_id;
  if not coalesce(public._efectivo_actua_por(e.persona_id), false) then
    raise exception 'sólo firma el recibo quien rinde esta entrega: el jefe de obra que la tiene, o Administración' using errcode = '42501';
  end if;
  if exists (select 1 from public.efectivo_recibo_firma where rendicion_id = p_rendicion) then
    raise exception 'el recibo de este gasto ya está firmado' using errcode = 'P0001';
  end if;
  if v_acl is null or length(v_acl) < 3 then
    raise exception 'escribí el nombre de quien firma (aclaración)' using errcode = 'P0001';
  end if;
  if length(v_acl) > 120 then raise exception 'la aclaración es demasiado larga' using errcode = 'P0001'; end if;
  if v_dni is not null and v_dni !~ '^[0-9]{6,8}$' then
    raise exception 'el DNI tiene entre 6 y 8 números (o dejalo vacío)' using errcode = 'P0001';
  end if;
  -- El mismo criterio que `esTrazoGuardable` de la app: un SVG con un path, no cualquier texto.
  if p_trazo is null or length(p_trazo) > 60000
     or p_trazo !~ '^<svg [^>]*viewBox="0 0 [0-9]+ [0-9]+">' or p_trazo !~ '<path d="M[0-9 MLl-]+"' or p_trazo not like '%</svg>' then
    raise exception 'falta la firma: firmá arriba de la línea' using errcode = 'P0001';
  end if;
  insert into public.efectivo_recibo_firma
    (rendicion_id, entrega_id, monto, fecha, concepto, proveedor, trazo, aclaracion, dni, registrado_por)
  values
    (r.id, r.entrega_id, r.monto, coalesce(r.fecha, (r.imputada_en at time zone 'America/Argentina/San_Juan')::date),
     nullif(btrim(coalesce(r.concepto, '')), ''), nullif(btrim(coalesce(r.proveedor, '')), ''),
     p_trazo, v_acl, v_dni, v_usr)
  returning firmado_en into v_en;
  return v_en;
end $$;
revoke all on function public.firmar_recibo_gasto_manual(uuid, text, text, text) from public, anon;
grant execute on function public.firmar_recibo_gasto_manual(uuid, text, text, text) to authenticated;
