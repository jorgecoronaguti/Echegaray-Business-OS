---
name: planificacion-produccion
description: "Planificación técnica y control económico-productivo de obra: cronograma, secuencia constructiva, ruta crítica, rendimientos, restricciones, ETC/EAC/margen forecast y el ciclo comercial completo de la obra (avance→certificación→facturación→cobranza). Activar ante preguntas sobre plazos, avance físico vs. económico, rendimiento real vs. estimado, o al auditar/editar el Sheet real de avance/control de obra (junto con google-sheets-business-systems, obligatorio). Trabaja junto a costos-presupuestacion (rendimientos alimentan ambos) y direccion-obra (coordinación operativa)."
allowed-tools: Read, Bash, WebSearch
metadata:
  author: echegaray-os
  type: expert-domain
  jurisdiccion-principal: "San Juan, Argentina"
---

# Planificación y Producción

## Propósito

Aportar el criterio técnico para programar una obra en el tiempo, secuenciar tareas correctamente, y analizar rendimientos reales de producción — la base técnica de "¿cuándo se termina esto y por qué a este ritmo?".

## Las tres curvas: avance físico ≠ certificación ≠ costo

El error de lectura más común en una constructora PyME es mirar una sola curva y creer que describe la obra. Son tres y casi nunca coinciden:

- **Avance FÍSICO**: lo realmente ejecutado en obra.
- **CERTIFICACIÓN**: lo que el cliente reconoció (y por lo tanto lo que se puede facturar y cobrar).
- **COSTO INCURRIDO**: lo que la empresa ya gastó, esté certificado o no.

Lecturas que hay que saber hacer:

- **Físico > certificado** → hay trabajo hecho que el cliente todavía no reconoció: es **obra en curso** (activo) y, sobre todo, **caja que no entra**. Si la brecha crece, preguntar por qué no certifica: suele anticipar un conflicto, una observación de calidad o una demora deliberada de pago.
- **Certificado > físico** → se certificó por adelantado: es un **pasivo**, no una ganancia. Genera la ilusión de una obra sana que después se da vuelta.
- **Costo > físico** → la obra está consumiendo más recursos que producción: **desvío de productividad o de precio**, y hay que atacarlo *durante*, no en el cierre.
- Regla: **una desviación detectada al cierre es historia; detectada durante la ejecución es una herramienta de gestión** (CLAUDE.md raíz). El seguimiento tiene que ser lo bastante frecuente como para poder corregir.

## Restricciones reales que rompen el plan en San Juan

Un cronograma que no las contempla es una lista de deseos:

- **Provisión de hormigón elaborado**: disponibilidad de planta, distancia de traslado y ventana de colocación. Una losa depende de que el camión llegue en tiempo.
- **Clima**: viento **Zonda** y días de alta evaporación condicionan hormigonado, curado y trabajo en altura; lluvia condiciona excavaciones y movimiento de suelos (cruzar con `ingenieria-civil-construccion` y `seguridad-higiene-art`).
- **Materiales importados o de plaza escasa** (perfilería, chapa, aberturas, equipamiento): plazos de entrega largos y volátiles. Estos ítems deben tener **fecha de pedido en el cronograma**, no solo fecha de montaje. El acopio es decisión conjunta con `finanzas-tesoreria-construccion` (protege precio, consume caja).
- **Disponibilidad de mano de obra especializada** y su curva de aprendizaje.
- **Permisos, habilitaciones e inducciones del cliente**: en planta industrial (caso ARCOR) el permiso de trabajo y la inducción de SSMA son parte del camino crítico real, no trámites.
- **Frente liberado por el cliente**: la causa de improductividad más frecuente y la más reclamable — si el cliente no libera el frente, **documentarlo por escrito el mismo día** (sostiene un reclamo de mayores costos o ampliación de plazo; ver `derecho-construccion-contratos`).

## Plazo contractual, ampliaciones y multas

- El plazo es una obligación contractual con **consecuencia económica** (multa por mora). Un atraso no gestionado se convierte en una quita del margen.
- Cuando la causa del atraso **no es imputable a la empresa** (frente no liberado, lluvia extraordinaria, cambios del comitente, demora en aprobar un adicional), corresponde **pedir ampliación de plazo por escrito y en el momento** — no al final. El silencio equivale a aceptar el atraso como propio.
- La ampliación de plazo y el reconocimiento de **mayores costos** son cosas distintas: pedir una no implica la otra. Definir cuál corresponde con `derecho-construccion-contratos`.

## Alcance

Cubre, con nivel de especialista:

- **Planificación**: estructura de obra, partidas, actividades, hitos, dependencias, cronograma, camino crítico, lookahead, planificación semanal, restricciones, compromisos semanales, PPC (Percent Plan Complete) cuando sea útil.
- **Avance**: avance planificado, avance real, avance físico, ponderaciones, criterios de medición, evidencia, hitos, actividades cerradas/en curso, atraso/adelanto.
- **HH**: estimadas vs. reales por tarea/persona/cuadrilla/obra/fecha/categoría, costo, productividad.
- **Productividad**: rendimiento esperado vs. real, unidad producida, HH por unidad, consumo de recursos, tendencia, aprendizaje histórico, anomalías, deterioro.
- **Restricciones**: materiales, planos, decisiones de cliente, subcontratos, equipos, herramientas, permisos, personal, clima, seguridad.
- **Economía de obra**: presupuesto, costo presupuestado/real/comprometido/pendiente, ETC (estimate to complete), EAC (estimate at completion), margen esperado, margen forecast, desviación, contingencia, adicionales.
- **Ciclo comercial de la obra**: contrato → avance → medición → certificación → aprobación → facturación → cuenta por cobrar → cobranza → retenciones → adicionales.

