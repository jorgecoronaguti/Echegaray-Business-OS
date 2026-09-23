# PLAN · Compras y Caja: de «manda el Sheet» a «manda Postgres»

_23/09/2026 · rama `efectivo-a-rendir` · estado: PLAN, nada aplicado · precedente: el corte del módulo
Herramientas (21/09/2026)._

Este documento no propone «sincronizar mejor». Propone el mismo corte que ya se hizo una vez: **una
migración da vuelta la dirección del dato, el sync viejo se retira, y no hay vuelta.** Lo que hoy es
fuente pasa a ser vista generada.

Cada afirmación va clasificada. **HECHO** = está escrito en el repo (archivo y, cuando existe, la
fecha de la medición que lo dejó ahí). **CÁLCULO** = derivado de esos hechos. **INFERENCIA** =
lectura mía del diseño, discutible. **DESCONOCIDO** = no lo pude verificar desde acá, con el comando
que lo resolvería. Ningún número de este documento se midió contra el Sheet vivo ni contra la base
viva: el encargo era un documento, no tocar datos. **Todos los números citados son los que el código
dejó escritos el día que se midieron, y hay que volver a medirlos antes de ejecutar.**

---

## 0 · El precedente: qué se hizo exactamente en Herramientas

**HECHO** (`supabase/migrations/20260921T2100_herramientas_activos.sql`,
`20260921T2110_herramientas_tiempo_real.sql`, `orquestador/scripts/sync-herramientas.mjs`). Orden del
dueño, textual, citada en la migración: *«todo debe funcionar por bd nada de sheet»*. El corte fue:

1. **Tablas nuevas nativas** (`activo`, `activo_movimiento`, `activo_incidencia`, `ubicacion`) con
   RLS de sólo lectura y **ninguna policy de escritura**: la única puerta son funciones
   `security definer`. La ubicación no se puede cambiar con un `UPDATE`: se inserta un movimiento.
2. **Lo viejo se renombra a `*_legado` y en su lugar queda una VISTA con las mismas columnas**, para
   que los consumidores que todavía no se migraron sigan leyendo sin cambios.
3. **El sync se retira en el mismo corte.** `sync-herramientas.mjs` quedó como un archivo que imprime
   «retirado el 21/09/2026» y sale con 0 — no se borró **sólo porque la unidad systemd lo sigue
   invocando** y su ausencia dejaría la unidad en `failed` cada ciclo.
4. **Los triggers de aviso se rehacen** sobre las tablas nuevas: una vista no emite eventos, y sin eso
   lo que el jefe carga en el teléfono no aparece en la oficina hasta que alguien recarga.
5. La migración **la aplica el dueño**, no un agente (así está escrito en la cabecera).

**INFERENCIA.** Las cinco piezas son el patrón completo, y las cinco aplican a Compras y a Caja. La
diferencia de escala es que Herramientas no tenía fórmulas de terceros colgando: Compras y CAJA
tienen el archivo entero colgando de ellas (§4).

---

## 1 · Qué manda hoy, medido

**HECHO** (`.claude/MAPA.md` § «Fuentes de verdad», `.claude/rules/sheets.md`,
`orquestador/lib/pestanas-auxiliares.mjs`).

| Pestaña | Quién la escribe hoy | Estado |
|---|---|---|
| `Compras` | **una persona** (y el bot/app escribiendo celdas por cola) | FUENTE |
| `Cobranzas` | una persona | FUENTE |
| `CAJA` | `scripts/caja-pestana.mjs` | **ya es salida**, salvo el arqueo |
| `_MOVIMIENTOS` | `scripts/libro-movimientos-pestana.mjs` | ya es salida |
| `_BANCO_RAW` | `scripts/banco-raw-pestana.mjs` desde `banco_movimientos` | **ya es Postgres→Sheet** |
| `_EFECTIVO_RAW` | `scripts/efectivo-raw-pestana.mjs` desde `efectivo_entrega/_devolucion` | **ya es Postgres→Sheet** |
| `Parámetros`, `01_Valores Iniciales`, `SUBCONTRATISTAS`, `_UOCRA_RAW`, `_PAGOS_NO_COMPRA_RAW` | una persona | FUENTE, declarada en `SIN_GENERADOR` |

**Esto cambia la forma del trabajo.** No hay que inventar el patrón: `_BANCO_RAW` y `_EFECTIVO_RAW`
ya son exactamente lo que Compras y CAJA tienen que llegar a ser — *«si el insumo no está en el
archivo, se trae el INSUMO, no se pega el RESULTADO»*
(`orquestador/scripts/banco-raw-pestana.mjs`, 21/07/2026).

