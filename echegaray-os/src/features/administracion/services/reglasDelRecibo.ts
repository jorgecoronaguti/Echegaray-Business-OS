// LAS REGLAS DEL RECIBO DE SUELDO, DERIVADAS DE LOS RECIBOS REALES — NUNCA DE MEMORIA.
//
// Dueño, 14/09/2026: *«quiero q el menu de la derecha … me muestre una liquidacion estimada concepto por
// concepto tomando en cuenta lo q se considera todas las quincenas en el recibo de sueldo»*. Cada regla sale
// de los conceptos guardados (`recibo_sueldo_concepto`) de las últimas `VENTANA` quincenas ANTERIORES a la
// que se estima, y viaja con su evidencia: cuántos recibos, cuántos reproduce al centavo, mediana y rango.
// Una alícuota escrita a mano en este archivo sería un número que nadie firmó y que la próxima paritaria
// deja viejo sin que nada se ponga rojo.
//
// ═══ LOS MODELOS QUE SE PRUEBAN ═══ Gana el que reproduce más recibos AL CENTAVO; empate, el más simple.
//
//   porcentaje             round2(tasa × base); base = remunerativo, o remunerativo + no remunerativo
//   monto fijo             el importe del último período que lo trae, el mismo para todos
//   horas faltantes        round2(tasa × $/h × (jornada − horas)), con la tasa de OTRO concepto (Art. 92 ter)
//   porcentaje por persona la tasa del último recibo de cada uno (fondo de cese: 12 % el primer año, 8 % después)
//
// Una regla que reproduce menos del 90 % de sus recibos, o que tiene menos de 5, es DUDOSA: el estimado no le
// pone número y lo dice. Lo medido sobre los 299 recibos 2026 va en el commit, no acá: los números cambian con
// cada paritaria; la forma de la regla, no.
//
// Puro: sin base, sin React. Lo usan `reciboEstimado.ts` y el cotejo `orquestador/scripts/recibo-estimado-cotejo.mjs`.

export type SeccionDelConcepto = 'remunerativo' | 'no_remunerativo' | 'descuento' | 'contribucion'

export interface ConceptoDeRecibo {
  codigo: string
  descripcion: string
  seccion: SeccionDelConcepto
  unidad: number | null
  base: number | null
  /** Con signo: el 0426 AJUSTE COD.0425 es negativo. */
  monto: number
}

/** Lo que las reglas necesitan de un recibo: su período, sus horas, su $/h y sus conceptos. */
export interface ReciboParaReglas {
  /** La llave de la persona para las reglas por persona (CUIL, o un alias en los fixtures). */
  persona: string | null
  periodo: string
  valorHora: number | null
  /** La categoría impresa en ese recibo («OFICIAL», «AYUDANTE»…). Viaja para poder decir de qué categoría es el $/h. */
  categoria?: string | null
  horasNormales: number | null
  horasFeriado: number | null
  horasOtras: number | null
  conceptos: readonly ConceptoDeRecibo[]
}

export type BaseDelPorcentaje = 'remunerativo' | 'remunerativo_y_no_remunerativo'

export type ModeloDeConcepto =
  | { tipo: 'porcentaje'; tasa: number; base: BaseDelPorcentaje }
  | { tipo: 'monto_fijo'; monto: number; periodo: string }
  /** round2(tasa × ($/h × (jornada − horas) + no remunerativo si `masNoRemunerativo`)). */
  | { tipo: 'horas_faltantes'; tasa: number; jornada: number; masNoRemunerativo: boolean }
  | { tipo: 'porcentaje_por_persona'; base: BaseDelPorcentaje; tasas: Readonly<Record<string, number>> }

export interface Evidencia {
  /** Recibos contra los que se probó la regla. */
  recibos: number
  /** Cuántos reproduce al centavo. */
  aciertos: number
  mediana: number | null
  min: number | null
  max: number | null
}

export interface ReglaDeConcepto {
  codigo: string
  descripcion: string
  seccion: 'descuento' | 'contribucion'
  modelo: ModeloDeConcepto
  evidencia: Evidencia
  dudosa: boolean
  /** Por qué es dudosa, o una advertencia (el monto fijo que cambió en la ventana). */
  motivo: string | null
  /** ¿La quincena que se estima lo trae? Por presencia en la ventana (ver `aplicaEn`). */
  aplica: boolean
  /** 1 o 2 si en la ventana sólo aparece en esa quincena del mes (seguro de vida UOCRA: la segunda). */
  soloQuincena: 1 | 2 | null
}

