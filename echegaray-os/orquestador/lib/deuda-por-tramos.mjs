// CUÁNTO SE LE DEBE DE VERDAD A UN PROVEEDOR — LA ARITMÉTICA DE LOS TRAMOS DE PAGO.
//
// ═══ EL PEDIDO (14/08), TEXTUAL ═══
//
// "pestaña proveedores esta considerando mal las columnas de montos adeudados y pagos parciales en
// pestaña compras por ende los valores son equivocados"
//
// ═══ LO PRIMERO QUE APARECIÓ NO FUE UNA FÓRMULA MAL ESCRITA: FUE UNA FÓRMULA SIN DUEÑO ═══
//
// Toda la pestaña "Proveedores" —el titular, el aging, las dos dinámicas— descansa sobre UNA columna
// de Compras, `AL · Saldo pendiente (OS)`. Buscándola en el repositorio no aparece: no la escribe
// ningún script, no la cubre ningún test, no está en `PASOS`. Vive tipeada en la celda AL4 del
// archivo y nadie es responsable de lo que dice. Un número así no puede estar bien ni mal a
// propósito, y es la causa de fondo de que los valores sean los que sean.
//
// Este archivo le da dueño: define la aritmética en JS —testeable sin Google— y emite la MISMA
// decisión como ARRAYFORMULA es-AR. Una capacidad, una fuente.
//
// ═══ LA SEMÁNTICA DE LAS COLUMNAS, RE-MEDIDA CELDA POR CELDA (1.151 filas, 18/08) ═══
//
// La medición del 14/08 se hizo leyendo VALORES. Ésta se hizo leyendo FÓRMULAS, y lo que aparece es
// otra cosa: tres de las cuatro columnas que se estaban cruzando como si fueran declaraciones
// independientes son celdas DERIVADAS unas de otras.
//
//   O · Total            el importe del comprobante (`=N+M`).
//   S · Total o Parcial  "Total" 799 · "Parcial" 42 · vacías 295. Dice si lo que se pagó cubrió el
//                        comprobante entero o una parte. SE MUESTRA, NO DECIDE: hay filas que dicen
//                        "Total" con sólo una parte pagada.
//   T · Monto Pagado     NO es un dato tipeado: en 622 de 1.081 filas es una FÓRMULA, y la forma más
//                        común (361 filas) es `=IF(F="pago";O;0)` — o sea que depende de la MODALIDAD
//                        (columna F). Con F = "Cuenta Corriente" rinde 0. Un cero ahí significa
//                        «esta fórmula no se disparó», NO «no se pagó nada».
//   U · Monto Parcial 1  ═══ EL ERROR QUE ESTE ARCHIVO COMETIÓ DOS VECES ═══
//                        En 716 de sus 717 celdas con contenido, U es la fórmula `=T-O`. No hay UNA
//                        SOLA celda de U con un negativo tipeado a mano en toda la pestaña.
//                        Entonces «lo que el dueño declaró que falta entre paréntesis» nunca existió:
//                        U es −(O−T) porque ES −(O−T), calculado por el Sheet. Cruzar U contra
//                        O−T como si fueran dos caminos independientes al mismo número es validar un
//                        control contra la información que él mismo produce.
//   X · Estado           ═══ LA ÚNICA DECLARACIÓN, Y ES DEL DUEÑO ═══
//                        619 filas con la fórmula
//                          IF(ABS(T+W-O)<1;"Pagado";IF(T+W<O;"Pendiente";"Revisar"))
//                        y 517 con un LITERAL TIPEADO ENCIMA (455 "Pagado" · 44 "Proyectado" ·
//                        12 "Pendiente" · 6 "ELIMINADO"). En 114 de esas 517 el texto tipeado
//                        CONTRADICE lo que la fórmula calcularía. Tipear encima de una fórmula viva
//                        es la señal de edición más fuerte que existe en una planilla.
//
// ═══ LA REGLA, ENTONCES, Y ES UNA SOLA ═══
//
//   SE DEBE  ⇔  X · Estado = "Pendiente".            ← lo declara el dueño, y manda.
//   CUÁNTO   ⇔  O − T − max(U;0) − max(W;0).
//
// Los `max(…;0)` no son prolijidad: con U = `=T-O` el negativo es el saldo mismo, y restarlo otra vez
// duplica la deuda (medido en su momento: $30.167.844 contra $15.083.922, el doble exacto). Un
// POSITIVO en U o W sí es un pago y sí se resta.
//
// ═══ Y LOS $11.919.063 QUE ESTE ARCHIVO PUBLICÓ COMO "DEUDA ESCONDIDA" ═══
//
// No existían. Eran 8 filas donde el dueño tipeó "Pagado" encima de la fórmula, con `T` en 0 porque
// su fórmula `=IF(F="pago";O;0)` no se disparó (F = "Cuenta Corriente") y `U` en −O porque U es
// `=T-O`. Tres celdas derivadas de la misma, leídas como tres testigos. El cuadro las publicaba
// pegadas al TOTAL con un ▲ y la frase "Dicen «Pagado» y falta plata", y el dueño lo reclamó tres
// veces seguidas: *"en la pestaña compras se paga y cambia a estado pagado y lo continúa mostrando
// como q se adeuda"*.
//
// LO QUE SÍ QUEDA, PORQUE SÍ ES INDEPENDIENTE: que en esas filas `Monto Pagado` valga 0 no dice nada
// sobre la deuda, pero sí dice que la planilla no registra CUÁNTA plata salió — y eso le importa a
// Caja, no a Proveedores. Se informa por el log de `compras-saldo-pendiente.mjs`, sin monto de deuda
// al lado, porque un número en pesos en un cuadro de deuda se lee como deuda haga lo que haga el
// rótulo.

