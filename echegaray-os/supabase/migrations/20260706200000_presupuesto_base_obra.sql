-- PRP-003: Presupuesto Base de Obra
-- presupuestos: una versión del presupuesto aprobado/contratado de una obra.
-- partidas_presupuesto: líneas principales que componen esa versión.

create table presupuestos (
  id uuid primary key default gen_random_uuid(),
  obra_id uuid not null references obras(id) on delete restrict,
  version integer not null default 1 check (version > 0),
  estado text not null default 'borrador' check (estado in ('borrador', 'aprobado', 'reemplazado')),
  monto_presupuestado numeric(14,2) not null check (monto_presupuestado > 0),
  costo_directo_presupuestado numeric(14,2) not null check (costo_directo_presupuestado > 0),
  costo_indirecto_presupuestado numeric(14,2) not null default 0 check (costo_indirecto_presupuestado >= 0),
  margen_esperado numeric(14,2) not null,
  fuente_legacy text not null,
  fecha_presupuesto date not null,
  notas text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (obra_id, version)
);

create unique index presupuestos_un_aprobado_por_obra
  on presupuestos(obra_id) where estado = 'aprobado';

create index presupuestos_obra_idx on presupuestos(obra_id);

alter table presupuestos enable row level security;

create policy "authenticated_full_access" on presupuestos
  for all to authenticated using (true) with check (true);

grant select, insert, update, delete on public.presupuestos to authenticated;

create trigger presupuestos_set_updated_at before update on presupuestos
  for each row execute function set_updated_at();

create table partidas_presupuesto (
  id uuid primary key default gen_random_uuid(),
  presupuesto_id uuid not null references presupuestos(id) on delete cascade,
  codigo text,
  descripcion text not null,
  monto numeric(14,2) not null check (monto > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index partidas_presupuesto_presupuesto_idx on partidas_presupuesto(presupuesto_id);

alter table partidas_presupuesto enable row level security;

create policy "authenticated_full_access" on partidas_presupuesto
  for all to authenticated using (true) with check (true);

grant select, insert, update, delete on public.partidas_presupuesto to authenticated;

create trigger partidas_presupuesto_set_updated_at before update on partidas_presupuesto
  for each row execute function set_updated_at();
