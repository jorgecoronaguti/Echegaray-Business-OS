// CUÁNDO VENCE CADA OBLIGACIÓN — el calendario que el OS no tenía.
//
// POR QUÉ EXISTE (06/08). Toda la noción de vencimiento fiscal del sistema era UNA constante repetida
// en tres archivos: `EOMONTH(mes;0)+20`. Ni terminación de CUIT, ni distinción entre IVA y IIBB, ni
// planes, ni el débito del prendario. El único vencimiento con fecha real de todo el archivo estaba
// TIPEADO A MANO en una celda ("⚠ DDJJ vence 20/08"). Con eso no se puede contestar la pregunta que
// hace el dueño todas las semanas: qué vence, cuándo y cuánto.
//
// ═══ LA TERMINACIÓN DEL CUIT ═══
//
// CUIT de Echegaray Construcciones SAS: 30-71630464-3 → terminación **3** → banda ARCA "2-3".
// Sale de `lib/comprobantes/lectura.mjs` (CUIT_EMPRESA) y lo confirman los propios comprobantes: el
// F.2051 dice "CUIT 30-71630464-3" y la DDJJ de Rentas "CUIT N°: 30716304643".
//
// (La auditoría previa había leído el 30710630670 de `banco-santander.mjs` como si fuera el de la
// empresa y concluido terminación 0. Ese CUIT es el de BALANZ, la contraparte del rescate de
// $11.913.568 — está ahí para identificar una transferencia recibida, no al titular de la cuenta.
// Con terminación 0 el IVA vencería el 18 y no el 19: dos días de error en la fecha que decide.)
//
// ═══ POR QUÉ UNA TABLA Y NO UNA REGLA ═══
//
// La regla obvia sería "día 19, corrido al hábil siguiente". Se probó contra las doce fechas reales
// de 2026 y FALLA EN CUATRO: dic-25 vence el 20/01 con el 19/01 lunes hábil; mar-26 vence el 21/04
// con el 19/04 domingo (el hábil siguiente es el 20); jun-26 vence el 21/07 con el 19/07 domingo;
// sep-26 vence el 20/10 con el 19/10 lunes hábil. Una regla que acierta el 67% de las veces no es
// una regla: es una fuente de errores de dos días en el número con el que se decide un pago.
//
// Así que las fechas NO se derivan — se TABULAN desde la fuente oficial, con su consulta declarada, y
// la regla queda sólo como reserva para los períodos que la tabla todavía no cubre, marcada como
// SUPUESTO para que el cuadro lo diga en vez de disimularlo.

import { CUIT_EMPRESA } from './comprobantes/lectura.mjs'

/** La terminación del CUIT de la empresa: el dígito verificador. Es lo que define la banda de ARCA. */
export const TERMINACION_CUIT = Number(String(CUIT_EMPRESA).slice(-1))

/**
 * DE DÓNDE SALEN LAS FECHAS. Se declara entero para que un tercero pueda rehacer la consulta:
 * una tabla de vencimientos sin su procedencia es indistinguible de una tabla inventada.
 */
export const FUENTE_VERIFICADA = {
  organismo: 'ARCA (ex AFIP)',
  servicio: 'Agenda de vencimientos',
  url: 'https://seti.afip.gob.ar/av/seleccionVencimientos.do',
  consulta: 'POST /av/viewVencimientos.do · terminacionCuit=3 · Agenda Sintética',
  actualizadaAl: '2026-08-05',
  consultadaEl: '2026-08-06',
  bandaCuit: '2-3',
}

/**
 * IVA — RÉGIMEN GENERAL, terminación 2-3. Presentación del F.2051 y transferencia electrónica de
 * fondos vencen el MISMO día (ARCA las publica como dos obligaciones con idéntica fecha).
 * Clave: el PERÍODO que se declara. Valor: la fecha en que vence, ya con los corrimientos aplicados.
 */
