---
name: lectura-cheques-imagen
description: "Leer un cheque físico argentino fotografiado (foto del teléfono, escaneo, PDF de imagen) y convertirlo en un registro estructurado y verificado: distinguir cheque común de cheque de pago diferido (CPD), extraer librador/número/fechas/importe/beneficiario/firma/banda MICR, aplicar los controles de la Ley de Cheques (importe en letras vs. números, plazo de 360 días, correlatividad de chequera) y declarar como DESCONOCIDO todo campo ilegible. Activar cuando el dueño manda fotos de cheques propios o de terceros para cargar, conciliar o consultar. No registra ni concilia: entrega el dato estructurado que consumen 'Cheques Emitidos', 'Cheques Recibidos' y la tesorería."
allowed-tools: Read, Bash, WebSearch, WebFetch
metadata:
  author: echegaray-os
  type: expert-domain
  jurisdiccion-principal: "Argentina (nacional) — Ley 24.452 y reglamentación del BCRA"
---

# Lectura de Cheques Físicos desde Imagen

## Propósito

Convertir la foto de un cheque en un **registro estructurado, controlado y trazable** que la tesorería del OS pueda usar sin volver a mirar la imagen — y, cuando el cheque tiene un problema (importe que no cierra, plazo fuera de ley, firmado sin beneficiario), **gritarlo** en vez de cargarlo callado.

Un cheque mal leído no es un error de OCR: es plata. Confundir un cheque común con un cheque de pago diferido cambia la semana en la que el dinero sale de la cuenta; leer un beneficiario que no está escrito inventa un acreedor; dar por buena una foto borrosa mete un número falso en el forecast de caja.

## Alcance

**Cubre**: identificación del tipo de cheque (común / de pago diferido / eCHEQ impreso), extracción campo por campo desde imagen, lectura de la banda MICR inferior, controles de consistencia y de legalidad formal, clasificación de certeza por campo, detección de riesgos de tenencia (cheque firmado sin beneficiario, cheque en blanco firmado, cheque endosado), y la entrega del dato en el formato que consumen las capacidades ya existentes del OS.

**No cubre** — y no lo reimplementa:

| No hace | Quién lo hace |
|---|---|
| Registrar el cheque en la planilla | `Sheet:Cheques Emitidos` (generador `orquestador/scripts/cheques-emitidos-tablero.mjs`, carga manual A–L) y `Sheet:Cheques Recibidos` (`orquestador/lib/cheques-recibidos.mjs`) |
| Marcar si el cheque se debitó | `orquestador/scripts/cheques-emitidos-sync-banco.mjs` (fuente única: el banco) |
| Decidir si el cheque ya está contemplado en el cash flow | `orquestador/lib/cheques-cobertura.mjs` (cruce por número de comprobante contra Compras) |
| Decidir el impacto en caja / prioridad de pago | `finanzas-tesoreria-construccion` |
| Decidir si el gasto que el cheque paga es de una obra | `compras-abastecimiento-subcontratacion` + `contabilidad-constructoras` |
| Litigio, ejecución, protesto, reclamo | `derecho-construccion-contratos` y asesoramiento legal real |

Esta skill **produce el dato**. No lo escribe en ninguna pestaña ni lo carga en Supabase por sí sola: la escritura la hace la capacidad dueña del registro, con la aprobación que esa capacidad ya exige.

## Regla absoluta

**Lo que no se lee en la imagen, no existe.** Cada campo sale con uno de tres valores de certeza:

- `LEIDO` — se ve con claridad en la foto.
- `DUDOSO` — se lee parcialmente, hay una interpretación probable pero puede estar mal (dígito borroso, manuscrito ambiguo, reflejo). Se entrega el valor **y** la duda.
- `DESCONOCIDO` — no se lee, o el renglón está vacío.

Un renglón **vacío** y un renglón **ilegible** no son lo mismo y se distinguen: el primero es un hecho del cheque (`vacio: true`), el segundo es una limitación de la foto. Nunca se completa un campo por deducción "razonable" (ni la fecha, ni el beneficiario, ni el importe).

## Cómo distinguir el tipo — el error más caro

