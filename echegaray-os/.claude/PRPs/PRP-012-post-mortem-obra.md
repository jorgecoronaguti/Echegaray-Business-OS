# PRP-012: Post Mortem de Obra

> **Estado**: CERRADA
> **Fecha**: 2026-07-07
> **Proyecto**: Echegaray Business OS

---

## Objetivo

Construir el cierre inteligente de una obra: convertir cada obra terminada en aprendizaje reutilizable (qué margen esperábamos vs. qué obtuvimos, dónde estuvo la diferencia, qué cambiar en la próxima cotización), sin duplicar ningún cálculo ya existente y sin fabricar historia para obras legacy con datos parciales.

## Revisión previa (sin discovery general)

Se revisaron las 11 capacidades anteriores (PRP-001 a PRP-011), en particular el Dashboard de Dirección (PRP-011), que ya estableció el principio de "cero SQL nuevo, reutilizar lo que cada capacidad ya calcula". El Post Mortem aplica el mismo principio a nivel de una sola obra.

## Análisis de arquitectura

**Pregunta central**: ¿tabla propia de cierre, snapshot de métricas, campos manuales, vista derivada, o combinación?

**Decisión: combinación, con una única tabla nueva (`post_mortems`) reducida a lo genuinamente no derivable.**

| Necesidad | Resuelto con |
|---|---|
| Resumen económico final (margen esperado/real, desvío de costo) | `obra_resumen_economico` (PRP-005), leído en vivo — sin cambios. |
| Resumen financiero final (certificado/facturado/cobrado) | `obra_ejecucion_financiera` (PRP-007), leído en vivo. |
| Resumen de HH (desvío) | `obra_hh_resumen` (PRP-008), leído en vivo. |
| Resumen de adicionales (cobrados/no cobrados) | `adicionales` (PRP-006), agregado en TypeScript. |
| Resumen de compras | `compras` + `compra_resumen` (PRP-009), leído en vivo. |
| Alertas históricas relevantes | Las mismas funciones `calcularAlertasX` de cada capacidad (PRP-006 a PRP-010), contadas para esta obra — **no existe un log persistido de alertas** en ninguna capacidad, así que esto refleja el estado más reciente conocido, no un historial completo de la ejecución (limitación documentada, no oculta). |
| Causas de desvío, aprendizajes, acciones recomendadas, cambios sugeridos para la próxima cotización, estado del cierre | **Nuevo — tabla `post_mortems`.** Es juicio humano que ninguna vista puede derivar. |

**La pregunta del snapshot** (¿guardar una copia congelada de las métricas, o siempre leerlas en vivo?): se decidió una combinación explícita:
- Mientras el post mortem está en **`borrador`**: los resúmenes se calculan en vivo con `construirResumenSnapshot()`, reutilizando exactamente los mismos datos que ya carga la ficha de obra — permite revisar el estado actual antes de decidir cerrar.
- Al **`cerrar`**: se congela ese mismo objeto (una sola vez, en la columna `resumen_snapshot jsonb`) para que el aprendizaje quede estable aunque después se corrija un `costo_real` u otro dato de una obra que la empresa ya considera terminada. Se usó `jsonb` (no columnas separadas) porque es un dato de solo lectura histórica — nadie va a filtrar obras por SQL sobre estos campos en esta capacidad; eso sería trabajo de una futura capacidad de analítica cruzada entre post mortems.

**Regla de negocio agregada** (no pedida explícitamente en el modelo de datos, pero necesaria para que el cierre tenga sentido): solo se puede cerrar el Post Mortem de una obra cuya `obras.estado = 'cerrada'` — validado en el server action, no en la base (evita acoplar `post_mortems` a la lógica de `obras` con un trigger cruzado innecesario para esta escala).

