// LAS LECTURAS DE LA CARGA ÚNICA DE ASISTENCIA. Ni una regla: qué significa cada fila lo decide
// `cargaDeAsistencia.ts`. Y ni una escritura: esta pantalla escribe sólo por las acciones que ya
// existían (`guardarPresencia`, `quitarPresencia`, `marcarTardanza`, `guardarJornada`,
// `cambiarObraActual`).
//
// Quién ve qué lo decide la RLS de cada tabla, igual que en `jornadaPorObraService.ts`: un jefe de obra
// ve las obras que tiene asignadas; Administración, todas.
//
// ═══ UNA LECTURA QUE FALLA NO ES UN DÍA VACÍO ═══
//
// Si `asistencia_dia` o `registros_hh` no se pueden leer, la pantalla NO se dibuja: mostraría a todo
// el plantel «sin marcar» y sin horas, e invitaría a marcar de nuevo lo que ya estaba declarado. Las
// asignaciones y los puestos, en cambio, sólo mueven de grupo: su fallo se dice y la lista sigue.

import type { SupabaseClient } from '@supabase/supabase-js'
import { quincenaCerrada } from './quincenaCerradaService.ts'
import { esJefeDeObra, sinDireccion } from './vocabularioPersona.ts'
import { getCertificadosDeLicencia } from '../../documentos/services/certificadosDeLicenciaService.ts'
import { certificadosPorPersonaYDia } from '../../documentos/services/certificadoDeLicencia.ts'
import type {
  AsignacionDelDia, HoraDelDiaConObra, PersonaDeLaCarga, PresenciaDelDiaConObra,
} from './cargaDeAsistencia.ts'
import type { EstadoPresencia } from './presenciaDelDia.ts'

export interface ObraDeLaCarga { id: string; nombre: string; activa: boolean }

export interface DatosDeLaCarga {
  personas: PersonaDeLaCarga[]
  presencias: PresenciaDelDiaConObra[]
  horas: HoraDelDiaConObra[]
  asignaciones: AsignacionDelDia[]
  obras: ObraDeLaCarga[]
  /** El texto de `quincenaCerrada`, o `null` si el día se puede escribir. */
  cierre: string | null
  /** `persona_id` → certificado médico que cubre el día (L2). Se muestra; no crea ninguna licencia. */
  certificados: Record<string, string>
  /** Lo que no se pudo leer y no impide dibujar la pantalla. */
  avisos: string[]
}

const ESTADOS: readonly string[] = ['presente', 'ausente', 'licencia']

const sinColumnaTardanza = (e: { code?: string; message: string }): boolean =>
  e.code === '42703' || e.code === 'PGRST204' || /llego_tarde|salio_antes/i.test(e.message)

async function leerPresencias(
  supabase: SupabaseClient, fecha: string,
): Promise<{ data: PresenciaDelDiaConObra[]; error: string | null }> {
  const leer = (campos: string) => supabase.from('asistencia_dia').select(campos).eq('fecha', fecha)
  let r = await leer('persona_id, obra_canonica_id, estado, motivo, llego_tarde, salio_antes')
  // Mientras `20260915T2220` no esté aplicada la tardanza no existe: se relee sin ella, como en
  // `getPresenciaDelDia`.
  if (r.error && sinColumnaTardanza(r.error)) r = await leer('persona_id, obra_canonica_id, estado, motivo')
  if (r.error) return { data: [], error: r.error.message }
  const filas = (r.data ?? []) as unknown as {
    persona_id: string; obra_canonica_id: string | null; estado: string; motivo: string | null
    llego_tarde?: boolean; salio_antes?: boolean
  }[]
  return {
    data: filas.filter((f) => ESTADOS.includes(f.estado)).map((f) => ({
      persona_id: f.persona_id,
      obra_canonica_id: f.obra_canonica_id,
      estado: f.estado as EstadoPresencia,
      motivo: f.motivo,
      llego_tarde: f.llego_tarde === true,
      salio_antes: f.salio_antes === true,
    })),
    error: null,
  }
}

export async function getCargaDelDia(
  supabase: SupabaseClient, fecha: string,
): Promise<{ data: DatosDeLaCarga | null; error: string | null }> {
  const [plantel, presencias, horas, asignaciones, obras, cierre, certificados] = await Promise.all([
    // EL PLANTEL ES `en_la_empresa`, no la fecha de egreso — mismo criterio que la solapa Plantel.
    supabase.from('persona_directorio').select('id, nombre_completo, categoria, puesto')
      .eq('en_la_empresa', true).order('nombre_completo'),
    leerPresencias(supabase, fecha),
    supabase.from('registros_hh').select('persona_id, obra_canonica_id, horas, tipo_hora')
      .eq('fecha', fecha).not('persona_id', 'is', null),
    supabase.from('obra_asignacion').select('persona_id, obra_id, desde, hasta'),
    supabase.from('obra_canonica').select('id, nombre, estado').order('nombre'),
    quincenaCerrada(supabase, fecha),
    getCertificadosDeLicencia(supabase, { desde: fecha, hasta: fecha }),
  ])
  if (plantel.error) return { data: null, error: `No pude leer el plantel: ${plantel.error.message}` }
  if (presencias.error) return { data: null, error: `No pude leer la presencia del día: ${presencias.error}` }
  if (horas.error) return { data: null, error: `No pude leer las horas del día: ${horas.error.message}` }

  const avisos: string[] = []
  if (asignaciones.error) avisos.push(`No pude leer las asignaciones: quien no tiene marca ni horas aparece «Sin obra». (${asignaciones.error.message})`)
  if (certificados.error) avisos.push(`No pude leer los certificados médicos del día. (${certificados.error})`)
  if (obras.error) avisos.push(`No pude leer las obras: los grupos muestran el id. (${obras.error.message})`)

  return {
    data: {
      // DIRECCIÓN NO SE MARCA PRESENTE NI AUSENTE: no es plantel operativo y nadie le toma
      // asistencia. `sinDireccion` en la lectura, como en todo el módulo.
      personas: sinDireccion((plantel.data ?? []) as { id: string; nombre_completo: string; categoria: string | null; puesto: string | null }[])
        .map((p) => ({
          id: p.id,
          nombre: p.nombre_completo,
          categoria: (p.categoria ?? '').trim().replace('_', ' ') || null,
          esJefe: esJefeDeObra(p.puesto),
        })),
      presencias: presencias.data,
      horas: ((horas.data ?? []) as { persona_id: string; obra_canonica_id: string | null; horas: number | string; tipo_hora: string }[])
        .map((h) => ({ ...h, horas: Number(h.horas) })),
      asignaciones: asignaciones.error ? [] : (asignaciones.data ?? []) as AsignacionDelDia[],
      obras: ((obras.data ?? []) as { id: string; nombre: string; estado: string | null }[])
        .map((o) => ({ id: o.id, nombre: o.nombre, activa: o.estado === 'activa' })),
      cierre,
      certificados: Object.fromEntries(Object.entries(certificadosPorPersonaYDia(certificados.data, [fecha]))
        .map(([clave, nombre]) => [clave.split('|')[0], nombre])),
      avisos,
    },
    error: null,
  }
}
