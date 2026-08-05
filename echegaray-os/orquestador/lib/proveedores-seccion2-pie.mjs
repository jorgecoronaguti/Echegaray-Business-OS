// EL PIE DE LA CUENTA CORRIENTE: LA LÍNEA DE RESTO Y EL TOTAL.
//
// POR QUÉ EXISTE (04/08). La sección 2 pasa a listar sólo los proveedores que acumulan el 95% del
// gasto (ver `proveedores-concentracion.mjs`). Cortar sin más sería mentir por omisión: el cuadro
// diría "$272M" donde la empresa compró "$286M". El pie es lo que hace que el corte sea honesto.
//
// LAS DOS LÍNEAS SON FÓRMULAS, NUNCA NÚMEROS PEGADOS:
//
//   TOTAL  = SUMIFS sobre Compras. Es un CAMINO INDEPENDIENTE de la dinámica: si mañana el filtro de
//            la dinámica se rompe (la trampa del `condition`, que la deja perfecta y vacía), el total
//            sigue diciendo la verdad y la diferencia salta a la vista en el mismo cuadro.
//   RESTO  = TOTAL − la suma de lo listado. Por construcción, listado + resto = TOTAL AL PESO. No hay
//            forma de que el corte pierda plata, ni hoy ni con los datos de dentro de un año.
//
// LA CANTIDAD DEL RÓTULO TAMBIÉN ES FÓRMULA. Escribir "(58)" a mano es un número pegado que empieza a
// mentir con el primer proveedor nuevo, y este cuadro se mira para decidir con quién se negocia. Va
// envuelta en IFERROR: si algún día FILTER no resuelve, el rótulo se degrada a la versión sin conteo
// en vez de dejar un #ERROR! en el medio del cuadro.
//
// LAS COLUMNAS DE COMPRAS SE RESUELVEN POR ENCABEZADO, NUNCA POR POSICIÓN. El dueño edita Compras y
// corre columnas; una letra tipeada es lo que un día dejó la deuda en cero sin dar error. Ojo: la
// fila 3 de Compras tiene encabezados REPETIDOS ("Rubro de caja" en AB y AC) — se toma el primero, y
// los cuatro que usa este pie son únicos.

import { SEP } from './proveedores-deuda-viva.mjs'

/** Los encabezados de Compras que necesita el pie. El contrato con la pestaña, en un solo lugar. */
export const ENCABEZADOS = Object.freeze({
  proveedor: 'Proveedor',
  total: 'Total',
  comercial: '¿Proveedor comercial? (OS)',
  cuit: 'CUIT (OS)',
})

/** La letra de una columna por su índice base 0. Calculada, nunca tipeada. */
export function letraDeColumna(i) {
  if (!Number.isInteger(i) || i < 0) throw new Error(`letraDeColumna: índice inválido (${i})`)
  let n = i
  let s = ''
  do { s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) - 1 } while (n >= 0)
  return s
}

const normal = (s) => String(s ?? '').trim().toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

/**
 * DÓNDE ESTÁ CADA COLUMNA DE COMPRAS HOY, por su encabezado.
 *
 * @param {Array<any>} encabezados  la fila 3 de Compras
 * @returns {{proveedor:number, total:number, comercial:number, cuit:number}} índices base 0
 */
export function columnasDeCompras(encabezados = []) {
  const idx = {}
  for (const [clave, rotulo] of Object.entries(ENCABEZADOS)) {
    const i = encabezados.findIndex((c) => normal(c) === normal(rotulo))
    if (i < 0) throw new Error(`columnasDeCompras: no encontré "${rotulo}" en Compras: no escribo a ciegas`)
    idx[clave] = i
  }
  return idx
}

/**
 * LAS REFERENCIAS ABIERTAS a Compras. Abiertas a propósito: un rango con fila final deja de ver lo
 * que se carga mañana y miente por omisión, que es el defecto más caro de esta pestaña.
 *
 * @param {{proveedor:number, total:number, comercial:number, cuit:number}} idx
 * @param {number} primeraFila  la primera fila de datos de Compras (4)
 */
export function referencias(idx, primeraFila = 4) {
  const r = (i) => `Compras!$${letraDeColumna(i)}$${primeraFila}:$${letraDeColumna(i)}`
  return { proveedor: r(idx.proveedor), total: r(idx.total), comercial: r(idx.comercial), cuit: r(idx.cuit) }
}

/**
 * EL PIE COMPLETO: dos filas, cuatro columnas, todo fórmula.
 *
 * @param {{R:object, p0:number, p1:number, fResto:number, fTotal:number}} o  filas en base 1
 * @returns {{resto:Array<string|null>, total:Array<string|null>}} `null` = celda mía y va vacía
 */
export function filasDelPie({ R, p0, p1, fResto, fTotal }) {
  if (!(p1 >= p0 && fResto === p1 + 1 && fTotal === p1 + 2)) {
    throw new Error(`filasDelPie: el pie tiene que ir pegado al último listado (p0=${p0} p1=${p1} resto=${fResto} total=${fTotal})`)
  }
  const listadoImporte = `SUM($C$${p0}:$C$${p1})`
  const listadoCuenta = `SUM($D$${p0}:$D$${p1})`
  const distintos = `COUNTUNIQUE(FILTER(${R.proveedor}${SEP}${R.comercial}=1${SEP}${R.proveedor}<>""))`
  const rotulo = `"Resto de proveedores comerciales ("`
    + `&TEXT(${distintos}-COUNTA($A$${p0}:$A$${p1})${SEP}"0")&")"`
  return {
    resto: [
      `=IFERROR(${rotulo}${SEP}"Resto de proveedores comerciales")`,
      null,
      `=$C$${fTotal}-${listadoImporte}`,
      `=$D$${fTotal}-${listadoCuenta}`,
    ],
    total: [
      'TOTAL COMPRADO A PROVEEDORES COMERCIALES',
      null,
      `=SUMIFS(${R.total}${SEP}${R.comercial}${SEP}1)`,
      `=COUNTIFS(${R.comercial}${SEP}1${SEP}${R.proveedor}${SEP}"<>")`,
    ],
  }
}
