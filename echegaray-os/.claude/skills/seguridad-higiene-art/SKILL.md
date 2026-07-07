---
name: seguridad-higiene-art
description: "Seguridad e Higiene en el trabajo y ART aplicado a obra de construcción. Activar ante preguntas sobre requisitos de seguridad para trabajar en una obra o planta industrial, actuación ante un incidente, o cumplimiento de un pliego de Seguridad/Salud/Medio Ambiente de cliente. Prioridad alta confirmada: ARCOR exige pliego propio de SSMA para poder cotizar/trabajar en su planta."
allowed-tools: Read, Bash, WebSearch, WebFetch
metadata:
  author: echegaray-os
  type: expert-domain
  jurisdiccion-principal: "San Juan, Argentina"
---

# Seguridad e Higiene y ART

## Propósito

Aportar el criterio de seguridad e higiene laboral y de gestión de ART aplicado a obra — con evidencia real confirmada de que esto no es solo una obligación interna, sino una **condición comercial** exigida por clientes industriales como ARCOR para poder trabajar en su planta.

## Alcance

Cubre: requisitos generales de seguridad e higiene en obra de construcción, gestión de ART (cobertura, siniestros), cumplimiento de pliegos de Seguridad/Salud/Medio Ambiente de clientes industriales, elementos de protección personal (EPP).

No cubre: el régimen laboral general (`derecho-laboral-construccion`, aunque están conectados vía UOCRA/ART), ni la calidad técnica de la obra (`calidad-obra`).

## Preguntas profesionales que debe hacer

- ¿Esta obra/cliente exige un pliego de Seguridad/Salud/Medio Ambiente propio, y Echegaray lo cumple hoy? (confirmado: sí para ARCOR)
- ¿Los trabajadores en esta obra tienen EPP asignado y registrado (confirmado que existe un archivo real `ALTAS-BAJAS-HM-EPP-DNI`)?
- ¿La cobertura de ART está vigente y corresponde a la actividad real que se ejecuta?
- ¿Ante un incidente, se siguió el protocolo de reporte antes de continuar la operación?
- ¿Un subcontratista que trabaja en esta obra cumple los mismos requisitos de seguridad que Echegaray, o introduce un riesgo no controlado?

## Marcos de análisis

- **La seguridad no es un tema aparte del negocio — es una condición de acceso comercial** (evidencia real: el pliego de ARCOR incluye condiciones de Seguridad/Salud/Medio Ambiente como parte del proceso de cotización, no como un anexo opcional).
- **Ante un incidente, reportar y frenar antes que continuar** — nunca priorizar el avance de obra sobre la investigación de un incidente de seguridad.
- **La responsabilidad de seguridad se extiende a subcontratistas** que trabajan bajo la obra de Echegaray — mismo principio de riesgo compartido que en `derecho-laboral-construccion`.

## Criterios de decisión

| Variable | Pregunta |
|---|---|
| Exigencia de cliente | ¿Este cliente tiene pliego SSMA propio? |
| Cobertura ART | ¿Está vigente y corresponde a la actividad? |
| EPP | ¿Está asignado y en uso real? |
| Gravedad de un incidente | ¿Requiere frenar la tarea, la obra, o reportar y continuar con control? |

## Errores frecuentes

- Tratar el pliego de Seguridad/Salud/Medio Ambiente de un cliente como un trámite administrativo más, en vez de una condición real para conservar el negocio.
- Continuar la operación después de un incidente sin documentarlo, perdiendo evidencia para la ART y para el cliente.
- Asumir que la cobertura de ART de Echegaray cubre automáticamente al personal de un subcontratista.

## Información necesaria

- El pliego SSMA específico del cliente en cuestión (confirmado que existe al menos para ARCOR).
- Estado de EPP por trabajador (`ALTAS-BAJAS-HM-EPP-DNI`, confirmado real, no migrado al OS).
- Historial de incidentes previos en la obra o en obras comparables (Post Mortem, si se documentó).

## Interacción con otras skills

| Situación | Cruzar con |
|---|---|
| El incidente involucra a un trabajador | `derecho-laboral-construccion` |
| El incidente involucra a un subcontratista | `compras-abastecimiento-subcontratacion` |
| Hay un reclamo de cliente relacionado | `derecho-construccion-contratos` |
| El pliego de seguridad afecta la decisión de cotizar | `costos-presupuestacion` |

