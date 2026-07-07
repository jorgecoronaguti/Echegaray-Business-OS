---
name: planificacion-produccion
description: "Planificación técnica de obra: cronograma, secuencia constructiva, ruta crítica y rendimientos de producción para Echegaray Construcciones. Activar ante preguntas sobre plazos, secuencia de tareas, impacto de un cambio en el cronograma, o análisis de rendimiento real vs. estimado. Trabaja junto a costos-presupuestacion (rendimientos alimentan ambos) y direccion-obra (coordinación operativa)."
allowed-tools: Read, Bash
metadata:
  author: echegaray-os
  type: expert-domain
  jurisdiccion-principal: "San Juan, Argentina"
---

# Planificación y Producción

## Propósito

Aportar el criterio técnico para programar una obra en el tiempo, secuenciar tareas correctamente, y analizar rendimientos reales de producción — la base técnica de "¿cuándo se termina esto y por qué a este ritmo?".

## Alcance

Cubre: secuencia constructiva, dependencias entre tareas, ruta crítica, rendimientos de cuadrilla por tarea/unidad ejecutada, impacto de un cambio en el plazo.

No cubre: la valorización económica del rendimiento (`costos-presupuestacion`, aunque comparten el dato de rendimiento), ni la coordinación diaria de personas (`direccion-obra`).

## Preguntas profesionales que debe hacer

- ¿Qué tareas son dependencia dura de otras (no pueden empezar antes) y cuáles son solo preferencia de orden?
- ¿Cuál es la ruta crítica de esta obra hoy, y qué tarea la está definiendo?
- ¿El rendimiento real de la cuadrilla en esta tarea es comparable al de obras anteriores, o hay una diferencia que explicar?
- ¿Un cambio de secuencia o de solución técnica mueve la fecha de fin, o hay holgura suficiente para absorberlo?
- ¿La falta de un material o de una definición de cliente está bloqueando la ruta crítica?

## Marcos de análisis

- **HH por tarea y por unidad ejecutada, no solo HH totales** (principio ya establecido en CLAUDE.md raíz, sección Horas Hombre) — la pregunta correcta es "¿qué producción obtuvimos por cada hora pagada?", no solo "¿trabajaron las horas previstas?".
- **Diferenciar retraso por causa propia (mala planificación, mala secuencia) de retraso por causa externa** (falta de material por proveedor, definición pendiente del cliente) — cruza con `compras-abastecimiento-subcontratacion` y `derecho-construccion-contratos` respectivamente.

## Criterios de decisión

| Variable | Pregunta |
|---|---|
| Dependencia | ¿Esta tarea puede empezar sin que otra termine? |
| Holgura | ¿Cuánto se puede correr esta tarea sin mover la fecha final? |
| Rendimiento | ¿Coincide con lo esperado, y si no, por qué? |
| Causa del desvío | ¿Es de planificación, de recursos, de materiales o externa? |

## Errores frecuentes

- Recalcular el cronograma sin identificar primero la ruta crítica real — se termina optimizando una tarea que no define el plazo final.
- Comparar rendimiento entre obras sin controlar por diferencias reales (tipo de tarea, condiciones de sitio, cuadrilla) — puede llevar a conclusiones falsas sobre productividad.
- Tratar cualquier demora como "falta de gente" sin verificar si la causa fue espera de materiales o de una definición.

## Información necesaria

- `registros_hh` y `hh_estimada` por obra (ya existe, PRP-008).
- Grado de avance físico (hoy informal, `Flujos_Obras_Corregido.xlsx`, no migrado al OS — gap conocido).
- Fechas reales de compras/entregas (`compras`, PRP-009) para identificar bloqueos externos.

## Interacción con otras skills

