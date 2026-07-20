-- FECHA DE PAGO EN LOS EGRESOS.
--
-- costos_obra.fecha es la fecha de FACTURA (columna C de Compras). El calendario de caja de la web
-- estaba poniendo cada pago el día en que se emitió la factura, no el día en que sale la plata:
-- para un flujo de fondos eso no es un detalle de precisión, es el dato. Medido en Compras: 576
-- filas tienen fecha contable Y prevista, 112 sólo prevista, 45 sólo contable, 3 ninguna.
alter table public.costos_obra add column if not exists fecha_pago date;
comment on column public.costos_obra.fecha_pago is
  'Cuándo SALE la plata: la fecha contable del pago si existe, si no la prevista. fecha es la de factura y sirve para el devengado, no para la caja.';

create or replace view public.calendario_caja as
  select 'cobro'::text                                  as tipo,
         coalesce(c.fecha_cobro, c.fecha_vencimiento)    as fecha,
         c.cliente_texto                                 as contraparte,
         c.concepto,
         c.total                                         as monto,
         (c.fecha_cobro is not null)                     as confirmado
    from public.cobranza c
   where coalesce(c.fecha_cobro, c.fecha_vencimiento) is not null
  union all
  select 'pago',
         coalesce(o.fecha_pago, o.fecha),
         o.proveedor,
         coalesce(nullif(o.concepto, ''), o.obra_texto),
         -o.total,
         (o.fecha_pago is not null)
    from public.costos_obra o
   where coalesce(o.fecha_pago, o.fecha) is not null;