| Señal en la imagen | Cheque común | Cheque de pago diferido (CPD) |
|---|---|---|
| Leyenda impresa | "CHEQUE" | **"CHEQUE DE PAGO DIFERIDO-CPD"**, y la advertencia impresa "La fecha de pago no puede exceder un plazo de 360 días" |
| Fechas | **UNA** (lugar y fecha de creación) | **DOS**: fecha de creación/emisión **y** fecha de pago |
| Cuándo sale la plata | Exigible desde la emisión; se presenta al cobro dentro de los 30 días de creado | Recién en la fecha de pago |
| Efecto en el OS | Salida de caja inmediata / cheque en circulación | Compromiso futuro: entra al *outstanding* de "Cheques Emitidos" y al forecast del mes de pago |

Si la imagen no permite ver la leyenda impresa ni un segundo renglón de fecha, el tipo queda `DESCONOCIDO` — **no se asume común por defecto**. Asumir "común" adelanta la salida de caja un mes; asumir "diferido" la atrasa. Las dos hipótesis son un error de tesorería.

Marcar también: **eCHEQ** (no es papel — si llega una captura de la pantalla del banco, no es esta skill: es `cheques-recibidos` / el registro de echeq) y **cheque cruzado / "no a la orden" / "para acreditar en cuenta"** cuando aparezcan esas cláusulas, porque limitan cómo puede cobrarse.

## Campos a extraer (contrato de salida)

Un cheque leído produce este objeto. Todo campo lleva su certeza; los que no se leen van `null` + `DESCONOCIDO`.

```
tipo                 'comun' | 'diferido' | 'desconocido'
soporte              'fisico' | 'echeq_impreso'
banco                p.ej. 'Santander'
sucursal_plaza       sucursal y domicilio de pago impresos
chequera             identificador impreso de la chequera (p.ej. 'H17 C-VI/26')
serie                letra de serie (p.ej. 'M')
numero               número de orden impreso, con sus ceros (p.ej. '00000328')
cuenta               nº de cuenta corriente del librador
librador_cuit
librador_razon_social
librador_domicilio
fecha_emision        DD/MM/AAAA
fecha_pago           DD/MM/AAAA — sólo en CPD; en cheque común null
importe_numeros      número
importe_letras       texto tal como está escrito
beneficiario         texto, o null con vacio:true si el renglón está en blanco
firmado              true | false | desconocido  (firma del librador)
endosos              lo que se lea al dorso, si hay foto del dorso
clausulas            ['cruzado','no a la orden','para acreditar en cuenta', ...]
micr                 banda inferior tal cual se lee
certeza              { campo: 'LEIDO'|'DUDOSO'|'DESCONOCIDO', ... }
hallazgos            [ ...controles fallados y riesgos... ]
origen               archivo/foto + fecha de lectura
```

**El dorso importa.** Un cheque sólo tiene frente fotografiado ⇒ `endosos: DESCONOCIDO`, y hay que decirlo: un cheque recibido puede venir endosado y eso cambia quién responde si rebota.

## Controles obligatorios (leer no alcanza)

Se corren siempre, y cada uno produce `ok`, `hallazgo` o `no_verificable` (mismo criterio que el resto de las capacidades de control del OS — nunca "sin observaciones" cuando en realidad no se pudo verificar).

1. **Letras vs. números.** Si `importe_letras` no coincide con `importe_numeros`, es un hallazgo grave. La ley resuelve el conflicto a favor de las letras (art. 2 inc. 5, ver Normativa) — pero el OS **no corrige solo**: informa la discrepancia y no carga el cheque hasta que una persona decida.
2. **Plazo del CPD.** `fecha_pago − fecha_emision` debe ser ≤ **360 días** (art. 54 inc. 4). Fuera de ese plazo el cheque es formalmente observable.
3. **Coherencia de fechas.** `fecha_pago` posterior a `fecha_emision`; ninguna fecha imposible ni futura respecto de la emisión declarada.
4. **Correlatividad de chequera.** El número debe pertenecer a la serie/chequera declarada y encajar en la secuencia ya registrada. Un salto de numeración es una pregunta legítima: ¿dónde está el cheque que falta?
5. **Duplicado.** Antes de proponer la carga, cruzar `banco + cuenta + número` contra el registro existente (`Cheques Emitidos` / `Cheques Recibidos` / el extracto). Este repositorio ya pagó el error de contar dos veces.
6. **Firma.** Sin firma del librador el cheque no es exigible (art. 2 inc. 6 / art. 54 inc. 9). Un cheque firmado y con campos vacíos es un riesgo, no un dato faltante — ver abajo.
7. **MICR vs. cuerpo.** Si la banda inferior se lee, el número de cheque y el de cuenta que trae deben coincidir con los impresos en el cuerpo. Si no coinciden, la foto o la lectura están mal: no elegir uno de los dos, informar el conflicto.
8. **Beneficiario.** Vacío ⇒ hallazgo (ver riesgo). Presente ⇒ dejarlo tal cual está escrito; no "normalizar" un nombre manuscrito contra el padrón de proveedores sin marcarlo como inferencia.