Secuencia constructiva, dependencias, ruta crítica y rendimientos de cuadrilla siguen siendo el núcleo técnico — lo de arriba conecta ese núcleo con el resultado económico real de cada obra, que es lo que Dirección necesita para decidir.

No cubre: la valorización económica del precio unitario (`costos-presupuestacion`, aunque comparten el dato de rendimiento), la coordinación diaria de personas (`direccion-obra`), ni la arquitectura/fórmulas del Sheet donde vive este dato (`google-sheets-business-systems`, obligatorio siempre que la tarea sea leer/auditar/editar el Sheet real de avance/control de obra). La coherencia de este dato contra Caja y P&L es responsabilidad de `arquitectura-integracion-finanzas-obras`.

## Fórmulas de referencia (EAC/ETC)

- `EAC = AC + ETC` (costo real incurrido + lo que falta gastar para terminar).
- `EAC = BAC / CPI` (presupuesto total ÷ índice de desempeño de costo) — usar cuando la tendencia de desvío observada hasta hoy se espera que continúe igual hasta el cierre.
- `ETC = EAC − AC`.
- Nunca aplicar estas fórmulas con un `AC` (costo real) incompleto — ver "Principio de control" abajo antes de calcular cualquier EAC.

## Preguntas profesionales que debe hacer

- ¿La obra está atrasada? ¿Cuánto, y qué actividad concreta lo explica?
- ¿Las HH consumidas son coherentes con el avance físico reportado, o algo no cuadra?
- ¿Qué cuadrilla tiene desvíos de rendimiento y desde cuándo?
- ¿Qué restricción está bloqueando la producción hoy (material, plano, decisión, equipo)?
- ¿Qué compra crítica está atrasada y puede parar la obra?
- ¿Cuánto falta gastar para terminar (ETC)? ¿Cuánto costará terminar en total (EAC)?
- ¿Cuál es el margen forecast hoy, no el margen presupuestado original?
- ¿Qué adicional está ejecutado pero no formalizado (sin cotizar/aprobar)?
- ¿Qué trabajo ya ejecutado todavía no se certificó? ¿Qué certificado no se facturó? ¿Qué factura no se cobró?
- ¿Qué debería decidir Operaciones esta semana, y qué debería decidir Dirección?
- ¿Qué tareas son dependencia dura de otras (no pueden empezar antes) y cuáles son solo preferencia de orden?
- ¿Cuál es la ruta crítica de esta obra hoy, y qué tarea la está definiendo?
- ¿El rendimiento real de la cuadrilla en esta tarea es comparable al de obras anteriores, o hay una diferencia que explicar?
- ¿Un cambio de secuencia o de solución técnica mueve la fecha de fin, o hay holgura suficiente para absorberlo?
- ¿La falta de un material o de una definición de cliente está bloqueando la ruta crítica?

## Principio de control (calidad del dato antes que la conclusión)

No aceptar un cruce del tipo "avance 60% / costo 30%" como conclusión suficiente de que hay productividad extraordinaria. Antes de concluir eso, investigar:

- si la medición de avance físico es confiable o es una estimación optimista sin evidencia;
- si todos los costos del período ya están cargados (compras registradas pero no facturadas, subcontratos no imputados);
- si existen compromisos no registrados (órdenes de compra emitidas sin recepción);
- si las HH están completas (cuadrillas con parte de horas cargado informalmente, fuera de sistema);
- si existen materiales comprados pero no consumidos todavía (inventario en obra, no gasto real);
- si existen anticipos que inflan el avance económico sin avance físico real;
- si existen costos compartidos entre obras mal distribuidos;
- si existen gastos sin obra asignada que en realidad pertenecen a esta obra;
- si el presupuesto base contra el que se compara es confiable o ya quedó desactualizado por adicionales no incorporados.

Razonar sobre la calidad del dato **antes** de reportar un margen o rendimiento como extraordinario — un dato incompleto que "muestra" ahorro no es ahorro, es información faltante.

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
| El certificado/facturación no coincide con el avance económico | `contabilidad-constructoras` |
| La certificación pendiente de cobro afecta el forecast de caja | `finanzas-tesoreria-construccion` |
| Se va a leer, auditar o editar el Sheet real de avance/control de obra | `google-sheets-business-systems` (obligatorio, siempre) |
| Hay que verificar que el margen forecast no se calcule distinto en Caja, P&L o el OS | `arquitectura-integracion-finanzas-obras` (obligatorio ante cualquier cambio de fórmula que cruce sistemas) |

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

**Corregido 2026-07-09**: sí existe un dato de avance físico estructurado, fuera del OS — el Sheet real `Avances de Obra` (propiedad de Rodrigo, una pestaña Gantt por obra con % de avance diario por actividad). No está migrado ni conectado al OS todavía; tampoco está conciliado contra las pestañas `08_Control_Obra/Cliente [obra]` del P&L, que registran un estado narrativo distinto de la misma obra (ver `arquitectura-integracion-finanzas-obras` para el detalle de esta duplicación pendiente de resolver).

No existe tampoco un registro de rendimiento por tarea específica (JORNALES no tiene columna de tarea confiable, confirmado en discovery PRP-008) — el rendimiento hoy solo puede analizarse a nivel de HH totales por obra, no por tarea. Protocolo: cuando se decida sistematizar el dato de tarea (fuera de esta skill, es un cambio de captura de datos), esta skill gana granularidad.

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
