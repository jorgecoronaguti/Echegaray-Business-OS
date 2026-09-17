// LAS TRES LECTURAS DEL RÓTULO DE $/H DEL LEGAJO. La regla está en `valorHoraDelLegajo.ts`.
//
// ═══ SIN PERMISO NO SE VIAJA ═══
//
// Las tres tablas tienen RLS por `liquida_sueldos()` y el jefe de obra abre este legajo: para él la
// respuesta sería un 200 con cero filas. Se corta ANTES de armar la consulta —el mismo criterio que
// la cuenta y las anotaciones en `[id]/page.tsx`— y el rótulo lo dice con todas las letras. Esto es
// la puerta; la cerradura sigue siendo la policy, que también corta una llamada directa a PostgREST.
//
// ═══ SE PIDE LO DE UNA PERSONA, NO EL PLANTEL ═══
//
// `leerRecibosDeSueldo` trae hasta 5.000 líneas porque la liquidación compara a todos contra todos.
// Acá se abre el legajo de UNA persona, muchas veces por día: la consulta filtra por su id o su CUIL
// y la escala, por su categoría. Un legajo no paga la consulta del módulo entero.

import { clave, exponerAlPiso, type FilaEscala } from './exposicionConvenio.ts'
import { cuilNormalizado } from './cuil.ts'
import { rotuloDeValorHora, type PisoDelLegajo, type ReciboDelLegajo, type RotuloValorHora, type TarifaDelLegajo } from './valorHoraDelLegajo.ts'
import { periodoOrdenable } from './reglasDelRecibo.ts'
import type { SupabaseClient } from '@supabase/supabase-js'

/** La tabla todavía no existe en este entorno: no es un error que haya que mostrar. */
const sinTabla = (e: { code?: string; message: string }): boolean =>
  e.code === '42P01' || /does not exist/i.test(e.message)

const numero = (v: unknown): number | null =>
  v == null || !Number.isFinite(Number(v)) ? null : Number(v)

const texto = (v: unknown): string | null =>
  typeof v === 'string' && v.trim() !== '' ? v : null

export interface PersonaDelRotulo {
  personaId: string
  cuil: string | null
  /** `personas.categoria`, tal cual está en el legajo. */
  categoria: string | null
  convenio: string | null
  /** `liquidaSueldos(rol)` del que mira. */
  puedeVer: boolean
  /** El día se fija en el servidor: en el navegador la tarifa vigente cambiaría con la medianoche. */
  hoy: string
}

/**
 * EL RÓTULO DE $/H DE UNA PERSONA.
 *
 * `error` junta lo que no se pudo leer. Una lectura que falló NO se dibuja como un dato ausente: el
 * aviso de la ficha lo dice, y el rótulo escribe su «falta» al lado, que es lo único cierto.
 */
export async function getValorHoraDelLegajo(
  supabase: SupabaseClient, p: PersonaDelRotulo,
): Promise<{ rotulo: RotuloValorHora; error: string | null }> {
  const base = {
    puedeVer: p.puedeVer, tarifas: [] as TarifaDelLegajo[], recibo: null,
    piso: null, categoria: p.categoria, hoy: p.hoy,
  }
  if (!p.puedeVer) return { rotulo: rotuloDeValorHora(base), error: null }

  const cuil = cuilNormalizado(p.cuil)
  const [tarifas, recibos, escala, cct] = await Promise.all([
    supabase.from('persona_tarifa')
      .select('desde, valor_hora, neto_mensual, origen').eq('persona_id', p.personaId),
    // EL RECIBO SE ENGANCHA POR PERSONA O POR CUIL: la línea que carga el estudio no siempre trae
    // `persona_id`, y el CUIL es la llave con la que llega. Sin el `or`, media plantilla se vería
    // «sin recibo cargado» teniendo uno.
    supabase.from('recibo_sueldo_linea')
      .select('periodo, categoria, valor_hora')
      .or(cuil ? `persona_id.eq.${p.personaId},cuil.eq.${cuil}` : `persona_id.eq.${p.personaId}`),
    ...leerEscalasDelPiso(supabase, p.hoy),
  ])

  const fallas: string[] = []
  const anotar = (que: string, e: { code?: string; message: string } | null) => {
    if (!e || sinTabla(e)) return
    // UN MENSAJE VACÍO NO ES UN MENSAJE: PostgREST devuelve 403 con `message: ""` cuando falta el
    // GRANT, y un aviso en blanco manda a leer los logs para descubrir que la tabla está cerrada.
    fallas.push(`${que}: ${e.message?.trim() || `la base rechazó la consulta${e.code ? ` (${e.code})` : ''}`}`)
  }
  anotar('el $/h pactado', tarifas.error)
  anotar('el recibo de sueldo', recibos.error)
  anotar('la escala del convenio', escala.error)
  anotar('la escala del CCT', cct.error)

  return {
    rotulo: rotuloDeValorHora({
      ...base,
      tarifas: filasDeTarifa(tarifas.data),
      recibo: ultimoReciboDe(recibos.data),
      piso: pisoDe(escala.data, cct.data, p),
    }),
    error: fallas.length === 0 ? null : fallas.join(' · '),
  }
}

