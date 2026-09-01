---
name: lectura-bancaria-impacto-sheet
description: "El OS SIEMPRE sabe leer información bancaria (extracto CSV, texto pegado o CAPTURAS de pantalla de banca online: saldos, movimientos, débitos/créditos, cheques/echeqs, impuestos, descubierto) y saber EXACTAMENTE qué impacta en la pestaña CAJA y en TODAS las demás pestañas del Sheet 'Flujo de Caja - Cash Flow'. Activar SIEMPRE que llegue un extracto, un resumen o una captura del banco, o antes de cargar movimientos bancarios al OS. Reusa el importador que ya existe (nunca reescribe el motor) y aplica el MAPA DE IMPACTO: qué evento bancario → qué pestaña/columna. Cruza con finanzas-tesoreria-construccion, google-sheets-business-systems, admin-finanzas-sheets-clase-mundial e impuestos-construccion."
license: MIT
allowed-tools: Read, Bash, Edit, Write, WebSearch
metadata:
  author: echegaray-os
  type: expert-domain
  area: "Administración y Finanzas — Tesorería"
  jurisdiccion-principal: "San Juan, Argentina"
---

# Lectura bancaria e impacto en el Sheet

## Propósito

Que el OS **siempre** sepa dos cosas cuando llega información del banco: (1) cómo **leerla** venga como venga —CSV descargado, texto pegado, o una **captura de pantalla** de la banca online— y (2) **exactamente qué toca en el Sheet "Flujo de Caja - Cash Flow"**, no sólo en CAJA. El dueño lo dijo textual: *"a diario y quizás dos veces por día te tengo que cargar los movimientos bancarios vía CSV o capturas de pantalla, y esto debe impactar en TODO el sheet conforme corresponde, no sólo en la pestaña CAJA"*.

El corazón de esta skill es el **MAPA DE IMPACTO**: para cada tipo de evento bancario, en qué pestaña y columna cae y por qué mecanismo. Ese mapa ya está construido en el código (fórmulas que cuelgan de `_BANCO_RAW`); esta skill lo hace **explícito, obligatorio y verificable**, y encapsula el uso correcto del importador que ya existe.

## Regla previa — NO se reescribe el motor, se reusa

El camino de carga **ya existe y funciona**. Esta skill NO construye un importador nuevo:

- **`orquestador/lib/tools/banco-extracto-tool.mjs`** — la capacidad XSAS (`banco.importar_extracto`,
  01/09/2026): el circuito ENTERO en una tool determinística —parseo, cadena de saldos, dedup, base,
  réplica `_BANCO_RAW`, DEBITADO probado— para que el extracto adjunto en /xsas o Mattermost se
  procese solo, sin modelo. Si la cadena no cierra, NO escribe.
- **`orquestador/scripts/importar-banco.mjs`** — la PUERTA: CSV o pegado → tabla `public.banco_movimientos` (con dedup en la base) → verificación de la cadena de saldos → recién ahí escribe.
- **`orquestador/lib/banco-importar.mjs`** — el parser puro (importe es-AR, fecha DD/MM, paréntesis = débito, back-fill de saldo intradía, cadena de saldos). Tiene 30 tests que cubren cada modo de falla silenciosa. **No tocar sin un defecto real y un test.**
- **`orquestador/lib/banco-santander.mjs`** — lo que declara el banco (cuenta, ACUERDO de descubierto, TARJETA, echeqs de terceros y emitidos) + `clasificarMovimiento` y `naturalezaIngreso`.
- **`orquestador/scripts/banco-raw-pestana.mjs`** — vuelca `banco_movimientos` a la pestaña réplica `_BANCO_RAW`, de donde cuelgan por fórmula CAJA, Impuestos y Cheques.

**Regla de oro del proyecto (inviolable): nunca correr un generador contra el Sheet real para "probar".** Para validar en frío se usa `orquestador/scripts/previsualizar-impacto-banco.mjs` (no escribe, no toca la base, no usa red) y `importar-banco.mjs --dry`.

## Cuándo activar

- Llega un extracto (CSV/Excel del homebanking), un texto pegado del listado, o una **captura de pantalla** de la banca online (saldo, movimientos, resumen de tarjeta, echeqs, acuerdo).
- Antes de cargar cualquier movimiento bancario al OS.
- Cuando hay que explicar/verificar qué se movió en el Sheet a partir del banco, o por qué un saldo de CAJA es el que es.

## Cómo LEER la información bancaria

