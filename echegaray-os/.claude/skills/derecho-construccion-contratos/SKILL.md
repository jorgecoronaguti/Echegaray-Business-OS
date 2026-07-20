---
name: derecho-construccion-contratos
description: "Criterio de derecho de la construcción y gestión contractual para Echegaray Construcciones: redacción y riesgo de contratos, exigibilidad de adicionales, reclamos, garantías y retenciones. Activar ante preguntas sobre aceptar un contrato, evaluar un pliego de cliente, decidir si un adicional es exigible, o responder un reclamo. No reemplaza asesoramiento legal formal — señala el riesgo y cuándo consultar un abogado real."
allowed-tools: Read, Bash, WebSearch, WebFetch
metadata:
  author: echegaray-os
  type: expert-domain
  jurisdiccion-principal: "San Juan, Argentina"
---

# Derecho de la Construcción y Contratos

## Propósito

Aportar el criterio de riesgo contractual y legal que sostiene decisiones comerciales: qué firmar, qué exigir, cómo documentar un adicional para que sea cobrable, y cómo responder un reclamo sin comprometer una posición legal.

## Alcance

Cubre: estructura y riesgo de contratos de obra/mantenimiento, pliegos de cliente (confirmado: proceso real con ARCOR — Pliego de Condiciones Generales, Pliego SSMA, Circular de Licitación privada), exigibilidad de adicionales, garantías, retenciones, reclamos técnicos/contractuales.

No cubre: el tratamiento fiscal del contrato (`impuestos-construccion`), el registro laboral de quienes ejecutan (`derecho-laboral-construccion`), ni la valorización económica de un adicional (`costos-presupuestacion`).

## Preguntas profesionales que debe hacer

- ¿El pliego o contrato de este cliente exige algo que Echegaray no cumple hoy (ej. seguro, registro, garantía)?
- ¿El adicional detectado está documentado con evidencia suficiente para ser exigible (orden de cambio, nota de pedido, correo, foto)?
- ¿Qué cláusula de plazo, penalidad o garantía aplica antes de aceptar un cambio?
- ¿El reclamo del cliente tiene base contractual real, o es una expectativa no pactada?
- ¿Existe un antecedente de Echegaray con este mismo cliente que ya resolvió una situación similar?

## Marcos de análisis

- **Flujo obligatorio de adicionales**: `Detección → Registro → Evidencia → Valuación → Aprobación → Ejecución → Facturación → Cobranza` (ya establecido en CLAUDE.md raíz) — un adicional sin evidencia documentada en el momento de la detección pierde exigibilidad después.
- **Nunca asumir que un adicional detectado es ingreso** (regla explícita ya en CLAUDE.md raíz) — desde el ángulo legal, esto significa que la sola ejecución de un trabajo fuera de contrato no genera automáticamente derecho a cobro si no está documentado.
- **El pliego del cliente prevalece sobre la práctica habitual de Echegaray** cuando es más exigente (confirmado con evidencia real: ARCOR exige Pliego de Seguridad/Salud/Medio Ambiente propio).

## Cableado al OS real — qué LLAMAR en vez de estimar

- **`adicionales_estado` / `registrar_adicional`** — el embudo **detectado → cotizado → aprobado → facturado → cobrado** por obra, con el KPI **% cobrado sobre aprobado** y el monto sin cobrar. Ante cualquier pregunta sobre adicionales ("¿cuánto tenemos sin cobrar?", "¿cómo venimos con los adicionales de [obra]?") **se llama, no se estima**. Al analizar exigibilidad, cruzar el estado registrado con la documentación real: un adicional en estado "detectado" sin aprobación escrita **no es un crédito, es un riesgo**.
- **`salud_obra` / `costos_obras`** — costo real por obra, para valorizar un reclamo o una defensa con números propios y no con estimaciones.
- **Hoy `public.adicionales` está VACÍA**: la capacidad existe, el dato no. Si se pregunta por adicionales, decir que no hay ninguno registrado y ofrecer registrarlos — nunca inventar un monto.
- Documentación contractual del data room: los contratos, órdenes de servicio y notas de pedido viven en Drive (cruzar con `lectura-drive-documentos-multiformato` para leerlos antes de opinar sobre un caso concreto).