export const VENCIMIENTO_IVA = {
  '2025-12': '2026-01-20',
  '2026-01': '2026-02-19',
  '2026-02': '2026-03-19',
  '2026-03': '2026-04-21',
  '2026-04': '2026-05-19',
  '2026-05': '2026-06-19',
  '2026-06': '2026-07-21',
  '2026-07': '2026-08-19',
  '2026-08': '2026-09-21',
  '2026-09': '2026-10-20',
  '2026-10': '2026-11-19',
  '2026-11': '2026-12-21',
}

/**
 * PLANES DE FACILIDADES DE PAGO (Mis Facilidades, R.G. 3.516 / 3.827) — "Ingreso de las
 * mensualidades". Terminación "todos": el día NO depende del CUIT.
 * Clave: el mes de la cuota. Valor: la fecha en que se debita.
 *
 * ═══ EL CONTROL CRUZADO, CORREGIDO (06/08) ═══
 *
 * Acá decía que estas fechas coinciden "UNA POR UNA" con la "Fecha prevista de pago" que el dueño
 * cargó en Compras para las quince cuotas de los tres planes, y ERA FALSO. Medido fila por fila sobre
 * Compras: el dueño cargó el 18 en febrero y el DÍA 16 en todos los demás meses. Difieren dos:
 *
 *     may-26 → Compras 16/05 (SÁBADO) · ARCA 18/05
 *     ago-26 → Compras 16/08 (DOMINGO) · ARCA 18/08   (filas 478 y 725, $2.968.642,73)
 *
 * Las dos discrepancias son el mismo caso: la fecha cargada cae en fin de semana y ARCA no debita
 * sábados ni domingos. Los tres corrimientos de la tabla tienen su motivo —16/02 y 17/02 son Carnaval,
 * el 16/05 es sábado, el 17/08 es el feriado de San Martín trasladado— y por eso la tabla no se
 * deriva: se consulta. Los otros trece meses sí coinciden.
 *
 * La carga del dueño NO se toca: la corrige el libro al leerla, con `debitoRealDePlan`.
 */
export const VENCIMIENTO_PLAN = {
  '2026-01': '2026-01-16',
  '2026-02': '2026-02-18',
  '2026-03': '2026-03-16',
  '2026-04': '2026-04-16',
  '2026-05': '2026-05-18',
  '2026-06': '2026-06-16',
  '2026-07': '2026-07-16',
  '2026-08': '2026-08-18',
  '2026-09': '2026-09-16',
}

/**
 * INGRESOS BRUTOS SAN JUAN — **SUPUESTO DECLARADO, NO VERIFICADO**.
 *
 * La DGR de San Juan no fue accesible en la sesión (sanjuandgr.gob.ar y dgr.sanjuan.gob.ar no
 * resuelven) y la skill de impuestos prohíbe afirmar una norma vigente sin verificarla. Así que la
 * fecha NO se cita de memoria: se ancla en lo ÚNICO medible, que son las seis fechas de presentación
 * reales que el propio OS ya lee de los PDF de Rentas y replica en `_IIBB_RAW`:
 *
 *   ene→19/02 · feb→18/03 · mar→16/04 · abr→14/05 · may→16/06 · jun→16/07
 *   días: 19, 18, 16, 14, 16, 16 → moda 16
 *
 * Presentar no es vencer: una DDJJ se puede presentar antes. Así que el día 16 es un PISO observado,
 * no la fecha de la norma, y toda obligación de IIBB sale de acá marcada `confianza: 'supuesto'`.
 * Cerrarlo cuesta una consulta a la DGR o al estudio contable — está declarado como gap para eso.
 */
export const IIBB_SUPUESTO = {
  dia: 16,
  observado: { '2026-01': 19, '2026-02': 18, '2026-03': 16, '2026-04': 14, '2026-05': 16, '2026-06': 16 },
  porQue: 'moda de las 6 fechas de presentación reales de _IIBB_RAW; la DGR San Juan no se pudo verificar',
}

