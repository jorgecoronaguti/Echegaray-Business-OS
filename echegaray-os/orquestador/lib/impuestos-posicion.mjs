// LO QUE SE VE PRIMERO — posición, calendario de vencimientos, riesgo y financiamiento.
//
// LA ORDEN DEL DUEÑO (06/08): *"la pestaña mezcla posición, deuda, vencimientos, proyecciones y
// obligaciones. Separalas. La pantalla muestra PRIMERO: posición actual · próximos vencimientos ·
// riesgo · proyección 30 días · 60 · 90. Después el detalle técnico."*
//
// Todo lo de acá REFERENCIA celdas del detalle. Ni un número pegado, ni una suma repetida: si la
// posición recalculara por su cuenta lo que el detalle ya calcula, la pestaña tendría dos verdades
// sobre el mismo peso — que es el defecto que este archivo entero viene persiguiendo.
//
// LA CONFIANZA VIAJA EN EL RÓTULO, NO EN UNA NOTA. La columna de procedencia se vacía y las notas se
// borran (el dueño: "quitá las notas, son confusas"), así que una fecha supuesta que sólo se declarara
// ahí sería una fecha supuesta invisible. Las supuestas llevan "⚠ fecha supuesta" en la columna A.

import { seccion, sub as subItem, total as rotuloTotal } from './patron-pestana.mjs'
import { cmes } from './impuestos-grilla.mjs'
import { calendario, diasEntre } from './vencimientos-fiscales.mjs'
import {
  formulaVentana, formulaVencidoImpago, formulaDeudaPendiente, proximoVencimiento,
  filasFinanciamiento,
} from './impuestos-cuadro.mjs'

/**
 * Cuánto hacia atrás y hacia adelante mira el calendario.
 *
 * ═══ HACIA ATRÁS SÓLO IVA E IIBB, Y NO ES UN CAPRICHO (06/08) ═══
 *
 * La primera versión miraba 60 días para atrás con las cuatro obligaciones y el resultado era una
 * FALSA ALARMA de las caras: ocho filas "⚠ VENCIDO" por ~$9M que en realidad estaban PAGADAS. El
 * prendario y los planes se debitan solos —el banco el día 7, ARCA el 16— así que "vencido" no
 * quiere decir nada para ellos: si la fecha pasó, la plata salió.
 *
 * Con IVA e IIBB sí quiere decir algo: la DDJJ declara cuánto hay que pagar en efectivo, y si ese
 * importe sigue en el cuadro con el vencimiento cumplido, o se pagó y nadie lo registró, o no se
 * pagó. Las dos cosas hay que mirarlas. Hoy esas celdas valen 0 —el crédito de libre disponibilidad
 * lo absorbió todo— así que el riesgo muestra "—", que es la verdad.
 *
 * LO QUE ESTO NO PUEDE SABER, Y SE DECLARA: la pestaña no tiene un campo "pagado". Un vencimiento
 * pasado con importe es una PREGUNTA, no una deuda confirmada. Confirmarlo exige cruzar contra el
 * extracto o contra Compras, que es trabajo de la conciliación, no de este cuadro.
 */
export const VENTANA = { atras: 45, adelante: 95, conPasado: ['iva', 'iibb'] }

