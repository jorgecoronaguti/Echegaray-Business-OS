import { plataMillones } from '../../../shared/utils/format.ts'
// EL PESO DE CADA ÍTEM, DERIVADO DEL COSTO DE MANO DE OBRA (serie B del diseño ERP Obras, 24/09/2026).
//
// «El peso de una historia es su costo de MO sobre el total cargado. El avance de la obra = Σ (% de la
//  historia × su peso); el costo teórico = avance × MO total. Una historia sin costo no pesa y se
//  marca; cargarlo la incorpora y recalcula todo.» — la regla textual del panel B07.
//
// Es el ESPEJO en TypeScript de la vista `obra_historia_peso` (20260925T0900): la pantalla lo usa para
// dibujar el árbol mientras la persona tipea (el costo nuevo recalcula TODO el árbol antes de guardar)
// y el test lo fija. La cifra publicada de la obra sale de la vista; si alguna vez difieren, gana la
// base y este archivo está mal.
//
// Reglas que no se negocian:
//   · NULL nunca es 0. Una historia sin costo «no pesa» y NO entra al denominador.
//   · Las tareas no pesan: el avance de una historia es el PROMEDIO SIMPLE de sus tareas; una tarea
//     dividida en frentes vale el promedio de sus frentes. Las subtareas no cuentan.
//   · Un contenedor (rubro, épica) pesa la suma de sus historias; sin hijas, «sin hijas» — nunca 0 %.
//
// Módulo puro (sin `@/`): lo prueba `node --test` al lado.

export type NivelItem = 'rubro' | 'epica' | 'historia' | 'tarea' | 'subtarea'
export type MetodoPonderacion = 'costo_mo' | 'manual' | 'parejo' | 'dias_teoricos' | 'hh_plan'

export interface ItemMO {
  id: string
  padre_id: string | null
  nivel: NivelItem
  /** 'resumen' en una tarea = dividida en frentes. */
  tipo?: string
  costo_mo: number | null
  /** Override «A mano»: 0–100 entre hermanas. */
  ponderacion?: number | null
}

export type EstadoPeso = 'pesa' | 'no_pesa' | 'sin_hijas' | 'no_aplica'

export interface PesoItem {
  /** Fracción 0..1 de la obra. null = no pesa (o no aplica). */
  peso: number | null
  /** Costo de MO propio (historia) o la suma de lo que cuelga (contenedor). null = sin cargar. */
  costo: number | null
  estado: EstadoPeso
  /** Para tareas: la parte de la obra que representa (peso de la historia / tareas hermanas). */
  pesoEfectivo: number | null
}

/** Lo que otros métodos necesitan por historia: HH plan y días teóricos (null = sin dato). */
export interface ValoresHistoria { hh: ReadonlyMap<string, number | null>; dias: ReadonlyMap<string, number | null> }

function hijasPorPadre(items: readonly ItemMO[]): Map<string | null, ItemMO[]> {
  const m = new Map<string | null, ItemMO[]>()
  for (const it of items) {
    const l = m.get(it.padre_id) ?? []
    l.push(it)
    m.set(it.padre_id, l)
  }
  return m
}

/** El valor que pesa una historia según el método. null = no pesa. */
function valorDeHistoria(h: ItemMO, metodo: MetodoPonderacion, valores: ValoresHistoria | null): number | null {
  if (metodo === 'costo_mo') return h.costo_mo
  if (metodo === 'parejo') return 1
  if (metodo === 'hh_plan') return valores?.hh.get(h.id) ?? null
  if (metodo === 'dias_teoricos') return valores?.dias.get(h.id) ?? null
  return null
}

/**
 * EL PESO DE TODO EL ÁRBOL. Se recalcula entero en cada llamada: cargar, editar o borrar el costo de
 * UNA historia cambia el denominador y, con él, el peso de todas.
 */