/**
 * PRENDARIO FORD XLS · SANTANDER — el banco lo debita el día 7 de cada mes.
 * NO es una norma: es una medición. Las doce cuotas cargadas en Compras tienen fecha prevista el 7,
 * y el extracto muestra los débitos reales el 07/06 y el 07/07. Dos fuentes, el mismo día.
 */
export const PRENDARIO_DIA = 7

// ── ARITMÉTICA DE FECHAS, SIN Date() PARA NO ARRASTRAR LA ZONA HORARIA ──────────────────────────
// Todo entra y sale como 'YYYY-MM-DD'. Un `new Date('2026-08-19')` en San Juan da el 18 a la tarde:
// es el error que ya vació una pestaña entera (ver `fecha-dd-mm-yy-parser` en memoria).

const DIA_MS = 86400000
const aUTC = (iso) => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)))
const aISO = (ms) => new Date(ms).toISOString().slice(0, 10)

/** Días calendario entre dos fechas ISO. Negativo = la primera ya pasó. PURA. */
export const diasEntre = (desde, hasta) => Math.round((aUTC(hasta) - aUTC(desde)) / DIA_MS)

/** El serial de Sheets de una fecha ISO (epoch 30/12/1899). PURA. */
export const serialDe = (iso) => Math.round((aUTC(iso) - Date.UTC(1899, 11, 30)) / DIA_MS)

/**
 * La regla de RESERVA: día fijo corrido al hábil siguiente. PURA.
 *
 * NO CONTEMPLA FERIADOS, y se declara: sólo sabe de sábado y domingo. Un vencimiento que cae en
 * feriado lo informa UN DÍA ANTES de lo real — hacia el lado seguro, pero equivocado igual. Por eso
 * todo lo que sale de acá viaja marcado como supuesto y nunca se presenta como fecha oficial.
 */
export function diaHabilODespues(anio, mes, dia) {
  let ms = Date.UTC(anio, mes - 1, dia)
  const dow = new Date(ms).getUTCDay()
  if (dow === 6) ms += 2 * DIA_MS
  if (dow === 0) ms += DIA_MS
  return aISO(ms)
}

const periodoValido = (p) => /^\d{4}-\d{2}$/.test(String(p ?? ''))

/**
 * Cuándo vence el IVA de un período. PURA.
 * @returns {{fecha:string, confianza:'verificado'|'supuesto', fuente:string}}
 */
export function vencimientoIva(periodo) {
  if (!periodoValido(periodo)) throw new Error(`vencimientos-fiscales: período inválido "${periodo}" (se espera YYYY-MM)`)
  const tabla = VENCIMIENTO_IVA[periodo]
  if (tabla) return { fecha: tabla, confianza: 'verificado', fuente: `${FUENTE_VERIFICADA.organismo} · terminación ${TERMINACION_CUIT}` }
  // El período siguiente al declarado: el IVA se paga el mes de después.
  const a = Number(periodo.slice(0, 4)); const m = Number(periodo.slice(5, 7))
  const sig = m === 12 ? { a: a + 1, m: 1 } : { a, m: m + 1 }
  return {
    fecha: diaHabilODespues(sig.a, sig.m, 19),
    confianza: 'supuesto',
    fuente: `regla de reserva (día 19 hábil, terminación ${TERMINACION_CUIT}) — la tabla verificada no cubre ${periodo}`,
  }
}

/** Cuándo vence el IIBB de un período. SIEMPRE supuesto: ver IIBB_SUPUESTO. PURA. */
export function vencimientoIibb(periodo) {
  if (!periodoValido(periodo)) throw new Error(`vencimientos-fiscales: período inválido "${periodo}" (se espera YYYY-MM)`)
  const a = Number(periodo.slice(0, 4)); const m = Number(periodo.slice(5, 7))
  const sig = m === 12 ? { a: a + 1, m: 1 } : { a, m: m + 1 }
  return {
    fecha: diaHabilODespues(sig.a, sig.m, IIBB_SUPUESTO.dia),
    confianza: 'supuesto',
    fuente: `DGR San Juan · día ${IIBB_SUPUESTO.dia} SUPUESTO (${IIBB_SUPUESTO.porQue})`,
  }
}

