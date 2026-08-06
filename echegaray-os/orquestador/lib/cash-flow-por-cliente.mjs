// LA SECCIÓN "POR CLIENTE" DE LAS DOS MATRICES — el mismo flujo, mirado por quién lo genera.
//
// ═══ EL PEDIDO, TEXTUAL (06/08/2026) ═══
//
// *"En los cash flows semanal y mensual, discriminame como subconcepto a cada uno de los clientes con
// su monto de ingresos y de egresos reales y proyectados."*
//
// ═══ POR QUÉ UNA SECCIÓN AL FINAL Y NO CUATRO APERTURAS MÁS ═══
//
// La forma obvia era colgar sub-líneas de cliente de cada una de las cuatro medidas, igual que las de
// rubro. Se descartó por lo que se LEE, no por lo que cuesta escribir: la pregunta del dueño es POR
// CLIENTE —"¿cuánto me deja LA ESTRELLA?"— y con esa forma la respuesta queda partida en cuatro filas
// separadas por veinte renglones, en una grilla de 53 columnas. Hay que ir y volver cuatro veces por
// cliente, sosteniendo tres números en la cabeza. Acá cada cliente es un bloque CONTIGUO de cinco
// filas —su neto arriba, sus cuatro componentes debajo— y la respuesta se lee de una.
//
// Y el tronco NO se toca: los rubros de egreso siguen siendo la estructura de costos (que es la
// pregunta de quien lee "Egresos") y los subtotales de concepto siguen saliendo del libro entero.
// Poner además los clientes ahí sería el MISMO número dos veces en la misma pestaña.
//
// LO QUE SE PAGA POR ESTA FORMA, dicho: la sección agrega 36 filas (7 bloques × 5, más el título) y
// la vista semanal pasa de 41 a 77. Es scroll vertical, que con la columna A congelada se banca; la
// alternativa costaba 28 filas y dejaba la respuesta partida, que no se banca.
//
// ═══ EL NETO DEL CLIENTE NO ES UNA MÉTRICA NUEVA ═══
//
// Es la fila "Resultado" del tronco aplicada a un subconjunto: entra − sale, la misma aritmética sobre
// las mismas cuatro medidas. Sin ella el bloque son cuatro números sueltos y "¿este cliente me deja
// plata?" hay que contestarla a mano, columna por columna, 53 veces.
//
// ═══ EL RESIDUO SE DESPEJA, NO SE FILTRA ═══
//
// "Otros y sin asignar" = subtotal del tronco − la suma de los clientes listados. Un cliente que el
// Libro empiece a emitir mañana aparece ahí y SE VE. Si en cambio se filtrara por "cliente vacío", ese
// cliente nuevo no caería en ninguna fila del bloque: la sección cerraría consigo misma y sería un
// cuadro coherente y falso. Es la misma regla que "· Otros" de los rubros, por el mismo motivo — y el
// residuo no es chico: son $179,3M reales y $187,9M proyectados de egreso sin cliente asignado.
//
// LOS SUBTOTALES DE CONCEPTO NO CAMBIAN. Esta sección no toca una sola fórmula del tronco: cuelga de
// sus celdas y las lee. Si mañana cambia la definición de "Egresos reales", cambia acá también.

import {
  CLAVE_TITULO_POR_CLIENTE, MEDIDAS_POR_CLIENTE,
  claveCliente, claveClienteMedida, conceptosDe, filaDeConcepto, medidaDe, celda,
} from './cash-flow-matriz.mjs'
import { terminosDeMedida, expresionDeTerminos } from './cash-flow-medidas.mjs'

/**
 * LOS BLOQUES DE CLIENTE DE UNA VISTA, en orden: cabecera, sus cuatro filas, y si es el residuo. PURA.
 *
 * Igual que `bloqueDeMedida`, todo lo que necesite saber dónde está algo sale de acá: la piel, los dos
 * generadores y los tests. Un índice tipeado no se movería el día que se agregue un cliente al
 * catálogo, y ya le rompió el piso a un consumidor real (el anexo de CAJA ubicaba filas por posición).
 */
