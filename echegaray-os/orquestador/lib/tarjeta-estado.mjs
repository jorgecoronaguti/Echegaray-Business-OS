// ¿YA SE PAGÓ? — LA RESPUESTA NO SE DECLARA: SE PRUEBA CONTRA EL BANCO.
//
// ═══ POR QUÉ ESTE MÓDULO NO CONFÍA EN EL RESUMEN ═══
//
// El resumen dice cuánto va a debitar y cuándo. NO dice si el débito ocurrió: eso sólo lo sabe el
// extracto de la cuenta. Un estado "pagado" escrito por quien emitió la obligación es la misma
// información contada dos veces — y un control nunca se valida contra la información que produce.
//
// Acá se cruzan DOS FUENTES INDEPENDIENTES: el resumen (que entra por `importar-tarjeta.mjs`) y los
// movimientos del banco (que entran por `importar-banco.mjs`, y que `clasificarMovimiento` ya
// reconoce como "Pago de la tarjeta"). El veredicto sale de la comparación, no de un campo.
//
// ═══ EL DÉBITO EN PESOS NO TIENE POR QUÉ SER IGUAL AL TOTAL EN PESOS DEL RESUMEN ═══
//
// El resumen liquida DOS saldos: "$ 2.208.958,42 + U$S 544,99". Como la cuenta de débito es en
// pesos, el banco convierte el saldo en dólares al tipo de cambio del día del pago y debita UNA sola
// cifra. Está probado con el pago anterior: $1.090.924,47 + U$S 193,25 × 1.520 = $1.384.664,47, que
// es exactamente lo que salió de la cuenta el 03/08. Por eso la conciliación no compara contra el
// importe en pesos a secas: despeja el TIPO DE CAMBIO IMPLÍCITO y lo muestra. Un débito que no se
// explica ni con el dólar del cierre es un hallazgo, no un redondeo.

import { clasificarMovimiento } from './banco-santander.mjs'

/** La ventana donde se busca el débito, en días alrededor del vencimiento.
 *  El día exacto se corrió tres veces en tres meses (01/06, 06/07, 03/08): siempre el vencimiento o
 *  el hábil siguiente. Se abre dos días antes y diez después — más ancho agarraría el mes siguiente. */
export const VENTANA = { antes: 2, despues: 10 }

/** Hasta cuánto se acepta como redondeo del banco. Un peso: un peso no esconde un error de carga. */
export const TOLERANCIA = 1

/** Qué tan lejos del TC del cierre puede estar el TC implícito antes de ser un hallazgo.
 *  No es una opinión sobre el dólar: es el rango dentro del cual la diferencia SIGUE siendo
 *  explicable por el tipo de cambio. Fuera de él, la diferencia es otra cosa y hay que mirarla. */
export const BANDA_TC = { piso: 0.7, techo: 1.5 }

const c = (x) => Math.round((Number(x) || 0) * 100) / 100
const MES = ['', 'ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
/** Una ISO como la lee el dueño: dd/mm/aaaa. Todo el archivo es es-AR. */
const dmy = (iso) => { const [a, m, d] = String(iso).split('-'); return `${d}/${m}/${a}` }
const ars = (n) => Number(n || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const dias = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000)
const corrida = (iso, n) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10)

/** Los movimientos del banco que son un pago de tarjeta. El criterio es el del importador, no uno
 *  nuevo: `clasificarMovimiento` es el único lugar donde se decide qué concepto es qué. */
export const esPagoDeTarjeta = (mov) => clasificarMovimiento(String(mov?.concepto ?? '')) === 'Pago de la tarjeta'

/**
 * EL ESTADO DE UN RESUMEN. PURA.
 *
 * Tres estados y ninguno inventado:
 *   PAGADO    hay un débito de tarjeta en el banco dentro de la ventana del vencimiento.
 *   IMPAGO    ya venció y no hay ninguno.
 *   A VENCER  todavía no venció.
 *
 * `concilia` es una pregunta SEPARADA del estado: un débito puede existir y no coincidir. Ese caso
 * no se redondea ni se esconde — sale como `hallazgo`, con las dos cifras.
 *
 * @param {object} r        el resumen: { vencimiento, aDebitarPesos, aDebitarDolares, tcCierre }
 * @param {object[]} movs   movimientos del banco: { fecha, concepto, importe }
 * @param {{hoy:string}} o  la fecha de hoy en ISO (se pasa: nada acá mira el reloj)
 */
