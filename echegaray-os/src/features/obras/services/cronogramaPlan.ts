// EL CRONOGRAMA COMO ESTÁ CARGADO — las filas de la pantalla 07 desde el plan guardado.
//
// ═══ POR QUÉ NO LO ARMA EL MOTOR DE CAMINO CRÍTICO ═══
//
// `cronogramaMotor.armarCronograma` calcula las fechas DESDE LA SECUENCIA. Con cero dependencias
// cargadas —el estado de TODAS las obras vivas— cada actividad arranca en el día 1 del origen y el
// Gantt dibuja veinte barras apiladas sobre la misma semana. Eso no es el plan de la obra: es lo que
// el plan sería si nada esperara a nada. La pantalla que el jefe abre todos los días tiene que
// dibujar `inicio_plan`/`fin_plan` tal como alguien los cargó.
//
// ═══ EL DESVÍO ES `forecast_fin − fin_plan`, LA MISMA DEFINICIÓN QUE LA CARTERA ═══
//
// `desvio_plan_dias` compara el fin PLANIFICADO contra el de la LÍNEA BASE, y el sellado copió el
// plan en las once obras vivas: da 0 en todas, incluida una vencida con 94 % de avance. Es un
// control validado contra la misma información que produce. `forecast_fin` es el ritmo MEDIDO
// contra la fecha comprometida, que es la pregunta que se hace quien abre el cronograma.
// Ver `carteraCanon.ts`, que resuelve lo mismo para la obra entera.
//
// SIN FORECAST NO HAY DESVÍO Y NO SE INVENTA UN CERO: `null`, y la columna escribe «sin forecast».
// «En fecha» es un hecho; no saberlo, otro.
//
// ═══ QUÉ NO SE PUBLICA ACÁ, Y POR QUÉ ═══
//
// El camino crítico y la holgura (el rayo del mockup 07 y dos de sus cinco cifras) NO se calculan:
// exigen precedencias declaradas y hoy hay CERO en la base. Marcar «crítica» a la actividad más
// larga sería inventar un camino crítico.

import { agruparActividades } from './cronograma.ts'
import { diasEntre } from './escalaCronograma.ts'
import type { Actividad } from '../types/index.ts'

/** Una fila del cronograma: un rubro (`nivel 0`) o una actividad (`nivel 1`). */
export interface FilaPlan {
  /** La identidad de la fila. Es también lo que selecciona un clic: un rubro no tiene `id` de
   *  actividad y con `actividadId` como clave las diez cabeceras se seleccionaban juntas. */
  clave: string
  nivel: 0 | 1
  nombre: string
  /** `null` en un rubro: un rubro no es una actividad. */
  actividadId: string | null
  /** El PLAN cargado. En un rubro, la envolvente de sus hijas — nunca las fechas guardadas en la
   *  fila de resumen, que están podridas («Encofrado» dice 100 % con una hija en 0). */
  inicio: string | null
  fin: string | null
  /** LA LÍNEA BASE, lo que se prometió al sellar. Sin sellar es `null` en las dos puntas y la capa
   *  no dibuja nada, en vez de dibujar el plan de hoy como si fuera lo prometido. */
  inicioBase: string | null
  finBase: string | null
  /** Cuándo termina al ritmo medido, tal como lo publica `actividad_fechas`. Es el DATO; que se
   *  dibuje o no —sólo se dibuja el tramo que se estira más allá del plan— es consecuencia. */
  finForecast: string | null
  /** `forecast_fin − fin_plan` en días corridos, con signo. `null` = falta una punta. */
  desvio: number | null
  avancePct: number | null
  esHito: boolean
  tieneImpedimento: boolean
  /** Ninguna de las dos fechas de plan. La fila existe y no se puede dibujar: se dice. */
  sinPlan: boolean
  nHijas: number
  /** Un fragüe, un curado: se dibuja punteado (diseño 05) y no pesa como trabajo. */
  esTiempoTecnico: boolean
}

const soloFecha = (f: string | null | undefined): string | null => (f ? f.slice(0, 10) : null)

