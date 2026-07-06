# PRP-005: Control Económico Básico de Obra

> **Estado**: CERRADA
> **Fecha**: 2026-07-06
> **Proyecto**: Echegaray Business OS

---

## Objetivo

Primer cierre del ciclo "cotizar → ejecutar → comparar" (CLAUDE.md raíz): comparar el presupuesto **aprobado** de una obra contra sus costos reales acumulados, y responder en la ficha de obra: presupuesto aprobado, monto contratado, costo presupuestado, costo real acumulado, margen esperado, margen actualizado, desvío absoluto, desvío porcentual, % de presupuesto consumido, estado económico (sano/atención/crítico) y qué costos explican el desvío. Sin dashboard general, sin proyecciones, sin HH/compras/adicionales.

## Revisión previa (sin discovery general)

Blueprint TO-BE y AS-IS no existen como documentos independientes en el repo — están resumidos dentro de `discovery-drive-echegaray` (mapa de flujo empresarial) y `cash-flow-operativo` (Fase 1 del Blueprint). Se reutilizó ese resumen sin re-explorar Drive. Se revisaron en detalle PRP-003 (Presupuesto Base de Obra) y PRP-004 (Costos Reales de Obra), ambos ya cerrados, como base de datos de esta capacidad.

## Análisis de arquitectura: vista SQL, no tabla nueva

**Decisión: `create view obra_resumen_economico`**, no una tabla. Justificación:

| Opción | Por qué se descartó / eligió |
|---|---|
| Tabla nueva con valores persistidos | Descartada — duplicaría datos que ya existen en `obras`, `presupuestos` y `costos_reales`; requeriría mantenerla sincronizada con triggers en cada INSERT/UPDATE de esas tres tablas (más superficie de bugs) para un dato 100% derivable en el momento de la consulta. |
| Función SQL (RPC) | Descartada — una vista se puede filtrar con `.eq('obra_id', ...)` desde Supabase igual que una tabla, sin necesidad de invocar una función por separado; más simple de consumir desde el cliente. |
| Servicio TypeScript que hace 3 queries y calcula en JS | Descartada como capa única — dispersaría la lógica de cálculo fuera de la base, dificultando auditar el número "a mano" con SQL directo si alguna vez se cuestiona un resultado. |
| **Vista SQL + servicio TypeScript liviano** | **Elegida.** La vista concentra el cálculo (auditable con un `select * from obra_resumen_economico where obra_id = ...` directo en el SQL Editor); el servicio solo lee la vista y agrega la clasificación sano/atención/crítico (política de negocio, con umbrales explícitamente marcados como propuesta abierta, no un hecho estructural que deba vivir en SQL). |

**Gotcha de seguridad crítico**: una vista de Postgres, por default, se ejecuta con los permisos de su dueño (el rol que la creó), no con los del usuario que hace la consulta — eso bypasea el RLS de las tablas de abajo (`obras`, `presupuestos`, `costos_reales`) sin que sea obvio. Se usó `create view ... with (security_invoker = true)` explícitamente para forzar que la vista respete el RLS del usuario que consulta. Verificado con `get_advisors(type:"security")`: no aparece el lint "Security Definer View" — si hubiera aparecido, habría señalado que la vista bypasea RLS.

**Decisiones de cálculo:**
- **Costo real acumulado = suma de TODOS los `costos_reales` de la obra, sin importar estado** (comprometido + pendiente + pagado). Un costo comprometido o pendiente ya es realidad económica (devengado) aunque todavía no haya impactado caja — es exactamente la razón de ser de `costos_reales` frente a `movimientos_caja` (CLAUDE.md raíz: "nunca confundir rentabilidad con caja"). Se expone también el desglose por estado para quien necesite ver cuánto de eso ya se pagó.
- **Solo se usa el presupuesto con `estado = 'aprobado'`** — nunca borrador ni reemplazado (regla explícita del pedido). Si no hay ninguno, todos los campos derivados (`costo_presupuestado`, `desvio_absoluto`, `desvio_porcentual`, `margen_actualizado`) quedan `null` — no se fabrica un número comparando contra un presupuesto no vigente.
- **`margen_actualizado` = `margen_esperado` − (`costo_real_acumulado` − `costo_presupuestado`)**, es decir, el margen esperado ajustado por el desvío observado — no se recalcula el margen desde cero. Esto preserva cualquier ajuste que ya tuviera `margen_esperado` (ej. impuesto a las ganancias teórico, documentado en PRP-003 como dato transcripto de la Planilla, no una resta simple).
- **`desvio_absoluto` = `costo_real_acumulado` − `costo_presupuestado`**; positivo = gastando más de lo presupuestado. `desvio_porcentual` = ese desvío como % del costo presupuestado.
- **Estado económico (sano/atención/crítico)**: umbrales de `desvio_porcentual` (≤5% sano, ≤15% atención, >15% crítico) puestos como constantes explícitas en `features/control-economico/types/index.ts`, documentados como **propuesta no validada con el usuario todavía** — es una decisión de negocio abierta, no un hecho. Fáciles de ajustar sin tocar la vista SQL.
- **"Sin proyecciones avanzadas"**: `margen_actualizado` y `% consumido` tratan el costo real acumulado a la fecha como si fuera el costo final — no proyectan el costo restante para terminar la obra. Es una simplificación deliberada (excluida explícitamente del alcance); una obra a mitad de camino puede mostrar "sano" y terminar mal si el ritmo de gasto se acelera después. Documentado como límite conocido.

