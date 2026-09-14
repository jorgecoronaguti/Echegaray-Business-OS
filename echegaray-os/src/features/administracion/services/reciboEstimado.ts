// EL RECIBO DE SUELDO ESTIMADO, CONCEPTO POR CONCEPTO, ANTES DE QUE LLEGUE EL DEL ESTUDIO.
//
// Dueño, 14/09/2026: *«si me das a dar un valor preliminar a pagar por banco antes de tener el recibo …
// liquidacion estimada concepto por concepto»*. Las reglas son las de `reglasDelRecibo` (derivadas de los
// recibos reales); acá sólo se aplican a una persona y una quincena:
//
//   horas del recibo   las escritas a mano, o la regla (media jornada) o su último recibo (jornada completa)
//   feriado            horas por feriado hábil × feriados de `calendario_no_laborable`; sin calendario, 0 y aviso
//   0401 / 0431        horas × $/h de categoría (el escrito a mano o el piso vigente)
//   0425 / 0426        tasa × 0401, y el ajuste que la anula si la regla de su jornada lo dice
//   descuentos         cada regla que aplica a la quincena; una dudosa queda sin número y el neto también
//
// NUNCA UN NETO CON UN AGUJERO: si un descuento que aplica no tiene número, el neto es `null` y la pantalla
// vuelve a la mediana, que al menos dice de dónde sale. Puro: sin base, sin React.

import {
  horasDelRecibo, periodoOrdenable, r2,
  type ConceptoDeRecibo, type ReciboParaReglas, type ReglaDeConcepto, type ReglasDelRecibo, type SeccionDelConcepto,
} from './reglasDelRecibo.ts'

export interface PersonaDelEstimado {
  /** La misma llave que `ReciboParaReglas.persona` (CUIL). */
  persona: string | null
  periodo: string
  valorHora: number | null
  /** `horas_recibo_manual`. `null` = la regla. */
  horasRecibo: number | null
  /** Feriados hábiles de la quincena según el calendario. `null` = el calendario no tiene el año cargado. */
  feriados: number | null
  /** Sus recibos: el último anterior decide si es jornada completa. */
  recibosPropios: readonly ReciboParaReglas[]
}

export interface LineaEstimada {
  codigo: string
  descripcion: string
  seccion: SeccionDelConcepto
  unidad: number | null
  base: number | null
  /** `null`: la regla es dudosa y no se le pone número. */
  monto: number | null
  /** De dónde sale: va al `title`. */
  fuente: string
}

export interface ReciboEstimado {
  periodo: string
  jornada: 'parcial' | 'completa'
  horasNormales: number
  horasFeriado: number
  valorHora: number
  lineas: LineaEstimada[]
  remunerativo: number | null
  descuentos: number | null
  neto: number | null
  contribuciones: number | null
  costoTotal: number | null
  avisos: string[]
}

const pct = (t: number): string => `${(t * 100).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 3 })} %`
const ventanaDe = (reglas: ReglasDelRecibo): string =>
  reglas.periodos.length ? `${reglas.periodos[0]} a ${reglas.periodos[reglas.periodos.length - 1]}` : 'sin recibos'

/** El `title` de una línea: la regla, su evidencia y su advertencia. */
export function fuenteDeLaRegla(regla: ReglaDeConcepto, reglas: ReglasDelRecibo): string {
  const m = regla.modelo
  const que = m.tipo === 'porcentaje'
    ? `${pct(m.tasa)} del ${m.base === 'remunerativo' ? 'remunerativo' : 'remunerativo + no remunerativo'}`
    : m.tipo === 'monto_fijo' ? `monto fijo de ${m.periodo}`
      : m.tipo === 'horas_faltantes' ? `${pct(m.tasa)} × $/h × (${m.jornada} − horas del recibo)`
        : 'su tasa, la de su último recibo'
  const ev = `reproduce ${regla.evidencia.aciertos} de ${regla.evidencia.recibos} recibos (${ventanaDe(reglas)})`
  return [que, ev, regla.dudosa ? `DUDOSA: ${regla.motivo}` : regla.motivo].filter(Boolean).join(' · ')
}

/** Jornada y horas del recibo: lo escrito, su último recibo si fue de jornada completa, o la regla. */
function horasDeLaPersona(reglas: ReglasDelRecibo, p: PersonaDelEstimado): { jornada: 'parcial' | 'completa'; total: number | null; aviso: string | null } {
  const completa = (h: number): boolean => reglas.jornada != null && h >= reglas.jornada
  if (p.horasRecibo != null) return { jornada: completa(p.horasRecibo) ? 'completa' : 'parcial', total: p.horasRecibo, aviso: null }
  const tope = periodoOrdenable(p.periodo)
  const ultimo = [...p.recibosPropios].filter((r) => { const o = periodoOrdenable(r.periodo); return o !== '' && o < tope })
    .sort((a, b) => (periodoOrdenable(a.periodo) < periodoOrdenable(b.periodo) ? 1 : -1))[0]
  if (ultimo && completa(horasDelRecibo(ultimo))) {
    return { jornada: 'completa', total: horasDelRecibo(ultimo), aviso: `jornada completa: las horas son las de su recibo ${ultimo.periodo}; dependen de los días hábiles` }
  }
  if (reglas.horas.parcial == null) return { jornada: 'parcial', total: null, aviso: 'sin regla de horas del recibo' }
  return { jornada: 'parcial', total: reglas.horas.parcial, aviso: reglas.horas.dudosa ? 'la regla de horas del recibo es dudosa' : null }
}