### 1. Si es CSV o texto pegado
Pasa directo por el parser. `importar-banco.mjs archivo.csv` o `cat pegado.txt | importar-banco.mjs`. El parser ya resuelve las trampas es-AR (ver `references/trampas-es-ar.md`).

### 2. Si es una CAPTURA de pantalla (OCR)
Cruzar con **`lectura-drive-documentos-multiformato`** (metodología de OCR de imágenes). Del screenshot hay que extraer, según lo que muestre: **saldo declarado / saldo al corte**, **movimientos** (fecha, concepto, débito/crédito, saldo), **cheques/echeqs**, **débitos de impuestos**, **intereses/descubierto**. Producir un texto tabulado (fecha · concepto · importe · saldo, uno por línea) y pasarlo por el mismo parser.

> **TRAMPA #1 de las capturas — el signo por color.** La banca online muestra el débito **en rojo, sin signo menos**. Del OCR sale un número **positivo** y el parser lo toma como crédito: invierte el egreso y rompe el saldo. Al transcribir una captura, **aplicá el signo vos** (rojo/"enviada"/"débito" → negativo; verde/"recibida"/"crédito" → positivo) ANTES de pasar el texto al parser. La cadena de saldos lo atrapa **sólo si la captura trae la columna saldo**; en "Movimientos del Día" (sin saldo) no hay red — ahí el signo es tu responsabilidad.

Siempre **previsualizar en frío antes de importar**:
```bash
cat captura-ocr.txt | node orquestador/scripts/previsualizar-impacto-banco.mjs
```
Muestra qué se leyó, si la cadena cierra, y a qué pestañas impactaría. No escribe nada.

## EL MAPA DE IMPACTO (lo central)

Cada movimiento se clasifica por su concepto (`clasificarMovimiento`) y de ahí sale su destino. El mapa completo, con la línea de código de cada regla, está en **`references/mapa-de-impacto.md`** y **como dato verificable** en `orquestador/lib/impacto-bancario.mjs` (`DESTINOS` + `IMPACTO_UNIVERSAL`), con un test que garantiza que **ningún evento queda sin destino**.

| Evento bancario | Detección | Pestaña / columna destino | Mecanismo (fuente) |
|---|---|---|---|
| **Saldo de cuenta** (último declarado) | último saldo ≠0 de `_BANCO_RAW` | **CAJA** → Disponibilidades → Banco Santander (pesos) | `formulaUltimoSaldo(_BANCO_RAW!D)` — no un número pegado (`caja-posterior-al-corte.mjs`) |
| **Fecha de corte** | `MAX(_BANCO_RAW!A)` | **CAJA** → Fecha del saldo + ancla de "posteriores al corte" | `formulaFechaCorte` |
| **Impuesto Ley 25.413** (0,6%) | concepto → "Impuesto al cheque" | **Impuestos y Financieros** → §4 Otros impuestos, por mes | SUMPRODUCT sobre `_BANCO_RAW` (`impuestos-pestana.mjs`) |
| **Interés + IVA descubierto** | concepto → "Costo financiero del descubierto" | **CAJA** → §4.3 Costo del descubierto | SUMIFS por naturaleza; MAX(proyectado; real) — CFT ×1,12 verificado (`costo-descubierto.mjs`) |
| **Cuota préstamo prendario** | concepto → "Préstamo prendario" | **Impuestos y Financieros** → §6 Deuda financiera | SUMIF `_BANCO_RAW`, proyectada (`impuestos-pestana.mjs`) |
| **Cheque/echeq propio debitado** | por nº de echeq, estado del banco | **Cheques Emitidos** → columna DEBITADO (SI) | `cheques-emitidos-sync-banco.mjs` (fuente: `ECHEQS_EMITIDOS`) |
| **Cheque debitado post-corte** | DEBITADO=SI y fecha > corte | **CAJA** → línea neta posterior (resta) | `formulaChequesDebitadosPosteriores` |
| **Echeq de tercero** (custodia/endosado/cobrado) | estado del banco | **CAJA** → §4.1 Valores en cartera (sólo custodia suma) | `enCartera`/`endosados` (`banco-santander.mjs`) |
| **Acreditación = cobranza** | `naturalezaIngreso` → cobranza | **Cobranzas** (se CONCILIA, no se da de alta) | `ingresosPorNaturaleza` |
| **Acreditación = traslado** (depósito efectivo, echeq propio) | `naturalezaIngreso` → traslado | **CAJA** → alerta "efectivo sin depositar" | `naturalezaIngreso` |
| **Acreditación = financiero** (rescate Balanz) | CONTRAPARTES por CUIT | Ninguna (no es ingreso operativo) | `CONTRAPARTES` |
| **Compra pagada transf./débito post-corte** | Compras: Pagado + tipo + fecha>corte | **CAJA** → resta neta posterior | `formulaComprasPagadasPosteriores` |
| **Cualquier movimiento** | fila con signo (E) y naturaleza (F) | **`_BANCO_RAW`** (la réplica base) | `banco-raw-pestana.mjs` |

