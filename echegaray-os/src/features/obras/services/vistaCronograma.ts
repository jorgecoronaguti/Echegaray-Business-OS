// LAS TRES VISTAS DE LA 07 — qué filas se dibujan y en qué orden.
//
// Está separada del componente por la misma razón que la escala: es la decisión que se equivoca en
// silencio. Una vista que filtra de más no da error: da un cronograma más corto, y nadie extraña
// el frente que no está.

import { claveDeGrupo, SIN_GRUPO } from './cronograma.ts'
import type { Cronograma, FilaCronograma } from './cronogramaMotor.ts'

export type Vista = 'actividades' | 'frente' | 'critico'
export const VISTAS: Vista[] = ['actividades', 'frente', 'critico']
export const VISTA_LABEL: Record<Vista, string> = {
  actividades: 'Actividades', frente: 'Por frente', critico: 'Sólo camino crítico',
}
export const esVista = (v: string | undefined): v is Vista => VISTAS.includes(v as Vista)

export interface FilaVista {
  clave: string
  nivel: 0 | 1
  nombre: string
  /** null en las cabeceras de frente: un frente no es una actividad y no se puede arrastrar. */
  actividadId: string | null
  inicio: string | null
  fin: string | null
  /** El fin del plan cuando la vista es proyección y la proyección se corrió: dibuja el tramo
   *  amarillo entre uno y otro. `null` cuando no hay desvío que mostrar. */
  finPlan: string | null
  /** LA LÍNEA BASE — contra qué se mide el desvío. La escribe el sellado y NADA más: ni el
   *  arrastre, ni la edición de duración, ni la proyección. Sin sellar es `null` en las dos puntas,
   *  y ahí no hay desvío que calcular: la capa no dibuja nada en vez de dibujar la barra actual
   *  como si fuera la prometida. */
  inicioBase: string | null
  finBase: string | null
  /** Días de desvío contra la línea base, con signo. `null` = sin base sellada, que NO es «en
   *  fecha»: es que nadie prometió una fecha contra la cual estar en fecha. */
  desvio: number | null
  duracion: number | null
  avancePct: number | null
  critica: boolean
  sinPlan: boolean
  esHito: boolean
  tieneImpedimento: boolean
  nHijas: number
}

const num = (v: number | string | null | undefined): number | null =>
  v === null || v === undefined || v === '' ? null : Number(v)

const soloFecha = (f: string | null): string | null => (f ? f.slice(0, 10) : null)

/** Cómo se mide el desvío contra la base. Lo inyecta la página con el calendario de la obra: acá
 *  no se sabe qué días trabaja esta obra, y contar corridos convertiría un fin de semana en dos
 *  días de atraso. Sin función, no hay desvío — nunca 0. */
export type DesvioDe = (finBase: string, fin: string) => number | null

function deActividad(a: FilaCronograma, nivel: 0 | 1, desvioDe?: DesvioDe): FilaVista {
  const finBase = soloFecha(a.fin_base)
  return {
    clave: a.actividad_id,
    nivel,
    nombre: a.nombre,
    actividadId: a.actividad_id,
    inicio: a.inicio_calculado,
    fin: a.fin_calculado,
    finPlan: soloFecha(a.fin_plan),
    inicioBase: soloFecha(a.inicio_base),
    finBase,
    desvio: finBase && a.fin_calculado && desvioDe ? desvioDe(finBase, a.fin_calculado) : null,
    duracion: a.duracion,
    avancePct: num(a.avance_pct),
    critica: a.critica,
    sinPlan: a.sin_plan,
    esHito: a.tipo === 'hito',
    tieneImpedimento: (num(a.impedimentos_abiertos) ?? 0) > 0,
    nHijas: 0,
  }
}

/** La cabecera de un frente NO trae fechas propias: las deriva de sus hijas. La fila de resumen
 *  del tracker sí tiene fechas guardadas y están podridas —«Encofrado» dice 100 % con una hija en
 *  0—, así que se ignoran a propósito. */
