# PRP-007: Ejecución Financiera de la Obra

> **Estado**: CERRADA
> **Fecha**: 2026-07-06
> **Proyecto**: Echegaray Business OS

---

## Objetivo

Construir el flujo que conecta la ejecución del **contrato base** con el ingreso real de dinero: Contrato → Certificados → Facturación → Cobranza → Caja. Responder cuánto se certificó, facturó y cobró contra el monto contratado, qué queda pendiente en cada paso, y detectar automáticamente certificados sin facturar, facturas sin cobrar, obras certificadas sin ingreso de caja y contratos con baja conversión a caja — sin mezclar nunca este flujo con Adicionales (que ya tiene su propio ciclo, PRP-006).

## Revisión previa (sin discovery general)

Se reutilizó el conocimiento ya confirmado en PRP-001 a PRP-006 (Fundación, Caja, Obra, Presupuesto, Costos Reales, Control Económico, Adicionales) y el AS-IS resumido en `discovery-drive-echegaray` (CONTROL DE GASTOS.xlsx como ledger de caja percibido, ya usado como referencia en PRP-004 — no fue necesario volver a Drive porque esta capacidad no depende de un archivo nuevo, sino de un concepto de negocio estándar de construcción — certificación de avance — ya descripto en el CLAUDE.md raíz ("Facturado vs Cobrado" en Control Económico) y en el objetivo funcional de esta capacidad).

## Análisis de arquitectura

### Decisión central: reutilizar el patrón de Adicionales (PRP-006), no reinventar uno nuevo

**Una tabla nueva, `certificados`**, con la misma arquitectura ya validada en Adicionales: columnas `fecha_X`/`monto_X` nullable por etapa (facturación, cobranza), **sin constraint de orden entre ellas** — permite representar (no bloquear) un certificado sin facturar o una factura sin cobrar, que son justamente las alertas pedidas.

| Decisión | Por qué |
|---|---|
| `certificados` como tabla propia, no una extensión de `adicionales` | Un Certificado representa avance del **contrato base**; un Adicional es trabajo fuera del contrato original. Mezclarlos en una tabla obligaría a un campo "tipo" y reglas condicionales cruzadas, violando la regla explícita "no mezclar adicionales con contrato base". Son la misma forma (ciclo facturación→cobranza) pero dominios distintos — como `costos_reales` y `adicionales` ya comparten el patrón de vínculo a `movimientos_caja` sin ser la misma tabla. |
| `unique (obra_id, numero)` | Los certificados de una obra se numeran secuencialmente en la práctica de construcción (Certificado N°1, N°2, ...) — el número es el identificador natural para reconciliar con la factura real, no un ID interno. |
| `fecha_vencimiento` nullable, sin plazo fabricado | La alerta "factura vencida" pedida requiere una fecha de vencimiento real. No se asume un plazo estándar (ej. 30 días) porque no hay ese dato confirmado — se completa solo cuando se conoce el vencimiento real de la factura, y la alerta de vencimiento solo se calcula si ese dato existe (si no, se muestra "pendiente de cobranza" sin calificar como vencida). |
| `movimiento_caja_id` opcional + trigger que exige tipo `cobro` | Tercera vez que se aplica este patrón (`costos_reales`→pago, `adicionales`→cobro, ahora `certificados`→cobro) — ya es un patrón establecido del proyecto, documentado en el skill `supabase`. |
| Vista `obra_ejecucion_financiera`, no tabla ni función | Mismo criterio que `obra_resumen_economico` (PRP-005): el dato es 100% derivable de `obras.monto_contratado` + agregación de `certificados` en el momento de la consulta — no hace falta persistirlo ni mantenerlo sincronizado. |
| Alertas por certificado en TypeScript, alertas de obra también en TypeScript | Mismo criterio que PRP-006: los predicados por certificado son sobre una sola fila (sin joins); los predicados de obra (`certificada_sin_ingreso_caja`, `baja_conversion_a_caja`) leen directamente los totales ya agregados por la vista, sin necesitar SQL adicional. |

**Descartado explícitamente:**
- Extender `adicionales` con una columna `es_contrato_base` — descartado por la regla explícita de no mezclar ambos conceptos, y porque los adicionales ya tienen su propio ciclo completo construido en PRP-006 sin este campo.
- Constraint de orden entre etapas (ej. exigir `fecha_certificacion` antes de `fecha_facturacion`) — la certificación siempre existe antes de crear la fila (es la etapa de alta), así que no hay realmente un caso "facturado sin certificar" posible en este modelo (a diferencia de Adicionales, donde la fila existe desde la detección y cualquier etapa posterior puede faltar). No se necesitó una regla especial acá.
- Un `estado` calculado y persistido por certificado (ej. `'pendiente_facturacion'`) — se calcula en el momento con `calcularAlertasCertificado`, evitando un campo que se desincronice.
- Umbral automático de "factura vencida" con un plazo estándar — se rechazó fabricar un número no confirmado con el usuario (CLAUDE.md raíz: nunca fabricar datos).

---

## Modelo de datos

