-- COBRANZAS al núcleo (F1, lado ingresos/percibido). Espejo FIEL de la pestaña 02_Cobranzas del
-- Sheet "Flujo de Caja - Cash Flow" — la fuente de verdad. El dueño ya carga ahí Fecha cobro +
-- Estado, así que se puede calcular DSO, por-cobrar y vencidas SIN inventar nada. Mismo patrón que
-- costos_obra (snapshot idempotente por origen), y se reconcilia $0 contra el Sheet.
create table if not exists public.cobranzas (
  id                 uuid primary key default gen_random_uuid(),  -- surrogada (el ID del Sheet NO es único)
  sheet_id           text,                  -- ID de la fila en el Sheet (idx0) — puede repetir
  categoria          text,                  -- B/N
  fecha_emision      date,
  factura            text,                  -- FCE/FA
  numero_comprobante text,
  unidad             text,                  -- Mantenimiento/Civil
  obra_cliente       text,                  -- texto crudo (se resuelve por el eje obra_canonica)
  orden_compra       text,
  concepto           text,
  monto_neto         numeric,
  iva                numeric,
  retenciones        numeric,
  total_bruto        numeric,
  forma_cobro        text,
  estado             text,                  -- Cobrado / Pendiente / Proyectado / Facturado / Efectivo
  fecha_venta        date,
  fecha_cobro        date,                  -- fecha (esperada o real) de cobro
  mes_cobro          text,
  origen             text not null default 'cobranzas_sheet',
  sincronizado_en    timestamptz not null default now()
);
create index if not exists cobranzas_estado_idx on public.cobranzas (estado);
create index if not exists cobranzas_fecha_cobro_idx on public.cobranzas (fecha_cobro);
comment on table public.cobranzas is
  'Espejo fiel de 02_Cobranzas del Sheet Flujo de Caja (percibido/ingresos). Reconcilia $0 contra el Sheet. estado: Cobrado=real; Pendiente/Facturado/Proyectado=por cobrar.';
