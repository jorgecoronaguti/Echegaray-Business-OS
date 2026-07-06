# PRP-006: Gestión Integral de Adicionales

> **Estado**: CERRADA
> **Fecha**: 2026-07-06
> **Proyecto**: Echegaray Business OS

---

## Objetivo

No registrar adicionales — evitar que un adicional se pierda. Seguir cada adicional desde que se detecta hasta que se cobra (detección → cotización → aprobación → ejecución → facturación → cobranza → impacto en caja/margen), conservando toda la traza, y que el sistema detecte automáticamente las anomalías del proceso (ejecutado sin cotizar, cotizado sin aprobar, facturado sin cobrar, etc.) — no un CRUD, una capacidad de decisión.

## Revisión previa (sin discovery general)

CLAUDE.md raíz ya define el flujo de referencia para Adicionales (Detección → Registro → Evidencia → Valuación → Aprobación → Ejecución → Facturación → Cobranza) y las métricas objetivo (% cobrado sobre ejecutado, tiempo detección→aprobación) — se usó ese flujo como base, ajustado a la secuencia pedida en esta capacidad. `discovery-drive-echegaray` ya tenía confirmado (no inferido, desde el AS-IS) que Adicionales hoy no tiene ningún registro sistemático — ninguna migración de datos legacy es posible, se parte de cero. Se revisaron PRP-003 (Presupuesto), PRP-004 (Costos Reales) y PRP-005 (Control Económico) como base de datos y patrones ya validados.

## Análisis de arquitectura

### Decisión central: una tabla con columnas fecha+monto por etapa, NO un `estado` enum lineal

Esta es la decisión más importante de la capacidad. Un enum lineal (`estado: 'detectado' | 'cotizado' | 'aprobado' | ...`) solo puede representar **un** estado "actual" por fila — es estructuralmente incapaz de representar que un adicional fue *ejecutado sin haber sido cotizado*, porque forzaría a elegir entre "está en cotizado" o "está en ejecutado", perdiendo el hecho de que la cotización nunca ocurrió. Y detectar exactamente esas secuencias fuera de orden es el requisito central pedido ("¿Qué adicionales ejecutados todavía no fueron cotizados?").

Por eso el modelo usa **una columna `fecha_X` (+ `monto_X` cuando corresponde) nullable por etapa** (`fecha_cotizacion`/`monto_cotizado`, `fecha_aprobacion`/`monto_aprobado`, `fecha_ejecucion`, `fecha_facturacion`/`monto_facturado`, `fecha_cobranza`/`monto_cobrado`). Cada etapa se puede completar independientemente, en cualquier orden — la tabla **no impone** secuencia. Las alertas se calculan comparando qué combinaciones de fechas están presentes o ausentes.

| Decisión | Por qué |
|---|---|
| Una tabla `adicionales`, no varias por etapa | El objeto de seguimiento es el adicional entero — separarlo en `adicionales_cotizaciones`, `adicionales_aprobaciones`, etc. multiplicaría joins sin agregar capacidad real (cada adicional tiene como máximo una cotización, una aprobación, etc. en este alcance). |
| `frenado` como columna explícita (booleano + motivo obligatorio), no derivada | "Frenado" no es derivable de las fechas: un adicional recién detectado no está frenado, solo es temprano. Requiere juicio humano de que el proceso se estancó — se pide explícitamente y se exige motivo (constraint) para evitar marcar sin explicar por qué. |
| Alertas calculadas en TypeScript, no en una vista SQL | A diferencia de PRP-005 (que necesitaba agregar datos de 3 tablas), cada alerta acá es un predicado sobre las columnas de una sola fila — no hay agregación ni join. Una función pura (`calcularAlertasAdicional`) es más simple de leer, más fácil de ajustar sin migración, y evita el riesgo de tener la lógica de alertas duplicada entre SQL y TypeScript. |
| `movimiento_caja_id` opcional + trigger que exige tipo `cobro` | Mismo patrón ya validado en `costos_reales` → `movimientos_caja` (PRP-004), espejado hacia cobro en vez de pago. Documenta el "impacto en caja" del flujo sin duplicar el movimiento. |
| `monto_relevante` = cascada monto_cobrado → facturado → aprobado → cotizado, calculado en TS, no columna | El "monto que hoy representa el adicional" cambia de fuente según qué tan avanzado esté — una columna materializada requeriría mantenerla sincronizada; una función pura sobre la fila ya cargada es más simple y siempre correcta. |

**Descartado explícitamente:**
- Tabla de historial de transiciones (`adicionales_eventos`) para poder derivar "frenado" por tiempo transcurrido — se evaluó y se descartó: agregaría una tabla más y lógica de umbrales de tiempo no validados, cuando un flag explícito con motivo ya responde la pregunta de forma honesta (sin fabricar un umbral de días "razonable" no confirmado con el usuario).
- `aprobado_por` (quién aprobó del lado del cliente) — no estaba en el objetivo funcional pedido explícitamente (solo "¿fue aprobado?"), se omite para no agregar columnas no pedidas.
- Vincular adicionales con `partidas_presupuesto` o `presupuestos` — prohibido explícitamente por la regla de negocio ("no mezclar adicionales con presupuesto base"); esta capacidad no toca esas tablas.
- Soporte de cobros parciales múltiples por adicional (varios `movimientos_caja` por un mismo adicional) — mismo límite aceptado que en PRP-004 para costos reales; documentado como simplificación, no como ausencia de necesidad real.

