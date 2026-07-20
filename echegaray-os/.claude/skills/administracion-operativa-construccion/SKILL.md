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


## Contrato de arquitectura del OS (vale para toda esta skill)

Reglas que gobiernan de dónde sale cada dato. No son técnicas: definen qué respuesta es legítima.

1. **Todo sale del data room.** La fuente es `administracion` en Drive (o cualquier carpeta compartida con la cuenta de servicio del OS). Si un dato existe ahí, **el OS lo LEE — no se le pide al dueño que lo cargue a mano.** Antes de decir "no tengo ese dato", verificar si está en el data room.
2. **Fuente única.** Todo concepto que se muestre en más de una cara del OS (chat, web, cualquier herramienta) se define **una sola vez en Postgres** (vista o función) y las caras la consumen. Ejemplos vivos: `obra_costo_real` (costo por obra), `obligacion_resumen` (saldo de obligaciones), `norm_obra()` (normalización de nombre de obra). **Nunca recalcular por separado un concepto que ya tiene fuente** — si aparece una diferencia entre web y chat, es un bug de arquitectura, no una discrepancia a explicar.
3. **Si falta información y es legítimamente externa** (un precio de mercado, una normativa, una referencia técnica), **buscarla en internet con la herramienta de búsqueda** y citar la fuente y la fecha — no responder "no tengo el dato" cuando es averiguable.
4. **Una capacidad sin dato responde "no tengo el dato" y ofrece registrarlo.** Nunca un número inventado.

## Cableado al OS real — qué LLAMAR en vez de estimar

- **`obligaciones_estado`** (lee la vista compartida con la web) — qué se debe, qué está vencido y qué entra en 30 días.
- **`briefing_caja`** — posición de caja y proyección a 7 días. **`pyl_estado`** — el resultado devengado del mes.
- **`gasto_proveedores`** — gasto real por proveedor desde ARCA. **`legajos_estado`** — completitud documental del personal.
- **`buscar_comprobante`** — verificar si una factura ya está registrada en ARCA y a qué obra se imputó.

## El circuito administrativo: cada papel tiene un camino, no un cajón

El principio que ordena todo: **un comprobante que entra sin circuito definido termina siendo un problema de cierre de mes.**

- **Compra**: pedido → orden de compra → **remito firmado en recepción** → factura → control (que los tres coincidan: pedido, remito, factura) → imputación a obra → pago → archivo.
- **El control de tres puntas** (pedido/remito/factura) es lo que evita pagar lo que no llegó o pagar dos veces la misma factura. Es el control interno más barato y más rentable que existe.
- **Toda factura se imputa a una obra o a Estructura al momento de cargarla**, no después. Un gasto sin obra asignada no se puede controlar ni recuperar (es el hallazgo recurrente: costos que quedan como "indirecto" sin serlo).
- **Ingresos**: certificado aprobado → factura → seguimiento de cobro → imputación del cobro. El certificado aprobado y no facturado es plata parada.

## Calendario administrativo: lo recurrente no se recuerda, se agenda

Las obligaciones de una constructora tienen **fecha conocida de antemano**; que sorprendan es una falla de proceso, no de memoria. Deben estar en calendario con alerta previa:

- cargas sociales y **F931**; **Fondo de Cese / IERIC / UOCRA**; ART;
- IVA, Ingresos Brutos, anticipos de Ganancias; SIRCREB y retenciones;
- cuotas de financiación, seguros, alquileres;
- vencimientos de **habilitaciones de flota** (RTO/VTV, seguros) y de **documentación de personal** (exámenes médicos);
- envío mensual de documentación al Estudio Contable.

**Verificar fechas y alícuotas vigentes** — nunca citarlas de memoria (cruzar con `impuestos-construccion`).

## Cierre de mes: qué tiene que estar antes de decir "cerrado"

1. Todas las facturas de compra del mes **cargadas e imputadas a obra o Estructura**.
2. **Conciliación bancaria** de cada cuenta contra el extracto real (no contra el saldo que uno cree).
3. Cobranzas del mes registradas y las **vencidas identificadas con responsable de reclamo**.
4. Obligaciones del mes cargadas con fecha de vencimiento (no como "gasto general sin fecha").
5. Documentación al Estudio Contable enviada, con constancia.
6. Diferencias sin explicar → se anotan como pendientes, **no se ajustan a mano para que cierre**. Un número forzado para que cuadre destruye la confianza en todo el sistema.

## Control interno mínimo para una PyME (sin burocracia)

Tres reglas que evitan la mayoría de los desvíos y no requieren estructura:

- **Separación de funciones**: quien autoriza un pago no debería ser el único que lo ejecuta y lo concilia.
- **Todo pago tiene respaldo**: factura + imputación + autorización. Sin excepciones "porque es urgente".
- **La caja chica se rinde**, con comprobantes y tope; no es una cuenta paralela.

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