/**
 * DÍAS DE DESVÍO PROYECTADO de una actividad. `null` cuando falta el fin de plan o el forecast.
 * Conserva el signo: terminar antes del plan es `-3`, y aplanarlo a 0 borraría el adelanto.
 */
export function desvioProyectado(finPlan: string | null, forecast: string | null): number | null {
  const a = soloFecha(finPlan)
  const b = soloFecha(forecast)
  if (!a || !b) return null
  return diasEntre(a, b)
}

function deActividad(a: Actividad): FilaPlan {
  const inicio = soloFecha(a.inicio_plan)
  const fin = soloFecha(a.fin_plan) ?? inicio
  const forecast = soloFecha(a.forecast_fin)
  return {
    clave: a.id,
    nivel: 1,
    nombre: a.nombre,
    actividadId: a.id,
    inicio,
    fin,
    inicioBase: soloFecha(a.inicio_base),
    finBase: soloFecha(a.fin_base),
    finForecast: forecast,
    desvio: desvioProyectado(a.fin_plan, a.forecast_fin),
    avancePct: a.avance_pct == null ? null : Number(a.avance_pct),
    esHito: a.tipo === 'hito',
    tieneImpedimento: (a.impedimentos_abiertos ?? 0) > 0,
    sinPlan: !inicio && !fin,
    nHijas: 0,
    esTiempoTecnico: Boolean(a.tiempo_tecnico),
  }
}

const menor = (xs: (string | null)[]): string | null =>
  xs.filter((x): x is string => Boolean(x)).sort()[0] ?? null
const mayor = (xs: (string | null)[]): string | null =>
  xs.filter((x): x is string => Boolean(x)).sort().at(-1) ?? null

/** La cabecera de un rubro, DERIVADA de sus hijas. El desvío es el PEOR de ellas y no el promedio:
 *  un rubro donde una actividad atrasa quince días atrasa quince días; promediarlo diría «+4». */
function deRubro(clave: string, nombre: string, hijas: FilaPlan[]): FilaPlan {
  const desvios = hijas.map((h) => h.desvio).filter((x): x is number => x != null)
  const conAvance = hijas.filter((h) => h.avancePct != null)
  const fin = mayor(hijas.map((h) => h.fin))
  return {
    clave: `rubro:${clave}`,
    nivel: 0,
    nombre,
    actividadId: null,
    inicio: menor(hijas.map((h) => h.inicio)),
    fin,
    inicioBase: menor(hijas.map((h) => h.inicioBase)),
    finBase: mayor(hijas.map((h) => h.finBase)),
    finForecast: mayor(hijas.map((h) => h.finForecast)),
    desvio: desvios.length ? Math.max(...desvios) : null,
    avancePct: conAvance.length
      ? Math.round(conAvance.reduce((s, h) => s + (h.avancePct ?? 0), 0) / conAvance.length)
      : null,
    esHito: false,
    tieneImpedimento: hijas.some((h) => h.tieneImpedimento),
    sinPlan: hijas.every((h) => h.sinPlan),
    nHijas: hijas.length,
    esTiempoTecnico: false,
  }
}

/**
 * LAS FILAS DEL CRONOGRAMA, en el orden del tracker: cada rubro y debajo sus actividades.
 *
 * Agrupa con `agruparActividades` —la MISMA regla que el árbol de Tareas y el Gantt global—: si acá
 * se agrupara distinto, la misma obra tendría rubros distintos según desde qué pantalla se la mire.
 */
export function filasDelPlan(actividades: readonly Actividad[], { soloTareas = false }: { soloTareas?: boolean } = {}): FilaPlan[] {
  const salida: FilaPlan[] = []
  for (const g of agruparActividades(actividades as Actividad[])) {
    // EL 05 Y EL M07 DIBUJAN DOS NIVELES: el rubro (con su línea envolvente) y las actividades que se
    // miden. La épica y la historia son contenedores (`resumen`) sin fechas propias: como fila decían
    // «sin fechas» con todas sus tareas fechadas debajo (dueño 25/09). El editor (C06) sí las lista.
    const hijas = (soloTareas ? g.hijas.filter((a) => a.tipo !== 'resumen') : g.hijas).map(deActividad)
    // Un grupo que sólo es un contenedor (una épica o historia sin tareas propias en él) no es un rubro del 05.
    if (soloTareas && hijas.length === 0) continue
    salida.push(deRubro(g.clave, g.nombre, hijas))
    salida.push(...hijas)
  }
  return salida
}

