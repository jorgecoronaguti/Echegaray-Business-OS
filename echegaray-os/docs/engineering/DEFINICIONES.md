# DEFINICIONES — un concepto, una fuente

_Creado el 10/09/2026 · hito H1 de `PRP-REALIDAD-UNICA.md` · cubre 6 de los 22 conceptos críticos._

Esto es la cara humana de `orquestador/datos/definiciones.json`. El `.json` lo lee un test
(`src/shared/definiciones/canonico-definiciones.test.ts`, dentro de `npm run orq:test`) que barre
`src/`, `orquestador/` y `scripts/` y **pone rojo cuando un archivo lee una fuente que dejó de ser
la canónica**. Los dos archivos se cambian juntos: el test exige correspondencia 1:1 y falla si el
documento pierde una sección o gana una que el registro no tiene.

**Por qué existe**, en palabras del dueño (10/09/2026): _«la info que se lee de la base no es
uniforme; te tengo que referenciar pestañas puntuales porque toda la info no es consistente en toda
la plataforma. Esto no puede suceder»_. «Lo contratado de un cliente» tenía **cinco** definiciones
vivas; cada una se corrigió pantalla por pantalla y ninguna de esas correcciones impidió la
siguiente, porque arreglar una pantalla no deja nada que se ponga rojo.

**Cómo se agrega una lectura.** Si lee la canónica, no hay nada que hacer. Si lee una fuente
prohibida, se declara la excepción **con su motivo** en el `.json` y su línea en este documento, en
el mismo cambio. Si cambia la canónica, primero se cambia el registro: el test dice después qué
quedó leyendo la vieja.

**Lo que este control NO puede ver.** Es estático: no ve una consulta con el nombre de la tabla en
una variable, ni un `rpc()` cuyo cuerpo vive en SQL, ni una lectura por HTTP. Para eso está
`orquestador/scripts/canario-fuente-unica.mjs`, que compara en runtime lo que dice cada cara. Un
verde acá prueba que ninguna puerta cerrada se volvió a abrir, no que no haya otra.

**Las excepciones con `hasta`** son deuda declarada: la lectura está mal y se sabe, pero corregirla
es de otro hito. Cuando ese hito cierra, la excepción se borra y el test verifica que la lectura
haya desaparecido de verdad.

---

## `contratado`

| | |
|---|---|
| **Fuente primaria** | public.cliente_economia.contratado (cliente) · public.obra_economia_cartera.contratado (obra) |
| **Propietario** | `orquestador/scripts/obras-economia-sync.mjs`, paso del pipeline del Flujo de Caja |
| **Criterio** | Lo que la pestaña OBRAS publica por obra —OC de Cobranzas en pesos > U$S × TC > suma viva de sus filas—, sumado por cliente sobre sus obras **no fusionadas**. Es venta **neta**, sin IVA. |
| **Ventana** | Acumulado. `contratado_en_curso` recorta a las obras `activa`. |
| **Consumidores** | `/clientes` (lista y panel lateral), ficha del cliente, esquema de pago (pantalla 32), portal (vía `cliente_economia_para_portal()`), ficha de obra |
| **Confianza** | **D** · conocimiento interno validado |
| **Última decisión del dueño** | 08/09/2026: «en la pestaña OBRAS están los montos contratados y los valores de costeo; agregarlos en Clientes». Pendiente: **D1** del PRP (qué es contratado con OC parciales y adicionales). |

**NULL nunca es 0.** Una obra sin precio en OBRAS no vale cero: no se sabe. La pantalla escribe
«sin precio en OBRAS».

### Lo prohibido

- `cliente_panel[^\n]*contratado` — `cliente_panel` dejó de publicar `contratado` el 10/09/2026
  (migración `20260910T2110`). Sumaba `obra_panel.monto_contratado` —el campo del formulario de la
  obra, que nadie carga— y publicaba **$31.846.475** de Messina, los de sus cinco obras **cerradas**,
  al lado de una lista que decía **$156.174.253**.
- `from\('obra_panel'\)[^;]*monto_contratado` — esa columna es `contratado_de_obra()`, o sea el
  campo del formulario. Era el **respaldo** de cuatro pantallas, y por eso las cuatro podían
  discrepar.
- `from\('obra_canonica'\)[^;]*monto_contratado` — la misma columna, leída de la tabla.
- `contratado_de_obra\(` — la función que lee ese campo. Sigue viva porque `obra_panel` la usa.

### Las excepciones

