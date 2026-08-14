// "A QUIÉNES Y CÓMO DEBO PAGAR UN DETERMINADO DÍA" — UNA FILA POR DÍA, CON SU TOTAL.
//
// ═══ EL PEDIDO, TEXTUAL (14/08) ═══
//
// *"el cuadro de pestaña proveedores esta incompleto aun tengo q seguir usando algunos filtros en
//  pestaña compras por ejemplo para saber exactamente A QUIENES Y COMO DEBO PAGAR UN DETERMINADO
//  DIA. no me sirve — rehacer respetando mi regla de oro de diseño"*
//
// ═══ POR QUÉ NO ALCANZA EL CUADRO DE DETALLE QUE YA EXISTE ═══
//
// La sección 1 lo agrupa por día, sí, pero es una TABLA DINÁMICA NATIVA y eso trae tres defectos que
// no se arreglan configurándola distinto — están medidos contra el archivo real en
// `proveedores-pivot-seccion1.mjs`:
//
//   1. La API NO emite el subtotal de un nivel externo. `showTotals: true` no da error y no hace
//      nada. Resultado: NINGÚN día tiene total, que es justo el número que decide el pago.
//   2. El pivot deja el rótulo en blanco en las filas de continuación: la fila 35 publica $2.950.000
//      sin proveedor y sin fecha (son de PEDRO TELLO). Un importe sin dueño no se puede pagar.
//   3. Dibuja botones de colapsar en cada celda de grupo — ruido que el dueño lee como "roto".
//
// Para esta pregunta el pivot es la herramienta equivocada. Este cuadro se arma con FÓRMULAS VIVAS
// sobre Compras: una fila por día, el total del día calculado por un camino, y el detalle por
// instrumento por otro.
//
// ═══ EL UNIVERSO ES EL DE LA SECCIÓN 1, Y SE IMPORTA, NO SE RE-TIPEA ═══
//
// Estado = "Pendiente" y proveedor comercial. Las posiciones de columna salen de `COL` de
// `proveedores-pivot-seccion1.mjs` y de `COL` de `deuda-por-tramos.mjs` (las dos de tramo 2). Dos
// listas de offsets que dicen lo mismo es cómo un cuadro empieza a leer la columna de al lado — ya
// pasó con la obra (I en vez de J) y salió "Civil" trece veces seguidas.
//
// ═══ UNA FACTURA PUEDE SALIR EN DOS DÍAS (14/08, segundo hallazgo) ═══
//
// `Compras!V · Fecha prevista de pago 2` no la lee NADIE en el repositorio: toda la pestaña toma el
// vencimiento de `Q`. Una factura pactada en dos tramos —parcial 1 con fecha Q, parcial 2 con fecha
// V— aporta plata a DOS días, y el cuadro sólo vería el primero. Hoy no produce un número equivocado
// (las 44 filas con V/W cargados están todas en "Pagado"), pero se activa sola la primera vez que se
// cargue un pago en dos tramos que todavía no venció. Es la clase de error que no grita.
//
// ═══ CÓMO SE REPARTE, SIN TOCAR LA ARITMÉTICA DEL SALDO ═══
//
// `deuda-por-tramos.mjs` está verificado contra las 19 facturas pendientes reales con error $0 y NO
// se toca: `pagado = T + max(U;0) + max(W;0)` · `saldo = O − pagado`. Un `Monto Parcial` POSITIVO es
// plata QUE YA SALIÓ (143 filas, todas "Pagado") y por eso se resta del saldo: no puede además
// aparecer como un pago futuro, sería contarla dos veces. Un `Monto Parcial` NEGATIVO es la planilla
// anotando LO QUE FALTA, entre paréntesis, y ÉSE es el que tiene fecha propia.
//
//     tramo 2 = −W   cuando V es una fecha y W < 0     (lo que falta del segundo tramo)
//     tramo 1 = saldo − tramo 2                        (el resto, en la fecha Q)
//
// La resta —y no `−U`— es deliberada: hace que la suma de los dos tramos sea SIEMPRE el saldo, así el
// cuadro cierra contra la deuda aunque los paréntesis de U y W no cierren entre sí. Que no cierren ya
// tiene su propio control (`paréntesisQueNoCierran`), y un cuadro que se inventa su cuadratura tapa
// justo el defecto que el otro control persigue.
//
// LO QUE NO SE CLAMPEA, A PROPÓSITO: si |W| es mayor que el saldo, el tramo 1 sale NEGATIVO y se ve
// entre paréntesis. Recortarlo a cero dejaría el cuadro prolijo y la carga mal hecha invisible.

