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

/**
 * LAS FILAS DE LA SECCIÓN «SERVICIOS RECURRENTES» DENTRO DE LA PESTAÑA `Estructura`.
 *
 * ═══ POR QUÉ ESTÁN ACÁ Y NO EN SU PROPIA PESTAÑA (07/09/2026) ═══
 *
 * El dueño mandó unificar. Las dos familias contestan la misma pregunta —qué se va por mes en gasto
 * propio y cuánto va a seguir yéndose— y hasta hoy la contestaban con DOS proyecciones distintas
 * (ver el encabezado de este archivo). Una pestaña, una definición.
 *
 * ═══ LO QUE ESTA MUDANZA NO TOCA, Y HAY QUE DECIRLO ═══
 *
 * EL CASH FLOW NO SE ENTERA. Verificado antes de mover nada: `lib/libro-extractores-recurrentes.mjs`
 * calcula la provisión de cada proveedor leyendo COMPRAS, no la pestaña — la pestaña `Recurrentes`
 * era una vista, no una fuente. `deEstructura` sí lee la pestaña `Estructura`, y su `ubicarCuadro`
 * corta en el primer rótulo que no reconoce («TOTAL ESTRUCTURA»), así que estas filas quedan fuera
 * de su lectura por construcción: los sub-rubros de Estructura y el rubro «Servicios recurrentes»
 * son universos disjuntos de Compras y no pueden contarse dos veces.
 *
 * @param {object} o
 * @param {string[]} o.proveedores  los que facturaron en el rubro, derivados de Compras
 * @param {number} o.fila0          la fila (base 1) donde arranca la primera
 * @param {object} o.col            {mes0, aux0, nmeses, prom, filaCab, total, ancho}
 * @param {(i:number)=>string} o.letra
 * @param {()=>any[]} o.vacia       una fila nueva, ya llena del centinela VACIO
 * @returns {{filas:any[][], f0:number, f1:number}}
 */
export function filasRecurrentes({ proveedores = [], fila0, col, letra, vacia }) {
  const filas = []
  for (const [i, prov] of proveedores.entries()) {
    const f = fila0 + i
    const fila = vacia()
    fila[0] = prov
    const { aux, visible } = celdasDelAnio({ fila: f, criterio: CRITERIO.proveedor, col, letra })
    for (let m = 0; m < 12; m++) {
      fila[col.aux0 + m] = aux[m]
      fila[col.mes0 + m] = visible[m]
    }
    const real = `$${letra(col.aux0)}${f}:$${letra(col.aux0 + 11)}${f}`
    fila[col.total] = `=SUM(${real})`
    // LAS DOS AUXILIARES DEL PROMEDIO, con la MISMA definición que las filas de sub-rubro: meses
    // CERRADOS con gasto, y lo real de esos meses. Dos definiciones del mismo promedio en la misma
    // pestaña se desincronizan sin dar error — es exactamente lo que pasaba con las dos pestañas.
    fila[col.nmeses] = `=SUMPRODUCT((${real}<>0)*${col.cerrados})`
    // EL PROMEDIO DECLARADO, no recalculado en cada mes: doce recálculos del mismo número son doce
    // lugares donde se puede desincronizar. Guarda de cero porque un proveedor que todavía no
    // facturó en ningún mes cerrado divide por cero y publica #DIV/0! en doce celdas.
    fila[col.prom] = `=IF($${letra(col.nmeses)}${f}=0;0;SUMPRODUCT(${real}*${col.cerrados})/$${letra(col.nmeses)}${f})`
    filas.push(fila)
  }
  return { filas, f0: fila0, f1: fila0 + filas.length - 1 }
}

/**
 * LA SECCIÓN ENTERA DE SERVICIOS RECURRENTES: su título, su encabezado, sus filas y su cierre.
 *
 * Devuelve filas listas para empujar a la grilla, y la fila (base 1) de su TOTAL — o `null` si no
 * hay ningún proveedor, que es el caso del ensayo en seco y el de una Compras sin ese rubro. UNA
 * SECCIÓN VACÍA NO SE DIBUJA: un título con un encabezado y nada debajo se lee como un cuadro roto.
 *
 * @param {object} o  `proveedores`, `fila0`, `col`, `letra`, `vacia`, `anio`, y `numerar()` que
 *   devuelve el número de bloque —se cuenta, no se tipea: sin la sección, los de abajo se corren—.
 */
export function seccionRecurrentes({ proveedores = [], fila0, col, letra, vacia, anio, numerar }) {
  if (!proveedores.length) return { filas: [], fTot: null }
  const salida = []
  salida.push(vacia())
  const titulo = vacia(); titulo[0] = `${numerar()} · LOS SERVICIOS RECURRENTES, MES A MES`
  salida.push(titulo)
  const cab = vacia()
  cab[0] = 'Proveedor'
  for (let m = 0; m < 12; m++) cab[col.mes0 + m] = `1/${m + 1}/${anio}`
  cab[col.total] = 'Total real'
  cab[col.proy] = 'Proyectado'
  cab[col.totalAnio] = `Total ${anio}`
  salida.push(cab)
  const f0 = fila0 + salida.length
  const r = filasRecurrentes({ proveedores, fila0: f0, col, letra, vacia })
  for (const [i, fila] of r.filas.entries()) {
    const f = f0 + i
    fila[col.totalAnio] = `=SUM($${letra(col.mes0)}${f}:$${letra(col.mes0 + 11)}${f})`
    fila[col.proy] = `=$${letra(col.totalAnio)}${f}-$${letra(col.total)}${f}`
    salida.push(fila)
  }
  const tot = vacia()
  tot[0] = ROTULO_TOTAL_RECURRENTES
  for (const c of [...Array(12).keys()].map((m) => col.mes0 + m).concat([col.total, col.proy, col.totalAnio])) {
    tot[c] = `=SUM(${letra(c)}${r.f0}:${letra(c)}${r.f1})`
  }
  salida.push(tot)
  return { filas: salida, fTot: fila0 + salida.length - 1 }
}

/** El cierre de la sección de recurrentes. Va APARTE del de Estructura a propósito: son dos universos
 *  disjuntos de Compras y sumarlos en una sola línea haría imposible controlarlos contra su rubro. */
export const ROTULO_TOTAL_RECURRENTES = 'TOTAL SERVICIOS RECURRENTES'