| Archivo | Por qué | Hasta |
|---|---|---|
| `src/features/obras/services/actions.ts` | **Escribe** `obra_canonica.monto_contratado`: es el formulario de la obra, el productor del campo | — |
| `src/app/portal/(dentro)/datosObra.ts` | El portal muestra el contrato **en la moneda en que se firmó** (dueño: «que diga eso, 63 más IVA en el footer» — Quattropani se firmó por U$S 63.000). Publicar el valuado en pesos sería mostrarle al cliente un número distinto del contrato firmado: Nivel E | decisión **D1** |
| `src/features/obras/services/preparacionService.ts` | Pantalla de **obra**; el alcance de H1 es el contratado del **cliente** | **H1-obras** |

---

## `facturado`

| | |
|---|---|
| **Fuente primaria** | public.cliente_economia.facturado_90d (vía public.cliente_cuenta_corriente) |
| **Propietario** | vista sobre `public.cobranzas`, que escribe `orquestador/scripts/sync-cobranzas.mjs` |
| **Criterio** | Total bruto de las filas de Cobranzas emitidas en la ventana, con `cliente_id` resuelto y estado distinto de `CANCELAR`. Es **devengado** y no se mezcla con lo cobrado. |
| **Ventana** | **90 días** desde la fecha de emisión. **Provisoria**: la decisión **D2** del PRP (90 días o acumulado por obra) sigue abierta, y por eso la ventana va en el **nombre** de la columna. |
| **Consumidores** | cuenta corriente del cliente (pantalla 28), `cliente_economia` |
| **Confianza** | **C** · patrón probable: la ventana la eligió la vista, no el dueño |
| **Última decisión del dueño** | ninguna. **D2** abierta. |

**Por qué la columna no se llama `facturado` a secas.** Porque el conflicto \#2 del inventario es
exactamente ése: dos caras sumando lo mismo y creyendo que hablan de la misma ventana. Mientras D2
esté abierta, el nombre lleva la ventana.

### Lo prohibido

- `from\('certificado_cliente'\)[^;]*monto` — `certificado_cliente.monto` es la **copia** que el
  sync del portal hace de una fila de Cobranzas. Sumarla es contar la copia, y deja afuera todo lo
  facturado que no pasó por el portal (una fila `N`, no facturada, ni siquiera se ofrece).
- `certificados'\)[^;]*monto_facturado` — `public.certificados` es el ciclo certificar → facturar →
  cobrar de la **obra** y está **vacía** (0 filas, medido el 25/08/2026). Un facturado sumado de ahí
  da 0 y afirma que no se facturó nada.

### Las excepciones

| Archivo | Por qué | Hasta |
|---|---|---|
| `src/features/clientes/services/cuentaCorrienteService.ts` | Dibuja el **plan de cobranza**: los certificados uno por uno. El total sale de la vista | — |
| `src/features/clientes/services/cuentaCorrienteActions.ts` | **Escribe** el cobro de un certificado registrado a mano | — |
| `src/features/portal/services/portalActions.ts` | **Escribe** la aprobación u observación del cliente | — |
| `src/features/portal/services/portalService.ts` | La cara del cliente: le muestra **sus** certificados, no un total | — |
| `src/features/clientes/services/clientesService.ts` | Línea de tiempo de la ficha: qué pasó y cuándo, no un total | **H6** |
| `src/features/obras/services/contratoService.ts` | Solapa Contrato de la **obra**: su ciclo, no el facturado del cliente | **H6** |
| `src/features/obras/services/actionsContrato.ts` | **Escribe** el certificado de la obra | — |

---

## `cobrado`

| | |
|---|---|
| **Fuente primaria** | public.cliente_economia.cobrado_total / cobrado_neto_total (cliente) · public.obra_cobranza.cobrado / cobrado_neto (obra) |
| **Propietario** | `public.es_cobrada(estado, fecha_cobro)` — el predicado · `public.cobranzas` — el dato |
| **Criterio** | **Percibido.** Una fila está cobrada si su estado dice cobrado (sin importar mayúsculas ni espacios) **y** su fecha de cobro no es futura. `cobrado_total` es bruto (lo que entra al banco); `cobrado_neto_total` es sin IVA y es el **único** comparable contra el contratado. Por obra vale lo mismo: `obra_cobranza.cobrado` es bruto y `obra_cobranza.cobrado_neto` es el que se divide por lo contratado. |
| **Ventana** | Acumulado. `cobrado_90d` existe aparte y lleva su ventana en el nombre. |
| **Consumidores** | barra de cobro de `/clientes`, cuenta corriente, `pendiente_contractual`, Cash Flow |
| **Confianza** | **D** · el predicado replica la columna U del Sheet y el control de cobros con fecha futura que ya hacía `repasar-cobranzas-y-caja.mjs` |
| **Última decisión del dueño** | 10/09/2026: el cobro lo declara Cobranzas y nada lo sobreescribe. |