## Riesgos de tenencia que la skill debe gritar

Estos no son defectos de lectura: son problemas del cheque, y el OS los informa aunque el dato haya salido perfecto.

- **Cheque firmado sin beneficiario.** La ley lo admite (art. 54 inc. 6: "la persona en cuyo favor se libra, **o al portador**"), así que **no es un defecto formal** — es un riesgo económico: el cheque es al portador de hecho y lo cobra quien lo tenga. Si se pierde o se lo lleva quien no debe, no hay a quién oponerle nada.
- **Cheque en blanco firmado** (sin fecha, sin importe, sin beneficiario). El art. 8 protege al portador de buena fe aunque el cheque haya sido completado en forma contraria a lo acordado: quien firma en blanco asume el riesgo de que lo completen por cualquier importe. Guardar chequeras firmadas en blanco es exposición pura.
- **Cheque endosado**: quien endosa queda obligado; un cheque recibido y re-endosado a un proveedor sigue comprometiendo a la empresa si rebota.
- **CPD con fecha de pago lejana**: es deuda financiera disfrazada de pago. Va al forecast del mes que corresponde, nunca al mes en que se entregó.

## Caso de referencia verificado — 23/07/2026

Tres fotos reales del dueño. Detalle en `references/caso-2026-07-23.md`.

| # | Tipo | Nº | Emisión | Pago | Importe | Beneficiario | Qué hace el OS |
|---|---|---|---|---|---|---|---|
| 1 | **CPD** | 00000328 | 22/07/2026 | **22/08/2026** | $1.000.000 | **vacío** | Propone alta en `Cheques Emitidos` + **hallazgo** |
| 2 | **CPD** | 00000327 | 22/07/2026 | **22/09/2026** | $1.000.000 | **vacío** | Ídem, forecast de septiembre |
| 3 | Común | 00000062 | — (sin fecha) | — | — (sin importe) | vacío, **firmado** | **NO se carga**: no es una operación |

Comunes a los tres: Santander, cuenta 179-091383/6, CUIT 30716304643 ECHEGARAY CONSTRUCCIONES SAS, serie M. Los CPD son de la chequera `H17 C-VI/26`; el cheque en blanco, de la `H14-III/19` (Santander Río), con banda MICR legible `072-179-5400 7 / 00000062 8 / 00000913836 4`.

**Resultado de los controles sobre este lote:**

| Control | Resultado |
|---|---|
| Letras vs. números | `ok` en los dos CPD — "Un millón" manuscrito = $1.000.000. En el cheque en blanco, el "CEROCEROCERO…SEISDOS" del cuerpo **no es el importe**: es el número de cheque impreso en letras. No confundirlo con un importe de $0. |
| Plazo 360 días | `ok`: 31 y 62 días |
| Correlatividad | `ok`: 327 y 328 consecutivos, misma chequera |
| Duplicado | `ok`: no son los `Cheque debitado` del extracto (000000212–000000221, otra serie, $200.000/$300.000) |
| Firma | Los tres firmados |
| Beneficiario | **HALLAZGO en los tres**: renglón "PAGUESE A:" vacío |
| Dorso | `no_verificable`: sólo hay foto del frente |

**El hallazgo, tal como hay que informarlo:** dos CPD por $1.000.000 cada uno, **firmados y sin beneficiario** = $2.000.000 al portador de hecho circulando. En el registro el beneficiario queda `DESCONOCIDO` — no se infiere del proveedor que "debería" ser. Y hay un tercer cheque en blanco firmado, que no es una operación pero sí una exposición de la misma naturaleza.

## Normativa — verificada, con fuente y fecha

Verificado el **23/07/2026** contra el texto actualizado de la **Ley 24.452 (Ley de Cheques)** en InfoLeg (`servicios.infoleg.gob.ar/infolegInternet/anexos/10000-14999/14733/texact.htm`):

