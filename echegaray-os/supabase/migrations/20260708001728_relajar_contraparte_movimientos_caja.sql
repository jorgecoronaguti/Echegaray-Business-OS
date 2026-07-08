-- F1: movimientos_caja asumía que todo cobro pertenece a una obra y todo pago a un
-- proveedor. Eso no es cierto para Mantenimiento (ingresos recurrentes sin obra
-- discreta, ej. ARCOR) ni para gastos internos como nómina/cargas sociales/impuestos
-- (no tienen proveedor real). Se relaja el constraint en vez de fabricar obras o
-- proveedores ficticios.

alter table public.movimientos_caja
  add column categoria_pago text
    check (categoria_pago is null or categoria_pago in ('nomina', 'cargas_sociales', 'impuestos'));

alter table public.movimientos_caja
  drop constraint movimientos_caja_contraparte_check;

alter table public.movimientos_caja
  add constraint movimientos_caja_contraparte_check check (
    (tipo = 'cobro' and cliente_id is not null and proveedor_id is null)
    or (tipo = 'pago' and proveedor_id is not null and cliente_id is null)
    or (tipo = 'pago' and proveedor_id is null and cliente_id is null and categoria_pago in ('nomina', 'cargas_sociales', 'impuestos'))
  );

comment on column public.movimientos_caja.categoria_pago is
  'Solo para tipo=pago sin proveedor_id: gasto interno recurrente (nómina, cargas sociales, impuestos) que no tiene una contraparte tipo proveedor comercial.';
