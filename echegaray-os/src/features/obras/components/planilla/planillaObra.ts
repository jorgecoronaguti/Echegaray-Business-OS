// LA PLANILLA (04c · Trabajo · Planilla, diseño ERP Obras 23/09/2026) — lo que DECIDE, fuera del JSX.
//
// Tarea × día hábil, con la fracción de cada parte. Acá viven puras, con test al lado: qué diez días
// son «dos semanas hábiles» de esta obra, cómo se agrupan las tareas debajo de su historia con el
// costo y el peso de `obra_historia_peso`, qué dice cada celda según el toggle (Fracción · Cantidad ·
// Quién), el pie con las tareas con parte por día, y el CSV de «Exportar». La forma la pone
// `PlanillaGrilla.tsx`.

const DIA = 86_400_000
const aDate = (iso: string) => new Date(`${iso}T00:00:00Z`)
const isoDe = (d: Date) => d.toISOString().slice(0, 10)
const LETRA = ['D', 'L', 'M', 'X', 'J', 'V', 'S']

/** Un día que ESTA obra trabaja: en su semana laboral y fuera del calendario de no laborables. */
export function esHabil(iso: string, isodows: readonly number[], feriados: ReadonlySet<string>): boolean {
  const dow = aDate(iso).getUTCDay()
  const isodow = dow === 0 ? 7 : dow
  const semana = isodows.length ? isodows : [1, 2, 3, 4, 5]
  return semana.includes(isodow) && !feriados.has(iso)
}

/**
 * LOS DIEZ DÍAS DE LA VENTANA: dos semanas hábiles que TERMINAN en `hasta` (o el hábil anterior),
 * corridas `pagina` ventanas hacia atrás (‹) o adelante (›). Siempre diez columnas, aunque la obra
 * trabaje sábados: la grilla mide `repeat(10, 76px)`.
 */
export function ventanaHabil(
  hasta: string, pagina: number, isodows: readonly number[], feriados: ReadonlySet<string>, n = 10,
): string[] {
  const dias: string[] = []
  let d = aDate(hasta)
  // Correr páginas enteras: cada una son `n` hábiles.
  let saltar = Math.abs(pagina) * n
  const paso = pagina < 0 ? -1 : 1
  if (pagina !== 0) {
    while (saltar > 0) {
      d = new Date(d.getTime() + paso * DIA)
      if (esHabil(isoDe(d), isodows, feriados)) saltar--
    }
  }
  let guarda = 0
  while (dias.length < n && guarda < 400) {
    const iso = isoDe(d)
    if (esHabil(iso, isodows, feriados)) dias.unshift(iso)
    d = new Date(d.getTime() - DIA)
    guarda++
  }
  return dias
}