import { COL, PENDIENTE } from './proveedores-pivot-seccion1.mjs'
import { COL as COL_TRAMOS } from './deuda-por-tramos.mjs'
import { MONEDA_CUERPO, MONEDA_TOTAL } from './formato-statement.mjs'
import { COLCHON_FINAL, filaDelSiguienteTitulo } from './proveedores-colchon.mjs'
import { normalizarTitulo } from './proveedores-frontera.mjs'
import { ALERTA } from './glifos.mjs'

/** El título de la sección. Su número lo pone `nSeccion`, nunca esta constante. */
export const TITULO_POR_DIA = 'QUÉ SALE CADA DÍA'

/** El título de la sección 1: el ancla de arriba del bloque. Texto de otro dueño, no salida propia. */
export const TITULO_SECCION_1 = 'QUÉ SE DEBE Y CUÁNDO'

/**
 * LOS CUATRO INSTRUMENTOS QUE TIENEN COLUMNA — y qué pasa con el quinto.
 *
 * En Compras el "Tipo pago" tiene cinco valores: los cuatro de acá y "Tarjeta Crédito". La tarjeta no
 * tiene columna porque no se paga: se debita sola. Pero su plata SÍ está en el total del día, porque
 * el total se calcula sobre el universo entero y no sumando estas cuatro columnas. Si algún día una
 * deuda pendiente sale por un medio sin columna, el control del pie lo dice con su importe en vez de
 * que el cuadro cuadre solo escondiéndolo.
 */
export const MEDIOS_DEL_DIA = Object.freeze(['Efectivo', 'Cheque', 'Echeq', 'Transferencia'])

/** Los rótulos, en el orden en que se publican. `TOTAL DEL DÍA` es el número que decide. */
export const ROTULOS_POR_DIA = Object.freeze([
  'Día', ...MEDIOS_DEL_DIA, 'TOTAL DEL DÍA', 'A quiénes',
])

/** La columna del total dentro del bloque (base 0). Calculada, nunca tipeada. */
export const COL_TOTAL_DIA = 1 + MEDIOS_DEL_DIA.length
/** La columna de los nombres. */
export const COL_QUIENES = COL_TOTAL_DIA + 1

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
const txt = (v) => String(v ?? '').trim()

/** La letra de una columna a partir de su offset base 0. `35 → AJ`, `37 → AL`. */
export function letraDeColumna(i) {
  const a = Math.floor(i / 26)
  return (a ? String.fromCharCode(64 + a) : '') + String.fromCharCode(65 + (i % 26))
}

/** El rango abierto de una columna de Compras, absoluto y desde la fila 4 (la 3 son los rótulos). */
const R = (off) => `Compras!$${letraDeColumna(off)}$4:$${letraDeColumna(off)}`

// ═══ LAS EXPRESIONES DE SHEETS, DEFINIDAS UNA SOLA VEZ ═══
//
// Cada una se usa en varias columnas del cuadro. Escritas en cada fórmula, la que se olvide de un
// paréntesis suma otra cosa y ninguna prueba lo ve. Sin LET: un rango metido en un LET pierde la
// expansión dentro de SUMPRODUCT (lección `let-nombre-a1-y-arrayformula`), así que la expresión se
// escribe larga y se escribe acá.

/** El universo: pendiente y comercial. El mismo filtro que la sección 1. */
export const universoPendiente = () => `(${R(COL.estado)}="${PENDIENTE}")*(${R(COL.comercial)}=1)`

/** El saldo de la fila: la columna que ya define `compras-saldo-pendiente.mjs`. */
export const saldoDeCompras = () => R(COL.saldo)

