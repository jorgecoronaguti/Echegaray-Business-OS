// «NÓMINA» MANDA SOBRE LO PROYECTADO DEL CASH FLOW (dueño, 24/09/2026: «(A) Nómina manda: lo que
// edites es lo que sale en el Cash Flow, en el momento … pero tenés que cablear todo bien»).
//
// ═══ EL PROBLEMA QUE ESTO CIERRA ═══
//
// Había dos proyecciones del mismo gasto. «Nómina» (la pestaña hecha a mano del dueño: sueldo por
// persona y mes, el % en blanco, las cargas por empleado) y el Cash Flow, que proyectaba desde
// «Jornales por Quincena» y «Cargas Sociales». Medido el 24/09: oct $45,8 M contra $41,6 M, nov $45,8 M
// contra $38,2 M. Editar Nómina no movía nada.
//
// ═══ EL CABLE, EN DOS TRAMOS ═══
//
// 1 · EL PUENTE (cuadro 6 de «Nómina», fórmulas del Sheet): por mes, LO QUE FALTA PAGAR de cada línea
//     del Cash Flow — lo del mes según Nómina menos lo que el libro ya tiene como pagado/real de ese
//     mes. Cinco renglones con rango con nombre (`NOMBRES_PUENTE`).
// 2 · EL LIBRO: los renglones PROYECTADOS de esas líneas se escriben en `_MOVIMIENTOS` como FÓRMULA
//     que apunta al puente (`formulaDelPuente`). El Cash Flow Semanal y el Mensual ya son fórmulas sobre
//     `_MOVIMIENTOS`: una edición en Nómina recorre la cadena entera sin esperar la corrida.
//
// Las FECHAS de pago siguen saliendo de donde salían (quincenas, «Se paga el» de Oficina/Dirección,
// vencimientos de Cargas Sociales): Nómina dice CUÁNTO, no CUÁNDO. Lo declarado (DDJJ, boletas), lo
// pagado en Compras y lo que probó el banco no se tocan: el hecho le sigue ganando a la proyección.
//
// ═══ LO QUE NO ES EN EL MOMENTO (declarado, no escondido) ═══
//
// · El aguinaldo: sale de la remuneración que el libro ya emitió, así que sigue a Nómina con la
//   demora de la corrida (cada 2 h).
// · La cantidad de quincenas proyectadas de cada mes la fija la corrida: un mes que Nómina deja en
//   cero y después se sube a mano no tiene renglón hasta la corrida siguiente.
// · La app lee Postgres, que se sincroniza con `_MOVIMIENTOS` en la misma corrida.

/** Los cinco renglones del puente. El libro los lee por NOMBRE, igual que el resto de la nómina. */
export const NOMBRES_PUENTE = Object.freeze({
  jornales: 'NOMINA_CF_JORNALES',
  oficina: 'NOMINA_CF_OFICINA',
  direccion: 'NOMINA_CF_DIRECCION',
  f931: 'NOMINA_CF_F931',
  gremiales: 'NOMINA_CF_GREMIALES',
})

/** Dos celdas de Nómina que otras pestañas leen para seguirla: el total del mes y el % de aportes. */
export const NOMBRES_NOMINA_BASE = Object.freeze({ total: 'NOMINA_MES_TOTAL', aportes: 'NOMINA_PARAM_APORTES', personas: 'NOMINA_PERSONAS' })

export const ROTULO_PUENTE = '6 · LO QUE VA AL CASH FLOW · LO QUE FALTA PAGAR DE CADA MES'
export const ROTULOS_FILAS_PUENTE = Object.freeze({
  jornales: 'Jornales de obra',
  oficina: 'Oficina y jefes (mensual)',
  direccion: 'Dirección · retiros',
  f931: 'Cargas · F931',
  gremiales: 'Cargas · gremiales',
})

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null)

/**
 * Un rango con nombre del puente (1 fila × 12 meses) → doce importes. `null` si el rango no se pudo
 * leer o no tiene la forma: el llamador vuelve entonces a la proyección de antes y lo avisa.
 *
 * @param {unknown} valores lo leído con UNFORMATTED_VALUE
 * @returns {Array<number>|null}
 */
