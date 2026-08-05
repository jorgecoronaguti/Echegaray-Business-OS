// CASH FLOW MENSUAL — DOCE BLOQUES EJECUTIVOS, UNO POR MES DEL EJERCICIO.
//
// ═══ QUÉ CONTESTA (05/08/2026) ═══
//
// *"¿Cómo cierra el año, y qué mes se sale de lo previsto?"* Una fila por concepto y doce columnas de
// meses contesta la primera a fuerza de recorrer el ojo, y la segunda no la contesta nunca: la
// comparación contra el presupuesto y contra el mes anterior no existía en ninguna parte del archivo.
//
// Cada mes es un bloque de siete líneas —saldo inicial, ingresos, egresos, resultado neto, saldo al
// cierre, variación contra presupuesto, variación contra el mes anterior— y las dos variaciones se
// leen como un chip al lado del número ("+12% vs jul"), que es como las muestra cualquier producto de
// tesorería serio. Un chip no es decoración: es la diferencia entre ver un número y entenderlo.
//
// ═══ EL PRESUPUESTO NO SE INVENTA ═══
//
// No existía como fuente. Se creó la pestaña de carga `_PRESUPUESTO_MENSUAL` (cash-flow-presupuesto.mjs)
// con dos celdas por mes que llena el dueño. Mientras un mes no tenga presupuesto cargado, su variación
// muestra "—". Un cero no es un presupuesto de cero: es que nadie lo cargó, y confundir las dos cosas es
// exactamente la clase de número inventado que la regla de oro 1 prohíbe.
//
// ═══ DÓNDE VIVE CADA FÓRMULA ═══
//
// Las sumas del libro viven en la zona auxiliar (columnas ocultas), una fila por mes y contigua: es lo
// que permite que los gráficos lean una serie de verdad y que la vista quede con referencias cortas en
// vez de un SUMPRODUCT de 400 caracteres por celda. La definición de cada medida es la MISMA que usa la
// agenda diaria (cash-flow-bloques.mjs): las dos vistas no pueden discrepar porque comparten el filtro.

import {
  MEDIDAS, ANCHO_VISTA, COL_AUX, formulaMedida, celda, item, rotuloMes, fechaAR, INSTRUMENTOS_BANCARIOS,
} from './cash-flow-bloques.mjs'
import { terminoLibro } from './libro-sumas.mjs'
import { expresionInicio } from './cash-flow-ancla-saldo.mjs'
import { formulaInteresMes } from './costo-descubierto.mjs'
import { formulaComisionesMes, NOMBRE_MESES } from './cash-flow-lineas.mjs'
import { ALICUOTA } from './impuesto-cheque.mjs'
import { NOMBRES as PRESUPUESTO } from './cash-flow-presupuesto.mjs'

/** El nombre de la pestaña. Único lugar donde se escribe. */
export const PESTANA_MENSUAL = 'Cash Flow Mensual'

const sinIgual = (f) => String(f).replace(/^=/, '')

/** Los doce primeros-de-mes del ejercicio. La fecha ES el contrato de la ventana de cada bloque. */
export const mesesDelAnio = (anio) => Array.from({ length: 12 }, (_, m) => new Date(Date.UTC(anio, m, 1)))