| Situación | Cruzar con |
|---|---|
| El rendimiento afecta el costo | `costos-presupuestacion` |
| Hay que decidir cómo coordinar el cambio en obra | `direccion-obra` |
| El retraso es por un proveedor/subcontratista | `compras-abastecimiento-subcontratacion` |
| El cambio de secuencia puede ser un adicional | `derecho-construccion-contratos` |

## Sistema de fuentes

1. **Conocimiento profesional estable**: principios de programación de obra (dependencias, ruta crítica).
2. **Normativa y regulación cambiante**: no aplica directamente.
3. **Documentación interna de Echegaray**: JORNALES (estructura confirmada, PRP-008), Planilla para Cotizar (HH estimadas).
4. **Datos estructurados del OS**: `registros_hh`, `obra_hh_resumen`, `compras`.
5. **Experiencia histórica de obras**: Post Mortem, desvíos de HH documentados.
6. **Interpretación profesional**: lectura del caso concreto.
7. **Recomendación**: acción sugerida.

## Política de fuentes externas y protocolo de vigencia

Esta skill no depende de normativa externa cambiante — su conocimiento es técnico-estable. No requiere protocolo de vigencia salvo si se cita una norma de programación específica (ej. un estándar de gestión de proyectos), en cuyo caso verificar edición vigente antes de citarla como referencia formal.

## Jurisdicción aplicable

No aplica jurisdicción normativa — es criterio técnico interno.

## Límites de certeza

No puede afirmar un rendimiento "normal para este tipo de tarea" sin comparar contra datos reales de Echegaray (JORNALES/registros_hh) — no inventar un rendimiento de referencia genérico de la industria sin marcarlo como estimación no verificada.

## Gaps de conocimiento conocidos (primera versión)

No existe hoy un dato de avance físico estructurado en el OS (confirmado que existe informalmente fuera de él). No existe tampoco un registro de rendimiento por tarea específica (JORNALES no tiene columna de tarea confiable, confirmado en discovery PRP-008) — el rendimiento hoy solo puede analizarse a nivel de HH totales por obra, no por tarea. Protocolo: cuando se decida sistematizar el dato de tarea (fuera de esta skill, es un cambio de captura de datos), esta skill gana granularidad.

## Mecanismo de aprendizaje continuo

`OPERACIÓN → EVENTO → RESULTADO → DESVÍO → CAUSA → EVIDENCIA → PATRÓN → PROPUESTA DE APRENDIZAJE → VALIDACIÓN SEGÚN RIESGO → INCORPORACIÓN → APLICACIÓN FUTURA → MEDICIÓN`

Ejemplo: una obra reporta HH muy por encima de lo estimado en una tarea (evento/desvío) → Post Mortem documenta que la causa fue una secuencia mal definida (causa/evidencia) → si se repite en otra obra con la misma tarea (recurrencia), se propone ajustar el criterio de secuenciación para esa tarea (propuesta de aprendizaje) → el usuario valida (nivel 1, dato empírico interno) → se incorpora como criterio de esta skill → se aplica en la próxima cotización/planificación → se mide si el desvío de HH bajó.

## Relación con el OS

- **Áreas**: Obras y Producción.
- **Capacidades existentes**: HH y Productividad (PRP-008), Post Mortem (PRP-012).
- **Centro de Acción**: consumidora de alertas de HH (`desvio_significativo`, `concentracion_anormal`, ya calculadas en PRP-008/dashboard).
- **Dashboard**: consumidora directa de la sección HH.
- **Post Mortem**: fuente principal de aprendizaje.
- **Memoria del proyecto**: patrones de rendimiento validados deberían documentarse ahí.
- **Futuros agentes/automatización**: un futuro modelo predictivo de plazo (clase B, analítica) podría apoyarse en esta skill, pero solo tras volumen suficiente de obras cerradas y respondidas las 8 preguntas de IA del CLAUDE.md raíz.

## Prohibido

No inventar un rendimiento de referencia de "la industria" sin dato real de Echegaray o fuente verificada y explícitamente marcada como externa.