**La regla que gobierna todo:** un **débito** sale por la pestaña de su naturaleza; un **crédito** casi nunca se ESCRIBE en una pestaña —**el saldo del banco ya lo contiene**— y sólo se CONCILIA contra Cobranzas cuando su naturaleza es `cobranza`. Contar un crédito como ingreso nuevo **además** del saldo lo duplica (el error de los $11,9M de Balanz y los $16,2M de San Francisco).

## La conciliación

`saldo del extracto (al corte) + lo que se movió DESPUÉS del corte = saldo de hoy` (`caja-posterior-al-corte.mjs`). Detalles:
- **Dedup en la base** (índice único): las ventanas del extracto se superponen; duplicar un débito no da error, da un saldo equivocado.
- **Cadena de saldos**: `saldo(n) = saldo(n−1) + importe(n)` es una identidad — si no cierra, hay un typo, un movimiento faltante, o un signo mal leído. Ya encontró dos errores de transcripción reales.
- **Posteriores al corte**: NETO (cobros − cheques debitados − compras pagadas por transf./débito), sin los echeqs (ya están en Valores a depositar).

## Qué se automatiza y qué requiere criterio (gaps declarados)

**Automático y seguro (interno, reversible):** parseo, dedup, verificación de cadena, volcado a `_BANCO_RAW`, y el recálculo por fórmula de CAJA/Impuestos/Cheques. Cargar el extracto de movimientos es rutina.

**Requiere criterio / no está automatizado — declararlo, no inventarlo:**
- **Saldo USD, ACUERDO (descubierto), TARJETA, lista de echeqs de terceros y emitidos** viven como **constantes capturadas** en `banco-santander.mjs` (fotos del 21–22/07). Una **captura nueva** de la tarjeta, el acuerdo o los echeqs **NO** entra por el importador de movimientos: hoy requiere editar ese archivo (gap: no hay puerta para estos datos como sí la hay para los movimientos).
- **Naturaleza de un crédito nuevo** (cobranza vs traslado vs financiero): se resuelve por CUIT conocido; una contraparte nueva puede necesitar **confirmación del dueño** (así se confirmó Balanz = financiero). Sin confirmación es inferencia, no hecho.
- **El desglose de un débito de AFIP por impuesto**, la **tasa municipal** y **sellos**: no salen del concepto bancario. Son gaps declarados en la pestaña Impuestos, no se estiman.

## Procedimiento

1. **Identificar el formato** (CSV / pegado / captura). Si es captura, OCR con `lectura-drive-documentos-multiformato` y aplicar el signo por color (TRAMPA #1).
2. **Previsualizar en frío**: `previsualizar-impacto-banco.mjs` → confirmar que la cadena cierra y ver el impacto. Si la cadena no cierra, corregir el signo/importe ANTES de seguir.
3. **Importar**: `importar-banco.mjs archivo` (o `--dry` primero). Si la cadena no cierra, NO carga salvo `--igual-cargalo` con motivo declarado.
4. **Volcar a la réplica**: `banco-raw-pestana.mjs`. CAJA, Impuestos y Cheques se recalculan solos.
5. **Sincronizar el DEBITADO de echeqs** (si corresponde): `cheques-emitidos-sync-banco.mjs` (respeta el candado de pestaña).
6. **Respetar la guarda central**: si el dueño candó/editó CAJA, Impuestos o Cheques, el generador se auto-bloquea. No evadirla.

## Referencias

- `references/mapa-de-impacto.md` — el mapa completo con líneas de código.
- `references/trampas-es-ar.md` — coma decimal, DD/MM, paréntesis, signo por color, orden descendente.
- `orquestador/lib/impacto-bancario.mjs` — el mapa como dato (DESTINOS) con test del invariante.
- `orquestador/scripts/previsualizar-impacto-banco.mjs` — validación en frío.