/** Lo que falta del SEGUNDO tramo: sólo si V es una fecha y W está entre paréntesis. */
export const expresionTramo2 = () =>
  `IF((ISNUMBER(${R(COL_TRAMOS.fechaPago2)}))*(${R(COL_TRAMOS.parcial2)}<0);-${R(COL_TRAMOS.parcial2)};0)`

/** Lo que sale ESE día por cada fila: el resto en la fecha Q, el segundo tramo en la fecha V. */
export const expresionMontoDelDia = (dia) =>
  `((${R(COL.proximoPago)}=${dia})*(${saldoDeCompras()}-${expresionTramo2()})`
  + `+(${R(COL_TRAMOS.fechaPago2)}=${dia})*${expresionTramo2()})`

/** ¿Esta fila pone plata ese día? Para los NOMBRES: un nombre sin plata detrás es ruido. */
export const expresionFilaDelDia = (dia) =>
  `((${R(COL.proximoPago)}=${dia})*((${saldoDeCompras()}-${expresionTramo2()})<>0)`
  + `+(${R(COL_TRAMOS.fechaPago2)}=${dia})*(${expresionTramo2()}<>0)>0)`

/**
 * LA LISTA DE DÍAS, VIVA: los distintos valores de Q y de V que tienen plata, ordenados.
 *
 * `{a;b}` apila las dos columnas una debajo de la otra — en un archivo es_AR el separador de FILAS de
 * un literal de array es `;` (el de columnas es `\`). Es el único modo de preguntar por dos columnas
 * a la vez sin escribir el cuadro dos veces.
 *
 * Si no matchea nada, FILTER devuelve #N/A: por eso cada celda del cuadro lo envuelve en IFERROR.
 */
export const expresionDias = () =>
  `SORT(UNIQUE(FILTER({${R(COL.proximoPago)};${R(COL_TRAMOS.fechaPago2)}};`
  + `{${universoPendiente()}*(${R(COL.proximoPago)}<>"")*((${saldoDeCompras()}-${expresionTramo2()})<>0);`
  + `${universoPendiente()}*(${expresionTramo2()}<>0)})))`

// ═══ EL MODELO EN JS: LA MISMA DECISIÓN, PARA PODER PROBARLA SIN GOOGLE ═══

/**
 * LOS DÍAS EN QUE SALE LA PLATA DE UNA FILA. Uno, o dos si hay segundo tramo con fecha propia.
 *
 * @param {any[]} fila una fila de Compras (A..AN), leída sin formatear
 * @returns {Array<{dia:any, monto:number}>} sin los tramos de importe cero
 */
export function tramosDeLaFila(fila = []) {
  const saldo = num(fila[COL.saldo])
  const tramo2 = tramo2DeLaFila(fila)
  const tramos = [{ dia: fila[COL.proximoPago], monto: saldo - tramo2 }]
  if (tramo2 !== 0) tramos.push({ dia: fila[COL_TRAMOS.fechaPago2], monto: tramo2 })
  return tramos.filter((t) => t.monto !== 0)
}

/** Lo que falta del segundo tramo, en JS. La MISMA decisión que `expresionTramo2`. */
export function tramo2DeLaFila(fila = []) {
  const v = fila[COL_TRAMOS.fechaPago2]
  const w = num(fila[COL_TRAMOS.parcial2])
  return typeof v === 'number' && w < 0 ? -w : 0
}

/** ¿Esta fila es deuda comercial viva? El mismo filtro que la sección 1, con el mismo criterio. */
export const esDelUniverso = (fila = []) =>
  txt(fila[COL.estado]) === PENDIENTE && txt(fila[COL.comercial]) === '1'

/** La clave de agrupamiento. Un número de serie y el texto "16/09" NO son el mismo día. */
const claveDelDia = (v) => (typeof v === 'number' ? `n:${v}` : `t:${txt(v)}`)

