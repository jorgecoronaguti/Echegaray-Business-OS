# PRP-009: Compras y Abastecimiento de Obra

> **Estado**: CERRADA
> **Fecha**: 2026-07-07
> **Proyecto**: Echegaray Business OS

---

## Objetivo

Controlar el ciclo real de una compra vinculada a una obra (necesidad → solicitud → cotización → orden → recepción) y su trazabilidad hacia el costo real y el pago, sin duplicar Costos Reales ni Caja, evitando compras urgentes evitables, faltantes que frenan obra, y pagos sin trazabilidad clara.

## Verificación puntual de fuentes reales (antes de modelar, no discovery general)

- **"Orden de Compra" como documento formal**: se encontró **una sola instancia real** (`ORDEN DE COMPRA ECSAS.pdf`), archivada dentro de una carpeta con nombre de obra ("COCHERAS") — confirma que la obra se identifica hoy por ubicación de archivo, no por un campo estructurado. El documento tiene proveedor, fecha de emisión, dirección de entrega, detalle/cantidad y un campo "RECIBE [persona]" — **sin fecha de entrega prevista ni fecha de recepción como campos propios**. Es una práctica ad-hoc, no sistemática (no se encontró un número de serie recurrente para las compras propias de Echegaray).
- Otras "Orden de Compra" encontradas en Drive corresponden a un cliente (Manufacturas Químicas Juan Messina) emitiendo órdenes **hacia** Echegaray como su proveedor — el lado de venta de Echegaray, no el de compra. Correctamente excluidas de esta capacidad.
- **No existe** una fuente sistemática de "necesidad de compra" ni de comparación de cotizaciones — territorio nuevo para el OS, mismo caso que Adicionales (PRP-006).
- **Cheques/echeqs**: no se encontró un ledger dedicado nuevo — siguen viviendo únicamente donde ya estaban documentados (Flujo de Caja - Cash Flow, discovery previo), sin evidencia nueva que amplíe ese conocimiento.
- `CONTROL DE GASTOS.xlsx` (ya verificado en PRP-004) confirma la categoría "Proveedores", pero la columna FORMA DE PAGO aparece vacía en la muestra — el medio de pago no se registra de forma confiable hoy.

**Conclusión**: el proceso de compras de Echegaray hoy es informal — no hay un origen de dato sistemático "necesidad → cotización → orden → recepción" que reconciliar; el OS construye esta capacidad como territorio nuevo, apoyado únicamente en lo que ya es confiable (Costos Reales, Caja, Proveedores).

## Pregunta de arquitectura obligatoria: qué separar

De las 6 entidades candidatas (necesidad/solicitud, compra/orden, recepción, obligación de pago, costo real, movimiento de caja), se decidió:

| Entidad | Decisión |
|---|---|
| Necesidad, solicitud, cotización, orden, recepción | **Una sola tabla, `compras`**, con columnas fecha+monto por etapa (mismo patrón que Adicionales, PRP-006) — son la misma entidad de negocio en distintos momentos de su vida, no procesos independientes. |
| Costo real | **Ya existe** (`costos_reales`, PRP-004) — no se duplica. Se conecta mediante una FK nueva. |
| Obligación de pago / movimiento de caja | **Ya existe** (`movimientos_caja`, PRP-001) — no se duplica. Se conecta mediante una FK nueva. |

### Decisión de arquitectura central: la FK se invierte, no se repite el patrón anterior

En Costos Reales, Adicionales y Certificados, el vínculo hacia `movimientos_caja` es una FK **única** en la tabla "cabecera" (`costos_reales.movimiento_caja_id`, etc.), porque esas entidades tienen **un** cobro o pago relevante. Una Compra real, en cambio, puede tener:
- **Varios costos reales** (entregas parciales facturadas por separado).
- **Varios pagos** (cuotas, pagos parciales, distintos medios — cheque, transferencia, efectivo).