| Regla | Artículo | Contenido verificado |
|---|---|---|
| Importe en letras y números | **art. 2 inc. 5** | El cheque debe expresar la suma en letras y números; "cuando la cantidad escrita en letras difiriese de la expresada en números, se estará por la primera". |
| Requisitos del cheque común | **art. 2** | Denominación "cheque", número de orden impreso, lugar y fecha de creación, nombre del girado y domicilio de pago, orden de pagar suma determinada, firma del librador. |
| Beneficiario / al portador | **art. 6** (común) y **art. 54 inc. 6** (CPD) | Admite a persona determinada, a persona determinada con cláusula "no a la orden", o **al portador**. |
| Plazo de presentación del cheque común | **art. 25** | 30 días corridos desde la fecha de creación (60 si fue emitido en el exterior y es pagadero en el país). |
| Plazo máximo del CPD | **art. 54 inc. 4** | La fecha de pago no puede exceder los **360 días**. |
| Cheque incompleto / firmado en blanco | **art. 8** | Si se completa en forma contraria a los acuerdos, eso no puede oponerse al portador salvo mala fe. |
| Registración del CPD | **arts. 55 y 57** | El registro es opcional para el tenedor y justifica la regularidad formal; el rechazo de la registración produce los efectos del protesto. |
| Normas del cheque común aplicables al CPD | **art. 58** | Se aplican supletoriamente salvo lo que se oponga al capítulo del CPD — de ahí que el plazo de presentación de 30 días del art. 25 corra, en el CPD, desde la fecha de pago. |
| Prescripción | **art. 61** | Un año desde el vencimiento del plazo de presentación. |
| Rechazo | **art. 62** | El girado comunica el rechazo al BCRA, al librador y al tenedor. **Las multas que este artículo preveía fueron derogadas por la Ley 25.413** — no citar un porcentaje de multa de memoria; el régimen sancionatorio vigente es el que fija el BCRA. |

**Lo que NO está verificado y por eso no se afirma**: el listado oficial y vigente de causales de rechazo del BCRA (texto ordenado "Reglamentación de la cuenta corriente bancaria" / OPASI-2 / "Sistema Nacional de Pagos — Instrucciones operativas. Cheques"). Se localizaron las fuentes (`bcra.gob.ar`) pero no se leyó el texto ordenado completo en esta sesión. **Ninguna afirmación sobre multas, códigos de rechazo o plazos de retención preventiva se hace sin abrir esa fuente y citar su fecha de actualización.**

Regla permanente, igual que en `impuestos-construccion`: **ningún plazo, porcentaje o causal se cita de memoria**. Se verifica en la sesión y se registra fuente + fecha.

## Interacción con otras skills

| Situación | Cruzar con |
|---|---|
| Cómo leer la imagen, límites del OCR, trazabilidad de la extracción | `lectura-drive-documentos-multiformato` (esta skill es su caso especializado: define *qué* campos y *qué* controles; la otra define el método de lectura y el registro de lo no leído) |
| Qué hace ese cheque con la caja, cuándo sale, si hay que cubrirlo | `finanzas-tesoreria-construccion` |
| Cómo queda registrado y presentado en el Sheet | `google-sheets-business-systems` + `admin-finanzas-sheets-clase-mundial` |
| El cheque paga una factura de un proveedor | `compras-abastecimiento-subcontratacion`, y el cruce mecánico lo hace `cheques-cobertura.mjs` |
| Riesgo de un cheque recibido de un cliente (rebote, concentración) | `gestion-empresarial-riesgos` |
| Cheque rechazado con consecuencias legales | `derecho-construccion-contratos` + abogado real |
| Antes de todo lo anterior | `orquestador-de-razonamiento-y-skills` |

## Límites de certeza

- No puede afirmar que un campo dice X si la foto no lo muestra con nitidez: dice `DUDOSO` con la lectura probable, o `DESCONOCIDO`.
- No puede afirmar que un cheque **no** está endosado si sólo hay foto del frente.
- No puede afirmar que un cheque tiene fondos, ni que fue o será pagado: eso lo dice el banco (extracto / `cheques-emitidos-sync-banco.mjs`), nunca la imagen.
- No puede afirmar que la firma es válida — sólo que **hay** o **no hay** una firma. Verificar que corresponda a un firmante autorizado del banco no es una tarea de lectura de imagen.
- No puede decidir a qué obra o a qué factura corresponde el cheque: eso es un cruce contra Compras/ARCA, y si no matchea se declara pendiente, no se adivina.
- No puede resolver por sí sola una discrepancia entre letras y números, ni completar un beneficiario ausente.

