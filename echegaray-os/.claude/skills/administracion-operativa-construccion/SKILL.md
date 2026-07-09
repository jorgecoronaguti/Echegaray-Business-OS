---
name: administracion-operativa-construccion
description: "Gestión administrativa operativa del día a día de una constructora: organización documental, relación con proveedores y organismos (Estudio Contable, IERIC, UOCRA, ARCA/DGR), caja chica, archivo de comprobantes. Activar ante preguntas sobre cómo organizar o ejecutar un proceso administrativo cotidiano -- distinto de la decisión estratégica (gestion-empresarial-riesgos) o el criterio fiscal/contable de fondo (impuestos-construccion, contabilidad-constructoras)."
allowed-tools: Read, Bash, WebSearch, WebFetch
metadata:
  author: echegaray-os
  type: expert-domain
  jurisdiccion-principal: "San Juan, Argentina"
---

# Administración Operativa de la Construcción

## Propósito

Aportar el criterio de ejecución administrativa cotidiana que sostiene a las demás skills. No decide qué es correcto fiscal/contable/legalmente (eso lo deciden `impuestos-construccion`, `contabilidad-constructoras`, `derecho-laboral-construccion`) — decide **cómo se organiza y ejecuta** ese trabajo día a día: qué comprobante falta, a quién hay que enviarle qué documentación y cuándo, cómo se organiza el archivo, cómo se controla que un pago recurrente (IERIC, UOCRA, ARCA, alquileres) no se pase de fecha.

## Alcance

Cubre: organización y archivo de comprobantes/facturas, seguimiento de tareas administrativas recurrentes (envío mensual de documentación al Estudio Contable, pago de boletas IERIC/UOCRA, gestión de caja chica), coordinación con proveedores externos de servicios administrativos (Estudio Contable, gestorías), checklist de qué falta antes de un cierre mensual.

No cubre: el criterio fiscal de fondo (`impuestos-construccion`), el criterio contable de fondo (`contabilidad-constructoras`), la decisión de riesgo/Go-No-Go (`gestion-empresarial-riesgos`), ni el registro laboral formal (`derecho-laboral-construccion`) — esta skill ejecuta y organiza, no decide el criterio de fondo.

## Preguntas profesionales que debe hacer

- ¿Qué documentación recurrente vence esta semana/mes (boletas IERIC/UOCRA, envío al Estudio Contable, vencimientos de alquiler/servicios)?
- ¿Está organizado el archivo de comprobantes de forma que el Estudio Contable pueda auditar sin pedir de nuevo lo mismo?
- ¿Hay un proceso administrativo que se repite y todavía no tiene checklist ni responsable claro?
- ¿La caja chica/efectivo de oficina está conciliada contra los comprobantes reales?

## Marcos de análisis

- **Proceso → Responsable → Dato → Indicador → Alerta → Decisión** (CLAUDE.md raíz) aplicado a cada tarea administrativa recurrente, no solo a las capacidades de negocio.
- **Confirmado real en el Daily Meeting de Echegaray**: tareas administrativas recurrentes ya existen como hábito ("Enviar documentacion a Estudio Contable", "Control de Sumario IERIC, Pago y envio de Boleta", "Pago proveedores") — esta skill formaliza ese patrón ya real, no inventa uno nuevo.
- **No confundir "está pagado" con "está bien registrado"**: un pago real sin el comprobante archivado correctamente genera el mismo problema de trazabilidad que uno no pagado, a la hora de una auditoría o de un cierre contable.

## Criterios de decisión

| Variable | Pregunta |
|---|---|
| Vencimiento | ¿Cuándo vence esta obligación administrativa recurrente? |
| Responsable | ¿Quién la ejecuta hoy en la práctica (evidencia real: Daily Meeting)? |
| Archivo | ¿El comprobante queda guardado y encontrable después? |
| Recurrencia | ¿Es la primera vez o ya se repitió sin proceso claro? |

## Errores frecuentes

- Tratar una tarea administrativa recurrente como un evento aislado cada vez, en vez de reconocerla como recurrente y darle checklist/responsable fijo.
- Perder el comprobante de un pago real (Corralon Progreso, Alumetal, IERIC, etc.) porque no hay un lugar único de archivo — confirmado como riesgo real dado que hoy ese archivo vive repartido entre Control de Gastos, recibos físicos y Drive.
- Confundir la ejecución administrativa (esta skill) con la decisión de fondo (contable/fiscal/laboral) — ejecutar rápido sin haber confirmado el criterio correcto con la skill de dominio dueña.

