// CREAR LA ESTRUCTURA DE UNA OBRA (diseño ERP Obras C01–C10 · MC1–MC11) — la lógica, sin JSX.
//
// Rubro › Épica › Historia › Tarea › Subtarea. Acá vive lo que las pantallas de armado deciden y
// que se puede probar sin navegador: en qué nivel cae un ítem nuevo, cómo se reparte el peso entre
// hermanas (C05), qué queda de cada frente (C07), por qué una tarea se puede partir, cuántos días
// hábiles corre una fecha (C09) y las cifras de la cabecera de cada pantalla.
//
// Módulo puro (sin `@/`): lo prueba `node --test` al lado. NULL nunca es 0.

import type { NodoObra } from './wbs.ts'
import { diasHabilesEntre } from '../components/items/filasDeItems.ts'
import { repartirCantidad } from './panelTarea.ts'

export type NivelEstructura = 'rubro' | 'epica' | 'historia' | 'tarea' | 'subtarea'

export const ROTULO_NIVEL: Record<NivelEstructura, string> = {
  rubro: 'Rubro', epica: 'Épica', historia: 'Historia', tarea: 'Tarea', subtarea: 'Subtarea',
}

/** Lo que el árbol no trae y estas pantallas necesitan: el peso a mano y el costo de MO por ítem. */
export interface PesoItem { ponderacion: number | null; costo_mo: number | null }
export type Ponderaciones = Record<string, PesoItem>

const num = (n: number, dec = 0) => n.toLocaleString('es-AR', { maximumFractionDigits: dec })

/** «$ 19,29 M» (C01, C10). Sin cifra, `null`: quien dibuja escribe «sin cargar». */
export function millones(n: number | null): string | null {
  if (n == null) return null
  return `$ ${(n / 1_000_000).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} M`
}

/** El nivel de un nodo por su profundidad; lo que cuelga de una ejecutable es subtarea. */
export function nivelDe(n: NodoObra, porId: ReadonlyMap<string, NodoObra>): NivelEstructura {
  const padre = n.padre_id ? porId.get(n.padre_id) : undefined
  if (padre && !padre.es_contenedor) return 'subtarea'
  if (n.nivel === 0) return 'rubro'
  if (n.nivel === 1) return 'epica'
  if (n.nivel === 2) return 'historia'
  if (n.nivel === 3) return 'tarea'
  return 'subtarea'
}

/** El nivel que tendría un ítem NUEVO colgado de `padre` (null = un rubro nuevo). */
export function nivelDeHijaNueva(padre: NodoObra | null, porId: ReadonlyMap<string, NodoObra>): NivelEstructura {
  if (!padre) return 'rubro'
  if (!padre.es_contenedor) return 'subtarea'
  const n = nivelDe(padre, porId)
  return n === 'rubro' ? 'epica' : n === 'epica' ? 'historia' : 'tarea'
}

export function porId(nodos: readonly NodoObra[]): Map<string, NodoObra> {
  return new Map(nodos.map((n) => [n.id, n]))
}

export function hijasDe(nodos: readonly NodoObra[], padreId: string | null): NodoObra[] {
  return nodos.filter((n) => n.padre_id === padreId)
}

/** Los días teóricos de un ítem: los cargados, o los hábiles entre sus fechas. */
export function diasTeoricos(n: Pick<NodoObra, 'dias_plan' | 'inicio_plan' | 'fin_plan'>): number | null {
  if (n.dias_plan != null) return n.dias_plan
  if (n.inicio_plan && n.fin_plan) return diasHabilesEntre(n.inicio_plan, n.fin_plan)
  return null
}

