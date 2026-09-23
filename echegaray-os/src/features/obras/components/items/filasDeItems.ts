// LAS FILAS DE LA TABLA DE ÍTEMS (04b · M05) — la lógica, sin JSX.
//
// Rubro › Épica › Historia › Tarea › Subtarea. Cada historia pesa por su costo de MO
// (`obra_historia_peso`); sus tareas, parejas. El ESTADO de cada ítem se DERIVA de los partes
// (`actividad_partes_resumen`): sin parte → «sin registrar»; Σ partes < 100 % → en progreso;
// = 100 % → completado. Nunca se elige.
//
// Módulo puro (sin `@/`): lo prueba `node --test` al lado.

import type { NodoObra } from '../../services/wbs.ts'
import type { HistoriaPeso, ResumenDePartes } from '../../services/obrasService.ts'
import { METODO_CORTO } from '../../types/index.ts'

export type NivelItem = 'rubro' | 'epica' | 'historia' | 'tarea' | 'subtarea'
export type VerHasta = 'historia' | 'tarea' | 'subtarea'
export type Agrupar = 'rubro' | 'responsable' | 'estado'
export type EstadoItem = 'sin_parte' | 'en_progreso' | 'completado'

export const VER_HASTA: readonly { id: VerHasta; label: string }[] = [
  { id: 'historia', label: 'Historia' }, { id: 'tarea', label: 'Tarea' }, { id: 'subtarea', label: 'Subtarea' },
]
export const AGRUPAR: readonly { id: Agrupar; label: string }[] = [
  { id: 'rubro', label: 'Rubro' }, { id: 'responsable', label: 'Responsable' }, { id: 'estado', label: 'Estado' },
]
export const ESTADO_ITEM_LABEL: Record<EstadoItem, string> = {
  sin_parte: 'Sin parte', en_progreso: 'En progreso', completado: 'Completado',
}

export interface FilaItem {
  id: string
  nivel: NivelItem
  /** 0 rubro · 1 épica · 2 historia · 3 tarea · 4 subtarea. Es la sangría. */
  profundidad: number
  codigo: string
  nombre: string
  esContenedor: boolean
  /** «un · 4» · null = sin cargar. */
  uniCant: string | null
  /** El peso del ítem sobre la obra, 0–1. null = no pesa. */
  peso: number | null
  /** Sólo la historia: su costo de MO. */
  costoMo: number | null
  /** Historia sin costo: «sin costo de MO · no pesa». */
  sinCosto: boolean
  plan: string | null
  diasReales: number | null
  diasTeoricos: number | null
  /** real > teórico y no completado. */
  diasWarn: boolean
  /** 0–100 · null = sin registrar. */
  pctItem: number | null
  estado: EstadoItem
  /** peso × pctItem, en % de la obra. */
  avanceObra: number | null
  parteHoy: boolean
  bloqueada: boolean
  tiempoTecnico: boolean
  responsable: string | null
  /** Las subtareas plegadas debajo de la tarea (cuando no se ven como filas). */
  subtareas: string[]
  /** Para el teléfono (M05): «Cantidad · 890/1.100 m³» · «sin método de medición». */
  medicion: { texto: string; tono: 'ink' | 'warn' }
  puedeMedir: boolean
}

