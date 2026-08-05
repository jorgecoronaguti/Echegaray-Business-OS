// CASH FLOW SEMANAL — LA AGENDA FINANCIERA DE LOS PRÓXIMOS 14 DÍAS.
//
// ═══ QUÉ CONTESTA, Y POR QUÉ DEJÓ DE SER UNA MATRIZ (05/08/2026) ═══
//
// El dueño: *"cada DÍA un bloque vertical… toda la semana debe entenderse en menos de cinco
// segundos"*. La versión anterior era una matriz de 51 columnas semanales: para saber si el jueves
// alcanza la plata había que cruzar una fila de cierre con una columna cuyo encabezado era una fecha
// de lunes, y el día —que es la unidad en la que se decide un pago— no existía en ningún lado.
//
// La agenda contesta tres preguntas en este orden:
//   1. ¿cuánta caja hay hoy, y cuál es el piso de los próximos 14 días?   → el bloque de arriba
//   2. ¿qué pasa cada día, y qué movimiento lo explica?                    → los 14 bloques
//   3. ¿y después?                                                         → una línea por semana
//
// ═══ POR QUÉ 14 DÍAS Y NO 13 SEMANAS ═══
//
// La skill de tesorería pide un rodante de 13 semanas, y sigue estando: son las líneas de la sección
// 2. Lo que cambia es la RESOLUCIÓN. Un pago se decide con día y hora; una semana entera en una sola
// celda esconde que el jueves la cuenta queda en descubierto aunque el viernes entre un certificado.
// El día es la unidad de decisión de los próximos catorce; de ahí en adelante, la semana alcanza.
//
// TODO NÚMERO SALE DEL LIBRO (`_MOVIMIENTOS`) vía cash-flow-bloques → libro-sumas. Lo único que no es
// un movimiento cargado —interés del descubierto, comisiones, impuesto al cheque— va en su propia
// sección, rotulado como estimado por el OS, con las fórmulas de sus módulos.

import {
  MEDIDAS, ANCHO_VISTA, COL_AUX, formulaMedida, formulaSaldoAncla, formulaSaldoCierre, formulaNeto,
  formulaMayorImporte, formulaMayorContraparte, formulaGlosaMayor,
  celda, item, rotuloDia, fechaAR, letra, INSTRUMENTOS_BANCARIOS,
} from './cash-flow-bloques.mjs'
import { terminoLibro } from './libro-sumas.mjs'
import { formulaInteresSemana, formulaComisionesSemana } from './cash-flow-lineas.mjs'
import { ALICUOTA } from './impuesto-cheque.mjs'

/** Cuántos días se abren uno por uno. Es el horizonte que se decide, no el que se mira. */
export const DIAS_AGENDA = 14
/** El nombre de la pestaña. Único lugar donde se escribe. */
export const PESTANA_SEMANAL = 'Cash Flow Semanal'

const DIA_MS = 86400000
const sinIgual = (f) => String(f).replace(/^=/, '')
const lunesDe = (d) => {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  while (x.getUTCDay() !== 1) x.setUTCDate(x.getUTCDate() - 1)
  return x
}

/** Los 14 días de la agenda, arrancando HOY. */
export function diasDeLaAgenda(hoy, n = DIAS_AGENDA) {
  const d0 = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate()))
  return Array.from({ length: n }, (_, i) => new Date(d0.getTime() + i * DIA_MS))
}

/**
 * Las semanas que siguen a la agenda, hasta el fin del ejercicio.
 *
 * Arrancan en el lunes POSTERIOR al último día abierto: si empezaran en el lunes de la semana en curso,
 * los días ya abiertos se contarían dos veces —una en su bloque y otra en el resumen— y el saldo
 * encadenado quedaría corrido una semana entera.
 */
export function semanasSiguientes(hoy, n = DIAS_AGENDA, anio = null) {
  const dias = diasDeLaAgenda(hoy, n)
  const finAgenda = new Date(dias[dias.length - 1].getTime() + DIA_MS)
  let lunes = lunesDe(finAgenda)
  if (lunes.getTime() < finAgenda.getTime()) lunes = new Date(lunes.getTime() + 7 * DIA_MS)
  const hastaAnio = anio ?? hoy.getUTCFullYear()
  const out = []
  for (let d = lunes; d.getUTCFullYear() <= hastaAnio && out.length < 54; d = new Date(d.getTime() + 7 * DIA_MS)) out.push(d)
  return out
}