/**
 * LA VENTANA QUE TIENE QUE ABARCAR EL LIENZO: plan, línea base y proyección.
 *
 * Las tres, no sólo el plan. Una actividad que se adelantó dibujaría su base fuera del lienzo —o
 * sea, no la dibujaría— y el desvío que la pantalla existe para mostrar sería justo el que no se ve.
 */
export function pares(filas: readonly FilaPlan[]): { inicio: string | null; fin: string | null }[] {
  return filas.flatMap((f) => [
    { inicio: f.inicio, fin: f.fin },
    { inicio: f.inicioBase, fin: f.finBase },
    { inicio: f.fin, fin: f.finForecast },
  ])
}

/** Lo que el pie de la pantalla necesita saber del cronograma entero. */
export interface ResumenDelCronograma {
  /** El último fin de línea base sellada. `null` = nadie selló. */
  finBase: string | null
  finPlan: string | null
  finForecast: string | null
  /** Días entre el fin de plan y el fin proyectado. `null` si falta una de las dos puntas. */
  desvioDelFin: number | null
  /** Actividades con desvío proyectado positivo, y cuántas se pudieron medir. */
  atrasadas: number
  medidas: number
  /** Actividades (no rubros) sin ninguna fecha de plan. Cambian lo que significa todo el resto. */
  sinPlan: number
  actividades: number
}

/** El resumen del cronograma. Sólo cuenta filas de ACTIVIDAD: contar los rubros sumaría cada
 *  atraso una vez más por cada rubro que lo hereda. */
