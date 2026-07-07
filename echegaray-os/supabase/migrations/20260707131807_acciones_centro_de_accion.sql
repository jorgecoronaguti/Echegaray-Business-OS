create table acciones (
  id uuid primary key default gen_random_uuid(),
  origen text not null check (origen in ('manual', 'sistema')),
  titulo text not null,
  causa text,
  area text not null check (area in (
    'direccion', 'obras_produccion', 'administracion_finanzas',
    'compras_abastecimiento', 'personas_productividad', 'comercial_presupuestacion'
  )),
  categoria_alerta text,
  alerta_origen_id text,
  severidad text check (severidad in ('critica', 'alta', 'media', 'informativa')),
  obra_id uuid references obras(id) on delete set null,
  contraparte text,
  monto numeric,
  fecha_limite date,
  responsable text,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'en_curso', 'resuelta', 'descartada')),
  resolucion_notas text,
  fecha_resolucion date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint acciones_resolucion_check check (
    estado in ('pendiente', 'en_curso') or (estado in ('resuelta', 'descartada') and fecha_resolucion is not null)
  ),
  constraint acciones_origen_sistema_check check (
    origen = 'manual' or alerta_origen_id is not null
  )
);

create unique index acciones_alerta_origen_unique on acciones (alerta_origen_id) where alerta_origen_id is not null;
create index acciones_area_idx on acciones (area);
create index acciones_obra_idx on acciones (obra_id);
create index acciones_estado_idx on acciones (estado);

alter table acciones enable row level security;

create policy "authenticated_full_access" on acciones for all to authenticated using (true) with check (true);

grant select, insert, update, delete on public.acciones to authenticated;

create trigger acciones_set_updated_at before update on acciones for each row execute function set_updated_at();