function cabecera(clave: string, hijas: FilaVista[]): FilaVista {
  const inicios = hijas.map((h) => h.inicio).filter((x): x is string => Boolean(x)).sort()
  const fines = hijas.map((h) => h.fin).filter((x): x is string => Boolean(x)).sort()
  const iniciosBase = hijas.map((h) => h.inicioBase).filter((x): x is string => Boolean(x)).sort()
  const finesBase = hijas.map((h) => h.finBase).filter((x): x is string => Boolean(x)).sort()
  const conAvance = hijas.filter((h) => h.avancePct != null)
  // EL DESVÍO DEL FRENTE ES EL PEOR DE SUS HIJAS, no el promedio: un frente donde una actividad
  // atrasa quince días y tres van en fecha atrasa quince días. Promediarlo lo diría «+4».
  const desvios = hijas.map((h) => h.desvio).filter((x): x is number => x != null)
  return {
    clave: `grupo:${clave}`,
    nivel: 0,
    nombre: clave === SIN_GRUPO ? 'Sin clasificar' : clave,
    actividadId: null,
    inicio: inicios[0] ?? null,
    fin: fines.at(-1) ?? null,
    finPlan: null,
    inicioBase: iniciosBase[0] ?? null,
    finBase: finesBase.at(-1) ?? null,
    desvio: desvios.length ? Math.max(...desvios) : null,
    duracion: null,
    avancePct: conAvance.length
      ? Math.round(conAvance.reduce((a, h) => a + h.avancePct!, 0) / conAvance.length)
      : null,
    critica: hijas.some((h) => h.critica),
    sinPlan: hijas.every((h) => h.sinPlan),
    esHito: false,
    tieneImpedimento: hijas.some((h) => h.tieneImpedimento),
    nHijas: hijas.length,
  }
}

/**
 * QUÉ FILAS SE DIBUJAN.
 *
 * `actividades` — todas, planas, en el orden del plan.
 * `frente` — una cabecera por frente con sus actividades debajo.
 * `critico` — sólo las que no tienen holgura. Cuando la obra no tiene secuencia cargada esta vista
 *   queda VACÍA a propósito: sin dependencias, «crítica» sólo querría decir «la más larga», y
 *   pintar de naranja la actividad más larga de una lista es inventar un camino crítico.
 */
export function filasDeVista(cronograma: Cronograma, vista: Vista, desvioDe?: DesvioDe): FilaVista[] {
  const actividades = cronograma.actividades
  if (vista === 'critico') {
    const criticas = new Set(cronograma.criticas)
    return actividades.filter((a) => criticas.has(a.actividad_id)).map((a) => deActividad(a, 1, desvioDe))
  }
  if (vista === 'actividades') return actividades.map((a) => deActividad(a, 1, desvioDe))

  const porFrente = new Map<string, FilaVista[]>()
  for (const a of actividades) {
    const k = claveDeGrupo(a)
    const lista = porFrente.get(k) ?? []
    lista.push(deActividad(a, 1, desvioDe))
    porFrente.set(k, lista)
  }
  const salida: FilaVista[] = []
  for (const [clave, hijas] of porFrente) {
    salida.push(cabecera(clave, hijas))
    salida.push(...hijas)
  }
  return salida
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// LA URL ES EL ESTADO, Y SE ARMA EN UN SOLO LUGAR
//
// La página (servidor) y el lienzo (navegador) construyen los mismos links. La primera versión
// pasaba el constructor como prop y React lo rechaza: una función no cruza la frontera
// servidor→cliente, y el síntoma no es un link roto sino la pantalla entera en «A server error
// occurred». Con el estado plano y el constructor puro, los dos lados arman el mismo link y esto
// se puede probar sin navegador.

import type { UnidadEscala } from './escalaCronograma.ts'

export interface EstadoUrl {
  vista: Vista
  escala: UnidadEscala
  sel: string | null
  mover: number | null
  proyeccion: boolean
  /** La capa de línea base. Encendida por defecto: lo prometido es contra qué se lee todo lo demás,
   *  y una pantalla que arranca sin la referencia deja el desvío invisible hasta que alguien
   *  descubre el interruptor. */
  base: boolean
}

/** Los valores por defecto NO se escriben en la URL: `/obras/messina/cronograma` tiene que poder
 *  compartirse sin arrastrar tres parámetros que no dicen nada. */
export function hrefCronograma(obraId: string, base: EstadoUrl, cambios: Partial<EstadoUrl> = {}): string {
  const e = { ...base, ...cambios }
  const q = new URLSearchParams()
  if (e.vista !== 'actividades') q.set('vista', e.vista)
  if (e.escala !== 'semana') q.set('escala', e.escala)
  if (e.sel) q.set('sel', e.sel)
  if (e.mover) q.set('mover', String(e.mover))
  if (e.proyeccion) q.set('proyeccion', '1')
  if (!e.base) q.set('base', '0')
  const s = q.toString()
  return `/obras/${obraId}/cronograma${s ? `?${s}` : ''}`
}
