// LA LECTURA DEL PLANTEL DE UNA QUINCENA, PARA LAS PANTALLAS QUE NO LEEN LA ACTIVIDAD POR SU CUENTA.
//
// La regla vive en `plantelDeLaQuincena` (pura). La liquidación la aplica con lo que ya leyó; Convenios,
// Recibos y la semana de asistencia piden esto. Ni una escritura.
//
// ═══ POR `persona_directorio`, NO POR `persona_plantel` ═══
//
// `persona_plantel` publica sólo a quien está hoy en la empresa: con ella una quincena vieja no podría
// nombrar a una baja. `persona_directorio` publica a todos, con `fecha_ingreso` y `fecha_egreso`, y ya
// saca `es_prueba` (salvo sesión de prueba). No se tocó ninguna política.

import type { SupabaseClient } from '@supabase/supabase-js'
import { plantelDeLaQuincena, type ActividadDeLaQuincena, type PersonaDelPlantel } from './liquidacionPlantelActivo.ts'
import { leerRegistrosHH } from './registrosHHService.ts'
import { laSesionEsDePrueba, leerCuilesDelLegajo } from './lecturasCompartidasDeQuincena.ts'
import { periodoDeRecibo } from './liquidacionCuadros.ts'
import type { Quincena } from './quincena.ts'

const sinTabla = (e: { code?: string; message: string }): boolean =>
  e.code === '42P01' || /does not exist/i.test(e.message)

export interface PersonaDelDirectorio extends PersonaDelPlantel {
  fechaIngreso: string | null
  fechaEgreso: string | null
}

/** `persona_directorio` → lo que la regla necesita. */
export function personaDelDirectorio(r: {
  id: string; nombre_completo: string | null; en_la_empresa: boolean | null
  fecha_ingreso?: string | null; fecha_egreso?: string | null
}): PersonaDelDirectorio {
  return {
    id: r.id, nombre: (r.nombre_completo ?? '').trim(), enLaEmpresa: r.en_la_empresa === true,
    fechaIngreso: r.fecha_ingreso ? String(r.fecha_ingreso).slice(0, 10) : null,
    fechaEgreso: r.fecha_egreso ? String(r.fecha_egreso).slice(0, 10) : null,
  }
}

export interface PlantelLeido {
  personas: PersonaDelDirectorio[]
  ids: Set<string>
  errores: { que: string; error: string }[]
}

/** LAS SEIS LECTURAS EN UNA TANDA, y la regla. */
export async function leerPlantelDeLaQuincena(supabase: SupabaseClient, q: Quincena): Promise<PlantelLeido> {
  const [directorio, registros, lineas, recibos, jornales, cuiles, deprueba] = await Promise.all([
    supabase.from('persona_directorio').select('id, nombre_completo, en_la_empresa, fecha_ingreso, fecha_egreso'),
    leerRegistrosHH(supabase, { desde: q.desde, hasta: q.hasta, columnas: 'persona_id, fecha' }),
    supabase.from('liquidacion_quincena').select('liquidacion_linea(persona_id)').eq('desde', q.desde).eq('hasta', q.hasta),
    supabase.from('recibo_sueldo_linea').select('persona_id, cuil').eq('periodo', periodoDeRecibo(q)),
    supabase.from('jornales_bloque_persona').select('persona_id').eq('quincena_desde', q.desde),
    leerCuilesDelLegajo(supabase),
    laSesionEsDePrueba(supabase),
  ])
  const errores: { que: string; error: string }[] = []
  const anotar = (que: string, e: { code?: string; message: string } | null) => {
    if (e && !sinTabla(e)) errores.push({ que, error: e.message?.trim() || `la base rechazó la consulta (${e.code ?? 'sin código'})` })
  }
  anotar('el plantel', directorio.error)
  anotar('las horas de la quincena', registros.error ? { message: registros.error } : null)
  anotar('las líneas de liquidación', lineas.error)
  anotar('los recibos de sueldo', recibos.error)
  anotar('el espejo de JORNALES', jornales.error)
  const personaDeCuil = new Map(((cuiles.data ?? []) as { id: string; cuil: string | null }[])
    .filter((c) => c.cuil).map((c) => [c.cuil as string, c.id]))
  const actividad: ActividadDeLaQuincena = {
    conHoras: new Set(((registros.data ?? []) as { persona_id: string | null }[]).map((r) => r.persona_id).filter((x): x is string => !!x)),
    conLinea: new Set(((lineas.data ?? []) as { liquidacion_linea: { persona_id: string }[] | null }[])
      .flatMap((c) => (c.liquidacion_linea ?? []).map((l) => l.persona_id))),
    conRecibo: new Set(((recibos.data ?? []) as { persona_id: string | null; cuil: string | null }[])
      .map((r) => r.persona_id ?? (r.cuil ? personaDeCuil.get(r.cuil) : undefined)).filter((x): x is string => !!x)),
    conJornales: new Set(((jornales.data ?? []) as { persona_id: string | null }[]).map((r) => r.persona_id).filter((x): x is string => !!x)),
  }
  const personas = ((directorio.data ?? []) as Parameters<typeof personaDelDirectorio>[0][]).map(personaDelDirectorio)
  const { activas } = plantelDeLaQuincena(personas, q, actividad, deprueba)
  return { personas: activas, ids: new Set(activas.map((p) => p.id)), errores }
}