export function resumenDelCronograma(filas: readonly FilaPlan[]): ResumenDelCronograma {
  const actos = filas.filter((f) => f.nivel !== 0)
  const finPlan = mayor(actos.map((f) => f.fin))
  const finForecast = mayor(actos.map((f) => f.finForecast))
  const conDesvio = actos.filter((f) => f.desvio != null)
  return {
    finBase: mayor(actos.map((f) => f.finBase)),
    finPlan,
    finForecast,
    desvioDelFin: desvioProyectado(finPlan, finForecast),
    atrasadas: conDesvio.filter((f) => (f.desvio ?? 0) > 0).length,
    medidas: conDesvio.length,
    sinPlan: actos.filter((f) => f.sinPlan).length,
    actividades: actos.length,
  }
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// DISEÑO ERP OBRAS · 05 / M07 (ver) y C06 / MC7 (editar) — dueño, 23/09/2026.
//
// Un solo cronograma. Lo que sigue decide: qué tono lleva cada barra (clara = plan, llena =
// ejecutado, roja = atrasada, punteada = tiempo técnico), cómo se corta la cabecera por Semana ·
// Mes · Trimestre, qué días hábiles son las columnas del modo editar, cómo se mueve un extremo en
// días hábiles, y por qué «Sellar» está apagado. La forma la pone `TabCronograma.tsx`.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

export type TonoBarra = 'plan' | 'ejecutado' | 'atrasada' | 'tecnico'

/**
 * ATRASADA = el plan ya venció y no está terminada, o la proyección se pasa del plan. No es un
 * color elegido: sale de las fechas y del avance. Un tiempo técnico nunca está «atrasado»: no se
 * ejecuta, se espera.
 */
export function tonoDeFila(f: FilaPlan, hoy: string): TonoBarra {
  if (f.esTiempoTecnico) return 'tecnico'
  const pct = f.avancePct ?? 0
  if (pct >= 100) return 'ejecutado'
  if ((f.fin != null && f.fin < hoy) || (f.desvio != null && f.desvio > 0)) return 'atrasada'
  return pct > 0 ? 'ejecutado' : 'plan'
}

/** La parte llena de la barra: el avance sobre el plan, 0..1. Sin avance, nada lleno. */
export const fraccionLlena = (f: FilaPlan): number => Math.max(0, Math.min(1, (f.avancePct ?? 0) / 100))

export type EscalaVista = 'semana' | 'mes' | 'trimestre'
export const ESCALAS_VISTA: EscalaVista[] = ['semana', 'mes', 'trimestre']
export const ESCALA_LABEL: Record<EscalaVista, string> = { semana: 'Semana', mes: 'Mes', trimestre: 'Trimestre' }

const DIA = 86_400_000
const aDate = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00Z`)
const isoDe = (d: Date) => d.toISOString().slice(0, 10)
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

function lunesDe(iso: string): string {
  const d = aDate(iso)
  const dow = d.getUTCDay() === 0 ? 7 : d.getUTCDay()
  return isoDe(new Date(d.getTime() - (dow - 1) * DIA))
}
function primeroDeMes(iso: string): string { return `${iso.slice(0, 7)}-01` }
function primeroDeTrimestre(iso: string): string {
  const d = aDate(iso)
  const m = Math.floor(d.getUTCMonth() / 3) * 3
  return isoDe(new Date(Date.UTC(d.getUTCFullYear(), m, 1)))
}
function siguiente(iso: string, escala: EscalaVista): string {
  const d = aDate(iso)
  if (escala === 'semana') return isoDe(new Date(d.getTime() + 7 * DIA))
  const meses = escala === 'mes' ? 1 : 3
  return isoDe(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + meses, 1)))
}

export interface ColumnaVista {
  iso: string
  /** «17 ago» (semana) · «ago» (mes) · «jul–sep» (trimestre). */
  rotulo: string
  /** La columna que contiene hoy va en tinta y 500 (diseño 05). */
  esHoy: boolean
}

export interface VentanaVista {
  desde: string
  /** Exclusivo: el primer día que ya no entra. */
  hasta: string
  columnas: ColumnaVista[]
  /** Días corridos de la ventana: el denominador de las barras. */
  dias: number
}

/** «17 ago». Los meses en minúscula y sin punto, como el diseño. */
export function rotuloColumna(iso: string, escala: EscalaVista): string {
  const d = aDate(iso)
  if (escala === 'semana') return `${d.getUTCDate()} ${MESES[d.getUTCMonth()]}`
  if (escala === 'mes') return MESES[d.getUTCMonth()]
  return `${MESES[d.getUTCMonth()]}–${MESES[(d.getUTCMonth() + 2) % 12]}`
}

/**
 * LA VENTANA DEL CRONOGRAMA: del período que contiene la primera fecha al que contiene la última,
 * en columnas iguales. Con menos de tres períodos se rellena hacia adelante: una obra de una semana
 * no se dibuja a todo el ancho como si durara ocho.
 */
export function ventanaVista(pares: readonly { inicio: string | null; fin: string | null }[], escala: EscalaVista, hoy: string): VentanaVista | null {
  const fechas = pares.flatMap((p) => [p.inicio, p.fin]).filter((x): x is string => Boolean(x)).map((x) => x.slice(0, 10)).sort()
  if (!fechas.length) return null
  const arranque = escala === 'semana' ? lunesDe : escala === 'mes' ? primeroDeMes : primeroDeTrimestre
  const desde = arranque(fechas[0])
  const tope = fechas[fechas.length - 1]
  const columnas: ColumnaVista[] = []
  let c = desde
  while (c <= tope || columnas.length < 3) {
    const sig = siguiente(c, escala)
    columnas.push({ iso: c, rotulo: rotuloColumna(c, escala), esHoy: hoy >= c && hoy < sig })
    c = sig
    if (columnas.length > 400) break
  }
  return { desde, hasta: c, columnas, dias: Math.round((aDate(c).getTime() - aDate(desde).getTime()) / DIA) }
}

/** Dónde cae un día dentro de la ventana, en % del ancho. `null` fuera de ella. */
export function posPct(v: VentanaVista, iso: string): number | null {
  const d = Math.round((aDate(iso).getTime() - aDate(v.desde).getTime()) / DIA)
  if (d < 0 || d > v.dias) return null
  return (d / v.dias) * 100
}

export interface TramoVista { izqPct: number; anchoPct: number }

/** La barra de una fila: desde el inicio hasta el fin inclusive, recortada a la ventana. */
export function tramoVista(v: VentanaVista, inicio: string | null, fin: string | null): TramoVista | null {
  if (!inicio) return null
  const i = Math.max(0, Math.round((aDate(inicio).getTime() - aDate(v.desde).getTime()) / DIA))
  const f = Math.min(v.dias, Math.round((aDate(fin ?? inicio).getTime() - aDate(v.desde).getTime()) / DIA) + 1)
  if (f <= i) return null
  return { izqPct: (i / v.dias) * 100, anchoPct: ((f - i) / v.dias) * 100 }
}

// ── EL MODO EDITAR (C06 / MC7): columnas de días hábiles ─────────────────────────────────────

export function esDiaHabil(iso: string, isodows: readonly number[], feriados: ReadonlySet<string>): boolean {
  const d = aDate(iso)
  const isodow = d.getUTCDay() === 0 ? 7 : d.getUTCDay()
  const semana = isodows.length ? isodows : [1, 2, 3, 4, 5]
  return semana.includes(isodow) && !feriados.has(iso)
}

/**
 * LAS COLUMNAS DEL EDITOR: los días hábiles desde el lunes de la primera fecha (o de hoy, sin
 * fechas) hasta cubrir la última, con un mínimo de 21 — tres semanas, como el diseño.
 */
export function diasHabilesDelEditor(
  pares: readonly { inicio: string | null; fin: string | null }[], hoy: string,
  isodows: readonly number[], feriados: ReadonlySet<string>, minimo = 21,
): string[] {
  const fechas = pares.flatMap((p) => [p.inicio, p.fin]).filter((x): x is string => Boolean(x)).map((x) => x.slice(0, 10)).sort()
  const desde = lunesDe(fechas[0] ?? hoy)
  const tope = fechas[fechas.length - 1] ?? hoy
  const dias: string[] = []
  let d = aDate(desde)
  let guarda = 0
  while ((dias.length < minimo || isoDe(d) <= tope) && guarda < 800) {
    const iso = isoDe(d)
    if (esDiaHabil(iso, isodows, feriados)) dias.push(iso)
    d = new Date(d.getTime() + DIA)
    guarda++
  }
  return dias
}

/** «Sem 24/08» — la banda de arriba del editor, una por lunes. */
export function semanasDe(dias: readonly string[]): { rotulo: string; desdeIdx: number; n: number }[] {
  const salida: { rotulo: string; desdeIdx: number; n: number }[] = []
  let lunes = ''
  dias.forEach((iso, i) => {
    const l = lunesDe(iso)
    if (l !== lunes) {
      lunes = l
      const d = aDate(l)
      salida.push({ rotulo: `Sem ${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`, desdeIdx: i, n: 0 })
    }
    salida[salida.length - 1].n++
  })
  return salida
}

/** El índice de columna de una fecha; una fecha no hábil cae en el hábil siguiente (o anterior si es el fin). */
export function indiceDe(dias: readonly string[], iso: string, extremo: 'inicio' | 'fin'): number | null {
  const exacto = dias.indexOf(iso)
  if (exacto >= 0) return exacto
  if (iso < dias[0] || iso > dias[dias.length - 1]) return null
  if (extremo === 'inicio') return dias.findIndex((d) => d > iso)
  let i = dias.length - 1
  while (i > 0 && dias[i] > iso) i--
  return i
}

/** Cuántos días hábiles hay de inicio a fin, inclusive. Sin fechas, `null`. */
export function diasHabilesEntre(dias: readonly string[], inicio: string | null, fin: string | null): number | null {
  if (!inicio || !fin) return null
  const i = indiceDe(dias, inicio, 'inicio')
  const f = indiceDe(dias, fin, 'fin')
  if (i == null || f == null) return null
  return Math.max(1, f - i + 1)
}

/** «5 días hábiles» · «1 día · curado 7 días técnicos» (MC7). Sin fechas: «sin fechas». */
export function bajadaDuracion(f: FilaPlan, dias: readonly string[]): string {
  const n = diasHabilesEntre(dias, f.inicio, f.fin)
  if (n == null) return 'sin fechas'
  const base = n === 1 ? '1 día' : `${n} días`
  if (f.esTiempoTecnico) return `${base} técnicos`
  const subs = f.nHijas > 0 ? ` · ${f.nHijas} subtareas` : ''
  return subs ? `${base}${subs}` : `${base} hábiles`
}

export interface FechasEditadas { inicio: string | null; fin: string | null }

/**
 * MOVER UN EXTREMO `delta` columnas (días hábiles). Arrastrar el inicio más allá del fin lo empuja;
 * lo mismo al revés. Una fila sin fechas arranca donde se la suelta con un día de duración.
 */
export function moverExtremo(
  dias: readonly string[], actual: FechasEditadas, extremo: 'inicio' | 'fin' | 'barra', delta: number,
): FechasEditadas {
  if (delta === 0) return actual
  const tope = dias.length - 1
  const clamp = (i: number) => Math.max(0, Math.min(tope, i))
  const i0 = actual.inicio ? (indiceDe(dias, actual.inicio, 'inicio') ?? 0) : null
  const f0 = actual.fin ? (indiceDe(dias, actual.fin, 'fin') ?? i0 ?? 0) : i0
  if (i0 == null || f0 == null) {
    const i = clamp(delta)
    return { inicio: dias[i], fin: dias[i] }
  }
  if (extremo === 'barra') {
    const largo = f0 - i0
    const i = clamp(Math.min(i0 + delta, tope - largo))
    return { inicio: dias[i], fin: dias[i + largo] }
  }
  if (extremo === 'inicio') {
    const i = clamp(i0 + delta)
    return { inicio: dias[i], fin: dias[Math.max(i, f0)] }
  }
  const f = clamp(f0 + delta)
  return { inicio: dias[Math.min(i0, f)], fin: dias[f] }
}

/** «Sellar está apagado: 3 ítems sin fechas.» — `null` cuando el checklist no traba. */
export function motivoSellarApagado(filas: readonly FilaPlan[]): string | null {
  const sin = filas.filter((f) => f.nivel !== 0 && !f.esTiempoTecnico && f.sinPlan).length
  if (sin === 0) return null
  return `Sellar está apagado: ${sin} ${sin === 1 ? 'ítem' : 'ítems'} sin fechas.`
}

/** «Con fechas 14 de 17». */
export function conFechas(filas: readonly FilaPlan[]): { con: number; total: number } {
  const actos = filas.filter((f) => f.nivel !== 0)
  return { con: actos.filter((f) => !f.sinPlan).length, total: actos.length }
}

/** «4 de 42 actividades con precedencia cargada. El resto solo tiene fechas.» (05). */
export function textoPrecedencia(filas: readonly FilaPlan[], dependencias: readonly { origen_id: string; destino_id: string }[]): string {
  const actos = filas.filter((f) => f.nivel !== 0)
  const con = new Set(dependencias.flatMap((d) => [d.origen_id, d.destino_id]))
  const n = actos.filter((f) => f.actividadId && con.has(f.actividadId)).length
  return `${n} de ${actos.length} actividades con precedencia cargada. El resto solo tiene fechas.`
}

/** Sólo lo que cambió viaja a la base: `inicio_<id>` y `fin_<id>` de las filas editadas. */
export function cambiosDeFechas(
  filas: readonly FilaPlan[], editadas: Readonly<Record<string, FechasEditadas>>,
): { actividadId: string; inicio: string | null; fin: string | null }[] {
  const salida: { actividadId: string; inicio: string | null; fin: string | null }[] = []
  for (const f of filas) {
    if (!f.actividadId) continue
    const e = editadas[f.actividadId]
    if (!e) continue
    if (e.inicio === f.inicio && e.fin === f.fin) continue
    salida.push({ actividadId: f.actividadId, inicio: e.inicio, fin: e.fin })
  }
  return salida
}

/** El «sep · oct» de la M07: los meses que cubre la ventana, en mono. */
export function mesesDeVentana(v: VentanaVista): string {
  const vistos: string[] = []
  for (const c of v.columnas) {
    const m = MESES[aDate(c.iso).getUTCMonth()]
    if (!vistos.includes(m)) vistos.push(m)
  }
  return vistos.join(' · ')
}