export function pesosDeLaObra(
  items: readonly ItemMO[], metodo: MetodoPonderacion = 'costo_mo', valores: ValoresHistoria | null = null,
): Map<string, PesoItem> {
  const hijas = hijasPorPadre(items)
  const porId = new Map(items.map((i) => [i.id, i]))
  const historias = items.filter((i) => i.nivel === 'historia')
  const salida = new Map<string, PesoItem>()

  // 1. Las historias.
  if (metodo === 'manual') {
    // El producto de la cadena: cada nivel reparte 100 entre hermanas.
    const cadena = (id: string): number | null => {
      let p = 1
      let cur: ItemMO | undefined = porId.get(id)
      while (cur) {
        if (cur.ponderacion == null) return null
        p *= cur.ponderacion / 100
        cur = cur.padre_id ? porId.get(cur.padre_id) : undefined
      }
      return p
    }
    for (const h of historias) {
      const peso = cadena(h.id)
      salida.set(h.id, { peso, costo: h.costo_mo, estado: peso == null ? 'no_pesa' : 'pesa', pesoEfectivo: peso })
    }
  } else {
    const total = historias.reduce((s, h) => s + (valorDeHistoria(h, metodo, valores) ?? 0), 0)
    for (const h of historias) {
      const v = valorDeHistoria(h, metodo, valores)
      const peso = v != null && total > 0 ? v / total : null
      salida.set(h.id, { peso, costo: h.costo_mo, estado: peso == null ? 'no_pesa' : 'pesa', pesoEfectivo: peso })
    }
  }

  // 2. Los contenedores: la suma de lo que cuelga (de abajo hacia arriba, por recursión memoizada).
  const contenedor = (it: ItemMO): PesoItem => {
    const ya = salida.get(it.id)
    if (ya) return ya
    const hs = (hijas.get(it.id) ?? []).filter((h) => h.nivel === 'epica' || h.nivel === 'historia')
    const todas = hijas.get(it.id) ?? []
    if (todas.length === 0) {
      const r: PesoItem = { peso: null, costo: null, estado: 'sin_hijas', pesoEfectivo: null }
      salida.set(it.id, r)
      return r
    }
    let peso: number | null = null
    let costo: number | null = null
    for (const h of hs) {
      const p = h.nivel === 'historia' ? salida.get(h.id)! : contenedor(h)
      if (p.peso != null) peso = (peso ?? 0) + p.peso
      if (p.costo != null) costo = (costo ?? 0) + p.costo
    }
    const r: PesoItem = { peso, costo, estado: peso == null ? 'no_pesa' : 'pesa', pesoEfectivo: peso }
    salida.set(it.id, r)
    return r
  }
  for (const it of items) if (it.nivel === 'rubro' || it.nivel === 'epica') contenedor(it)

  // 3. Tareas y subtareas: no pesan; la tarea lleva su parte efectiva (04b «Pond.»).
  const efectivo = (it: ItemMO): number | null => {
    const padre = it.padre_id ? porId.get(it.padre_id) : undefined
    if (!padre) return null
    const base = padre.nivel === 'historia' ? salida.get(padre.id)?.peso ?? null
      : padre.nivel === 'tarea' ? efectivo(padre) : null
    if (base == null) return null
    const hermanas = (hijas.get(padre.id) ?? []).filter((h) => h.nivel === 'tarea').length
    return hermanas > 0 ? base / hermanas : null
  }
  for (const it of items) {
    if (it.nivel === 'tarea') salida.set(it.id, { peso: null, costo: null, estado: 'no_aplica', pesoEfectivo: efectivo(it) })
    else if (it.nivel === 'subtarea') salida.set(it.id, { peso: null, costo: null, estado: 'no_aplica', pesoEfectivo: null })
  }
  return salida
}

/**
 * EL AVANCE DE CADA HISTORIA: promedio simple de sus tareas; una tarea dividida vale el promedio de
 * sus frentes. `avances` = el % de cada tarea medible (null = sin registrar, suma 0: no avanzó).
 * Una historia sin tareas devuelve null («sin tareas»), nunca 0.
 */
export function avanceDeHistorias(items: readonly ItemMO[], avances: ReadonlyMap<string, number | null>): Map<string, number | null> {
  const hijas = hijasPorPadre(items)
  const tareasDe = (id: string) => (hijas.get(id) ?? []).filter((h) => h.nivel === 'tarea')
  const avanceDe = (t: ItemMO): number => {
    const frentes = tareasDe(t.id)
    if (frentes.length === 0) return avances.get(t.id) ?? 0
    return frentes.reduce((s, f) => s + avanceDe(f), 0) / frentes.length
  }
  const salida = new Map<string, number | null>()
  for (const h of items) {
    if (h.nivel !== 'historia') continue
    const ts = tareasDe(h.id)
    salida.set(h.id, ts.length === 0 ? null : ts.reduce((s, t) => s + avanceDe(t), 0) / ts.length)
  }
  return salida
}

/** El avance de la obra: Σ (avance de la historia × peso). null sin ninguna historia que pese. */
export function avanceDeLaObra(pesos: ReadonlyMap<string, PesoItem>, avanceHist: ReadonlyMap<string, number | null>): number | null {
  let total: number | null = null
  for (const [id, av] of avanceHist) {
    const p = pesos.get(id)?.peso
    if (p == null) continue
    total = (total ?? 0) + (av ?? 0) * p
  }
  return total
}