export function estadoDePago(r, movs = [], { hoy } = {}) {
  const vto = r?.vencimiento
  if (!vto) return { estado: 'DESCONOCIDO', motivo: 'el resumen no declara vencimiento', debitos: [], concilia: false, hallazgo: null }
  const desde = corrida(vto, -VENTANA.antes)
  const hasta = corrida(vto, VENTANA.despues)
  const debitos = movs
    .filter((m) => esPagoDeTarjeta(m) && m.fecha >= desde && m.fecha <= hasta)
    .map((m) => ({ fecha: m.fecha, importe: Math.abs(Number(m.importe) || 0), concepto: m.concepto }))
    .sort((a, b) => a.fecha.localeCompare(b.fecha))

  if (!debitos.length) {
    const vencido = hoy && hoy > hasta
    return {
      estado: vencido ? 'IMPAGO' : 'A VENCER',
      // Entre el vencimiento y el fin de la ventana el estado sigue siendo "A VENCER": el débito
      // puede estar hecho y todavía no importado. Decir IMPAGO ahí sería inventar una mora.
      motivo: vencido
        ? `venció el ${vto} y el extracto no registra ningún débito de tarjeta hasta el ${hasta}`
        : `vence el ${vto}${hoy ? ` — faltan ${dias(hoy, vto)} día(s)` : ''}`,
      debitos: [], concilia: false, hallazgo: vencido ? `IMPAGO: $${c(r.aDebitarPesos)} vencidos el ${vto} sin débito en el banco` : null,
      ventana: { desde, hasta },
    }
  }

  const pagado = c(debitos.reduce((s, d) => s + d.importe, 0))
  const usd = c(r.aDebitarDolares || 0)
  const resto = c(pagado - c(r.aDebitarPesos))
  let concilia = Math.abs(resto) <= TOLERANCIA
  let tcImplicito = null
  let hallazgo = null

  if (!concilia && usd > 0) {
    // El resto tiene que ser el saldo en dólares convertido. Se despeja el TC y se lo mide contra el
    // del cierre (deducido de la base de la percepción). Si entra en la banda, el débito se explica.
    tcImplicito = c(resto / usd)
    const tcRef = Number(r.tcCierre) || null
    if (tcRef && tcImplicito >= tcRef * BANDA_TC.piso && tcImplicito <= tcRef * BANDA_TC.techo) concilia = true
    else if (!tcRef && tcImplicito > 0) hallazgo = `el débito supera el total en pesos en $${resto}; sin TC del cierre no puedo afirmar que sea el saldo en dólares (daría ${tcImplicito} por dólar)`
    else hallazgo = `el débito no se explica: $${pagado} contra $${c(r.aDebitarPesos)} + U$S ${usd} (daría ${tcImplicito} por dólar, y el cierre fue a ${tcRef})`
  } else if (!concilia) {
    hallazgo = `el banco debitó $${pagado} y el resumen dice $${c(r.aDebitarPesos)}: diferencia de $${resto}`
  }

  return {
    estado: 'PAGADO',
    motivo: `débito de tarjeta en el banco el ${debitos[debitos.length - 1].fecha}`,
    debitos,
    pagado,
    diferencia: resto,
    tcImplicito,
    concilia,
    hallazgo,
    ventana: { desde, hasta },
  }
}

/**
 * EL HISTORIAL, RESUMEN POR RESUMEN. PURA.
 *
 * Incluye una fila más que resúmenes cargados: la del PERÍODO ANTERIOR AL MÁS VIEJO, que se deduce
 * de su saldo anterior y de su línea de pago. No es un hecho —el PDF de ese resumen no se cargó— y
 * por eso viaja rotulada `INFERENCIA`. Es la diferencia entre "no tengo el dato" y "el dato está en
 * otro renglón del documento que sí tengo".
 */
export function historial(resumenes = [], movs = [], { hoy } = {}) {
  const orden = [...resumenes].sort((a, b) => String(b.cierre).localeCompare(String(a.cierre)))
  const filas = orden.map((r) => ({
    cierre: r.cierre,
    vencimiento: r.vencimiento,
    numero: r.numero,
    pesos: c(r.aDebitarPesos),
    dolares: c(r.aDebitarDolares),
    procedencia: 'HECHO',
    ...estadoDePago(r, movs, { hoy }),
  }))

  const masViejo = orden[orden.length - 1]
  if (masViejo?.saldoAnteriorPesos && masViejo.cierreAnterior) {
    const inferido = {
      cierre: masViejo.cierreAnterior,
      vencimiento: masViejo.vencimientoAnterior,
      numero: null,
      pesos: c(masViejo.saldoAnteriorPesos),
      dolares: c(masViejo.saldoAnteriorDolares),
      // El saldo anterior de un resumen ES lo que quedó debiendo el anterior. No se cargó su PDF, así
      // que el total puede incluir algo más (un pago parcial deja intereses): por eso INFERENCIA.
      procedencia: 'INFERENCIA',
      inferidoDe: `saldo anterior del resumen ${masViejo.numero}`,
    }
    filas.push({ ...inferido, ...estadoDePago({ ...masViejo, vencimiento: masViejo.vencimientoAnterior, aDebitarPesos: inferido.pesos, aDebitarDolares: inferido.dolares, tcCierre: masViejo.pagoAnteriorTc }, movs, { hoy }) })
  }
  return filas
}