## El contrato de obra en el Código Civil y Comercial argentino

La obra privada se rige por el **contrato de obra** del CCyC (locación de obra). Lo que sigue es el marco de referencia — **verificar el articulado y su redacción vigente antes de fundar un reclamo o una defensa**, y no reemplaza al abogado en un caso concreto.

- **Sistemas de determinación del precio** (define quién carga con el riesgo de mayor costo):
  - **Ajuste alzado**: precio global fijo por la obra completa. El riesgo de mayor cantidad o mayor costo es del constructor, salvo pacto de ajuste. En Argentina, sin cláusula de actualización, es el sistema más peligroso para el constructor en obra larga.
  - **Por unidad de medida**: se paga por unidad ejecutada. El riesgo de cantidad es del comitente; el de precio unitario, del constructor.
  - **Coste y costas**: se reconoce el costo real más un beneficio. Traslada el riesgo de costo al comitente; exige trazabilidad documental impecable del costo.
  - Elegir el sistema **es una decisión económica, no formal** — cruzar siempre con `costos-presupuestacion` y `finanzas-tesoreria-construccion`.
- **Variaciones del proyecto**: el constructor **no puede introducir variaciones sin autorización escrita** del comitente; y las que el comitente ordena y alteran significativamente la obra tienen efectos sobre precio y plazo. **Toda variación sin instrucción escrita es un adicional que después no se cobra.**
- **Desistimiento unilateral del comitente**: el comitente puede desistir de la obra por su sola voluntad, pero debe **indemnizar** al constructor (incluida la utilidad esperada, según el alcance que fije la norma). Si un cliente frena una obra, esto es un derecho, no un favor a negociar.
- **Recepción provisoria y definitiva**: la recepción **sin reservas** hace presumir la aceptación de los vicios **aparentes**. Por eso las observaciones se dejan **por escrito en el acta**, en el momento — no después.
- **Vicios ocultos**: se responde por los que no eran detectables en la recepción; hay **plazo de caducidad para denunciarlos** desde que se los descubre. Verificar plazos vigentes.
- **Responsabilidad por ruina total o parcial** (obra destinada a larga duración): alcanza al constructor y demás intervinientes por un plazo **decenal** desde la recepción, por vicios que comprometan la solidez o la hagan impropia para su destino. **Es responsabilidad de orden público: no se puede dispensar por contrato.** Es el riesgo latente más grande de una constructora y la razón de fondo para documentar ensayos y controles (cruzar con `calidad-obra`).
- **Prescripción**: los plazos para reclamar difieren según se trate de responsabilidad contractual, por ruina o por vicios — verificar el aplicable antes de asumir que un reclamo caducó (o que el propio ya no puede iniciarse).

## Obra pública: régimen distinto, no es un contrato privado

- Si el comitente es el Estado, se aplica el **régimen de obra pública** (marco nacional **Ley 13.064** y, en la provincia, la **ley de obras públicas de San Juan** — verificar cuál rige el pliego concreto), no el contrato de obra del CCyC.
- Consecuencias prácticas: prerrogativas de la Administración, régimen propio de **certificación, redeterminación de precios, sanciones, garantías, recepción y plazos de reclamo**. Los reclamos tienen **plazos y formas rituales**: **el silencio o la demora hacen perder el derecho**.
- Regla operativa: en obra pública, **todo reclamo se hace por escrito, en plazo y por la vía del pliego**, aunque la relación cotidiana con el inspector sea buena.

## Adicionales: cómo se vuelven exigibles (y por qué se pierden)

El adicional se cobra por lo que se documentó, no por lo que se trabajó.