---

## Modelo de datos

```sql
create table adicionales (
  id uuid primary key default gen_random_uuid(),
  obra_id uuid not null references obras(id) on delete restrict,

  concepto text not null,
  origen text not null,
  detectado_por text not null,
  fecha_deteccion date not null,

  fecha_cotizacion date,
  monto_cotizado numeric(14,2),

  fecha_aprobacion date,
  monto_aprobado numeric(14,2),

  fecha_ejecucion date,

  fecha_facturacion date,
  monto_facturado numeric(14,2),
  referencia_factura text,

  fecha_cobranza date,
  monto_cobrado numeric(14,2),
  movimiento_caja_id uuid references movimientos_caja(id) on delete set null,

  frenado boolean not null default false,
  motivo_frenado text,

  notas text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- monto y fecha de cada etapa viajan juntos (constraint por pareja)
  -- NO hay constraint de orden entre etapas — permitir el desorden es lo que
  -- hace posible detectar "ejecutado sin cotizar".
  constraint adicionales_frenado_motivo_check check (not frenado or motivo_frenado is not null)
);

create unique index adicionales_movimiento_caja_unico
  on adicionales(movimiento_caja_id) where movimiento_caja_id is not null;

-- Trigger: movimiento_caja_id, si se indica, debe ser un movimiento de tipo cobro.
create trigger adicionales_valida_movimiento_cobro before insert or update on adicionales
  for each row execute function adicionales_valida_movimiento_cobro();
```

RLS/GRANT: mismo patrón que todas las tablas anteriores.

---

## Blueprint (fase única) ✅ CERRADA (2026-07-06)

**Objetivo**: `adicionales` aplicada y verificada contra Supabase real; UI en `/obras/[id]` (nueva sección "Adicionales": alta de detección, listado con alertas visibles por adicional, formulario de actualización de etapas por fila).

**Validación**:
- Migración vía MCP (`20260706201926_adicionales_gestion_integral.sql`).
- Caso central probado explícitamente: se insertó un adicional con `fecha_ejecucion` cargada y `fecha_cotizacion` nula — **la base lo permitió**, confirmando que el modelo no bloquea la anomalía que la capacidad necesita poder detectar.
- Constraints probados: monto ≤ 0 rechazado, pareja fecha/monto de cotización rechazada si falta el monto, `frenado = true` sin `motivo_frenado` rechazado, vínculo a un movimiento tipo `pago` rechazado por el trigger, vínculo válido a un movimiento tipo `cobro` aceptado, doble reclamo del mismo `movimiento_caja_id` entre dos adicionales rechazado (índice único parcial). Todos correctos.
- RLS/GRANT verificado con `SET LOCAL ROLE`: `anon` bloqueado, `authenticated` con acceso completo.
- Query end-to-end sobre 2 adicionales de prueba (uno con ciclo completo, uno ejecutado-sin-cotizar) respondió las 14 preguntas del objetivo funcional en una sola consulta.
- `get_advisors(security)`: sin hallazgos nuevos más allá del patrón ya conocido (`USING(true)` permisivo, igual que el resto de las tablas).
- `tsc`/`build`/`lint`/17 tests de Playwright en verde.
- Datos `SMOKE TEST%` eliminados después de verificar.

---

## Gotchas
- [x] La ausencia de constraint de orden entre etapas es **deliberada, no un descuido** — cualquier futura migración que "corrija" esto agregando una regla de secuencia rompería la capacidad central de detectar adicionales fuera de proceso.
- [ ] `frenado` requiere revisión periódica humana — no hay ningún mecanismo automático que lo active o desactive por tiempo transcurrido (deliberado, ver Análisis de arquitectura).
- [ ] Un adicional puede tener como máximo un `movimiento_caja_id` vinculado — no se modelan cobros parciales múltiples por adicional en este alcance (mismo límite aceptado que costos_reales, PRP-004).
- [ ] Sin JWT real, no se pudo probar con Playwright la visibilidad de las alertas ni el formulario de actualización end-to-end (mismo límite de entorno de siempre, ver PRP-001).

## Anti-patrones
- NO agregar una columna `estado` enum lineal que reemplace las columnas fecha/monto por etapa — perdería la capacidad de detectar secuencias fuera de orden.
- NO vincular `adicionales` con `presupuestos`/`partidas_presupuesto`.
- NO asumir aprobación, facturación o cobranza implícitas — cada etapa se registra explícitamente o no existe.
- NO modificar Google Drive ni reemplazar el proceso actual (que hoy no tiene registro sistemático).

---

*Capacidad 6 (Gestión Integral de Adicionales): CERRADA y validada contra Supabase real.*