## Información necesaria

- Daily Meeting (fuente real confirmada de qué tareas administrativas se ejecutan y con qué frecuencia).
- Control de Gastos / Flujo de Caja (para saber qué pagos recurrentes existen).
- Calendario real de vencimientos de organismos (IERIC, UOCRA, ARCA, DGR San Juan) — no sistematizado hoy en el OS.

## Interacción con otras skills

| Situación | Cruzar con |
|---|---|
| El criterio fiscal de la tarea no está claro | `impuestos-construccion` |
| El criterio contable de la tarea no está claro | `contabilidad-constructoras` |
| Es un tema de registro/categoría laboral | `derecho-laboral-construccion` |
| Es una decisión de riesgo, no de ejecución | `gestion-empresarial-riesgos` |
| Requiere cargarse nativo en el OS en vez de en Drive | `web-ux-deploy-operacion-producto` (formulario), `integraciones-apis-sistemas-externos` (si se automatiza) |

## Sistema de fuentes

1. **Conocimiento profesional estable**: principios generales de organización administrativa de PyME.
2. **Normativa y regulación cambiante**: fechas de vencimiento de organismos (IERIC, UOCRA, ARCA, DGR San Juan) — verificar vigencia, cambian.
3. **Documentación interna de Echegaray**: Daily Meeting (confirmado real), Control de Gastos.
4. **Datos estructurados del OS**: `obligaciones`, `backlog_autonomo`, `acciones`.
5. **Experiencia histórica de obras**: Post Mortem, si documenta un problema administrativo.
6. **Interpretación profesional**: lectura del caso concreto.
7. **Recomendación**: acción sugerida, incluyendo cuándo el tema deja de ser administrativo y pasa a requerir criterio fiscal/contable/legal de una skill de fondo.

## Política de fuentes externas y protocolo de vigencia

Antes de citar una fecha de vencimiento o requisito documental específico de un organismo (IERIC, UOCRA, ARCA, DGR San Juan) como vigente, verificar con WebSearch la fuente oficial. Registrar fuente, fecha de publicación, fecha de consulta.

## Jurisdicción aplicable

Nacional (IERIC, UOCRA, ARCA) y provincial (DGR San Juan) según el organismo — nunca asumir un único régimen para todos los pagos recurrentes.

## Límites de certeza

No reemplaza al Estudio Contable ni a un gestor administrativo real — organiza y da seguimiento, no certifica ni resuelve un criterio de fondo.

## Gaps de conocimiento conocidos (primera versión)

No existe hoy un calendario consolidado de vencimientos administrativos recurrentes (IERIC, UOCRA, ARCA, alquileres, servicios) en el OS — vive en la memoria de Rodrigo y en el Daily Meeting, sin alerta automática si algo se atrasa.

## Mecanismo de aprendizaje continuo

`OPERACIÓN → EVENTO → RESULTADO → DESVÍO → CAUSA → EVIDENCIA → PATRÓN → PROPUESTA DE APRENDIZAJE → VALIDACIÓN SEGÚN RIESGO → INCORPORACIÓN → APLICACIÓN FUTURA → MEDICIÓN`

## Historial de aprendizaje (append-only, más reciente arriba)

- **2026-07-09** — Creación de la skill, a partir del gap identificado en la revisión conjunta de las 16 skills existentes: ninguna cubría la ejecución administrativa cotidiana (distinta de la decisión estratégica de `gestion-empresarial-riesgos`). Primera evidencia real usada: tareas administrativas recurrentes ya visibles en el Daily Meeting real de Echegaray.

## Relación con el OS

- **Áreas**: Administración y Finanzas.
- **Capacidades existentes**: `obligaciones`, `acciones` (Centro de Acción), `backlog_autonomo`.
- **Centro de Acción**: debería generar acciones de vencimiento administrativo recurrente — no construido hoy.
- **Dashboard**: no aporta alertas propias hoy.
- **Post Mortem**: consumidora si documenta un problema administrativo en el cierre de obra.
- **Memoria del proyecto**: procesos administrativos formalizados deberían documentarse ahí.
- **Futuros agentes/automatización**: recordatorios de vencimiento y organización de archivo pueden automatizarse con bajo riesgo (clase B/C); pagos reales y decisiones de fondo siguen siendo clase E.

## Prohibido

No inventar fechas de vencimiento ni requisitos documentales de un organismo sin verificar. No tomar una decisión fiscal/contable/legal de fondo bajo el disfraz de "es solo administrativo".
