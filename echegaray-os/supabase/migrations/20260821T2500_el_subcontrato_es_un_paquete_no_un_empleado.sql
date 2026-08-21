-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- EL SUBCONTRATO ES UN PAQUETE DE ALCANCE, NO UN EMPLEADO Y NO UNA COMPRA
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- Hoy un subcontrato es indistinguible de una compra: entra por `costos_obra` como un comprobante
-- más. Eso tiene tres consecuencias que se pagan:
--
--   · no se puede comparar hacer algo con gente propia contra subcontratarlo, porque el precio del
--     subcontrato no está atado al alcance que cubre;
--   · lo que Echegaray le PONE al subcontratista —materiales, equipos, HH de apoyo, transporte,
--     comida, EPP— queda mezclado con el costo general de la obra, así que el costo real del
--     paquete se subestima siempre;
--   · si mañana hay que responder por la gente de un tercero ante el IERIC o la ART, no hay dónde
--     mirar: `personas` no distingue plantel propio de personal ajeno.
--
-- ═══ EL PAQUETE VIVE DENTRO DEL ALCANCE DE UNA ACTIVIDAD ═══
--
-- No es una obra aparte ni una actividad paralela. Es una porción del alcance de actividades que ya
-- existen: la cantidad del paquete SE RESTA del alcance propio y el total de la actividad no cambia.
-- Por eso `subcontrato_alcance` lleva la cantidad, y por eso hay un control que impide que la suma
-- de lo subcontratado supere lo contratado de la actividad.
--
-- ═══ SU GENTE NO ES NUESTRA GENTE ═══
--
-- `persona_externa` es deliberadamente una tabla distinta de `personas`. Mezclarlas para «no
-- duplicar» sería el error: contaminaría la nómina, las HH propias, las cargas sociales y la
-- capacidad de obra, que son cuatro cuentas que tienen que seguir siendo del plantel propio. Lo que
-- sí comparten es la exigencia documental, porque esa es real para los dos.

-- ── 1 · el paquete ────────────────────────────────────────────────────────────────────────────
create table if not exists public.subcontrato (
  id                 uuid primary key default gen_random_uuid(),
  obra_id            text not null references public.obra_canonica (id) on delete restrict,
  proveedor_id       uuid references public.proveedores (id),
  proveedor_texto    text,
  nombre             text not null,
  alcance            text,
  cantidad           numeric check (cantidad is null or cantidad >= 0),
  unidad             text,
  precio_contratado  numeric check (precio_contratado is null or precio_contratado >= 0),
  moneda             text not null default 'ARS',
  fecha_inicio_plan  date,
  fecha_fin_plan     date,
  fecha_inicio_real  date,
  fecha_fin_real     date,
  estado             text not null default 'previsto'
                     check (estado in ('previsto', 'contratado', 'en_curso', 'terminado', 'anulado')),
  responsable_id     uuid,
  documentacion_ok   boolean not null default false,
  notas              text,
  creado_en          timestamptz not null default now(),
  creado_por         uuid default auth.uid(),
  constraint subcontrato_proveedor_dicho check (proveedor_id is not null or proveedor_texto is not null)
);

create index if not exists subcontrato_obra_idx on public.subcontrato (obra_id);

comment on column public.subcontrato.documentacion_ok is
  'La documentación del subcontratista está completa. Mientras es false el paquete no debería '
  'arrancar — el contrato lo dice: «documentación faltante bloquea el inicio del paquete». Se '
  'controla al pasar a en_curso, no al crear el paquete.';

-- ── 2 · qué porción de qué actividad cubre ────────────────────────────────────────────────────
create table if not exists public.subcontrato_alcance (
  id              uuid primary key default gen_random_uuid(),
  subcontrato_id  uuid not null references public.subcontrato (id) on delete cascade,
  actividad_id    uuid not null references public.obra_actividad (id) on delete cascade,
  cantidad        numeric check (cantidad is null or cantidad >= 0),
  unidad          text,
  ayuda_de_gremio boolean not null default false,
  creado_en       timestamptz not null default now(),
  constraint subcontrato_alcance_unico unique (subcontrato_id, actividad_id)
);