export function serieDelPuente(valores) {
  const fila = Array.isArray(valores) ? valores[0] : null
  if (!Array.isArray(fila)) return null
  const serie = Array.from({ length: 12 }, (_, i) => {
    const v = num(fila[i])
    return v === null ? 0 : Math.max(0, Math.round(v * 100) / 100)
  })
  return serie
}

/**
 * La celda de `_MOVIMIENTOS` que lee el puente. Separador `;`: el archivo está en es_AR y una fórmula
 * escrita por la API se interpreta en el locale del archivo.
 *
 * @param {string} nombre uno de `NOMBRES_PUENTE`
 * @param {number} mes 1..12
 * @param {number} [partes] en cuántos renglones se reparte el mes (las quincenas proyectadas)
 */
export function formulaDelPuente(nombre, mes, partes = 1) {
  if (!Object.values(NOMBRES_PUENTE).includes(nombre)) throw new Error(`nomina-puente: rango desconocido ${nombre}`)
  if (!(Number.isInteger(mes) && mes >= 1 && mes <= 12)) throw new Error(`nomina-puente: mes inválido ${mes}`)
  const base = `INDEX(${nombre};1;${mes})`
  return partes > 1 ? `=${base}/${partes}` : `=${base}`
}

/**
 * Dónde está cada cosa en «Nómina», por RÓTULO de la columna A (la pestaña es del dueño: se corre).
 * Devuelve filas 1-based o los rótulos que faltan.
 *
 * @param {Array<Array>} grilla la pestaña desde A1 (sólo importa la columna A)
 */
export function ubicarNomina(grilla = []) {
  const A = grilla.map((r) => String(r?.[0] ?? '').trim())
  const desde = (i0, pred) => { for (let i = i0; i < A.length; i++) if (pred(A[i])) return i; return -1 }
  const falta = []
  const iParam = desde(0, (t) => t === 'Parámetros')
  const iSec1 = desde(0, (t) => /^1 · NÓMINA/i.test(t))
  const iPersona1 = desde(Math.max(0, iSec1), (t) => t === 'Persona')
  // «Desvinculados en el año» SE RETIRÓ DEL CUADRO 1 (dueño, 24/09/2026: «confunde y suma en el total»).
  // Si todavía está, la lista de personas termina antes de él; si no, antes de «Oficina».
  const iOfi1 = desde(Math.max(0, iPersona1), (t) => t === 'Oficina')
  const iDesv = desde(Math.max(0, iPersona1), (t) => t === 'Desvinculados en el año')
  const iDesv1 = iDesv >= 0 && iDesv < iOfi1 ? iDesv : iOfi1
  const iTot1 = desde(Math.max(0, iOfi1), (t) => t === 'TOTAL')
  const iSec2 = desde(Math.max(0, iTot1), (t) => /^2 · CARGAS/i.test(t))
  const iTot2 = desde(Math.max(0, iSec2), (t) => t === 'TOTAL')
  const iDir = desde(0, (t) => t === 'TOTAL DIRECCIÓN')
  const iPuente = desde(0, (t) => t === ROTULO_PUENTE)
  const pares = { 'Parámetros': iParam, '1 · NÓMINA': iSec1, 'Persona (cuadro 1)': iPersona1,
    'Oficina (cuadro 1)': iOfi1, 'TOTAL (cuadro 1)': iTot1,
    '2 · CARGAS': iSec2, 'TOTAL (cuadro 2)': iTot2, 'TOTAL DIRECCIÓN': iDir }
  for (const [k, v] of Object.entries(pares)) if (v < 0) falta.push(k)
  if (falta.length) return { falta }
  let ultima = 0
  grilla.forEach((r, i) => { if (Array.isArray(r) && r.some((c) => String(c ?? '').trim() !== '')) ultima = i })
  return {
    falta: [],
    filaParametros: iParam + 2, // los valores van en la fila de abajo del rótulo «Parámetros»
    filaEncabezado: iPersona1 + 1,
    primeraPersona: iPersona1 + 2,
    ultimaPersona: iDesv1, // la fila anterior a «Desvinculados»
    filaOficina: iOfi1 + 1,
    filaTotal: iTot1 + 1,
    filaTotalCargas: iTot2 + 1,
    filaDireccion: iDir + 1,
    filaPuente: iPuente >= 0 ? iPuente + 1 : null,
    ultimaUsada: ultima + 1,
  }
}

