# Mapa completo del Sheet "Flujo de Caja - Cash Flow ECSAS"

**ID del Sheet:** `1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8`
**Fecha del mapeo:** 2026-07-29 · **Pestañas reales:** 24 (15 candadas + 9 sin candado)
**Método:** lectura directa del Sheet (metadata + `pestana-candado.mjs listar`) y de los generadores en `orquestador/scripts/*.mjs` + `orquestador/lib/*.mjs`. Read-only, sin escribir ni correr generadores.

El agente que reconstruye el archivo corre los pasos declarados en `orquestador/lib/flujo-caja-pasos.mjs` (`PASOS`), en orden — cada paso lee lo que escribió el anterior. Esa lista es la fuente de verdad de "qué script mantiene qué pestaña".

**Regla de oro estructural:** ninguna pestaña calculada pega números; todo es fórmula o celda con origen trazable. Cuando el insumo no está en el Sheet (ARCA, banco, JORNALES, DDJJ, F931, convenio UOCRA), se trae el **insumo** a una pestaña espejo `_RAW` declarada (con corte y fuente) y el cuadro lo referencia con fórmulas. Los generadores escriben con **fusión que preserva las ediciones del dueño** (`escribirPreservando` / `conEdicionesRespetadas`), no con clear+rewrite.

---

## Tabla por pestaña