/** Las columnas de Compras que esta aritmética usa. Índice 0 = A. */
export const COL = Object.freeze({
  proveedor: 4, // E
  comprobante: 7, // H
  total: 14, // O · Total
  fechaPago: 16, // Q · Fecha prevista de pago (día)
  totalOParcial: 18, // S · Total o Parcial
  pagado: 19, // T · Monto Pagado
  parcial1: 20, // U · Monto Parcial 1
  fechaPago2: 21, // V · Fecha prevista de pago 2
  parcial2: 22, // W · Monto Parcial 2
  estado: 23, // X · Estado
  comercial: 35, // AJ · ¿Proveedor comercial? (OS)
  saldo: 37, // AL · Saldo pendiente (OS) — lo que este archivo pasa a definir
})

/** El estado de Compras que declara deuda viva. */
export const PENDIENTE = 'Pendiente'
/** El estado que declara la factura saldada. */
export const PAGADO = 'Pagado'
/** Un peso de tolerancia: los importes son flotantes y no se compara con cero pelado. */
export const TOL = 1

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
const positivo = (x) => (x > 0 ? x : 0)

const txt = (v) => String(v ?? '').trim()

/**
 * ═══ LO PAGADO DE UNA FILA: `T + W`. LOS DOS TRAMOS, Y NADA MÁS ═══
 *
 * Compras registra el pago en DOS TRAMOS, y las columnas están de a pares:
 *
 *   tramo 1 → `Q · Fecha prevista de pago (día)`  +  `T · Monto Pagado`
 *   tramo 2 → `V · Fecha prevista de pago 2`      +  `W · Monto Parcial 2`
 *
 * `U · Monto Parcial 1` NO ES UN TRAMO: es `=T-O`, el saldo que queda después del primero. Medido
 * sobre las 8 filas del archivo con `V` cargada —las únicas con segundo tramo real— en las OCHO vale
 * `W = |U|` exacto: Gerson Castro fila 819 (O 2.300.000 · T 1.000.000 · U −1.300.000 · V 14/08 ·
 * W 1.300.000) y Pedro Fredes fila 832 (3.300.000 = 2.000.000 + 1.300.000). Las dos quedaron
 * saldadas, y su Estado lo calcula sola la planilla.
 *
 * ═══ POR QUÉ `max(U;0)` ERA UN DEFECTO, NO UNA PRECAUCIÓN ═══
 *
 * Este archivo restaba además los U POSITIVOS «porque un positivo sí es un pago». No lo es: hay 60
 * filas con U > 0 y ahí U es el importe que SALIÓ DE CAJA, que no coincide con el de la factura —
 * nafta de Combustibles Barcelo, factura $34.460 y ticket $40.000. Restarlo cuenta el pago dos veces.
 * En 57 de esas 60 el criterio viejo lo restaba.
 *
 * ═══ Y LA PRUEBA DE QUE ÉSTA ES LA DEFINICIÓN Y NO OTRA OPINIÓN ═══
 *
 * Es la MISMA que usa la fórmula que la planilla YA TIENE en su columna `Estado`, viva en 619 filas:
 *
 *     IF(ABS(T+W-O)<1;"Pagado";IF(T+W<O;"Pendiente";"Revisar"))
 *
 * La planilla decide el estado con `T+W` y este archivo calculaba el saldo con otra cuenta. Un cuadro
 * cuyo "cuánto" no cierra con su propio "¿está pagada?" no puede estar bien por casualidad: el test
 * compara las dos expresiones, no dos números que hoy empatan.
 *
 * @param {any[]} fila una fila de Compras (A..AN)
 * @returns {number}
 */
