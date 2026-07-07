---
name: costos-presupuestacion
description: "Criterio técnico-económico de cómputo, presupuestación y análisis de costos de obra para Echegaray Construcciones. Activar ante preguntas sobre cotizar una obra, valorizar un adicional, analizar desvío de costo, o decidir margen mínimo aceptable. Aporta el criterio de insumo para presupuestar — no reemplaza ni duplica la lógica ya construida en features/presupuestos y control-economico del OS."
allowed-tools: Read, Bash, WebSearch
metadata:
  author: echegaray-os
  type: expert-domain
  jurisdiccion-principal: "San Juan, Argentina"
---

# Costos, Cómputos y Presupuestación

## Propósito

Aportar el criterio profesional para computar y presupuestar correctamente una obra o un adicional, y para explicar por qué un costo real se desvía del presupuestado — la capacidad #2 del CLAUDE.md raíz ("presupuestar correctamente").

## Alcance

Cubre: cómputo métrico económico, análisis de precio unitario (materiales + mano de obra + indirectos), margen esperado, análisis de desvío de costo.

No cubre: la viabilidad técnica de la solución que se está costeando (`ingenieria-civil-construccion`), el rendimiento en tiempo (`planificacion-produccion`, aunque comparte el dato de HH), ni el tratamiento contable/fiscal del costo (`contabilidad-constructoras`, `impuestos-construccion`).

## Preguntas profesionales que debe hacer

- ¿El precio unitario usado viene de un dato real de Echegaray (Planilla para Cotizar) o es una estimación sin respaldo?
- ¿Qué variables explican la mayor parte del error histórico de cotización — no agregar más detalle sin saberlo primero (regla explícita del CLAUDE.md raíz)?
- ¿El costo indirecto está bien distribuido, o se está subestimando la estructura (Administración/Taller) que de verdad sostiene la obra?
- ¿El margen esperado es el margen mínimo aceptable de la empresa, o se está cotizando por necesidad de facturar?
- ¿Qué probabilidad real de adicionales tiene esta obra, y está contemplada en el margen?

## Marcos de análisis

- **Ciclo obligatorio**: `Presupuesto → Ejecución → Real → Desvío → Aprendizaje → Nueva base de presupuesto` (ya establecido en CLAUDE.md raíz, sección Cotización) — nunca cerrar un análisis de costo sin conectar el desvío de vuelta a la próxima cotización.
- **Buscar las variables que explican la mayor parte del error**, no agregar detalle indiscriminado — regla explícita ya en el CLAUDE.md raíz.
- **Costo directo ≠ costo indirecto ≠ margen**: mantenerlos siempre separados, nunca mezclar overhead de estructura con costo directo de obra al analizar un desvío.

## Criterios de decisión

| Variable | Pregunta |
|---|---|
| Fuente del precio | ¿Viene de Planilla para Cotizar o costos reales recientes? |
| Margen mínimo | ¿Está por encima del mínimo aceptable definido por la empresa? |
| Riesgo de adicionales | ¿Se contempló la probabilidad histórica de este tipo de obra/cliente? |
| Comparabilidad | ¿Esta obra es comparable a las que dieron el dato histórico usado? |

## Errores frecuentes

- Cotizar bajo para ganar la obra (advertencia explícita ya en CLAUDE.md raíz, "Jugar a no perder").
- Confundir un costo real parcial (obra en curso) con el costo real final al comparar contra presupuesto.
- Recalcular márgenes sin actualizar el costo indirecto de estructura (Administración/Taller — confirmado como categorías reales en Drive) al ritmo real de la empresa.

## Información necesaria

- `obra_resumen_economico` (margen esperado/real, PRP-005).
- Planilla para Cotizar (fuente de verdad de precios unitarios y mano de obra, confirmado en discovery).
- Gastos de Estructura (Administración/Taller) del P&L consolidado (`Ingresos y Egresos - P&L`, confirmado, aún no migrado al OS).

## Interacción con otras skills

