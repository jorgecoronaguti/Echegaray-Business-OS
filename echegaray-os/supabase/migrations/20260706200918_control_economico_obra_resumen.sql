-- PRP-005: Control Económico Básico de Obra.
-- Vista derivada (no tabla nueva): compara presupuesto APROBADO vs costos reales
-- acumulados por obra. "security_invoker = true" es obligatorio — sin esto, Postgres
-- ejecuta la vista con los permisos del dueño (bypassea RLS de las tablas de abajo),
-- que es exactamente el hallazgo "Security Definer View" que reporta get_advisors.

create view obra_resumen_economico
with (security_invoker = true)
as
select
  o.id as obra_id,
  o.nombre as obra_nombre,
  o.monto_contratado,

  p.id as presupuesto_id,
  p.version as presupuesto_version,
  p.monto_presupuestado,
  -- Costo presupuestado = directo + indirecto de la versión aprobada (PRP-003).
  (p.costo_directo_presupuestado + p.costo_indirecto_presupuestado) as costo_presupuestado,
  -- margen_esperado se usa tal cual viene del presupuesto (dato transcripto de la
  -- Planilla, puede incluir ajustes de impuesto a las ganancias teórico — no se
  -- recalcula por resta, PRP-003).
  p.margen_esperado,
  p.fuente_legacy as presupuesto_fuente_legacy,

  -- Costo real acumulado = TODOS los costos_reales de la obra, sin importar estado.
  -- Un costo "comprometido" o "pendiente" ya es realidad económica (devengado) aunque
  -- todavía no haya impactado caja — esa es la razón de ser de costos_reales frente a
  -- movimientos_caja (CLAUDE.md raíz: nunca confundir rentabilidad con caja).
  coalesce(cr.costo_real_acumulado, 0) as costo_real_acumulado,
  coalesce(cr.costo_comprometido, 0) as costo_comprometido,
  coalesce(cr.costo_pendiente, 0) as costo_pendiente,
  coalesce(cr.costo_pagado, 0) as costo_pagado,

  case when p.id is null then null
    else coalesce(cr.costo_real_acumulado, 0) - (p.costo_directo_presupuestado + p.costo_indirecto_presupuestado)
  end as desvio_absoluto,

  case when p.id is null or (p.costo_directo_presupuestado + p.costo_indirecto_presupuestado) = 0 then null
    else round(
      (coalesce(cr.costo_real_acumulado, 0) - (p.costo_directo_presupuestado + p.costo_indirecto_presupuestado))
      / (p.costo_directo_presupuestado + p.costo_indirecto_presupuestado) * 100
    , 2)
  end as desvio_porcentual,

  -- Margen actualizado = margen esperado ajustado por el desvío observado, no
  -- recalculado desde cero (preserva cualquier ajuste ya incluido en margen_esperado).
  case when p.id is null then null
    else p.margen_esperado - (coalesce(cr.costo_real_acumulado, 0) - (p.costo_directo_presupuestado + p.costo_indirecto_presupuestado))
  end as margen_actualizado

from obras o
left join presupuestos p on p.obra_id = o.id and p.estado = 'aprobado'
left join lateral (
  select
    sum(monto) as costo_real_acumulado,
    sum(monto) filter (where estado = 'comprometido') as costo_comprometido,
    sum(monto) filter (where estado = 'pendiente') as costo_pendiente,
    sum(monto) filter (where estado = 'pagado') as costo_pagado
  from costos_reales
  where costos_reales.obra_id = o.id
) cr on true;

grant select on public.obra_resumen_economico to authenticated;
