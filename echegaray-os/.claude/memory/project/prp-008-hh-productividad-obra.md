---
name: prp-008-hh-productividad-obra
description: Capacidad 8 — registros_hh semanales (texto libre, sin legajo/cuadrilla/tarea), hh_estimada agregado a presupuestos, vista obra_hh_resumen; HH y costo de mano de obra deliberadamente separados
metadata:
  type: project
---

# PRP-008 — HH y Productividad de Obra

Fecha: 2026-07-07

## Estado

**Capacidad 8 (HH y Productividad de Obra): CERRADA y validada contra Supabase real.** Ver `.claude/PRPs/PRP-008-hh-productividad-obra.md` para el análisis de arquitectura completo.

## Qué se descubrió en las fuentes reales (verificación puntual, no discovery general)

**JORNALES**: granularidad **semanal** (no diaria); trabajador identificado por **nombre libre**, no legajo (mismo gap ya conocido vs. ALTAS-BAJAS); obra identificada por **texto libre, una sola por trabajador por semana** (incluso "VACACIONES" aparece como si fuera una obra); **sin columna de cuadrilla, frente ni especialidad**; la columna "Tarea del día" no tiene texto de tarea real confiable.

**Planilla para Cotizar**: HH estimadas por tarea sí existen (hoja "DESCRIPCION DE TAREAS"), pero con **layout ad-hoc que cambia dentro de la misma hoja** — no parseable de forma confiable. Confirmadas 4 categorías reales y reutilizables del convenio UOCRA (Oficial Especializado, Oficial, Medio Oficial, Ayudante), presentes en 3 hojas distintas.

## Qué se construyó

`hh_estimada` se agregó a `presupuestos` (PRP-003) — no una tabla nueva, es una dimensión más del mismo presupuesto aprobado. Tabla nueva `registros_hh` (obra, trabajador_o_cuadrilla texto libre, categoria opcional, fecha_inicio_semana, horas, vínculo opcional a costos_reales, fuente_legacy). Vista `obra_hh_resumen` (mismo patrón que [[prp-005-control-economico-basico-obra]]: `security_invoker=true`) agregando HH estimada vs HH real acumulada.

## Relación con Costos Reales — decisión explícita de NO fabricar

Existe una tarifa real ($/hora) en JORNALES y en las hojas de costo CCT, pero **no se usa para calcular costo automáticamente**: el costo de mano de obra ya se puede registrar en [[prp-004-costos-reales-obra]] (concepto "Sueldos Obra") sin depender de HH. Se ofrece solo un vínculo opcional (`costo_real_id`, sin trigger de validación) para reconciliación manual futura. Productividad física (HH) y costo económico quedan deliberadamente separados.

## Verificación

Constraints probados (duplicado obra+trabajador+semana, horas≤0, categoría inválida, hh_estimada negativa). Ciclo completo con datos reales (500 HH estimadas, 127 HH reales en 2 semanas) dio exactamente desvio_absoluto=-373, desvio_porcentual=-74.60%. RLS/GRANT en tabla y vista verificado. `tsc`/`build`/`lint`/19 tests de Playwright en verde.

**Alertas implementadas**: sin estimación, desvío significativo (umbral abierto 15%), concentración anormal en una semana (umbral abierto 1.5x el promedio), obra activa sin registro reciente (umbral abierto 14 días), información insuficiente (<3 semanas registradas).

**No implementado, explícitamente**: "tendencia de HH incompatible con el avance físico" — no existe todavía un dato de avance % en el OS para sostenerlo sin fabricar.

## Próxima capacidad sugerida

Con Presupuesto, Costos Reales, Control Económico, Adicionales, Ejecución Financiera y ahora HH, el núcleo de gestión de una obra individual está muy completo. Candidatos: **Compras** (tercera pata de costo real, mencionada en el roadmap) o **Post Mortem** (ya hay suficiente historial estructurado por obra para el primer cierre "cotizar → ejecutar → aprender"). Ambas fueron explícitamente pospuestas por el usuario en esta ronda — confirmar próxima prioridad.
