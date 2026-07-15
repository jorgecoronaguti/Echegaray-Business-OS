-- PLAN 1 F1 (cont.) — CUIT en proveedores para conciliar con ARCA por HECHO, no por nombre.
-- El cruce comprobantes_arca ↔ costos_reales hoy es heurístico (nombre aproximado). Con el
-- CUIT cargado, el match pasa a ser exacto. La columna es nullable: se completa con OK humano
-- (dato de negocio), no se auto-asigna por nombre difuso (sería fabricar dato).
alter table public.proveedores add column if not exists cuit text;
create index if not exists proveedores_cuit on public.proveedores (cuit) where cuit is not null;
comment on column public.proveedores.cuit is 'CUIT del proveedor (11 dígitos, sin guiones). Fuente: ARCA/AFIP. Se completa con confirmación humana.';
