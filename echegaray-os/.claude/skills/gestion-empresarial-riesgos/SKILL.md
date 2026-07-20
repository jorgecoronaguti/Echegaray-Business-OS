---
name: gestion-empresarial-riesgos
description: "Marco de gestión de riesgo empresarial integral para Echegaray Construcciones: riesgo de cliente, de obra, de concentración, financiero y operativo. Activar ante decisiones Go/No-Go de una obra, evaluación de riesgo de un cliente nuevo, o análisis de exposición general de la empresa. Es el marco que integra el resto de las skills cuando la decisión es sobre la empresa como conjunto, no sobre una obra puntual."
allowed-tools: Read, Bash
metadata:
  author: echegaray-os
  type: expert-domain
  jurisdiccion-principal: "San Juan, Argentina"
---

# Gestión Empresarial y Riesgos

## Propósito

Aportar el marco de análisis de riesgo a nivel de empresa completa — más allá de una obra puntual: riesgo de concentración de clientes, riesgo financiero agregado, riesgo operativo por capacidad instalada, y el criterio final de decisiones Go/No-Go.

## Alcance

Cubre: riesgo de concentración (pocos clientes grandes, ej. dependencia de ARCOR/Saint Gobain confirmada como relación comercial recurrente), riesgo financiero agregado (capital de trabajo comprometido en varias obras simultáneas), riesgo operativo (capacidad real vs. comprometida), marco de decisión Go/No-Go.

## Cableado al OS real — el riesgo se mide con datos, no con sensación

- **`cotizacion_vs_real`** — el desvío histórico entre lo cotizado y el costo real es el mejor predictor del riesgo de la próxima obra similar. Sin ese número, cualquier Go/No-Go es intuición.
- **`obra_costo_real`** (vista, fuente única) + **`salud_obra`** — exposición por obra.
- **`obligaciones_estado`** y **`briefing_caja`** — capacidad financiera real para sostener una obra más.
- **`cobranzas`** — concentración por cliente y DSO: dónde está la tensión de cobro.
- **`legajos_estado`** y **`no_conformidades_estado`** — riesgo laboral/ART y riesgo de calidad, que también son riesgo empresarial.

## Go/No-Go: las preguntas que hay que poder contestar con número

Una obra se rechaza por razones concretas, no por corazonada. Antes de aceptar:

1. **¿Cuál es el peak funding de esta obra** (máxima caja negativa acumulada antes de darse vuelta) **y lo aguantamos junto con las obras en curso?** Éste es el número que más veces debería frenar una obra y casi nunca se calcula (ver `finanzas-tesoreria-construccion`).
2. **¿Qué margen esperado tiene, y cuánto se desvió históricamente en obras parecidas?** Un margen del 20% con desvío histórico del 15% no es un margen del 20%.
3. **¿Cómo paga este cliente realmente** (no lo que dice el contrato)? DSO real, historial de mora.
4. **¿Tenemos la capacidad operativa** —gente, equipos, conducción— **sin desatender las obras en curso?** Tomar una obra que degrada dos existentes destruye más valor del que crea.
5. **¿Qué pasa si se atrasa 2 meses?** Multa, costo de estructura, obra que no se puede tomar por estar ocupados.
6. **¿Qué exige el cliente que hoy no tenemos?** (pliego de SSMA, certificaciones, garantías, seguros): tiene costo y plazo.
7. **¿Cuál es el costo de oportunidad?** Aceptar esta obra es rechazar la que venga en tres meses.

**Criterio de rechazo explícito**: si el peak funding supera la capacidad financiera, o si el cliente tiene historial de no pagar, se rechaza aunque el margen se vea bien. Facturar no es ganar.

## Los riesgos que matan a una PyME constructora argentina

