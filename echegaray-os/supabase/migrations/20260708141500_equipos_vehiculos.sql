-- Primer dato real estructurado para el dominio "Equipos y Vehículos" (0/10 en el
-- scorecard). Sembrado desde la carpeta VEHICULOS de Drive (RTO/cédula/título reales),
-- ver fuentes_datos. No fabrica utilización ni costo -- eso es el próximo incremento.
create table equipos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  tipo text not null check (tipo in ('vehiculo', 'maquinaria', 'herramienta_mayor')),
  patente_o_identificador text,
  fuente_legacy text not null default 'VEHICULOS (Drive)',
  notas text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index equipos_patente_unique on equipos (patente_o_identificador) where patente_o_identificador is not null;

alter table equipos enable row level security;

create policy equipos_select on equipos for select to authenticated using (true);

create policy equipos_write on equipos
  for all to authenticated
  using (current_rol() in ('direccion', 'administracion'))
  with check (current_rol() in ('direccion', 'administracion'));

grant select, insert, update, delete on public.equipos to authenticated;

create trigger equipos_set_updated_at before update on equipos
  for each row execute function set_updated_at();
