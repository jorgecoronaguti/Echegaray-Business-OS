// EL ENCABEZADO DE PROVEEDORES — la posición, al estándar de una mesa financiera.
//
// ═══ QUÉ TENÍA DE MALO EL ANTERIOR ═══
//
// 1. NO TENÍA AGING. Ocho líneas contando cuánto se debe y por qué medio se paga, y ni una sola
//    diciendo CUÁNDO vence. Una posición de cuentas a pagar sin vencimiento no se puede usar para
//    decidir: un saldo chico vencido hace 40 días no pesa lo mismo que uno grande a 60 días.
// 2. UNA COLUMNA DE PROSA POR FILA. Doscientos caracteres de explicación al lado de cada número. El
//    dueño las borra a mano una y otra vez —lo dijo textual— y volvían en la corrida siguiente.
//    Acá no hay columna de comentarios: el número que necesita párrafo está mal elegido.
// 3. FÓRMULAS DE 400 CARACTERES. Cada línea repetía cuatro SUMIFS con seis criterios para
//    reconstruir el saldo pendiente. Ese saldo YA lo calcula `Compras!AL` fila por fila desde que
//    existe la columna derivada. Cada línea es ahora un SUMIF sobre AL: se lee, se audita y si el
//    criterio de "qué es deuda" cambia, cambia en UN solo lugar.
// 4. CLASIFICACIÓN INCONSISTENTE. Llamaba "comprometido" al cheque y "directa" al echeq, que es un
//    cheque electrónico. Se reemplaza por el medio de pago tal cual está cargado, sin juicio: quién
//    ya entregó el instrumento se sabe en Cheques Emitidos, no en el "Tipo pago" de Compras.
//
// ═══ LA GEOMETRÍA ═══
//
// Dos bloques uno al lado del otro —el aging a la izquierda, el medio de pago a la derecha— en vez
// de trece líneas apiladas. El encabezado entero entra en la primera pantalla, que es la única que
// alguien mira.

import { TRAMOS, SIN_FECHA } from './proveedores-aging.mjs'
import { formulaDeudaNoMostrada, formulaProveedoresNoMostrados } from './deuda-por-tramos.mjs'
import { ALERTA } from './glifos.mjs'

/** Rótulos de la izquierda, sin el prefijo numérico: el prefijo es del ordenamiento, no de la vista. */
export const FILAS_AGING = Object.freeze(
  [...TRAMOS.map((t) => t.rotulo), SIN_FECHA].map((r) => r.replace(/^\d+\s*·\s*/, '')))

/** Medios de pago. El criterio es UNO: el `Tipo pago` de Compras, sin reinterpretarlo. */
export const MEDIOS = Object.freeze([
  { rotulo: 'Cheque y echeq', criterios: ['Cheque', 'Echeq'] },
  { rotulo: 'Tarjeta de crédito', criterios: ['Tarjeta*'] },
  { rotulo: 'Transferencia', criterios: ['Transferencia'] },
  { rotulo: 'Efectivo', criterios: ['Efectivo'] },
])

const SALDO = 'Compras!$AL$4:$AL'
const TRAMO = 'Compras!$AN$4:$AN'
const MEDIO = 'Compras!$P$4:$P'

/** Fila donde arranca cada cosa. El bloque ocupa 1..FIN y nunca una fila más. */
export const F = Object.freeze({
  titulo: 1, bajada: 2, rotulos: 4, primerTramo: 5,
  get ultimoTramo() { return this.primerTramo + FILAS_AGING.length - 1 },
  get totalAging() { return this.ultimoTramo + 1 },
  get primerMedio() { return this.rotulos + 1 },
  get totalMedios() { return this.primerMedio + MEDIOS.length },
  get arca() { return this.totalAging },
  // La deuda que el cuadro NO muestra, pegada al TOTAL: es la única forma de que se lea junto a él.
  get noMostrada() { return this.totalAging + 1 },
  get control() { return this.totalAging + 2 },
  get fin() { return this.control },
})

/**
 * El encabezado como grilla de 8 columnas (A..H). `null` = celda que se limpia.
 * Ni un solo importe escrito: todo sale de Compras por fórmula.
 * @returns {(string|null)[][]}
 */