**Descartado explícitamente:**
- Snapshot siempre activo (aún en borrador) — mostraría un congelado falso antes de que exista una decisión real de cierre.
- Columnas numéricas separadas para cada métrica del snapshot — innecesario, `jsonb` alcanza para un dato de solo lectura.
- Un log de eventos de alertas — no existe hoy en ninguna capacidad; construirlo sería una capacidad nueva en sí misma (fuera de alcance).
- Clasificación automática confirmado/inferido/desconocido por campo — cada vista ya devuelve `null` cuando falta el dato (patrón consistente desde PRP-003); el Post Mortem solo etiqueta esos `null` como "Dato insuficiente" en la UI, sin inventar una taxonomía de certeza que ninguna fuente sostiene.

---

## Modelo de datos

```sql
create table post_mortems (
  id uuid primary key default gen_random_uuid(),
  obra_id uuid not null references obras(id) on delete restrict,
  estado text not null default 'borrador' check (estado in ('borrador', 'cerrado')),
  causas_desvio text,
  aprendizajes text,
  acciones_recomendadas text,
  cambios_sugeridos_cotizacion text,
  resumen_snapshot jsonb,
  fecha_cierre date,
  notas text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (obra_id),
  constraint post_mortems_cierre_check check (
    estado = 'borrador' or (estado = 'cerrado' and fecha_cierre is not null and resumen_snapshot is not null)
  )
);
```

RLS/GRANT: mismo patrón que todas las tablas anteriores.

---

## Blueprint (fase única) ✅ CERRADA (2026-07-07)

**Objetivo**: `post_mortems` aplicada y verificada contra Supabase real; UI en `/obras/[id]` (nueva sección "Post Mortem": iniciar borrador, resumen en vivo o congelado, formulario de causas/aprendizajes/acciones/cambios, botón de cierre que valida `obra.estado = 'cerrada'`).

**Validación**:
- Migración vía MCP (`20260707125016_post_mortem_obra.sql`).
- Alta de borrador correcta.
- Segundo post mortem para la misma obra rechazado por `unique(obra_id)`.
- Intento de `estado = 'cerrado'` sin `fecha_cierre` ni `resumen_snapshot` rechazado por el `CHECK`.
- Cierre con `fecha_cierre` y `resumen_snapshot` provisto sí se aceptó correctamente.
- RLS/GRANT verificado con `SET LOCAL ROLE`.
- `get_advisors(security)` sin hallazgos nuevos.
- `tsc`/`build`/`lint`/24 tests de Playwright en verde.
- Datos `SMOKE TEST%` eliminados después de verificar.

---

## Gotchas
- [ ] "Alertas históricas relevantes" no es un historial real — no existe ningún log de alertas persistido en el proyecto. `cantidadAlertasAlCierre` es un recuento del estado más reciente conocido al momento de construir el snapshot, no de lo que ocurrió durante toda la ejecución. Si se necesita un historial real, sería una capacidad nueva (registrar cada alerta con su fecha de aparición/resolución).
- [ ] El cierre exige `obras.estado = 'cerrada'` — validado en el server action (`cerrarPostMortemAction`), no con un trigger de base. Si en el futuro se necesita esta regla en más lugares, considerar moverla a un trigger compartido.
- [ ] Los campos de juicio humano (`causas_desvio`, etc.) se pueden seguir editando después de cerrado — no se bloquea la edición posterior; solo `estado`/`fecha_cierre`/`resumen_snapshot` quedan protegidos por el `CHECK`.
- [ ] Sin JWT real, no se pudo probar con Playwright el flujo completo de iniciar/guardar/cerrar end-to-end (mismo límite de entorno de siempre, ver PRP-001).

## Anti-patrones
- NO recalcular en SQL algo que ya se calcula en TypeScript en su capacidad de origen.
- NO inventar un historial de alertas que no existe.
- NO fabricar una clasificación confirmado/inferido/desconocido que ninguna fuente sostiene — usar "Dato insuficiente" cuando el valor subyacente ya es `null`.
- NO construir Dashboard global, reportes PDF, IA ni migración de históricos en esta capacidad.

---

*Capacidad 12 (Post Mortem de Obra): CERRADA y validada contra Supabase real.*