/** Cuándo se debita la cuota de un plan de facilidades. PURA. */
export function vencimientoPlan(mes) {
  if (!periodoValido(mes)) throw new Error(`vencimientos-fiscales: mes inválido "${mes}" (se espera YYYY-MM)`)
  const tabla = VENCIMIENTO_PLAN[mes]
  if (tabla) return { fecha: tabla, confianza: 'verificado', fuente: `${FUENTE_VERIFICADA.organismo} · Mis Facilidades R.G. 3.516/3.827` }
  return {
    fecha: diaHabilODespues(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)), 16),
    confianza: 'supuesto',
    fuente: `regla de reserva (día 16 hábil) — la tabla verificada no cubre ${mes}`,
  }
}

/**
 * NÚCLEO PURO: la fecha en que ARCA DEBITA de verdad una cuota de plan cargada para el día `iso`.
 *
 * ═══ POR QUÉ EXISTE (06/08) ═══
 *
 * La cuota de agosto de dos planes está cargada en Compras al 16/08/2026, que es DOMINGO, y ARCA no
 * debita fines de semana. El libro tomaba esa fecha tal cual y llevaba $2.968.642,73 al 16/08 mientras
 * el calendario de "Impuestos y Financieros" —que sale de la tabla del organismo— los ponía el 18. Dos
 * fechas para la misma plata, con dos días de diferencia, en el cuadro con el que se decide un pago.
 *
 * LOS DATOS DEL DUEÑO NO SE TOCAN. La corrección vive del lado del que LEE: Compras sigue diciendo lo
 * que él cargó y el libro emite el movimiento en el día en que el débito ocurre.
 *
 * SÓLO FIN DE SEMANA, Y ES DELIBERADO. Una fecha cargada en día hábil que no coincide con la tabla es
 * una decisión (o un dato que el OS no tiene) y manda la suya. Un débito automático en domingo no es
 * una decisión: es imposible.
 *
 * @param {string} iso la fecha cargada, 'YYYY-MM-DD'
 * @returns {{fecha:string, corregida:boolean, confianza:'verificado'|'supuesto'|'cargada', motivo:string}}
 */
export function debitoRealDePlan(iso) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(iso ?? ''))) {
    throw new Error(`vencimientos-fiscales: fecha inválida "${iso}" (se espera YYYY-MM-DD). No invento un día de débito.`)
  }
  const dow = new Date(aUTC(iso)).getUTCDay()
  if (dow !== 0 && dow !== 6) return { fecha: iso, corregida: false, confianza: 'cargada', motivo: 'la fecha cargada es día hábil' }
  const mes = iso.slice(0, 7)
  const tabla = VENCIMIENTO_PLAN[mes]
  if (tabla) {
    return {
      fecha: tabla,
      corregida: tabla !== iso,
      confianza: 'verificado',
      motivo: `${iso} cae ${dow === 0 ? 'domingo' : 'sábado'} y ARCA no debita: va al ${tabla} del calendario de ${FUENTE_VERIFICADA.organismo}`,
    }
  }
  // Sin tabla se corre al lunes, y se corre la fecha QUE ÉL CARGÓ —no el día 16 de la regla de
  // reserva—: si eligió otro día, el que no se sabe es el corrimiento, no el día.
  const habil = diaHabilODespues(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)), Number(iso.slice(8, 10)))
  return {
    fecha: habil,
    corregida: habil !== iso,
    confianza: 'supuesto',
    motivo: `${iso} cae ${dow === 0 ? 'domingo' : 'sábado'} y la tabla verificada no cubre ${mes}: se corre al hábil siguiente (${habil}), SIN feriados`,
  }
}

