// LAS LECTURAS DE LA EXPOSICIÓN AL CONVENIO. Ni una regla acá: trae filas y nada más.
//
// La decisión de quién está bajo el piso vive en `exposicionConvenio.ts`, que se prueba sin
// Supabase. Este archivo sólo sabe de qué tabla sale cada cosa — y, sobre todo, cuál NO se usa.
//
// ═══ `uocra_escala` SE OFRECE, NO SE APLICA ═══
//
// El OS tiene cargada la escala del CCT 76/75 con su acuerdo y su fecha (`uocra_escala`, poblada por
// `orquestador/lib/uocra-escala.mjs` desde la réplica `_UOCRA_RAW`). Esa tabla NO entra en el
// cálculo del piso: el legajo escribe dos rótulos de convenio —«UOCRA — Ley 22.250 (construcción)» y
// «0076/75 UOCRA»— y decidir que uno de ellos es el CCT 76/75 es una afirmación laboral con plata
// atrás. Viaja como SUGERENCIA del formulario, con su fuente citada, para que una persona la cargue
// en `convenio_escala` con un clic y quede firmada. Es la diferencia entre reusar una fuente y
// suponer una equivalencia.
//
// ═══ UNA FUENTE QUE FALLÓ SE DICE CON SU ERROR ═══
//
// Una escala vacía porque la RLS rechazó la consulta se ve idéntica a una escala sin cargar, y la
// diferencia entre las dos es si la pantalla puede acusar a alguien. Cada lectura devuelve su error.

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  exponerAlPiso, resumenDeExposicion,
  type FilaEscala, type LineaExposicion, type PersonaExpuesta, type ResumenExposicion,
} from './exposicionConvenio.ts'
import { horasEsperadasDeQuincena } from './liquidacionQuincena.ts'
import { tarifaVigenteAl } from './liquidacionQuincena.ts'
import type { Quincena } from './quincena.ts'

/** Una fila de la escala del CCT que el OS ya tiene cargada, lista para prellenar el formulario. */
export interface SugerenciaDeEscala {
  categoria: string
  valorHora: number
  desde: string
  fuente: string
}

export interface ExposicionDeLaQuincena {
  lineas: LineaExposicion[]
  resumen: ResumenExposicion
  /** Horas esperadas de la quincena: el multiplicador del costo de regularizar. */
  horasEsperadas: number
  /** Los rótulos de convenio que aparecen en el plantel, para el selector del formulario. */
  conveniosDelPlantel: string[]
  /** La escala del CCT 76/75 que el OS ya tiene, ofrecida como prellenado. Vacío = no hay ninguna. */
  sugerencia: SugerenciaDeEscala[]
  errores: { que: string; error: string }[]
}

const sinTabla = (e: { code?: string; message: string }): boolean =>
  e.code === '42P01' || /does not exist/i.test(e.message)

interface FilaLegajo {
  id: string
  nombre_completo: string
  convenio_colectivo: string | null
  categoria: string | null
  en_la_empresa: boolean | null
}