| # (gid) | Pestaña | Rol | De dónde sale el dato | Conexiones salientes | ¿Candada? | Generador |
|---|---|---|---|---|---|---|
| 0 · `1666326819` | **Compras** | captura + cálculo | Carga manual por foto de comprobante vía `cargar-comprobantes-compras.mjs` (OCR → JSON → columnas del comprobante); cruce anti-duplicado contra ARCA. Columnas `AC` (Rubro de caja) y `AD` (Fecha de caja) las escribe `rubro-caja-sheet.mjs` por fórmula. Columnas `AC/AD/AE/AF/AJ` son ARRAYFORMULA abiertas. | Es la **fuente raíz de egresos**: alimenta Cash Flow Semanal/Mensual (por rubro), Proveedores/Materiales, Cargas Sociales, Estructura, Recurrentes, Impuestos (financiero/planes), CAJA; y `sync-compras.mjs` → `public.costos_obra`. | 🔒 Sí | carga: `cargar-comprobantes-compras.mjs`; columnas: `rubro-caja-sheet.mjs` |
| 1 · `1053281239` | **Tarjeta de Credito** | captura + control | Filas = carga manual (hecho primario, el OS no las toca). Bloque de control abajo lo escribe `tarjeta-control.mjs` cruzando contra el resumen del Santander (`lib/banco-santander.mjs`: `TARJETA`, `CORTE`). | Su total pendiente por mes → CAJA (margen/disponibilidad de tarjeta) y RESUMEN (cuando existía). | 🔒 Sí | `tarjeta-control.mjs` (solo el bloque de control) |
| 2 · `682675883` | **Jornales por Quincena** | cálculo | Fórmulas sobre los espejos `_J_OBREROS` y `_J_OFICINA` (nómina). Escala del convenio desde `_UOCRA_RAW` vía `lib/uocra-escala.mjs`. Ajuste inflación desde `Parámetros!$C$74:$C$90`. | Línea "Nómina · Jornales" del Cash Flow; `sync-caja-nucleo.mjs` (quincenas). Publica rangos con nombre. | 🔒 Sí | `jornales-pestana.mjs` |
| 3 · `1538388409` | **Cargas Sociales** | cálculo | Bloque "declarado" por fórmula sobre `_F931_RAW` (DDJJ F931). Pagado/planes/proyección por fórmula sobre Compras (columnas por encabezado, `lib/compras-columnas.mjs`). | Línea "Nómina · Cargas sociales" del Cash Flow. | 🔒 Sí | `cargas-sociales-pestana.mjs` |
| 4 · `657785237` | **Impuestos y Financieros** | cálculo | IVA por fórmula sobre `_ARCA_RAW` (comprobantes) y sobre la DDJJ oficial F.2051 (carpeta Drive IVA). IIBB por fórmula sobre `_IIBB_RAW` (DDJJ de Rentas San Juan, carpeta Drive IIBB). Financiero/planes por fórmula sobre Compras. Costo del descubierto e impuesto al cheque sobre `_BANCO_RAW`. | Calendario de impuestos (`⇒ IVA a pagar`, `⇒ IIBB a pagar`) que consumen las líneas del Cash Flow (`CALENDARIO_IMPUESTOS`). | 🔒 Sí | `impuestos-pestana.mjs` (escribe también `_IIBB_RAW`) |
| 5 · `1944370871` | **Recurrentes** | cálculo | Fórmula sobre Compras: rubro "Servicios recurrentes", solo lo que paga la Estructura, con proyección de rubros que aparecieron en ≥4 meses. | Proyección "Servicios recurrentes" → Cash Flow Mensual. | 🔒 Sí | `recurrentes-pestana.mjs` |
| 6 · `803345696` | **Estructura** | cálculo | Fórmula sobre Compras: sub-clasifica lo que Compras marcó como "Estructura" (`lib/sub-rubro-estructura.mjs`). Proyección = promedio de meses con gasto ajustado por inflación de `Parámetros` (REM/BCRA). | Línea "Estructura" del Cash Flow (sub-rubro "Equipos y rodados (inversión)" separado). | 🔒 Sí | `estructura-pestana.mjs` |
| 7 · `211873801` | **Materiales** | cálculo | Se genera junto con Proveedores desde Compras (qué se le compra a cada proveedor). | Vista de compras por proveedor/material; insumo de Proveedores. | 🔒 Sí | `proveedores-materiales-pestana.mjs` |
| 8 · `864283094` | **Proveedores** | cálculo | Cuenta corriente por proveedor por fórmula sobre Compras (738 filas) cruzada contra `comprobantes_arca` (Supabase / libros de IVA ARCA): deuda, cheques, plazo, nº comprobante y nº cheque. | Total deuda a proveedores → RESUMEN; plazo de pago (input de tesorería). | 🔒 Sí | `proveedores-materiales-pestana.mjs` |
| 9 · `581848348` | **Cobranzas** | captura + control | Filas = carga manual (hecho primario: qué se cobró, cliente/obra, fecha, estado). Bloque detector de duplicados/sin-fecha lo agrega `cobranzas-control.mjs` a la derecha (col Y+). | Es la **fuente raíz de ingresos**: las 3 líneas de ingreso del Cash Flow leen `Cobranzas!$5:$400`; CAJA referencia cheques de cartera por rótulo (`=Cobranzas!$M$…`). | 🔒 Sí | `cobranzas-control.mjs` (solo el control; datos = manuales) |
| 10 · `521135698` | **Cheques Recibidos** | captura + presentación | Captura de la pantalla eCHEQ/operaciones del Santander (`lib/banco-santander.mjs`). Posición NO se calcula acá: se referencia desde CAJA por rótulo (regla 9). | Banda "en cartera / depositado / endosado" (pesos); control contra el extracto. | 🔒 Sí | `cheques-recibidos-pestana.mjs` |
| 11 · `2120333371` | **Cheques Emitidos** | captura + presentación | Registro de cheques firmados; columna DEBITADO sincronizada contra el banco por `cheques-emitidos-sync-banco.mjs` (fuente única: el banco sabe si el echeq ya se pagó). Tramos de antigüedad (aging). | Corrección al saldo bancario (emitidos no debitados **bajan** la caja) → CAJA; total → RESUMEN. | 🔒 Sí | `cheques-emitidos-tablero.mjs` (+ `cheques-emitidos-sync-banco.mjs` para DEBITADO) |
| 12 · `749583421` | **CAJA** | cálculo + 1 dato manual | Disponibilidades: saldo del banco desde `_BANCO_RAW` / `lib/banco-santander.mjs`; caja chica/valores a depositar; TC y USD. **Única pestaña con un número cargado a mano** (saldos que no vienen de otra fuente), preservado por nombre de cuenta en cada corrida. Referencia Cheques Emitidos (−) y Recibidos (cartera). | Provee el **saldo inicial/disponibilidad** que ancla todo el Cash Flow; el motor de Ingeniería Financiera lo consume. | 🔒 Sí | `caja-pestana.mjs` |
| 13 · `825424599` | **Cash Flow Semanal** | presentación/cálculo | Fórmulas sobre las líneas de `lib/cash-flow-lineas.mjs`: egresos = partición de "Rubro de caja" de Compras; ingresos = Cobranzas; impuestos = calendario de Impuestos y Financieros; interés = costo del descubierto. Hipervínculos internos a la pestaña fuente de cada línea. | Vista semanal (53 semanas). Consumida por el motor financiero (via Supabase). | 🔒 Sí | `cash-flow-rehacer.mjs` (+ `lib/cash-flow-lineas.mjs`) |
| 14 · `212425236` | **Cash Flow Mensual** | presentación/cálculo | Igual que el Semanal, misma lista única de líneas (12 meses). | Vista mensual; `cheques-cobertura-sheet.mjs` marca qué cheques/tarjeta faltan cargar en Compras. | 🔒 Sí | `cash-flow-rehacer.mjs` (+ `lib/cash-flow-lineas.mjs`) |
| 15 · `448393891` | **01_Valores Iniciales** | captura/semilla | Saldos iniciales / valores semilla (carga manual, sin generador en el pipeline). Leído por CAJA y por `lib/reglas-de-oro.mjs`. | Ancla el saldo inicial del cálculo de caja. | ⚪ No | (manual — sin generador dedicado) |
| 16 · `1439428585` | **_UOCRA_RAW** | espejo (manual) | Copia fiel del acuerdo salarial UOCRA (CCT 76/75), pegada por una persona cuando sale un acuerdo nuevo. San Juan = ZONA A. | Escala del convenio → Jornales (control "¿pagamos por debajo del convenio?") vía `lib/uocra-escala.mjs`. | ⚪ No | (paste manual del acuerdo) |
| 17 · `2059144987` | **_J_OBREROS** | espejo | Snapshot del Sheet externo **JORNALES** (`1s0KlEURR5Udi7vvy-BmeqAi83lMRyqSCSsRjpiO5aXk`), refrescado sin IMPORTRANGE. Termina en error si el espejo no reproduce el original. | Nómina de obreros → Jornales por Quincena, Cash Flow. | ⚪ No | `espejar-jornales.mjs` (`lib/espejo-jornales.mjs`) |
| 18 · `1193745725` | **_J_OFICINA** | espejo | Ídem `_J_OBREROS`, personal de oficina (cobra por mes). | Nómina oficina → Jornales por Quincena. | ⚪ No | `espejar-jornales.mjs` |
| 19 · `1820729273` | **Parámetros** | parámetros | IPC/REM (inflación), TC y referencias que consumen otras pestañas. El IPC real INDEC se carga a `public.indice_economico` con `cargar-ipc-publicado.mjs` (no escribe la pestaña directamente). | Factor de ajuste por inflación → Jornales (`$C$74:$C$90`), Estructura, Recurrentes. | ⚪ No | (mixto manual/OS — sin generador dedicado en el pipeline del Cash Flow) |
| 20 · `2031565200` | **_ARCA_RAW** | espejo | Comprobantes de ARCA replicados desde Supabase (`comprobantes_arca`). Fila 1 declara corte, cantidad y fuente. Signo en columna aparte (NC = −1). | Base del IVA por fórmula → Impuestos y Financieros; cruce de Proveedores. | ⚪ No | `arca-raw-pestana.mjs` |
| 21 · `1621893441` | **_F931_RAW** | espejo | DDJJ F931 leídas de los PDF del data room (Drive, vía `drive_index`, `readPdfText` local, `parseF931`). | Bloque "declarado" por fórmula → Cargas Sociales. | ⚪ No | `f931-sheet.mjs` |
| 22 · `16442673` | **_BANCO_RAW** | espejo | Extracto del Santander dentro del Sheet: entra por `importar-banco.mjs` (pegás CSV/captura → `banco_movimientos` en Supabase) y `banco-raw-pestana.mjs` lo baja desde la DB. Fila 1 declara cuenta, corte y origen. | Disponibilidad de CAJA, impuesto al cheque y costo bancario de Impuestos, cruce de Cheques — todo por fórmula. | ⚪ No | `banco-raw-pestana.mjs` (puerta: `importar-banco.mjs`) |
| 23 · `2132864647` | **_IIBB_RAW** | espejo | DDJJ de Ingresos Brutos de San Juan (Rentas) leídas de los PDF de la carpeta Drive IIBB (`parsearDDJJ`, `alicuotaDeclarada`). | Cuadro IIBB por fórmula → Impuestos y Financieros. | ⚪ No | `impuestos-pestana.mjs` |