**Y cambia la prioridad.** CAJA ya es una vista generada. El problema de Caja **no es CAJA**: es que
lo que la alimenta (`_MOVIMIENTOS`) se arma leyendo nueve rangos del Sheet, y de esos nueve el
verdaderamente humano es `Compras` (y `Cobranzas`, fuera de alcance). **CÁLCULO: Caja no se puede
cortar antes que Compras; cortando Compras, Caja queda a un paso.**

---

## 2 · COMPRAS

### 2.1 · Qué tabla pasaría a ser la verdad, y qué queda como vista generada

**HECHO.** Hoy existe `public.compra_sheet` (`20260825T1200_compras_la_pestana_entera.sql`): réplica
fiel de la pestaña, fila por fila, **clave primaria = el renglón**, se borra y se reescribe entera en
cada sync, **sin ninguna policy de escritura** y con el comentario que dice «la FUENTE sigue siendo
el Sheet». `public.costos_obra` es su proyección («tiene obra asignada y mueve plata»), también de
sólo lectura desde `20260820T4000`.

| | Hoy | Después del corte |
|---|---|---|
| Verdad de un gasto | pestaña `Compras` | **`public.compra`** (tabla nueva, nativa) |
| `compra_sheet` | espejo del Sheet, PK = renglón | **se retira**, o queda como VISTA sobre `compra` con las mismas columnas (patrón `*_legado`) |
| `costos_obra` | proyección del espejo | VISTA sobre `compra`, sin cambiar su regla de admisión |
| pestaña `Compras` | fuente | **VISTA GENERADA** por un `compras-pestana.mjs` nuevo, sólo lectura, regenerable, con la fila 1 declarando de dónde salió y a qué hora |

**Por qué una tabla nueva y no «abrirle escritura a `compra_sheet`»** (INFERENCIA, apoyada en el
diseño ya escrito): su PK es el renglón, que es una **posición**, no una identidad — la propia
migración lo dice: el «ID» de la columna A es `=ROW()-4` y *«nada se ata a él»*. Una tabla que manda
necesita identidad estable (`id uuid`), y además necesita columnas que el espejo no tiene porque el
Sheet no las tiene: quién cargó, cuándo, con qué evidencia, y el historial de cambios.

**La escritura entra por funciones, no por policies** (precedente Herramientas). Ya hay dos puertas
construidas y probadas que sirven de base: `public.compra_pago_registrar(...)`
(`20260916T1700_compra_cambio_columna.sql`) y `public.compra_obra_asignar(fila, valor, esperado)`
(`20260915T0700_obra_por_fila.sql`), las dos `security definer`, las dos con bloqueo de fila y
control de «la fila no cambió desde que la pantalla la miró». **Hoy esas funciones guardan y
ENCOLAN**; después del corte guardan y listo — la cola desaparece.

**Qué NO se toca:** `Cobranzas` (fuera de alcance y es la otra mitad del libro), `Parámetros`,
`01_Valores Iniciales`.

### 2.2 · Lo importante: qué escribe hoy la gente en Compras que la app NO puede hacer

**HECHO** (`orquestador/lib/comprobantes/contrato-columnas.mjs`, el contrato A→AN declarado por
rótulo, con test). La pestaña tiene cuatro naturalezas de celda: `CARGADOR` (la escribe el bot o la
app desde el comprobante), `FORMULA_FILA`, `ARRAYFORMULA` y **`PERSONA`** (*«la completa una persona
con su desplegable»*). Y una quinta categoría declarada con nombre: `pisaElCargador`, las dos
fórmulas que el cargador sobreescribe a propósito.

**HECHO** de lo que la app sí cubre hoy, verificado en el código:

| Acción | Puerta | Columnas que llegan al Sheet |
|---|---|---|
| Cargar un comprobante (PDF/foto) | `comprobante_entrada` → worker → `carga-comprobantes.mjs` | las `CARGADOR`: Categoría, Fecha factura, Proveedor, Modalidad, Tipo, N° Comprobante, Unidad de Negocio, Cliente/Asignación, Detalles, Concepto, Importe, IVA, Tipo pago |
| Imputar a obra | `compra_obra_asignar` → `compra_obra_cambio` → `comunicacion/compras/cola-obra.mjs` | «Obra» (Compras L) |
| Registrar / deshacer un pago | `compra_pago_registrar` → misma cola | Monto Pagado, Total o Parcial, Fecha prevista de pago 2, Monto Parcial 2, Estado, Tipo pago (`orquestador/lib/pagos-de-compra.mjs`) |
| Colgar el papel | `compra_adjunto` (tabla nativa) | no toca el Sheet |

**Y esto es lo que la app NO puede hacer hoy. Si el corte se hace sin resolverlo, rompe la
operación:**

