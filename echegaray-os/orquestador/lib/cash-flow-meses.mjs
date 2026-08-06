// CASH FLOW MENSUAL — LOS DOCE MESES DEL EJERCICIO EN UNA MATRIZ.
//
// ═══ QUÉ REEMPLAZA (06/08/2026) ═══
//
// A los doce bloques verticales de ocho líneas. Contestaban "¿cómo cierra agosto?" y no contestaban
// nunca la que importa —*"¿cómo cierra el año y qué mes se sale de lo previsto?"*— porque para
// comparar dos meses había que recorrer 96 filas de arriba abajo. El dueño lo rechazó y pidió la
// forma de siempre: una fila por concepto, los doce meses a la derecha, el total al final.
//
// ═══ LO QUE SE CONSERVA ENTERO ═══
//
// · Todo número de plata sale de `_MOVIMIENTOS` por `terminoLibro` — ningún número pegado.
// · El ancla del saldo es `expresionInicio` (cash-flow-ancla-saldo.mjs), con la MISMA semántica: el
//   mes que contiene el corte arranca en `total − REAL del mes hasta el corte`. El control A5 del
//   anexo de CAJA verifica exactamente esa identidad; cambiarla lo dejaría midiendo otra cosa.
// · El presupuesto no se inventa: sale de `_PRESUPUESTO_MENSUAL`, y un mes sin cargar muestra "—".
//   Un cero no es un presupuesto de cero: es que nadie lo cargó.
// · Los tres rangos con nombre (CF_MESES, CF_SALDO_INICIO, CF_SALDO_CIERRE) se siguen publicando, ahora
//   sobre las filas 7, 8 y 14 y las columnas B..M. Los consume el anexo de CAJA y la proyección de
//   comisiones bancarias: son el contrato de esta vista con el resto del archivo.
//
// ═══ LO QUE SE FUE, Y ADÓNDE ═══
//
// El costo financiero estimado del año (interés del descubierto, comisiones, impuesto al cheque) vive
// en "Impuestos y Financieros". No son movimientos cargados sino modelo del OS. Después de la última
// fila del cuadro no va nada más: el dueño pidió "no agregar información, no agregar métricas".

import {
  COL, FILA,
  conceptosDe, filaDeConcepto, colTotal, columnasDeTiempo, filaGraficos, footprintDe,
  medidasDeLaMatriz, bloquesDeMedida, formulasDeMedida, MEDIDAS, formulaMedida,
  expresionVentana, ventanas, celda, rangoFila, serialDeFecha, rotuloMes,
} from './cash-flow-matriz.mjs'
import { terminoLibro } from './libro-sumas.mjs'
import { expresionInicio } from './cash-flow-ancla-saldo.mjs'
import { NOMBRE_MESES } from './cash-flow-lineas.mjs'
import { NOMBRES as PRESUPUESTO } from './cash-flow-presupuesto.mjs'

/** El nombre de la pestaña. Único lugar donde se escribe. */
export const PESTANA_MENSUAL = 'Cash Flow Mensual'
const TIPO = 'mes'

/** Los doce primeros-de-mes del ejercicio. La fecha ES el contrato de la ventana de cada columna. */
export const mesesDelAnio = (anio) => ventanas(TIPO, { anio }).map((v) => v.desde)

/** Dónde arranca cada una de las cuatro cifras del hero. */
const SLOTS_HERO = Object.freeze([0, 3, 7, 11])

/**
 * La celda del presupuesto de un mes, buscada POR FECHA y no por posición.
 *
 * PRESUPUESTO_MESES es un rango VERTICAL de doce filas, así que `INDEX(rango;n)` es inequívoco.
 * Si el rango con nombre todavía no existe —primera corrida, antes de que se cree la pestaña— la
 * fórmula devuelve #NAME? y el IFERROR de quien la usa lo convierte en "—". Nunca en un cero.
 */
const refPresupuesto = (rango, mes) => `INDEX(${rango};MATCH(${mes};${PRESUPUESTO.meses};0))`

/**
 * NÚCLEO PURO: la grilla entera de la pestaña. No toca la red.
 *
 * @param {object} p
 * @param {number} p.anio
 * @param {{saldo:string|null, fecha:string|null, minima:string|null}} p.refs rangos con nombre de CAJA
 * @param {Date} [p.hoy]
 * @returns {{filas:any[][], meta:object}}
 */