---

## Conexiones con Drive

| Recurso Drive | ID | Qué pestaña lo consume | Cómo |
|---|---|---|---|
| Carpeta **IVA** (DDJJ F.2051, `MM-2026.pdf`) | `1tLLahzfaTKZPbOi8M6IJLbAunFgappXx` | Impuestos y Financieros (IVA oficial) | Se lista la carpeta y se leen los PDF; el mes nuevo aparece solo al subirse |
| Carpeta **IIBB** (DDJJ de Rentas San Juan) | `1R0kTgCE35Q6AlLhjr0VB2ZAtusK1eO1W` | `_IIBB_RAW` → Impuestos y Financieros | Ídem: listar carpeta + parsear PDF (nº de control y fecha de presentación) |
| Sheet externo **JORNALES** | `1s0KlEURR5Udi7vvy-BmeqAi83lMRyqSCSsRjpiO5aXk` | `_J_OBREROS`, `_J_OFICINA` → Jornales por Quincena | Espejo con credencial propia del OS (reemplaza un IMPORTRANGE que quedaba en "Cargando…") |
| **PDF F931** en el data room | vía `drive_index` (`name ilike '%931%'`, `mime=pdf`) | `_F931_RAW` → Cargas Sociales | `readPdfText` local (0 API) + `parseF931` |

