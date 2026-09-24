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

import { cuilNormalizado } from './cuil.ts'
import type { SupabaseClient } from '@supabase/supabase-js'
import { entraAlCuadro, plantelDeLaQuincena, type ActividadDeLaQuincena, type PersonaDelPlantel } from './liquidacionPlantelActivo.ts'
import { tarifaVigenteAl } from './liquidacionQuincena.ts'
import { leerRegistrosHH } from './registrosHHService.ts'
import { laSesionEsDePrueba, leerCuilesDelLegajo, leerSubcontratoDePersonas, subcontratoPorPersona } from './lecturasCompartidasDeQuincena.ts'
import { periodoDeRecibo } from './liquidacionCuadros.ts'
import type { Quincena } from './quincena.ts'
import { esJefeDeObra, sinDireccion } from './vocabularioPersona.ts'
import { nombreDePersonaONull } from '../../../shared/personas/nombre.ts'

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
    id: r.id, nombre: nombreDePersonaONull(r) ?? '', enLaEmpresa: r.en_la_empresa === true,
    fechaIngreso: r.fecha_ingreso ? String(r.fecha_ingreso).slice(0, 10) : null,
    fechaEgreso: r.fecha_egreso ? String(r.fecha_egreso).slice(0, 10) : null,
  }
}

export interface PlantelLeido {
  personas: PersonaDelDirectorio[]
  ids: Set<string>
  /**
   * Los del plantel que TIENEN FILA en el cuadro (`entraAlCuadro`): la solapa Horas arma sus filas con éstos,
   * así muestra las mismas personas que Liquidación.
   */
  delCuadro: Set<string>
  /**
   * `persona_directorio.puesto` de TODO el directorio, no de un subconjunto. Horas lo armaba con los ids de
   * asignaciones y registros: un jefe sin asignación ni horas en la quincena quedaba afuera del mapa y caía
   * con los obreros (QA 15/09/2026, Maldonado en 16–31/08). Sale de la lectura que ya se hace acá.
   */
  puestos: Record<string, string | null>
  errores: { que: string; error: string }[]
}