Forzar una FK única en `compras` habría bloqueado exactamente esos casos reales que la regla de negocio pide representar ("no fuerces el patrón actual de un único movimiento_caja_id"). En cambio, la FK se agregó **del lado de "muchos"**:
- `costos_reales.compra_id` (nullable) — un costo real puede señalar la compra que lo originó; varias filas de `costos_reales` pueden señalar la misma compra.
- `movimientos_caja.compra_id` (nullable) — un pago puede señalar la compra que liquida; varios movimientos pueden señalar la misma compra (cuotas).

Esto resuelve **Compra → Costo Real → Pago → Caja** con trazabilidad completa y sin duplicar ningún dato, permitiendo naturalmente 1:N en ambos sentidos sin necesitar una tabla de unión.

| Decisión | Por qué |
|---|---|
| `obra_id` y `proveedor_id` nullable en `compras` | El objetivo funcional pide poder detectar "compra sin Obra" y "compra sin Proveedor" como alertas reales — si fueran `NOT NULL`, esas alertas nunca podrían dispararse. Divergencia deliberada del patrón usado en Adicionales/Certificados (donde `obra_id` es obligatorio). |
| Sin constraint de orden entre etapas | Igual que Adicionales: permite representar (no bloquear) una compra urgente que salta solicitud/cotización — es la anomalía que la capacidad debe poder detectar, no impedir. |
| `fecha_entrega_prevista` nullable, sin plazo fabricado | Mismo criterio que `certificados.fecha_vencimiento` (PRP-007): la alerta de retraso solo se activa si el dato real existe. |
| `movimientos_caja.compra_id` validado con CHECK simple, no trigger | A diferencia de los vínculos anteriores (que necesitaban un trigger porque la FK y el campo `tipo` vivían en tablas distintas), acá ambos campos viven en `movimientos_caja` — un CHECK directo (`compra_id is null or tipo = 'pago'`) alcanza. |
| Vista `compra_resumen`, no tabla | Mismo criterio que `obra_resumen_economico`/`compra_ejecucion_financiera`: el costo real acumulado y el monto pagado por compra son 100% derivables agregando las filas ya vinculadas — no hace falta persistirlos. |
| Alertas por compra en TypeScript puro | Mismo criterio que Adicionales — predicados sobre una fila + su resumen agregado, sin necesitar SQL adicional. |
| "Proveedor con retrasos recurrentes" acotado a la obra actual | Un análisis cruzado entre obras es, por definición, un Dashboard consolidado — explícitamente pospuesto. Se implementó únicamente dentro de la lista de compras de la obra, con un mínimo de compras del proveedor antes de opinar (evita alertar con 1-2 datos). |

**Descartado explícitamente:**
- Tabla de unión `compras_costos_reales` / `compras_pagos` — innecesaria una vez que la FK vive del lado de "muchos".
- Módulo completo de Cheques/Echeqs — fuera de alcance, explícitamente pospuesto; no se fabricó ninguna estructura para instrumentos de pago más allá de lo que `movimientos_caja` ya representa.
- Comparación formal de múltiples cotizaciones de distintos proveedores — no hay evidencia de que esa práctica exista hoy de forma estructurada; se simplificó a "una cotización, un proveedor elegido" por compra.
- Un campo `estado` enum persistido — se deriva (`estadoOperativoCompra`) de la última etapa con fecha cargada, evitando desincronización.

---

## Modelo de datos

```sql
create table compras (
  id uuid primary key default gen_random_uuid(),
  obra_id uuid references obras(id) on delete restrict,        -- nullable: alerta "sin obra"
  proveedor_id uuid references proveedores(id) on delete restrict, -- nullable: alerta "sin proveedor"
  concepto text not null,
  fecha_necesidad date not null,
  fecha_solicitud date,
  fecha_cotizacion date, monto_cotizado numeric(14,2),
  fecha_orden date, monto_orden numeric(14,2), referencia_orden text,
  fecha_entrega_prevista date,
  fecha_recepcion date, monto_recibido numeric(14,2),
  fuente_legacy text not null,
  notas text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table costos_reales add column compra_id uuid references compras(id) on delete set null;
alter table movimientos_caja add column compra_id uuid references compras(id) on delete set null;
alter table movimientos_caja add constraint movimientos_caja_compra_solo_pago check (compra_id is null or tipo = 'pago');

create view compra_resumen
with (security_invoker = true)
as
select c.*, ... -- costo_real_acumulado y monto_pagado agregados desde costos_reales/movimientos_caja
from compras c
left join lateral (select sum(monto) as costo_real_acumulado from costos_reales where costos_reales.compra_id = c.id) cr on true
left join lateral (select sum(monto) as monto_pagado, count(*) as cantidad_pagos from movimientos_caja where movimientos_caja.compra_id = c.id and estado = 'real') mc on true;
```