> Nota: los comprobantes de ARCA y los movimientos del banco NO se leen de Drive: viven en Supabase (ver abajo). Los PDF de compra sí se fotografían y cargan por foto a Compras.

---

## Conexiones con APIs / sistemas externos

| Sistema | Cómo entra el dato | Pestaña destino | Estado |
|---|---|---|---|
| **ARCA (AFIP)** — libros de IVA / comprobantes | Replicados en Supabase `comprobantes_arca`; `arca-raw-pestana.mjs` los baja a `_ARCA_RAW` | `_ARCA_RAW` → Impuestos, Proveedores | Sin API en vivo desde el Sheet: se sincroniza a Supabase y de ahí al Sheet |
| **Banco Santander Empresas** — extracto, saldos, tarjeta, echeqs | **No hay API de banca empresa contratada.** Puerta manual: `importar-banco.mjs` (pegás CSV/captura → `banco_movimientos`) → `_BANCO_RAW`. Constantes de saldo declarado, tarjeta, echeqs y descubierto siguen en `lib/banco-santander.mjs` (corte 22/07) | `_BANCO_RAW`, CAJA, Cheques Emitidos/Recibidos, Tarjeta, Impuestos | Semi-manual (captura/CSV) |
| **Supabase (Postgres)** | Fuente/espejo de `comprobantes_arca`, `banco_movimientos`, `drive_index`, `indice_economico`; y destino de `sync-compras.mjs` (→ `costos_obra`), `sync-caja-nucleo.mjs`, y toda la capa del motor financiero | Ida y vuelta con casi todas las pestañas | Activo |
| **INDEC (IPC)** | `cargar-ipc-publicado.mjs` verifica el IPC publicado y lo carga a `public.indice_economico` (reemplaza expectativas REM por dato firme) | Parámetros → Jornales/Estructura/Recurrentes | Carga verificada manual |
| **Calendario Financiero** (motor de tesorería) | `sync-calendario-financiero.mjs` y siguientes materializan `public.finanzas_calendario` + modelo de liquidez / comparador / priorización a partir del Sheet ya regenerado | La **Web** lee esas tablas, nunca el Sheet ni recalcula | Activo (salida, no fuente) |
| **UOCRA (convenio)** | Paste manual del acuerdo salarial en `_UOCRA_RAW` | Jornales (control de convenio) | Manual |

---

