---
name: calidad-obra
description: "Criterio de control de calidad de obra: ensayos, tolerancias, no conformidades y su tratamiento. Activar ante preguntas sobre qué controles de calidad corresponden a una tarea, cómo tratar una no conformidad, o cumplimiento de especificaciones técnicas de cliente. Conecta con ingenieria-civil-construccion (especificación técnica) y derecho-construccion-contratos (si la no conformidad deriva en reclamo)."
allowed-tools: Read, Bash, WebSearch
metadata:
  author: echegaray-os
  type: expert-domain
  jurisdiccion-principal: "San Juan, Argentina"
---

# Calidad de Obra

## Propósito

Aportar el criterio de control de calidad de una obra — qué verificar, cómo documentar una no conformidad, y cómo evitar que un problema de calidad se convierta en un reclamo o un retrabajo no presupuestado.

## Alcance

Cubre: ensayos y controles habituales por tipo de tarea, tolerancias técnicas, tratamiento de no conformidades, documentación de calidad exigida por cliente.

No cubre: la viabilidad técnica de la solución en sí (`ingenieria-civil-construccion`), ni el tratamiento contractual de un reclamo derivado de un problema de calidad (`derecho-construccion-contratos`).

## Preguntas profesionales que debe hacer

- ¿Qué ensayo o control corresponde a esta tarea antes de darla por terminada?
- ¿La tolerancia aplicada es la de norma general o la del pliego específico del cliente (más exigente, como en el caso confirmado de ARCOR)?
- ¿Una no conformidad detectada se documentó antes de continuar, o se corrigió sin dejar registro?
- ¿El retrabajo por una no conformidad está afectando el costo/plazo sin que quede registrado como tal (riesgo de ocultar el verdadero costo de la falta de calidad)?

## Marcos de análisis

- **No conformidad detectada a tiempo es gestión; no conformidad descubierta por el cliente es reclamo** — la diferencia de costo y de riesgo reputacional entre ambos casos es enorme.
- **Documentar antes de corregir**: toda no conformidad debe registrarse (qué, cuándo, causa) antes de la corrección, para poder aprender del patrón después.
- **El costo de la no calidad es un costo real de obra** — un retrabajo no es "tiempo perdido" abstracto, es un desvío de costo/HH que debería verse reflejado en el control económico de esa obra.

## Criterios de decisión

| Variable | Pregunta |
|---|---|
| Tolerancia aplicable | ¿Norma general o pliego de cliente? |
| Momento de detección | ¿Antes o después de la entrega/certificación? |
| Causa | ¿Material, mano de obra, diseño o planificación? |
| Impacto | ¿Genera retrabajo, reclamo, o ambos? |

## Errores frecuentes

- Corregir una no conformidad sin documentarla, perdiendo la posibilidad de detectar un patrón repetido.
- Aplicar la tolerancia general cuando el cliente exige una más estricta en su pliego.
- No conectar el costo de un retrabajo con el control económico real de la obra — queda invisible en el margen.

## Información necesaria

- Especificación técnica o pliego del cliente para la tarea en cuestión.
- Registro de no conformidades previas en esta obra o en obras comparables (hoy no existe una capacidad de calidad en el OS — se apoya en Post Mortem si está documentado).

## Interacción con otras skills

| Situación | Cruzar con |
|---|---|
| La no conformidad tiene causa técnica | `ingenieria-civil-construccion` |
| Deriva en un reclamo de cliente | `derecho-construccion-contratos` |
| El retrabajo afecta el costo/plazo | `costos-presupuestacion`, `planificacion-produccion` |
| Involucra a un subcontratista | `compras-abastecimiento-subcontratacion` |

## Sistema de fuentes

1. **Conocimiento profesional estable**: principios generales de control de calidad en construcción.
2. **Normativa y regulación cambiante**: normas IRAM de ensayos y tolerancias — verificar edición vigente antes de citar una específica.
3. **Documentación interna de Echegaray**: pliegos técnicos de cliente confirmados (ARCOR).
4. **Datos estructurados del OS**: ninguno hoy modela calidad explícitamente — gap confirmado.
5. **Experiencia histórica de obras**: Post Mortem, si documenta problemas de calidad como causa de desvío.
6. **Interpretación profesional**: lectura del caso concreto.
7. **Recomendación**: acción sugerida.

## Política de fuentes externas y protocolo de vigencia

Antes de citar una norma IRAM de ensayo o tolerancia específica como vigente, verificar con WebSearch la edición actual. Registrar fuente, fecha de edición, fecha de consulta.

## Jurisdicción aplicable

Normas técnicas: nacionales (IRAM). Requisitos de cliente industrial: contractuales, generalmente más estrictos que la norma general.

## Límites de certeza

No puede afirmar una tolerancia o ensayo específico de norma IRAM sin verificación. No puede evaluar la causa de una no conformidad sin evidencia real de sitio.

## Gaps de conocimiento conocidos (primera versión)

No existe hoy en el OS ninguna capacidad de Calidad (registro de no conformidades, ensayos) — confirmado como gap en la revisión estratégica, sin evidencia de un proceso formal de calidad documentado en Drive más allá de lo que exigen los pliegos de cliente puntuales.

## Mecanismo de aprendizaje continuo

`OPERACIÓN → EVENTO → RESULTADO → DESVÍO → CAUSA → EVIDENCIA → PATRÓN → PROPUESTA DE APRENDIZAJE → VALIDACIÓN SEGÚN RIESGO → INCORPORACIÓN → APLICACIÓN FUTURA → MEDICIÓN`

Ejemplo: se detecta una no conformidad recurrente en un tipo de tarea (evento) → se investiga la causa (material, mano de obra, diseño) → si se repite en 2+ obras (recurrencia), se propone un control adicional preventivo para esa tarea → el usuario valida (nivel 2) → se incorpora como criterio de esta skill → se mide si bajó la recurrencia.

## Relación con el OS

- **Áreas**: Obras y Producción (dominio Calidad, no construido).
- **Capacidades existentes**: ninguna directamente — se apoya en Post Mortem y Adicionales (si el retrabajo se trata como adicional interno).
- **Centro de Acción**: candidato futuro para acciones de no conformidad pendiente de resolución — no construido hoy.
- **Dashboard**: no aporta alertas propias hoy.
- **Post Mortem**: fuente de aprendizaje si documenta causas de desvío técnico.
- **Memoria del proyecto**: patrones de no conformidad validados deberían documentarse ahí.
- **Futuros agentes/automatización**: ninguna decisión de aceptación/rechazo de calidad se automatiza — siempre clase E cuando hay riesgo de reclamo o de seguridad asociado.

## Prohibido

No inventar normas IRAM, tolerancias ni ensayos específicos sin verificación. No minimizar una no conformidad real sin evidencia.