export function grillaEncabezado() {
  const g = Array.from({ length: F.fin }, () => Array.from({ length: 8 }, () => null))
  const set = (fila, col, v) => { g[fila - 1][col] = v }

  set(F.titulo, 0, 'Proveedores')
  set(F.bajada, 0, 'Deuda comercial por proveedor. Cada importe es una fórmula sobre Compras: se corrige allá y cambia acá.')

  // ── izquierda: el aging
  set(F.rotulos, 0, '="DEUDA AL "&TEXT(TODAY();"dd/mm/yyyy")')
  set(F.rotulos, 1, 'Saldo')
  set(F.rotulos, 2, '%')
  set(F.rotulos, 3, 'Facturas')
  FILAS_AGING.forEach((rotulo, i) => {
    const f = F.primerTramo + i
    set(f, 0, rotulo)
    // El comodín engancha "1 · Vencido" con "Vencido": el prefijo ordena, no se muestra.
    set(f, 1, `=SUMIF(${TRAMO};"*"&$A${f};${SALDO})`)
    set(f, 2, `=IF($B$${F.totalAging}=0;0;$B${f}/$B$${F.totalAging})`)
    set(f, 3, `=COUNTIF(${TRAMO};"*"&$A${f})`)
  })
  set(F.totalAging, 0, 'TOTAL')
  set(F.totalAging, 1, `=SUM($B${F.primerTramo}:$B${F.ultimoTramo})`)
  set(F.totalAging, 2, `=IF($B$${F.totalAging}=0;0;1)`)
  set(F.totalAging, 3, `=SUM($D${F.primerTramo}:$D${F.ultimoTramo})`)

  // ── derecha: por qué medio sale
  set(F.rotulos, 5, 'CÓMO SE PAGA')
  set(F.rotulos, 6, 'Saldo')
  set(F.rotulos, 7, '%')
  MEDIOS.forEach((m, i) => {
    const f = F.primerMedio + i
    set(f, 5, m.rotulo)
    set(f, 6, '=' + m.criterios.map((c) => `SUMIF(${MEDIO};"${c}";${SALDO})`).join('+'))
    set(f, 7, `=IF($G$${F.totalMedios}=0;0;$G${f}/$G$${F.totalMedios})`)
  })
  set(F.totalMedios, 5, 'TOTAL')
  set(F.totalMedios, 6, `=SUM($G${F.primerMedio}:$G${F.primerMedio + MEDIOS.length - 1})`)
  set(F.totalMedios, 7, `=IF($G$${F.totalMedios}=0;0;1)`)

  // ── LO QUE EL TOTAL DE ARRIBA NO ESTÁ CONTANDO, pegado al total (14/08)
  //
  // El dueño: "proveedores esta considerando mal las columnas de montos adeudados y pagos parciales
  // … los valores son equivocados". Medido: ocho facturas comerciales dicen "Pagado" con el monto
  // pagado en cero y el paréntesis de "Monto Parcial 1" declarando que falta la plata entera —
  // $11.919.063 al 14/08. Las cuatro vistas de esta pestaña cuelgan de `Compras!AL`, que arranca con
  // IF(Estado="Pendiente"; …; 0), así que las ocho valen CERO en todas.
  //
  // NO se suman al TOTAL, y es deliberado: o esas facturas se pagaron y la columna del paréntesis
  // quedó con basura vieja, o no se pagaron y hay $11,9M de deuda invisible. Decidirlo tiene efecto
  // económico y no lo firma un generador. Lo que sí corresponde es que la contradicción esté AL LADO
  // del número que contradice, y no enterrada en un contador al pie de la pestaña — donde estaba, y
  // por eso nadie la vio. El triángulo sólo se enciende si hay algo: un aviso permanente no se lee.
  set(F.noMostrada, 0, `=IF(ROUND($B$${F.noMostrada};0)<=0;"";"${ALERTA} ")&"Dicen ""Pagado"" y falta plata"`)
  set(F.noMostrada, 1, formulaDeudaNoMostrada('monto'))
  set(F.noMostrada, 3, formulaDeudaNoMostrada('n'))
  // Y A QUIÉNES. Estas facturas NO tienen fila en el cuadro que ordena la deuda por proveedor —su
  // saldo vale cero ahí— así que el ranking omite a Gruas San Blas con $5.124.412 y nada lo delata.
  // Va en la F para poder derramar sobre la G y la H, que en esta fila están vacías: son nombres
  // largos y cortarlos deja la pregunta a medias.
  set(F.noMostrada, 5, formulaProveedoresNoMostrados())

  // ── lo que la deuda NO ve: facturado con CAE que Compras no tiene cargado
  set(F.arca, 5, 'Facturado por ARCA que Compras no tiene')
  set(F.arca, 6, '=ARCA_FALTAN_MONTO')
  set(F.arca, 7, '=ARCA_FALTAN_N')

  // ── el control: dos caminos independientes al mismo total.
  // El aging suma por tramo de vencimiento; el medio de pago suma por instrumento. Si difieren, una
  // factura tiene saldo y no cae en ningún tramo, o cae en un medio que nadie declaró.
  set(F.control, 0, `=IF(ROUND($B$${F.totalAging}-$G$${F.totalMedios};0)=0;"✓ el aging y el medio de pago dan el mismo total";"✗ difieren en "&TEXT($B$${F.totalAging}-$G$${F.totalMedios};"$#,##0")&" — hay deuda que un cuadro ve y el otro no")`)
  return g
}
