// LAS SERIES QUE ALIMENTAN LOS GRÁFICOS DE CAJA — DATOS AUXILIARES, EN EL ANEXO, NUNCA PEGADOS.
//
// ═══ POR QUÉ ESTÁN ACÁ Y NO EN CAJA (05/08/2026) ═══
//
// Un gráfico de Sheets no puede leer una fórmula: lee un RANGO. Para dibujar el saldo diario de los
// últimos sesenta días hacen falta sesenta celdas con sesenta fechas y sesenta importes. Eso es una
// matriz, y el dueño fue explícito sobre la portada: *"en CAJA no queda ni una tabla larga ni una
// matriz ni texto técnico"*. Así que la matriz vive en `_CAJA_ANEXO` —que es exactamente para lo que
// existe el anexo— y los gráficos, que flotan sobre CAJA, la leen desde ahí.
//
// ═══ Y POR QUÉ CADA CELDA ES UNA FÓRMULA SOBRE EL LIBRO ═══
//
// La tentación evidente era calcular las series en JavaScript y pegar 120 números. Sería más rápido y
// estaría mal por la regla de oro número 5: un número pegado sólo cambia cuando corre el agente, y
// este archivo tiene un timer que ya estuvo detenido semanas. Un gráfico alimentado por valores
// pegados dibuja con precisión la caja de hace diez días.
//
// Cada punto es un `terminoLibro` sobre `_MOVIMIENTOS` —la misma fuente de la que cuelgan las
// tarjetas, la escalera y los dos cash flow—, así que el gráfico y la tabla no pueden discrepar: no
// hay dos cálculos, hay uno.
//
// ═══ CÓMO SE RECONSTRUYE EL PASADO SIN GUARDAR UN HISTÓRICO ═══
//
// No existe una tabla de saldos diarios y no hace falta: el saldo al cierre del día `d` es el saldo de
// HOY menos todo lo REAL que se movió después de `d`. Cada fila es independiente —no es una cadena—
// así que una fila rota no arrastra a las demás, que es lo que pasa con un saldo corrido.
//
// LA PROYECCIÓN ES LA MISMA CUENTA HACIA ADELANTE y con los estados dados vuelta: suma lo que
// TODAVÍA NO pasó por el banco (`COMPROMETIDO`, `PROYECTADO`, `VENCIDO`). `REAL` queda afuera de la
// proyección y es lo único que entra en la historia: sin esa simetría, el día de hoy —donde las dos
// curvas se tocan— contaría dos veces la misma plata.

import { terminoLibro, LIBRO } from './libro-sumas.mjs'
import { DESDE_CAJA } from './caja-anexo-nombres.mjs'
import { NO_REAL } from './caja-tarjetas.mjs'

/** Cuántos días mira cada curva. El dueño pidió 60 y 60: dos meses a cada lado del día de hoy. */
export const DIAS_HISTORIA = 60
export const DIAS_PROYECCION = 60
/** Cuántas contrapartes entran en cada gráfico de concentración. Cinco: la sexta ya no se lee. */
export const TOP_N = 5
/** La ventana de los dos gráficos de concentración, en días. */
export const DIAS_TOP = 30

/**
 * LOS RÓTULOS SON EL CONTRATO. `caja-pestana.mjs` no sabe en qué fila del anexo quedó cada serie:
 * lee la columna A y las ubica POR ESTE TEXTO. Es la misma regla que el resto del archivo —anclar en
 * la posición es lo que ya dejó dos cash flow con el saldo inicial en blanco—, y acá importa el
 * doble: un rango de gráfico mal apuntado dibuja una curva perfecta de datos equivocados.
 */
export const ROTULOS = Object.freeze({
  historia: `Concepto · saldo real, últimos ${DIAS_HISTORIA} días`,
  proyeccion: `Concepto · saldo proyectado, próximos ${DIAS_PROYECCION} días`,
  pagos: `Concepto · pagos, top contrapartes a ${DIAS_TOP} días`,
  cobranzas: `Concepto · cobranzas, top contrapartes a ${DIAS_TOP} días`,
})

