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
