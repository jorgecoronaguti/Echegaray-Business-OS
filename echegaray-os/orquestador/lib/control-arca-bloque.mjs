// EL BLOQUE "CONTROL CONTRA ARCA" QUE COMPARTEN MATERIALES, ESTRUCTURA Y RECURRENTES.
//
// Vive en lib/ y no en cada script por la razón de siempre: el mismo control tiene que significar lo
// mismo en las tres pestañas. Escrito tres veces, empieza a divergir — ya pasó con el cruce de ARCA,
// que estaba duplicado y una copia excluía las notas de crédito y la otra no.
//
// ═══ NI UN SOLO IMPORTE ESCRITO ═══
//
// Todas las líneas son fórmulas sobre dos pestañas réplica que el OS escribe desde Postgres:
// `_ARCA_RAW` (los comprobantes del libro de IVA, tal como ARCA los tiene) y `_CRUCE_ARCA` (una fila
// por discrepancia, con su comprobante y su monto). Se trae el INSUMO, no el RESULTADO: el día que se
// replique un mes nuevo, estas celdas se mueven solas.
//
// ═══ LA VENTANA TAMBIÉN ES UNA FÓRMULA ═══
//
// El primer impulso fue escribir "2026-01 a 2026-07" en el rótulo. Eso envejece igual que un importe
// pegado: se replica agosto y el control sigue diciendo que compara hasta julio, comparando de más.
// La ventana sale de `_ARCA_RAW`: primer día del mes del comprobante más viejo, último día del mes
// del más nuevo. Se estira sola.

import { R, IMPORTE } from './arca-formula.mjs'
import { RUBROS_SIN_COMPROBANTE_FISCAL } from './cruce-arca-compras.mjs'

/** La pestaña de discrepancias. La escribe scripts/cruce-arca-pestana.mjs. */
export const C = '_CRUCE_ARCA'

/** Las columnas de `_CRUCE_ARCA`. El orden es contrato: estas fórmulas lo referencian. */
export const CC = { periodo: 'A', direccion: 'B', fecha: 'C', proveedor: 'D', cuit: 'E', comprobante: 'F', importe: 'G', rubro: 'H', fila: 'I', accion: 'J' }
export const CFILA0 = 4

/** Los dos valores de la columna "Dirección". Un typo acá deja una línea en cero sin dar error. */
export const DIR = Object.freeze({ arcaSinCompras: 'ARCA sin Compras', comprasSinArca: 'Compras sin ARCA' })

/** Columnas de Compras que este bloque mira. La fecha es la de FACTURA, nunca la de caja. */
const COL_FACTURA = 'Compras!$C$4:$C'
const COL_RUBRO = 'Compras!$AC$4:$AC'
const COL_TOTAL = 'Compras!$O$4:$O'

const rg = (col) => `${C}!$${col}$${CFILA0}:$${col}`

/** Primer día del mes más viejo que ARCA replicó en el libro de compras. */
export const DESDE = `EOMONTH(MINIFS(${R}!$C$4:$C;${R}!$B$4:$B;"Compras");-1)+1`
/** Último día del mes más nuevo. */
export const HASTA = `EOMONTH(MAXIFS(${R}!$C$4:$C;${R}!$B$4:$B;"Compras");0)`
/** ¿ARCA trajo algo? Sin esto no hay control posible y la pestaña tiene que decirlo. */
export const HAY_FUENTE = `COUNTIFS(${R}!$B$4:$B;"Compras")>0`

/** Compras del universo de la pestaña, por fecha de FACTURA y dentro de la ventana de ARCA. */
export function comprasDevengado(rubros) {
  return rubros
    .map((r) => `SUMIFS(${COL_TOTAL};${COL_RUBRO};"${r}";${COL_FACTURA};">="&${DESDE};${COL_FACTURA};"<="&${HASTA})`)
    .join('+')
}

/** Lo que este cuadro tiene cargado y ARCA no respalda, restringido a los rubros de la pestaña. */
export function sinRespaldo(rubros) {
  return rubros
    .map((r) => `SUMIFS(${rg(CC.importe)};${rg(CC.direccion)};"${DIR.comprasSinArca}";${rg(CC.rubro)};"${r}")`)
    .join('+')
}

/** Cuántas filas son — un monto sin cantidad no se puede salir a buscar. */
export function sinRespaldoN(rubros) {
  return rubros
    .map((r) => `COUNTIFS(${rg(CC.direccion)};"${DIR.comprasSinArca}";${rg(CC.rubro)};"${r}")`)
    .join('+')
}

/**
 * NÚCLEO PURO: el bloque entero, como filas de `[rótulo, fórmula, nota]`.
 *
 * @param {object} args
 * @param {string} args.titulo  el título de sección, con su número
 * @param {string[]} args.rubros  los rubros de Compras que esta pestaña cubre
 * @param {number} args.fila0  la fila REAL de la planilla donde va la primera fila del bloque —
 *   las fórmulas se referencian entre sí y una fila corrida las deja apuntando a otra cosa
 * @returns {(string|number)[][]}
 */