/** LAS CUATRO LECTURAS EN UNA TANDA. Ninguna depende de otra. */
export async function getExposicionDeLaQuincena(
  supabase: SupabaseClient, q: Quincena,
): Promise<ExposicionDeLaQuincena> {
  const [legajo, tarifas, escala, cct] = await Promise.all([
    supabase.from('persona_legajo')
      .select('id, nombre_completo, convenio_colectivo, categoria, en_la_empresa'),
    supabase.from('persona_tarifa')
      .select('persona_id, desde, valor_hora, neto_mensual, origen').lte('desde', q.hasta),
    supabase.from('convenio_escala')
      .select('convenio, categoria, desde, valor_hora, fuente').lte('desde', q.hasta),
    // La escala del CCT que el OS ya tiene. Sólo alimenta el formulario (ver cabecera).
    supabase.from('uocra_escala')
      .select('categoria, basico_hora, vigencia_desde, zona, cct, fuente')
      .eq('zona', 'A').lte('vigencia_desde', q.hasta)
      .order('vigencia_desde', { ascending: false }).limit(40),
  ])

  const errores: { que: string; error: string }[] = []
  // UN MENSAJE VACÍO NO ES UN MENSAJE. PostgREST devuelve 403 con `message: ""` cuando falta el
  // GRANT, y un aviso en blanco manda a leer los logs para descubrir que la tabla está cerrada.
  const anotar = (que: string, e: { code?: string; message: string } | null) => {
    if (!e || sinTabla(e)) return
    const texto = e.message?.trim()
    errores.push({
      que,
      error: texto || `la base rechazó la consulta (permiso o GRANT faltante${e.code ? `, código ${e.code}` : ''}).`,
    })
  }
  anotar('el legajo del plantel', legajo.error)
  anotar('las retribuciones', tarifas.error)
  anotar('la escala de los convenios', escala.error)
  anotar('la escala del CCT que ya tiene el OS', cct.error)

  const escalas: FilaEscala[] = ((escala.data ?? []) as {
    convenio: string; categoria: string; desde: string; valor_hora: number | string; fuente: string
  }[]).map((e) => ({
    convenio: e.convenio, categoria: e.categoria, desde: e.desde,
    valorHora: Number(e.valor_hora), fuente: e.fuente,
  }))

  const horasEsperadas = horasEsperadasDeQuincena(q)
  const personas = personasDelPlantel(legajo.data, tarifas.data, q)
  const lineas = personas
    .map((p) => exponerAlPiso(p, escalas, q.hasta, horasEsperadas))
    // LOS QUE ESTÁN BAJO EL PISO PRIMERO, y entre ellos el más caro de regularizar: es el orden en
    // el que se decide. Después los medidos, y al final los que no se pudieron comparar.
    .sort(ordenarPorUrgencia)

  return {
    lineas,
    resumen: resumenDeExposicion(lineas),
    horasEsperadas,
    conveniosDelPlantel: [...new Set(personas.map((p) => p.convenio?.trim()).filter((c): c is string => !!c))].sort(),
    sugerencia: sugerenciaDeEscala(cct.data),
    errores,
  }
}

const ordenarPorUrgencia = (a: LineaExposicion, b: LineaExposicion): number => {
  if (a.bajoElPiso !== b.bajoElPiso) return a.bajoElPiso ? -1 : 1
  if (a.bajoElPiso) return (b.regularizar ?? 0) - (a.regularizar ?? 0)
  const sinA = a.porQueNoSeCompara != null, sinB = b.porQueNoSeCompara != null
  if (sinA !== sinB) return sinA ? 1 : -1
  return a.nombre.localeCompare(b.nombre, 'es')
}

/** El plantel vigente con su $/h de bolsillo. Los dados de baja no se liquidan y no se exponen. */
function personasDelPlantel(
  legajo: unknown, tarifas: unknown, q: Quincena,
): PersonaExpuesta[] {
  const filas = ((legajo ?? []) as FilaLegajo[]).filter((p) => p.en_la_empresa !== false)
  const todas = (tarifas ?? []) as {
    persona_id: string; desde: string; valor_hora: number | null; neto_mensual: number | null; origen: string
  }[]
  return filas.map((p) => {
    const vigente = tarifaVigenteAl(
      todas.filter((t) => t.persona_id === p.id).map((t) => ({
        valorHora: t.valor_hora == null ? null : Number(t.valor_hora),
        netoMensual: t.neto_mensual == null ? null : Number(t.neto_mensual),
        desde: t.desde, origen: t.origen,
      })),
      q.hasta,
    )
    return {
      personaId: p.id,
      nombre: p.nombre_completo,
      convenio: p.convenio_colectivo,
      categoria: p.categoria,
      valorHora: vigente?.valorHora ?? null,
      origenTarifa: vigente?.origen ?? null,
    }
  })
}

/**
 * LA SUGERENCIA: la escala más nueva del CCT que el OS ya tiene, una fila por categoría.
 *
 * El Sereno viene con `basico_hora` en `null` —se paga por mes— y por eso se filtra: una sugerencia
 * sin valor hora prellenaría el formulario con un vacío que parece un dato.
 */
function sugerenciaDeEscala(data: unknown): SugerenciaDeEscala[] {
  const filas = (data ?? []) as {
    categoria: string; basico_hora: number | string | null; vigencia_desde: string
    cct: string | null; fuente: string | null
  }[]
  const porCategoria = new Map<string, SugerenciaDeEscala>()
  for (const f of filas) {
    const valorHora = Number(f.basico_hora)
    if (!Number.isFinite(valorHora) || valorHora <= 0) continue
    // Las filas llegan ordenadas por vigencia descendente: la primera de cada categoría es la nueva.
    if (porCategoria.has(f.categoria)) continue
    porCategoria.set(f.categoria, {
      categoria: f.categoria,
      valorHora,
      desde: f.vigencia_desde,
      fuente: `uocra_escala · CCT ${f.cct ?? '76/75'} · ${f.fuente ?? 'sin fuente declarada'}`,
    })
  }
  return [...porCategoria.values()]
}
