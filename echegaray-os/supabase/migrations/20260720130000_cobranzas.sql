-- COBRANZAS EN SUPABASE — la mitad que faltaba para que la web pueda mostrar un calendario de
-- cobros y pagos. Los egresos ya estaban replicados (costos_obra); los ingresos vivían sólo en la
-- pestaña, así que el scorecard sólo podía mostrar la mitad de la película.
create table if not exists public.cobranza (
  id            uuid primary key default gen_random_uuid(),
  fila_sheet    int,
  fecha_emision date,
  comprobante   text,
  unidad        text,
  cliente_texto text,
  obra_id       text references public.obra_canonica(id),
  concepto      text,
  total         numeric not null default 0,
  -- Las dos fechas que definen la caja: cuándo se espera y cuándo entró de verdad.
  fecha_vencimiento date,
  fecha_cobro       date,
  estado        text,
  probabilidad  numeric,
  origen        text not null default 'flujo_caja_sheet',
  sincronizado_en timestamptz not null default now(),
  unique (fila_sheet, origen)
);
comment on table public.cobranza is
  'Facturación emitida con su fecha de cobro esperada y real. fecha_cobro NULL = todavía no entró.';
create index if not exists cobranza_fechas_idx on public.cobranza (fecha_cobro, fecha_vencimiento);

-- El calendario que consume la web: una fila por movimiento, cobro o pago, con su fecha de caja.
create or replace view public.calendario_caja as
  select 'cobro'::text                                   as tipo,
         coalesce(c.fecha_cobro, c.fecha_vencimiento)     as fecha,
         c.cliente_texto                                  as contraparte,
         c.concepto,
         c.total                                          as monto,
         (c.fecha_cobro is not null)                      as confirmado
    from public.cobranza c
   where coalesce(c.fecha_cobro, c.fecha_vencimiento) is not null
  union all
  select 'pago',
         coalesce(o.fecha, o.fecha),
         o.proveedor,
         coalesce(nullif(o.concepto, ''), o.obra_texto),
         -o.total,
         true
    from public.costos_obra o
   where o.fecha is not null;

comment on view public.calendario_caja is
  'Cobros y pagos en una sola línea de tiempo. monto negativo = sale plata. confirmado=false en un cobro significa que es la fecha ESPERADA, no un hecho.';