/**
 * CUÁNTO PUEDE VENIR LA PRÓXIMA — PROYECCIÓN, NUNCA UN DATO. PURA.
 *
 * ═══ LA REGLA: CADA COMPONENTE CON SU PROCEDENCIA, Y NUNCA UN NÚMERO ÚNICO SIN ABRIR ═══
 *
 *   HECHO      las cuotas ya comprometidas — el banco las publica en "Cuotas a vencer".
 *   ESTIMADO   los consumos que se repiten todos los meses, y sólo si hay al menos dos resúmenes
 *              donde comparar. Con uno solo no hay recurrencia que observar: hay una observación
 *              aislada, y una observación aislada no se convierte sola en una regla.
 *   DESCONOCIDO lo que nadie puede saber todavía: las compras del mes en curso.
 *
 * El PISO suma únicamente lo HECHO. Que sea un piso —y no un pronóstico— es la afirmación honesta:
 * el total va a ser mayor, y cuánto mayor depende de lo que se compre.
 *
 * @param {object[]} resumenes ordenados como sea; se usa el de cierre más reciente
 * @param {number} minMeses    cuántos resúmenes distintos hacen falta para hablar de recurrencia
 */
export function proyectarProxima(resumenes = [], { minMeses = 2 } = {}) {
  const orden = [...resumenes].sort((a, b) => String(b.cierre).localeCompare(String(a.cierre)))
  const r0 = orden[0]
  if (!r0) return { componentes: [], piso: 0, huecos: ['no hay ningún resumen cargado'], resumenes: 0 }

  const componentes = []
  const huecos = []

  const fila = r0.cuotasAVencer?.[0]
  if (fila) {
    componentes.push({
      concepto: `Cuotas ya comprometidas de ${MES[Number(fila.mes.slice(5, 7))]}/${fila.mes.slice(2, 4)}`,
      importe: c(fila.importe), moneda: 'ARS', procedencia: 'HECHO',
      evidencia: `tabla "Cuotas a vencer" del resumen ${r0.numero}, cerrado el ${dmy(r0.cierre)}`,
      // La versión corta es la que entra en la pestaña: la columna de procedencia es un dato, no una
      // explicación. La larga vive acá para el informe y para el log del importador.
      corta: 'HECHO · tabla del resumen',
    })
  } else {
    huecos.push('el resumen no publica la tabla de cuotas a vencer: sin ella no hay piso')
  }

  // ── LOS RECURRENTES: sólo con evidencia de repetición, y contada ────────────────────────────────
  const porComercio = new Map()
  for (const r of orden) {
    for (const m of r.consumos || []) {
      if (!m.comercio) continue
      const k = m.comercio.toUpperCase()
      if (!porComercio.has(k)) porComercio.set(k, new Map())
      const meses = porComercio.get(k)
      const mes = String(r.cierre).slice(0, 7)
      meses.set(mes, c((meses.get(mes) || 0) + (m.dolares ? m.dolares : m.pesos)))
      meses.set('__moneda', m.dolares ? 'USD' : 'ARS')
    }
  }
  const observados = []
  for (const [comercio, meses] of porComercio) {
    const moneda = meses.get('__moneda')
    const valores = [...meses.entries()].filter(([k]) => k !== '__moneda')
    const promedio = c(valores.reduce((s, [, v]) => s + v, 0) / valores.length)
    observados.push({ comercio, meses: valores.length, promedio, moneda })
  }
  const recurrentes = observados.filter((o) => o.meses >= minMeses)
  for (const o of recurrentes) {
    componentes.push({
      concepto: `${o.comercio} — se repite`, importe: o.promedio, moneda: o.moneda, procedencia: 'ESTIMADO',
      evidencia: `observado en ${o.meses} resúmenes; promedio ${ars(o.promedio)}`,
      corta: `ESTIMADO · ${o.meses} resúmenes`,
    })
  }
  if (!recurrentes.length) {
    // LOS HUECOS SE ESCRIBEN EN LA PESTAÑA, así que se escriben CORTOS: una línea que se lee, no un
    // párrafo que se saltea. El detalle de por qué (cuántos dólares se observaron, en cuántos
    // resúmenes) sale en el informe del importador, que es donde hay lugar para argumentar.
    huecos.push(orden.length < minMeses
      ? `con ${orden.length} resumen no hay recurrencia observable`
      : 'ningún comercio se repitió en los resúmenes cargados')
  }

  huecos.push('no incluye los consumos del período en curso')

  const piso = c(componentes.filter((x) => x.procedencia === 'HECHO' && x.moneda === 'ARS').reduce((s, x) => s + x.importe, 0))
  return { componentes, piso, huecos, resumenes: orden.length, proximoCierre: r0.proximoCierre, proximoVencimiento: r0.proximoVencimiento }
}