/**
 * EL CUADRO, CALCULADO: una entrada por día con su total, su apertura por instrumento y sus nombres.
 *
 * `sinDia` es la plata que NO entra al cuadro porque su fecha de pago está vacía. No se esconde ni se
 * reparte: se devuelve aparte para que el generador la grite y para que el control del pie la
 * denuncie en el archivo. Repartirla "por prorrateo" sería fabricar una fecha de pago.
 *
 * @param {any[][]} filas las filas de Compras desde la 4
 * @returns {{dias:Array<{dia:any, esFecha:boolean, total:number, porMedio:Object<string,number>,
 *            proveedores:string[], otrosMedios:number}>, sinDia:{n:number, monto:number,
 *            proveedores:string[]}, total:number}}
 */
export function diasQueSalen(filas = []) {
  const grupos = new Map()
  const sinDia = { n: 0, monto: 0, proveedores: [] }
  let total = 0
  for (const fila of filas ?? []) {
    if (!esDelUniverso(fila)) continue
    const proveedor = txt(fila[COL.proveedor])
    const medio = txt(fila[COL.tipoPago])
    for (const { dia, monto } of tramosDeLaFila(fila)) {
      total += monto
      if (txt(dia) === '') {
        sinDia.n += 1
        sinDia.monto += monto
        if (proveedor && !sinDia.proveedores.includes(proveedor)) sinDia.proveedores.push(proveedor)
        continue
      }
      const g = grupoDelDia(grupos, dia)
      g.total += monto
      if (MEDIOS_DEL_DIA.includes(medio)) g.porMedio[medio] += monto
      else g.otrosMedios += monto
      if (proveedor && !g.proveedores.includes(proveedor)) g.proveedores.push(proveedor)
    }
  }
  return { dias: [...grupos.values()].sort(ordenDeDias), sinDia, total }
}

function grupoDelDia(grupos, dia) {
  const k = claveDelDia(dia)
  if (!grupos.has(k)) {
    grupos.set(k, {
      dia, esFecha: typeof dia === 'number', total: 0, otrosMedios: 0, proveedores: [],
      porMedio: Object.fromEntries(MEDIOS_DEL_DIA.map((m) => [m, 0])),
    })
  }
  return grupos.get(k)
}

/** Los números primero y en orden, después los textos: es el orden de `SORT` de Sheets. */
function ordenDeDias(a, b) {
  if (a.esFecha && b.esFecha) return a.dia - b.dia
  if (a.esFecha !== b.esFecha) return a.esFecha ? -1 : 1
  return String(a.dia).localeCompare(String(b.dia))
}

/**
 * LAS FILAS CUYO SEGUNDO TRAMO NO ENTRA EN EL SALDO. Un `Monto Parcial 2` entre paréntesis más grande
 * que lo que se debe deja el primer tramo negativo: no es un pago por adelantado, es una carga mal
 * hecha. Se reporta antes de escribir; el cuadro la muestra igual, entre paréntesis.
 *
 * @returns {Array<{proveedor:string, saldo:number, tramo2:number}>} vacío = está bien
 */
export function tramosQueNoEntran(filas = []) {
  return (filas ?? [])
    .filter(esDelUniverso)
    .map((f) => ({ proveedor: txt(f[COL.proveedor]), saldo: num(f[COL.saldo]), tramo2: tramo2DeLaFila(f) }))
    .filter((r) => r.tramo2 > r.saldo)
}

/**
 * LOS DÍAS QUE VAN A SALIR SIN UN SOLO NOMBRE — el agujero que el pivot publicaba.
 *
 * El filtro es estado y comercial: NO exige nombre de proveedor. Una compra pendiente sin nombre
 * entra igual —la plata no se esconde— pero deja la columna que contesta "a quiénes" en blanco. No
 * aborta nada: se grita antes de escribir y se corrige en Compras.
 *
 * @param {{dias:Array<{dia:any, proveedores:string[]}>}} modelo
 */
export const diasSinNombre = (modelo = { dias: [] }) => (modelo.dias ?? []).filter((d) => d.proveedores.length === 0)