## Gaps declarados

1. **Sin capacidad determinística todavía.** Hoy la lectura la hace el modelo mirando la foto. No hay un `orquestador/lib/cheques-imagen.mjs` con los controles ejecutables ni un test contra el lote del 23/07. Mientras eso no exista, **cada lote leído se revisa a ojo antes de cargar** y los controles se corren manualmente según esta skill. Es el próximo paso natural (el patrón skill-prosa → capacidad, ya usado en `control-administrativo`).
2. **La banda MICR no está decodificada.** Se transcribe tal cual (`072-179-5400 7 / 00000062 8 / 00000913836 4`) pero no se validan sus dígitos verificadores ni se usa como fuente independiente del número de cuenta. Se sabe que la estructura contiene banco-sucursal-plaza / número de cheque / número de cuenta, pero **la especificación del BCRA no se leyó**: no se afirma el significado posición por posición.
3. **Sin registro de chequeras.** La correlatividad se controla contra lo que ya está cargado en `Cheques Emitidos`, no contra un padrón de chequeras entregadas por el banco (rango desde–hasta, fecha de entrega, estado). Sin ese padrón no se puede detectar un cheque faltante de una chequera todavía no usada — que es exactamente el riesgo del caso del 23/07.
4. **Sin dorso.** Ninguna de las fotos recibidas incluye el reverso; el circuito de captura debería pedir frente **y** dorso para los cheques recibidos.
5. **Causales de rechazo del BCRA sin leer** (ver Normativa).
6. **Sin espejo en Supabase.** El destino hoy es el Sheet. Si el volumen crece, la fuente única debería ser una tabla, con el Sheet como vista — decisión de `arquitectura-integracion-finanzas-obras`, no de esta skill.

## Mecanismo de aprendizaje continuo

`OPERACIÓN → EVENTO → RESULTADO → DESVÍO → CAUSA → EVIDENCIA → PATRÓN → PROPUESTA → VALIDACIÓN SEGÚN RIESGO → INCORPORACIÓN → APLICACIÓN → MEDICIÓN`

Clasificación A–E antes de incorporar nada. Primer caso, del 23/07/2026: el número de cheque impreso en letras en el cuerpo ("CEROCEROCERO…SEISDOS") se puede confundir con el importe en letras y producir un cheque de $0 o un falso hallazgo de discrepancia — **observación aislada (A)**, ya incorporada como advertencia en la tabla de controles. Si vuelve a aparecer en otro banco o formato, pasa a B y merece un test en la capacidad determinística.

## Relación con el OS

- **Área**: Administración y Finanzas (tesorería).
- **Entrada**: fotos que manda el dueño (extensión / chat), o imágenes del data room.
- **Salida**: registro estructurado + lista de hallazgos → propuesta de alta en `Cheques Emitidos` (A TIPO, B número, E beneficiario, F monto, I fecha de pago, K DEBITADO — la columna M es el cruce del OS contra Compras, no se escribe a mano) o en `Cheques Recibidos` según el sentido del valor.
- **Autonomía**: leer y controlar es clase A/B (se puede hacer solo). **Escribir el cheque en el registro es clase E: requiere aprobación humana explícita**, porque compromete caja futura.
- **Centro de Acción**: cada hallazgo (beneficiario vacío, discrepancia de importe, plazo excedido, salto de numeración) debería convertirse en una acción con responsable, no quedar en un informe.

## Prohibido

No inventar un campo que la foto no muestra — ni el beneficiario, ni la fecha, ni el importe, ni el tipo de cheque. No asumir "cheque común" cuando el tipo no se leyó. No tomar el número de cheque escrito en letras como importe. No corregir sola una discrepancia entre letras y números. No dar por cargado un cheque sin verificar que no esté ya registrado. No afirmar que un cheque está o no endosado sin ver el dorso. No citar un plazo, una multa o una causal de rechazo sin verificarla en la sesión con fuente y fecha. No escribir en ninguna pestaña del Sheet desde esta skill. No silenciar un cheque firmado sin beneficiario: se informa siempre, aunque el dato haya salido completo.
