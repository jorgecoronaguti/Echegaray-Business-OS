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
// ═══ LA SEMÁNTICA DE LAS COLUMNAS, MEDIDA CONTRA EL ARCHIVO VIVO (843 filas, 14/08) ═══
//
//   O · Total            el importe del comprobante (M neto + N IVA).
//   S · Total o Parcial  791 "Total", 41 "Parcial", 11 vacías. NO SE PUEDE USAR: hay filas que dicen
//                        "Total" con sólo una parte pagada (Pedro Fredes: O=3.300.000, T=2.000.000).
//                        Es una declaración de intención, no un hecho. Se lee, no se decide con ella.
//   T · Monto Pagado     lo efectivamente pagado. NO incluye a U ni a W.
//   U · Monto Parcial 1  ═══ EL DATO QUE SE LEE AL REVÉS ═══
//   W · Monto Parcial 2  En las 18 filas comerciales pendientes, U es SIEMPRE NEGATIVO y vale
//                        exactamente −(O − T): NO es un pago, es LO QUE FALTA PAGAR, escrito entre
//                        paréntesis. Gerson Castro: O=2.300.000 · T=1.000.000 · U=−1.300.000.
//                        Sumar |U| como pago da deuda CERO donde faltan $1,3M; restarlo de nuevo la
//                        duplica (medido: $30.167.844 contra $15.083.922, el doble exacto).
//                        Un valor POSITIVO en U/W sí es un pago, y hay 143 filas con uno — todas en
//                        estado "Pagado", donde ya no cambian ninguna deuda.
//
// LA REGLA, ENTONCES:  pagado = T + max(U;0) + max(W;0)   ·   falta declarada = −min(U;0) −min(W;0)
//                      saldo  = O − pagado
//
// ═══ Y LA CONTRADICCIÓN QUE EL CUADRO ESTABA TAPANDO: $11.919.063 ═══
//
// La fórmula que hoy vive en AL arranca con `IF(X="Pendiente"; …; 0)`: si el ESTADO no dice
// "Pendiente", la fila vale cero pase lo que pase en las columnas de pago. Medido:
//
//   8 filas comerciales dicen "Pagado" con Monto Pagado = 0 y U negativo — o sea, la propia planilla
//   declara que falta pagarlas — y el cuadro las cuenta como cero:
//
//     Gruas San Blas   $5.124.412 · Hormiserv $3.640.067 · Con-Sec $1.700.000 (3 filas)
//     DUPEC $1.104.585 (2 filas)  · Leandro Rojas $350.000
//
//   La pestaña muestra $15.083.922 de deuda comercial. Las columnas de pago dicen $27.002.985.
//   El 79% de diferencia sale de creerle al ESTADO por encima de los IMPORTES.
//
// ESTE ARCHIVO NO DECIDE CUÁL DE LOS DOS NÚMEROS ES EL BUENO, y es deliberado. O esas ocho facturas
// se pagaron y la columna U quedó con basura vieja, o no se pagaron y hay $11,9M de deuda que nadie
// está viendo. Las dos son posibles y sólo el dueño sabe cuál es; cambiar el titular por mi cuenta
// sería fabricar una respuesta con efecto económico. Lo que sí se hace es que la contradicción deje
// de estar enterrada en un contador al pie de la pestaña y salga AL LADO DEL TOTAL, con su plata.

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
 * LO EFECTIVAMENTE PAGADO DE UNA FILA: los tres tramos, contando sólo los POSITIVOS.
 *
 * El filtro no es prolijidad: un U negativo es el saldo que falta, y sumarlo como pago deja en cero
 * una factura que se debe entera. Ver la semántica medida en la cabecera.
 *
 * @param {any[]} fila una fila de Compras (A..AN)
 * @returns {number}
 */
export function pagadoDe(fila = []) {
  return num(fila[COL.pagado]) + positivo(num(fila[COL.parcial1])) + positivo(num(fila[COL.parcial2]))
}

/**
 * LO QUE LA PROPIA PLANILLA DECLARA QUE FALTA, leído de los paréntesis de U y W.
 *
 * Es un dato INDEPENDIENTE del saldo calculado, y por eso sirve de control: cuando los dos no
 * coinciden, alguien cargó mal. Un control no se valida contra la información que él mismo produce.
 *
 * @param {any[]} fila
 * @returns {number} siempre >= 0
 */