/** Los medios de pago con plata pendiente que NINGUNA columna del cuadro muestra. */
export function mediosSinColumna(filas = []) {
  const otros = new Map()
  for (const f of filas ?? []) {
    if (!esDelUniverso(f)) continue
    const medio = txt(f[COL.tipoPago])
    if (MEDIOS_DEL_DIA.includes(medio)) continue
    const monto = tramosDeLaFila(f).reduce((a, t) => a + t.monto, 0)
    if (monto === 0) continue
    otros.set(medio || '(vacío)', (otros.get(medio || '(vacío)') ?? 0) + monto)
  }
  return [...otros.entries()].map(([medio, monto]) => ({ medio, monto })).sort((a, b) => b.monto - a.monto)
}

// ═══ LAS FÓRMULAS DE CADA CELDA ═══

/**
 * EL DÍA. Se saca por posición de la lista viva, no se pega: cuando una deuda se paga, el día
 * desaparece de la lista y todo el cuadro sube una fila solo, sin dejar un hueco.
 *
 * El índice sale de `ROW()`, no de un número tipeado: si alguien inserta una fila arriba del cuadro,
 * la referencia absoluta se corrige sola y cada fila sigue pidiendo el día que le toca.
 *
 * @param {number} primeraFila la primera fila de días, base 1
 */
export const formulaDia = (primeraFila) =>
  `=IFERROR(INDEX(${expresionDias()};ROW()-ROW($A$${primeraFila})+1);"")`

/** Lo que sale ese día por un instrumento. El cero lo dibuja el formato como "—", no la fórmula. */
export function formulaMedio(medio, fila) {
  const dia = `$A${fila}`
  return `=IF(${dia}="";"";SUMPRODUCT(${universoPendiente()}*(${R(COL.tipoPago)}="${medio}")`
    + `*${expresionMontoDelDia(dia)}))`
}

/**
 * EL NÚMERO QUE DECIDE. No es `SUM(B:E)`: se calcula sobre el universo entero, así que un medio de
 * pago sin columna entra igual. Que los dos caminos no coincidan es exactamente lo que el control del
 * pie compara — un control no se valida contra la información que él mismo produce.
 */
export function formulaTotalDelDia(fila) {
  const dia = `$A${fila}`
  return `=IF(${dia}="";"";SUMPRODUCT(${universoPendiente()}*${expresionMontoDelDia(dia)}))`
}

/** A quiénes. `UNIQUE` porque un proveedor con tres facturas el mismo día es un solo pago. */
export function formulaQuienes(fila) {
  const dia = `$A${fila}`
  return `=IF(${dia}="";"";IFERROR(TEXTJOIN(" · ";TRUE;UNIQUE(FILTER(${R(COL.proveedor)};`
    + `${universoPendiente()}*${expresionFilaDelDia(dia)})));""))`
}

/** El total de una columna del cuadro. */
export const formulaTotalColumna = (letra, desde, hasta) => `=SUM($${letra}$${desde}:$${letra}$${hasta})`

/**
 * EL CONTROL, EN UNA SOLA LÍNEA Y CON DOS PREGUNTAS INDEPENDIENTES.
 *
 *   1. ¿Los días suman toda la deuda? El otro camino es `SUM(Compras!AL)`, que no pasa por ninguna
 *      de las fórmulas del cuadro. Si falta plata: hay facturas sin fecha de pago, o aparecieron más
 *      días que filas tiene el cuadro y hay que volver a correr el generador.
 *   2. ¿Los cuatro instrumentos explican el total? Si no, hay deuda que sale por un medio sin columna.
 *
 * `ROUND(…;0)` para que una diferencia de centavos no encienda una alerta que después nadie mira.
 */