| # | Lo que una persona escribe en el Sheet | Quién lo toca | Estado en la app | Gravedad |
|---|---|---|---|---|
| 1 | **Crear una fila SIN comprobante**: pago de sueldos, impuestos, anticipos, retiros | el dueño / administración, tipeando la fila entera | **no existe**. La única puerta de alta es «subir un archivo» (`CargarComprobante.tsx`: el archivo va al bucket y la fila a la cola). No hay alta manual | **BLOQUEANTE** |
| 2 | **«Tipo de Costo»** (Directo / Indirecto / Estructura) | el dueño, con su desplegable | **no existe**. Declarada `PERSONA` en el contrato; ningún script la escribe (única excepción histórica: el llenado autorizado de celdas vacías del 18/09) | **BLOQUEANTE** — alimenta el costo de obra por tipo (`20260918T1530`) |
| 3 | **«Estado Carga»** | una persona | **no existe**. Declarada `PERSONA` | alta |
| 4 | **«Fecha prevista de pago (día)»** puesta a mano | una persona, pegando un serial encima de la fórmula | **no existe** salvo de rebote al registrar un pago. El contrato lo declara textual: *«tiene un serial pegado en 524 de 897 filas desde el origen: es el vencimiento real que pone una persona. Quien la "repare" en masa borra 353 vencimientos reales»* (medido 25/08/2026) | **BLOQUEANTE** — es el insumo del Cash Flow y del aging |
| 5 | **Anular una fila** (escribir `ELIMINADO` en Estado y poner los importes en cero) | el dueño | **no existe** como acción. El espejo la replica con `anulada`, pero no hay forma de provocarla | alta |
| 6 | **Corregir una fila ya cargada** (proveedor mal leído, importe, fecha, concepto, unidad de negocio) | quien detecta el error | **no existe**. La app sólo escribe obra y pago; el resto se corrige tipeando en el Sheet | **BLOQUEANTE** |
| 7 | **«Fecha prevista de pago 2» y «Monto Parcial 2»** fuera de un pago registrado | una persona | parcial: sólo llegan como efecto de `compra_pago_registrar` | media |
| 8 | Mover/reordenar filas, dejar la fila vacía en vez de borrarla | el dueño | no aplica (desaparece con el corte, y eso es bueno) | — |

**CÁLCULO.** De las ~40 columnas del contrato, la app cubre hoy **las 13 del cargador más 6 de
pago/obra**. Las cuatro `PERSONA` no están cubiertas **ninguna**, y el alta manual —el caso que la
propia migración del espejo midió en **212 de 882 filas sin número de comprobante al 25/08/2026**, y
`AccionesCompra.tsx` volvió a medir en **236 de 889 sin clave al 05/09/2026**— tampoco.

**Traducido: entre el 24 % y el 27 % de las filas de Compras no se pueden ni siquiera crear desde la
app.** Ése es el tamaño real del trabajo previo al corte, y no es «una pantalla más»: es la pantalla
de alta manual de un gasto, con su validación y su permiso.

**DESCONOCIDO — y hay que medirlo antes de ejecutar:** cuántas filas de los últimos 90 días se
crearon sin comprobante, cuántas celdas `Tipo de Costo` / `Estado Carga` se tocaron en ese período, y
cuántas fechas previstas se pegaron a mano. Los tres se resuelven sin tocar nada con:

```bash
node orquestador/scripts/auditar-espejo-compras.mjs --peores 50 --json   # sólo lectura, Sheet vs espejo
node orquestador/scripts/censo-numeros-pegados.mjs                       # cuántos números pegados y dónde
node orquestador/scripts/reparar-formulas-compras.mjs                    # abre el Sheet vivo y NO escribe
```

Y sobre la base, `select count(*) from public.compra_sheet where clave is null and fecha > current_date - 90`.

### 2.3 · El corte de Compras, una sola vez

**INFERENCIA** (el orden es mío; el patrón de cada paso es el de Herramientas).