- Un trabajo fuera del alcance ordenado **verbalmente** y ejecutado sin respaldo es, en un conflicto, **muy difícil de cobrar**.
- Secuencia que lo hace exigible: **alcance original claro por escrito** → detección del desvío → **notificación al comitente antes de ejecutar** → cotización → **aprobación escrita** (orden de servicio, nota de pedido, mail del representante autorizado) → ejecución → certificación → factura.
- Si hay que ejecutar por urgencia sin aprobación previa: **dejar constancia escrita en el momento** (nota, libro de obra, mail) describiendo el hecho, la orden recibida y quién la dio.
- **El libro de órdenes de servicio y el de notas de pedido son prueba.** Si el contrato los prevé, usarlos; si no, construir el equivalente por escrito.
- Cruzar siempre con `costos-presupuestacion` (valorización) — el OS ya sigue el embudo detectado→cotizado→aprobado→facturado→cobrado.

## Garantías, retenciones y mora

- **Fondo de reparo**: retención sobre cada certificado, liberable a la recepción definitiva; suele ser **sustituible por póliza de caución** (decisión financiera: costo de la póliza vs. dinero inmovilizado).
- **Garantías típicas**: mantenimiento de oferta, cumplimiento de contrato, anticipo, fondo de reparo.
- **Mora del comitente**: para reclamar intereses y eventualmente suspender trabajos hay que **constituir en mora en la forma que fije el contrato** (intimación escrita). Suspender la obra sin intimar previamente expone a la constructora al incumplimiento.
- **Intereses**: verificar la tasa pactada; sin pacto, la que corresponda según la normativa y jurisprudencia aplicable.

## Subcontratación: la responsabilidad no se terceriza

- El constructor **responde frente al comitente** por sus subcontratistas.
- En materia laboral y de seguridad social existe **responsabilidad solidaria** del contratante por el personal del subcontratista (cruzar con `derecho-laboral-construccion` y `seguridad-higiene-art`).
- Control mínimo antes y durante: inscripción, personal declarado, **constancia de pago de cargas sociales y ART con nómina**, seguros vigentes. Guardar la documentación **mes a mes**, no al final.

## Criterios de decisión

| Variable | Pregunta |
|---|---|
| Evidencia | ¿Hay registro escrito/fotográfico del cambio antes de ejecutarlo? |
| Aprobación previa | ¿El cliente aprobó por escrito antes o después de ejecutar? |
| Cláusula aplicable | ¿Qué dice el contrato/pliego sobre cambios de alcance? |
| Riesgo de no reclamar a tiempo | ¿Hay un plazo contractual para notificar el reclamo? |

## Errores frecuentes

- Ejecutar un adicional confiando en la relación con el cliente, sin nota de pedido u orden de cambio firmada.
- Aceptar un pliego de condiciones sin verificar requisitos de seguridad/higiene o societarios que Echegaray no cumple todavía (ver `seguridad-higiene-art`).
- Tratar un reclamo del cliente como conflicto personal en vez de revisar primero qué dice el contrato.

## Información necesaria

- El contrato/pliego real de la obra en cuestión (si existe — confirmado que el uso sistemático de `Contrato de Obra.docx` no está verificado).
- Evidencia documental del adicional o del reclamo (fechas, fotos, notas de pedido).
- Historial de situaciones similares con el mismo cliente (Post Mortem).

## Interacción con otras skills

| Situación | Cruzar con |
|---|---|
| El adicional tiene origen técnico | `ingenieria-civil-construccion` |
| Hay que valorizarlo | `costos-presupuestacion` |
| El pliego exige requisitos de seguridad | `seguridad-higiene-art` |
| Involucra a un subcontratista | `compras-abastecimiento-subcontratacion` |
| Tiene impacto fiscal (facturación, retenciones) | `impuestos-construccion` |

## Sistema de fuentes

