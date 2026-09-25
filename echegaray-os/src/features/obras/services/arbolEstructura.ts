// EL ÁRBOL DE LA SERIE B (B02–B06 · MB1) — qué dibuja cada fila. Módulo puro.
//
//   Ítem · Uni · cant · Costo MO · Peso · Plan · Días · Método
//
// El NIVEL sale de `obra_actividad.nivel` (20260925T0900); si todavía no llegó (base sin migrar) se
// deduce por profundidad, como antes. El PESO sale de `pesoMO.ts` (el espejo de la vista). Las
// subtareas se listan debajo de su tarea con casilla, sin columnas de datos: no pesan ni tienen plan.

import type { NodoObra } from './wbs.ts'
import { nivelDe, porId, rotuloPlan, rotuloUniCant, diasTeoricos, type NivelEstructura, type Ponderaciones } from './estructura.ts'
import { celdasDePeso, pesosDeLaObra, type ItemMO, type MetodoPonderacion, type PesoItem } from './pesoMO.ts'
import { diasHabilesEntre } from '../components/items/filasDeItems.ts'

export interface Celda { texto: string; tono: 'normal' | 'warn' | 'falta' }

export interface FilaArbol {
  id: string
  padreId: string | null
  nivel: NivelEstructura
  /** La profundidad REAL (sangría): una tarea colgada del rubro se dibuja donde está. */
  profundidad: number
  /** «1.2.1» por posición entre hermanas; las subtareas no llevan número. */
  codigo: string
  nombre: string
  /** Rubro, épica, historia o tarea dividida en frentes: agrupa, lleva chevron. */
  esContenedor: boolean
  tieneHijas: boolean
  /** «2 épicas» · «3 historias · 9 tareas» · «6 tareas» — se muestra con la fila plegada. */
  resumenHijas: string | null
  nSubtareas: number
  nInsumos: number
  tiempoTecnico: boolean
  /** Tarea colgada de un rubro o épica (obras cargadas antes de la serie B): «sin historia · revisar». */
  sinHistoria: boolean
  uniCant: string | null
  costo: Celda | null
  peso: Celda | null
  /** «24/08 → 04/09» · null. Una historia sin tareas dice «sin tareas». */
  plan: Celda | null
  dias: number | null
  metodo: string | null
  metodoFalta: boolean
  /** Subtarea tildada. */
  hecha: boolean
  unidad: string | null
  cantidad: number | null
  inicioPlan: string | null
  finPlan: string | null
  partidaCodigo: string | null
}

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`

/** Los ítems en el vocabulario de `pesoMO`. */
export function itemsMO(nodos: readonly NodoObra[], ponds: Ponderaciones): ItemMO[] {
  const mapa = porId(nodos)
  return nodos.map((n) => ({
    id: n.id, padre_id: n.padre_id, nivel: nivelDe(n, mapa, ponds), tipo: n.tipo,
    costo_mo: ponds[n.id]?.costo_mo ?? null, ponderacion: ponds[n.id]?.ponderacion ?? null,
  }))
}

export function filasDelArbol(
  nodos: readonly NodoObra[], ponds: Ponderaciones,
  opciones: { metodo?: MetodoPonderacion; insumosPor?: Readonly<Record<string, number>>; pesos?: ReadonlyMap<string, PesoItem> } = {},
): FilaArbol[] {
  const mapa = porId(nodos)
  const items = itemsMO(nodos, ponds)
  const nivelPor = new Map(items.map((i) => [i.id, i.nivel]))
  const pesos = opciones.pesos ?? pesosDeLaObra(items, opciones.metodo ?? 'costo_mo')
  const hijos = new Map<string | null, NodoObra[]>()
  for (const n of nodos) {
    const l = hijos.get(n.padre_id) ?? []
    l.push(n)
    hijos.set(n.padre_id, l)
  }
  const codigo = new Map<string, string>()
  const profundidad = new Map<string, number>()
  const codificar = (padre: string | null, prefijo: string, prof: number) => {
    let k = 0
    for (const h of hijos.get(padre) ?? []) {
      const esSub = nivelPor.get(h.id) === 'subtarea'
      const c = esSub ? '' : prefijo ? `${prefijo}.${++k}` : String(++k)
      codigo.set(h.id, c)
      profundidad.set(h.id, prof)
      codificar(h.id, c || prefijo, prof + 1)
    }
  }
  codificar(null, '', 0)

  const rango = (n: NodoObra): { ini: string | null; fin: string | null } => {
    if (nivelPor.get(n.id) === 'subtarea') return { ini: null, fin: null }
    if (!n.es_contenedor || n.inicio_plan || n.fin_plan) return { ini: n.inicio_plan, fin: n.fin_plan }
    let ini: string | null = null
    let fin: string | null = null
    for (const h of hijos.get(n.id) ?? []) {
      const r = rango(h)
      if (r.ini && (!ini || r.ini < ini)) ini = r.ini
      if (r.fin && (!fin || r.fin > fin)) fin = r.fin
    }
    return { ini, fin }
  }
  const descendientes = (id: string, nivel: NivelEstructura): number => {
    let n = 0
    for (const h of hijos.get(id) ?? []) {
      if (nivelPor.get(h.id) === nivel) n++
      n += descendientes(h.id, nivel)
    }
    return n
  }

  return nodos.map((n) => {
    const nivel = nivelPor.get(n.id)!
    const hijas = hijos.get(n.id) ?? []
    const subtareas = hijas.filter((h) => nivelPor.get(h.id) === 'subtarea')
    const esContenedor = nivel === 'rubro' || nivel === 'epica' || nivel === 'historia' || (nivel === 'tarea' && n.es_contenedor)
    const padre = n.padre_id ? mapa.get(n.padre_id) : undefined
    const nivelPadre = padre ? nivelPor.get(padre.id) : undefined
    const esSub = nivel === 'subtarea'
    let resumenHijas: string | null = null
    if (nivel === 'rubro' && hijas.length) {
      const e = hijas.filter((h) => nivelPor.get(h.id) === 'epica').length
      resumenHijas = e > 0 ? plural(e, 'épica', 'épicas') : plural(descendientes(n.id, 'historia'), 'historia', 'historias')
    } else if (nivel === 'epica' && hijas.length) {
      const h = descendientes(n.id, 'historia')
      const t = descendientes(n.id, 'tarea')
      resumenHijas = [h ? plural(h, 'historia', 'historias') : null, t ? plural(t, 'tarea', 'tareas') : null].filter(Boolean).join(' · ') || null
    } else if (nivel === 'historia' && hijas.length) {
      resumenHijas = plural(descendientes(n.id, 'tarea'), 'tarea', 'tareas')
    }
    const { costo, peso } = celdasDePeso(nivel, pesos.get(n.id))
    const r = rango(n)
    const planTxt = rotuloPlan(r.ini, r.fin)
    const tareasHist = nivel === 'historia' ? hijas.filter((h) => nivelPor.get(h.id) === 'tarea').length : 0
    const plan: Celda | null = esSub ? null
      : planTxt ? { texto: planTxt, tono: 'normal' }
        : nivel === 'historia' && tareasHist === 0 ? { texto: 'sin tareas', tono: 'falta' }
          : nivel === 'tarea' && !esContenedor ? { texto: 'sin fechas', tono: 'falta' } : null
    const medible = nivel === 'tarea' && !esContenedor
    return {
      id: n.id,
      padreId: n.padre_id,
      nivel,
      profundidad: profundidad.get(n.id) ?? 0,
      codigo: codigo.get(n.id) ?? '',
      nombre: n.nombre,
      esContenedor,
      tieneHijas: hijas.length > 0,
      resumenHijas,
      nSubtareas: subtareas.length,
      nInsumos: opciones.insumosPor?.[n.id] ?? 0,
      tiempoTecnico: n.tiempo_tecnico,
      sinHistoria: nivel === 'tarea' && (nivelPadre === undefined || nivelPadre === 'rubro' || nivelPadre === 'epica'),
      uniCant: esSub || nivel === 'rubro' || nivel === 'epica' ? null : rotuloUniCant(n.unidad, n.cantidad_objetivo),
      costo,
      peso,
      plan,
      dias: esSub ? null : esContenedor ? (r.ini && r.fin ? diasHabilesEntre(r.ini, r.fin) : null) : diasTeoricos(n),
      metodo: medible && n.metodo_avance ? n.metodo_avance : null,
      metodoFalta: medible && !n.metodo_avance,
      hecha: esSub && ponds[n.id]?.estado === 'hecha',
      unidad: n.unidad,
      cantidad: n.cantidad_objetivo,
      inicioPlan: n.inicio_plan,
      finPlan: n.fin_plan,
      partidaCodigo: n.partida_codigo,
    }
  })
}

/** Las filas visibles con los contenedores plegados en `plegados`. */
export function filasVisiblesDelArbol(filas: readonly FilaArbol[], plegados: ReadonlySet<string>): FilaArbol[] {
  const ocultos = new Set<string>()
  const salida: FilaArbol[] = []
  for (const f of filas) {
    if (f.padreId && (ocultos.has(f.padreId) || plegados.has(f.padreId))) { ocultos.add(f.id); continue }
    salida.push(f)
  }
  return salida
}