export interface ReglaDeAjuste {
  recibos: number
  conAjuste: number
  /** true: el 0426 anula el 0425 · false: no lo anula · null: no está claro (dudosa). */
  anula: boolean | null
}

export interface ReglasDelRecibo {
  /** El período que se estima: las reglas usan sólo recibos ANTERIORES. */
  antesDe: string
  periodos: string[]
  recibos: number
  /** Horas de la jornada completa quincenal (la del Art. 92 ter). `null` si ningún concepto la revela. */
  jornada: number | null
  horas: {
    /** Horas que el recibo de media jornada liquida (normales + feriado). */
    parcial: number | null
    evidencia: Evidencia
    dudosa: boolean
    /** Horas de feriado por cada feriado hábil, por jornada. */
    feriadoPorDia: { parcial: number | null; completa: number | null }
  }
  asistencia: {
    /** 0425 = tasa × 0401. */
    tasa: number | null
    evidencia: Evidencia
    dudosa: boolean
    ajuste: { parcial: ReglaDeAjuste; completa: ReglaDeAjuste }
  }
  conceptos: ReglaDeConcepto[]
}

export const VENTANA = 4
export const MIN_RECIBOS = 5
export const ACIERTO_MINIMO = 0.9

// MEDIO CENTAVO HACIA ARRIBA, COMO EL ESTUDIO: 2,55 % × 276.350 = 7.046,925 va impreso 7.046,93, y en coma
// flotante 704.692,4999… redondea a 7.046,92. El épsilon es mucho menor que cualquier importe real.
export const r2 = (n: number): number => Math.round(n * 100 + (n >= 0 ? 1e-6 : -1e-6)) / 100
export const alCentavo = (a: number, b: number): boolean => Math.abs(Math.round(a * 100) - Math.round(b * 100)) <= 1
const redondearTasa = (t: number): number => Math.round(t * 1e7) / 1e7

/** `Q2-08/2026` → `2026-08-2`: ordena períodos quincenales como texto. `''` para FINAL u otro formato. */
export function periodoOrdenable(periodo: string): string {
  const m = /^Q([12])-(\d{2})\/(\d{4})$/.exec(periodo.trim())
  return m ? `${m[3]}-${m[2]}-${m[1]}` : ''
}

export const quincenaDelPeriodo = (periodo: string): 1 | 2 | null => {
  const m = /^Q([12])-/.exec(periodo.trim())
  return m ? (m[1] === '1' ? 1 : 2) : null
}

export function medianaDe(valores: readonly number[]): number | null {
  if (valores.length === 0) return null
  const v = [...valores].sort((a, b) => a - b)
  const m = Math.floor(v.length / 2)
  return v.length % 2 === 1 ? v[m] : (v[m - 1] + v[m]) / 2
}

function modaDe(valores: readonly number[]): { valor: number | null; veces: number } {
  const cuenta = new Map<number, number>()
  for (const v of valores) cuenta.set(v, (cuenta.get(v) ?? 0) + 1)
  let valor: number | null = null, veces = 0
  for (const [v, n] of cuenta) if (n > veces) { valor = v; veces = n }
  return { valor, veces }
}

export const sumaDeSeccion = (r: { conceptos: readonly ConceptoDeRecibo[] }, s: SeccionDelConcepto): number =>
  r2(r.conceptos.filter((c) => c.seccion === s).reduce((a, c) => a + c.monto, 0))

export const montoDelCodigo = (r: { conceptos: readonly ConceptoDeRecibo[] }, codigo: string): number | null => {
  const cs = r.conceptos.filter((c) => c.codigo === codigo)
  return cs.length ? r2(cs.reduce((a, c) => a + c.monto, 0)) : null
}

export const horasDelRecibo = (r: ReciboParaReglas): number => (r.horasNormales ?? 0) + (r.horasFeriado ?? 0) + (r.horasOtras ?? 0)