/** Cuántas filas de datos tiene cada serie, para poder ubicarlas sin volver a leer nada. */
export const LARGO = Object.freeze({
  historia: DIAS_HISTORIA, proyeccion: DIAS_PROYECCION, pagos: TOP_N, cobranzas: TOP_N,
})

/** Las columnas del anexo que usan los gráficos. La F ya está formateada como fecha y la C como plata. */
export const COL = Object.freeze({ rotulo: 1, importe: 3, fecha: 6 }) // 1-based, como los pide la API

/** Un desplazamiento de días desde hoy, escrito como lo escribiría una persona. */
const dia = (n) => (n === 0 ? 'TODAY()' : n > 0 ? `TODAY()+${n}` : `TODAY()-${-n}`)

/**
 * NÚCLEO PURO: el saldo al cierre del día `d`, reconstruido desde la posición de hoy.
 *
 * `d` se expresa en días respecto de hoy (negativo = pasado). La ventana que se resta arranca en el
 * día SIGUIENTE a `d` —lo que pasó el mismo día `d` ya está adentro de su saldo de cierre— y termina
 * mañana, para incluir todo lo de hoy. Con `d = 0` la ventana queda vacía y el punto vale exactamente
 * el total de CAJA: las dos curvas se tocan en el día de hoy sin un salto que habría que explicar.
 */
export const saldoHistorico = (d) =>
  `=${DESDE_CAJA.total}-${terminoLibro({ desde: dia(d + 1), hasta: dia(1), estados: ['REAL'] })}`

/** NÚCLEO PURO: el saldo proyectado al día `d` (positivo = futuro), sumando lo que todavía no pasó. */
export const saldoProyectado = (d) =>
  `=${DESDE_CAJA.total}+${terminoLibro({ desde: 'TODAY()', hasta: dia(d + 1), estados: NO_REAL })}`

/**
 * NÚCLEO PURO: el top de contrapartes por signo, con SORTN/QUERY sobre el libro y NUNCA con valores
 * pegados.
 *
 * ═══ POR QUÉ QUERY Y NO UNA COLUMNA AUXILIAR CON SUMIF ═══
 *
 * Agrupar por contraparte necesita primero la lista de contrapartes ÚNICAS, y esa lista cambia sola:
 * una columna auxiliar con nombres pegados es un ranking que se congela el día que aparece un
 * proveedor nuevo. `QUERY` agrupa y ordena en la misma expresión, así que no hay nada que mantener.
 *
 * ═══ LAS FECHAS VIAJAN COMO TEXTO ISO, Y ES OBLIGATORIO ═══
 *
 * El lenguaje de QUERY no entiende `TODAY()`: pide un literal `date 'aaaa-mm-dd'`. Se arma con
 * `TEXT(TODAY();"yyyy-mm-dd")` —no con el formato dd/mm del archivo— porque el que lee ese literal es
 * el motor de QUERY, que es siempre en inglés, y no el locale es-AR de la planilla.
 *
 * NO DERRAMA: se pide `INDEX(...;k;col)`, una celda por vez. Un QUERY que derrama sobre las celdas de
 * abajo es incontrolable para un generador que reescribe la pestaña entera.
 *
 * @param {1|-1} signo entra (1) o sale (−1)
 * @param {number} k la posición del ranking, 1-based
 * @param {1|2} col 1 = el nombre de la contraparte, 2 = el importe
 */
export function topContraparte(signo, k, col) {
  const c = LIBRO.col
  const q = `select ${c.contraparte}, sum(${c.importe}) `
    + `where ${c.signo} = ${signo} and ${c.estado} <> 'REAL' and ${c.contraparte} <> '' `
    + `and ${c.fecha} >= date '"&TEXT(TODAY();"yyyy-mm-dd")&"' `
    + `and ${c.fecha} < date '"&TEXT(TODAY()+${DIAS_TOP};"yyyy-mm-dd")&"' `
    + `group by ${c.contraparte} order by sum(${c.importe}) desc limit ${TOP_N}`
  return `=IFERROR(INDEX(QUERY(${LIBRO.pestana}!$A$${LIBRO.fila0}:$P;"${q}";0);${k};${col});"")`
}

