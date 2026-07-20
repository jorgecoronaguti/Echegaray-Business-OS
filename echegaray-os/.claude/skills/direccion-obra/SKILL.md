---
name: direccion-obra
description: "Criterio de dirección y gestión de obra (coordinación de frentes, relación con el cliente en sitio, resolución de problemas del día a día) para Echegaray Construcciones. Activar ante preguntas sobre cómo organizar la ejecución, gestionar un conflicto de obra, o coordinar entre jefe de obra, cuadrillas y cliente. Distinta de planificacion-produccion: esta skill es coordinación y liderazgo, no cronograma ni rendimientos."
allowed-tools: Read, Bash
metadata:
  author: echegaray-os
  type: expert-domain
  jurisdiccion-principal: "San Juan, Argentina"
---

# Dirección y Gestión de Obra

## Propósito

Aportar el criterio de gestión operativa del día a día de una obra: cómo organizar frentes de trabajo, sostener el ritmo de ejecución, gestionar la relación con el cliente en sitio y resolver problemas antes de que se conviertan en desvíos económicos.

## Alcance

Cubre: organización de frentes/cuadrillas, ritual de seguimiento semanal (ya existe como "Daily Meeting" real en Echegaray), comunicación con el cliente en obra, escalamiento de problemas de ejecución, relación jefe de obra ↔ dirección.

## El jefe de obra es un responsable ECONÓMICO, no solo técnico

El cambio de mentalidad que más margen protege en una PyME constructora: quien conduce la obra decide plata todos los días, aunque nadie se lo haya dicho.

- Cada decisión de campo tiene consecuencia económica: mandar una cuadrilla a un frente no liberado, aceptar un trabajo "chiquito" que no estaba en el alcance, resolver con más material del previsto, cubrir una demora con horas extras.
- Por eso el jefe de obra necesita saber **cuánto tiene presupuestado** su obra por partida — no solo qué hay que construir. Una obra donde el responsable no conoce el presupuesto **no se puede controlar**, solo se puede auditar cuando terminó.
- Su tarea económica diaria: **detectar el desvío temprano y avisar**. Un sobrecosto avisado a tiempo es gestionable; el mismo sobrecosto descubierto en el cierre es una pérdida consumada.

## Lo que se documenta el mismo día (o se pierde)

Lo que en el momento parece burocracia es, semanas después, la diferencia entre cobrar y discutir:

- **Trabajo fuera de alcance ordenado en obra** → nota/mail al representante del cliente **antes de ejecutarlo**, o constancia escrita el mismo día si hubo que hacerlo por urgencia. Sin eso, el adicional no se cobra (ver `derecho-construccion-contratos`).
- **Frente no liberado, demora del cliente, interferencia de otro contratista** → asentarlo por escrito el día que ocurre, con fecha. Es la prueba de una ampliación de plazo o de un reclamo de mayores costos.
- **Parte diario**: personal presente, tareas, frentes, clima, equipos, novedades. Es la fuente primaria de HH reales y la base de cualquier reclamo.
- **Libro de órdenes de servicio / notas de pedido** cuando el contrato los prevé: son prueba formal.
- **Observaciones de calidad** en el momento (`calidad-obra`) y **condiciones inseguras** (`seguridad-higiene-art`).

Regla: **lo que no está escrito el mismo día, en un conflicto no existe.**

## Coordinación de subcontratistas en obra

- El sub responde ante Echegaray, pero **frente al cliente y frente a la ley responde Echegaray** (solidaridad laboral y de seguridad social — ver `derecho-laboral-construccion`).
- Control de ingreso a obra: personal declarado en la nómina, ART vigente **con esa nómina**, inducción y EPP. El control es **mes a mes**, no una vez al inicio.
- Definir por escrito el **límite de alcance** con cada sub (quién pone andamios, quién retira escombros, quién provee agua/energía): el 80% de los conflictos con subcontratistas sale de ahí.
- Un sub que trabaja mal o inseguro es un problema de Echegaray ante el cliente, no del sub.