export const baseDelPorcentaje = (r: { conceptos: readonly ConceptoDeRecibo[] }, base: BaseDelPorcentaje): number =>
  base === 'remunerativo' ? sumaDeSeccion(r, 'remunerativo') : r2(sumaDeSeccion(r, 'remunerativo') + sumaDeSeccion(r, 'no_remunerativo'))

function evidenciaDe(valores: readonly number[], aciertos: number): Evidencia {
  return {
    recibos: valores.length, aciertos, mediana: medianaDe(valores),
    min: valores.length ? Math.min(...valores) : null, max: valores.length ? Math.max(...valores) : null,
  }
}

interface Prueba { modelo: ModeloDeConcepto; evidencia: Evidencia; motivo: string | null }
const proporcion = (p: Prueba): number => (p.evidencia.recibos ? p.evidencia.aciertos / p.evidencia.recibos : 0)

function probarPorcentaje(con: readonly ReciboParaReglas[], codigo: string, base: BaseDelPorcentaje): Prueba | null {
  const pares = con.flatMap((r) => {
    const b = baseDelPorcentaje(r, base), m = montoDelCodigo(r, codigo)
    return b > 0 && m != null ? [{ b, m }] : []
  })
  const tasa = medianaDe(pares.map((p) => p.m / p.b))
  if (tasa == null) return null
  const t = redondearTasa(tasa)
  const aciertos = pares.filter((p) => alCentavo(r2(t * p.b), p.m)).length
  return { modelo: { tipo: 'porcentaje', tasa: t, base }, evidencia: evidenciaDe(pares.map((p) => p.m / p.b), aciertos), motivo: null }
}

/** El importe del último período que lo trae. Si en la ventana cambió, se dice: el próximo puede ser otro. */
function probarMontoFijo(con: readonly ReciboParaReglas[], codigo: string): Prueba | null {
  const ultimo = con.map((r) => r.periodo).sort((a, b) => (periodoOrdenable(a) < periodoOrdenable(b) ? 1 : -1))[0]
  if (!ultimo) return null
  const montos = con.filter((r) => r.periodo === ultimo).map((r) => montoDelCodigo(r, codigo)).filter((m): m is number => m != null)
  const { valor, veces } = modaDe(montos)
  if (valor == null) return null
  const distintos = new Set(con.map((r) => montoDelCodigo(r, codigo))).size
  const motivo = distintos > 1 ? `el importe cambió en la ventana (${distintos} importes distintos): se usa el de ${ultimo}` : null
  return { modelo: { tipo: 'monto_fijo', monto: valor, periodo: ultimo }, evidencia: evidenciaDe(montos, veces), motivo }
}

/**
 * Art. 92 ter: tasa × ($/h × (jornada − horas) [+ no remunerativo]). La tasa es la de otro concepto; la jornada, la
 * que los reproduce. Las dos variantes porque los recibos las usan: en julio 2026 la contribución 5051 suma la
 * suma no remunerativa entera a la base y el aporte 4170 no. Empate: sin no remunerativo, la más simple.
 */
function probarHorasFaltantes(
  con: readonly ReciboParaReglas[], codigo: string, tasas: readonly number[], explica: (jornada: number) => boolean,
): Prueba | null {
  let mejor: Prueba | null = null
  for (const masNoRemunerativo of [false, true]) {
    const casos = con.flatMap((r) => {
      const m = montoDelCodigo(r, codigo), vh = r.valorHora
      const nr = masNoRemunerativo ? sumaDeSeccion(r, 'no_remunerativo') : 0
      return m != null && vh != null && vh > 0 ? [{ m, vh, h: horasDelRecibo(r), nr }] : []
    })
    for (const t of tasas) {
      const implicitas = casos.map((c) => c.h + (c.m / t - c.nr) / c.vh)
      const j = medianaDe(implicitas)
      if (j == null || !explica(Math.round(j))) continue
      const jornada = Math.round(j)
      const aciertos = casos.filter((c) => alCentavo(r2(t * (c.vh * (jornada - c.h) + c.nr)), c.m)).length
      const prueba: Prueba = { modelo: { tipo: 'horas_faltantes', tasa: t, jornada, masNoRemunerativo }, evidencia: evidenciaDe(implicitas, aciertos), motivo: null }
      if (!mejor || proporcion(prueba) > proporcion(mejor)) mejor = prueba
    }
  }
  return mejor
}