export function pagadoDe(fila = []) {
  return pagadoDeTramos({ pagado: fila[COL.pagado], parcial2: fila[COL.parcial2] })
}

/**
 * LA MISMA CUENTA, POR CAMPOS — para el que ya resolvió sus columnas por rótulo.
 *
 * Existe para que `libro-extractores-compras.mjs` —el que alimenta las tarjetas de CAJA— use ÉSTA y
 * no la suya. Tenía la propia, `importe - montoPagado`, sin el segundo tramo: la misma factura valía
 * una cosa en "Proveedores" y otra en "CAJA". Un concepto, una fuente.
 *
 * @param {{pagado:any, parcial2:any}} f
 * @returns {number}
 */
export function pagadoDeTramos({ pagado, parcial2 } = {}) {
  return num(pagado) + num(parcial2)
}

/**
 * EL SALDO DE UNA FILA SEGÚN SUS IMPORTES — sin mirar el estado.
 * @param {any[]} fila
 * @returns {number}
 */
export function saldoDeLaFila(fila = []) {
  return num(fila[COL.total]) - pagadoDe(fila)
}

/** ¿Es una compra a un proveedor comercial? Las de ARCA/nómina/financieras viven en otra pestaña. */
export const esComercial = (fila = []) => txt(fila[COL.comercial]) === '1'

/**
 * QUÉ ES ESTA FILA. LO DECIDE EL ESTADO, QUE ES LO ÚNICO QUE DECLARA UNA PERSONA.
 *
 *   'deuda'                Pendiente y con saldo. Es lo que el cuadro muestra.
 *   'pendiente-sin-saldo'  Pendiente y sin saldo. Ruido: infla el conteo de facturas, no la plata.
 *   'saldada'              cualquier otro estado. No se le debe nada, y NO se discute con los
 *                          importes: `Monto Pagado` es una fórmula que depende de la Modalidad y
 *                          `Monto Parcial 1` es `=T-O`. Ninguna de las dos es un testigo.
 *
 * Acá vivía un cuarto resultado —'pagada-con-saldo'— que declaraba "el estado dice Pagado pero los
 * importes dicen que falta plata" y publicaba $11.919.063 al lado del TOTAL. Los importes no decían
 * eso: eran la misma celda leída tres veces. Ver la cabecera.
 *
 * @param {any[]} fila
 * @returns {'deuda'|'saldada'|'pendiente-sin-saldo'}
 */
export function clasificar(fila = []) {
  if (txt(fila[COL.estado]) !== PENDIENTE) return 'saldada'
  return Math.round(saldoDeLaFila(fila)) > TOL ? 'deuda' : 'pendiente-sin-saldo'
}

/**
 * ¿EL ESTADO DE ESTA FILA ESTÁ TIPEADO A MANO, CONTRADICIENDO SU PROPIA FÓRMULA?
 *
 * No cambia ninguna deuda —el tipeado gana siempre— pero es el ÚNICO cruce de este archivo entre dos
 * fuentes de verdad distintas: una persona escribiendo una palabra contra una aritmética. Sirve para
 * informar, nunca para corregir.
 *
 * Se le pasan las DOS lecturas de la misma fila: la de fórmulas y la de valores. Sin la de fórmulas
 * no hay forma de saber si el texto lo escribió alguien o lo calculó el archivo, y suponerlo es
 * exactamente el error que costó esta reconstrucción.
 *
 * @param {any[]} filaFormula  la fila leída con render FORMULA
 * @param {any[]} filaValor    la MISMA fila leída con render UNFORMATTED_VALUE
 * @returns {{tipeado:string, calculado:string}|null} null si el estado no está tipeado o si coinciden
 */