/** 0401, 0431, 0425 y 0426. */
function haberes(reglas: ReglasDelRecibo, jornada: 'parcial' | 'completa', normales: number, feriado: number, vh: number): LineaEstimada[] {
  const ev = `${reglas.recibos} recibos (${ventanaDe(reglas)})`
  const basico = r2(normales * vh)
  const out: LineaEstimada[] = [
    { codigo: '0401', descripcion: 'BASICO HS NORMALES', seccion: 'remunerativo', unidad: normales, base: vh, monto: basico, fuente: 'horas normales × $/h de categoría' },
  ]
  const a = reglas.asistencia
  if (a.tasa != null) {
    const monto = a.dudosa ? null : r2(a.tasa * basico)
    out.push({ codigo: '0425', descripcion: 'ASISTENCIA PERFECTA (ART. 52 CCT)', seccion: 'remunerativo', unidad: null, base: null, monto, fuente: `${pct(a.tasa)} del 0401 · reproduce ${a.evidencia.aciertos} de ${a.evidencia.recibos} recibos (${ventanaDe(reglas)})` })
    const aj = a.ajuste[jornada]
    if (aj.anula !== false) {
      out.push({
        codigo: '0426', descripcion: 'AJUSTE COD.0425 (INASIST. Y/O TARD.)', seccion: 'remunerativo', unidad: null, base: null,
        monto: aj.anula && monto != null ? -monto : null,
        fuente: `anula el 0425 en ${aj.conAjuste} de ${aj.recibos} recibos de jornada ${jornada} (${ventanaDe(reglas)})${aj.anula == null ? ' · DUDOSA' : ''}`,
      })
    }
  }
  if (feriado > 0) {
    out.push({ codigo: '0431', descripcion: 'HORAS FERIADO', seccion: 'remunerativo', unidad: feriado, base: vh, monto: r2(feriado * vh), fuente: `horas de feriado × $/h de categoría · ${ev}` })
  }
  return out
}

/** El importe de una regla para esta persona. `undefined`: no le corresponde (el 92 ter con jornada completa). */
function montoDeLaRegla(regla: ReglaDeConcepto, c: { remunerativo: number; vh: number; horas: number; persona: string | null }): number | null | undefined {
  const m = regla.modelo
  if (m.tipo === 'horas_faltantes' && c.horas >= m.jornada) return undefined
  if (regla.dudosa) return null
  // Sin no remunerativo estimado, las dos bases valen lo mismo.
  if (m.tipo === 'porcentaje') return r2(m.tasa * c.remunerativo)
  if (m.tipo === 'monto_fijo') return m.monto
  if (m.tipo === 'horas_faltantes') return r2(m.tasa * c.vh * (m.jornada - c.horas))
  const t = c.persona ? m.tasas[c.persona] : undefined
  return t == null ? null : r2(t * c.remunerativo)
}

const sumaONull = (ls: readonly LineaEstimada[]): number | null =>
  ls.some((l) => l.monto == null) ? null : r2(ls.reduce((a, l) => a + (l.monto ?? 0), 0))

/**
 * LOS DESCUENTOS SUYOS QUE NINGUNA REGLA FIRME CUBRE (un embargo judicial, una cuota). No son del recibo sino de la
 * persona, y un solo caso no hace regla: el estimado no los descuenta, pero lo dice. En el cotejo de Q2-08/2026 el
 * embargo explicaba los dos netos que más se alejaban del real.
 */
function descuentosSinRegla(reglas: ReglasDelRecibo, p: PersonaDelEstimado): string[] {
  const tope = periodoOrdenable(p.periodo)
  const ultimo = [...p.recibosPropios].filter((r) => { const o = periodoOrdenable(r.periodo); return o !== '' && o < tope })
    .sort((a, b) => (periodoOrdenable(a.periodo) < periodoOrdenable(b.periodo) ? 1 : -1))[0]
  if (!ultimo) return []
  const firmes = new Set(reglas.conceptos.filter((c) => !c.dudosa).map((c) => c.codigo))
  return ultimo.conceptos.filter((c) => c.seccion === 'descuento' && !firmes.has(c.codigo))
    .map((c) => `su recibo ${ultimo.periodo} tuvo ${c.codigo} ${c.descripcion} por $${c.monto.toLocaleString('es-AR', { minimumFractionDigits: 2 })}: el estimado no lo descuenta`)
}