## Reunión de obra que sirve para decidir

Siguiendo la estructura de reuniones del CLAUDE.md raíz, aplicada a obra: **avance real vs. plan** → **desvíos** (costo, plazo, HH) → **restricciones que hay que destrabar y quién las destraba** → **acuerdos con responsable y fecha** → la próxima reunión **empieza revisando los acuerdos anteriores**. Una reunión de obra que solo informa lo que pasó no justifica el tiempo de la gente que está parada.

No cubre: el cronograma técnico, los rendimientos, la economía de obra (ETC/EAC/margen forecast) ni el ciclo comercial avance→certificación→facturación→cobranza (todo eso vive en `planificacion-produccion`), la valorización de un cambio (`costos-presupuestacion`), ni la validez contractual de un reclamo (`derecho-construccion-contratos`). Si la tarea es leer/auditar/editar un Sheet real de obra, activar `google-sheets-business-systems` (obligatorio).

## Preguntas profesionales que debe hacer

- ¿Está claro quién es responsable de cada frente de trabajo hoy?
- ¿El problema reportado es de ejecución (se resuelve en obra) o requiere escalar a Dirección/Comercial/Legal?
- ¿Qué información le falta al jefe de obra para decidir sin consultar cada vez?
- ¿La cadencia de seguimiento actual (Daily Meeting semanal, confirmado real) es suficiente para esta obra o necesita mayor frecuencia?
- ¿El cliente está viendo lo mismo que ve Echegaray sobre el avance, o hay una brecha de expectativa?

## Marcos de análisis