```sql
create table certificados (
  id uuid primary key default gen_random_uuid(),
  obra_id uuid not null references obras(id) on delete restrict,
  numero text not null,
  descripcion text,
  fecha_certificacion date not null,
  monto_certificado numeric(14,2) not null check (monto_certificado > 0),
  fecha_facturacion date,
  monto_facturado numeric(14,2),
  referencia_factura text,
  fecha_vencimiento date,
  fecha_cobranza date,
  monto_cobrado numeric(14,2),
  movimiento_caja_id uuid references movimientos_caja(id) on delete set null,
  notas text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (obra_id, numero)
);

create unique index certificados_movimiento_caja_unico
  on certificados(movimiento_caja_id) where movimiento_caja_id is not null;

-- Trigger: movimiento_caja_id, si se indica, debe ser un movimiento de tipo cobro.
create trigger certificados_valida_movimiento_cobro before insert or update on certificados
  for each row execute function certificados_valida_movimiento_cobro();

create view obra_ejecucion_financiera
with (security_invoker = true)
as
select
  o.id as obra_id, o.nombre as obra_nombre, o.monto_contratado,
  coalesce(c.total_certificado, 0) as total_certificado,
  coalesce(c.total_facturado, 0) as total_facturado,
  coalesce(c.total_cobrado, 0) as total_cobrado,
  (o.monto_contratado - coalesce(c.total_certificado, 0)) as pendiente_certificar,
  (coalesce(c.total_certificado, 0) - coalesce(c.total_facturado, 0)) as pendiente_facturar,
  (coalesce(c.total_facturado, 0) - coalesce(c.total_cobrado, 0)) as pendiente_cobrar,
  case when o.monto_contratado = 0 then null
    else round(coalesce(c.total_cobrado, 0) / o.monto_contratado * 100, 2)
  end as porcentaje_contrato_cobrado
from obras o
left join lateral (
  select sum(monto_certificado) as total_certificado,
    sum(monto_facturado) as total_facturado, sum(monto_cobrado) as total_cobrado
  from certificados where certificados.obra_id = o.id
) c on true;
```

RLS/GRANT: mismo patrón que todas las tablas anteriores; vista con GRANT propio + `security_invoker = true`.

---

## Blueprint (fase única) ✅ CERRADA (2026-07-06)

**Objetivo**: `certificados` y vista `obra_ejecucion_financiera` aplicadas y verificadas contra Supabase real; UI en `/obras/[id]` (nueva sección "Ejecución financiera": resumen contrato/certificado/facturado/cobrado con alertas de obra, alta de certificados, listado con alertas por certificado y formulario de facturación/cobranza).

**Validación**:
- Migración vía MCP (`20260706202955_ejecucion_financiera_obra.sql`).
- Caso permitido explícitamente: certificado sin facturar (fecha_facturacion null) insertado sin error.
- Constraints probados: número de certificado duplicado en la misma obra rechazado (unique), monto_facturado sin fecha rechazado (pareja), monto ≤ 0 rechazado.
- Trigger probado: vínculo a un movimiento tipo `pago` rechazado, vínculo válido a tipo `cobro` aceptado, doble reclamo del mismo movimiento entre dos certificados rechazado (índice único parcial).
- Ciclo completo probado con datos reales (contrato $100.000, certificado $70.000, facturado $40.000, cobrado $38.000): la vista devolvió `pendiente_certificar=30000`, `pendiente_facturar=30000`, `pendiente_cobrar=2000`, `porcentaje_contrato_cobrado=38.00` — coincide exactamente con el cálculo manual esperado.
- RLS/GRANT verificado con `SET LOCAL ROLE` en la tabla y en la vista: `anon` bloqueado, `authenticated` con acceso.
- `get_advisors(security)`: sin hallazgos nuevos, mismo patrón conocido del resto de las tablas.
- `tsc`/`build`/`lint`/18 tests de Playwright en verde.
- Datos `SMOKE TEST%` eliminados después de verificar.

---

## Gotchas
- [ ] `fecha_vencimiento` es opcional y depende de que se cargue el dato real de la factura — sin ese dato, la alerta "factura vencida" nunca se activa (se muestra como "pendiente de cobranza" genérica). No hay ningún supuesto de plazo estándar.
- [ ] El umbral de "baja conversión a caja" (`UMBRAL_BAJA_CONVERSION_PORCENTAJE = 20` en `features/ejecucion-financiera/types/index.ts`) es una propuesta no validada con el usuario, igual que los umbrales de PRP-005 — fácil de ajustar sin migración.
- [ ] Un certificado admite como máximo un `movimiento_caja_id` vinculado — no se modelan cobros parciales múltiples por certificado (mismo límite aceptado que costos_reales y adicionales).
- [ ] Sin JWT real, no se pudo probar con Playwright la visibilidad de las alertas ni los formularios end-to-end (mismo límite de entorno de siempre, ver PRP-001).

## Anti-patrones
- NO mezclar `certificados` con `adicionales` — son ciclos paralelos, nunca la misma tabla.
- NO asumir que todo certificado se factura, ni que toda factura se cobra.
- NO fabricar un plazo de vencimiento estándar para calcular facturas "vencidas".
- NO construir todavía un dashboard consolidado de todas las obras.

---

*Capacidad 7 (Ejecución Financiera de la Obra): CERRADA y validada contra Supabase real.*
