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
  exponerAlPiso, resumenDeExposicion, valorHoraAComparar,
  type FilaEscala, type LineaExposicion, type PersonaExpuesta, type ResumenExposicion,
} from './exposicionConvenio.ts'
import { leerRecibosDeSueldo } from './recibosDeSueldoLineaService.ts'
import { ultimoReciboHasta, type ReciboDeSueldo } from './sueldoBlancoNegro.ts'
import { periodoDeRecibo } from './liquidacionCuadros.ts'
import { horasEsperadasDeQuincena } from './liquidacionQuincena.ts'
import { tarifaVigenteAl, type TarifaVigente } from './liquidacionQuincena.ts'
import type { Quincena } from './quincena.ts'
import { sinIdentidadesDePrueba } from './identidadDePrueba.ts'
import { nombreDePersona } from '../../../shared/personas/nombre.ts'

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
  /**
   * LAS TARIFAS Y LA ESCALA QUE ESTA FUNCIÓN YA LEYÓ, crudas. El historial del valor hora del cuadro
   * de la quincena sale de acá: leerlas otra vez serían dos fotos de `persona_tarifa` en el mismo
   * render, y un historial que no cierra con la marca «bajo el básico» de al lado.
   */
  tarifasPorPersona: Record<string, TarifaVigente[]>
  escalas: FilaEscala[]
  /**
   * LAS LÍNEAS DE RECIBO DE SUELDO, leídas una vez. Acá comparan el $/h del recibo contra el piso; la
   * liquidación las reusa para el blanco y la mediana del neto estimado.
   */
  recibos: ReciboDeSueldo[]
  /** `false` mientras `recibo_sueldo_linea` no exista. */
  hayRecibosDeSueldo: boolean
  errores: { que: string; error: string }[]
}

const sinTabla = (e: { code?: string; message: string }): boolean =>
  e.code === '42P01' || /does not exist/i.test(e.message)

interface FilaLegajo {
  id: string
  nombre_completo: string
  cuil: string | null
  convenio_colectivo: string | null
  categoria: string | null
  en_la_empresa: boolean | null
}