## Qué falta para máxima autonomía (gaps)

Ordenados por impacto sobre la autonomía real del Flujo de Caja.

### 1. El banco todavía depende de carga manual (el gap más caro y más frecuente)
- **No hay API de banca empresa del Santander.** El extracto entra por `importar-banco.mjs` (pegar CSV o captura), a diario y a veces dos veces por día. Sin eso, `_BANCO_RAW` envejece y con él la disponibilidad de CAJA, el impuesto al cheque, el costo del descubierto y el cruce de cheques.
- Peor: **saldo declarado, detalle de tarjeta, echeqs y acuerdo de descubierto siguen hardcodeados en `lib/banco-santander.mjs`** con corte fijo (22/07). El importador cubre los *movimientos*, pero estos otros insumos sólo se actualizan editando código.
- **Qué automatizaría:** integración/scraping legítimo de banca empresa Santander, o al menos mover tarjeta/echeqs/acuerdo a una réplica declarada con corte, para sacarlos del `.mjs`. Impacto: elimina el trabajo manual diario de mayor frecuencia y cierra el riesgo de "caja que miente despacio".

### 2. Ingresos y gastos primarios se cargan a mano (Cobranzas y Compras)
- **Cobranzas** (raíz de todos los ingresos) es 100% carga manual; el OS solo agrega un detector de duplicados. **Compras** se carga por foto de comprobante (bueno, pero manual y dependiente de OCR).
- La contracara ARCA ya existe (`comprobantes_arca`): hoy se usa para *cruzar/auditar* Compras y Proveedores, no para *poblar*. Falta cerrar el lazo de conciliación automática ARCA↔Compras (71 comprobantes que estuvieron "faltando" fueron error de cruce, no de carga) y explorar poblar egresos desde ARCA.
- **Qué automatizaría:** matching automático ARCA→Compras que proponga la fila a cargar; para Cobranzas, un ingreso semi-estructurado (no existe hoy una fuente única de cobros).

### 3. Insumos que se leen/pegan a mano y pueden congelarse sin gritar
- **DDJJ IVA (F.2051) e IIBB**: dependen de que alguien suba el PDF a las carpetas Drive; si no se sube, el mes falta (visible, pero manual).
- **`_UOCRA_RAW`** (convenio) y **`01_Valores Iniciales`** y **`Parámetros`**: sin generador dedicado en el pipeline — se actualizan a mano. `Parámetros` mezcla manual con el IPC que sí carga el OS a Supabase, pero la pestaña en sí no la regenera ningún paso.
- **F931**: depende de que el PDF esté en el data room y sea texto (un F931 escaneado no parsea → mes faltante).
- **Qué automatizaría:** alertas de frescura por insumo (varias ya existen); un generador declarado para `Parámetros` que traiga IPC/TC/REM desde Supabase; y detección de "PDF escaneado" que pida el archivo con texto.

---

### Apéndice — orden del pipeline (`lib/flujo-caja-pasos.mjs`)
`espejar-jornales` → `jornales-pestana` → `columnas-calculadas` → `banco-raw-pestana` → `arca-raw-pestana` → `rubro-caja-sheet` → `recurrentes-pestana` → `cash-flow-rehacer` → `proveedores-materiales-pestana` → `estructura-pestana` → `impuestos-pestana` (+`_IIBB_RAW`) → `f931-sheet` (`_F931_RAW`) → `cargas-sociales-pestana` → `cobranzas-control` → `cheques-cobertura-sheet` → `tarjeta-control` → `cheques-emitidos-sync-banco` → `cheques-recibidos-pestana` → `cheques-emitidos-tablero` → `caja-pestana` → formato/reparación/auditoría → `sync-compras` / `sync-caja-nucleo` → motor financiero (`sync-calendario-financiero`, `sync-modelo-liquidez`, `sync-comparar-financiamiento`, `sync-priorizar-pagos`, `sync-condiciones-financieras`, `sync-plan-tesoreria`, `sync-estrategia-financiera`).

> `RESUMEN` tenía su generador (`resumen-pestana.mjs`) pero el paso está **retirado del pipeline**: el dueño eliminó la pestaña y se respeta esa decisión. El script sigue en el repo.