**Un solo predicado, desde el 10/09/2026.** `obra_cobranza` decía
`lower(btrim(estado)) = 'cobrado' and (fecha_cobro is null or fecha_cobro <= current_date)` y
`cliente_cuenta_corriente` decía `estado = 'Cobrado'`. Diferían en la comparación (una celda tipeada
«cobrado» contaba como cobro en una vista y como deuda en la otra) y en la fecha futura. Se adoptó
el que **no afirma plata que todavía no entró**, y vive en `public.es_cobrada()`.

### Lo prohibido

- `from\('certificado_cliente'\)[^;]*estado` — esa columna guarda **dos** cosas: dónde está el cobro
  (lo copia el sync desde Cobranzas por `cobranza_fila`) y qué dijo el cliente del documento
  (`aprobado`, `observado`, `en_disputa`). Leerla como fuente del cobro es leer una copia: hasta el
  10/09/2026 la factura 01-00000225 de Messina figuraba cobrada en el Sheet y `emitido` acá, y la
  ficha ofrecía reclamar plata ya percibida.
- `Cobranzas!\$?A\$?[0-9]+:` — leer las **filas** de la pestaña por rango es saltear la réplica
  `public.cobranzas`: quien lo hace no ve `cliente_id`, no ve la valuación de moneda (la columna
  Moneda es la **AA** y estos rangos llegan hasta la R o la Q) y vuelve a decidir por su cuenta qué
  está cobrado. La fila 62 de Quattropani, U$S 15.400, entraba como $15.400.

### Las excepciones

**Productores y controles del Sheet** (permanentes): `orquestador/lib/cobranzas-contrato.mjs`
(define el rango y las columnas), `cobranzas-replica.mjs` (produce `public.cobranzas`),
`cobranzas-cuadre-vivo.mjs` (cuadra la copia contra el original),
`orquestador/scripts/repasar-cobranzas-y-caja.mjs` (control sobre la pestaña que el dueño edita),
`portal-sembrar.mjs` (produce `certificado_cliente`), `cobranzas-san-francisco-anticipos.mjs`
(escribe en la pestaña), `auditar-cobertura-cash-flow.mjs` y `caja-conectividad.mjs` (su objeto de
estudio **es** el archivo).

**Caras del cliente** (permanentes): `src/features/clientes/services/cuentaCorrienteService.ts` y
`src/features/portal/services/portalActions.ts`.

**Deuda declarada — los que leen el rango en vez de la réplica**, y que el hito **H2** («moneda en
todos los lectores») tiene que cerrar:

| Archivo | Hasta |
|---|---|
| `orquestador/scripts/impuestos-pestana.mjs` · `orquestador/lib/impuestos-fuentes.mjs` | H2 |
| `orquestador/scripts/cruce-banco.mjs` · `orquestador/scripts/fechas-vs-extracto.mjs` | H2 |
| `orquestador/lib/calendario-financiero.mjs` · `orquestador/lib/cash-briefing.mjs` | H2 |
| `scripts/sync-calendario.mjs` · `src/features/flujo-caja/services/calendarioReader.ts` | H2 |
| `orquestador/scripts/proveedores-materiales-pestana.mjs` · `libro-movimientos-pestana.mjs` | H2 |
| `src/features/portal/services/portalService.ts` (estado del certificado) | H4 |

**El paso siguiente que H1 NO dio.** `certificado_cliente.estado` sigue siendo una columna escrita
por el sync (`estadoAGuardar` en `orquestador/lib/portal/cobranzas-a-cliente.mjs`) y no una vista
derivada de `cobranzas`. Convertirla exige **separar las dos mitades de la columna** —el cobro, que
lo declara el Sheet, y la aprobación, que la pone el cliente— en dos columnas, y migrar el portal,
la ficha y el esquema. Se evaluó y se dejó: el riesgo es perder la aprobación del cliente, que es un
dato que sólo existe acá. Mientras tanto el cobro **sí** viene de Cobranzas por `cobranza_fila`, que
era el defecto grave. Queda para **H4**.