**Descartado explícitamente:**
- Dashboard general de dirección (consolidado de todas las obras) — capacidad futura.
- Proyección de costo final o fecha de cierre — fuera de alcance.
- Mezclar adicionales con el presupuesto base — el cálculo usa únicamente `presupuestos`/`costos_reales` tal como están, sin tocar (todavía inexistente) Adicionales.
- Contar movimientos de caja como costo económico — la vista no toca `movimientos_caja` en absoluto; solo entra a este cálculo lo que ya está en `costos_reales` (que si corresponde, tiene su propio vínculo opcional y validado por trigger hacia un movimiento de pago — PRP-004).

---

## Modelo de datos

```sql
create view obra_resumen_economico
with (security_invoker = true)
as
select
  o.id as obra_id, o.nombre as obra_nombre, o.monto_contratado,
  p.id as presupuesto_id, p.version as presupuesto_version, p.monto_presupuestado,
  (p.costo_directo_presupuestado + p.costo_indirecto_presupuestado) as costo_presupuestado,
  p.margen_esperado, p.fuente_legacy as presupuesto_fuente_legacy,
  coalesce(cr.costo_real_acumulado, 0) as costo_real_acumulado,
  coalesce(cr.costo_comprometido, 0) as costo_comprometido,
  coalesce(cr.costo_pendiente, 0) as costo_pendiente,
  coalesce(cr.costo_pagado, 0) as costo_pagado,
  case when p.id is null then null
    else coalesce(cr.costo_real_acumulado, 0) - (p.costo_directo_presupuestado + p.costo_indirecto_presupuestado)
  end as desvio_absoluto,
  case when p.id is null or (p.costo_directo_presupuestado + p.costo_indirecto_presupuestado) = 0 then null
    else round((coalesce(cr.costo_real_acumulado, 0) - (p.costo_directo_presupuestado + p.costo_indirecto_presupuestado))
      / (p.costo_directo_presupuestado + p.costo_indirecto_presupuestado) * 100, 2)
  end as desvio_porcentual,
  case when p.id is null then null
    else p.margen_esperado - (coalesce(cr.costo_real_acumulado, 0) - (p.costo_directo_presupuestado + p.costo_indirecto_presupuestado))
  end as margen_actualizado
from obras o
left join presupuestos p on p.obra_id = o.id and p.estado = 'aprobado'
left join lateral (
  select sum(monto) as costo_real_acumulado,
    sum(monto) filter (where estado = 'comprometido') as costo_comprometido,
    sum(monto) filter (where estado = 'pendiente') as costo_pendiente,
    sum(monto) filter (where estado = 'pagado') as costo_pagado
  from costos_reales where costos_reales.obra_id = o.id
) cr on true;

grant select on public.obra_resumen_economico to authenticated;
```

No hay tabla nueva, no hay RLS policy nueva (la vista hereda el RLS de `obras`/`presupuestos`/`costos_reales` vía `security_invoker`), solo un GRANT explícito sobre la vista misma.

---

## Blueprint (fase única) ✅ CERRADA (2026-07-06)

**Objetivo**: vista `obra_resumen_economico` aplicada y verificada contra Supabase real; UI de solo lectura en `/obras/[id]` (nueva sección "Control económico": estado sano/atención/crítico, resumen de montos, desglose por estado del costo real, lista de costos que más explican el desvío).

**Validación**: migración vía MCP (`20260706200918_control_economico_obra_resumen.sql`); 3 escenarios probados con datos reales (obra sin presupuesto aprobado → todos los campos derivados en `null`, costo real 0; obra con presupuesto aprobado sin costos reales → desvío −100% margen_actualizado = monto_presupuestado completo; obra con presupuesto y costos en los 3 estados → costo_real_acumulado=95000, costo_presupuestado=80000, desvio_absoluto=+15000, desvio_porcentual=+18.75%, margen_actualizado=5000 — todos los números coincidieron exactamente con el cálculo manual esperado); RLS verificado con `SET LOCAL ROLE` (`anon` bloqueado, `authenticated` con acceso); `get_advisors(security)` confirmó que no aparece "Security Definer View" (la vista respeta RLS); `tsc`/`build`/`lint`/16 tests de Playwright en verde; datos `SMOKE TEST%` eliminados después de verificar.

---

## Gotchas
- [x] Sin `with (security_invoker = true)`, la vista bypasea el RLS de las tablas subyacentes — sería un hallazgo de seguridad real, no solo un warning cosmético. Confirmado que con esta opción el advisor no reporta el problema.
- [ ] Los umbrales de estado económico (5% / 15%) son una propuesta razonable, no validada con el usuario — viven como constantes en `features/control-economico/types/index.ts`, fáciles de ajustar sin migración.
- [ ] `margen_actualizado` y `% consumido` no proyectan el costo restante para terminar la obra — tratan el costo real a la fecha como si fuera el final. Es una simplificación deliberada del alcance ("sin proyecciones avanzadas"); revisar si en el futuro se pide una proyección real de costo a la conclusión.
- [ ] Sin JWT real, no se pudo probar con Playwright la visibilidad del resumen económico end-to-end — mismo límite de entorno documentado desde PRP-001.

## Anti-patrones
- NO crear una tabla que duplique datos ya calculables de `obras`/`presupuestos`/`costos_reales`.
- NO usar presupuesto borrador o reemplazado para el cálculo — solo `aprobado`.
- NO contar `movimientos_caja` como costo económico salvo que ya estén reflejados en `costos_reales`.
- NO construir todavía dashboard general, proyecciones ni comparación con adicionales.

---

*Capacidad 5 (Control Económico Básico de Obra): CERRADA y validada contra Supabase real.*