- **Concentración de cliente**: cuando un cliente es la mayoría de la cobranza, no es un cliente — es el dueño de tu caja. *Caso real de Echegaray: ARCOR concentra buena parte de la cobranza.* Mitigación: diversificar antes de necesitarlo, y no financiarlo más de lo que se puede perder.
- **Crecer más rápido que la caja**: el modo más común de quebrar con rentabilidad. Más obras = más capital de trabajo inmovilizado; el resultado llega meses después que el desembolso.
- **Inflación sin cláusula de ajuste**: en obra larga a precio fijo, el margen se lo come la inflación aunque la ejecución sea perfecta.
- **Dependencia del dueño**: si las decisiones operativas pasan todas por una persona, la capacidad de la empresa tiene un techo y un riesgo de continuidad (es el cuello de botella que el CLAUDE.md raíz marca explícitamente).
- **Riesgo laboral y de seguridad**: un accidente con documentación incompleta puede costar más que el margen de la obra (ver `seguridad-higiene-art`: hoy 18 de 20 activos sin constancia de EPP).
- **Responsabilidad decenal por ruina**: riesgo latente durante 10 años después de entregar, no dispensable por contrato.

No cubre: el riesgo técnico de una solución puntual (`ingenieria-civil-construccion`), el riesgo contractual de un contrato puntual (`derecho-construccion-contratos`) — esta skill agrega esos riesgos a nivel de empresa, no los reemplaza a nivel de obra.

## Preguntas profesionales que debe hacer

- ¿Qué porcentaje de la facturación/backlog depende de un solo cliente, y qué pasa si ese cliente reduce su actividad?
- ¿La empresa tiene capital de trabajo suficiente para sostener todas las obras en curso simultáneamente, o una obra grande nueva pone en riesgo a las demás?
- ¿La capacidad operativa real (personal, equipos) alcanza para la obra que se está evaluando, o se está sobrecomprometiendo?
- ¿Esta obra, aunque rentable en el papel, distrae capacidad de obras más importantes ya en curso? (principio de Dispersión del CLAUDE.md raíz)
- ¿Cuál es el costo de oportunidad de aceptar esta obra frente a lo que ya se está haciendo?

## Marcos de análisis

- **Marco para nuevas oportunidades del CLAUDE.md raíz** (Impacto, Velocidad, Esfuerzo, Capital, Probabilidad, Ventaja, Composición, Distracción) — esta skill lo aplica a nivel de decisión Go/No-Go de una obra o cliente nuevo.
- **Jugar a ganar vs. jugar a no perder** (CLAUDE.md raíz) — el marco central para evaluar si una obra se acepta por criterio estratégico o por necesidad de facturar.
- **Riesgo de concentración**: evidencia real de que ARCOR y Saint Gobain son clientes recurrentes con procesos de cotización dedicados — esto es una fortaleza comercial pero también una dependencia a vigilar explícitamente.

## Criterios de decisión

| Variable | Pregunta |
|---|---|
| Concentración de cliente | ¿Qué % del negocio depende de este cliente? |
| Capital de trabajo agregado | ¿Alcanza para todas las obras simultáneas? |
| Capacidad operativa | ¿Hay gente y equipo real disponible? |
| Costo de oportunidad | ¿Qué se deja de hacer si se acepta esto? |

## Errores frecuentes

- Evaluar una obra nueva de forma aislada sin considerar el compromiso de capital de trabajo y capacidad ya asumido por las obras en curso.
- Aceptar una obra grande de un cliente ya dominante sin registrar que aumenta la concentración de riesgo.
- Confundir "es rentable" con "es la mejor decisión para la empresa ahora" — falta el análisis de costo de oportunidad y dispersión.

## Información necesaria

- Backlog contratado y pipeline ponderado (métricas ya nombradas en el CLAUDE.md raíz, sección Datos y Métricas — no construidas aún en el OS).
- Capital de trabajo agregado de todas las obras en curso (Bloque F2 de la revisión estratégica, pendiente).
- Capacidad operativa real (personal disponible por categoría, equipos) — no sistematizada hoy en el OS.

## Interacción con otras skills

| Situación | Cruzar con |
|---|---|
| El riesgo es de un cliente/contrato puntual | `derecho-construccion-contratos` |
| El riesgo es financiero | `finanzas-tesoreria-construccion` |
| El riesgo es de capacidad de ejecución | `planificacion-produccion`, `direccion-obra` |
| El riesgo es de personal/seguridad | `derecho-laboral-construccion`, `seguridad-higiene-art` |

## Sistema de fuentes