/**
 * NÚCLEO PURO: la grilla entera de la pestaña. No toca la red: se prueba fórmula por fórmula.
 *
 * @param {object} p
 * @param {Date} p.hoy
 * @param {{saldo:string|null, fecha:string|null, minima:string|null}} p.refs rangos con nombre de CAJA
 * @param {number} [p.dias]
 * @returns {{filas:any[][], meta:object}}
 */
export function grillaAgenda({ hoy = new Date(), refs = {}, dias = DIAS_AGENDA } = {}) {
  const { saldo: refSaldo = null, fecha: refFecha = null, minima: refMinima = null } = refs
  const filas = []
  const push = (celdas) => { filas.push(celdas); return filas.length }
  const meta = { dias: [], secciones: [], notas: [] }

  const fechas = diasDeLaAgenda(hoy, dias)
  const semanas = semanasSiguientes(hoy, dias)

  // ── Dónde va la zona auxiliar ────────────────────────────────────────────────────────────────────
  //
  // Tiene que ocupar filas CONTIGUAS —es la única forma de que MIN/MATCH y los gráficos lean una
  // serie— y va en columnas ocultas, porque es maquinaria y una vista no muestra maquinaria.
  //
  // POR QUÉ ARRANCA DENTRO DE LA SECCIÓN 1 Y NO EN LA FILA 4. Una fila con números en columnas ocultas
  // y la columna A vacía es una fila sin concepto: el auditor de patrón la marca, y con razón — si
  // alguien muestra las columnas, ve cifras sueltas sin rótulo. Los 14 bloques ocupan 98 filas
  // corridas y todas tienen rótulo, así que la maquinaria vive detrás de filas que SÍ dicen qué son.
  // Por lo mismo los bloques dejaron de llevar una fila en blanco entre sí: el aire lo pone el alto de
  // fila y la regla fina de la piel, no una fila vacía.
  const FILAS_POR_DIA = 7
  const PRIMER_DIA = 10 // 1 título, 2 subtítulo, 3 blanco, 4-7 hero, 8 blanco, 9 sección
  const AUX_DIA_0 = PRIMER_DIA
  const AUX_DIA_1 = AUX_DIA_0 + fechas.length - 1
  const AUX_SEM_0 = AUX_DIA_1 + 1
  const AUX_SEM_1 = AUX_SEM_0 + Math.max(semanas.length, 1) - 1
  // GUARDA: si la maquinaria no entra detrás de los bloques, se rompe acá y no se escribe una vista
  // con filas sin rótulo. Pasa si el horizonte de semanas crece más que el alto de la sección 1.
  const altoSeccion1 = fechas.length * FILAS_POR_DIA
  if (AUX_SEM_1 - PRIMER_DIA + 1 > altoSeccion1) {
    throw new Error(`la zona auxiliar (${AUX_SEM_1 - PRIMER_DIA + 1} filas) no entra detrás de los ${altoSeccion1} renglones de los bloques`)
  }
  const aux = {
    fecha: COL_AUX, saldo: COL_AUX + 1, neto: COL_AUX + 2,
    cobroImp: COL_AUX + 3, cobroQuien: COL_AUX + 4, pagoImp: COL_AUX + 5, pagoQuien: COL_AUX + 6,
  }
  const cAux = (col, fila) => celda(col, fila)
  const rango = (col, f0, f1) => `${celda(col, f0)}:${celda(col, f1)}`
  meta.aux = { dias: { fila0: AUX_DIA_0, fila1: AUX_DIA_1 }, semanas: { fila0: AUX_SEM_0, fila1: AUX_SEM_1 }, col: aux }

  // ── 1 y 2. El título y de dónde sale todo ────────────────────────────────────────────────────────
  push([`Cash flow semanal — la agenda de los próximos ${dias} días`])
  push(['Qué se cobra, qué se paga y con cuánto se cierra cada día · todo sale del libro de movimientos',
    '', `Al ${fechaAR(hoy)}`])
  push([])

  // ── EL HERO: las cuatro cifras que se deciden ────────────────────────────────────────────────────
  // Van arriba y sin número de sección porque son el titular: el resto de la pestaña es su detalle.
  const filaHero = push(['LA CAJA HOY Y EL PISO DEL PERÍODO',
    refSaldo ? `=N(${refSaldo})` : '',
    refSaldo ? '' : 'Falta el saldo declarado de CAJA: la cadena arranca en blanco'])
  meta.hero = filaHero
  const filaMinimo = push([item('El piso del período'), `=MIN(${rango(aux.saldo, AUX_DIA_0, AUX_DIA_1)})`,
    `=IFERROR("el "&TEXT(INDEX(${rango(aux.fecha, AUX_DIA_0, AUX_DIA_1)};MATCH(MIN(${rango(aux.saldo, AUX_DIA_0, AUX_DIA_1)});${rango(aux.saldo, AUX_DIA_0, AUX_DIA_1)};0));"dddd d/mm");"")`])
  // ═══ LO VENCIDO SIN CONCILIAR VA EN EL TITULAR (regla de la skill de tesorería) ═══
  // Un cobro PROYECTADO cuya fecha ya pasó y nadie marcó como real no es plata: es una pregunta sin
  // contestar. Mientras viva escondido en el saldo de un día que ya pasó, el forecast entero miente.
  const filaVencido = push([item('Vencido sin conciliar, hasta hoy'),
    `=${terminoLibro({ hasta: cAux(aux.fecha, AUX_DIA_0), estados: ['VENCIDO'], medida: 'magnitud' })}`,
    'Cobros y pagos con fecha pasada que nadie confirmó'])
  const filaColchon = push([item('Sobre la caja mínima'),
    refMinima ? `=${celda(1, filaMinimo)}-N(${refMinima})` : '',
    refMinima ? `=IF(${celda(1, filaMinimo)}-N(${refMinima})<0;"Falta para el piso";"Excedente disponible para colocar")` : 'Sin caja mínima definida'])
  meta.piso = { minimo: filaMinimo, vencido: filaVencido, colchon: filaColchon }
  push([])

  // ── SECCIÓN 1: los días, uno por uno ─────────────────────────────────────────────────────────────
  meta.secciones.push(push([`1 · LOS PRÓXIMOS ${dias} DÍAS`]))
  let anteriorCierre = null
  fechas.forEach((d, i) => {
    const filaAuxDia = AUX_DIA_0 + i
    const filaTitulo = push([fechaAR(d)]) // la celda es una FECHA: el formato la muestra "martes 5 de agosto"
    const refDesde = celda(0, filaTitulo)
    const refHasta = `${celda(0, filaTitulo)}+1`
    const filaInicio = push([item('Saldo inicial'),
      anteriorCierre ? `=N(${celda(1, anteriorCierre)})` : (refSaldo && refFecha ? formulaSaldoAncla({ refSaldo, refFecha, hasta: refDesde }) : '')])
    const filasMedida = MEDIDAS.map((m) => push([item(m.rotulo), formulaMedida(m, refDesde, refHasta)]))
    // La glosa del mayor movimiento se apoya en la zona auxiliar: la vista NUNCA lleva un FILTER
    // adentro, así se puede leer la fila sin leer una fórmula de 400 caracteres.
    filas[filasMedida[0] - 1][2] = formulaGlosaMayor(cAux(aux.cobroImp, filaAuxDia), cAux(aux.cobroQuien, filaAuxDia), 'Mayor cobro')
    filas[filasMedida[2] - 1][2] = formulaGlosaMayor(cAux(aux.pagoImp, filaAuxDia), cAux(aux.pagoQuien, filaAuxDia), 'Mayor pago')
    const celdasMedida = filasMedida.map((f) => celda(1, f))
    const filaCierre = push(['⇒ Saldo al cierre', formulaSaldoCierre(celda(1, filaInicio), celdasMedida)])
    // El saldo del día también se muestra en la fila del título: escaneando la columna B se lee la
    // quincena entera sin abrir un solo bloque. Es lo que hace que "cinco segundos" sea posible.
    filas[filaTitulo - 1][1] = `=N(${celda(1, filaCierre)})`
    meta.dias.push({ fecha: d, rotulo: rotuloDia(d), filaTitulo, filaInicio, filaCierre, filaAux: filaAuxDia, filasMedida })
    anteriorCierre = filaCierre

    // La zona auxiliar de ese día. Se escribe sobre la MISMA fila física que ocupa el bloque de arriba
    // para que ninguna fila quede con números y sin rótulo en la columna A.
    const fila = filas[filaAuxDia - 1] || (filas[filaAuxDia - 1] = [])
    fila[aux.fecha] = `=${celda(0, filaTitulo)}`
    fila[aux.saldo] = `=N(${celda(1, filaCierre)})`
    fila[aux.neto] = formulaNeto(celdasMedida)
    fila[aux.cobroImp] = formulaMayorImporte(refDesde, refHasta, 1)
    fila[aux.cobroQuien] = formulaMayorContraparte(refDesde, refHasta, 1, cAux(aux.cobroImp, filaAuxDia))
    fila[aux.pagoImp] = formulaMayorImporte(refDesde, refHasta, -1)
    fila[aux.pagoQuien] = formulaMayorContraparte(refDesde, refHasta, -1, cAux(aux.pagoImp, filaAuxDia))
  })

  // ── SECCIÓN 2: el resto del horizonte, una línea por semana ──────────────────────────────────────
  push([])
  meta.secciones.push(push([`2 · LAS SEMANAS QUE SIGUEN, HASTA FIN DE ${hoy.getUTCFullYear()}`]))
  meta.cabSemanas = push(['Semana', 'Neto de la semana', 'Saldo proyectado al domingo'])
  meta.semanas = []
  semanas.forEach((d, i) => {
    const filaAuxSem = AUX_SEM_0 + i
    const f = push([fechaAR(d)])
    const desde = celda(0, f)
    const hasta = `${celda(0, f)}+7`
    const celdasMedida = MEDIDAS.map((m) => `(${sinIgual(formulaMedida(m, desde, hasta))})`)
    filas[f - 1][1] = formulaNeto(celdasMedida)
    filas[f - 1][2] = `=N(${cAux(aux.saldo, filaAuxSem)})`
    const fila = filas[filaAuxSem - 1] || (filas[filaAuxSem - 1] = [])
    fila[aux.fecha] = `=${celda(0, f)}`
    fila[aux.neto] = `=N(${celda(1, f)})`
    fila[aux.saldo] = i === 0
      ? `=N(${celda(1, anteriorCierre)})+N(${celda(1, f)})`
      : `=N(${cAux(aux.saldo, filaAuxSem - 1)})+N(${celda(1, f)})`
    meta.semanas.push({ fecha: d, fila: f, filaAux: filaAuxSem })
  })
  push([])

  // ── SECCIÓN 3: lo que no es un movimiento cargado ────────────────────────────────────────────────
  // NO SE ESCONDE ADENTRO DE LOS DÍAS. Son estimaciones del OS, no comprobantes: mezclarlas con lo
  // cargado haría que un saldo diario dependa de un modelo sin que se vea. Van acá, con su nombre.
  meta.secciones.push(push([`3 · COSTO FINANCIERO ESTIMADO DE LOS PRÓXIMOS ${dias} DÍAS`]))
  const d0 = celda(0, meta.dias[0].filaTitulo)
  const d7 = `${d0}+7`
  const d14 = `${d0}+${dias}`
  const saldoSemana2 = meta.dias[6] ? celda(1, meta.dias[6].filaCierre) : celda(1, meta.dias[0].filaCierre)
  const filaInteres = push([item('Interés del descubierto'),
    `=${sinIgual(formulaInteresSemana(refSaldo ? `N(${refSaldo})` : '0', d0, d7))}+${sinIgual(formulaInteresSemana(`N(${saldoSemana2})`, d7, d14))}`,
    'Sólo corre si la cuenta queda en descubierto'])
  const filaComisiones = push([item('Comisiones bancarias'),
    `=${sinIgual(formulaComisionesSemana(d0, d7))}+${sinIgual(formulaComisionesSemana(d7, d14))}`,
    'El banco las cobra a fin de mes'])
  // El impuesto al cheque grava débitos Y créditos: se aplica sobre el movimiento bruto del período,
  // no sobre el neto. La alícuota es la del módulo — un parámetro tiene una sola dirección en el repo.
  const filaImpuesto = push([item('Impuesto al cheque'),
    `=(${terminoLibro({ desde: d0, hasta: d14, medida: 'magnitud', instrumentos: [...INSTRUMENTOS_BANCARIOS] })})*${ALICUOTA}`,
    'Ley 25.413 · sobre débitos y créditos del período'])
  meta.costoFinanciero = [filaInteres, filaComisiones, filaImpuesto]
  push([])

  meta.filaFin = filas.length
  meta.ancho = ANCHO_VISTA
  meta.pestana = PESTANA_SEMANAL
  meta.fechas = fechas
  return { filas, meta }
}

/** Las columnas que se ocultan: la zona auxiliar y su columna de aire. PURA, para poder probarla. */
export const columnasOcultas = () => ({ desde: ANCHO_VISTA, hasta: COL_AUX + 7 })

/** El rango A1 de la serie de saldos por semana — lo que alimenta el gráfico de liquidez. */
export function serieLiquidez(meta) {
  const { semanas, col } = meta.aux
  return { fecha: `${letra(col.fecha)}`, fila0: semanas.fila0, fila1: semanas.fila1 }
}