export function bloqueControlArca({ titulo, rubros, fila0 }) {
  const f = (n) => fila0 + n
  const filas = []
  filas.push([titulo])
  filas.push(['Contra el libro de IVA COMPRAS de ARCA — la única fuente de este archivo que el OS no escribe. Ventana DEVENGADA, por fecha de FACTURA: ARCA imputa por período de DDJJ y el cuadro de arriba suma por fecha de CAJA. No son el mismo número y no tienen por qué serlo.'])

  filas.push([`="Ventana comparable · "&IF(${HAY_FUENTE};TEXT(${DESDE};"mmm yyyy")&" a "&TEXT(${HASTA};"mmm yyyy");"ARCA no replicó ningún comprobante")`])
  filas.push(['ARCA · libro de compras, neto de notas de crédito', `=SUMPRODUCT((${R}!$B$4:$B="Compras")*${IMPORTE})`])
  filas.push(['Compras · lo de esta pestaña, por fecha de FACTURA', `=${comprasDevengado(rubros)}`])
  filas.push(['⇒ Diferencia agregada — no es el hallazgo, es el saldo de las dos direcciones', `=ROUND(B${f(4)}-B${f(3)};0)`])

  // ═══ LAS DOS DIRECCIONES, SEPARADAS ═══
  // Un neto de cero puede esconder $10M de cada lado. Son dos defectos distintos, se arreglan en dos
  // lugares distintos, y por eso nunca se muestran restados.
  // EL BLOQUE TIENE DOS COLUMNAS Y NADA MÁS: rótulo e importe.
  //
  // La primera versión ponía el recuento en una columna C. Los tests de Estructura y Recurrentes la
  // rechazaron, y tienen razón: en este archivo toda columna satélite al lado de un número terminó
  // siendo prosa que el dueño borra a mano y el generador le devuelve en la corrida siguiente. Los
  // recuentos —que hacen falta, porque un monto sin cantidad no se puede salir a buscar— van adentro
  // del veredicto, que es UNA celda y se lee de corrido.
  filas.push(['→ ARCA registró y Compras NO tiene (de Compras entera: sin cargar todavía no tienen rubro)',
    `=SUMIFS(${rg(CC.importe)};${rg(CC.direccion)};"${DIR.arcaSinCompras}")`])
  filas.push(['→ Compras tiene cargado y ARCA NO respalda (de esta pestaña)',
    `=${sinRespaldo(rubros)}`])

  // ═══ LAS LÍNEAS TIENEN QUE RECONSTRUIR LA DIFERENCIA ═══
  //
  // Sin estas dos, la pestaña muestra una diferencia agregada y dos direcciones que no suman a ella, y
  // el que mira se queda con un número que nadie puede explicar — la misma enfermedad que este bloque
  // vino a curar. Medido el 04/08 el residuo es −$31.096.502: no es ruido, es una cifra con
  // significado propio (facturas cargadas por un importe distinto al que ARCA registró).
  filas.push(['· Notas de crédito del libro — restan del total de ARCA, no son carga faltante',
    `=SUMPRODUCT((${R}!$B$4:$B="Compras")*(${R}!$F$4:$F=-1)*${R}!$M$4:$M)`])
  filas.push(['· El resto — facturas cargadas por un IMPORTE distinto al que ARCA registró',
    `=ROUND(B${f(5)}-(B${f(7)}-B${f(6)}+B${f(8)});0)`])

  // ═══ LO QUE NO ES ERROR, DECLARADO Y APARTE ═══
  filas.push(['ⓘ Fuera de ARCA por naturaleza — jornales, cargas sociales, sueldos, impuestos: no llevan factura, no es un hueco',
    `=${RUBROS_SIN_COMPROBANTE_FISCAL.map((r) => `SUMIFS(${COL_TOTAL};${COL_RUBRO};"${r}";${COL_FACTURA};">="&${DESDE};${COL_FACTURA};"<="&${HASTA})`).join('+')}`])
  filas.push(['ⓘ Facturas de esta pestaña POSTERIORES a la ventana — la fuente todavía no llegó, no es un hueco',
    `=${rubros.map((r) => `SUMIFS(${COL_TOTAL};${COL_RUBRO};"${r}";${COL_FACTURA};">"&${HASTA})`).join('+')}`])

  // ═══ EL VEREDICTO ═══
  // Sin fuente NO hay ✓. Un control que se pone verde cuando el libro no llegó afirma que está todo
  // bien justamente cuando no se puede saber — es el peor de los tres estados posibles.
  const nArca = `COUNTIFS(${rg(CC.direccion)};"${DIR.arcaSinCompras}")`
  filas.push([`=IF(NOT(${HAY_FUENTE});"⚠ NO PUEDO VERIFICAR — ARCA no replicó comprobantes: este control no afirma nada";IF(AND(ROUND(B${f(6)};0)=0;ROUND(B${f(7)};0)=0);"✓ cada comprobante de ARCA está en Compras y cada carga de esta pestaña tiene respaldo fiscal";"✗ "&TEXT(B${f(6)};"$#,##0")&" en "&${nArca}&" comprobante(s) que ARCA registró y Compras no tiene · "&TEXT(B${f(7)};"$#,##0")&" en "&${sinRespaldoN(rubros)}&" fila(s) cargadas acá sin comprobante en ARCA — cada una con su número y su monto en ${C}"))`])
  return filas
}

/** Cuántas filas ocupa el bloque. Quien lo inserta necesita saberlo ANTES de armar la grilla. */
export const ALTO_BLOQUE = 13