const COLS_MES = ['D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O']

/**
 * El cuadro 6, fórmula por fórmula. Todo apunta a celdas de la misma pestaña (el Sheet corrige las
 * referencias si el dueño inserta filas) o a rangos con nombre de «Jornales por Quincena».
 *
 * Por línea, mes m (columna X):
 * · Jornales = TOTAL − Oficina (todo el cuadro 1 menos oficina: obreros, jefes y desvinculados) menos
 *   las quincenas reales cuyo «Hasta» cae en m. Lo que queda lo reparten las quincenas proyectadas.
 * · Oficina / Dirección = lo del mes menos lo PAGADO de ese mes en «Jornales por Quincena».
 * · Cargas: el TOTAL del cuadro 2 (devengado del mes) se parte en F931 y gremiales con las MISMAS
 *   alícuotas de la fila de parámetros: F931 = aportes + contribuciones SS y OS + ART (+ el seguro de
 *   vida, que es fijo por empleado); gremiales = UOCRA vida/FICS + fondo de cese (+ IERIC y FODECO
 *   sobre él). El total es el de Nómina al peso; la partición sólo decide en qué línea cae.
 *
 * @param {ReturnType<typeof ubicarNomina>} u
 * @param {{anio?:number}} [o]
 * @returns {{filas:Array<Array<string>>, rotulos:Array<string>}}
 */
export function cuadroPuente(u, { anio = 2026, filasOficina = [] } = {}) {
  const p = u.filaParametros
  const $ = (col) => `$${col}$${p}`
  const personas = (X) => `${X}$${u.primeraPersona}:${X}$${u.ultimaPersona}`
  const filaTit = []
  const filaEnc = ['Concepto', '', '', ...COLS_MES.map((X) => `=${X}$${u.filaEncabezado}`), 'TOTAL']
  const orden = ['jornales', 'oficina', 'direccion', 'f931', 'gremiales']
  // La fila de F931 dentro del cuadro: la de gremiales la necesita (total − F931).
  const base = (u.filaPuente ?? (u.ultimaUsada + 3))
  const filaDe = (k) => base + 2 + orden.indexOf(k)
  // Las personas del cuadro 1 que son de «Oficina» (los jefes, ver `filasDeOficina`): se pagan por mes
  // con Oficina, no por quincena. Van a la línea de sueldos de administración y salen de jornales.
  const jefes = (X) => (filasOficina.length ? filasOficina.map((r) => `N(${X}$${r})`).join('+') : '0')
  const f = {
    jornales: (X, m) => `=MAX(0;N(${X}$${u.filaTotal})-N(${X}$${u.filaOficina})-(${jefes(X)})-SUMPRODUCT(IFERROR((MONTH(JORNALES_REAL_HASTA)=${m})*(YEAR(JORNALES_REAL_HASTA)=${anio})*JORNALES_REAL_TOTAL;0)))`,
    // UN MES QUE JORNALES YA CERRÓ NO DEBE NADA (24/09/2026): con pagado y sin proyección, lo que
    // diga Nómina de ese mes es historia, no deuda. Sin esta guarda, febrero publicaba $665.000 «por
    // pagar» (los $3,6 M tipeados de los jefes contra lo que de verdad se pagó) y el libro lo emitía
    // VENCIDO. Agosto —pagado en parte, con el resto proyectado a mano— sigue abierto.
    oficina: (X, m) => `=IF(AND(N(INDEX(OFICINA_PAGADO;${m};1))>0;N(INDEX(OFICINA_PROYECTADO;${m};1))=0);0;MAX(0;N(${X}$${u.filaOficina})+(${jefes(X)})-N(INDEX(OFICINA_PAGADO;${m};1))))`,
    direccion: (X, m) => `=IF(AND(N(INDEX(DIRECCION_PAGADO;${m};1))>0;N(INDEX(DIRECCION_PROYECTADO;${m};1))=0);0;MAX(0;N(${X}$${u.filaDireccion})-N(INDEX(DIRECCION_PAGADO;${m};1))))`,
    f931: (X) => `=LET(t;N(${X}$${u.filaTotalCargas});s;${$('H')}*COUNTIF(${personas(X)};">0");`
      + `rf;${$('D')}+${$('E')}+${$('F')}+${$('G')};`
      + `rg;${$('I')}+(CARGAS_PROPORCION_PRIMER_ANIO*${$('J')}+(1-CARGAS_PROPORCION_PRIMER_ANIO)*${$('K')})*(1+${$('L')}+${$('M')});`
      + 'IF(t<=0;0;MIN(t;(t-s)*rf/(rf+rg)+s)))',
    gremiales: (X) => `=MAX(0;N(${X}$${u.filaTotalCargas})-N(${X}${filaDe('f931')}))`,
  }
  filaTit.push(ROTULO_PUENTE)
  const filas = [filaTit, filaEnc]
  for (const k of orden) {
    const fila = base + 2 + orden.indexOf(k)
    filas.push([ROTULOS_FILAS_PUENTE[k], '', '', ...COLS_MES.map((X, i) => f[k](X, i + 1)), `=SUM(D${fila}:O${fila})`])
  }
  return { filas, filaInicio: base, filaDe, orden }
}