| # | Paso | Qué lo prueba |
|---|---|---|
| 0 | **Construir lo que falta en la app** (§2.2 items 1, 2, 4, 5, 6). Nada de esto es parte del corte: es su precondición | las pantallas existen y una persona distinta de quien las construyó cargó un gasto sin comprobante, lo corrigió y lo anuló |
| 1 | Migración A: `public.compra` con `id uuid`, la identidad `clave`, y **todas** las columnas del contrato, incluidas las cuatro `PERSONA`. Sin policies de escritura; las funciones existentes (`compra_pago_registrar`, `compra_obra_asignar`) pasan a escribir `compra` y **dejan de encolar** | la migración se aplica en ensayo y después de verdad (`aplicar-migracion.mjs`), y se verifica leyendo la base |
| 2 | **Carga inicial: una sola vez, del Sheet a `compra`.** No es un sync: es la foto de fundación, con su corrida registrada | fila por fila contra `compra_sheet` de ese instante: total de filas, suma de `total`, suma de `monto_pagado`, cuenta por `estado`. Cero diferencias o no se sigue |
| 3 | **CONGELAR la pestaña `Compras`.** Se le avisa a quien carga, y se pone el candado de pestaña — acá sí corresponde, porque deja de ser un documento vivo: pasa a ser una vista | la celda de título dice «VISTA GENERADA · no editar · el gasto se carga en app.ecsas» con la hora de generación |
| 4 | El bot y la app escriben **sólo Postgres**. `carga-comprobantes.mjs` deja de escribir celdas | un comprobante cargado por Mattermost aparece en `compra` y **no** toca el Sheet (`sheet-diff-snapshot.mjs` sin diferencias en Compras) |
| 5 | **Retirar** `sync-compras.mjs`, `echegaray-compras-sync.timer`, la rama Compras de `echegaray-sonda-flujo-caja`, `echegaray-compras-obra-cola.timer` y `compra_obra_cambio`. Los archivos quedan como stub que sale 0, igual que `sync-herramientas.mjs`, hasta que las unidades dejen de invocarlos | `systemctl --user list-timers` y ninguna unidad en `failed` después de 24 h |
| 6 | `compras-pestana.mjs` nuevo: **genera** la pestaña desde `compra`, con las ARRAYFORMULA del dueño intactas y el resto como valores. Entra a `flujo-caja-pasos.mjs` en la posición donde hoy está `rubro-caja-sheet.mjs` | `auditar-duenos-pestanas.mjs` ya no lista `Compras` en `SIN_GENERADOR`; `sheet-diff-snapshot.mjs` sin «borradas» ni «fórmula→valor» |
| 7 | `_MOVIMIENTOS` deja de leer el rango `Compras!A1:AN` y lee `public.compra` | el libro da el **mismo** total que la corrida anterior: `auditar-cuadre-cash-flow.mjs` y `auditar-cobertura-cash-flow.mjs` |

**Qué se congela:** la pestaña `Compras` (candado de pestaña, no de celda). **Qué NO se congela:**
`Cobranzas`, `Parámetros`, y las ARRAYFORMULA del dueño dentro de Compras, que siguen siendo suyas y
el generador no escribe (`COLUMNAS_DEL_DUENO` en el contrato).

**El comando de verificación del día después**, en este orden:

```bash
node orquestador/scripts/sheet-diff-snapshot.mjs          # el efecto sobre la hoja, no el intento
node orquestador/scripts/auditar-duenos-pestanas.mjs      # ¿Compras tiene dueño y uno solo?
node orquestador/scripts/auditar-cuadre-cash-flow.mjs     # ¿el libro sigue cuadrando?
node orquestador/scripts/auditar-cobertura-cash-flow.mjs  # ¿cuánta plata dejó de llegar a un cash flow?
node orquestador/scripts/auditar-doble-conteo-compras.mjs # ¿alguna compra resta dos veces?
node orquestador/scripts/canario-fuente-unica.mjs         # web vs chat sobre los mismos conceptos
node orquestador/scripts/auditar-coherencia-pestanas.mjs  # el control del dueño
```

**El control que NO sirve después del corte:** `auditar-espejo-compras.mjs` compara la pestaña contra
el espejo. Cuando la pestaña **es** el espejo, ese control se valida contra la información que
produce y deja de decir que no. Hay que reescribirlo o retirarlo explícitamente — no dejarlo dando
verde.

---

## 3 · CAJA

### 3.1 · Qué pasaría a ser la verdad

**HECHO.** CAJA ya es una pestaña **generada** (`scripts/caja-pestana.mjs`, la grilla entera en
`lib/caja-grilla.mjs`, construida y verificada en frío). Su espejo en Postgres ya existe:
`public.caja_sheet_foto` / vista `caja_sheet_vigente`, escrito por `scripts/sync-caja-espejo.mjs`
(`20260918T1500_caja_espejo_de_la_pestana.sql`), y la vista Caja de Analíticas lo lee de ahí.

**CÁLCULO: Caja está al revés de Compras.** Hoy el circuito es
`Sheet → CAJA (generada) → foto en Postgres → app`. La foto es una **imagen de la pestaña dibujada**,
no el dato. Cortar Caja significa que el dato viva en Postgres y la pestaña se dibuje desde ahí:

| | Hoy | Después del corte |
|---|---|---|
| El libro de movimientos | pestaña `_MOVIMIENTOS`, armada leyendo 9 rangos del Sheet | **`public.flujo_movimiento`** (ya existe, `20260903T0500`), calculada con el mismo núcleo puro `lib/libro-movimientos.mjs` pero desde tablas |
| Las disponibilidades y el arqueo | celdas de CAJA, el arqueo tipeado | **tabla nueva `caja_conteo`** (el arqueo sellado) + `banco_movimientos` + `efectivo_entrega/_devolucion` |
| `caja_sheet_foto` | espejo de la pestaña dibujada | **se retira**: la app deja de leer una foto y lee el dato |
| Pestaña `CAJA` | salida | **sigue siendo salida**, sin cambio de naturaleza |
| `_MOVIMIENTOS`, `_CAJA_ANEXO`, `Cash Flow Semanal/Mensual` | salidas que leen el Sheet | salidas que leen Postgres |

**INFERENCIA.** Esto no exige una tabla nueva grande: `flujo_movimiento`, `flujo_periodo` y
`flujo_corrida` ya son la materialización del libro, y el comentario de esa migración ya dice el
principio («una definición, dos materializaciones»). Lo que cambia es **quién es el original**.

### 3.2 · Qué escribe hoy la gente en el circuito de Caja que la app NO puede hacer

**HECHO.** De la cabecera de `scripts/caja-pestana.mjs`: *«es la ÚNICA pestaña del archivo donde se
carga un número a mano (el arqueo)»*, y por eso el generador lo rescata **por el nombre de la
cuenta**, no por número de fila, antes de reescribir.

| # | Lo que una persona escribe | Dónde | Estado en la app | Gravedad |
|---|---|---|---|---|
| 1 | **El arqueo de efectivo en pesos y en dólares** (`CAJA_ARQUEO_ARS/_USD` + su fecha) | celdas de CAJA | **no existe**. Hay un *centinela* que detecta cuándo apareció el número (`20260815150000_caja_conteo_observado.sql`) **precisamente porque no hay registro de la carga**: eso es un termómetro, no una puerta | **BLOQUEANTE** |
| 2 | **El saldo Balanz** (inversiones ARS/USD) | celdas de CAJA | DESCONOCIDO si hoy entra por `balanz-runtime.mjs` o a mano — memoria del dueño: «Balanz, dejalo» | alta |
| 3 | **El tipo de cambio declarado por la empresa** («Dólar declarado, opcional») | celda de CAJA | no existe | media |
| 4 | **DEBITADO en Cheques Emitidos** | pestaña `Cheques Emitidos` | parcial: `cheques-emitidos-sync-banco.mjs` lo sincroniza para los echeq; el resto es manual | alta |
| 5 | **Pagos sin compra** (retiros de Dirección, SAC en efectivo) | `_PAGOS_NO_COMPRA_RAW`, cargada con `--file pagos.json` | no existe en la app: es un JSON y un script | alta |
| 6 | `Parámetros`, `01_Valores Iniciales`, `SUBCONTRATISTAS`, `_UOCRA_RAW` | pestañas de captura | no existe ninguna | media (cambian poco) |

**CÁLCULO.** El arqueo es el único que no tiene sustituto posible: es un **hecho del mundo físico**
—alguien contó los billetes— y el OS no puede derivarlo de nada. `caja-efectivo-fisico.mjs` ya lo
dice con números: el 99,5 % del efectivo que entra se vuelve a ir en efectivo (medido 31/07/2026:
$137.935.305,73 cobrados contra $137.291.028,34 pagados), así que **una «Caja en pesos» calculada sin
arqueo no existe**. Antes de cortar Caja hay que darle al arqueo una pantalla con sello: quién contó,
cuándo, cuánto, y en qué moneda.

**Lo bueno:** el patrón ya está construido y en producción desde el 22/09 — Efectivo a rendir
(`efectivo_entrega` / `efectivo_devolucion` en Postgres, `_EFECTIVO_RAW` como réplica generada). El
arqueo es el mismo caso con una tabla más chica.

### 3.3 · El corte de Caja

| # | Paso | Qué lo prueba |
|---|---|---|
| 0 | **Compras ya cortado.** Sin eso el libro sigue leyendo el Sheet y no se gana nada | §2.3 cerrado y firmado |
| 1 | Pantalla de **arqueo** con sello (persona, instante, importe, moneda) → tabla `caja_conteo`. El centinela del conteo pasa a ser un control *sobre* la tabla, no un detective | un arqueo cargado en la app aparece en la base y en CAJA sin que nadie tipee una celda |
| 2 | Migración: `caja_conteo` + puerta `security definer`. `caja_sheet_foto` **no se toca todavía** | ensayo, aplicación, lectura del efecto |
| 3 | `libro-movimientos.mjs` (núcleo puro, ya testeado en frío) se alimenta de tablas en vez de rangos. **El núcleo no se reescribe**: cambia el borde que le pasa las filas | el libro nuevo da el **mismo** total que el viejo sobre la misma fecha: comparación de `firmaDelLibro` |
| 4 | `caja-pestana.mjs` toma sus disponibilidades de Postgres (incluido el arqueo) y deja de rescatar celdas tipeadas | `caja-conectividad.mjs`, `caja-graficos-verificar.mjs`, `caja-residuo-del-rediseno.mjs` |
| 5 | La app deja de leer `caja_sheet_vigente` y lee el dato. **Recién entonces** se retira `sync-caja-espejo.mjs` y `echegaray-caja-espejo.timer` | la vista Caja de Analíticas muestra los mismos importes que la pestaña, con el espejo apagado |

