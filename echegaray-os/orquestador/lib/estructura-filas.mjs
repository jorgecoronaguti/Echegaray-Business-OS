// LO QUE LA EMPRESA SE GASTA EN SÍ MISMA, MES A MES — UNA SOLA DEFINICIÓN PARA LAS DOS FAMILIAS.
//
// ═══ POR QUÉ EXISTE (07/09/2026) ═══
//
// Pedido del dueño: *«unificá las pestañas "Recurrentes" y "Estructura", vas a tener que eliminar
// una y rehacerla respetando mi regla de oro de diseño»*.
//
// Las dos pestañas contestaban LA MISMA PREGUNTA —qué se va por mes en gasto propio, y cuánto va a
// seguir yéndose— sobre dos recortes distintos del mismo rubro de Compras: «Estructura» agrupado por
// sub-rubro, y «Servicios recurrentes» agrupado por proveedor. Dos pestañas, dos generadores, dos
// definiciones de la misma proyección. Y ya habían DIVERGIDO:
//
//   · Recurrentes (corregido el 13/08): mes cerrado → el real · mes EN CURSO → MAX(real; proyección)
//     · mes futuro → la proyección.
//   · Estructura: el real si lo hay, y si no la proyección — sin distinguir el mes en curso.
//
// La diferencia no es teórica: Movistar factura el 25, y hasta ese día la celda del mes en curso
// mostraba «—» como si el mes no fuera a pagar nada. El dueño lo leyó como «no se actualizó» y tenía
// razón. Los rubros de Estructura tienen el mismo problema (el combustible se carga tarde), así que
// al unificar GANA la regla nueva — no se conservan las dos, que es como se llega a dos verdades.
//
// ═══ LO ÚNICO QUE CAMBIA ENTRE UNA FAMILIA Y LA OTRA ES EL CRITERIO ═══
//
// El resto —las doce columnas auxiliares con el real, las doce visibles, el promedio sobre meses
// CERRADOS y el ajuste por inflación— es idéntico. Por eso acá vive la fórmula y allá sólo se elige
// contra qué columna de Compras se empareja cada fila.

import { COL_RUBRO, COL_FECHA, COL_TOTAL, MIN_MESES, MES_EN_CURSO } from './cash-flow-lineas.mjs'

/** La columna de sub-rubro de Compras: la que ya clasifica lo que es Estructura. */
export const COL_SUBRUBRO = 'Compras!$AF$4:$AF'
/** La columna de proveedor de Compras. */
export const COL_PROVEEDOR = 'Compras!$E$4:$E'
/** El rubro de caja que agrupa los servicios que se pagan todos los meses. */
export const RUBRO_RECURRENTE = 'Servicios recurrentes'

/**
 * LOS DOS CRITERIOS, COMO PARES `rango;valor` LISTOS PARA UN SUMIFS.
 *
 * Cada uno recibe la FILA porque los dos emparejan contra la columna A de esa misma fila: el rótulo
 * de la fila ES la clave. Que la clave sea lo que se ve es deliberado — si el emparejamiento fallara,
 * se ve en la pantalla contra qué se estaba emparejando, sin abrir el código.
 */
export const CRITERIO = Object.freeze({
  /** Un sub-rubro de «Estructura»: la clasificación que Compras ya hizo. */
  subrubro: (f) => `${COL_SUBRUBRO};$A${f}`,
  /** Un proveedor de servicios recurrentes: el rubro Y el nombre, los dos. */
  proveedor: (f) => `${COL_RUBRO};"${RUBRO_RECURRENTE}";${COL_PROVEEDOR};$A${f}`,
})

/**
 * LAS 24 CELDAS DE UNA FILA: doce auxiliares con el REAL y doce visibles.
 *
 * @param {object} o
 * @param {number} o.fila         la fila (base 1) donde vive
 * @param {(f:number)=>string} o.criterio  uno de `CRITERIO`
 * @param {object} o.col          letras/índices del layout: {mes0, aux0, nmeses, prom, filaCab}
 * @param {(i:number)=>string} o.letra  el conversor índice→letra de la pestaña
 * @returns {{aux: string[], visible: string[]}} doce y doce, en orden de mes
 */
export function celdasDelAnio({ fila, criterio, col, letra }) {
  const { mes0, aux0, nmeses, prom, filaCab } = col
  const f = fila
  const aux = []
  const visible = []
  for (let m = 0; m < 12; m++) {
    const cm = letra(mes0 + m)
    const ca = letra(aux0 + m)
    const mes = `${cm}$${filaCab}`
    // EL REAL DEL MES, contra Compras. La ventana es [primero del mes, primero del siguiente): con
    // `<=EOMONTH` un gasto del último día a las 00:00 caía en los dos meses.
    aux.push(`=SUMIFS(${COL_TOTAL};${criterio(f)};${COL_FECHA};">="&${mes};${COL_FECHA};"<"&EOMONTH(${mes};0)+1)`)
    // LA PROYECCIÓN: el promedio de los meses CERRADOS con gasto, ajustado por la inflación de
    // Parámetros. Menos de `MIN_MESES` apariciones no es una tendencia, es un gasto suelto: la compra
    // de una moto ($4.352.000, una vez en enero) se proyectaba todos los meses y la estructura del
    // año daba $120,8M contra $33M reales.
    const inflacion = `IFERROR(INDEX(Parámetros!$C$74:$C$90;MATCH(EOMONTH(${mes};0);ARRAYFORMULA(EOMONTH(Parámetros!$A$74:$A$90;0));0));1)`
    const proy = `IF($${letra(nmeses)}${f}<${MIN_MESES};0;$${letra(prom)}${f}*${inflacion})`
    // LAS TRES VENTANAS, Y EL MES EN CURSO NO ES NINGUNA DE LAS OTRAS DOS. Un mes cerrado muestra lo
    // que pasó, aunque sea cero. Uno futuro, la proyección. El que corre, el MAYOR de los dos: el
    // gasto ya cargado no puede bajar el pronóstico del propio mes — el cuadro empeoraba su
    // pronóstico justo cuando llegaba más información.
    visible.push(`=IF(${mes}<${MES_EN_CURSO};${ca}${f};IF(${mes}=${MES_EN_CURSO};MAX(${ca}${f};${proy});${proy}))`)
  }
  return { aux, visible }
}