## Sistema de fuentes

1. **Conocimiento profesional estable**: principios generales de seguridad e higiene en obra de construcción.
2. **Normativa y regulación cambiante**: Ley de Higiene y Seguridad, resoluciones de la SRT (Superintendencia de Riesgos del Trabajo) — verificar vigencia antes de citar una resolución específica.
3. **Documentación interna de Echegaray**: `ALTAS-BAJAS-HM-EPP-DNI`, Pliego de Condiciones de Seguridad, Salud y Medio Ambiente de ARCOR (confirmado real).
4. **Datos estructurados del OS**: ninguno hoy — capacidad no construida.
5. **Experiencia histórica de obras**: Post Mortem, si documenta incidentes.
6. **Interpretación profesional**: lectura del caso concreto.
7. **Recomendación**: acción sugerida, incluyendo cuándo escalar a un profesional de higiene y seguridad matriculado real.

## Política de fuentes externas y protocolo de vigencia

Antes de citar una resolución de la SRT o un requisito normativo específico de seguridad como vigente, verificar con WebSearch/WebFetch. Registrar: fuente, autoridad emisora (SRT), fecha de la resolución, fecha de consulta, estado de verificación. Ante cualquier incidente real con lesión, la recomendación es siempre escalar a un profesional matriculado de higiene y seguridad y a la ART correspondiente — esta skill no reemplaza esa intervención.

## Jurisdicción aplicable

Nacional (Ley 19.587 de Higiene y Seguridad, SRT) con posible reglamentación provincial complementaria en San Juan — verificar si existe. Requisitos particulares de planta industrial (ARCOR, Saint Gobain): contractuales, adicionales a la norma general, y en la práctica más exigentes.

## Límites de certeza

No puede afirmar el contenido vigente de una resolución de la SRT sin verificación. No puede evaluar la gravedad real de un incidente sin información directa del hecho — no inventar un diagnóstico de seguridad sin evidencia.

## Gaps de conocimiento conocidos (primera versión)

No existe hoy en el OS ninguna capacidad de Seguridad e Higiene (confirmado como gap crítico en la revisión estratégica — Bloque 1, alta prioridad por ser gating comercial con ARCOR pero no priorizado inmediatamente por el usuario, que priorizó control financiero y de obras primero). Esta skill puede operar hoy solo con criterio profesional general y los archivos reales confirmados, sin ningún dato estructurado propio del OS.

## Mecanismo de aprendizaje continuo

`OPERACIÓN → EVENTO → RESULTADO → DESVÍO → CAUSA → EVIDENCIA → PATRÓN → PROPUESTA DE APRENDIZAJE → VALIDACIÓN SEGÚN RIESGO → INCORPORACIÓN → APLICACIÓN FUTURA → MEDICIÓN`

Ejemplo: se reporta un incidente menor en una obra (evento) → se investiga la causa (ej. falta de EPP específico para esa tarea) → si el mismo tipo de incidente aparece en otra obra comparable (recurrencia), se propone una regla operativa de EPP obligatorio para esa tarea → el usuario/profesional de higiene y seguridad valida (nivel 3, alto riesgo humano) → se incorpora como criterio → se mide si se repite en la próxima obra comparable.

## Relación con el OS

- **Áreas**: Personas (dominio Seguridad e Higiene, no construido).
- **Capacidades existentes**: ninguna — gap total confirmado.
- **Centro de Acción**: candidato futuro claro para acciones de vencimiento de EPP, cobertura ART, o seguimiento de incidente — no construido hoy.
- **Dashboard**: no aporta alertas propias hoy.
- **Post Mortem**: consumidora si un Post Mortem documenta un incidente de seguridad en una obra cerrada.
- **Memoria del proyecto**: cualquier resolución/norma verificada debería registrarse ahí con su fecha de vigencia.
- **Futuros agentes/automatización**: ninguna decisión de seguridad se automatiza — siempre clase E, junto con lo laboral el dominio de mayor sensibilidad humana del sistema.

## Prohibido

No inventar resoluciones de la SRT, normas de seguridad ni minimizar la gravedad de un incidente real sin evidencia. No recomendar continuar una operación después de un incidente sin investigación previa.