export function estadoTipeadoQueContradice(filaFormula = [], filaValor = []) {
  const tipeado = txt(filaFormula[COL.estado])
  if (!tipeado || tipeado.startsWith('=') || tipeado === 'ELIMINADO') return null
  if (!txt(filaValor[COL.proveedor])) return null
  const t = num(filaValor[COL.pagado]) + num(filaValor[COL.parcial2])
  const o = num(filaValor[COL.total])
  const calculado = Math.abs(t - o) < TOL ? PAGADO : (t < o ? PENDIENTE : 'Revisar')
  return calculado === tipeado ? null : { tipeado, calculado }
}

/**
 * LA POSICIÓN DE DEUDA COMERCIAL: una sola cifra, la que el cuadro muestra.
 *
 * Devolvía además un `contradictorio` y un `techo` —"la deuda si las 8 'Pagado' resultaran impagas"—
 * y los dos salían de leer celdas derivadas como si fueran declaraciones. No hay dos extremos de un
 * rango: hay una deuda declarada por el dueño en la columna Estado.
 *
 * @param {any[][]} filas las filas de Compras desde la 4
 * @returns {{enElCuadro:{n:number, monto:number}, pendienteSinSaldo:{n:number}}}
 */
export function posicionComercial(filas = []) {
  const enElCuadro = { n: 0, monto: 0 }
  let pendienteSinSaldo = 0
  for (const fila of filas ?? []) {
    if (!txt(fila?.[COL.proveedor]) || !esComercial(fila)) continue
    const clase = clasificar(fila)
    if (clase === 'deuda') { enElCuadro.n++; enElCuadro.monto += saldoDeLaFila(fila) }
    else if (clase === 'pendiente-sin-saldo') pendienteSinSaldo++
  }
  return { enElCuadro, pendienteSinSaldo: { n: pendienteSinSaldo } }
}

/**
 * LA MISMA ARITMÉTICA, COMO ARRAYFORMULA es-AR PARA LA COLUMNA `AL · Saldo pendiente (OS)`.
 *
 * Se ancla en AL4 y derrama sola: escribir el derrame rompe la fórmula entera (ver la lección
 * `formula-por-api-va-en-locale`). Separador `;`, nombres de función en inglés —que la API acepta— y
 * ni una coma, para que el localizador no la confunda con un decimal.
 *
 * ═══ NO TIENE VARIANTE, Y ESO ES EL ARREGLO (18/08) ═══
 *
 * Tenía un `soloPendiente: false` que producía "la otra versión, la que le cree a los importes",
 * pensada para comparar las dos con el dueño delante. Esa segunda versión no puede existir: los
 * importes de esta pestaña son fórmulas derivadas del propio estado y de la modalidad, así que
 * "creerles" no es una segunda opinión, es la misma celda con otro nombre. Dos definiciones del mismo
 * concepto es exactamente lo que este archivo vino a terminar.
 *
 * @returns {string}
 */
export function formulaSaldoPendiente() {
  const n = (r) => `IF(ISNUMBER(${r});${r};0)`
  const saldo = `${n('$O$4:$O')}-${n('$T$4:$T')}-${n('$W$4:$W')}`
  return `=ARRAYFORMULA(IF($E$4:$E="";"";IF(($X$4:$X="${PENDIENTE}")*($AJ$4:$AJ=1);${saldo};0)))`
}

/**
 * EL SALDO DE UNA FILA COMO SUB-EXPRESIÓN DE SHEETS (sin `=`), para usar dentro de un SUMPRODUCT.
 *
 * Es la MISMA aritmética que `saldoDeLaFila`, y sale de acá para que no puedan separarse. Sin LET a
 * propósito: un rango metido en un LET pierde la expansión dentro de SUMPRODUCT (ver la lección
 * `let-nombre-a1-y-arrayformula`), así que la expresión se escribe larga y se escribe una sola vez.
 *
 * @param {string} [hoja] la pestaña de origen, con su `!`
 * @returns {string}
 */
export function expresionSaldo(hoja = 'Compras!') {
  const n = (c) => `IF(ISNUMBER(${hoja}$${c}$4:$${c});${hoja}$${c}$4:$${c};0)`
  return `(${n('O')}-${n('T')}-${n('W')})`
}