/** La tasa del último recibo de cada persona. Sólo si las tasas son pocas: si cada uno tiene la suya, no es una regla. */
function probarPorPersona(con: readonly ReciboParaReglas[], codigo: string, base: BaseDelPorcentaje): Prueba | null {
  const orden = [...con].sort((a, b) => (periodoOrdenable(a.periodo) < periodoOrdenable(b.periodo) ? -1 : 1))
  const tasas: Record<string, number> = {}
  for (const r of orden) {
    const b = baseDelPorcentaje(r, base), m = montoDelCodigo(r, codigo)
    if (r.persona && b > 0 && m != null) tasas[r.persona] = Math.round((m / b) * 1e4) / 1e4
  }
  if (new Set(Object.values(tasas)).size > 3 || Object.keys(tasas).length === 0) return null
  const valores: number[] = []
  let aciertos = 0
  for (const r of con) {
    const b = baseDelPorcentaje(r, base), m = montoDelCodigo(r, codigo), t = r.persona ? tasas[r.persona] : undefined
    if (m == null || b <= 0 || t == null) continue
    valores.push(m / b)
    if (alCentavo(r2(t * b), m)) aciertos++
  }
  const distintas = [...new Set(Object.values(tasas))].sort((a, b) => a - b)
  return { modelo: { tipo: 'porcentaje_por_persona', base, tasas }, evidencia: evidenciaDe(valores, aciertos), motivo: `tasas por persona: ${distintas.map((t) => `${(t * 100).toFixed(2)} %`).join(' / ')}` }
}

const mejorDe = (pruebas: readonly (Prueba | null)[]): Prueba | null =>
  pruebas.reduce<Prueba | null>((m, p) => (p && (!m || proporcion(p) > proporcion(m)) ? p : m), null)

/**
 * ¿LA QUINCENA QUE SE ESTIMA TRAE ESTE CÓDIGO? Un código de una sola mitad del mes (lo trae el último período de
 * esa mitad y ningún período de la otra desde que apareció) aplica sólo a esa mitad. Cualquier otro, si lo trae
 * al menos la mitad de los recibos del último período de la ventana: así entra un concepto nuevo y sale uno que
 * dejó de liquidarse (la suma no remunerativa de agosto).
 */
export function aplicaEn(codigo: string, ventana: readonly ReciboParaReglas[], objetivo: string): { aplica: boolean; soloQuincena: 1 | 2 | null } {
  const periodos = [...new Set(ventana.map((r) => r.periodo))].sort((a, b) => (periodoOrdenable(a) < periodoOrdenable(b) ? -1 : 1))
  const presente = (p: string): boolean => {
    const rs = ventana.filter((r) => r.periodo === p)
    return rs.length > 0 && rs.filter((r) => montoDelCodigo(r, codigo) != null).length / rs.length >= 0.5
  }
  const primero = periodos.findIndex(presente)
  if (primero < 0) return { aplica: false, soloQuincena: null }
  const desde = periodos.slice(primero)
  for (const mitad of [1, 2] as const) {
    const propios = desde.filter((p) => quincenaDelPeriodo(p) === mitad)
    const otros = desde.filter((p) => quincenaDelPeriodo(p) !== mitad)
    if (propios.length && otros.length && presente(propios[propios.length - 1]) && !otros.some(presente)) {
      return { aplica: quincenaDelPeriodo(objetivo) === mitad, soloQuincena: mitad }
    }
  }
  return { aplica: presente(periodos[periodos.length - 1]), soloQuincena: null }
}

/**
 * ¿LA JORNADA EXPLICA EN QUÉ RECIBOS FALTA EL CÓDIGO? En los períodos que lo traen, lo tiene quien liquida
 * menos horas que la jornada y no lo tiene quien liquida esas horas o más. Hace falta al menos un recibo de
 * jornada completa: sin él, «explica las ausencias» no afirmaría nada.
 */