const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`
const num = (n: number, dec = 2) => n.toLocaleString('es-AR', { maximumFractionDigits: dec })

/** Días hábiles lunes–viernes entre dos fechas ISO, ambas incluidas. */
export function diasHabilesEntre(desde: string, hasta: string): number {
  let d = new Date(`${desde.slice(0, 10)}T00:00:00Z`)
  const fin = new Date(`${hasta.slice(0, 10)}T00:00:00Z`)
  let n = 0
  while (d <= fin) {
    const dow = d.getUTCDay()
    if (dow !== 0 && dow !== 6) n++
    d = new Date(d.getTime() + 86_400_000)
  }
  return n
}

/** «08/09–12/09» · «15/09» · null. */
export function textoPlan(inicio: string | null, fin: string | null): string | null {
  if (inicio && fin) return inicio.slice(0, 10) === fin.slice(0, 10) ? ddmm(inicio) : `${ddmm(inicio)}–${ddmm(fin)}`
  if (inicio) return `desde ${ddmm(inicio)}`
  if (fin) return `hasta ${ddmm(fin)}`
  return null
}

/** El estado derivado de la fracción acumulada de los partes. */
export function estadoDerivado(r: ResumenDePartes | undefined): { estado: EstadoItem; pct: number | null } {
  if (!r) return { estado: 'sin_parte', pct: null }
  const pct = Math.min(100, Math.max(0, r.fraccion_acumulada * 100))
  return { estado: pct >= 100 ? 'completado' : 'en_progreso', pct }
}

function nivelDe(n: NodoObra, padre: NodoObra | undefined, esHistoria: boolean): NivelItem {
  if (padre && !padre.es_contenedor) return 'subtarea'
  if (esHistoria) return 'historia'
  if (n.es_contenedor) return n.nivel === 0 ? 'rubro' : n.nivel === 1 ? 'epica' : 'historia'
  return 'tarea'
}

const PROFUNDIDAD: Record<NivelItem, number> = { rubro: 0, epica: 1, historia: 2, tarea: 3, subtarea: 4 }

/**
 * Todas las filas del árbol, en orden constructivo, con el peso, el estado y el avance calculados.
 * `verHasta` decide hasta qué nivel se ven como filas; las subtareas plegadas viajan en `subtareas`.
 */
export function filasDeItems(
  nodos: readonly NodoObra[], historias: readonly HistoriaPeso[], partes: readonly ResumenDePartes[],
  verHasta: VerHasta = 'tarea',
): FilaItem[] {
  const porId = new Map(nodos.map((n) => [n.id, n]))
  const historiaDe = new Map(historias.map((h) => [h.actividad_id, h]))
  const parteDe = new Map(partes.map((p) => [p.actividad_id, p]))
  const hijos = new Map<string | null, NodoObra[]>()
  for (const n of nodos) {
    const lista = hijos.get(n.padre_id) ?? []
    lista.push(n)
    hijos.set(n.padre_id, lista)
  }
  const nivel = new Map<string, NivelItem>()
  for (const n of nodos) nivel.set(n.id, nivelDe(n, n.padre_id ? porId.get(n.padre_id) : undefined, historiaDe.has(n.id)))

  // El peso de cada tarea: el de su historia repartido parejo entre las tareas que cuelgan de ella.
  const historiaAncestro = (n: NodoObra): NodoObra | null => {
    let p = n.padre_id ? porId.get(n.padre_id) : undefined
    while (p) {
      if (nivel.get(p.id) === 'historia') return p
      p = p.padre_id ? porId.get(p.padre_id) : undefined
    }
    return null
  }
  const tareasDeHistoria = new Map<string, number>()
  for (const n of nodos) {
    if (nivel.get(n.id) !== 'tarea') continue
    const h = historiaAncestro(n)
    if (h) tareasDeHistoria.set(h.id, (tareasDeHistoria.get(h.id) ?? 0) + 1)
  }
  const pesoDe = (n: NodoObra): number | null => {
    const niv = nivel.get(n.id)
    if (niv === 'historia') return historiaDe.get(n.id)?.peso ?? null
    if (niv === 'tarea') {
      const h = historiaAncestro(n)
      const ph = h ? historiaDe.get(h.id)?.peso ?? null : null
      const nT = h ? tareasDeHistoria.get(h.id) ?? 0 : 0
      return ph != null && nT > 0 ? ph / nT : null
    }
    return null
  }

  // Codificación 1 · 1.1 · 1.1.1 por posición entre hermanos.
  const codigo = new Map<string, string>()
  const codificar = (padre: string | null, prefijo: string) => {
    ;(hijos.get(padre) ?? []).forEach((h, i) => {
      const c = prefijo ? `${prefijo}.${i + 1}` : String(i + 1)
      codigo.set(h.id, c)
      codificar(h.id, c)
    })
  }
  codificar(null, '')

  // Estado y avance de hojas; los contenedores agregan hacia arriba.
  const filaDe = new Map<string, FilaItem>()
  const armar = (n: NodoObra): FilaItem => {
    const niv = nivel.get(n.id) ?? 'tarea'
    const hijas = hijos.get(n.id) ?? []
    const propio = estadoDerivado(parteDe.get(n.id))
    const r = parteDe.get(n.id)
    const peso = pesoDe(n)
    const hist = historiaDe.get(n.id)
    const filasHijas = hijas.map(armar)
    const subtareas = filasHijas.filter((f) => f.nivel === 'subtarea')

    let pctItem: number | null = propio.pct
    let estado: EstadoItem = propio.estado
    let avanceObra: number | null = null
    if (niv === 'tarea' || niv === 'subtarea') {
      if (pctItem == null && subtareas.length > 0) {
        const con = subtareas.filter((s) => s.pctItem != null)
        if (con.length > 0) {
          pctItem = subtareas.reduce((s, x) => s + (x.pctItem ?? 0), 0) / subtareas.length
          estado = pctItem >= 100 ? 'completado' : 'en_progreso'
        }
      }
      avanceObra = peso != null && pctItem != null ? peso * pctItem : null
    } else {
      // Historia, épica, rubro: el avance de obra es la suma de lo que cuelga; el % ítem, la
      // parte medida sobre el peso que cuelga.
      const sumaAvance = filasHijas.reduce((s, x) => s + (x.avanceObra ?? 0), 0)
      const sumaPeso = filasHijas.reduce((s, x) => s + (niv === 'historia' ? (x.nivel === 'tarea' ? x.peso ?? 0 : 0) : x.peso ?? 0), 0)
      const hayMedido = filasHijas.some((x) => x.pctItem != null)
      avanceObra = hayMedido ? sumaAvance : null
      if (niv === 'historia') {
        const tareas = filasHijas.filter((x) => x.nivel === 'tarea')
        const medidas = tareas.filter((x) => x.pctItem != null)
        pctItem = medidas.length > 0 ? tareas.reduce((s, x) => s + (x.pctItem ?? 0), 0) / tareas.length : null
      } else {
        pctItem = hayMedido && sumaPeso > 0 ? sumaAvance / sumaPeso : null
      }
      estado = pctItem == null ? 'sin_parte' : pctItem >= 100 ? 'completado' : 'en_progreso'
    }

    const diasTeoricos = n.dias_plan ?? (n.inicio_plan && n.fin_plan ? diasHabilesEntre(n.inicio_plan, n.fin_plan) : null)
    const diasReales = r?.dias_reales ?? null
    const metodo = n.metodo_avance
    const detalle = metodo === 'cantidad' && n.cantidad_objetivo != null
      ? ` · ${num(n.cantidad_ejecutada ?? 0)}/${num(n.cantidad_objetivo)}${n.unidad ? ` ${n.unidad}` : ''}`
      : ''
    const fila: FilaItem = {
      id: n.id,
      nivel: niv,
      profundidad: PROFUNDIDAD[niv],
      codigo: codigo.get(n.id) ?? '',
      nombre: n.nombre,
      esContenedor: n.es_contenedor,
      uniCant: n.unidad && n.cantidad_objetivo != null ? `${n.unidad} · ${num(n.cantidad_objetivo)}` : null,
      peso: niv === 'historia' ? hist?.peso ?? null : peso,
      costoMo: hist?.costo_mo ?? null,
      sinCosto: niv === 'historia' && (hist ? hist.sin_costo : true),
      plan: textoPlan(n.inicio_plan, n.fin_plan),
      diasReales,
      diasTeoricos,
      diasWarn: diasReales != null && diasTeoricos != null && diasReales > diasTeoricos && estado !== 'completado',
      pctItem,
      estado,
      avanceObra,
      parteHoy: r?.parte_hoy ?? false,
      bloqueada: n.impedimentos_abiertos > 0,
      tiempoTecnico: n.tiempo_tecnico,
      responsable: n.responsable,
      subtareas: subtareas.map((s) => s.nombre),
      medicion: !metodo
        ? { texto: 'sin método de medición', tono: 'warn' }
        : { texto: `${METODO_CORTO[metodo]}${detalle}`, tono: metodo === 'manual' ? 'warn' : 'ink' },
      puedeMedir: Boolean(metodo),
    }
    filaDe.set(n.id, fila)
    return fila
  }
  for (const raiz of hijos.get(null) ?? []) armar(raiz)

  // El orden constructivo del árbol, filtrado por `verHasta`.
  const tope = PROFUNDIDAD[verHasta]
  const salida: FilaItem[] = []
  for (const n of nodos) {
    const f = filaDe.get(n.id)
    if (!f) continue
    if (f.profundidad > tope) continue
    if (verHasta === 'subtarea') salida.push({ ...f, subtareas: [] })
    else salida.push(f)
  }
  return salida
}

/** Cuántos ítems medibles hay (tareas y subtareas): el «N ítems» del pie. */
export function contarItems(filas: readonly FilaItem[]): number {
  return filas.reduce((s, f) => s + (f.nivel === 'tarea' ? 1 + f.subtareas.length : f.nivel === 'subtarea' ? 1 : 0), 0)
}

/** Las filas que coinciden con el texto, con sus ancestros para que el árbol no pierda el hilo. */
export function filtrarPorTexto(filas: readonly FilaItem[], query: string): FilaItem[] {
  const q = query.trim().toLowerCase()
  if (!q) return [...filas]
  const salida: FilaItem[] = []
  const pila: FilaItem[] = []
  for (const f of filas) {
    while (pila.length > 0 && pila[pila.length - 1].profundidad >= f.profundidad) pila.pop()
    const coincide = f.nombre.toLowerCase().includes(q) || f.subtareas.some((s) => s.toLowerCase().includes(q))
    if (coincide) {
      for (const p of pila) if (!salida.includes(p)) salida.push(p)
      salida.push(f)
    }
    pila.push(f)
  }
  return salida
}

/** Agrupar por Responsable o Estado: cabeceras sintéticas + las tareas, planas. */
export function agruparFilas(filas: readonly FilaItem[], modo: Agrupar): FilaItem[] {
  if (modo === 'rubro') return [...filas]
  const hojas = filas.filter((f) => f.nivel === 'tarea' || f.nivel === 'subtarea')
  const clave = (f: FilaItem) => modo === 'responsable' ? (f.responsable ?? 'sin asignar') : ESTADO_ITEM_LABEL[f.estado]
  const grupos = new Map<string, FilaItem[]>()
  for (const f of hojas) {
    const k = clave(f)
    const g = grupos.get(k) ?? []
    g.push(f)
    grupos.set(k, g)
  }
  const salida: FilaItem[] = []
  let i = 0
  for (const [k, g] of grupos) {
    i++
    const avance = g.some((f) => f.avanceObra != null) ? g.reduce((s, f) => s + (f.avanceObra ?? 0), 0) : null
    salida.push({
      id: `grupo-${modo}-${k}`, nivel: 'rubro', profundidad: 0, codigo: String(i), nombre: k, esContenedor: true,
      uniCant: null, peso: null, costoMo: null, sinCosto: false, plan: null, diasReales: null, diasTeoricos: null,
      diasWarn: false, pctItem: null, estado: 'sin_parte', avanceObra: avance, parteHoy: false, bloqueada: false,
      tiempoTecnico: false, responsable: null, subtareas: [], medicion: { texto: '', tono: 'ink' }, puedeMedir: false,
    })
    for (const f of g) salida.push({ ...f, profundidad: 1 })
  }
  return salida
}

/** Los grupos del teléfono (M05): cada rubro con sus hojas, el conteo y el % agregado. */
export interface GrupoTelefono { id: string; nombre: string; n: number; pct: number | null; filas: FilaItem[] }

export function gruposTelefono(filas: readonly FilaItem[]): GrupoTelefono[] {
  const grupos: GrupoTelefono[] = []
  let actual: GrupoTelefono | null = null
  for (const f of filas) {
    if (f.profundidad === 0) {
      actual = { id: f.id, nombre: f.nombre, n: 0, pct: f.pctItem, filas: [] }
      grupos.push(actual)
      continue
    }
    if (f.nivel !== 'tarea' && f.nivel !== 'subtarea') continue
    if (!actual) {
      actual = { id: 'sin-rubro', nombre: 'Sin rubro', n: 0, pct: null, filas: [] }
      grupos.push(actual)
    }
    actual.filas.push(f)
    actual.n++
  }
  return grupos.filter((g) => g.n > 0)
}