export function grillaMeses({ anio = 2026, refs = {} } = {}) {
  const { saldo: refSaldo = null, fecha: refFecha = null } = refs
  const filas = []
  const poner = (f, col, valor) => {
    const row = filas[f - 1] || (filas[f - 1] = [])
    row[col] = valor
  }
  const n = columnasDeTiempo(TIPO)
  const cT = colTotal(TIPO)
  const meses = ventanas(TIPO, { anio })
  const footprint = footprintDe(TIPO, anio)
  const fila = Object.fromEntries(conceptosDe(TIPO).map((c) => [c.clave, filaDeConcepto(TIPO, c.clave)]))
  const meta = {
    pestana: PESTANA_MENSUAL, tipo: TIPO, anio, ancho: footprint.cols, footprint,
    cab: { fila: FILA.cabecera, col0: COL.tiempo0, n, colTotal: cT },
    fila, hero: { rotulo: FILA.heroRotulo, valor: FILA.heroValor, slots: SLOTS_HERO },
    bloques: bloquesDeMedida(TIPO),
    grafico: { fila: filaGraficos(TIPO), col: COL.tiempo0 },
    ventanas: meses, rotulos: meses.map((v) => rotuloMes(v.desde)),
  }

  poner(FILA.titulo, 0, `Cash Flow Mensual ${anio}`)
  poner(FILA.subtitulo, 0,
    '="Cuánto entra, cuánto sale y cómo cierra cada mes · criterio percibido · del libro de movimientos · al "&TEXT(TODAY();"d/mm/yyyy")')

  bloqueHero(poner, meta)

  poner(FILA.cabecera, 0, 'Concepto')
  meses.forEach((v, j) => poner(FILA.cabecera, COL.tiempo0 + j, serialDeFecha(v.desde)))
  poner(FILA.cabecera, cT, 'TOTAL')

  for (const c of conceptosDe(TIPO)) poner(fila[c.clave], 0, c.rotulo)
  for (let j = 0; j < n; j++) columnaDeMes(poner, meta, j, { refSaldo, refFecha })
  for (const c of conceptosDe(TIPO)) {
    if (c.total) poner(fila[c.clave], cT, `=SUM(${rangoFila(fila[c.clave], COL.tiempo0, COL.tiempo0 + n - 1)})`)
  }

  meta.filaFin = filas.length
  return { filas, meta }
}

/**
 * EL TITULAR DEL AÑO — cuatro cifras, todas leídas del propio cuadro.
 *
 * Ninguna recalcula nada: si mañana cambia una fórmula del cuerpo, el hero cambia con ella. Un
 * titular con su propia aritmética es la forma más elegante de tener dos verdades en una pestaña.
 */
function bloqueHero(poner, meta) {
  const [s1, s2, s3, s4] = meta.hero.slots
  const R = meta.hero.rotulo
  const V = meta.hero.valor
  const T = (clave) => celda(meta.cab.colTotal, meta.fila[clave])
  const plata = (c) => `TEXT(${c};"$ #,##0")`
  // El cierre del año es el saldo final de DICIEMBRE, no la suma de los saldos: sumar doce stocks no
  // da un stock. Los meses anteriores al corte van vacíos, así que sumarlos daría cualquier cosa.
  const diciembre = celda(meta.cab.col0 + meta.cab.n - 1, meta.fila.saldoFinal)

  poner(R, s1, 'RESULTADO DEL AÑO')
  poner(V, s1, `=N(${T('resultado')})`)
  // Corto: el auditor de pantalla midió que 49 caracteres no entran en la columna del hero (37).
  poner(V, s1 + 1, 'entra − sale, ejercicio 2026')

  poner(R, s2, 'ENTRA EN EL AÑO')
  poner(V, s2, `=N(${T('ingresoReal')})+N(${T('ingresoProyectado')})`)
  poner(V, s2 + 1, `=IF(N(${T('ingresoProyectado')})=0;"";"incluye "&${plata(T('ingresoProyectado'))}&" todavía a cobrar")`)

  poner(R, s3, 'SALE EN EL AÑO')
  poner(V, s3, `=N(${T('egresoReal')})+N(${T('egresoProyectado')})`)
  poner(V, s3 + 1, `=IF(N(${T('egresoProyectado')})=0;"";"incluye "&${plata(T('egresoProyectado'))}&" todavía a pagar")`)

  poner(R, s4, 'CIERRE PROYECTADO DEL AÑO')
  poner(V, s4, `=N(${diciembre})`)
  poner(V, s4 + 1, 'Saldo proyectado al 31 de diciembre')
}