**Divergencia conocida y no cerrada:** `estadoDePago()` en `cobranzas-a-cliente.mjs` marca cobrada
una fila con fecha futura, que es lo contrario de `es_cobrada()`. Alinearlo cambia lo que **ve el
cliente** en el portal y no se hizo desde un hito interno.

---

## `pendiente_vencido`

| | |
|---|---|
| **Fuente primaria** | public.cliente_economia.pendiente_contractual · .vencido · .por_vencer · .saldo |
| **Propietario** | `public.cliente_cuenta_corriente` (vencido, por vencer, saldo) · `public.cliente_economia` (pendiente contractual) |
| **Criterio** | **Vencido** es la definición de la columna U del propio Sheet: no cobrado (`Pendiente` o `Facturado`) y la fecha de la columna Q ya pasó. `Proyectado` es previsión del dueño y **nunca** es deuda. **Pendiente contractual** es contratado − cobrado **neto** —neto contra neto, porque el contratado no lleva IVA— y es NULL si falta cualquiera de los dos. |
| **Ventana** | Acumulado, por fecha de cobro. |
| **Consumidores** | cuenta corriente (aging, DSO), ficha del cliente, `/clientes` |
| **Confianza** | **D** para vencido (copiado de la fórmula del Sheet) · **CÁLCULO** para `pendiente_contractual`, que nace el 10/09/2026 y todavía no lo miró el dueño |
| **Última decisión del dueño** | ninguna sobre `pendiente_contractual`. En el inventario del PRP figuraba como **SIN FUENTE**. |

**Un cliente sin filas en Cobranzas no cobró $0: no se sabe.** Por eso `pendiente_contractual` es
NULL y no el contrato entero.

### Lo prohibido

- `cliente_panel[^\n]*(vencido|pendiente|saldo|costo_real)` — `cliente_panel` no publica economía
  desde el 10/09/2026. Una pantalla que le pida el saldo recibe `undefined`, que en JavaScript no
  falla: dibuja un hueco donde debería ir plata.
- `contratado\s*-\s*coalesce\(\s*cobrado` — la resta a mano en SQL fuera de la vista. Es el punto
  donde vuelve el defecto de mezclar bruto con neto.

### Las excepciones

Ninguna.

---

## `gremial_pagada`

| | |
|---|---|
| **Fuente primaria** | public.banco_movimientos (réplica _BANCO_RAW del Flujo de Caja), apareado contra la boleta de _UOCRA_DDJJ_RAW por orquestador/lib/cargas-pagos-banco.mjs |
| **Propietario** | `orquestador/lib/cargas-pagos-banco.mjs` (el apareo) · `importar-banco.mjs` (el extracto) · `uocra-raw-pestana.mjs` (la boleta) |
| **Criterio** | Una obligación gremial está pagada cuando **un débito de la cuenta la cancela**. Fondo de Cese: por el período que el propio banco escribe en el concepto (`Acreditacion fondo desempleo 082026`). UOCRA: por importe contra el «Total determinado» de la boleta — un débito dentro de **$1**, o el **único** subconjunto de DEBIN libres que suma exacto. Se cubre **hasta lo declarado y nunca más**. |
| **Ventana** | Por período **devengado** (`YYYY-MM`), como nombra la obligación la cadena de Cargas Sociales — no por el mes en que salió la plata. |
| **Consumidores** | la cadena de «Cargas Sociales» → `_MOVIMIENTOS` → las tres vistas del cash flow |
| **Confianza** | **C** · patrón probable |
| **Última decisión del dueño** | 10/09/2026: los gremiales **no se cargan en Compras**, «tienen pestañas especiales donde esto tiene que quedar registrado». |

**La precedencia, escrita:** `banco > Compras «Pagado» > boleta declarada > proyección de la cadena`.
Compras **no se apagó**: es la única fuente que cubre enero–agosto 2026, cuando los gremiales
todavía se cargaban ahí. Quedó como **secundaria**.

**Se resta, no se apaga el mes.** La boleta de agosto declara $2.374.397,18 (UOCRA $994.941,26 +
Fondo de Cese devengado $1.379.455,92) y el banco muestra $2.155.341,26 (el DEBIN del 10/09 más las
quince acreditaciones de fondo de desempleo de ese día, $1.160.400). Dar el mes por pagado
escondería **$219.055,92** de Fondo de Cese declarado que ninguna acreditación respalda.

**Lo que este criterio NO puede probar**, y por eso se declara al lado del número:

- **IERIC y FODECO** no se declaran en la boleta de UOCRA y en el extracto llegan sin período
  (`Merpago*ieric`, `Pago de servicios - Ieric`, de $13.191 a $47.670): no hay importe declarado
  contra el cual aparearlos. Siguen dependiendo de Compras.
