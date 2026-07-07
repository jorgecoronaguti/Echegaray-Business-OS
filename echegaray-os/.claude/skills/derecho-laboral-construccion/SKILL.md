---
name: derecho-laboral-construccion
description: "Régimen laboral específico de la construcción (distinto del derecho laboral general): CCT de UOCRA, registro IERIC, Fondo de Cese Laboral. Activar ante preguntas sobre alta/baja de personal, registro de trabajadores, categorías UOCRA, o desvinculación. Confirmado con evidencia real: Echegaray realiza pagos recurrentes a IERIC y UOCRA."
allowed-tools: Read, Bash, WebSearch, WebFetch
metadata:
  author: echegaray-os
  type: expert-domain
  jurisdiccion-principal: "San Juan, Argentina"
---

# Derecho Laboral de la Construcción (UOCRA, IERIC, Fondo de Cese)

## Propósito

Aportar el criterio del régimen laboral específico de la industria de la construcción en Argentina — que es un régimen distinto y más particular que el derecho laboral general (no hay indemnización por antigüedad clásica, sino Fondo de Cese Laboral; registro obligatorio en IERIC; categorías propias del CCT de UOCRA).

## Alcance

Cubre: régimen del Convenio Colectivo de Trabajo de la construcción, registro obligatorio en IERIC, Fondo de Cese Laboral, categorías de trabajador (Oficial Especializado, Oficial, Medio Oficial, Ayudante — ya confirmadas como reales en Planilla para Cotizar/JORNALES), alta/baja de personal.

No cubre: seguridad e higiene en el trabajo (`seguridad-higiene-art`, aunque están intrínsecamente conectados), ni el costo económico de la mano de obra para presupuestar (`costos-presupuestacion`).

## Preguntas profesionales que debe hacer

- ¿El trabajador está registrado en IERIC antes de empezar a trabajar en obra?
- ¿La categoría asignada (Oficial/Medio Oficial/Ayudante) corresponde a la tarea real que realiza?
- ¿La desvinculación se está tratando bajo el régimen de Fondo de Cese Laboral (propio de la construcción) y no bajo el régimen general de indemnización?
- ¿Los aportes a UOCRA e IERIC están al día (confirmado: aparecen como pagos reales y recurrentes en el sistema financiero de Echegaray)?
- ¿Hay un subcontratista involucrado cuyo personal también debe estar registrado, o el riesgo de solidaridad laboral recae sobre Echegaray?

## Marcos de análisis

- **El régimen de la construcción es distinto del derecho laboral general** — nunca aplicar por defecto el criterio de indemnización por despido de la LCT general sin verificar si corresponde el régimen especial de Fondo de Cese Laboral.
- **Registro antes de la ejecución, no después** — el registro en IERIC y la categorización correcta deben preceder al inicio de la tarea, no regularizarse retroactivamente como práctica habitual.
- **Solidaridad con subcontratistas**: si un subcontratista no tiene a su personal correctamente registrado, el riesgo legal puede alcanzar a Echegaray como contratista principal — cruzar siempre con `compras-abastecimiento-subcontratacion` antes de contratar.

## Criterios de decisión

| Variable | Pregunta |
|---|---|
| Registro | ¿Está en IERIC antes de empezar? |
| Categoría | ¿Corresponde a la tarea real? |
| Tipo de desvinculación | ¿Aplica Fondo de Cese o hay una causal distinta? |
| Riesgo de subcontratista | ¿Su personal está registrado y aportando correctamente? |

## Errores frecuentes

- Aplicar el cálculo de indemnización de la LCT general a un trabajador de la construcción en vez del régimen de Fondo de Cese Laboral.
- Asumir que un trabajador de un subcontratista no genera riesgo laboral para Echegaray.
- Confundir el pago a UOCRA (aportes sindicales/convencionales) con el pago a IERIC (registro/fiscalización) — son organismos distintos con función distinta, ambos confirmados como pagos reales de Echegaray.

## Información necesaria

- Registro real de personal por obra (hoy JORNALES usa nombre libre, sin legajo — confirmado gap en discovery PRP-008).
- Categoría real de cada trabajador (Planilla para Cotizar confirma 4 categorías UOCRA usadas: Oficial Especializado, Oficial, Medio Oficial, Ayudante).
- Estado de aportes a UOCRA/IERIC (aparece en el ledger financiero real, `EJERCICIO`/`Compras`, no estructurado como registro laboral en el OS).

## Interacción con otras skills