/** Una columna de mes: el ancla o el eslabón, las cuatro medidas, el resultado, el saldo y las variaciones. */
function columnaDeMes(poner, meta, j, { refSaldo, refFecha }) {
  const col = meta.cab.col0 + j
  const cab = celda(col, meta.cab.fila)
  const { desde, hasta } = expresionVentana(cab, meta.tipo)
  const f = meta.fila

  // El rol de cada mes frente al saldo declarado lo decide cash-flow-ancla-saldo, que es donde está
  // probado. Acá sólo se le dice qué parte del mes ancla YA está adentro del saldo.
  poner(f.saldoInicial, col, refSaldo && refFecha
    ? expresionInicio({
      desde, hasta, refSaldo, refFecha,
      yaVividoEnElAncla: terminoLibro({ desde, hasta: `${refFecha}+1`, estados: ['REAL'], medida: 'neto' }),
      anterior: j === 0 ? null : celda(col - 1, f.saldoFinal),
    })
    : '')
  // Subtotal + apertura por rubro, de la misma función que usa el semanal: las dos vistas no pueden
  // definir distinto qué es "Materiales Civil" porque no hay dos definiciones.
  for (const c of medidasDeLaMatriz()) {
    for (const linea of formulasDeMedida(meta.tipo, c.clave, { col, desde, hasta })) poner(linea.fila, col, linea.formula)
  }
  poner(f.resultado, col,
    `=N(${celda(col, f.ingresoReal)})+N(${celda(col, f.ingresoProyectado)})`
    + `-N(${celda(col, f.egresoReal)})-N(${celda(col, f.egresoProyectado)})`)
  // Un mes sin cadena (anterior al corte) no tiene cierre: queda vacío, nunca en cero. Un cero se
  // leería como "la empresa cerró el mes sin plata", que es una afirmación que nadie hizo.
  poner(f.saldoFinal, col,
    `=IF(N(${celda(col, f.saldoInicial)})=0;"";N(${celda(col, f.saldoInicial)})+N(${celda(col, f.resultado)}))`)

  poner(f.variacionPresupuesto, col, formulaVariacionPresupuesto(cab, celda(col, f.resultado)))
  poner(f.variacionMesAnterior, col, j === 0
    ? ''
    : `=N(${celda(col, f.resultado)})-N(${celda(col - 1, f.resultado)})`)
}

/**
 * LA VARIACIÓN CONTRA EL PRESUPUESTO — y el "—" que no es un cero.
 *
 * El IFERROR es de los legítimos: cubre el caso ESPERADO de que `_PRESUPUESTO_MENSUAL` todavía no
 * exista (primera corrida del archivo) y sus rangos con nombre devuelvan #NAME?. No tapa una búsqueda
 * que falla — tapa una pestaña que todavía no nació, y lo dice con el mismo guion que el mes sin cargar.
 */
export function formulaVariacionPresupuesto(celdaMes, celdaResultado) {
  const pI = refPresupuesto(PRESUPUESTO.ingresos, celdaMes)
  const pE = refPresupuesto(PRESUPUESTO.egresos, celdaMes)
  const hay = `(N(${pI})<>0)+(N(${pE})<>0)`
  return `=IFERROR(IF(${hay}=0;"—";N(${celdaResultado})-(N(${pI})-N(${pE})));"—")`
}

/**
 * LOS NOMBRES QUE ESTA VISTA LE OFRECE AL RESTO DEL ARCHIVO.
 *
 * Existen porque un rediseño ya le rompió el piso a un consumidor real: el anexo de CAJA ubicaba las
 * filas de esta pestaña por sus rótulos y leía sus doce meses en las columnas B..M. Con estos tres
 * nombres, ese control apunta a algo estable sin conocer la geometría de la vista.
 */
export const NOMBRES_VISTA = Object.freeze({
  meses: NOMBRE_MESES,
  // CF_SALDO_INICIO/CF_SALDO_CIERRE quedaron QUEMADOS el 06/08: el achique de columnas del rediseño
  // los dejó colgando del lado de Google (el GET no los proyecta pero el nombre sigue reservado y el
  // add da 400). Nombres nuevos, y el generador ahora publica ANTES de achicar para no repetirlo.
  inicio: 'CF_INICIO',
  cierre: 'CF_CIERRE',
})

/**
 * LOS RANGOS CON NOMBRE QUE PUBLICA ESTA VISTA — AHORA HORIZONTALES.
 *
 * Eran tres columnas de doce filas en la zona auxiliar oculta; son tres FILAS de doce columnas, que es
 * la geometría de la matriz. Sus consumidores (`caja-anexo-controles.mjs`) los usan con
 * `INDEX(rango;1;MATCH(…))`: `MATCH` da lo mismo sobre una fila o una columna, y la fila explícita en
 * `INDEX` es lo que lo hace inequívoco — `INDEX(rango;n)` sobre una sola fila significa "la fila n".
 *
 * SE PUBLICAN EN LA MISMA CORRIDA QUE SE ESCRIBE LA GRILLA. Un nombre apuntando a la geometría
 * anterior no da error: devuelve otra celda, y el control que lo lee miente sin un solo #REF!.
 */
export function destinosNombrados(meta) {
  const col = meta.cab.col0 + 1 // los destinos se declaran 1-indexados
  const cols = meta.cab.n
  return [
    { name: NOMBRES_VISTA.meses, fila: meta.cab.fila, col, filas: 1, cols },
    { name: NOMBRES_VISTA.inicio, fila: meta.fila.saldoInicial, col, filas: 1, cols },
    { name: NOMBRES_VISTA.cierre, fila: meta.fila.saldoFinal, col, filas: 1, cols },
  ]
}

/**
 * La expresión que las dos vistas comparten para un período. Existe para el TEST de identidad: si
 * alguien cambia la definición de una medida en una vista y no en la otra, el test lo ve sin red.
 */
export function medidasDelMes(desdeRef, hastaRef) {
  return MEDIDAS.map((m) => ({ clave: m.clave, formula: formulaMedida(m, desdeRef, hastaRef).replace(/^=/, '') }))
}