1. **Conocimiento profesional estable**: principios generales de derecho de contratos de obra (Código Civil y Comercial, capítulo de obra).
2. **Normativa y regulación cambiante**: jurisprudencia y normativa específica de contratos de construcción — verificar vigencia antes de citar un criterio como norma.
3. **Documentación interna de Echegaray**: pliegos reales confirmados (ARCOR), plantilla de contrato (uso no confirmado).
4. **Datos estructurados del OS**: `adicionales` con fecha de detección/aprobación/facturación (PRP-006).
5. **Experiencia histórica de obras**: Post Mortem, situaciones contractuales documentadas.
6. **Interpretación profesional**: lectura del caso concreto — nunca reemplaza asesoramiento legal formal en un conflicto real.
7. **Recomendación**: acción sugerida, incluyendo cuándo consultar a un abogado real (SECONDI, ya confirmado como estudio externo que lleva compliance de ARCOR).

## Política de fuentes externas y protocolo de vigencia

Para cualquier criterio legal específico (plazos de reclamo, jurisprudencia, cláusulas típicas exigibles), verificar con WebSearch/WebFetch antes de presentarlo como vigente. Registrar: fuente, jurisdicción, fecha de publicación si existe, fecha de consulta, estado de verificación. Ante un conflicto contractual real con impacto económico relevante, la recomendación final debe ser "consultar con el estudio jurídico externo (SECONDI o equivalente)", no una resolución legal definitiva de esta skill.

## Jurisdicción aplicable

Nacional (Código Civil y Comercial de la Nación) para el contrato de obra en general; contractual específica del cliente cuando el pliego lo establece (ej. ARCOR); municipal/provincial si hay requisitos de habilitación local.

## Límites de certeza

Esta skill no reemplaza a un abogado — señala riesgo y evidencia necesaria, no dicta resolución legal definitiva en un litigio real. No puede afirmar que una cláusula es "estándar de la industria" sin verificar el contrato real.

## Gaps de conocimiento conocidos (primera versión)

No se confirmó el uso sistemático de contratos firmados con clientes (`Contrato de Obra.docx` existe como plantilla, sin evidencia de uso real en las carpetas revisadas) — esto es un riesgo real a señalar, no solo un gap de conocimiento: sin contrato firmado, la posición de Echegaray ante un reclamo es más débil.

## Mecanismo de aprendizaje continuo

`OPERACIÓN → EVENTO → RESULTADO → DESVÍO → CAUSA → EVIDENCIA → PATRÓN → PROPUESTA DE APRENDIZAJE → VALIDACIÓN SEGÚN RIESGO → INCORPORACIÓN → APLICACIÓN FUTURA → MEDICIÓN`

Ejemplo: un adicional se ejecuta sin nota de pedido y después el cliente discute el monto (evento/desvío) → Post Mortem documenta la causa (falta de evidencia previa) → si se repite con el mismo cliente o tipo de obra (recurrencia), se propone una regla operativa ("todo adicional requiere nota de pedido firmada antes de ejecutar") → el usuario valida (nivel 2, criterio profesional con riesgo económico) → se incorpora → se mide si bajan las discusiones de monto en adicionales futuros.

## Relación con el OS

- **Áreas**: Comercial (dominio Contratos), Obras (Adicionales).
- **Capacidades existentes**: Adicionales (PRP-006, ciclo detección→cobranza ya modela esta lógica de negocio).
- **Centro de Acción**: consumidora de alertas de adicionales sin cotizar/sin evidencia.
- **Dashboard**: consumidora de la sección Adicionales.
- **Post Mortem**: fuente de aprendizaje sobre qué cláusulas o evidencias faltaron.
- **Memoria del proyecto**: reglas contractuales validadas deberían documentarse ahí.
- **Futuros agentes/automatización**: ninguna decisión contractual se automatiza — siempre clase E (aprobación humana), especialmente ante riesgo de litigio.

## Prohibido

No inventar cláusulas contractuales, plazos legales o jurisprudencia sin verificación. No sustituir el criterio de un abogado real en un conflicto de riesgo económico relevante.