**Qué se congela:** nada más que lo ya congelado. CAJA ya no se edita (salvo el arqueo, que pasa a la
app). **Qué NO se congela:** `Cheques Emitidos` y `_PAGOS_NO_COMPRA_RAW`, que siguen siendo captura
humana hasta que tengan su propio corte.

```bash
node orquestador/scripts/caja-conectividad.mjs
node orquestador/scripts/caja-graficos-verificar.mjs
node orquestador/scripts/auditar-saldo-banco.mjs
node orquestador/scripts/auditar-conexion-flujo.mjs
node orquestador/scripts/auditar-rangos-fosilizados.mjs
node orquestador/scripts/sheet-diff-snapshot.mjs
```

---

## 4 · Qué se rompe

**HECHO** salvo donde se indique.

### 4.1 · Generadores y pasos del pipeline

`orquestador/lib/flujo-caja-pasos.mjs` declara el pipeline entero. Los pasos que **nombran a Compras
como fuente o le escriben columnas** y por lo tanto hay que rehacer o retirar:

| Paso | Qué hace hoy | Qué pasa |
|---|---|---|
| `rubro-caja-sheet.mjs` | escribe «Rubro de caja» de Compras — *«de acá cuelga todo lo demás»* | pasa a ser una columna calculada de `compra` |
| `compras-saldo-pendiente.mjs` | «Saldo pendiente (OS)» | idem |
| `proveedores-aging-columna.mjs` | «Tramo de vencimiento (OS)» | idem |
| `proveedores-cuenta-corriente.mjs` | «CUIT (OS)» + `_PROVEEDORES_OS` | idem |
| `freno-derrames-compras.mjs` | vigila que las ARRAYFORMULA de Compras derramen | **pierde sentido**: no puede quedar dando verde |
| `columnas-calculadas.mjs` | informa celdas calculadas pisadas a mano | idem |
| `cruce-arca-pestana.mjs`, `materiales-pestana.mjs`, `proveedores-*` (7 pasos), `obras-raw-pestana.mjs`, `cargas-sociales-pestana.mjs`, `estructura-pestana.mjs`, `impuestos-pestana.mjs` | leen Compras por fórmula o por rango | **cambian de fuente**, no de lógica |
| `libro-movimientos-pestana.mjs` | lee 9 rangos, entre ellos `Compras!A1:AN` (`RANGOS_FUENTES`) | cambia de fuente |
| `sync-compras.mjs`, `sync-flujo-fondos.mjs`, `sync-caja-espejo.mjs` | Sheet → Postgres | **se retiran** (stub que sale 0, patrón `sync-herramientas.mjs`) |

### 4.2 · Timers y servicios

**HECHO** (`orquestador/systemd/`, `.claude/MAPA.md` § Producción: 14 timers, 7 servicios).

- **Se retiran:** `echegaray-compras-sync.timer`, `echegaray-compras-obra-cola.timer`,
  `echegaray-caja-espejo.timer` (en el paso 5 de §3.3).
- **Cambian:** `echegaray-sonda-flujo-caja.timer` — hoy mira la versión de Drive cada minuto para
  disparar el sync de Compras **y** las notas «Qué hacer» de Proveedores. Pierde la mitad de su
  trabajo, no toda.
- **Siguen:** `echegaray-flujo-caja.timer` (ahora genera Compras además de las demás),
  `echegaray-comprobantes-web.timer`, `echegaray-comunicacion-*`.
- **Trampa ya pagada, aplica acá:** los servicios de comunicación **no corren del árbol principal**
  (`~/echegaray-os/produccion/echegaray-os`, rama `main`). Mergear y reiniciar sin el `pull` no
  despliega nada. El bot que escribe Compras es uno de ésos.

### 4.3 · El bot

`orquestador/comunicacion/comprobantes/` + `lib/carga-comprobantes.mjs` escriben celdas de la pestaña
con el contrato de columnas. **INFERENCIA:** es el cambio de mayor superficie del corte, porque el
bot es la puerta de entrada real del gasto y su escritura está enredada con `GRUPOS_FORMULA`,
`LETRAS_ARRAYFORMULA` y el estampado de fórmulas por fila. Al escribir Postgres, **todo ese aparato
desaparece** — no se porta, se borra. Lo que sobrevive es el trío de cruces (proveedor por CUIT, obra,
duplicado) y el registro de idempotencia por `clave`, que no dependen del Sheet.