/** Cuándo debita el banco la cuota del prendario. Medido, no normado. PURA. */
export function vencimientoPrendario(mes) {
  if (!periodoValido(mes)) throw new Error(`vencimientos-fiscales: mes inválido "${mes}" (se espera YYYY-MM)`)
  return {
    fecha: `${mes}-${String(PRENDARIO_DIA).padStart(2, '0')}`,
    confianza: 'medido',
    fuente: `Santander · débito automático el día ${PRENDARIO_DIA} (12 cuotas en Compras + los débitos del extracto)`,
  }
}

/** El resolvedor por tipo de obligación, en un solo lugar. */
const RESOLUTOR = {
  iva: vencimientoIva,
  iibb: vencimientoIibb,
  plan: vencimientoPlan,
  prendario: vencimientoPrendario,
}

/** Los tipos que este calendario sabe fechar. Quien pida otro rompe: no se inventa una fecha. */
export const TIPOS = Object.keys(RESOLUTOR)

/**
 * NÚCLEO PURO: el calendario ordenado.
 *
 * LOS IMPORTES NO ENTRAN ACÁ Y ES DELIBERADO. Cada obligación viaja con la CELDA de la que sale su
 * importe, no con el número: el cuadro escribe `=I52` y lee la fuente viva. Un importe tipeado en el
 * calendario sería una tercera versión del mismo peso, que es exactamente lo que este archivo evita.
 * Por eso también el orden es por FECHA y nunca por monto: se puede ordenar sin conocer un solo peso.
 *
 * @param {Array<{tipo:string, periodo:string, concepto:string, celda:string}>} obligaciones
 * @param {{hoy:string, limite?:number}} opciones
 * @returns {Array<{fecha, serial, dias, vencido, tipo, periodo, concepto, celda, confianza, fuente}>}
 */
export function calendario(obligaciones = [], { hoy, limite = Infinity } = {}) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(hoy ?? ''))) {
    throw new Error('vencimientos-fiscales: necesito "hoy" como YYYY-MM-DD. Sin fecha de corte, "próximo vencimiento" no quiere decir nada.')
  }
  const filas = obligaciones.map((o) => {
    const resolver = RESOLUTOR[o.tipo]
    if (!resolver) throw new Error(`vencimientos-fiscales: no sé fechar "${o.tipo}". Los tipos son: ${TIPOS.join(', ')}. No invento una fecha.`)
    const { fecha, confianza, fuente } = resolver(o.periodo)
    return {
      ...o, fecha, serial: serialDe(fecha), confianza, fuente,
      dias: diasEntre(hoy, fecha), vencido: diasEntre(hoy, fecha) < 0,
    }
  })
  filas.sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : String(a.concepto).localeCompare(String(b.concepto))))
  return filas.slice(0, limite)
}

/**
 * NÚCLEO PURO: qué cae dentro de una ventana de N días desde hoy (sin incluir lo ya vencido).
 * Las ventanas son ACUMULADAS —30 está adentro de 60 y de 90— porque la pregunta del dueño es
 * "cuánto tengo que juntar para los próximos 60 días", no "cuánto cae en el segundo mes".
 */
export const enVentana = (filas = [], dias) => filas.filter((f) => !f.vencido && f.dias <= dias)

/** NÚCLEO PURO: lo que ya venció y sigue en el cuadro. Es riesgo, no proyección. */
export const vencidos = (filas = []) => filas.filter((f) => f.vencido)

/**
 * NÚCLEO PURO: hasta dónde llega la tabla verificada de cada impuesto.
 * El generador lo imprime en cada corrida: una tabla que se queda vieja tiene que avisar sola, y no
 * enterarse es cómo un dato verificado se convierte en un supuesto sin que nadie lo note.
 */
export function cobertura() {
  const ult = (t) => Object.keys(t).sort().pop() ?? null
  return { iva: ult(VENCIMIENTO_IVA), plan: ult(VENCIMIENTO_PLAN), iibb: null, prendario: null }
}