comment on column public.subcontrato_alcance.ayuda_de_gremio is
  'El subcontratista NO consume HH propias, salvo que se declare ayuda de gremio. Es la única '
  'puerta por la que una hora nuestra puede imputarse a su alcance, y está marcada para que se vea.';

-- Lo subcontratado no puede superar lo que la actividad tiene contratado.
create or replace function public.subcontrato_no_excede_la_actividad()
returns trigger language plpgsql as $$
declare objetivo numeric; comprometido numeric;
begin
  select cantidad_objetivo into objetivo from public.obra_actividad where id = new.actividad_id;
  if objetivo is null or new.cantidad is null then return new; end if;
  select coalesce(sum(cantidad), 0) into comprometido
    from public.subcontrato_alcance
   where actividad_id = new.actividad_id and id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid);
  if comprometido + new.cantidad > objetivo then
    raise exception 'la actividad tiene % de objetivo y ya hay % subcontratados: % no entra',
      objetivo, comprometido, new.cantidad;
  end if;
  return new;
end $$;

drop trigger if exists subcontrato_no_excede_t on public.subcontrato_alcance;
create trigger subcontrato_no_excede_t before insert or update on public.subcontrato_alcance
  for each row execute function public.subcontrato_no_excede_la_actividad();

-- ── 3 · lo que Echegaray le pone ──────────────────────────────────────────────────────────────
create table if not exists public.subcontrato_aporte (
  id              uuid primary key default gen_random_uuid(),
  subcontrato_id  uuid not null references public.subcontrato (id) on delete cascade,
  tipo            text not null check (tipo in ('material', 'equipo', 'hh_propia', 'transporte', 'comida', 'epp', 'otro')),
  descripcion     text not null,
  cantidad        numeric,
  unidad          text,
  monto           numeric check (monto is null or monto >= 0),
  fecha           date not null default current_date,
  registros_hh_id uuid references public.registros_hh (id) on delete set null,
  creado_en       timestamptz not null default now(),
  creado_por      uuid default auth.uid()
);

create index if not exists subcontrato_aporte_sub_idx on public.subcontrato_aporte (subcontrato_id);

comment on table public.subcontrato_aporte is
  'Lo que la empresa le entrega al subcontratista como si fuera personal propio. Sin esto el costo '
  'real del paquete se subestima siempre, y la comparación propio-vs-subcontrato sale a favor del '
  'subcontrato por construcción. Costo real = precio contratado + aportes.';

-- ── 4 · su gente, que no es la nuestra ────────────────────────────────────────────────────────
create table if not exists public.persona_externa (
  id                uuid primary key default gen_random_uuid(),
  subcontrato_id    uuid not null references public.subcontrato (id) on delete cascade,
  nombre_completo   text not null,
  dni               text,
  cuil              text,
  categoria         text,
  art_vigente_hasta date,
  alta_afip         boolean not null default false,
  activo            boolean not null default true,
  notas             text,
  creado_en         timestamptz not null default now()
);

create index if not exists persona_externa_sub_idx on public.persona_externa (subcontrato_id);

comment on table public.persona_externa is
  'El personal del subcontratista. Tabla separada de `personas` A PROPÓSITO: no entra en la nómina, '
  'no suma HH propias, no altera cargas sociales propias y no cuenta en la capacidad de obra. Se '
  'registra sólo para lo que sí es nuestro problema: saber quién está en la obra y con qué papeles.';

-- ── 5 · el costo real del paquete y la comparación ────────────────────────────────────────────
create or replace view public.subcontrato_costo with (security_invoker = true) as
select s.id                as subcontrato_id,
       s.obra_id, s.nombre, s.estado, s.cantidad, s.unidad, s.precio_contratado,
       coalesce(s.proveedor_texto, pr.razon_social)               as proveedor,
       coalesce(ap.aportes, 0)                                    as aportes,
       coalesce(s.precio_contratado, 0) + coalesce(ap.aportes, 0) as costo_real,
       ap.n_aportes,
       coalesce(hh.horas, 0)                                      as hh_propias_de_apoyo,
       coalesce(ex.n_personas, 0)                                 as personas_externas,
       coalesce(ex.sin_art, 0)                                    as externas_sin_art,
       s.documentacion_ok,
       case when s.cantidad > 0 and s.precio_contratado is not null
            then round(s.precio_contratado / s.cantidad, 2) end   as precio_unitario
  from public.subcontrato s
  left join public.proveedores pr on pr.id = s.proveedor_id
  left join lateral (select sum(monto) aportes, count(*)::int n_aportes
                       from public.subcontrato_aporte a where a.subcontrato_id = s.id) ap on true
  left join lateral (select sum(r.horas) horas
                       from public.subcontrato_aporte a
                       join public.registros_hh r on r.id = a.registros_hh_id
                      where a.subcontrato_id = s.id) hh on true
  left join lateral (select count(*)::int n_personas,
                            count(*) filter (where art_vigente_hasta is null or art_vigente_hasta < current_date)::int sin_art
                       from public.persona_externa e where e.subcontrato_id = s.id and e.activo) ex on true;