/** EL RECIBO ESTIMADO de una persona para `p.periodo`. `null` sin $/h o sin horas del recibo. */
export function estimarRecibo(reglas: ReglasDelRecibo, p: PersonaDelEstimado): ReciboEstimado | null {
  const h = horasDeLaPersona(reglas, p)
  if (p.valorHora == null || h.total == null) return null
  const avisos = [...(h.aviso ? [h.aviso] : []), ...descuentosSinRegla(reglas, p)]
  const porDia = reglas.horas.feriadoPorDia[h.jornada]
  if (p.feriados == null) avisos.push('el calendario de feriados no tiene cargado este año: se estima sin feriados')
  else if (p.feriados > 0 && porDia == null) avisos.push('hay feriados en la quincena y ningún recibo de la ventana dice cuántas horas vale cada uno')
  const feriado = Math.min(h.total, (p.feriados ?? 0) * (porDia ?? 0))
  const lineas = haberes(reglas, h.jornada, r2(h.total - feriado), feriado, p.valorHora)
  const remunerativo = sumaONull(lineas)
  for (const regla of reglas.conceptos.filter((x) => x.aplica)) {
    const monto = remunerativo == null ? null : montoDeLaRegla(regla, { remunerativo, vh: p.valorHora, horas: h.total, persona: p.persona })
    if (monto === undefined) continue
    lineas.push({ codigo: regla.codigo, descripcion: regla.descripcion, seccion: regla.seccion, unidad: null, base: null, monto, fuente: fuenteDeLaRegla(regla, reglas) })
  }
  const descuentos = sumaONull(lineas.filter((l) => l.seccion === 'descuento'))
  const contribuciones = sumaONull(lineas.filter((l) => l.seccion === 'contribucion'))
  return {
    periodo: p.periodo, jornada: h.jornada, horasNormales: r2(h.total - feriado), horasFeriado: feriado, valorHora: p.valorHora,
    lineas, remunerativo, descuentos,
    neto: remunerativo == null || descuentos == null ? null : r2(remunerativo - descuentos),
    contribuciones, costoTotal: remunerativo == null || contribuciones == null ? null : r2(remunerativo + contribuciones),
    avisos,
  }
}

export interface FilaComparada {
  codigo: string
  descripcion: string
  seccion: SeccionDelConcepto
  /** «45 h × $6.348» del estimado o del real, para la columna unidad/base. */
  unidad: number | null
  base: number | null
  estimado: number | null
  real: number | null
  /** real − estimado. `null` si falta cualquiera de los dos. */
  diferencia: number | null
  fuente: string | null
}

const ORDEN_SECCION: Record<SeccionDelConcepto, number> = { remunerativo: 0, no_remunerativo: 1, descuento: 2, contribucion: 3 }

export interface TotalesDelRecibo { haberes: number; descuentos: number; neto: number; contribuciones: number | null; costoTotal: number | null }

/** Los totales del recibo REAL por sección, para que la pantalla no sume. Sin contribuciones (formato viejo): `null`. */
export function totalesDelReal(real: readonly ConceptoDeRecibo[] | null): TotalesDelRecibo | null {
  if (!real || real.length === 0) return null
  const suma = (s: SeccionDelConcepto): number => r2(real.filter((c) => c.seccion === s).reduce((a, c) => a + c.monto, 0))
  const haberes = r2(suma('remunerativo') + suma('no_remunerativo'))
  const descuentos = suma('descuento')
  const hayContrib = real.some((c) => c.seccion === 'contribucion')
  return {
    haberes, descuentos, neto: r2(haberes - descuentos),
    contribuciones: hayContrib ? suma('contribucion') : null,
    costoTotal: hayContrib ? r2(haberes + suma('contribucion')) : null,
  }
}

/**
 * REAL CONTRA ESTIMADO, concepto por concepto. Un código que sólo tiene uno de los dos lados aparece igual:
 * el concepto que el estimado no previó (una suma no remunerativa, un embargo) es justamente lo que hay que ver.
 */
export function compararConReal(est: ReciboEstimado | null, real: readonly ConceptoDeRecibo[] | null): FilaComparada[] {
  const filas = new Map<string, FilaComparada>()
  const fila = (c: { codigo: string; descripcion: string; seccion: SeccionDelConcepto; unidad: number | null; base: number | null }): FilaComparada => {
    const k = `${c.seccion}|${c.codigo}`
    const f = filas.get(k) ?? { codigo: c.codigo, descripcion: c.descripcion, seccion: c.seccion, unidad: c.unidad, base: c.base, estimado: null, real: null, diferencia: null, fuente: null }
    filas.set(k, f)
    return f
  }
  for (const l of est?.lineas ?? []) { const f = fila(l); f.estimado = l.monto == null ? null : r2((f.estimado ?? 0) + l.monto); f.fuente = l.fuente }
  for (const c of real ?? []) { const f = fila(c); f.real = r2((f.real ?? 0) + c.monto); if (c.unidad != null) { f.unidad = c.unidad; f.base = c.base } }
  return [...filas.values()]
    .map((f) => ({ ...f, diferencia: f.real == null || f.estimado == null ? null : r2(f.real - f.estimado) }))
    .sort((a, b) => ORDEN_SECCION[a.seccion] - ORDEN_SECCION[b.seccion] || a.codigo.localeCompare(b.codigo))
}