/** Método «pasos»: subtareas hechas / total. Sin subtareas, null (no se puede medir). */
export function avancePorPasos(hechas: number, total: number): number | null {
  return total > 0 ? (100 * hechas) / total : null
}

// ── CÓMO SE DICE ─────────────────────────────────────────────────────────────

/** «100 %» · «72,6 %» · «0,03 %» (dos decimales por debajo de 0,1 %). */
export function rotuloPeso(fraccion: number): string {
  const pct = fraccion * 100
  const dec = pct > 0 && pct < 0.1 ? 2 : 1
  return `${pct.toLocaleString('es-AR', { maximumFractionDigits: dec, minimumFractionDigits: dec === 2 ? 2 : 0 })} %`
}

/** «$ 1.775.059». */
export function rotuloPesos(n: number): string {
  return `$ ${Math.round(n).toLocaleString('es-AR')}`
}

/** «$ 2,65 M» (cabecera). */
export function rotuloMillones(n: number): string {
  return plataMillones(n)
}

/** Lo que dicen las columnas Costo MO y Peso de una fila del árbol (B02–B06). */
export function celdasDePeso(nivel: NivelItem, p: PesoItem | undefined): {
  costo: { texto: string; tono: 'normal' | 'warn' | 'falta' } | null
  peso: { texto: string; tono: 'normal' | 'warn' | 'falta' } | null
} {
  if (!p || nivel === 'tarea' || nivel === 'subtarea') return { costo: null, peso: null }
  if (p.estado === 'sin_hijas') return { costo: null, peso: { texto: 'sin hijas', tono: 'falta' } }
  if (nivel === 'historia' && p.costo == null) {
    return { costo: { texto: 'sin costo de MO', tono: 'warn' }, peso: p.peso != null ? { texto: rotuloPeso(p.peso), tono: 'normal' } : { texto: 'no pesa', tono: 'warn' } }
  }
  if (p.peso == null) {
    return { costo: p.costo == null ? { texto: 'sin costo de MO', tono: 'warn' } : { texto: rotuloPesos(p.costo), tono: 'normal' }, peso: { texto: 'no pesa', tono: 'warn' } }
  }
  return { costo: p.costo == null ? null : { texto: rotuloPesos(p.costo), tono: 'normal' }, peso: { texto: rotuloPeso(p.peso), tono: 'normal' } }
}

/** «Ítems 16 · 4 rubros · 12 épicas», «Historias 7 · 4 sin costo», «Costo MO $ 2,65 M» (cabecera B). */
export function resumenMO(items: readonly ItemMO[]): {
  nItems: number; nRubros: number; nEpicas: number; nHistorias: number; nSinCosto: number; nTareas: number; costoTotal: number | null
} {
  const hist = items.filter((i) => i.nivel === 'historia')
  const costo = hist.reduce<number | null>((s, h) => (h.costo_mo == null ? s : (s ?? 0) + h.costo_mo), null)
  return {
    nItems: items.length,
    nRubros: items.filter((i) => i.nivel === 'rubro').length,
    nEpicas: items.filter((i) => i.nivel === 'epica').length,
    nHistorias: hist.length,
    nSinCosto: hist.filter((h) => h.costo_mo == null).length,
    nTareas: items.filter((i) => i.nivel === 'tarea').length,
    costoTotal: costo,
  }
}

/** De dónde sale el costo de MO de una historia (columna `costo_mo_fuente`). */
export interface FuenteCostoMO { origen?: string; archivo?: string; hoja?: string; partidas?: unknown[]; en?: string; venta?: { archivo?: string } }

/**
 * El rótulo que acompaña al costo en la ponderación. Lo leído de una cotización dice «costo de <archivo>
 * · N partidas»; lo calculado cruzando documentos lo DICE («calculado: Análisis × PDF vendido»), para que
 * nadie lo tome por un dato leído; lo tipeado dice «cargado a mano».
 */
export function textoDeFuenteCosto(f: FuenteCostoMO | null | undefined): string | null {
  if (!f) return null
  if (f.origen === 'a_mano') return 'cargado a mano'
  if (f.origen === 'calculado') return ['calculado: Análisis × PDF vendido', f.venta?.archivo ?? null].filter(Boolean).join(' · ')
  const n = Array.isArray(f.partidas) ? f.partidas.length : null
  return `costo de ${[f.archivo ?? 'presupuesto', n != null ? `${n} ${n === 1 ? 'partida' : 'partidas'}` : null].filter(Boolean).join(' · ')}`
}