/**
 * Las dos series de un rubro de cargas (proyección y «declarado») con Nómina adentro. PURO.
 *
 * · La proyección de los doce meses pasa a ser la de Nómina.
 * · «TOTAL DECLARADO» NO ES UNA DDJJ CUANDO REPITE LA PROYECCIÓN: «Cargas Sociales» rellena ese
 *   renglón con la proyección del mes sin DDJJ (`=IF(N(J45)=0;"sin DDJJ";J45)`) y el libro lo tomaba
 *   como COMPROMETIDO, así lo proyectado entraba como un hecho y el puente no tenía por dónde pasar.
 *   Un declarado idéntico a la proyección propia del mismo mes se descarta; una DDJJ distinta gana.
 * Sin Nómina, todo queda como estaba.
 *
 * @returns {{importes:Array, declarado:Array, conNomina:boolean}}
 */
export function seriesConNomina({ propia = [], declarado = [], deNomina = null } = {}) {
  if (!Array.isArray(deNomina)) return { importes: propia, declarado, conNomina: false }
  const n = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
  return {
    importes: propia.map((v, i) => (i < 12 ? deNomina[i] : v)),
    declarado: declarado.map((d, i) => (n(d) !== null && n(propia[i]) !== null && Math.abs(n(d) - n(propia[i])) < 1 ? null : d)),
    conNomina: true,
  }
}

const r2 = (n) => Math.round(n * 100) / 100

/**
 * LOS RENGLONES DE CARGAS SOCIALES, VIVOS (dueño, 24/09/2026: «necesito que los cash flows se
 * actualicen si toco algo yo de manera manual en tiempo real»). La celda del libro apunta a la de la
 * pestaña: la FECHA a `CARGAS_MES_FECHAS`; el IMPORTE a Nómina si es proyección, o al «Total declarado»
 * si es DDJJ (menos lo que el banco ya cubrió, que es un hecho y queda fijo). PURO.
 *
 * @param {object} mov el movimiento ya armado
 * @param {{b:{que:string, puente:string|null}, o:{estado:string, importe:number}, neto:{importe:number, parcial:boolean}, i:number}} x
 */
export function vivoDeCargas(mov, { b, o, neto, i }) {
  if (!(i >= 0 && i < 12)) return mov
  const m = i + 1
  let importeFormula
  if (o.estado === 'PROYECTADO' && b.puente && !neto.parcial) importeFormula = formulaDelPuente(b.puente, m)
  else if (o.estado === 'COMPROMETIDO') {
    const rango = b.que === 'F931' ? 'CARGAS_MES_F931_DECLARADO' : 'CARGAS_MES_GREMIALES_DECLARADO'
    const cubierto = r2(o.importe - neto.importe)
    importeFormula = cubierto >= 0.01 ? `=MAX(0;INDEX(${rango};1;${m})-${cubierto})` : `=INDEX(${rango};1;${m})`
  }
  return Object.freeze({ ...mov, ...(importeFormula ? { importeFormula } : {}), fechaFormula: `=INDEX(CARGAS_MES_FECHAS;1;${m})` })
}