/**
 * LAS FACTURAS PAGADAS SIN REGISTRAR CON CUÁNTO — el conteo, como fórmula viva.
 *
 * `Estado` = "Pagado" y los dos tramos de pago suman cero. NO ES DEUDA: el dueño declaró la factura
 * saldada tipeando el estado encima de la fórmula, y eso manda. Lo que falta es el IMPORTE, y el que
 * lo necesita es CAJA — un egreso sin monto no se puede imputar a ningún día ni a ninguna obra.
 *
 * DEVUELVE UN CONTEO, NUNCA PESOS, y es la decisión entera de esta función. Durante cuatro días este
 * mismo universo se publicó con su importe al lado del TOTAL de la deuda y se leyó —correctamente—
 * como $11.919.063 que la empresa debía. Ver la cabecera de este archivo.
 *
 * @returns {string}
 */
export function formulaPagadasSinImporte() {
  return `=SUMPRODUCT(${universoSinImporte()})`
}

/** A quiénes, para poder preguntar sin abrir Compras. `UNIQUE` porque hay proveedores con más de una. */
export function formulaProveedoresSinImporte() {
  return `=IFERROR(TEXTJOIN(" · ";TRUE;UNIQUE(FILTER(Compras!$E$4:$E;${universoSinImporte()})));"")`
}

/** El universo, en un solo lugar: el conteo y los nombres tienen que hablar de las mismas filas. */
function universoSinImporte() {
  const n = (c) => `IF(ISNUMBER(Compras!$${c}$4:$${c});Compras!$${c}$4:$${c};0)`
  return `(Compras!$AJ$4:$AJ=1)*(Compras!$X$4:$X="${PAGADO}")*(Compras!$O$4:$O>0)*((${n('T')}+${n('W')})=0)`
}

/**
 * LAS FACTURAS PENDIENTES CON UN IMPORTE TIPEADO EN «MONTO PARCIAL 1» — la pregunta que queda abierta.
 *
 * `saldoDeLaFila` es `Total − Monto Pagado − Monto Parcial 2` y NO resta `Monto Parcial 1`. No es un
 * olvido, está medido sobre las 1.136 filas del archivo real:
 *
 *     U · Monto Parcial 1 → 716 fórmulas `=T−O` · 302 valores tipeados · 84 negativos · 61 positivos
 *     W · Monto Parcial 2 →   0 fórmulas       ·   8 valores tipeados ·  0 negativos ·  8 positivos
 *
 * `U` es una columna MIXTA: casi siempre la derivada `=T−O`, que es negativa mientras la factura no
 * se pagó. Restarla la convierte en un tramo de pago que no es — y ésa fue durante meses la segunda
 * definición de la deuda, la que hacía que el control del pie contradijera al cuadro de arriba.
 *
 * PERO cuando alguien tipea ahí un importe POSITIVO sobre una factura pendiente, la fila se
 * contradice sola: o ya está pagada y le falta el estado, o el importe está en la columna equivocada.
 * Mientras tanto su saldo se publica entero, y puede estar de más.
 *
 * Esta fórmula no resuelve la contradicción: la NOMBRA, con proveedor y monto, para que se arregle en
 * Compras, que es donde está el dato. Elegir una de las dos respuestas acá sería fabricarla.
 *
 * @returns {string}
 */
export function formulaParcial1Sospechoso() {
  // `IF(ISNUMBER(...))` NO SOBRA, y la primera versión sin él publicó `#VALUE!` en la pestaña real.
  // `Monto Parcial 1` tiene 302 valores cargados a mano y entre ellos hay celdas de TEXTO: la
  // comparación `>0` las tolera, pero la MULTIPLICACIÓN de la máscara por la columna arrastra el
  // texto y rompe el SUMPRODUCT entero. Es la misma coerción que ya hace `expresionSaldo`.
  const n = '(IF(ISNUMBER(Compras!$U$4:$U);Compras!$U$4:$U;0))'
  const u = `(${n}>0)*(Compras!$X$4:$X="${PENDIENTE}")*(Compras!$AJ$4:$AJ=1)`
  return `=LET(n;SUMPRODUCT(${u});m;SUMPRODUCT(${u}*${n});`
    + `IF(n=0;"✓ ningún importe suelto en «Monto Parcial 1»";`
    + `n&" factura(s) pendientes con "&TEXT(m;"$#,##0")&" cargado en «Monto Parcial 1» ("`
    + `&IFERROR(TEXTJOIN(" · ";TRUE;UNIQUE(FILTER(Compras!$E$4:$E;${u})));"sin nombre")`
    + `&"): o ya están pagadas y falta el estado, o el importe va en «Monto Pagado»"))`
}

/** El rótulo de la columna en Compras. Una sola constante: el que escribe y el que busca leen ésta. */
export const ROTULO_SALDO = 'Saldo pendiente (OS)'
