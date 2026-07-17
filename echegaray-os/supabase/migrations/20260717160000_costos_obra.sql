-- ESPEJO de la pestaña "Compras" del Sheet Flujo de Caja → costo real por obra.
-- El dueño YA asigna cada compra a una obra en el Sheet (col "Cliente / Asignación"): 731 filas,
-- todas asignadas. La web mostraba $0 porque leía comprobantes_arca (sin obra) y pedía re-asignar
-- a mano lo ya asignado. Esta tabla espeja el Sheet keyed por obra_texto (mismo patrón que
-- pedidos_materiales/avance_obra — las obras viven como TEXTO, no hay tabla canónica). Fuente de
-- verdad = el Sheet; esto es el espejo gobernado que la web lee. Sync: orquestador/scripts/sync-compras.mjs.
create table if not exists public.costos_obra (
  id uuid primary key default gen_random_uuid(),
  obra_texto text not null,
  unidad_negocio text,
  proveedor text,
  modalidad text,
  tipo text,
  comprobante text,
  categoria text,
  concepto text,
  importe numeric,
  iva numeric,
  total numeric not null default 0,
  fecha date,
  mes text,
  origen text not null default 'compras_sheet',
  referencia_externa text,
  sincronizado_en timestamptz default now()
);
create unique index if not exists costos_obra_origen_ref on public.costos_obra (origen, referencia_externa);
create index if not exists costos_obra_obra on public.costos_obra (lower(obra_texto));
create index if not exists costos_obra_fecha on public.costos_obra (fecha);

alter table public.costos_obra enable row level security;
create policy costos_obra_select on public.costos_obra for select to authenticated using (true);
create policy costos_obra_insert on public.costos_obra for insert to authenticated with check (true);
create policy costos_obra_update on public.costos_obra for update to authenticated using (true);
grant select, insert, update on public.costos_obra to authenticated;