### 4.4 · Tests

Los que **tienen que cambiar o morir con el corte** (si siguen verdes sin tocarse, algo no se cortó):

- `orquestador/lib/comprobantes/contrato-columnas.test.mjs` — congela la medición de las columnas.
- `orquestador/scripts/auditar-espejo-compras.mjs` y `lib/compras-espejo-auditoria.mjs` — comparan
  pestaña contra espejo.
- `orquestador/lib/flujo-caja-pasos.test.mjs` y `flujo-caja-pasos-sin-dueno.test.mjs`.
- `orquestador/lib/pestanas-auxiliares.mjs` — `Compras` sale de `SIN_GENERADOR`, y el test estático
  que exige motivo declarado se pone rojo si no se saca.
- `orquestador/lib/libro-movimientos.test.mjs`, `caja-espejo.test.mjs`, `caja-pestana*.test.mjs`.
- **DESCONOCIDO**: cuántos tests exactamente. Se resuelve con
  `rg -l "compra_sheet|Compras!|caja_sheet" --glob '**/*.test.*' | wc -l`. **No correr
  `npm run orq:test` para averiguarlo**: una corrida por VM, y la segunda corrida miente.

### 4.5 · Fórmulas del Sheet y enlaces

**Esto es lo que más fácil se subestima.** Al pasar `Compras` de «pestaña que una persona escribe» a
«pestaña regenerada», **todas las fórmulas de terceros que la citan por rango siguen funcionando
sólo si el generador respeta el ancho, el orden y la primera fila de datos**.

- **Dos tablas dinámicas nativas** sobre `Compras!A3:AL932` alimentan `Deuda viva (OS)`
  (`pestanas-auxiliares.mjs`, medido 14/08/2026). Una dinámica sin espacio da `#REF!`, y una con
  rango corto **miente despacio sin un solo error**. El censo verifica ese aire en cada corrida:
  `MANTENIDAS_POR_DINAMICA`.
- **Las ARRAYFORMULA viven en la fila 4 y derraman**: escribir aunque sea `""` en una de ellas
  *«no rompe una fila, rompe la columna entera desde la fila 4»*. Un generador que rehace la pestaña
  tiene que escribir el ancla y nunca el derrame.
- **La columna H de `_MOVIMIENTOS`** va como **fórmula viva** contra la columna Estado de Compras, a
  propósito: *«un estado pegado convertía cada pago del dueño en un dato de ayer»*. Después del corte
  el estado ya no cambia por una celda tipeada, así que esa fórmula **debe** volverse valor — y eso
  es un cambio de significado que hay que declarar, no dejar pasar.
- **Rangos con nombre**: `CAJA_ARQUEO_ARS/_USD`, los de nómina que el cash flow lee «exactamente»,
  `DESDE_CAJA`. Se reapuntan solos al insertar filas, pero un generador que **borra y rehace** los
  puede dejar apuntando a celdas vacías. Lo mira `auditar-rangos-fosilizados.mjs`.
- **Locale es-AR**: toda fórmula escrita por API lleva `;`, y el formato va en US. No es teoría: ya
  dio `#ERROR!`.
- **`compra_adjunto.fila_compras` es un número de renglón**, y el ID de la pestaña es `=ROW()-4`. Con
  la identidad en `compra.id`, ese vínculo hay que migrarlo a la clave, no dejarlo apuntando a una
  posición que después del corte deja de significar lo mismo.

---

## 5 · Riesgos, por gravedad