comment on view public.subcontrato_costo is
  'Costo real = precio contratado + aportes. Sin la segunda mitad, comparar propio contra '
  'subcontrato está sesgado a favor del subcontrato, porque lo que le damos lo paga la obra igual '
  'pero por otra ventanilla.';

-- ── 6 · la actividad dice si es propia o de un tercero ────────────────────────────────────────
create or replace view public.actividad_subcontratada with (security_invoker = true) as
select a.id                                    as actividad_id,
       a.obra_id, a.nombre, a.cantidad_objetivo, a.unidad,
       coalesce(sum(sa.cantidad), 0)           as cantidad_subcontratada,
       a.cantidad_objetivo - coalesce(sum(sa.cantidad), 0) as cantidad_propia,
       count(sa.id)::int                       as n_paquetes,
       bool_or(sa.ayuda_de_gremio)             as con_ayuda_de_gremio
  from public.obra_actividad a
  join public.subcontrato_alcance sa on sa.actividad_id = a.id
  group by a.id, a.obra_id, a.nombre, a.cantidad_objetivo, a.unidad;

-- ── 7 · permisos ──────────────────────────────────────────────────────────────────────────────
-- El paquete y su gente son OPERATIVOS: el jefe de obra los gestiona en su obra. El precio y los
-- montos son económicos y viven en columnas que sólo salen por la vista, que a su vez sólo abre
-- para quien ve economía.
alter table public.subcontrato          enable row level security;
alter table public.subcontrato_alcance  enable row level security;
alter table public.subcontrato_aporte   enable row level security;
alter table public.persona_externa      enable row level security;

drop policy if exists subcontrato_por_obra on public.subcontrato;
create policy subcontrato_por_obra on public.subcontrato for all to authenticated
  using (public.ve_obra(obra_id)) with check (public.ve_obra(obra_id));

drop policy if exists subcontrato_alcance_por_obra on public.subcontrato_alcance;
create policy subcontrato_alcance_por_obra on public.subcontrato_alcance for all to authenticated
  using (exists (select 1 from public.subcontrato s where s.id = subcontrato_id and public.ve_obra(s.obra_id)))
  with check (exists (select 1 from public.subcontrato s where s.id = subcontrato_id and public.ve_obra(s.obra_id)));

drop policy if exists subcontrato_aporte_por_obra on public.subcontrato_aporte;
create policy subcontrato_aporte_por_obra on public.subcontrato_aporte for all to authenticated
  using (exists (select 1 from public.subcontrato s where s.id = subcontrato_id and public.ve_obra(s.obra_id)))
  with check (exists (select 1 from public.subcontrato s where s.id = subcontrato_id and public.ve_obra(s.obra_id)));

drop policy if exists persona_externa_por_obra on public.persona_externa;
create policy persona_externa_por_obra on public.persona_externa for all to authenticated
  using (exists (select 1 from public.subcontrato s where s.id = subcontrato_id and public.ve_obra(s.obra_id)))
  with check (exists (select 1 from public.subcontrato s where s.id = subcontrato_id and public.ve_obra(s.obra_id)));

grant select, insert, update, delete on public.subcontrato, public.subcontrato_alcance,
      public.subcontrato_aporte, public.persona_externa to authenticated;
grant all on public.subcontrato, public.subcontrato_alcance, public.subcontrato_aporte,
      public.persona_externa to service_role;
grant select on public.subcontrato_costo, public.actividad_subcontratada to authenticated;
grant select on public.subcontrato_costo, public.actividad_subcontratada to service_role;