export function formulaControlPorDia({ filaTotal, primeraFila, ultimaFila }) {
  const total = `$${letraDeColumna(COL_TOTAL_DIA)}$${filaTotal}`
  const medios = `SUM($B$${filaTotal}:$${letraDeColumna(MEDIOS_DEL_DIA.length)}$${filaTotal})`
  const deuda = `SUM(${saldoDeCompras()})`
  // `COUNT` no sirve: cuenta sólo números y dejaría afuera los días que en Compras son texto. Y
  // `COUNTA` cuenta de más: una fórmula que devuelve "" no es una celda vacía para COUNTA.
  const dias = `SUMPRODUCT(($A$${primeraFila}:$A$${ultimaFila}<>"")*1)`
  return `=IF(ROUND(${total}-${deuda};0)<>0;"${ALERTA} el cuadro no muestra "`
    + `&TEXT(${deuda}-${total};"$#,##0")&" de deuda: hay facturas sin fecha de pago, o más días que filas"`
    + `;IF(ROUND(${total}-${medios};0)<>0;"${ALERTA} "&TEXT(${total}-${medios};"$#,##0")`
    + `&" salen por un medio de pago que no tiene columna"`
    + `;"✓ "&${dias}&" días que suman la deuda comercial entera, abierta por los cuatro medios"))`
}

/**
 * EL BLOQUE ENTERO, CON SU ALTO DECLARADO.
 *
 * ═══ POR QUÉ EL ALTO SE DECLARA Y NO SE ESTIMA ═══
 *
 * Las anclas de todo lo que viene abajo se DERIVAN de este alto. Cuando un bloque dice que ocupa
 * menos de lo que escribe, lo de abajo se corre y se pisa — está pasando hoy en la fila 112. Acá
 * `alto` es `filas.length` por construcción y hay una prueba que lo verifica: si alguien agrega una
 * fila y se olvida de contarla, la suite se pone roja antes que el archivo.
 *
 * NO hay filas de colchón entre el último día y el TOTAL, a propósito: un hueco de filas vacías entre
 * dos bloques es lo que el dueño ya reportó como "roto". El cuadro mide exactamente lo que hay, y el
 * día que aparezca uno nuevo lo dice el control del pie hasta que el generador vuelva a correr.
 *
 * @param {{filas:any[][], filaTitulo:number, numeroDeSeccion:number}} o `filaTitulo` base 1
 * @returns {{alto:number, filas:(string|null)[][], filaTitulo:number, filaRotulos:number,
 *            primeraFila:number, ultimaFila:number, filaTotal:number, filaControl:number,
 *            modelo:object}}
 */
export function bloqueQueSaleCadaDia({ filas = [], filaTitulo = 1, numeroDeSeccion = 2 } = {}) {
  const modelo = diasQueSalen(filas)
  const filaRotulos = filaTitulo + 1
  const primeraFila = filaRotulos + 1
  const ultimaFila = primeraFila + Math.max(modelo.dias.length, 1) - 1
  const filaTotal = ultimaFila + 1
  const filaControl = filaTotal + 1
  const ancho = ROTULOS_POR_DIA.length

  const vacia = () => Array.from({ length: ancho }, () => null)
  const salida = [
    [`${numeroDeSeccion} · ${TITULO_POR_DIA}`, ...vacia().slice(1)],
    [...ROTULOS_POR_DIA],
  ]
  for (let f = primeraFila; f <= ultimaFila; f++) {
    salida.push([
      formulaDia(primeraFila),
      ...MEDIOS_DEL_DIA.map((m) => formulaMedio(m, f)),
      formulaTotalDelDia(f),
      formulaQuienes(f),
    ])
  }
  salida.push(['TOTAL', ...Array.from({ length: ancho - 2 }, (_, i) =>
    formulaTotalColumna(letraDeColumna(i + 1), primeraFila, ultimaFila)), null])
  salida.push([formulaControlPorDia({ filaTotal, primeraFila, ultimaFila }), ...vacia().slice(1)])

  return {
    alto: salida.length,
    filas: salida,
    filaTitulo, filaRotulos, primeraFila, ultimaFila, filaTotal, filaControl,
    modelo,
  }
}