| Situación | Cruzar con |
|---|---|
| Se está costeando una solución técnica nueva | `ingenieria-civil-construccion` |
| El desvío es de HH/rendimiento | `planificacion-produccion` |
| Hay que decidir si algo es adicional cotizable | `derecho-construccion-contratos` |
| El costo tiene impacto fiscal (IVA, retenciones) | `impuestos-construccion` |
| Se necesita entender el impacto en caja del presupuesto | `finanzas-tesoreria-construccion` |

## Sistema de fuentes

1. **Conocimiento profesional estable**: métodos de cómputo y análisis de precio unitario.
2. **Normativa y regulación cambiante**: índices de costos de la construcción (ej. INDEC, Cámara Argentina de la Construcción) si se usan para actualizar precios — verificar vigencia antes de citar un valor puntual.
3. **Documentación interna de Echegaray**: Planilla para Cotizar (fuente de verdad confirmada).
4. **Datos estructurados del OS**: `presupuestos`, `costos_reales`, `obra_resumen_economico`.
5. **Experiencia histórica de obras**: Post Mortem, desvíos de costo documentados.
6. **Interpretación profesional**: lectura del caso concreto.
7. **Recomendación**: acción sugerida.

## Política de fuentes externas y protocolo de vigencia

Si se necesita un índice de costos de la construcción o un precio de mercado actual para validar un presupuesto, verificar con WebSearch la fecha de publicación del índice y registrar: fuente, autoridad emisora, fecha de publicación, fecha de consulta. Nunca usar un precio de memoria del modelo como si fuera el precio de mercado actual.

## Jurisdicción aplicable

Los precios y costos son de mercado local (San Juan/Cuyo) — un índice nacional puede no reflejar el costo real regional; señalarlo si se usa un índice nacional como proxy.

## Límites de certeza

No puede afirmar un precio unitario de mercado sin verificación si no viene de Planilla para Cotizar o de un dato reciente de Echegaray. No puede afirmar que un desvío de costo "es normal para este tipo de obra" sin comparar contra datos reales.

## Gaps de conocimiento conocidos (primera versión)

No hay todavía una vista consolidada del costo de Estructura de empresa (Administración/Taller) integrada al OS para distribuirlo entre obras — vive en `Ingresos y Egresos - P&L` (Sheet), confirmado, pendiente de integración (Bloque F4 de la revisión estratégica).

## Mecanismo de aprendizaje continuo

`OPERACIÓN → EVENTO → RESULTADO → DESVÍO → CAUSA → EVIDENCIA → PATRÓN → PROPUESTA DE APRENDIZAJE → VALIDACIÓN SEGÚN RIESGO → INCORPORACIÓN → APLICACIÓN FUTURA → MEDICIÓN`

Ejemplo: una partida se presupuesta sistemáticamente baja en obras con un tipo de cliente (evento/desvío recurrente) → Post Mortem documenta la causa (`cambios_sugeridos_cotizacion`) → con 2+ casos comparables (recurrencia/patrón probable) se propone ajustar el precio unitario base de esa partida → el usuario valida (nivel 1, dato empírico) → se incorpora a esta skill y a la próxima cotización → se mide si el desvío se redujo.

## Relación con el OS

- **Áreas**: Comercial/Presupuestación (dominio Presupuestación), Obras (Control Económico).
- **Capacidades existentes**: Presupuesto Base (PRP-003), Control Económico (PRP-005), Costos Reales (PRP-004).
- **Centro de Acción**: consumidora de alertas de margen crítico/en atención.
- **Dashboard**: consumidora directa de la sección Control Económico.
- **Post Mortem**: fuente principal de aprendizaje (`cambios_sugeridos_cotizacion`).
- **Memoria del proyecto**: patrones de desvío validados deberían documentarse ahí.
- **Futuros agentes/automatización**: predicción de sobrecostos (clase B/C) es candidata futura explícita del CLAUDE.md raíz (sección IA) — solo tras responder las 8 preguntas de IA.

## Prohibido

No inventar precios unitarios, índices de costos ni rendimientos técnicos que no vengan de Planilla para Cotizar, datos reales del OS, o una fuente externa verificada y fechada.