/**
 * La celda del presupuesto de un mes, buscada POR FECHA y no por posición.
 *
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
export function grillaMeses({ anio = 2026, refs = {}, hoy = new Date() } = {}) {
  const { saldo: refSaldo = null, fecha: refFecha = null } = refs
  const filas = []
  const push = (celdas) => { filas.push(celdas); return filas.length }
  const meta = { meses: [], secciones: [] }
  const meses = mesesDelAnio(anio)

  // ── La zona auxiliar: una fila por mes, contigua, oculta ─────────────────────────────────────────
  //
  // Arranca en la fila del PRIMER BLOQUE y no en la 4, por lo mismo que en la agenda diaria: una fila
  // con números en columnas ocultas y la columna A vacía es una fila sin concepto. Detrás de los doce
  // bloques —96 renglones corridos, todos con rótulo— no hay ninguna fila muda.
  const FILAS_POR_MES = 8
  const AUX_0 = 10 // 1 título, 2 subtítulo, 3 blanco, 4-7 hero, 8 blanco, 9 sección
  const AUX_1 = AUX_0 + meses.length - 1
  if (AUX_1 - AUX_0 + 1 > meses.length * FILAS_POR_MES) throw new Error('la zona auxiliar no entra detrás de los bloques')
  const aux = {
    fecha: COL_AUX, ingReal: COL_AUX + 1, ingProy: COL_AUX + 2, egrReal: COL_AUX + 3, egrProy: COL_AUX + 4,
    ingresos: COL_AUX + 5, egresos: COL_AUX + 6, netoReal: COL_AUX + 7, netoProy: COL_AUX + 8,
    neto: COL_AUX + 9, saldo: COL_AUX + 10, interes: COL_AUX + 11, comisiones: COL_AUX + 12, impuesto: COL_AUX + 13,
  }
  const cAux = (col, fila) => celda(col, fila)
  const rango = (col, f0 = AUX_0, f1 = AUX_1) => `${celda(col, f0)}:${celda(col, f1)}`
  meta.aux = { fila0: AUX_0, fila1: AUX_1, col: aux }

  push([`Cash flow mensual ${anio} — cuánto entra, cuánto sale y cómo cierra cada mes`])
  push(['Criterio percibido · todo sale del libro de movimientos · el saldo arranca en el mes del último saldo declarado de caja',
    '', `Al ${fechaAR(hoy)}`])
  push([])

  // ── EL HERO ──────────────────────────────────────────────────────────────────────────────────────
  const filaHero = push([`EL EJERCICIO ${anio}`, `=SUM(${rango(aux.neto)})`, 'Resultado neto del año'])
  const filaIng = push([item('Entra en el año'), `=SUM(${rango(aux.ingresos)})`,
    `=IF(SUM(${rango(aux.ingProy)})=0;"";"incluye "&TEXT(SUM(${rango(aux.ingProy)});"$ #,##0")&" todavía a cobrar")`])
  const filaEgr = push([item('Sale en el año'), `=SUM(${rango(aux.egresos)})`,
    `=IF(SUM(${rango(aux.egrProy)})=0;"";"incluye "&TEXT(SUM(${rango(aux.egrProy)});"$ #,##0")&" todavía a pagar")`])
  // EL SALDO DE DICIEMBRE, NO LA SUMA DE LOS SALDOS. Se toma el último mes que tenga cadena: los meses
  // anteriores al saldo declarado van vacíos a propósito (ver más abajo) y sumarlos daría cualquier cosa.
  const filaFin = push([item('Con cuánto cierra el año'), `=IFERROR(INDEX(${rango(aux.saldo)};COUNT(${rango(aux.saldo)}));"")`,
    'Saldo proyectado al 31 de diciembre'])
  meta.hero = { titulo: filaHero, ingresos: filaIng, egresos: filaEgr, cierre: filaFin }
  push([])

  // ── SECCIÓN 1: los doce meses ────────────────────────────────────────────────────────────────────
  meta.secciones.push(push([`1 · LOS DOCE MESES DE ${anio}`]))
  let filaCierreAnterior = null
  let filaNetoAnterior = null
  meses.forEach((m, i) => {
    const filaAux = AUX_0 + i
    const filaTitulo = push([fechaAR(m)]) // la celda ES una fecha; el formato la muestra "ago 2026"
    const desde = celda(0, filaTitulo)
    const hasta = `EOMONTH(${celda(0, filaTitulo)};0)+1`

    // El saldo inicial: el rol de cada mes frente al saldo declarado lo decide cash-flow-ancla-saldo,
    // que es donde está probado. Acá sólo se le dice qué parte del mes ancla YA está adentro del saldo.
    const yaVivido = terminoLibro({ desde, hasta: `${refFecha}+1`, estados: ['REAL'], medida: 'neto' })
    const filaInicio = push([item('Saldo inicial'),
      refSaldo && refFecha
        ? expresionInicio({
          desde, hasta, refSaldo, refFecha, yaVividoEnElAncla: yaVivido,
          anterior: filaCierreAnterior ? celda(1, filaCierreAnterior) : null,
        })
        : ''])
    const filaIngresos = push([item('Ingresos'), `=N(${cAux(aux.ingresos, filaAux)})`,
      `=IF(N(${cAux(aux.ingProy, filaAux)})=0;"";"incluye "&TEXT(${cAux(aux.ingProy, filaAux)};"$ #,##0")&" a cobrar")`])
    const filaEgresos = push([item('Egresos'), `=N(${cAux(aux.egresos, filaAux)})`,
      `=IF(N(${cAux(aux.egrProy, filaAux)})=0;"";"incluye "&TEXT(${cAux(aux.egrProy, filaAux)};"$ #,##0")&" a pagar")`])
    const filaNeto = push(['⇒ Resultado neto', `=N(${cAux(aux.neto, filaAux)})`])
    const filaCierre = push(['⇒ Saldo al cierre',
      `=IF(N(${celda(1, filaInicio)})=0;"";N(${celda(1, filaInicio)})+N(${celda(1, filaNeto)}))`])
    filas[filaTitulo - 1][1] = `=N(${celda(1, filaCierre)})`

    // ── Las dos variaciones ───────────────────────────────────────────────────────────────────────
    const pI = refPresupuesto(PRESUPUESTO.ingresos, desde)
    const pE = refPresupuesto(PRESUPUESTO.egresos, desde)
    const presupNeto = `(N(${pI})-N(${pE}))`
    const hayPresupuesto = `(N(${pI})<>0)+(N(${pE})<>0)`
    const filaVsPresup = push([item('Contra el presupuesto'),
      `=IFERROR(IF(${hayPresupuesto}=0;"";N(${celda(1, filaNeto)})-${presupNeto});"")`,
      `=IFERROR(IF(${hayPresupuesto}=0;"— sin presupuesto cargado";TEXT((N(${celda(1, filaNeto)})-${presupNeto})/ABS(${presupNeto});"+0%;-0%")&" vs presupuesto");"— sin presupuesto cargado")`])
    const filaVsMes = push([item('Contra el mes anterior'),
      filaNetoAnterior ? `=N(${celda(1, filaNeto)})-N(${celda(1, filaNetoAnterior)})` : '',
      filaNetoAnterior
        ? `=IFERROR(IF(N(${celda(1, filaNetoAnterior)})=0;"—";TEXT((N(${celda(1, filaNeto)})-N(${celda(1, filaNetoAnterior)}))/ABS(${celda(1, filaNetoAnterior)});"+0%;-0%")&" vs "&TEXT(${celda(0, filaTitulo)}-1;"mmm"));"—")`
        : '—'])

    meta.meses.push({
      mes: m, rotulo: rotuloMes(m), filaTitulo, filaInicio, filaIngresos, filaEgresos,
      filaNeto, filaCierre, filaVsPresup, filaVsMes, filaAux,
    })
    filaCierreAnterior = filaCierre
    filaNetoAnterior = filaNeto

    // ── La maquinaria: las cuatro medidas del libro y los tres costos modelados ────────────────────
    const fila = filas[filaAux - 1] || (filas[filaAux - 1] = [])
    fila[aux.fecha] = `=${celda(0, filaTitulo)}`
    const [mIngR, mIngP, mEgrR, mEgrP] = MEDIDAS
    fila[aux.ingReal] = formulaMedida(mIngR, desde, hasta)
    fila[aux.ingProy] = formulaMedida(mIngP, desde, hasta)
    fila[aux.egrReal] = formulaMedida(mEgrR, desde, hasta)
    fila[aux.egrProy] = formulaMedida(mEgrP, desde, hasta)
    fila[aux.ingresos] = `=N(${cAux(aux.ingReal, filaAux)})+N(${cAux(aux.ingProy, filaAux)})`
    fila[aux.egresos] = `=N(${cAux(aux.egrReal, filaAux)})+N(${cAux(aux.egrProy, filaAux)})`
    fila[aux.netoReal] = `=N(${cAux(aux.ingReal, filaAux)})-N(${cAux(aux.egrReal, filaAux)})`
    fila[aux.netoProy] = `=N(${cAux(aux.ingProy, filaAux)})-N(${cAux(aux.egrProy, filaAux)})`
    fila[aux.neto] = `=N(${cAux(aux.ingresos, filaAux)})-N(${cAux(aux.egresos, filaAux)})`
    fila[aux.saldo] = `=IF(N(${celda(1, filaCierre)})=0;"";N(${celda(1, filaCierre)}))`
    fila[aux.interes] = formulaInteresMes(celda(1, filaInicio), celda(0, filaTitulo))
    fila[aux.comisiones] = formulaComisionesMes(celda(0, filaTitulo))
    fila[aux.impuesto] = `=(${terminoLibro({ desde, hasta, medida: 'magnitud', instrumentos: [...INSTRUMENTOS_BANCARIOS] })})*${ALICUOTA}`
  })

  // ── SECCIÓN 2: lo que modela el OS, declarado aparte ─────────────────────────────────────────────
  push([])
  meta.secciones.push(push(['2 · COSTO FINANCIERO ESTIMADO DEL AÑO']))
  const filaInteres = push([item('Interés del descubierto'), `=SUM(${rango(aux.interes)})`,
    'Corre sólo en los meses que arrancan en descubierto'])
  const filaComisiones = push([item('Comisiones bancarias'), `=SUM(${rango(aux.comisiones)})`,
    'Cargo de fin de mes del banco'])
  const filaImpuesto = push([item('Impuesto al cheque'), `=SUM(${rango(aux.impuesto)})`,
    'Ley 25.413 · sobre débitos y créditos del mes'])
  meta.costoFinanciero = [filaInteres, filaComisiones, filaImpuesto]
  push([])

  meta.filaFin = filas.length
  meta.ancho = ANCHO_VISTA
  meta.pestana = PESTANA_MENSUAL
  meta.anio = anio
  return { filas, meta }
}

/**
 * LOS RANGOS CON NOMBRE QUE PUBLICA ESTA VISTA.
 *
 * CF_MESES son los doce meses del ejercicio, y no es decorativo: la proyección de comisiones
 * bancarias cuenta sobre ellos cuántos meses tienen extracto. Antes apuntaba a la fila 3 de la
 * matriz vieja — una fila que este rediseño dejó vacía, y una referencia a celdas vacías no da
 * error: devuelve cero meses y la proyección desaparece sin que nadie se entere.
 */
export function destinosNombrados(meta) {
  return [{ name: NOMBRE_MESES, fila: meta.aux.fila0, col: meta.aux.col.fecha + 1, filas: 12 }]
}

/**
 * La expresión que el semanal y el mensual comparten para un mes. Existe para el TEST de identidad:
 * si alguien cambia la definición de una medida en una vista y no en la otra, el test lo ve sin red.
 */
export function medidasDelMes(desdeRef, hastaRef) {
  return MEDIDAS.map((m) => ({ clave: m.clave, formula: sinIgual(formulaMedida(m, desdeRef, hastaRef)) }))
}