/** Las dos escalas del piso, una vez. La solapa Retribución del plantel las pide igual para todos. */
export function leerEscalasDelPiso(supabase: SupabaseClient, hoy: string) {
  return [
    supabase.from('convenio_escala').select('convenio, categoria, desde, valor_hora, fuente').lte('desde', hoy),
    // La escala del CCT que el OS ya tiene. NO es el piso de nadie hasta que alguien la firme: el
    // rótulo la nombra distinto (ver `valorHoraDelLegajo.ts`).
    supabase.from('uocra_escala')
      .select('categoria, basico_hora, vigencia_desde, cct, fuente')
      .eq('zona', 'A').lte('vigencia_desde', hoy)
      .order('vigencia_desde', { ascending: false }).limit(40),
  ] as const
}

export function filasDeTarifa(data: unknown): TarifaDelLegajo[] {
  return ((data ?? []) as Record<string, unknown>[]).map((f) => ({
    desde: String(f.desde ?? '').slice(0, 10),
    valorHora: numero(f.valor_hora),
    netoMensual: numero(f.neto_mensual),
    origen: texto(f.origen),
  })).filter((t) => t.desde !== '')
}

/**
 * EL RECIBO REAL MÁS NUEVO. Se ordena por `periodoOrdenable` —la misma función que usa la
 * liquidación— y no por el texto crudo: `Q2-08/2026` es MENOR que `Q1-09/2026` y con `>` de string
 * sería al revés. Sin `valor_hora` la línea no sirve acá: lo que se muestra es el $/h.
 */
export function ultimoReciboDe(data: unknown): ReciboDelLegajo | null {
  let mejor: ReciboDelLegajo | null = null
  for (const f of (data ?? []) as Record<string, unknown>[]) {
    const periodo = String(f.periodo ?? '')
    const orden = periodoOrdenable(periodo)
    if (orden === '' || numero(f.valor_hora) == null) continue
    if (mejor && periodoOrdenable(mejor.periodo) >= orden) continue
    mejor = { periodo, categoria: texto(f.categoria), valorHora: numero(f.valor_hora) }
  }
  return mejor
}

/**
 * EL BÁSICO DE SU CATEGORÍA: primero la escala FIRMADA de su convenio, y sólo si no hay, el CCT que
 * el OS ya tenía cargado — marcado como lo que es.
 *
 * El piso firmado lo resuelve `exponerAlPiso` y no una copia: ahí vive la regla del convenio
 * supuesto («todos los obreros son UOCRA») y escribirla de nuevo acá daría dos respuestas a la
 * misma pregunta. Las horas esperadas van en 0 porque acá no se cotiza regularizar a nadie.
 */
export function pisoDe(escalaData: unknown, cctData: unknown, p: PersonaDelRotulo): PisoDelLegajo | null {
  const escalas: FilaEscala[] = ((escalaData ?? []) as Record<string, unknown>[]).map((e) => ({
    convenio: String(e.convenio ?? ''), categoria: String(e.categoria ?? ''),
    desde: String(e.desde ?? '').slice(0, 10), valorHora: Number(e.valor_hora),
    fuente: String(e.fuente ?? 'sin fuente declarada'),
  }))
  const firmado = exponerAlPiso(
    {
      personaId: p.personaId, nombre: '', convenio: p.convenio, categoria: p.categoria,
      valorHora: null, origenTarifa: null,
    },
    escalas, p.hoy, 0,
  ).piso
  if (firmado) return { ...firmado, origen: 'convenio' }

  const cat = clave(p.categoria)
  if (cat === '') return null
  // Las filas llegan ordenadas por vigencia descendente: la primera de su categoría es la vigente.
  for (const f of (cctData ?? []) as Record<string, unknown>[]) {
    if (clave(String(f.categoria ?? '')) !== cat) continue
    const valorHora = numero(f.basico_hora)
    if (valorHora == null || valorHora <= 0) continue
    return {
      valorHora, desde: String(f.vigencia_desde ?? '').slice(0, 10), origen: 'cct',
      fuente: `uocra_escala · CCT ${texto(f.cct) ?? '76/75'} · ${texto(f.fuente) ?? 'sin fuente declarada'}`,
    }
  }
  return null
}
