---
name: pr0-linea-base-echegaray
description: Estado y decisiones resueltas de PR0/PR0-A (carga de línea base al 01/07/2026) — respuestas de Jorge al checklist de extracción, qué queda abierto, y la advertencia explícita de que estos hallazgos describen la operación actual, no una especificación a preservar.
metadata:
  type: project
---

Fecha de las respuestas: 2026-07-07. PR0-A (inventario y extracción, sin cargar Supabase todavía) sigue en curso — esto es el estado de las respuestas de Jorge al checklist, no un cierre de la fase.

## Resueltas

- **Cobranzas categoría "N" en Flujo de Caja**: N = Negro, sin respaldo ni factura. **No se cargan como cobranza formal en F1** — deben quedar excluidas del cálculo de cobranzas ciertas, consistente con la regla del CLAUDE.md raíz de no institucionalizar circuito informal.
- **"Messinas"**: es **cliente**, no obra.
- **"IMOTOR" / "Javi Sánchez"**: es el **mismo cliente** (aparece con ambos nombres según la fuente).
- **Deuda "Banco" ($2.550.633)**: es **deuda financiera** (no proveedor comercial).
- **Deuda "ARCA" ($1.982.466)**: es **deuda impositiva** (no proveedor comercial).
- **SGR / carpeta "RIG SGR"**: es una gestión **en curso** con RIG para obtener una garantía de préstamos futuros — **no es deuda vigente al 01/07/2026**. No cargar como obligación en la línea base.
- **Sueldos $3.000.000 triplicado en Flujo de Caja proyectado (julio 26)**: confirmado **error** de esa planilla, no son 3 pagos reales. La fuente real de sueldos es una planilla dedicada (ver [[fuentes-drive-pr0-linea-base]]) — con la advertencia explícita de Jorge de que **`Flujo de Fondos - Cash flow` también usa datos de sueldos y no está conectado/sincronizado con esa planilla** — riesgo real de inconsistencia entre dos sistemas, sin investigar todavía.
- **Fuente de verdad de posición de caja**: `Flujo de Caja - Cash Flow`, no `CONTROL DE GASTOS.xlsx`.

## Sin resolver

- **Cuál `EJERCICIO 8.xlsx` es el vigente** (hay dos, IDs y fechas de modificación distintas — uno en la raíz, otro archivado en "AÑO 2025"): pregunta repetida dos veces, todavía sin responder.
- **Fechas reales de inicio/fin de La Estrella y ARCOR**: Jorge señaló la pestaña `CF_COB` (gid=1294821039) pero no pude confirmar haber leído esa pestaña específica y no esa por defecto — sigue pendiente de verificación real.
- **Monto exacto y vencimiento de sueldos de junio/julio 2026**: la planilla real de sueldos que inspeccioné solo mostró datos hasta abril 2026 — falta el período relevante para el corte del 01/07/2026.
- **Vencimientos exactos (no solo devengado mensual) de IIBB / cargas sociales / gastos generales de julio**: señaladas las mismas dos fuentes de arriba, sin confirmar lectura de la pestaña correcta.
- **Adicionales pendientes reales**: Jorge confirmó que sí existen y señaló dos fuentes posibles, pero no pude leer ninguna con el detalle de fila necesario.
- **Diseño de O1 (avance de obra)**: la fuente que Jorge indicó como "control de avances de obra" (ver [[fuentes-drive-pr0-linea-base]]) muestra, en lo leído hasta ahora, un checklist de tareas/materiales — no el modelo %-planificado/%-real asumido en el diseño previo de O1. No confirmado si es la pestaña equivocada o si así es el proceso real. Esto puede requerir ajustar la entidad `avance_fisico_semanal` hacia un modelo de estado discreto por tarea antes de construir O1.

## Advertencia explícita del usuario — no confundir descripción con prescripción

Jorge fue explícito: **"todas estas responden a la actualidad, no significan que quiero conservar que se hagan las cosas de esta manera."** Estas respuestas sirven para calibrar la extracción de línea base y el diseño de O1/F1 contra la realidad operativa actual — no son una aprobación de que el OS deba replicar el proceso informal existente (ej. el circuito de cobros "N", o un control de avance basado en checklist en vez de %). Cualquier diseño futuro debe seguir evaluándose contra el objetivo estratégico del CLAUDE.md raíz, no contra "cómo se hace hoy".

## Por qué recordar esto

Jorge lo marcó explícitamente: **"vas a tener que mejorarlo"** — espera que esta línea base y el proceso subyacente se sigan refinando, no que se traten como definitivos. Antes de retomar PR0-A, releer este archivo y [[fuentes-drive-pr0-linea-base]] en vez de re-preguntar lo ya resuelto.