- **El lote de Fondo de Cese del 18/08/2026** ($2.481.098,40, 35 acreditaciones) llegó con período
  `000000`: el banco no dice de qué mes es y ninguna suma de devengados lo reproduce. No se le
  atribuye período.
- **El CUIT 30-70774398-7**, al que el DEBIN del 19/08 le pagó exactamente el «Total determinado» de
  la boleta **original** de julio, no es el de UOCRA. Viaja marcado `porVerificar` en
  `COBRADORES_UOCRA` y avisa cada vez que se usa.

### Lo prohibido

- `mesesPagados` — es «la gremial está pagada porque alguien marcó *Pagado* en Compras». El dueño
  prohibió esa carga el 10/09/2026 y ese mismo día pagó la boleta de UOCRA de agosto por DEBIN: sin
  fila en Compras, el egreso ya debitado seguía proyectado como futuro y el cash flow lo contaba dos
  veces.

### Las excepciones

- `orquestador/lib/libro-extractores-cargas.mjs` — es donde vive la precedencia: recibe las dos
  fuentes y decide cuál manda.
- `orquestador/scripts/libro-movimientos-pestana.mjs` — el único llamador del pipeline.
Los tests (`libro-extractores-cargas.test.mjs`, `libro-deuda-cruzada.test.mjs`) nombran la fuente
secundaria a propósito —probar la precedencia exige poder escribir la que pierde— y no figuran acá
porque el barrido excluye los `*.test.*`: declararlos dejaría dos excepciones mirando al aire.

---

## `obra_terminada`

| | |
|---|---|
| **Fuente primaria** | public.obra_canonica.estado = 'cerrada' · el predicado, en src/app/portal/obrasDelCliente.ts (`esObraAnterior`) |
| **Propietario** | `src/features/obras/services/actions.ts` — el formulario de la obra es quien declara que terminó |
| **Criterio** | Una obra está terminada **cuando el registro de obras lo dice**. No se deriva de que no le queden pagos por cobrar (eso es estar **al día**) ni de `public.obras.estado`, que es el registro viejo. |
| **Ventana** | Puntual: es el estado de hoy. El corte `clientes.portal_cobros_desde` es otra cosa y no se mezcla. |
| **Consumidores** | portal · Inicio (parte la lista), Pagos (sección de obras anteriores y totales del pie), Terminadas (lista y detalle) |
| **Confianza** | **D** · conocimiento interno validado |
| **Última decisión del dueño** | 27/08/2026: «tomá sólo lo pendiente, sólo esas obras» — una obra terminada y cobrada no ocupa el pie con su contrato. Se cumple pidiendo las **dos** condiciones, no reemplazando el estado por la plata. |

**Terminada con saldo pendiente sigue en el listado principal**, rotulada «obra terminada · saldo
pendiente». Es plata que el cliente debe: la sección de trabajo anterior dice «ya nos pagó» y sobre
un saldo abierto eso es falso.

**El defecto que esto cierra (10/09/2026).** El Inicio usaba el estado canónico y Pagos usaba «obra
sin pagos pendientes». En Messina: **BSA - Adicional** —cerrada, con $7.228.782 por cobrar— figuraba
como obra en curso, y **ME - PISOS 120 M² Y RAMPA** —activa, cobrada al día— figuraba como «trabajo
anterior que ya nos pagó». El mismo cliente, dos pantallas, dos respuestas.

### Lo prohibido

- `from\('obras'\)[^;]*estado` — `public.obras` es el registro **viejo** de obras (uuid, otra
  granularidad: tiene «MAMPOSTERÍA» donde `obra_canonica` tiene «Galpones, Mampostería, Cancha de
  Padel») y no hay mapeo entre los dos. `/portal/terminadas` preguntaba ahí y le contestaba
  **«0 obras»** a Messina, que tiene **seis** cerradas — y lo mismo a La Estrella (3) y ARCOR (1).
- `terminadaEsAnterior` — la regla del 27/08/2026 escrita como segunda definición. La reemplaza
  `anterioresPorObraTerminada`, que pide cerrada **y** al día.

### Las excepciones

| Archivo | Por qué | Hasta |
|---|---|---|
| `src/features/reportes/services/generadores.ts` | Lee `public.obras` con `estado = 'activa'` para el reporte semanal de producción. Es el registro viejo y está mal, pero migrarlo es del hito que unifica los dos registros de obra | **H1-obras** |