export function bloquesDeCliente(tipo) {
  const filas = conceptosDe(tipo).filter((c) => c.cli)
  const nombres = [...new Set(filas.map((c) => c.cli.nombre))]
  return nombres.map((nombre) => {
    const medidas = MEDIDAS_POR_CLIENTE.map((m) => ({
      clave: m.clave, fila: filaDeConcepto(tipo, claveClienteMedida(nombre, m.clave)),
    }))
    return {
      nombre,
      residuo: filas.find((c) => c.cli.nombre === nombre).cli.residuo,
      cabecera: filaDeConcepto(tipo, claveCliente(nombre)),
      medidas,
      // Contiguas por construcción: la piel las formatea como un rango, no una por una.
      primera: medidas[0].fila,
      ultima: medidas[medidas.length - 1].fila,
    }
  })
}

/** La fila del título de la sección. PURA. */
export const filaTituloPorCliente = (tipo) => filaDeConcepto(tipo, CLAVE_TITULO_POR_CLIENTE)

/**
 * NÚCLEO PURO: las cinco fórmulas de UN cliente en UNA columna.
 *
 * · las cuatro medidas → los MISMOS `terminosDeMedida` que producen el subtotal del tronco, con el
 *   cliente canónico agregado a cada término. La partición cierra contra el subtotal por ARITMÉTICA y
 *   no por casualidad: son los mismos términos del mismo libro, con una condición más.
 *
 *   ES POR ESO QUE EL NETEO DE DEVOLUCIONES (06/08) BAJÓ HASTA ACÁ. `Compras!J` asigna cliente también
 *   a los EGRESOS, así que una nota de crédito de proveedor puede traer cliente. Si la fila del cliente
 *   siguiera usando el filtro viejo, esa devolución sería un ingreso del cliente —el mismo defecto que
 *   se acaba de sacar del tronco— y además el residuo se despejaría contra un subtotal que ya no la
 *   tiene: saldría de menos, y con un solo cliente asignado podría salir NEGATIVO. La sección no
 *   cambió de forma: cambió el término del que cuelga, que es lo que siempre prometió hacer.
 * · la cabecera → entra − sale sobre sus propias cuatro celdas, idéntica a la fila "Resultado".
 * · el residuo → el subtotal del tronco MENOS las celdas de los clientes listados, medida por medida.
 *   No es un `SUM` sobre un rango porque las celdas de una misma medida NO son contiguas: están
 *   repartidas una por bloque de cliente. Se enumeran, que además es lo que las hace auditables a ojo.
 *
 * @returns {Array<{fila:number, formula:string}>} la cabecera primero, después sus cuatro medidas
 */
export function formulasDeCliente(tipo, nombre, { col, desde, hasta }) {
  const bloques = bloquesDeCliente(tipo)
  const b = bloques.find((x) => x.nombre === nombre)
  if (!b) throw new Error(`la vista "${tipo}" no tiene el bloque del cliente "${nombre}"`)
  const listados = bloques.filter((x) => !x.residuo)
  const medidas = b.medidas.map((m) => {
    if (!b.residuo) {
      const terminos = terminosDeMedida(medidaDe(m.clave), desde, hasta)
        .map((t) => ({ ...t, filtro: { ...t.filtro, clientes: [nombre] } }))
      return { fila: m.fila, formula: `=${expresionDeTerminos(terminos)}` }
    }
    const subtotal = celda(col, filaDeConcepto(tipo, m.clave))
    const partes = listados.map((x) => `N(${celda(col, x.medidas.find((y) => y.clave === m.clave).fila)})`)
    return { fila: m.fila, formula: `=N(${subtotal})-(${partes.join('+')})` }
  })
  const en = (clave) => `N(${celda(col, b.medidas.find((m) => m.clave === clave).fila)})`
  const neto = `=${en('ingresoReal')}+${en('ingresoProyectado')}-${en('egresoReal')}-${en('egresoProyectado')}`
  return [{ fila: b.cabecera, formula: neto }, ...medidas]
}

/** Todas las fórmulas de la sección en una columna. PURA. Es lo que llaman las dos vistas. */
export function formulasPorCliente(tipo, { col, desde, hasta }) {
  return bloquesDeCliente(tipo).flatMap((b) => formulasDeCliente(tipo, b.nombre, { col, desde, hasta }))
}