/** La fecha viva de un renglón de «Jornales por Quincena» (rango vertical, renglón i base 0). */
export const fechaViva = (rango, i) => `=INDEX(${rango};${i + 1};1)`

/**
 * EL AGUINALDO PROYECTADO, VIVO SOBRE NÓMINA (dueño, 24/09/2026: «quiero todo en tiempo real»). PURO.
 *
 * 50 % de la mayor remuneración mensual DEVENGADA del semestre (LCT 121): el TOTAL del cuadro 1 de
 * Nómina de cada mes (obreros, jefes, oficina, desvinculados — sin los retiros de Dirección, que no
 * son remuneración). Antes se medía sobre lo PAGADO por fecha de caja, y el mes que juntaba la
 * quincena del mes anterior inflaba la base. Mismo límite que antes: es el agregado de la empresa,
 * no la mejor remuneración de cada persona.
 *
 * @param {object} mov el movimiento PROYECTADO del SAC (origen.fila = 'semestre 1' | 'semestre 2')
 * @param {Array<number>|null} totalMes los doce totales de Nómina (NOMINA_MES_TOTAL)
 */
export function sacDesdeNomina(mov, totalMes) {
  const sem = /semestre (1|2)/.exec(String(mov?.origen?.fila ?? ''))?.[1]
  if (!Array.isArray(totalMes) || mov?.estado === 'REAL' || !sem) return mov
  const meses = sem === '1' ? [1, 2, 3, 4, 5, 6] : [7, 8, 9, 10, 11, 12]
  const mejor = Math.max(...meses.map((m) => Number(totalMes[m - 1]) || 0))
  if (!(mejor > 0)) return mov
  const formula = `=MAX(${meses.map((m) => `INDEX(${NOMBRES_NOMINA_BASE.total};1;${m})`).join(';')})/2`
  return Object.freeze({ ...mov, importe: r2(mejor / 2), importeFormula: formula,
    concepto: `SAC · semestre ${sem} · 50% del mejor mes de Nómina` })
}

/**
 * ¿Qué personas del cuadro 1 de Nómina son las de «Oficina» de Jornales? (24/09/2026). PURO.
 *
 * EL DOBLE CONTEO QUE ESTO CIERRA: el bloque «Oficina» de «Jornales por Quincena» son los dos jefes
 * de obra (Emi Maldonado y Juan Pablo Nievas), y Nómina los tenía DOS veces — por nombre (filas de
 * persona, $1,8 M c/u) y en el renglón «Oficina» ($3,6 M, traído de Jornales). El Cash Flow los
 * contaba en jornales y en sueldos de administración, con sus cargas: −$27 M al cierre sin que el
 * dueño tocara nada. Los nombres no se escriben igual en las dos planillas («Emi Maldonado» /
 * «Maldonado Emiliano»): coinciden si comparten un apellido y el nombre de una es prefijo del de la
 * otra.
 *
 * @param {Array<{fila:number, nombre:string}>} personas las filas de persona del cuadro 1
 * @param {Array<string>} deOficina los nombres del espejo `_J_OFICINA`
 * @returns {Array<number>} las filas (1-based) que son de Oficina
 */
export function filasDeOficina(personas = [], deOficina = []) {
  const tok = (n) => String(n ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').split(/[^a-zñ]+/).filter((t) => t.length > 1)
  const casa = (a, b) => {
    const A = tok(a); const B = tok(b)
    if (A.length < 2 || B.length < 2) return false
    const comunes = A.filter((t) => B.includes(t))
    if (!comunes.length) return false
    const restoA = A.filter((t) => !comunes.includes(t)); const restoB = B.filter((t) => !comunes.includes(t))
    if (!restoA.length || !restoB.length) return comunes.length >= 2
    return restoA.some((x) => restoB.some((y) => x.startsWith(y) || y.startsWith(x)))
  }
  return personas.filter((p) => deOficina.some((o) => casa(p.nombre, o))).map((p) => p.fila)
}