/**
 * EL BLOQUE DEL ANEXO. Recibe el constructor de grilla del anexo (`h.push` devuelve la fila real).
 *
 * @param {{push:Function}} h
 * @returns {{fHist0:number,fHist1:number,fProy0:number,fProy1:number,fPag0:number,fPag1:number,fCob0:number,fCob1:number}}
 */
export function bloqueSeries(h) {
  const { push } = h
  push([`A10 · SERIES DE LOS GRÁFICOS DE CAJA — LAS CALCULA \`${LIBRO.pestana}\`, NO SE PEGAN`])

  push([ROTULOS.historia, '', 'Saldo', '', '', 'Día', 'Saldo de hoy menos lo REAL posterior a ese día'])
  const fHist0 = h.n + 1
  // De más viejo a más nuevo: un eje temporal que va para atrás se lee mal y Sheets lo dibuja igual.
  for (let i = DIAS_HISTORIA - 1; i >= 0; i--) push(['', '', saldoHistorico(-i), '', '', `=${dia(-i)}`])
  const fHist1 = h.n

  push([ROTULOS.proyeccion, '', 'Saldo', '', '', 'Día', 'Saldo de hoy más lo comprometido/proyectado hasta ese día'])
  const fProy0 = h.n + 1
  for (let i = 1; i <= DIAS_PROYECCION; i++) push(['', '', saldoProyectado(i), '', '', `=${dia(i)}`])
  const fProy1 = h.n

  push([ROTULOS.pagos, '', 'A pagar', '', '', '', `Top ${TOP_N} por contraparte, próximos ${DIAS_TOP} días`])
  const fPag0 = h.n + 1
  for (let k = 1; k <= TOP_N; k++) push([topContraparte(-1, k, 1), '', topContraparte(-1, k, 2)])
  const fPag1 = h.n

  push([ROTULOS.cobranzas, '', 'A cobrar', '', '', '', `Top ${TOP_N} por contraparte, próximos ${DIAS_TOP} días`])
  const fCob0 = h.n + 1
  for (let k = 1; k <= TOP_N; k++) push([topContraparte(1, k, 1), '', topContraparte(1, k, 2)])
  const fCob1 = h.n

  return { fHist0, fHist1, fProy0, fProy1, fPag0, fPag1, fCob0, fCob1 }
}

/**
 * NÚCLEO PURO: dónde quedó cada serie dentro del anexo, buscando POR RÓTULO en su columna A.
 *
 * Devuelve `null` para la serie que no encuentre, y el que llama tiene que DECIR que no la dibuja. Un
 * gráfico que no aparece sin que nada explique por qué es el peor estado posible: no se puede
 * arreglar ni descartar. Ya pasó con este mismo módulo.
 *
 * @param {Array<Array<any>>} colA los valores de la columna A del anexo, desde la fila 1
 * @returns {{historia:{f0:number,f1:number}|null, proyeccion:…, pagos:…, cobranzas:…}}
 */
export function ubicarSeries(colA = []) {
  const buscar = (rotulo, largo) => {
    const i = colA.findIndex((f) => String(f?.[0] ?? '').trim() === rotulo)
    // El encabezado tiene que existir Y tener sus filas debajo: media serie dibuja media verdad.
    if (i < 0 || colA.length < i + 1 + largo) return null
    return { f0: i + 2, f1: i + 1 + largo }
  }
  return {
    historia: buscar(ROTULOS.historia, LARGO.historia),
    proyeccion: buscar(ROTULOS.proyeccion, LARGO.proyeccion),
    pagos: buscar(ROTULOS.pagos, LARGO.pagos),
    cobranzas: buscar(ROTULOS.cobranzas, LARGO.cobranzas),
  }
}