/**
 * DÓNDE VA EL BLOQUE Y CUÁNTAS FILAS TIENE DISPONIBLES.
 *
 * Dos anclas, las dos de TEXTO y ninguna salida de una corrida anterior: el título de la sección 1
 * arriba, el título de la sección que sigue abajo. Un generador que se busca a sí mismo se engancha
 * en cualquier lado el día que su propia salida está rota — ya pasó en esta pestaña y quedaron TRES
 * dinámicas donde tenía que haber dos.
 *
 * `existe: false` significa que el bloque todavía no está: su título va donde HOY empieza la sección
 * de abajo, y todo lo de abajo se corre. Es la primera corrida, y es la única en que se inserta tanto.
 *
 * @param {any[][]} visible la pestaña leída con FORMATTED_VALUE desde la fila 1
 * @returns {{sec1:number, filaTitulo:number, siguiente:number, existe:boolean, disponibles:number}}
 */
export function ubicarBloque(visible = []) {
  const fila = (texto) => {
    const buscado = normalizarTitulo(texto)
    const i = (visible ?? []).findIndex((f) => normalizarTitulo((f ?? [])[0]) === buscado)
    return i < 0 ? 0 : i + 1
  }
  const sec1 = fila(TITULO_SECCION_1)
  if (!sec1) {
    throw new Error(`no encontré "${TITULO_SECCION_1}" en la columna A: sin el ancla de arriba no sé`
      + ' dónde empieza lo mío, y una posición supuesta escribe encima de otro bloque. NO escribo.')
  }
  const mio = fila(TITULO_POR_DIA)
  if (mio && mio <= sec1) throw new Error(`el bloque está en la fila ${mio}, ARRIBA de la sección 1: la pestaña no tiene la forma que este generador cree. NO escribo.`)
  const siguiente = filaDelSiguienteTitulo(visible ?? [], mio || sec1)
  if (!siguiente) {
    throw new Error('no encontré el título de la sección que sigue: sin límite de abajo, escribir es'
      + ' pisar otro bloque. NO escribo.')
  }
  const filaTitulo = mio || siguiente
  return { sec1, filaTitulo, siguiente, existe: Boolean(mio), disponibles: siguiente - filaTitulo }
}

/** Las filas que el bloque necesita: su alto más el aire que lo separa de la sección de abajo. */
export const filasQueNecesita = (bloque) => bloque.alto + COLCHON_FINAL

/**
 * EL FORMATO DE CADA COLUMNA DEL CUERPO. Una celda conserva el formato que ya tenía: si el bloque no
 * declara el suyo en cada corrida, hereda el de lo que estuvo antes ahí — así salió `67797,51 |
 * 31/12/1899` en la sección 1. El "$" va sólo en la fila de TOTAL: es la convención de estado
 * financiero que `formato-statement.mjs` define para todo el archivo.
 *
 * @param {{sheetId:number, bloque:object}} o
 * @returns {object[]} requests de `repeatCell`
 */
export function formatosDelBloque({ sheetId, bloque }) {
  if (!Number.isInteger(sheetId)) throw new Error('formatosDelBloque: falta el sheetId')
  const { primeraFila, ultimaFila, filaTotal } = bloque
  const celda = (numberFormat, horizontalAlignment) => ({ userEnteredFormat: { numberFormat, horizontalAlignment } })
  const rango = (desde, hasta, col) => ({
    sheetId, startRowIndex: desde - 1, endRowIndex: hasta, startColumnIndex: col, endColumnIndex: col + 1,
  })
  const campos = 'userEnteredFormat.numberFormat,userEnteredFormat.horizontalAlignment'
  const out = [{ repeatCell: {
    range: rango(primeraFila, ultimaFila, 0),
    cell: celda({ type: 'DATE', pattern: 'dd/mm/yyyy' }, 'LEFT'),
    fields: campos,
  } }]
  for (let c = 1; c <= COL_TOTAL_DIA; c++) {
    out.push({ repeatCell: { range: rango(primeraFila, ultimaFila, c), cell: celda(MONEDA_CUERPO, 'RIGHT'), fields: campos } })
    out.push({ repeatCell: { range: rango(filaTotal, filaTotal, c), cell: celda(MONEDA_TOTAL, 'RIGHT'), fields: campos } })
  }
  out.push({ repeatCell: {
    range: rango(primeraFila, filaTotal, COL_QUIENES),
    cell: celda({ type: 'TEXT', pattern: '@' }, 'LEFT'),
    fields: campos,
  } })
  return out
}
