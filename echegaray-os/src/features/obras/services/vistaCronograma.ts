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

function deActividad(a: FilaCronograma, nivel: 0 | 1): FilaVista {
  return {
    clave: a.actividad_id,
    nivel,
    nombre: a.nombre,
    actividadId: a.actividad_id,
    inicio: a.inicio_calculado,
    fin: a.fin_calculado,
    finPlan: soloFecha(a.fin_plan),
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
  const conAvance = hijas.filter((h) => h.avancePct != null)
  return {
    clave: `grupo:${clave}`,
    nivel: 0,
    nombre: clave === SIN_GRUPO ? 'Sin clasificar' : clave,
    actividadId: null,
    inicio: inicios[0] ?? null,
    fin: fines.at(-1) ?? null,
    finPlan: null,
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
export function filasDeVista(cronograma: Cronograma, vista: Vista): FilaVista[] {
  const actividades = cronograma.actividades
  if (vista === 'critico') {
    const criticas = new Set(cronograma.criticas)
    return actividades.filter((a) => criticas.has(a.actividad_id)).map((a) => deActividad(a, 1))
  }
  if (vista === 'actividades') return actividades.map((a) => deActividad(a, 1))

  const porFrente = new Map<string, FilaVista[]>()
  for (const a of actividades) {
    const k = claveDeGrupo(a)
    const lista = porFrente.get(k) ?? []
    lista.push(deActividad(a, 1))
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
  const s = q.toString()
  return `/obras/${obraId}/cronograma${s ? `?${s}` : ''}`
}
