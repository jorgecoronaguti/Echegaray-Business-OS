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

## El régimen de la construcción NO es el régimen laboral común

Éste es el error conceptual más caro y el más frecuente: aplicarle a un obrero de la construcción las reglas de la Ley de Contrato de Trabajo como si fuera un empleado común.

- **La actividad se rige por el Estatuto de la Construcción (Ley 22.250)**, que desplaza a la LCT en lo específico (la LCT se aplica supletoriamente en lo compatible).
- **No existe la indemnización por antigüedad del régimen común**: el sistema es el **Fondo de Cese Laboral**. El empleador aporta mensualmente a una cuenta a nombre del trabajador y **al terminar la relación —por el motivo que sea— el trabajador retira ese fondo**. No hay "despido sin causa" indemnizable al estilo LCT.
- Consecuencia práctica de gestión: **el costo de la desvinculación ya se fue pagando mes a mes.** Si los aportes al Fondo de Cese están al día, terminar una relación laboral no genera el pasivo explosivo del régimen común. Si **no** están al día, el riesgo es grande: es incumplimiento y habilita reclamos.
- **El Fondo de Cese no se paga en mano al trabajador** ni se descuenta de su sueldo: es aporte patronal depositado en el sistema. Pagarlo "por afuera" no libera al empleador.
- **Verificar siempre el porcentaje de aporte vigente y su variación según antigüedad** (el primer año suele tener un porcentaje distinto al de los años siguientes) — nunca citarlo de memoria.

## IERIC, libreta y registración

- **IERIC** es el ente de contralor de la actividad: la empresa debe estar **inscripta** y el trabajador debe tener su registración y libreta del Fondo de Cese.
- La **falta de registración o de aportes** es el hallazgo típico de una fiscalización y deriva en multas, además de habilitar reclamos del trabajador.
- **Alta temprana** antes del inicio de tareas: registrar después de que la persona ya empezó a trabajar es una infracción, aunque se regularice.
- El **legajo del trabajador** debe poder acreditar: alta, DNI, examen médico preocupacional, constancia de entrega de EPP y capacitaciones. *Ver el cableado más abajo: hoy solo 1 de 20 activos tiene el legajo completo.*

## Convenio Colectivo (UOCRA): lo que define el costo y el conflicto

- **Categorías** (Ayudante, Medio Oficial, Oficial, Oficial Especializado) y **zona** determinan el jornal. **Verificar la escala y la zona aplicable a San Juan vigentes** — cambian con frecuencia y son la base de todo cálculo.
- **Adicionales del convenio** que suelen olvidarse y después aparecen en un reclamo: asistencia/presentismo, zona desfavorable, altura, insalubridad, trabajo en horario nocturno, especialización.
- **Horas extras, descansos y jornada**: el registro horario es prueba. Sin registro confiable, en un conflicto la versión del trabajador tiene mucho peso.
- **SAC y vacaciones** se rigen por las reglas generales en lo no modificado por el estatuto.

## Intercambio telegráfico: el conflicto se gana o se pierde en los plazos

Es directamente relevante: el OS ya detecta telegramas en los legajos.

- El conflicto laboral en Argentina se construye por **intercambio telegráfico** (telegrama obrero / carta documento). **Cada pieza tiene plazo de respuesta y el silencio se interpreta en contra.**
- Ante un telegrama del trabajador: **no dejarlo sin responder y no responder tarde.** Responder fuera de plazo o no responder puede equivaler a admitir los hechos invocados.
- La respuesta debe ser **específica**: negar o reconocer hechos concretos, no una fórmula genérica. Una respuesta vaga es tan riesgosa como el silencio.
- **Nunca improvisar la respuesta**: un telegrama mal contestado define la indemnización de un juicio que todavía no empezó. Esta skill señala el riesgo y el plazo — **la redacción se hace con el abogado laboralista**.
- Registrar siempre: fecha de recepción, fecha de respuesta y copia de ambas piezas en el legajo.

## Subcontratistas: la solidaridad no se terceriza

- El contratante responde **solidariamente** por las obligaciones laborales y de seguridad social del subcontratista respecto del personal afectado a la obra.
- Control mínimo **mes a mes** (no al final): nómina del personal en obra, constancia de pago de cargas sociales, cobertura de ART con la nómina incluida, inscripción del sub en IERIC.
- Guardar esa documentación es lo que corta la solidaridad en la práctica. Sin ella, un reclamo del personal del sub llega a Echegaray.

## Cableado al OS real — qué LLAMAR en vez de estimar (verificado 2026-07-19)

- **`legajos_estado`** — foto de completitud de los legajos leída de la carpeta real del data room (`administracion/ALTAS - BAJAS - HM - EPP - DNI`). Devuelve, con datos reales: cuántas personas hay, activas vs. dadas de baja, y **qué legajo activo no tiene ALTA (IERIC) / DNI / HM (examen médico) / EPP**. Además marca **CONFLICTO LABORAL**: quién tiene un telegrama, carta documento o intimación en su legajo. Ante "¿cómo están los legajos?", "¿a quién le falta el examen médico?" o "¿hay algún despido en curso?" **se llama, no se estima**.
- **Estado real medido hoy**: 45 personas · 20 activas · **solo 1 con legajo completo** · 18 activos sin constancia de EPP · 12 sin DNI · 9 sin alta · 5 sin examen médico · **7 personas con telegrama, 1 de ellas activa**. Eso es exposición concreta ante una fiscalización de IERIC o un reclamo — no es un tema administrativo menor.
- Aclaración de confianza: los archivos sueltos se atribuyen por coincidencia de nombre (inferencia) — al informar sobre una persona concreta, decir que hay que verificar contra el archivo.
- **`jornales_quincena`** — liquidación real por quincena leída de la planilla JORNALES (Obreros / Oficina). Es el dato de lo efectivamente pagado.
- **Gap conocido**: las HH por obra no mapean limpio al eje canónico de obras, así que no se puede atribuir costo laboral por obra con confianza. Decirlo cuando se pregunte.

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

## Historial de aprendizaje (append-only, más reciente arriba)

- **2026-07-09** — Confirmado con evidencia real (lectura completa de JORNALES, tab de nómina 2026) que el gap ya anotado abajo ("JORNALES no vincula trabajador a legajo/categoría de forma estructurada") tiene una consecuencia práctica medible, no solo teórica: las celdas resumen BANCO y CAJA de esa hoja devuelven `#REF!` en casi todas las semanas de enero a abril, y el SALDO C (caja) de la cuadrilla de Javier Sanchez crece en negativo semana a semana (-$199.366 → -$1.640.625 en marzo). Clasificación: **A. observación aislada** (una sola cuadrilla, un solo período revisado) — no se generaliza a "todo JORNALES está mal" sin revisar más cuadrillas/períodos. Acción real creada en Centro de Acción para que Rodrigo confirme si ese saldo es real o un error de fórmula.

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