1. **Conocimiento profesional estable**: principios generales de gestión de riesgo empresarial.
2. **Normativa y regulación cambiante**: no aplica directamente a esta skill.
3. **Documentación interna de Echegaray**: Vision/Tracción (visión estratégica confirmada real), historial de clientes.
4. **Datos estructurados del OS**: `obras`, `obra_resumen_economico`, `obligacion_resumen` — vista agregada todavía no consolidada (gap).
5. **Experiencia histórica de obras**: Post Mortem.
6. **Interpretación profesional**: lectura del caso concreto.
7. **Recomendación**: acción sugerida — la decisión final Go/No-Go siempre queda en el dueño, esta skill informa, no decide.

## Política de fuentes externas y protocolo de vigencia

Esta skill no depende de fuentes externas cambiantes de forma directa — se apoya en datos internos de Echegaray y en el marco estratégico ya definido en el CLAUDE.md raíz.

## Jurisdicción aplicable

No aplica jurisdicción normativa — es criterio de gestión interno.

## Límites de certeza

No puede afirmar el nivel de concentración de cliente o la capacidad operativa real sin datos reales — no estimar sin dato disponible, decir explícitamente qué falta.

## Gaps de conocimiento conocidos (primera versión)

No existe hoy en el OS ninguna vista de backlog contratado consolidado, pipeline ponderado, ni capacidad operativa agregada — todas nombradas como métricas prioritarias en el CLAUDE.md raíz pero no construidas. Esta skill debe operar con lo que el usuario aporte directamente hasta que existan.

## Mecanismo de aprendizaje continuo

`OPERACIÓN → EVENTO → RESULTADO → DESVÍO → CAUSA → EVIDENCIA → PATRÓN → PROPUESTA DE APRENDIZAJE → VALIDACIÓN SEGÚN RIESGO → INCORPORACIÓN → APLICACIÓN FUTURA → MEDICIÓN`

Ejemplo: una obra aceptada por necesidad de facturar termina con margen bajo o problemas de capacidad (evento/desvío) → Post Mortem documenta la causa → si se repite el patrón ("obra aceptada bajo presión de caja termina mal", recurrencia), se propone un criterio explícito de margen mínimo/capital de trabajo antes de aceptar bajo presión → el usuario valida (nivel 2/3 según el monto en juego) → se incorpora como regla de Go/No-Go → se mide en la próxima decisión comparable.

## Historial de aprendizaje (append-only, más reciente arriba)

- **2026-07-09** — Primera medición real de concentración de proveedor (gap ya anotado abajo: "no existe vista de concentración de cliente/proveedor"): Alumetal representa el 56,5% de toda la deuda a proveedores de Echegaray ($20.837.210 de $36.870.194,9, según Flujo de Caja). Clasificación: **A. observación aislada** (una sola lectura, un solo punto en el tiempo) — falta ver si esta concentración es estructural o coyuntural antes de proponerla como regla de diversificación de proveedores. Acción real creada en Centro de Acción.

## Relación con el OS

- **Áreas**: Dirección y Estrategia (dominio Selección de obras, reasignado desde el mapeo original de Fase II tras la revisión estratégica aprobada).
- **Capacidades existentes**: Control Económico (PRP-005), Dashboard (PRP-011) como insumo agregado, aunque hoy filtrado por obra individual, no por riesgo de empresa.
- **Centro de Acción**: consumidora de alertas críticas cruzadas de todas las áreas — es quien más se beneficiaría de una vista de riesgo agregado futura.
- **Dashboard**: consumidora, con la limitación ya señalada de que hoy no agrega concentración de cliente ni capacidad operativa.
- **Post Mortem**: fuente de aprendizaje sobre decisiones Go/No-Go pasadas.
- **Memoria del proyecto**: reglas de riesgo validadas deberían documentarse ahí.
- **Futuros agentes/automatización**: ninguna decisión Go/No-Go se automatiza — siempre clase E, es la decisión estratégica de mayor peso del negocio.

## Prohibido

No inventar nivel de concentración de cliente, capacidad operativa o capital de trabajo disponible sin datos reales aportados por el usuario o por el OS.