/** LAS CUATRO LECTURAS EN UNA TANDA. Ninguna depende de otra. */
export async function getExposicionDeLaQuincena(
  supabase: SupabaseClient, q: Quincena,
  /**
   * EL PLANTEL DE LA QUINCENA (`leerPlantelDeLaQuincena`). Sin él, todas las personas reales —lo que
   * necesita la liquidación, que decide su plantel después con estas mismas lecturas—. Nunca `en_la_empresa`.
   */
  plantel?: ReadonlySet<string>,
): Promise<ExposicionDeLaQuincena> {
  const [legajo, tarifas, escala, cct, recibos] = await Promise.all([
    supabase.from('persona_legajo')
      .select('id, nombre_completo, nombre_para_mostrar, cuil, convenio_colectivo, categoria, en_la_empresa'),
    supabase.from('persona_tarifa')
      .select('persona_id, desde, valor_hora, neto_mensual, origen').lte('desde', q.hasta),
    supabase.from('convenio_escala')
      .select('convenio, categoria, desde, valor_hora, fuente').lte('desde', q.hasta),
    // La escala del CCT que el OS ya tiene. Sólo alimenta el formulario (ver cabecera).
    supabase.from('uocra_escala')
      .select('categoria, basico_hora, vigencia_desde, zona, cct, fuente')
      .eq('zona', 'A').lte('vigencia_desde', q.hasta)
      .order('vigencia_desde', { ascending: false }).limit(40),
    // EL $/H DEL RECIBO ES EL QUE SE COMPARA CONTRA EL PISO (coordinador, 14/09/2026).
    leerRecibosDeSueldo(supabase),
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
  // SIN LA TABLA NO HAY ERROR (`leerRecibosDeSueldo` lo resuelve); cualquier otro se dice.
  anotar('los recibos de sueldo (blanco)', recibos.error ? { message: recibos.error } : null)

  const escalas: FilaEscala[] = ((escala.data ?? []) as {
    convenio: string; categoria: string; desde: string; valor_hora: number | string; fuente: string
  }[]).map((e) => ({
    convenio: e.convenio, categoria: e.categoria, desde: e.desde,
    valorHora: Number(e.valor_hora), fuente: e.fuente,
  }))

  const horasEsperadas = horasEsperadasDeQuincena(q)
  // LAS IDENTIDADES DE PRUEBA NO SON PERSONAL. `persona_legajo` no filtra `es_prueba` (se creó el
  // 19/08 para otra cosa), así que «[PRUEBA E2E] QA Campo» contaba como uno de los «sin piso» de este
  // cuadro — un conteo de exposición al convenio UOCRA con una persona inventada adentro.
  const personas = personasDelPlantel(
    sinIdentidadesDePrueba(
      (legajo.data ?? []) as { nombre_completo?: string | null; email?: string | null }[],
      (r) => ({ nombre: r.nombre_completo, email: r.email }), // crudo: el filtro de prueba mira el legajo tal cual
    ),
    tarifas.data, q, recibos.filas, plantel,
  )
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
    tarifasPorPersona: tarifasPorPersona(tarifas.data),
    escalas,
    recibos: recibos.filas,
    hayRecibosDeSueldo: recibos.hay,
    errores,
  }
}

function tarifasPorPersona(data: unknown): Record<string, TarifaVigente[]> {
  const out: Record<string, TarifaVigente[]> = {}
  for (const t of (data ?? []) as {
    persona_id: string; desde: string; valor_hora: number | string | null
    neto_mensual: number | string | null; origen: string | null
  }[]) {
    (out[t.persona_id] ??= []).push({
      valorHora: t.valor_hora == null ? null : Number(t.valor_hora),
      netoMensual: t.neto_mensual == null ? null : Number(t.neto_mensual),
      desde: t.desde,
      origen: t.origen ?? 'sin origen declarado',
    })
  }
  return out
}

const ordenarPorUrgencia = (a: LineaExposicion, b: LineaExposicion): number => {
  if (a.bajoElPiso !== b.bajoElPiso) return a.bajoElPiso ? -1 : 1
  if (a.bajoElPiso) return (b.regularizar ?? 0) - (a.regularizar ?? 0)
  const sinA = a.porQueNoSeCompara != null, sinB = b.porQueNoSeCompara != null
  if (sinA !== sinB) return sinA ? 1 : -1
  return a.nombre.localeCompare(b.nombre, 'es')
}

/**
 * El plantel vigente con el $/h que se compara: el de categoría de su último recibo quincenal hasta esta
 * quincena, o el vigente de `persona_tarifa` si no tiene recibo. Los dados de baja no se exponen.
 */
function personasDelPlantel(
  legajo: unknown, tarifas: unknown, q: Quincena, recibos: readonly ReciboDeSueldo[], plantel?: ReadonlySet<string>,
): PersonaExpuesta[] {
  const periodo = periodoDeRecibo(q)
  // EL PLANTEL QUE LA QUINCENA TUVO, NO EL DE HOY (dueño, 14/09/2026).
  const filas = ((legajo ?? []) as FilaLegajo[]).filter((p) => !plantel || plantel.has(p.id))
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
    const recibo = ultimoReciboHasta(recibos, p.id, p.cuil ?? null, periodo)
    const aComparar = valorHoraAComparar(recibo?.valorHora ?? null, vigente?.valorHora ?? null)
    return {
      personaId: p.id,
      nombre: nombreDePersona(p),
      convenio: p.convenio_colectivo,
      categoria: p.categoria,
      valorHora: aComparar.valorHora,
      origenTarifa: aComparar.origen === 'recibo' ? `recibo ${recibo?.periodo}` : (vigente?.origen ?? null),
      origenValorHora: aComparar.origen,
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