/** «01/09 → 04/09» · «04/09» · null. */
export function rotuloPlan(inicio: string | null, fin: string | null): string | null {
  const dm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`
  if (inicio && fin) return inicio.slice(0, 10) === fin.slice(0, 10) ? dm(inicio) : `${dm(inicio)} → ${dm(fin)}`
  if (inicio) return dm(inicio)
  if (fin) return dm(fin)
  return null
}

/** «kg · 1.840» · null. */
export function rotuloUniCant(unidad: string | null, cantidad: number | null): string | null {
  if (unidad && cantidad != null) return `${unidad} · ${num(cantidad, 2)}`
  if (cantidad != null) return num(cantidad, 2)
  return unidad
}

// ── C05 · REPARTIR EL PESO ENTRE HERMANAS ────────────────────────────────────

export interface FilaPonderacion {
  id: string
  nombre: string
  diasTeoricos: number | null
  hhPlan: number | null
  /** El peso cargado, 0–100. null = nadie lo cargó todavía. */
  pond: number | null
  costoMo: number | null
  tienePartida: boolean
}

export function filasDePonderacion(nodos: readonly NodoObra[], ponds: Ponderaciones, padreId: string): FilaPonderacion[] {
  return hijasDe(nodos, padreId).map((h) => ({
    id: h.id,
    nombre: h.nombre,
    diasTeoricos: diasTeoricos(h),
    hhPlan: h.hh_plan,
    pond: ponds[h.id]?.ponderacion ?? null,
    costoMo: ponds[h.id]?.costo_mo ?? null,
    tienePartida: h.cotizacion_partida_id != null,
  }))
}

export type MetodoReparto = 'mano' | 'parejo' | 'dias_teoricos' | 'hh_plan' | 'costo_mo'

export const METODOS_REPARTO: readonly { id: MetodoReparto; label: string; corto: string }[] = [
  { id: 'mano', label: 'A mano', corto: 'A mano' },
  { id: 'parejo', label: 'Parejo', corto: 'Parejo' },
  { id: 'dias_teoricos', label: 'Por días teóricos', corto: 'Por días' },
  { id: 'hh_plan', label: 'Por HH plan', corto: 'Por HH' },
  { id: 'costo_mo', label: 'Por costo teórico', corto: 'Por costo' },
]

/** Reparte 100 en proporción a `pesos`; los null pesan 0. Sin base (todo 0 o null) devuelve null. */
function proporcional(filas: readonly FilaPonderacion[], peso: (f: FilaPonderacion) => number | null): Record<string, number> | null {
  const total = filas.reduce((s, f) => s + (peso(f) ?? 0), 0)
  if (total <= 0) return null
  const salida: Record<string, number> = {}
  let acumulado = 0
  filas.forEach((f, i) => {
    const bruto = ((peso(f) ?? 0) / total) * 100
    const v = i === filas.length - 1 ? Math.round((100 - acumulado) * 10) / 10 : Math.round(bruto * 10) / 10
    acumulado += v
    salida[f.id] = v
  })
  return salida
}

/** Los valores que deja cada método sobre las hermanas. `mano` no toca nada (devuelve lo cargado). */
export function repartir(filas: readonly FilaPonderacion[], metodo: MetodoReparto): Record<string, number | null> | null {
  if (filas.length === 0) return {}
  if (metodo === 'mano') return Object.fromEntries(filas.map((f) => [f.id, f.pond]))
  if (metodo === 'parejo') {
    const partes = repartirCantidad(100, filas.length)
    return Object.fromEntries(filas.map((f, i) => [f.id, Math.round(partes[i] * 10) / 10]))
  }
  if (metodo === 'dias_teoricos') return proporcional(filas, (f) => f.diasTeoricos)
  if (metodo === 'hh_plan') return proporcional(filas, (f) => f.hhPlan)
  return proporcional(filas, (f) => f.costoMo)
}

/** Por qué un método está apagado (C05: «Costo teórico: 2 de 4 sin partida → apagado»). null = se puede. */
export function motivoMetodoApagado(filas: readonly FilaPonderacion[], metodo: MetodoReparto): string | null {
  const n = filas.length
  if (n === 0) return 'sin hijas'
  if (metodo === 'costo_mo') {
    const sin = filas.filter((f) => !f.tienePartida || f.costoMo == null).length
    return sin > 0 ? `Costo teórico: ${sin} de ${n} sin partida → apagado` : null
  }
  if (metodo === 'hh_plan') {
    const sin = filas.filter((f) => f.hhPlan == null).length
    return sin === n ? `HH plan: ${n} de ${n} sin HH → apagado` : null
  }
  if (metodo === 'dias_teoricos') {
    const sin = filas.filter((f) => f.diasTeoricos == null).length
    return sin === n ? `Días teóricos: ${n} de ${n} sin fechas → apagado` : null
  }
  return null
}

export function sumaPonderacion(valores: Readonly<Record<string, number | null>>): number {
  return Math.round(Object.values(valores).reduce<number>((s, v) => s + (v ?? 0), 0) * 10) / 10
}

/** «Las historias de Fundaciones pesan 65 %. Faltan 35.» · «… pesan 100 %.» */
export function tituloPonderacion(padre: NodoObra, hijas: NivelEstructura, suma: number): string {
  const plural: Record<NivelEstructura, string> = {
    rubro: 'rubros', epica: 'épicas', historia: 'historias', tarea: 'tareas', subtarea: 'subtareas',
  }
  const base = `Las ${plural[hijas]} de ${padre.nombre} pesan ${num(suma, 1)} %.`
  if (suma >= 100 && suma <= 100) return base
  return suma < 100 ? `${base} Faltan ${num(100 - suma, 1)}.` : `${base} Sobran ${num(suma - 100, 1)}.`
}

/** Cuánto pesa el padre dentro de su propio padre: «40 % de Obra gruesa». null si cuelga de la raíz o sin peso. */
export function pesoEnElAbuelo(nodos: readonly NodoObra[], ponds: Ponderaciones, padreId: string): string | null {
  const mapa = porId(nodos)
  const padre = mapa.get(padreId)
  if (!padre?.padre_id) return null
  const abuelo = mapa.get(padre.padre_id)
  const p = ponds[padreId]?.ponderacion
  if (!abuelo || p == null) return null
  return `${num(p, 1)} % de ${abuelo.nombre}`
}

export interface ComoQueda {
  id: string
  nombre: string
  /** 0 = rubro, 1 = épica… la sangría del aside. */
  profundidad: number
  /** La suma de sus hijas. null = sin hijas. */
  suma: number | null
  tono: 'pos' | 'warn' | 'sin'
}

/**
 * «Cómo queda la obra» (C05): cada contenedor con lo que suman sus hijas. `edicion` reemplaza las
 * hijas del padre que se está repartiendo por lo que hay en pantalla, sin guardar.
 */
export function comoQuedaLaObra(
  nodos: readonly NodoObra[], ponds: Ponderaciones,
  edicion: { padreId: string; valores: Readonly<Record<string, number | null>> } | null = null,
  hasta: number = 1,
): ComoQueda[] {
  const salida: ComoQueda[] = []
  for (const n of nodos) {
    if (!n.es_contenedor || n.nivel > hasta) continue
    const hijas = hijasDe(nodos, n.id)
    let suma: number | null = null
    if (hijas.length > 0) {
      suma = edicion && edicion.padreId === n.id
        ? sumaPonderacion(edicion.valores)
        : sumaPonderacion(Object.fromEntries(hijas.map((h) => [h.id, ponds[h.id]?.ponderacion ?? null])))
    }
    salida.push({
      id: n.id, nombre: n.nombre, profundidad: n.nivel, suma,
      tono: suma == null ? 'sin' : suma === 100 ? 'pos' : 'warn',
    })
  }
  return salida
}

/** Lo que queda libre para una hija nueva de `padreId` (C04 «quedan 35 %»). */
export function quedanPorRepartir(nodos: readonly NodoObra[], ponds: Ponderaciones, padreId: string | null): number {
  if (!padreId) return 100
  const suma = sumaPonderacion(Object.fromEntries(hijasDe(nodos, padreId).map((h) => [h.id, ponds[h.id]?.ponderacion ?? null])))
  return Math.max(0, Math.round((100 - suma) * 10) / 10)
}

/** El primer contenedor cuyas hijas no suman 100 (C04/C10 «Fundaciones 65 %»). null = todo cierra. */
export function problemaDePonderacion(nodos: readonly NodoObra[], ponds: Ponderaciones): { nombre: string; suma: number | null }[] {
  return comoQuedaLaObra(nodos, ponds, null, 99)
    .filter((c) => c.tono !== 'pos')
    .map((c) => ({ nombre: c.nombre, suma: c.suma }))
}

// ── C07 · DIVIDIR EN FRENTES ─────────────────────────────────────────────────

export interface VistaPreviaFrentes {
  nombres: string[]
  filas: { nombre: string; cantidad: number | null }[]
}

/** Los frentes tal como quedarían: nombre compuesto y cantidad repartida (o null si no hay cantidad). */
export function vistaPreviaFrentes(nombre: string, cantidad: number | null, texto: string): VistaPreviaFrentes {
  const nombres = texto.split(/[\n,;]/).map((t) => t.trim()).filter((t) => t.length > 0)
  const partes = cantidad == null ? nombres.map(() => null) : repartirCantidad(cantidad, nombres.length)
  return { nombres, filas: nombres.map((f, i) => ({ nombre: `${nombre} · ${f}`, cantidad: partes[i] ?? null })) }
}

/** El párrafo de C07/MC8. */
export function textoDeFrentes(cantidad: number | null, unidad: string | null, largo: boolean): string {
  const cola = largo ? 'La actividad pasa a contenedor: su avance sale de sus frentes.' : 'La actividad pasa a contenedor.'
  if (cantidad == null) return `Sin cantidad cargada, los frentes nacen sin cantidad. ${cola}`
  return `Los ${num(cantidad, 2)} ${unidad ?? ''} se reparten en partes iguales y la suma se conserva. ${cola}`.replace('  ', ' ')
}

// El método real de la actividad: una «manual» no se mide por cantidad y decirlo mentía.
const COMO_SE_MIDE: Record<string, string> = { cantidad: 'por cantidad', partes: 'por partes', manual: 'a mano' }

export interface RazonDividir { ok: boolean; texto: string }

/** «Se puede porque» (C07/MC8). Con una en falso la primaria no se ofrece. */
export function razonesParaDividir(
  n: Pick<NodoObra, 'tiene_hijas' | 'es_contenedor' | 'metodo_avance' | 'partida_codigo' | 'tipo'>,
  nAvances: number, nPasos: number, largo: boolean,
): RazonDividir[] {
  const razones: RazonDividir[] = [
    { ok: !n.tiene_hijas && !n.es_contenedor, texto: n.tiene_hijas || n.es_contenedor ? 'Ya tiene hijas' : 'No tiene hijas' },
    { ok: nAvances === 0, texto: nAvances === 0 ? 'Sin avance registrado' : `Tiene ${nAvances} avance(s) registrado(s)` },
    {
      ok: n.metodo_avance !== 'pasos' && nPasos === 0 && n.tipo !== 'hito',
      texto: n.tipo === 'hito' ? 'Es un hito: no lleva trabajo'
        : n.metodo_avance === 'pasos' || nPasos > 0 ? 'Se mide por pasos'
          : largo ? `Se mide ${COMO_SE_MIDE[n.metodo_avance ?? ''] ?? 'sin método'}, no por pasos` : `Se mide ${COMO_SE_MIDE[n.metodo_avance ?? ''] ?? 'sin método'}`,
    },
  ]
  if (n.partida_codigo) {
    razones.push({ ok: true, texto: largo ? `Viene de partida ${n.partida_codigo} · la partida sigue en el contenedor` : 'La partida sigue en el contenedor' })
  }
  return razones
}

// ── C08 · SUBTAREAS ──────────────────────────────────────────────────────────

/** «Pasos: cada subtarea hecha suma su parte. Con 4 subtareas, 25 % cada una.» */
export function textoDePasos(n: number, largo: boolean): string {
  if (n === 0) return largo ? 'Pasos: cada subtarea hecha suma su parte. Todavía no hay subtareas.' : 'Todavía no hay subtareas.'
  const cada = num(100 / n, 1)
  return largo ? `Pasos: cada subtarea hecha suma su parte. Con ${n} subtareas, ${cada} % cada una.` : `Cada subtarea hecha suma ${cada} %.`
}

// ── C09 · CORRER FECHAS ──────────────────────────────────────────────────────

/** Corre una fecha ISO `n` días hábiles (lunes a viernes), hacia adelante o atrás. */
export function correrDiasHabiles(iso: string, n: number): string {
  let d = new Date(`${iso.slice(0, 10)}T00:00:00Z`)
  const paso = Math.sign(n) || 1
  let restan = Math.abs(n)
  while (restan > 0) {
    d = new Date(d.getTime() + paso * 86_400_000)
    const dow = d.getUTCDay()
    if (dow !== 0 && dow !== 6) restan--
  }
  return d.toISOString().slice(0, 10)
}

export const CORRIMIENTOS: readonly { id: string; label: string; dias: number }[] = [
  { id: 'menos1', label: '−1 día', dias: -1 },
  { id: 'mas1', label: '+1 día', dias: 1 },
  { id: 'mas5', label: '+1 semana', dias: 5 },
]

// ── LAS CIFRAS DE LA CABECERA ────────────────────────────────────────────────

export interface ResumenEstructura {
  /** Tareas y subtareas: lo medible. */
  nItems: number
  nRubros: number
  /** Cuántos niveles distintos tiene el árbol (C10 «19 ítems en 5 niveles»). */
  niveles: number
  sinMetodo: number
  sinFechas: number
  hhPlan: number | null
  costoMo: number | null
  /** El primer contenedor cuyas hijas no suman 100: «Fundaciones 65 %» · «Estructura metálica sin hijas». */
  problemaPonderacion: { nombre: string; suma: number | null } | null
}

export function resumenDeEstructura(nodos: readonly NodoObra[], ponds: Ponderaciones): ResumenEstructura {
  const hojas = nodos.filter((n) => !n.es_contenedor)
  const hh = hojas.reduce<number | null>((s, n) => n.hh_plan == null ? s : (s ?? 0) + n.hh_plan, null)
  const costo = nodos.reduce<number | null>((s, n) => {
    const c = ponds[n.id]?.costo_mo
    return c == null ? s : (s ?? 0) + c
  }, null)
  const problemas = problemaDePonderacion(nodos, ponds)
  return {
    nItems: hojas.length,
    nRubros: nodos.filter((n) => n.nivel === 0 && n.es_contenedor).length,
    niveles: new Set(nodos.map((n) => n.nivel)).size,
    sinMetodo: hojas.filter((n) => !n.metodo_avance).length,
    sinFechas: hojas.filter((n) => !n.inicio_plan || !n.fin_plan).length,
    hhPlan: hh,
    costoMo: costo,
    problemaPonderacion: problemas[0] ?? null,
  }
}

/** «Fundaciones 65 %» · «Estructura metálica sin hijas». */
export function rotuloProblema(p: { nombre: string; suma: number | null } | null): string | null {
  if (!p) return null
  return p.suma == null ? `${p.nombre} sin hijas` : `${p.nombre} ${num(p.suma, 1)} %`
}

// ── EL ÁRBOL DE LAS PANTALLAS DE ARMADO (C04 · C07 · C08 · C09 · MC2) ──────────

export interface FilaArbol {
  id: string
  padreId: string | null
  nivel: NivelEstructura
  /** 0 rubro · 1 épica · 2 historia · 3 tarea · 4 subtarea. */
  profundidad: number
  /** «1.2.1» por posición entre hermanas; las subtareas no llevan número. */
  codigo: string
  nombre: string
  esContenedor: boolean
  tieneHijas: boolean
  nSubtareas: number
  uniCant: string | null
  /** El peso propio; en un contenedor cuyas hijas no cierran, la suma de las hijas en warn. */
  pond: { texto: string; tono: 'normal' | 'warn' } | null
  plan: string | null
  dias: number | null
  metodo: string | null
  metodoFalta: boolean
  unidad: string | null
  cantidad: number | null
  inicioPlan: string | null
  finPlan: string | null
  partidaCodigo: string | null
}

const METODO_ARBOL: Record<string, string> = { cantidad: 'cantidad', pasos: 'pasos', manual: 'manual', partes: 'partes' }

/** Todas las filas del árbol en orden constructivo, con lo que dibujan las seis columnas de C04. */
export function filasDelArbol(nodos: readonly NodoObra[], ponds: Ponderaciones): FilaArbol[] {
  const mapa = porId(nodos)
  const hijos = new Map<string | null, NodoObra[]>()
  for (const n of nodos) {
    const l = hijos.get(n.padre_id) ?? []
    l.push(n)
    hijos.set(n.padre_id, l)
  }
  const codigo = new Map<string, string>()
  const codificar = (padre: string | null, prefijo: string) => {
    ;(hijos.get(padre) ?? []).forEach((h, i) => {
      const esSub = padre != null && !(mapa.get(padre)?.es_contenedor ?? true)
      const c = esSub ? '' : prefijo ? `${prefijo}.${i + 1}` : String(i + 1)
      codigo.set(h.id, c)
      codificar(h.id, c)
    })
  }
  codificar(null, '')

  // Las fechas de un contenedor: de la primera a la última de lo que cuelga.
  const rango = (n: NodoObra): { ini: string | null; fin: string | null } => {
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

  const PROF: Record<NivelEstructura, number> = { rubro: 0, epica: 1, historia: 2, tarea: 3, subtarea: 4 }
  return nodos.map((n) => {
    const nivel = nivelDe(n, mapa)
    const hijas = hijos.get(n.id) ?? []
    const propio = ponds[n.id]?.ponderacion ?? null
    let pond: FilaArbol['pond'] = propio == null ? null : { texto: `${num(propio, 1)} %`, tono: 'normal' }
    if (n.es_contenedor && hijas.length > 0) {
      const suma = sumaPonderacion(Object.fromEntries(hijas.map((h) => [h.id, ponds[h.id]?.ponderacion ?? null])))
      if (suma !== 100) pond = { texto: `${num(suma, 1)} %`, tono: 'warn' }
    }
    const r = rango(n)
    const metodo = n.es_contenedor ? null : (n.metodo_avance ? METODO_ARBOL[n.metodo_avance] ?? n.metodo_avance : null)
    return {
      id: n.id,
      padreId: n.padre_id,
      nivel,
      profundidad: PROF[nivel],
      codigo: codigo.get(n.id) ?? '',
      nombre: n.nombre,
      esContenedor: n.es_contenedor,
      tieneHijas: hijas.length > 0,
      nSubtareas: n.es_contenedor ? 0 : hijas.length,
      uniCant: n.es_contenedor ? null : rotuloUniCant(n.unidad, n.cantidad_objetivo),
      pond,
      plan: rotuloPlan(r.ini, r.fin),
      dias: n.es_contenedor ? (r.ini && r.fin ? diasHabilesEntre(r.ini, r.fin) : null) : diasTeoricos(n),
      metodo,
      metodoFalta: !n.es_contenedor && !n.metodo_avance,
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
