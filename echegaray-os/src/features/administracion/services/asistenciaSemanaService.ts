// LO QUE LEE LA GRILLA SEMANAL DE ASISTENCIA — y de dónde.
//
// Cuatro fuentes, ninguna nueva:
//
//   `persona_directorio`          quién está en el plantel hoy (la fila existe aunque no haya marcado).
//   `presencia_del_dia`           las dos puntas de cada día. LA MISMA vista que usa «En obra ahora»:
//                                 dos consultas distintas contra `asistencia_marca` darían dos
//                                 verdades sobre la misma jornada.
//   `registros_hh`                lo DECLARADO — ausencia y licencia. Es lo único que puede afirmar
//                                 una falta; sin marcas no se afirma nada.
//   `calendario_no_laborable`     los feriados.
//
// Acá no hay un solo filtro por rol: quién ve qué lo deciden las policies, igual que en
// `presenciaService`. Y toda la derivación vive en `asistenciaSemana.ts`, que no toca la base.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { ServiceResult } from '@/features/auth/services/authService'
import type { DeclaracionPersona, MarcaDia, PersonaSemana } from './asistenciaSemana'
import { diaDe } from './asistenciaSemana'

/** La vista de presencia. Si falta, la pantalla lo dice CON SU NOMBRE: una grilla vacía se leería
 *  como «no marcó nadie en toda la semana», que es una afirmación distinta y falsa. */
export const MIGRACION = '20260820T7000_donde_empezo_la_jornada'

const faltaLaVista = (e: { code?: string } | null | undefined) =>
  e?.code === '42P01' || e?.code === 'PGRST205' || e?.code === '42703'

export interface DatosSemana {
  personas: PersonaSemana[]
  marcas: MarcaDia[]
  declaraciones: DeclaracionPersona[]
  noLaborables: string[]
  correccionesPendientes: string[]
  jornadaPorObra: Record<string, number>
  /** Fechas con algún dato — decide si la columna del sábado se dibuja. */
  fechasConDato: string[]
}

type FilaPresencia = {
  persona_id: string
  fecha: string
  obra_id: string | null
  entrada: string | null
  salida: string | null
}

/** El plantel de la grilla: quien está en la empresa. Ordenado por nombre — es la lista que se
 *  recorre con el dedo, no un ranking. */
async function getPlantel(supabase: SupabaseClient): Promise<PersonaSemana[]> {
  const { data } = await supabase
    .from('persona_directorio').select('id, nombre_completo, categoria')
    .eq('en_la_empresa', true).order('nombre_completo')
  return ((data ?? []) as { id: string; nombre_completo: string; categoria: string | null }[])
    .map((p) => ({ persona_id: p.id, nombre_completo: p.nombre_completo, categoria: p.categoria }))
}

/** La jornada pactada de cada obra donde se marcó. Sin este dato NO se declara «hora extra»: el
 *  umbral sería un 8 hardcodeado, y hay obras que pactan otra jornada (`obra_canonica.jornada_horas`). */
async function getJornadaPorObra(
  supabase: SupabaseClient, obraIds: string[],
): Promise<Record<string, number>> {
  if (obraIds.length === 0) return {}
  const { data } = await supabase
    .from('obra_canonica').select('id, jornada_horas').in('id', obraIds)
  const mapa: Record<string, number> = {}
  for (const o of (data ?? []) as { id: string; jornada_horas: number | string | null }[]) {
    const h = Number(o.jornada_horas)
    if (Number.isFinite(h) && h > 0) mapa[o.id] = h
  }
  return mapa
}

/**
 * QUIÉN TIENE UN PEDIDO DE CORRECCIÓN SIN RESOLVER EN ESTA SEMANA.
 *
 * Se lee de `correccion_asistencia_bandeja` —la misma vista que la bandeja de Administración— para
 * que «pendiente» signifique exactamente lo mismo en las dos pantallas. `fecha` es el día que se
 * corrige, no el día en que se pidió: alguien puede pedir el lunes la corrección del viernes.
 */
async function getPendientes(
  supabase: SupabaseClient, desde: string, hasta: string,
): Promise<string[]> {
  const { data } = await supabase
    .from('correccion_asistencia_bandeja').select('persona_id')
    .eq('estado', 'pendiente').gte('fecha', desde).lte('fecha', hasta)
  return [...new Set(((data ?? []) as { persona_id: string }[]).map((s) => s.persona_id))]
}

/** Los feriados que valen para TODOS. Los de `alcance = 'obra'` quedan afuera a propósito: aplicarlos
 *  exigiría saber en qué obra estaba cada persona ese día, y una persona sin asignación vigente
 *  quedaría marcada feriado o laborable según una obra que no es la suya. */
async function getNoLaborables(
  supabase: SupabaseClient, desde: string, hasta: string,
): Promise<string[]> {
  const { data } = await supabase
    .from('calendario_no_laborable').select('fecha, alcance')
    .gte('fecha', desde).lte('fecha', hasta).neq('alcance', 'obra')
  return ((data ?? []) as { fecha: string }[]).map((f) => f.fecha)
}

export async function getDatosSemana(
  supabase: SupabaseClient, desde: string, hasta: string,
): Promise<ServiceResult<DatosSemana>> {
  const presencia = await supabase
    .from('presencia_del_dia').select('persona_id, fecha, obra_id, entrada, salida')
    .gte('fecha', desde).lte('fecha', hasta)
  if (presencia.error) {
    if (faltaLaVista(presencia.error)) {
      return {
        data: null,
        error: `Todavía no puedo mostrar la asistencia de la semana: falta aplicar en la base la migración ${MIGRACION}.`
          + ' No es que no haya marcado nadie — es que esta base no tiene la capacidad todavía.',
      }
    }
    return { data: null, error: presencia.error.message }
  }

  const marcas = ((presencia.data ?? []) as FilaPresencia[]).map((f) => ({
    persona_id: f.persona_id,
    // `fecha` de la vista es un `date` y llega ya en ISO; las puntas son `timestamptz`.
    fecha: diaDe(f.fecha),
    entrada: f.entrada,
    salida: f.salida,
    obra_id: f.obra_id,
  }))

  // Sólo lo que NO es trabajo: las horas trabajadas no pintan la celda —eso lo dice la marca—, y
  // sumar `registros_hh` acá haría que una imputación de 8 horas tapara un día sin fichar.
  const declaradas = await supabase
    .from('registros_hh').select('persona_id, fecha, tipo_hora')
    .gte('fecha', desde).lte('fecha', hasta).in('tipo_hora', ['ausencia', 'licencia'])
    .not('persona_id', 'is', null)

  const [personas, pendientes, noLaborables, jornadaPorObra] = await Promise.all([
    getPlantel(supabase),
    getPendientes(supabase, desde, hasta),
    getNoLaborables(supabase, desde, hasta),
    getJornadaPorObra(supabase, [...new Set(marcas.map((m) => m.obra_id).filter((x): x is string => Boolean(x)))]),
  ])

  const declaraciones = ((declaradas.data ?? []) as { persona_id: string; fecha: string; tipo_hora: string }[])
    .map((d) => ({ persona_id: d.persona_id, fecha: diaDe(d.fecha), tipo_hora: d.tipo_hora }))

  return {
    data: {
      personas,
      marcas,
      declaraciones,
      noLaborables,
      correccionesPendientes: pendientes,
      jornadaPorObra,
      fechasConDato: [...new Set([...marcas.map((m) => m.fecha), ...declaraciones.map((d) => d.fecha)])],
    },
    error: null,
  }
}