function explicaAusencias(codigo: string, ventana: readonly ReciboParaReglas[], jornada: number): boolean {
  let casos = 0, coinciden = 0
  for (const p of new Set(ventana.map((r) => r.periodo))) {
    const rs = ventana.filter((r) => r.periodo === p)
    if (rs.filter((r) => montoDelCodigo(r, codigo) != null).length / rs.length < 0.5) continue
    for (const r of rs) { casos++; if ((montoDelCodigo(r, codigo) != null) === (horasDelRecibo(r) < jornada)) coinciden++ }
  }
  return casos > 0 && coinciden / casos >= ACIERTO_MINIMO && ventana.some((r) => horasDelRecibo(r) >= jornada)
}

/**
 * EL MODELO DE UN CÓDIGO. Con todas las medias jornadas en 50 h, «1,938 % del remunerativo» y «2,55 % × $/h ×
 * (88 − 50)» reproducen los mismos recibos: el porcentaje no dice por qué quien liquida 88 h no lo tiene, y las
 * horas faltantes sí. Ese es el desempate, y también sale de los recibos. Lo demás que no cierra prueba por persona.
 */
function modeloDelCodigo(
  codigo: string, seccion: SeccionDelConcepto, ventana: readonly ReciboParaReglas[], primera: Prueba | null,
  tasas: ReadonlyMap<string, { tasa: number; seccion: SeccionDelConcepto }>,
): Prueba | null {
  const con = ventana.filter((r) => montoDelCodigo(r, codigo) != null)
  // LA TASA MADRE ES DE LA MISMA SECCIÓN. Sin recibos entre 50 y 88 h, «2,55 % × (88 − h)» y «5,1 % × (69 − h)»
  // reproducen igual el 4170: el 5,1 % es la CONTRIBUCIÓN de obra social, y un aporte se calcula con el aporte.
  const madres = [...tasas].filter(([c, t]) => c !== codigo && t.seccion === seccion).map(([, t]) => t.tasa)
  const hf = probarHorasFaltantes(con, codigo, madres, (j) => explicaAusencias(codigo, ventana, j))
  if (hf && proporcion(hf) >= ACIERTO_MINIMO && (!primera || proporcion(hf) >= proporcion(primera))) return hf
  if (primera && proporcion(primera) >= ACIERTO_MINIMO) return primera
  return mejorDe([primera, probarPorPersona(con, codigo, 'remunerativo'), probarPorPersona(con, codigo, 'remunerativo_y_no_remunerativo')])
}

/** Primera pasada: porcentaje y monto fijo. Con esas tasas, las horas faltantes; lo que no cierra, por persona. */
function reglasDeConceptos(ventana: readonly ReciboParaReglas[], objetivo: string): ReglaDeConcepto[] {
  const codigos = new Map<string, ConceptoDeRecibo>()
  for (const r of ventana) for (const c of r.conceptos) if (c.seccion === 'descuento' || c.seccion === 'contribucion') codigos.set(c.codigo, c)
  const primera = new Map<string, Prueba | null>()
  for (const codigo of codigos.keys()) {
    const con = ventana.filter((r) => montoDelCodigo(r, codigo) != null)
    primera.set(codigo, mejorDe([probarPorcentaje(con, codigo, 'remunerativo'), probarPorcentaje(con, codigo, 'remunerativo_y_no_remunerativo'), probarMontoFijo(con, codigo)]))
  }
  const tasas = new Map([...primera].flatMap(([c, p]) => (p && p.modelo.tipo === 'porcentaje' && proporcion(p) >= ACIERTO_MINIMO
    ? [[c, { tasa: p.modelo.tasa, seccion: codigos.get(c)!.seccion }] as const] : [])))
  return [...codigos].sort(([a], [b]) => a.localeCompare(b)).flatMap(([codigo, c]) => {
    const p = modeloDelCodigo(codigo, c.seccion, ventana, primera.get(codigo) ?? null, tasas)
    if (!p) return []
    const pocos = p.evidencia.recibos < MIN_RECIBOS
    const flojo = proporcion(p) < ACIERTO_MINIMO
    const dudosa = pocos || flojo
    const motivo = pocos ? `sólo ${p.evidencia.recibos} recibos` : flojo ? `reproduce ${p.evidencia.aciertos} de ${p.evidencia.recibos} recibos al centavo` : p.motivo
    return [{ codigo, descripcion: c.descripcion, seccion: c.seccion as 'descuento' | 'contribucion', modelo: p.modelo, evidencia: p.evidencia, dudosa, motivo: dudosa && p.motivo ? `${motivo}; ${p.motivo}` : motivo, ...aplicaEn(codigo, ventana, objetivo) }]
  })
}