export function faltaDeclarada(fila = []) {
  // `positivo(-x)` y no `-(negativo(x))`: el segundo devuelve `-0` cuando no hay paréntesis, y `-0`
  // no es estrictamente igual a `0` — un cero que no se compara igual a cero es una trampa gratis.
  return positivo(-num(fila[COL.parcial1])) + positivo(-num(fila[COL.parcial2]))
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
 * QUÉ ES ESTA FILA, CRUZANDO LO QUE DICE EL ESTADO CON LO QUE DICEN LOS IMPORTES.
 *
 * Los cuatro resultados son distintos y cada uno pide una acción distinta:
 *
 *   'deuda'          Pendiente y con saldo. Es lo que el cuadro muestra hoy.
 *   'saldada'        sin saldo. Da igual lo que diga el estado: no se le debe nada.
 *   'pagada-con-saldo'  dice "Pagado" y los importes dicen que falta plata. ES EL AGUJERO: hoy vale
 *                    cero en el cuadro. Ocho filas por $11.919.063.
 *   'pendiente-sin-saldo' dice "Pendiente" y no falta nada. Ruido: infla el conteo de facturas.
 *
 * @param {any[]} fila
 * @returns {'deuda'|'saldada'|'pagada-con-saldo'|'pendiente-sin-saldo'}
 */
export function clasificar(fila = []) {
  const saldo = saldoDeLaFila(fila)
  const estado = txt(fila[COL.estado])
  const hay = Math.round(saldo) > TOL
  if (estado === PENDIENTE) return hay ? 'deuda' : 'pendiente-sin-saldo'
  if (!hay) return 'saldada'
  return estado === PAGADO ? 'pagada-con-saldo' : 'saldada'
}

/**
 * LA POSICIÓN DE DEUDA COMERCIAL, CON SU AGUJERO DECLARADO AL LADO.
 *
 * Devuelve las dos cifras juntas a propósito: `enElCuadro` es lo que la pestaña muestra y
 * `contradictorio` es lo que no muestra pero podría deber. Separadas, la segunda se pierde; juntas,
 * la pregunta "¿cuál de las dos es la verdadera?" queda planteada donde se decide un pago.
 *
 * @param {any[][]} filas las filas de Compras desde la 4
 * @returns {{enElCuadro:{n:number, monto:number}, contradictorio:{n:number, monto:number,
 *            filas:Array<{proveedor:string, comprobante:string, total:number, pagado:number, saldo:number}>},
 *            pendienteSinSaldo:{n:number}, techo:number}}
 */
export function posicionComercial(filas = []) {
  const enElCuadro = { n: 0, monto: 0 }
  const contradictorio = { n: 0, monto: 0, filas: [] }
  let pendienteSinSaldo = 0
  for (const fila of filas ?? []) {
    if (!txt(fila?.[COL.proveedor]) || !esComercial(fila)) continue
    const clase = clasificar(fila)
    if (clase === 'deuda') { enElCuadro.n++; enElCuadro.monto += saldoDeLaFila(fila); continue }
    if (clase === 'pendiente-sin-saldo') { pendienteSinSaldo++; continue }
    if (clase !== 'pagada-con-saldo') continue
    contradictorio.n++
    contradictorio.monto += saldoDeLaFila(fila)
    contradictorio.filas.push({
      proveedor: txt(fila[COL.proveedor]),
      comprobante: txt(fila[COL.comprobante]),
      total: num(fila[COL.total]),
      pagado: pagadoDe(fila),
      saldo: saldoDeLaFila(fila),
    })
  }
  contradictorio.filas.sort((a, b) => b.saldo - a.saldo)
  // El TECHO es la deuda si las contradictorias resultaran impagas. No se afirma: se ofrece como
  // el otro extremo del rango, para que nadie decida creyendo que el número de arriba es el único.
  return { enElCuadro, contradictorio, pendienteSinSaldo: { n: pendienteSinSaldo }, techo: enElCuadro.monto + contradictorio.monto }
}

/**
 * FILAS DONDE LOS PARÉNTESIS Y LA ARITMÉTICA NO SE PONEN DE ACUERDO.
 *
 * `faltaDeclarada` (lo que el dueño escribió entre paréntesis) y `saldoDeLaFila` (Total − pagado)
 * miden lo mismo por dos caminos independientes. Cuando difieren, uno de los dos está mal cargado y
 * el cuadro está mostrando una cifra que la propia planilla contradice una columna más allá.
 *
 * @param {any[][]} filas
 * @param {number} tol pesos de tolerancia
 * @returns {Array<{proveedor:string, comprobante:string, saldo:number, declarado:number, dif:number}>}
 */
export function paréntesisQueNoCierran(filas = [], tol = TOL) {
  const out = []
  for (const fila of filas ?? []) {
    if (!txt(fila?.[COL.proveedor]) || !esComercial(fila)) continue
    const declarado = faltaDeclarada(fila)
    if (declarado === 0) continue
    const saldo = saldoDeLaFila(fila)
    const dif = saldo - declarado
    if (Math.abs(dif) <= tol) continue
    out.push({ proveedor: txt(fila[COL.proveedor]), comprobante: txt(fila[COL.comprobante]), saldo, declarado, dif })
  }
  return out.sort((a, b) => Math.abs(b.dif) - Math.abs(a.dif))
}

/**
 * LA MISMA ARITMÉTICA, COMO ARRAYFORMULA es-AR PARA LA COLUMNA `AL · Saldo pendiente (OS)`.
 *
 * Se ancla en AL4 y derrama sola: escribir el derrame rompe la fórmula entera (ver la lección
 * `formula-por-api-va-en-locale`). Separador `;`, nombres de función en inglés —que la API acepta— y
 * ni una coma, para que el localizador no la confunda con un decimal.
 *
 * ═══ POR QUÉ SIGUE MIRANDO EL ESTADO, SABIENDO QUE AHÍ ESTÁ EL AGUJERO ═══
 *
 * Porque sacarlo mueve el titular de la pestaña $11.919.063 hacia arriba, y eso es una afirmación
 * sobre plata que la empresa debería o no debería pagar: tiene efecto económico y no la firma un
 * generador. `soloPendiente: false` produce la otra versión —la que le cree a los importes— para
 * poder comparar las dos con el dueño delante antes de que ninguna se escriba.
 *
 * @param {{soloPendiente?:boolean}} [opts]
 * @returns {string}
 */
export function formulaSaldoPendiente({ soloPendiente = true } = {}) {
  const n = (r) => `IF(ISNUMBER(${r});${r};0)`
  const pos = (r) => `IF(ISNUMBER(${r});IF(${r}>0;${r};0);0)`
  const saldo = `${n('$O$4:$O')}-${n('$T$4:$T')}-${pos('$U$4:$U')}-${pos('$W$4:$W')}`
  const universo = soloPendiente
    ? `($X$4:$X="${PENDIENTE}")*($AJ$4:$AJ=1)`
    : `($X$4:$X<>"ELIMINADO")*($AJ$4:$AJ=1)`
  return `=ARRAYFORMULA(IF($E$4:$E="";"";IF(${universo};${saldo};0)))`
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
  const pos = (c) => `IF(ISNUMBER(${hoja}$${c}$4:$${c});IF(${hoja}$${c}$4:$${c}>0;${hoja}$${c}$4:$${c};0);0)`
  return `(${n('O')}-${n('T')}-${pos('U')}-${pos('W')})`
}

/**
 * LA DEUDA QUE EL CUADRO NO MUESTRA — plata y facturas, como fórmula viva.
 *
 * Filas comerciales cuyo ESTADO dice que ya no se deben y cuyas COLUMNAS DE PAGO dicen que falta
 * plata. Hoy valen cero en el titular, en el aging y en las dos dinámicas, porque las cuatro cuelgan
 * de `AL`, que arranca con `IF(X="Pendiente"; …; 0)`.
 *
 * Va como FÓRMULA y no como número pegado (regla de oro 5): el día que alguien corrija una de esas
 * ocho filas en Compras, esta línea baja sola. Un número pegado seguiría gritando para siempre, y un
 * aviso que no se puede apagar deja de leerse.
 *
 * @param {'monto'|'n'} que
 * @returns {string}
 */
export function formulaDeudaNoMostrada(que = 'monto') {
  return `=SUMPRODUCT(${universoNoMostrado()}${que === 'monto' ? `*${expresionSaldo()}` : ''})`
}

/** El universo de la contradicción. Sale de una sola función porque el monto, el conteo y los
 *  NOMBRES tienen que estar hablando exactamente de las mismas filas. "ELIMINADO" queda afuera: son
 *  filas dadas de baja, no deuda escondida. */
function universoNoMostrado() {
  return `(Compras!$AJ$4:$AJ=1)*(Compras!$X$4:$X<>"${PENDIENTE}")*(Compras!$X$4:$X<>"ELIMINADO")`
    + `*(${expresionSaldo()}>${TOL})`
}

/**
 * A QUIÉNES SE LES DEBERÍA ESA PLATA — los nombres, al lado de la cifra.
 *
 * ═══ POR QUÉ HACEN FALTA LOS NOMBRES Y NO ALCANZA EL MONTO (14/08) ═══
 *
 * El dueño: *"la base SIEMPRE es el nombre del proveedor"*. Estas ocho facturas NO aparecen en el
 * cuadro que ordena la deuda por proveedor —su saldo vale cero ahí, porque el estado dice "Pagado"—
 * así que el ranking omite a Gruas San Blas con $5.124.412 y nada lo delata. Una cifra sin nombres
 * dice que falta plata; con los nombres dice a quién hay que preguntarle.
 *
 * Va como FÓRMULA, igual que la cifra: el día que alguien corrija una de esas filas en Compras, el
 * nombre desaparece solo. `UNIQUE` porque Con-Sec y DUPEC tienen más de un comprobante y repetir el
 * nombre tres veces gasta el ancho que hace falta para los otros.
 *
 * @returns {string}
 */
export function formulaProveedoresNoMostrados() {
  return `=IFERROR(TEXTJOIN(" · ";TRUE;UNIQUE(FILTER(Compras!$E$4:$E;${universoNoMostrado()})));"")`
}

/** El rótulo de la columna en Compras. Una sola constante: el que escribe y el que busca leen ésta. */
export const ROTULO_SALDO = 'Saldo pendiente (OS)'