RLS/GRANT: mismo patrón que todas las tablas anteriores para `compras`; la vista con GRANT propio + `security_invoker = true`.

---

## Blueprint (fase única) ✅ CERRADA (2026-07-07)

**Objetivo**: `compras` + FKs invertidas en `costos_reales`/`movimientos_caja` + vista `compra_resumen` aplicadas y verificadas contra Supabase real; UI en `/obras/[id]` (nueva sección "Compras y abastecimiento": alta de necesidad, listado con alertas por compra y de obra, formulario de actualización de etapas con selector para vincular un pago existente); `CostoRealForm` extendido con selector opcional de compra.

**Validación**:
- Migración vía MCP (`20260707115703_compras_abastecimiento_obra.sql`).
- Caso permitido explícitamente: compra sin `obra_id` insertada correctamente (confirma que la alerta "sin obra" puede dispararse).
- Constraints probados: pareja fecha/monto de orden rechazada sin monto, monto ≤ 0 rechazado.
- **Caso central verificado con datos reales**: una misma compra recibió **2 costos_reales** (entregas parciales, $30.000 + $20.000) y **2 movimientos_caja de tipo pago** (cuotas, $25.000 + $25.000) — la vista `compra_resumen` devolvió `costo_real_acumulado=50000`, `monto_pagado=50000`, `cantidad_pagos=2`, exactamente lo esperado.
- Vincular una compra a un movimiento tipo `cobro` fue rechazado por el CHECK (no trigger).
- RLS/GRANT verificado con `SET LOCAL ROLE` en la tabla y en la vista.
- `get_advisors(security)` sin hallazgos nuevos.
- `tsc`/`build`/`lint`/20 tests de Playwright en verde.
- Datos `SMOKE TEST%` eliminados después de verificar.

---

## Gotchas
- [x] El patrón "FK del lado de muchos" (en vez de FK única en la cabecera) es superior para relaciones 1:N reales, y podría aplicarse retroactivamente a `costos_reales.movimiento_caja_id`/`adicionales.movimiento_caja_id`/`certificados.movimiento_caja_id` si en el futuro se confirma la necesidad real de pagos parciales ahí — no se tocó nada existente en esta capacidad (fuera de alcance), solo se documenta como mejora posible.
- [ ] "Proveedor con retrasos recurrentes" solo analiza dentro de la obra actual — un análisis cruzado entre obras pertenece al futuro Dashboard consolidado.
- [ ] Los umbrales (`UMBRAL_DIAS_COMPRA_URGENTE=2`, `UMBRAL_CANTIDAD_URGENTES=3`, `MINIMO_COMPRAS_PROVEEDOR_PARA_ANALISIS=3`, en `features/compras/types/index.ts`) son propuestas no validadas con el usuario.
- [ ] Sin JWT real, no se pudo probar con Playwright la visibilidad de las alertas ni los formularios end-to-end (mismo límite de entorno de siempre, ver PRP-001).

## Anti-patrones
- NO duplicar `costos_reales` ni `movimientos_caja` — toda conexión es por FK, nunca por copia de datos.
- NO forzar una FK única cuando la realidad del negocio es 1:N.
- NO fabricar una fecha de entrega prevista ni un plazo de retraso estándar.
- NO construir un módulo de Cheques/Echeqs en esta capacidad.
- NO modificar Google Drive ni reemplazar el proceso actual (que hoy es informal).

---

*Capacidad 9 (Compras y Abastecimiento de Obra): CERRADA y validada contra Supabase real.*
