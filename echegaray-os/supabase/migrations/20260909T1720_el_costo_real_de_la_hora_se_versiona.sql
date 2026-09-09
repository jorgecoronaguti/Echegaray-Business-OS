-- 20260909T1720 · R9 · LA HORA CUESTA MÁS QUE EL $/H DE BOLSILLO, Y LA ALÍCUOTA TIENE FECHA
--
-- Handoff v2 §5: bolsillo 3.650 → costo 5.564, multiplicador 1,524. Todo presupuesto que use el
-- $/h de bolsillo subestima la mano de obra un 52 %.
--
-- ═══ POR QUÉ VERSIONADAS Y NO UN NÚMERO EN CÓDIGO ═══
--
-- Porque cuando cambia una alícuota, la obra vieja conserva la suya: recalcular marzo con la ART de
-- septiembre reescribiría un costo ya cargado a una obra ya cerrada. Un `update` sobre una fila
-- única haría exactamente eso, en silencio. Un cambio es una FILA NUEVA con otro `desde`, igual que
-- `persona_tarifa`.
--
-- ═══ LA MITAD DECLARADA ═══
--
-- Con el arreglo mitad recibo / mitad efectivo sólo la mitad declarada genera cargas, y el
-- multiplicador efectivo baja de 1,524 a 1,262. `base` dice sobre qué se aplica cada concepto: las
-- cargas y la ART sobre lo declarado, el no-trabajado-pago sobre el total. Sin esa columna el
-- sistema tendría que elegir por su cuenta, y elegiría mal la mitad de las veces.

create table if not exists public.costo_hora_alicuota (
  id         uuid primary key default gen_random_uuid(),
  concepto   text not null,
  desde      date not null,
  porcentaje numeric(7,4) not null,
  base       text not null default 'declarado',
  fuente     text not null,
  autor      uuid,
  cargada_en timestamptz not null default now(),

  constraint costo_hora_alicuota_concepto check (concepto in (
    'cargas_sociales', 'art', 'fondo_cese', 'seguro_vida_sepelio', 'no_trabajado_pago'
  )),
  constraint costo_hora_alicuota_base check (base in ('declarado', 'total')),
  -- Una alícuota negativa no existe, y una de 300 % es un typo que hay que frenar en la base: el
  -- costo de la hora multiplica sueldos de diecisiete personas.
  constraint costo_hora_alicuota_rango check (porcentaje >= 0 and porcentaje <= 100),
  constraint costo_hora_alicuota_con_fuente check (length(btrim(fuente)) > 0),
  constraint costo_hora_alicuota_una_por_dia unique (concepto, desde)
);

comment on table public.costo_hora_alicuota is
  'Las alícuotas que convierten el $/h de bolsillo en costo real (R9 del handoff v2). Un cambio es una fila nueva con otro desde: la obra vieja conserva su alícuota. base=declarado sólo pesa sobre la mitad en blanco; base=total sobre todo lo pagado.';
comment on column public.costo_hora_alicuota.fuente is
  'De dónde salió el porcentaje (convenio, factura de ART, liquidación del estudio). Ningún número sin origen.';

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- LA ESCALA DEL CONVENIO — NACE VACÍA, Y ESO SE DICE EN PANTALLA
-- ─────────────────────────────────────────────────────────────────────────────────────────────
--
-- §8 del handoff: la escala de 0076/75 no está cargada y seis personas no tienen piso contra el
-- cual comparar. La tabla existe VACÍA a propósito: sembrarla con números inventados convertiría
-- «sin cargar» en un piso falso, y el «bajo el piso» de la pantalla 8 pasaría a acusar gente por
-- una escala que nadie firmó. Sin fila, la pantalla dice «sin cargar» — R1: NULL nunca es cero.

create table if not exists public.convenio_escala (
  id         uuid primary key default gen_random_uuid(),
  convenio   text not null,
  categoria  text not null,
  desde      date not null,
  valor_hora numeric(14,2) not null,
  fuente     text not null,
  cargada_en timestamptz not null default now(),

  constraint convenio_escala_positiva check (valor_hora > 0),
  constraint convenio_escala_con_fuente check (length(btrim(fuente)) > 0),
  constraint convenio_escala_una_por_dia unique (convenio, categoria, desde)
);

comment on table public.convenio_escala is
  'El piso por categoría de cada convenio (UOCRA Ley 22.250, 0076/75). Nace VACÍA: sin escala cargada la pantalla escribe «sin piso», nunca 0 %.';

alter table public.costo_hora_alicuota enable row level security;
alter table public.convenio_escala     enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='costo_hora_alicuota' and policyname='costo_hora_alicuota_lee_admin') then
    create policy costo_hora_alicuota_lee_admin on public.costo_hora_alicuota
      for select to authenticated using (public.liquida_sueldos());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='costo_hora_alicuota' and policyname='costo_hora_alicuota_escribe_admin') then
    create policy costo_hora_alicuota_escribe_admin on public.costo_hora_alicuota
      for insert to authenticated with check (public.liquida_sueldos());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='costo_hora_alicuota' and policyname='costo_hora_alicuota_srv') then
    create policy costo_hora_alicuota_srv on public.costo_hora_alicuota
      for all to service_role using (true) with check (true);
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='convenio_escala' and policyname='convenio_escala_lee_admin') then
    create policy convenio_escala_lee_admin on public.convenio_escala
      for select to authenticated using (public.liquida_sueldos());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='convenio_escala' and policyname='convenio_escala_escribe_admin') then
    create policy convenio_escala_escribe_admin on public.convenio_escala
      for insert to authenticated with check (public.liquida_sueldos());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='convenio_escala' and policyname='convenio_escala_srv') then
    create policy convenio_escala_srv on public.convenio_escala
      for all to service_role using (true) with check (true);
  end if;
end $$;

grant select, insert on public.costo_hora_alicuota to authenticated;
grant all on public.costo_hora_alicuota to service_role;
-- CORREGIR UNA ALÍCUOTA VIEJA REESCRIBIRÍA EL COSTO DE UNA OBRA CERRADA. Se agrega una nueva.
revoke update, delete on public.costo_hora_alicuota from authenticated;

grant select, insert on public.convenio_escala to authenticated;
grant all on public.convenio_escala to service_role;
revoke update, delete on public.convenio_escala from authenticated;