| Situación | Cruzar con |
|---|---|
| Hay un accidente o riesgo de seguridad involucrado | `seguridad-higiene-art` |
| Se está contratando un subcontratista | `compras-abastecimiento-subcontratacion` |
| Impacto en el costo de mano de obra presupuestado | `costos-presupuestacion` |
| Impacto en cargas sociales del P&L | `contabilidad-constructoras`, `impuestos-construccion` |

## Sistema de fuentes

1. **Conocimiento profesional estable**: existencia y naturaleza general del régimen especial de la construcción (CCT UOCRA, registro IERIC, Fondo de Cese Laboral como institutos reales y conocidos del sector).
2. **Normativa y regulación cambiante**: escalas salariales, categorías específicas y sus valores, actas paritarias — cambian periódicamente, verificar vigencia siempre antes de citar un valor.
3. **Documentación interna de Echegaray**: JORNALES, ALTAS-BAJAS-HM-EPP-DNI, LIBRO DE SUELDOS Y JORNALES (confirmados reales en discovery).
4. **Datos estructurados del OS**: `registros_hh` (PRP-008) — no tiene hoy vínculo a legajo/categoría formal.
5. **Experiencia histórica de obras**: Post Mortem, si documenta problemas laborales.
6. **Interpretación profesional**: lectura del caso concreto — no sustituye asesoramiento laboral real en un conflicto.
7. **Recomendación**: acción sugerida, incluyendo cuándo confirmar con un especialista laboral real.

## Política de fuentes externas y protocolo de vigencia

Antes de citar una escala salarial, categoría específica o acta paritaria de UOCRA como vigente, verificar con WebSearch/WebFetch la fuente oficial (UOCRA, IERIC). Registrar: fuente, fecha del acta/publicación, fecha de consulta, estado de verificación. El nombre de las instituciones (UOCRA, IERIC, Fondo de Cese Laboral) es conocimiento estable y puede citarse con confianza; los **valores** (escalas, montos, plazos) nunca sin verificación.

## Jurisdicción aplicable

Nacional — el CCT de la construcción, IERIC y el Fondo de Cese Laboral son regímenes nacionales, no provinciales. San Juan no tiene un régimen laboral de la construcción propio distinto del nacional (verificar si existe alguna particularidad provincial antes de descartarlo).

## Límites de certeza

No puede afirmar una escala salarial o valor de Fondo de Cese vigente sin verificación. No puede resolver un conflicto laboral real — señala riesgo y remite a asesoramiento especializado.

## Gaps de conocimiento conocidos (primera versión)

JORNALES (fuente real confirmada) no vincula trabajador a legajo ni a categoría UOCRA de forma estructurada — el dato de categoría real por trabajador no está sistematizado hoy en ningún archivo confirmado. Esto es un riesgo de cumplimiento, no solo un gap técnico: sin categorización clara y consistente, es difícil auditar si el aporte y el pago corresponden a la categoría real.

## Mecanismo de aprendizaje continuo

`OPERACIÓN → EVENTO → RESULTADO → DESVÍO → CAUSA → EVIDENCIA → PATRÓN → PROPUESTA DE APRENDIZAJE → VALIDACIÓN SEGÚN RIESGO → INCORPORACIÓN → APLICACIÓN FUTURA → MEDICIÓN`

Ejemplo: una desvinculación genera un reclamo porque se aplicó el criterio equivocado (evento/resultado adverso) → se documenta la causa (régimen mal aplicado) → si se identifica que el error viene de una confusión recurrente de criterio, se propone una regla clara para todas las desvinculaciones futuras → el usuario/asesor laboral valida (nivel 3, alto riesgo regulatorio) → se incorpora → se mide en la próxima situación comparable.

## Relación con el OS

- **Áreas**: Personas (dominio Legajo y Documentación, aún no construido en el OS).
- **Capacidades existentes**: HH y Productividad (PRP-008) — dato de HH sin vínculo laboral formal todavía.
- **Centro de Acción**: podría en el futuro generar acciones de vencimiento de registro/documentación por trabajador — no construido hoy (Bloque 5 de la revisión estratégica, prioridad menor).
- **Dashboard**: no aporta alertas propias hoy.
- **Post Mortem**: consumidora si documenta un problema laboral en una obra cerrada.
- **Memoria del proyecto**: escalas/criterios verificados deberían registrarse ahí con su fecha de vigencia.
- **Futuros agentes/automatización**: ninguna decisión de alta/baja/categorización se automatiza — siempre clase E, alto riesgo regulatorio y humano.

## Prohibido

No inventar escalas salariales, categorías, montos de Fondo de Cese Laboral, ni aplicar por defecto el régimen laboral general en vez del régimen especial de la construcción.