function ajusteDe(rs: readonly ReciboParaReglas[]): ReglaDeAjuste {
  const con = rs.filter((r) => montoDelCodigo(r, '0425') != null)
  const conAjuste = con.filter((r) => { const a = montoDelCodigo(r, '0426'), b = montoDelCodigo(r, '0425'); return a != null && b != null && alCentavo(a, -b) }).length
  const p = con.length ? conAjuste / con.length : null
  const anula = p == null || con.length < MIN_RECIBOS ? null : p >= ACIERTO_MINIMO ? true : p <= 1 - ACIERTO_MINIMO ? false : null
  return { recibos: con.length, conAjuste, anula }
}

function asistenciaDe(ventana: readonly ReciboParaReglas[], jornada: number | null): ReglasDelRecibo['asistencia'] {
  const pares = ventana.flatMap((r) => { const a = montoDelCodigo(r, '0425'), b = montoDelCodigo(r, '0401'); return a != null && b != null && b > 0 ? [{ a, b }] : [] })
  const med = medianaDe(pares.map((p) => p.a / p.b))
  const tasa = med == null ? null : redondearTasa(med)
  const aciertos = tasa == null ? 0 : pares.filter((p) => alCentavo(r2(tasa * p.b), p.a)).length
  const evidencia = evidenciaDe(pares.map((p) => p.a / p.b), aciertos)
  const esParcial = (r: ReciboParaReglas): boolean => jornada == null || horasDelRecibo(r) < jornada
  return {
    tasa, evidencia, dudosa: pares.length < MIN_RECIBOS || aciertos / pares.length < ACIERTO_MINIMO,
    ajuste: { parcial: ajusteDe(ventana.filter(esParcial)), completa: ajusteDe(ventana.filter((r) => !esParcial(r))) },
  }
}

function horasDe(ventana: readonly ReciboParaReglas[], jornada: number | null): ReglasDelRecibo['horas'] {
  const esParcial = (r: ReciboParaReglas): boolean => jornada == null || horasDelRecibo(r) < jornada
  const parciales = ventana.filter((r) => esParcial(r) && !(r.horasOtras ?? 0))
  const totales = parciales.map(horasDelRecibo)
  const { valor, veces } = modaDe(totales)
  const feriado = (rs: readonly ReciboParaReglas[]): number | null => modaDe(rs.map((r) => r.horasFeriado ?? 0).filter((h) => h > 0)).valor
  return {
    parcial: valor, evidencia: evidenciaDe(totales, veces),
    dudosa: totales.length < MIN_RECIBOS || veces / totales.length < ACIERTO_MINIMO,
    feriadoPorDia: { parcial: feriado(parciales), completa: feriado(ventana.filter((r) => !esParcial(r))) },
  }
}

/** LAS REGLAS PARA ESTIMAR `antesDe`, con los recibos quincenales de las `VENTANA` quincenas anteriores. */
export function reglasDelRecibo(recibos: readonly ReciboParaReglas[], antesDe: string): ReglasDelRecibo {
  const tope = periodoOrdenable(antesDe)
  const utiles = recibos.filter((r) => { const p = periodoOrdenable(r.periodo); return p !== '' && p < tope && r.conceptos.length > 0 })
  const periodos = [...new Set(utiles.map((r) => r.periodo))].sort((a, b) => (periodoOrdenable(a) < periodoOrdenable(b) ? 1 : -1)).slice(0, VENTANA)
  const ventana = utiles.filter((r) => periodos.includes(r.periodo))
  const conceptos = reglasDeConceptos(ventana, antesDe)
  const jornadas = conceptos.flatMap((c) => (c.modelo.tipo === 'horas_faltantes' && !c.dudosa ? [c.modelo.jornada] : []))
  const jornada = medianaDe(jornadas)
  return {
    antesDe, periodos: [...periodos].reverse(), recibos: ventana.length, jornada,
    horas: horasDe(ventana, jornada), asistencia: asistenciaDe(ventana, jornada), conceptos,
  }
}