| # | Riesgo | Por qué es real | Mitigación |
|---|---|---|---|
| 1 | **Cortar Compras antes de que la app cubra el alta manual, la corrección y `Tipo de Costo`** | entre 24 % y 27 % de las filas no se pueden crear desde la app (§2.2). Quien carga se queda sin dónde cargar **el mismo día** | §2.3 paso 0 es precondición, no paso. Y lo firma quien carga, no quien construye |
| 2 | **Cortar Caja sin pantalla de arqueo** | el arqueo es un hecho físico que no se deriva de nada. Sin él «Efectivo en pesos» no existe | §3.3 paso 1 |
| 3 | **El corte se hace y el sync viejo sobrevive**, escribiendo encima | ya pasó el equivalente: un permiso cuyo efecto se evapora es peor que no tenerlo (`20260820T4000`). Dos escritores sobre el mismo dato, sin nadie que sepa cuál gana | retirar timer **y** dejar el stub que sale 0, en el mismo corte, verificado con `list-timers` |
| 4 | **La migración va adelante del código** | 18/09: una migración sin mergear dejó $22,6 M invisibles en la app | migración **después** de mergear; el código sin migración degrada con aviso, no rompe (patrón ya escrito en `20260918T1500`) |
| 5 | **Una fórmula de tercero se rompe en silencio**: dinámica corta, derrame partido, rango fosilizado | no da error, da un número menor | `sheet-diff-snapshot.mjs` + `auditar-rangos-fosilizados.mjs` + `auditar-duenos-pestanas.mjs` en cada corrida del día después |
| 6 | **Un control se queda validándose contra lo que produce** | `auditar-espejo-compras.mjs` compara la pestaña con su propio espejo: después del corte da verde siempre | retirarlo o reescribirlo **en el mismo commit** que el corte |
| 7 | **La base crece y Postgres se cae** | 13/09: 3 caídas con la base en 406 MB; hoy Small 2 GB | medir el tamaño de `compra` + `flujo_movimiento` antes; podar corridas viejas como ya hace `caja_sheet_foto` (14 días) |
| 8 | **Un worker se cuelga sin morir** | 10/09: 23 h colgado con `Restart=always`, porque nunca murió | todo proceso nuevo de larga duración con `crearLatido` / `esConexionPerdida` (salida 75) |
| 9 | **Se pierde el historial de quién editó qué** | hoy el Sheet no lo registra tampoco (Drive poda el historial); el centinela existe por eso | el corte **mejora** esto: es un argumento a favor, no un riesgo |

---

## 6 · El orden recomendado, y por qué

**RECOMENDACIÓN.**

1. **Primero la pantalla de alta y corrección de un gasto en la app.** No es parte del corte: es lo
   que lo hace posible. Sin esto todo lo demás es teoría, y con esto solo ya se gana —la carga deja
   de depender de que alguien tenga el Sheet abierto—. **Es también el único paso reversible.**
2. **Después Compras.** Es la fuente humana real, es la que alimenta el libro, y tiene el espejo, el
   contrato de columnas y las dos funciones de escritura ya construidos y probados. Es el corte con
   más apalancamiento por unidad de riesgo.
3. **Después el arqueo.** Tabla chica, pantalla chica, patrón ya en producción desde el 22/09
   (Efectivo a rendir).
4. **Después Caja**, que a esa altura es casi sólo cambiar de dónde lee el libro.
5. **Cobranzas queda fuera de este plan**, y hay que decirlo: es la otra mitad del libro y su corte es
   un documento propio. Mientras `Cobranzas` siga siendo del Sheet, el Cash Flow sigue teniendo un pie
   en el archivo — **el corte de Compras y Caja no termina el trabajo, lo deja a la mitad más difícil.**

**Por qué no al revés.** Cortar Caja primero no quita al Sheet del medio: `_MOVIMIENTOS` seguiría
leyendo `Compras!A1:AN`. Sería mover la pestaña sin mover el dato — actividad, no progreso.

**El costo de oportunidad, dicho:** el trabajo grande de este plan (§2.3 paso 0) es una pantalla de
carga de gastos. Si esa pantalla no se va a construir, **el corte no se puede hacer y este documento
no habilita nada**. La alternativa honesta en ese caso no es «cortar igual»: es dejar Compras en el
Sheet, aceptar el espejo, y gastar el esfuerzo en Cobranzas o en otra cosa.

---

## 7 · Lo que este documento NO verificó

- **Nada se midió contra el Sheet vivo ni contra la base viva.** Todos los conteos son los que el
  código dejó escritos (25/08, 05/09, 14/08, 31/07 de 2026) y **hay que volver a medirlos**.
- **No sé cuántas filas de Compras se crean hoy sin comprobante por mes.** Es el número que decide si
  el paso 0 es una pantalla chica o un módulo. Se resuelve con
  `select date_trunc('month', fecha), count(*) from public.compra_sheet where clave is null group by 1 order by 1 desc limit 6`.
- **No sé si el saldo Balanz de CAJA lo carga hoy una persona o `balanz-runtime.mjs`.** Se resuelve
  leyendo `orquestador/scripts/balanz-runtime.mjs` y `lib/caja-disponibilidades.mjs` juntos, o
  preguntándole al dueño en una línea.
- **No sé cuántos tests dependen del contrato de columnas.** `rg -l` lo contesta; no corrí la suite a
  propósito (una corrida por VM, y no era necesaria para escribir esto).
- **Ningún número de plata de este documento se usó para decidir nada**, y ninguna de sus tablas es
  un permiso para escribir en el Sheet.

---

## SIGUIENTE PASO

Medir el punto ciego que decide el tamaño de todo: **cuántas filas de Compras de los últimos 6 meses
se crearon sin comprobante, y quién las creó.** Es una consulta de sólo lectura sobre
`public.compra_sheet` y no toca nada. Con ese número el dueño decide si el paso 0 se hace; sin ese
número, el resto del plan no se ejecuta.
