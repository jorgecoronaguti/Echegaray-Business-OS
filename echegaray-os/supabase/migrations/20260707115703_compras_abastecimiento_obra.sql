-- PRP-009: Compras y Abastecimiento de Obra.
-- Verificación puntual confirmó: no existe fuente sistemática de "necesidad de compra"
-- ni comparación de cotizaciones (territorio nuevo, igual que Adicionales); "Orden de
-- Compra" como documento formal es ad-hoc (una sola instancia real encontrada, sin
-- fecha de entrega prevista ni recepción como campos propios); FORMA DE PAGO en
-- CONTROL DE GASTOS.xlsx no se completa de forma confiable.
--
-- Decisión de arquitectura central: una compra puede tener MÚLTIPLES pagos (cuotas,
-- parciales, distintos medios) y potencialmente MÚLTIPLES costos reales (entregas
-- parciales). Por eso el vínculo NO se modela como en costos_reales/adicionales/
-- certificados (FK única en la tabla "cabecera") — se invierte: la FK vive del lado
-- de "muchos" (costos_reales.compra_id, movimientos_caja.compra_id), permitiendo
-- 1 compra -> N costos reales y 1 compra -> N pagos sin tabla de unión.

create table compras (
  id uuid primary key default gen_random_uuid(),
  -- Nullable deliberado: el objetivo funcional pide poder detectar "compra sin obra"
  -- y "compra sin proveedor" como alertas reales — si fueran NOT NULL, esas alertas
  -- nunca podrían dispararse.
  obra_id uuid references obras(id) on delete restrict,
  proveedor_id uuid references proveedores(id) on delete restrict,

  concepto text not null,
  fecha_necesidad date not null,

  fecha_solicitud date,

  fecha_cotizacion date,
  monto_cotizado numeric(14,2),

  fecha_orden date,
  monto_orden numeric(14,2),
  referencia_orden text,

  -- Solo se completa cuando se conoce la fecha real prevista (no se fabrica un plazo
  -- estándar) — habilita la alerta "entrega retrasada" solo cuando el dato existe.
  fecha_entrega_prevista date,

  fecha_recepcion date,
  monto_recibido numeric(14,2),

  fuente_legacy text not null,
  notas text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint compras_monto_cotizado_check check (monto_cotizado is null or monto_cotizado > 0),
  constraint compras_monto_orden_check check (monto_orden is null or monto_orden > 0),
  constraint compras_monto_recibido_check check (monto_recibido is null or monto_recibido > 0),

  -- Fecha y monto de cada etapa viajan juntos. Sin constraint de orden entre etapas
  -- (igual que adicionales, PRP-006): permitir el desorden es lo que hace posible
  -- detectar compras urgentes que saltan solicitud/cotización.
  constraint compras_cotizacion_par_check check ((fecha_cotizacion is null) = (monto_cotizado is null)),
  constraint compras_orden_par_check check ((fecha_orden is null) = (monto_orden is null)),
  constraint compras_recepcion_par_check check ((fecha_recepcion is null) = (monto_recibido is null))
);

create index compras_obra_idx on compras(obra_id);
create index compras_proveedor_idx on compras(proveedor_id);

alter table compras enable row level security;

create policy "authenticated_full_access" on compras
  for all to authenticated using (true) with check (true);

grant select, insert, update, delete on public.compras to authenticated;

create trigger compras_set_updated_at before update on compras
  for each row execute function set_updated_at();

-- Costos Reales: vínculo opcional a la compra que lo originó (1 compra -> N costos).
alter table costos_reales add column compra_id uuid references compras(id) on delete set null;
create index costos_reales_compra_idx on costos_reales(compra_id);

-- Movimientos de Caja: vínculo opcional a la compra que paga (1 compra -> N pagos,
-- cuotas, distintos medios). CHECK simple (no trigger): compra_id y tipo viven en la
-- misma tabla, así que alcanza con un CHECK para exigir que sea siempre un pago.
alter table movimientos_caja add column compra_id uuid references compras(id) on delete set null;
alter table movimientos_caja add constraint movimientos_caja_compra_solo_pago check (compra_id is null or tipo = 'pago');
create index movimientos_caja_compra_idx on movimientos_caja(compra_id);

-- Vista derivada (no tabla): resumen por compra — costo real acumulado y pagos
-- acumulados, agregando las N filas vinculadas de costos_reales/movimientos_caja.
-- security_invoker = true obligatorio (mismo gotcha de PRP-005/007/008).
create view compra_resumen
with (security_invoker = true)
as
select
  c.id as compra_id,
  c.obra_id,
  c.proveedor_id,
  c.concepto,
  c.fecha_necesidad,
  c.fecha_solicitud,
  c.fecha_cotizacion,
  c.monto_cotizado,
  c.fecha_orden,
  c.monto_orden,
  c.fecha_entrega_prevista,
  c.fecha_recepcion,
  c.monto_recibido,
  coalesce(cr.costo_real_acumulado, 0) as costo_real_acumulado,
  coalesce(mc.monto_pagado, 0) as monto_pagado,
  coalesce(mc.cantidad_pagos, 0) as cantidad_pagos
from compras c
left join lateral (
  select sum(monto) as costo_real_acumulado from costos_reales where costos_reales.compra_id = c.id
) cr on true
left join lateral (
  select sum(monto) as monto_pagado, count(*) as cantidad_pagos
  from movimientos_caja where movimientos_caja.compra_id = c.id and movimientos_caja.estado = 'real'
) mc on true;

grant select on public.compra_resumen to authenticated;