/** LAS SEIS LECTURAS EN UNA TANDA, y la regla. */
export async function leerPlantelDeLaQuincena(supabase: SupabaseClient, q: Quincena): Promise<PlantelLeido> {
  const [directorio, registros, lineas, recibos, jornales, cuiles, deprueba, tarifas, presentes, subcontratos] = await Promise.all([
    supabase.from('persona_directorio').select('id, nombre_completo, nombre_para_mostrar, en_la_empresa, fecha_ingreso, fecha_egreso, puesto'),
    leerRegistrosHH(supabase, { desde: q.desde, hasta: q.hasta, columnas: 'persona_id, fecha' }),
    supabase.from('liquidacion_quincena').select('liquidacion_linea(persona_id)').eq('desde', q.desde).eq('hasta', q.hasta),
    supabase.from('recibo_sueldo_linea').select('persona_id, cuil').eq('periodo', periodoDeRecibo(q)),
    // EL BLOQUE DE JORNALES NO EMPIEZA EL 1 NI EL 16. La planilla del dueño arranca los períodos donde
    // arrancan de verdad (02/02, 18/05, 03/08, 17/08), así que pedirlos con `eq('quincena_desde', q.desde)`
    // devolvía CERO filas justo en esas quincenas: el espejo dejaba de contar como evidencia del plantel y
    // quien sólo figuraba ahí quedaba afuera del cuadro. Se usa el mismo criterio que
    // `espejoDeJornalesService.getEspejoDeLaPlanilla` —el bloque es de la quincena en la que EMPIEZA, no por
    // solape—, y los dos tienen que decir lo mismo. Hallado por la auditoría del 21/09/2026.
    supabase.from('jornales_bloque_persona').select('persona_id')
      .gte('quincena_desde', q.desde).lte('quincena_desde', q.hasta),
    leerCuilesDelLegajo(supabase),
    laSesionEsDePrueba(supabase),
    supabase.from('persona_tarifa').select('persona_id, desde, valor_hora, neto_mensual, origen').lte('desde', q.hasta),
    supabase.from('asistencia_dia').select('persona_id').eq('estado', 'presente').gte('fecha', q.desde).lte('fecha', q.hasta),
    leerSubcontratoDePersonas(supabase),
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
  anotar('las retribuciones', tarifas.error)
  anotar('la presencia declarada', presentes.error)
  anotar('las cuadrillas de subcontrato', subcontratos.error)
  const personaDeCuil = new Map(((cuiles.data ?? []) as { id: string; cuil: string | null }[])
    .map((c) => [cuilNormalizado(c.cuil), c.id] as const).filter((c): c is [string, string] => c[0] != null))
  const actividad: ActividadDeLaQuincena = {
    conHoras: new Set(((registros.data ?? []) as { persona_id: string | null }[]).map((r) => r.persona_id).filter((x): x is string => !!x)),
    conLinea: new Set(((lineas.data ?? []) as { liquidacion_linea: { persona_id: string }[] | null }[])
      .flatMap((c) => (c.liquidacion_linea ?? []).map((l) => l.persona_id))),
    conRecibo: new Set(((recibos.data ?? []) as { persona_id: string | null; cuil: string | null }[])
      // `persona_id` MANDA; el CUIL es respaldo y va por dígitos.
      .map((r) => r.persona_id ?? personaDeCuil.get(cuilNormalizado(r.cuil) ?? '')).filter((x): x is string => !!x)),
    conJornales: new Set(((jornales.data ?? []) as { persona_id: string | null }[]).map((r) => r.persona_id).filter((x): x is string => !!x)),
  }
  const deSubcontrato = subcontratoPorPersona(subcontratos)
  // DIRECCIÓN NO ES PLANTEL DE NINGUNA QUINCENA: no se le liquida jornal ni se le cargan horas.
  // Se va en la LECTURA —una sola vez— y por eso Horas, Liquidación, Recibos, Cierre, Convenios y la
  // semana de asistencia, que piden todas esta puerta, no pueden volver a mostrarla por separado.
  const filasDirectorio = sinDireccion(
    (directorio.data ?? []) as (Parameters<typeof personaDelDirectorio>[0] & { puesto?: string | null })[])
  const personas = filasDirectorio.map(personaDelDirectorio)
    .map((p) => ({ ...p, subcontratoId: deSubcontrato.get(p.id) ?? null }))
  const { activas, conActividad } = plantelDeLaQuincena(personas, q, actividad, deprueba)
  const filasTarifa = (tarifas.data ?? []) as { persona_id: string; desde: string; valor_hora: number | null; neto_mensual: number | null; origen: string }[]
  const conPresencia = new Set(((presentes.data ?? []) as { persona_id: string }[]).map((r) => r.persona_id))
  const puestos: Record<string, string | null> = Object.fromEntries(
    filasDirectorio.map((r) => [r.id, r.puesto ?? null]),
  )
  const delCuadro = new Set(activas.filter((p) => {
    // UN JEFE DE LA QUINCENA SIEMPRE TIENE FILA, con o sin tarifa (dueño, 15/09/2026): Liquidación lo manda a
    // Oficina por `esJefeDeObra`, y Horas tiene que mostrar las mismas personas.
    if (esJefeDeObra(puestos[p.id] ?? null)) return true
    const t = tarifaVigenteAl(filasTarifa.filter((f) => f.persona_id === p.id).map((f) => ({
      valorHora: f.valor_hora == null ? null : Number(f.valor_hora),
      netoMensual: f.neto_mensual == null ? null : Number(f.neto_mensual), desde: f.desde, origen: f.origen,
    })), q.hasta)
    // Un mensual siempre tiene fila (va a Oficina); las horas cargadas ya son actividad.
    return t?.netoMensual != null || entraAlCuadro({
      conActividad: conActividad.has(p.id), tarifaVigente: t?.valorHora != null,
      horas: actividad.conHoras.has(p.id) ? 1 : 0, presenteSinHoras: conPresencia.has(p.id),
    })
  }).map((p) => p.id))
  return { personas: activas, ids: new Set(activas.map((p) => p.id)), delCuadro, puestos, errores }
}