const ddmm = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`
const MESES_LARGO = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

/**
 * NÚCLEO PURO: qué obligaciones entran al calendario, con la celda de la que sale cada importe.
 *
 * @param {object} f
 * @param {string} f.hoy
 * @param {number} f.anio
 * @param {{iva:number[], iibb:number[], plan:number[], prendario:number[]}} f.meses qué meses tiene cada bloque
 * @param {{iva:number, iibb:number, plan:number, prendario:number}} f.filas la fila del detalle de cada uno
 */
export function obligacionesDelCalendario({ hoy, anio, meses, filas }) {
  const CONCEPTO = {
    iva: 'IVA · DDJJ F.2051 (ARCA)',
    iibb: 'Ingresos Brutos San Juan (DGR)',
    plan: 'Planes de pago F931 (ARCA)',
    prendario: 'Prendario Ford XLS (Santander)',
  }
  const obligaciones = []
  for (const tipo of ['iva', 'iibb', 'plan', 'prendario']) {
    for (const m of meses[tipo] ?? []) {
      // El período del IVA y del IIBB es el mes DECLARADO (vence al siguiente); el del plan y el del
      // prendario es el mes en que se debita la cuota. Los dos son "el mes de la columna".
      obligaciones.push({
        tipo,
        periodo: `${anio}-${String(m).padStart(2, '0')}`,
        concepto: CONCEPTO[tipo],
        mes: m,
        celda: `$${cmes(m)}$${filas[tipo]}`,
      })
    }
  }
  return calendario(obligaciones, { hoy }).filter((o) => {
    if (o.dias > VENTANA.adelante) return false
    if (o.dias >= 0) return true
    // Hacia atrás sólo entran los que se pagan a mano: el prendario y los planes son débito
    // automático, así que un vencimiento cumplido significa plata ya salida, no plata que se debe.
    return VENTANA.conPasado.includes(o.tipo) && o.dias >= -VENTANA.atras
  })
}

/** Cuántas filas ocupa la posición entera. Se necesita ANTES de escribir el detalle, para reservarlas. */
export const altoDeLaPosicion = (cal = []) => 10 + (cal.length + 4) + 10 + 8

/**
 * NÚCLEO PURO: las filas de la posición, ya con sus referencias resueltas.
 *
 * @param {object} f
 * @param {Array} f.cal el calendario de `obligacionesDelCalendario`
 * @param {number} f.base la fila (1-based) donde arranca el bloque de la posición
 * @param {object} f.refs celdas del detalle: {saldoIva, saldoIibb, prendPend, planesPend, deudaPend, otrosMeses}
 */
export function filasDeLaPosicion({ cal, base, hoy, refs, acuerdo, tarjeta }) {
  const F = []
  // ═══ QUÉ ENVEJECE ACÁ, Y POR QUÉ NO SE PUEDE ARREGLAR CON UNA FÓRMULA (06/08) ═══
  //
  // Las dos celdas que deciden plata —"prendario/planes: cuotas que todavía no vencieron"— ya no
  // llevan el serial del día tipeado: cortan con `TODAY()` y quedan exactas aunque la pestaña se
  // regenere tarde (ver `CORTE_VIVO` en impuestos-cuadro.mjs).
  //
  // TODO LO DE ESTE BLOQUE, EN CAMBIO, SE CALCULA CON LA FECHA DE LA CORRIDA Y NO PUEDE SER VIVO:
  //
  //   · "LA POSICIÓN AL 06/08" y "PRÓXIMO VENCIMIENTO · 07/08 · …" — el próximo vencimiento sale de
  //     ORDENAR el calendario y quedarse con el primero no vencido, en JavaScript. Un TEXT(TODAY())
  //     en el rótulo diría la fecha de hoy al lado de un vencimiento elegido hace una semana: sería
  //     más nuevo el cartel que el dato. Un rótulo que envejece a la vista es preferible a uno que
  //     miente sobre su propia frescura.
  //   · qué obligaciones entran al calendario, cuáles están "⚠ VENCIDO" y las ventanas 30/60/90: son
  //     sumas de celdas ELEGIDAS por fecha, no un rango. Hacerlas vivas exige rehacer el cuadro
  //     entero en fórmula (un rango con las fechas y un SUMIFS por ventana), que es otro trabajo.
  //
  // La consecuencia queda VISIBLE y no escondida: si la pestaña se queda vieja, las filas del
  // calendario cuyas fechas ya pasaron aparecen marcadas "⚠ VENCIDO", que es exactamente el aviso.
  // ── HERO ────────────────────────────────────────────────────────────────────────────────────────
  // Cuatro cifras y nada más. Mercury: UNA métrica primaria por pantalla; acá son dos posiciones
  // (a favor y en contra) y dos plazos (el próximo vencimiento y los 30 días), que es lo mínimo con
  // lo que se decide un pago. Todo lo demás está abajo.
  const filaCal0 = base + 10 + 2 // título + encabezado del calendario
  const conCelda = cal.map((o, i) => ({ ...o, celdaImporte: `$B$${filaCal0 + i}` }))
  const prox = proximoVencimiento(conCelda)

  F.push([`LA POSICIÓN AL ${ddmm(hoy)}`, 'Monto'])
  F.push([rotuloTotal('IMPUESTOS A FAVOR'), `=${refs.saldoIva}+${refs.saldoIibb}`])
  F.push([subItem('saldo a favor de IVA · F.2051'), `=${refs.saldoIva}`])
  F.push([subItem('saldo a favor de IIBB · DGR'), `=${refs.saldoIibb}`])
  F.push([rotuloTotal('DEUDA PENDIENTE · FISCAL Y FINANCIERA'),
    formulaDeudaPendiente(refs.prendPend, refs.planesPend)])
  F.push([subItem('prendario · cuotas por vencer'), `=${refs.prendPend}`])
  F.push([subItem('planes F931 · cuotas por vencer'), `=${refs.planesPend}`])
  F.push([prox
    ? rotuloTotal(`PRÓXIMO VENCIMIENTO · ${ddmm(prox.fecha)} · ${prox.concepto}`)
    : rotuloTotal('PRÓXIMO VENCIMIENTO · no hay ninguno en la ventana'),
  prox ? prox.formulaImporte : '=0'])
  F.push([rotuloTotal('A PAGAR EN LOS PRÓXIMOS 30 DÍAS'), formulaVentana(conCelda, 30)])
  F.push([])

  // ── 1 · CALENDARIO DE VENCIMIENTOS ──────────────────────────────────────────────────────────────
  F.push([seccion(1, 'Calendario de vencimientos — qué vence, cuándo y cuánto')])
  F.push(['Fecha y concepto', 'Importe'])
  for (const o of conCelda) {
    const marca = o.vencido ? '  ⚠ VENCIDO' : (o.confianza === 'supuesto' ? '  ⚠ fecha supuesta' : '')
    F.push([`${ddmm(o.fecha)} · ${o.concepto} · ${MESES_LARGO[o.mes - 1]}${marca}`, `=${o.celda}`])
  }
  F.push([rotuloTotal(`Total de los próximos ${VENTANA.adelante} días`), formulaVentana(conCelda, VENTANA.adelante)])
  F.push([])

  // ── 2 · RIESGO Y PROYECCIÓN ─────────────────────────────────────────────────────────────────────
  // Kyriba: posición → forecast → riesgo. Las ventanas son ACUMULADAS (30 está dentro de 60 y de 90)
  // porque la pregunta es "cuánto tengo que juntar para los próximos 60 días", no "cuánto cae en el
  // segundo mes". Y el riesgo va abajo, separado: lo vencido y lo que no tiene fecha cierta NO son
  // proyección, y sumarlos a la ventana escondería que son otra cosa.
  F.push([seccion(2, 'Riesgo y proyección — 30 · 60 · 90 días')])
  F.push(['Concepto', '30 días', '60 días', '90 días'])
  const porTipo = (tipo) => conCelda.filter((o) => o.tipo === tipo)
  const filaVentanas = (rotulo, filas) => F.push([rotulo,
    formulaVentana(filas, 30), formulaVentana(filas, 60), formulaVentana(filas, 90)])
  filaVentanas('IVA · DDJJ F.2051 (ARCA)', porTipo('iva'))
  filaVentanas('Ingresos Brutos San Juan (DGR)  ⚠ fecha supuesta', porTipo('iibb'))
  filaVentanas('Planes de pago F931 (ARCA)', porTipo('plan'))
  filaVentanas('Prendario Ford XLS (Santander)', porTipo('prendario'))
  filaVentanas(rotuloTotal('A PAGAR EN LA VENTANA'), conCelda)
  // "IMPAGO" ES UNA PREGUNTA, NO UNA AFIRMACIÓN: la pestaña no tiene campo "pagado". Un vencimiento
  // de IVA o IIBB ya cumplido con importe en el cuadro es algo para ir a mirar al extracto, no una
  // deuda confirmada. El rótulo lo dice, porque un número de riesgo que se lee como certeza es peor
  // que no tenerlo.
  F.push([`⚠ vencido s/verificar al ${ddmm(hoy)} · ver extracto`,
    formulaVencidoImpago(conCelda)])
  // SIN FECHA CIERTA: el impuesto al cheque lo debita el banco todos los días (no vence, se va), y el
  // Anticipo de Ganancias no tiene registro desde mayo. Los dos se pagan y ninguno entra al
  // calendario, así que aparecen como riesgo declarado y no como proyección con fecha.
  F.push(['⚠ sin fecha cierta · 25.413 + Ant. Ganancias (90d)',
    refs.otrosSinFecha ?? '=0'])
  F.push([])

  // ── 3 · FINANCIAMIENTO ──────────────────────────────────────────────────────────────────────────
  // EL DEFECTO L. La pestaña se llama "y Financieros" y mostraba DOS de las cuatro fuentes. El
  // acuerdo en descubierto ($18,2M) vivía en una fila del Cash Flow y la tarjeta ($10M) en su propia
  // pestaña: la pregunta "con qué cuento si mañana no entra la cobranza" no se podía contestar acá.
  F.push([seccion(3, 'Financiamiento — con qué se cuenta si no entra la cobranza')])
  F.push(['Línea de financiamiento', 'Límite', 'Tomado', 'Disponible'])
  const fin = filasFinanciamiento({ acuerdo, tarjeta, celdaPrendario: refs.prendPend, celdaPlanes: refs.planesPend })
  const filaFin0 = base + 10 + cal.length + 4 + 10 + 2
  fin.forEach((x, i) => {
    const f = filaFin0 + i
    F.push([x.rotulo, x.limite ?? '', x.usado, x.disponible ?? `=$B$${f}-$C$${f}`, ...Array(10).fill(''), x.origen])
  })
  const f0 = filaFin0
  const f1 = filaFin0 + fin.length - 1
  // ES UN TECHO, Y SE DICE. Esta pestaña no mide cuánto del acuerdo está tomado HOY —eso vive en
  // CAJA, que lee el saldo del banco— así que el disponible del descubierto es su límite entero.
  // Llamarlo "capacidad disponible" a secas sería declarar plata que puede no estar.
  F.push([rotuloTotal('FINANCIAMIENTO SIN USAR · TECHO'),
    '', '', `=SUM($D$${f0}:$D$${f1})`])
  F.push([])
  return F
}

/**
 * NÚCLEO PURO: la suma de las filas de "otros impuestos" que caen en los próximos meses.
 * Es lo que se paga y NO tiene fecha de vencimiento: por eso va al riesgo y no a la ventana.
 */
export function formulaOtrosSinFecha(filas = [], hoy, anio, meses = 3) {
  const m0 = Number(hoy.slice(5, 7))
  const cols = []
  for (let k = 0; k < meses; k++) {
    const m = m0 + k
    if (m >= 1 && m <= 12) cols.push(cmes(m))
  }
  if (!cols.length || !filas.length) return '=0'
  // ABSOLUTAS: la fila del hero se puede copiar o arrastrar y una referencia relativa se movería con
  // ella, apuntando a otro impuesto sin dar error.
  return `=${filas.flatMap((f) => cols.map((c) => `$${c}$${f}`)).join('+')}`
}

/** Los días que faltan para el próximo vencimiento — para el log del generador, no para la celda. */
export const diasAlProximo = (cal = [], hoy) => {
  const p = cal.find((o) => !o.vencido)
  return p ? diasEntre(hoy, p.fecha) : null
}