- **Visibilidad + Responsabilidad + Reglas + Alertas, no dependencia de una persona** (principio ya establecido en el CLAUDE.md raíz, sección Microgestión) — aplicado a la obra: cada frente debe tener un responsable claro y un criterio de cuándo escalar, no depender de que el jefe de obra "se acuerde de avisar".
- **Actividad vs. progreso** (regla de oro #17 del CLAUDE.md raíz): una obra con mucha actividad reportada no es necesariamente una obra que avanza — cruzar siempre contra el dato de avance físico real, no contra la percepción de movimiento.

## Criterios de decisión

| Variable | Pregunta |
|---|---|
| Responsable | ¿Quién tiene la responsabilidad de resolver esto hoy? |
| Urgencia | ¿Frena la obra si no se resuelve hoy? |
| Alcance de la decisión | ¿La puede tomar el jefe de obra o requiere Dirección? |
| Impacto en el cliente | ¿El cliente necesita ser informado antes de que lo note? |

## Errores frecuentes

- Escalar a Dirección problemas que el jefe de obra podría resolver con una regla clara ya definida — esto es exactamente el "cuello de botella del dueño" que el CLAUDE.md raíz pide evitar.
- No escalar un problema que sí necesita a Dirección hasta que ya generó un desvío económico o de plazo.
- Confundir "la obra está tranquila" con "la obra está bien" — falta de reportes no es lo mismo que ausencia de problemas.

## Información necesaria

- Estado de avance físico real (hoy vive informalmente, ver `Flujos_Obras_Corregido.xlsx` — no migrado al OS).
- Registro de HH y productividad reciente (`registros_hh`, ya existe en el OS, PRP-008).
- Alertas activas de la obra en el Centro de Acción/Dashboard.

## Interacción con otras skills

| Situación | Cruzar con |
|---|---|
| El problema tiene causa técnica | `ingenieria-civil-construccion` |
| Afecta el cronograma | `planificacion-produccion` |
| Involucra a un subcontratista | `compras-abastecimiento-subcontratacion` |
| Hay un conflicto con el cliente | `derecho-construccion-contratos` |
| Involucra un riesgo de seguridad | `seguridad-higiene-art` |
| El problema es de economía de obra (margen, ETC/EAC) o del ciclo comercial | `planificacion-produccion` |
| Hay que verificar coherencia entre lo que reporta la obra y Caja/P&L | `arquitectura-integracion-finanzas-obras` |

## Sistema de fuentes

1. **Conocimiento profesional estable**: principios de gestión de obra y coordinación de equipos.
2. **Normativa y regulación cambiante**: no aplica directamente a esta skill (ver `derecho-laboral-construccion` y `seguridad-higiene-art` para lo regulatorio).
3. **Documentación interna de Echegaray**: Daily Meeting (ritual semanal real, confirmado en discovery), Vision/Tracción.
4. **Datos estructurados del OS**: alertas de `actividad_obra`, HH, adicionales.
5. **Experiencia histórica de obras**: Post Mortem.
6. **Interpretación profesional**: lectura de la situación concreta.
7. **Recomendación**: acción sugerida.

## Política de fuentes externas y protocolo de vigencia

Esta skill depende poco de fuentes externas (es criterio de gestión, no normativa). No requiere protocolo de vigencia salvo que la recomendación toque un aspecto legal/laboral — en ese caso, remitir a la skill correspondiente en vez de responder desde acá.

## Jurisdicción aplicable

No aplica jurisdicción normativa directa — es criterio operativo interno.

## Límites de certeza

No puede afirmar el estado real de avance de una obra si el dato no está registrado en el OS o reportado explícitamente — no inventar "probablemente esté bien encaminada" sin dato.

## Gaps de conocimiento conocidos (primera versión)

**Corregido 2026-07-09**: existe un Sheet real `Avances de Obra` (Rodrigo, un Gantt por obra) — ver `planificacion-produccion` y `arquitectura-integracion-finanzas-obras` para el detalle. No está migrado al OS ni conciliado contra el estado narrativo que registra el P&L (`08_Control_Obra/Cliente`). Hasta que se decida esa integración (Bloque O1 de la revisión estratégica), esta skill debe seguir apoyándose en lo que el usuario reporte directamente para decisiones del día a día, marcándolo como dato no verificado por el OS.

## Mecanismo de aprendizaje continuo

`OPERACIÓN → EVENTO → RESULTADO → DESVÍO → CAUSA → EVIDENCIA → PATRÓN → PROPUESTA DE APRENDIZAJE → VALIDACIÓN SEGÚN RIESGO → INCORPORACIÓN → APLICACIÓN FUTURA → MEDICIÓN`

Ejemplo: una obra reporta que el jefe de obra escaló repetidamente el mismo tipo de decisión a Dirección (evento recurrente) → se identifica que falta una regla clara para ese tipo de decisión (causa) → se propone una regla operativa (ej. "compras menores a $X las autoriza el jefe de obra sin consultar") → el usuario valida (nivel 1, bajo riesgo, aprobación simple) → se incorpora como criterio en esta skill → se mide si bajó la frecuencia de escalamiento en la próxima obra.

Un escalamiento aislado es **A**; el mismo tipo de escalamiento en 2+ obras es **B/C**; solo con aprobación explícita del usuario pasa a **D/E**.

## Relación con el OS

- **Áreas**: Obras y Producción.
- **Capacidades existentes**: Adicionales, HH y Productividad, Control Económico — todo lo que el jefe de obra usa día a día.
- **Centro de Acción**: consumidora — las acciones "pendiente" de una obra son justamente lo que esta skill ayuda a triage.
- **Dashboard**: consumidora de las alertas de `actividad_obra`.
- **Post Mortem**: fuente de aprendizaje sobre qué falló en la coordinación de una obra.
- **Memoria del proyecto**: las reglas operativas validadas (nivel D/E) deberían quedar documentadas ahí.
- **Futuros agentes/automatización**: ninguna decisión de escalamiento se automatiza — la clasificación de urgencia puede ser clase B (analítica) pero la decisión de escalar o no siempre queda en una persona.

## Prohibido

No inventar el estado de una obra sin dato real. No asumir que "sin reportes" significa "sin problemas".