/** «L 24/08» — el encabezado de cada columna, mono. */
export function rotuloDia(iso: string): string {
  const d = aDate(iso)
  return `${LETRA[d.getUTCDay()]} ${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

/** «24/08 → 04/09» — el rango de la toolbar. */
export function rotuloRango(dias: readonly string[]): string {
  if (dias.length === 0) return 'sin días hábiles'
  const c = (iso: string) => rotuloDia(iso).slice(2)
  return `${c(dias[0])} → ${c(dias[dias.length - 1])}`
}

/** Dónde va el separador semanal (1 px `line`): antes de cada columna que cambia de semana ISO. */
export function abreSemana(dias: readonly string[], i: number): boolean {
  if (i === 0) return false
  const lunesDe = (iso: string) => {
    const d = aDate(iso)
    const dow = d.getUTCDay() === 0 ? 7 : d.getUTCDay()
    return isoDe(new Date(d.getTime() - (dow - 1) * DIA))
  }
  return lunesDe(dias[i]) !== lunesDe(dias[i - 1])
}

// ── LAS FILAS ─────────────────────────────────────────────────────────────────────────────────

export interface NodoWbs {
  actividad_id: string
  nombre: string
  nivel: number
  ruta_orden: number[]
  tiene_hijas: boolean
  archivada: boolean
  tipo: string
}

export interface ControlDeTarea {
  actividad_id: string
  unidad: string | null
  cantidad_objetivo: number | null
  cantidad_ejecutada: number | null
  avance_pct: number | null
  inicio_plan: string | null
  fin_plan: string | null
  estado_operativo: string
}

export interface PesoDeHistoria {
  actividad_id: string
  costo_mo: number | null
  peso: number | null
}

export interface TareaPlanilla {
  id: string
  numero: string
  nombre: string
  /** «m³ · 1.100» o «sin medición». */
  uniCant: string
  tienePlan: boolean
  terminada: boolean
  /** «87%» o «—». */
  pct: string
}

export interface GrupoPlanilla {
  id: string
  numero: string
  nombre: string
  /** «$ 1.250.000» o «sin costo». */
  costo: string
  /** «12%» o «sin peso». */
  peso: string
  tareas: TareaPlanilla[]
}

const pesos = (n: number) => `$ ${n.toLocaleString('es-AR', { maximumFractionDigits: 0 })}`
const cifra = (n: number) => n.toLocaleString('es-AR', { maximumFractionDigits: 2 })

/** La numeración «1 · 2 · 3» de los grupos y «1.1 · 1.2» de las tareas. Es de posición, para leer. */
const numeroDe = (ruta: number[], nivel: number) => ruta.filter((_, i) => i % 2 === 0).slice(0, nivel + 1).map((n) => n + 1).join('.')

const bajoDe = (padre: number[], hijo: number[]) =>
  hijo.length > padre.length && padre.every((v, i) => hijo[i] === v)

/**
 * GRUPOS = HISTORIAS (lo que pesa en `obra_historia_peso`), TAREAS = las hojas debajo de cada una.
 * Sin historias, los grupos son las raíces del árbol, con «sin costo» y «sin peso» — no se inventa
 * un peso repartido. Una hoja que no cuelga de ninguna historia va en «Sin historia».
 */
export function filasDePlanilla(
  wbs: readonly NodoWbs[], control: readonly ControlDeTarea[], historias: readonly PesoDeHistoria[],
): GrupoPlanilla[] {
  const vivos = [...wbs].filter((n) => !n.archivada).sort((a, b) => cmp(a.ruta_orden, b.ruta_orden))
  const ctl = new Map(control.map((c) => [c.actividad_id, c]))
  const pesoDe = new Map(historias.map((h) => [h.actividad_id, h]))
  const cabezas = historias.length
    ? vivos.filter((n) => pesoDe.has(n.actividad_id))
    : vivos.filter((n) => n.nivel === 0 && n.tiene_hijas)
  const hojas = vivos.filter((n) => !n.tiene_hijas && n.tipo !== 'resumen')

  const tarea = (n: NodoWbs, i: number, numGrupo: string): TareaPlanilla => {
    const c = ctl.get(n.actividad_id)
    const uniCant = c?.unidad && c.cantidad_objetivo != null ? `${c.unidad} · ${cifra(c.cantidad_objetivo)}` : 'sin medición'
    return {
      id: n.actividad_id,
      numero: `${numGrupo}.${i + 1}`,
      nombre: n.nombre,
      uniCant,
      tienePlan: Boolean(c?.inicio_plan && c?.fin_plan),
      terminada: c?.estado_operativo === 'hecha' || (c?.avance_pct ?? 0) >= 100,
      pct: c?.avance_pct == null ? '—' : `${Math.round(c.avance_pct)}%`,
    }
  }

  const grupos: GrupoPlanilla[] = []
  const tomadas = new Set<string>()
  cabezas.forEach((h, gi) => {
    const numero = String(gi + 1)
    const p = pesoDe.get(h.actividad_id)
    const propias = hojas.filter((n) => bajoDe(h.ruta_orden, n.ruta_orden))
    propias.forEach((n) => tomadas.add(n.actividad_id))
    grupos.push({
      id: h.actividad_id,
      numero,
      nombre: h.nombre,
      costo: p?.costo_mo != null ? pesos(p.costo_mo) : 'sin costo',
      peso: p?.peso != null ? `${Math.round(p.peso * 100)}%` : 'sin peso',
      tareas: propias.map((n, i) => tarea(n, i, numero)),
    })
  })
  const sueltas = hojas.filter((n) => !tomadas.has(n.actividad_id))
  if (sueltas.length) {
    const numero = String(grupos.length + 1)
    grupos.push({
      id: 'sin-historia', numero, nombre: 'Sin historia', costo: 'sin costo', peso: 'sin peso',
      tareas: sueltas.map((n, i) => tarea(n, i, numero)),
    })
  }
  return grupos
}

function cmp(a: number[], b: number[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? -1
    const y = b[i] ?? -1
    if (x !== y) return x - y
  }
  return 0
}

// ── LAS CELDAS ────────────────────────────────────────────────────────────────────────────────

export type ModoCelda = 'fraccion' | 'cantidad' | 'quien'

export interface CeldaPlanilla {
  actividad_id: string
  fecha: string
  fraccion: number | null
  cantidad: number | null
  personas: string[]
  activos: string[]
  n_partes: number
}

export const claveCelda = (actividadId: string, fecha: string) => `${actividadId}|${fecha}`

/** «0,2» — la fracción del día, hasta dos decimales, sin cero de más. «1» cuando se completó. */
export const textoFraccion = (f: number | null): string =>
  f == null ? '—' : f.toLocaleString('es-AR', { maximumFractionDigits: 2 })

/** «7/9» — cantidad hecha ese día sobre el objetivo del ítem; sin objetivo, la cantidad sola. */
export function textoCantidad(c: CeldaPlanilla, objetivo: number | null): string {
  if (c.cantidad == null) return textoFraccion(c.fraccion)
  return objetivo != null ? `${cifra(c.cantidad)}/${cifra(objetivo)}` : cifra(c.cantidad)
}

/** «RQ · JM» — las iniciales de quien estuvo; con activos, «+1». Nadie anotado: «—». */
export function textoQuien(c: CeldaPlanilla, nombreDe: (id: string) => string | undefined): string {
  const ini = c.personas.map((id) => nombreDe(id)).filter((n): n is string => Boolean(n))
    .map((n) => n.split(/\s+/).map((p) => p.charAt(0).toUpperCase()).slice(0, 2).join(''))
  const partes = [...ini]
  if (c.activos.length) partes.push(`+${c.activos.length}`)
  return partes.length ? partes.join(' · ') : '—'
}

export function textoCelda(
  c: CeldaPlanilla, modo: ModoCelda, objetivo: number | null, nombreDe: (id: string) => string | undefined,
): string {
  if (modo === 'cantidad') return textoCantidad(c, objetivo)
  if (modo === 'quien') return textoQuien(c, nombreDe)
  return textoFraccion(c.fraccion)
}

/** El pie: cuántas tareas tuvieron parte cada día. Sin ninguna, «—» y no «0». */
export function pieDeTareasConParte(celdas: readonly CeldaPlanilla[], dias: readonly string[]): string[] {
  return dias.map((d) => {
    const n = new Set(celdas.filter((c) => c.fecha === d && c.n_partes > 0).map((c) => c.actividad_id)).size
    return n === 0 ? '—' : String(n)
  })
}

/** «12 de 48 · ver el resto» — cuántas tareas se dibujan de las que hay. */
export function textoPie(mostradas: number, total: number): string {
  return mostradas >= total ? `${total} de ${total}` : `${mostradas} de ${total} · ver el resto`
}

/** Las primeras `tope` tareas, grupo por grupo, sin partir un grupo por la mitad más que el último. */
export function recortar(grupos: readonly GrupoPlanilla[], tope: number): GrupoPlanilla[] {
  const salida: GrupoPlanilla[] = []
  let quedan = tope
  for (const g of grupos) {
    if (quedan <= 0) break
    const tareas = g.tareas.slice(0, quedan)
    salida.push({ ...g, tareas })
    quedan -= tareas.length
  }
  return salida
}

export const totalTareas = (grupos: readonly GrupoPlanilla[]) => grupos.reduce((s, g) => s + g.tareas.length, 0)

/** El CSV de «Exportar»: una fila por tarea, una columna por día, con lo que dice el toggle activo. */
export function csvDePlanilla(
  grupos: readonly GrupoPlanilla[], dias: readonly string[], celdaDe: (actividadId: string, fecha: string) => string,
): string {
  const esc = (s: string) => `"${s.replace(/"/g, '""')}"`
  const filas = [['#', 'Grupo', 'Tarea', 'Uni · cant', '%', ...dias.map(rotuloDia)].map(esc).join(';')]
  for (const g of grupos) {
    for (const t of g.tareas) {
      filas.push([t.numero, g.nombre, t.nombre, t.uniCant, t.pct, ...dias.map((d) => celdaDe(t.id, d))].map(esc).join(';'))
    }
  }
  return `﻿${filas.join('\n')}`
}
