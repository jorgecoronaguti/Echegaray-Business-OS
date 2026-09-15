// DEJAR UN DÍA SIN HORAS, CONTRA LA BASE. La regla vive en `vaciadoDeHoras.ts`; esto la lee, la
// aplica y devuelve lo que la base HIZO. Lo llaman las tres puertas que escriben horas de un día —la
// celda de Horas y su editor (`corregirJornada`), la carga del día (`guardarJornada`) y la celda de
// Liquidación (`corregirHorasDelDia`)— para que «sin horas» sea una sola cosa en todos los cuadros.
//
// NO ES `'use server'`: recibe el cliente de la sesión que ya abrió la acción, igual que
// `presenciaDelDiaService.ts`. La cerradura sigue siendo la RLS de `registros_hh`.

import type { SupabaseClient } from '@supabase/supabase-js'
// CON EXTENSIÓN: `node --test` corre este módulo contra un cliente falso (`quincenaCerrada.test.ts`).
import { traducirEscritura } from './planDeJornada.ts'
import { quincenaCerrada } from './quincenaCerradaService.ts'
import { acuseDeVaciado, planDeVaciado, type PlanDeVaciado } from './vaciadoDeHoras.ts'

export interface ResultadoDeVaciado {
  borradas: number
  intactas: PlanDeVaciado['intactas']
  mensaje: string
  error: string | null
}

export async function vaciarHorasDelDia(
  supabase: SupabaseClient,
  { personas, fecha, obra }: { personas: readonly string[]; fecha: string; obra: string | null },
): Promise<ResultadoDeVaciado> {
  const vacio = { borradas: 0, intactas: [], mensaje: '' }
  if (personas.length === 0) return { ...vacio, error: null }

  // LA QUINCENA CERRADA NO SE VACÍA, por ninguna puerta. Cada acción ya lo pregunta; se pregunta
  // también acá porque éste es el único punto por el que pasan las tres, y una puerta nueva que se
  // olvide de preguntar choca igual. Es una lectura chica contra borrar un jornal pagado.
  const cierre = await quincenaCerrada(supabase, fecha)
  if (cierre !== null) return { ...vacio, error: cierre }

  let lectura = supabase.from('registros_hh')
    .select('id, persona_id, horas, tipo_hora, actividad_id, improductiva, notas, obra_canonica_id')
    .eq('fecha', fecha).in('persona_id', [...personas])
  if (obra !== null) lectura = lectura.eq('obra_canonica_id', obra)
  const { data, error } = await lectura.order('id', { ascending: true })
  if (error) return { ...vacio, error: error.message }

  const plan = planDeVaciado((data ?? []) as Parameters<typeof planDeVaciado>[0], personas, obra)
  let borradas = 0
  if (plan.borrar.length > 0) {
    // LA FECHA Y LA OBRA VUELVEN A IR EN EL DELETE: entre la lectura y el borrado alguien pudo mover
    // esa fila de día o de obra, y un id solo la borraría igual.
    let borrado = supabase.from('registros_hh').delete().in('id', plan.borrar).eq('fecha', fecha)
    if (obra !== null) borrado = borrado.eq('obra_canonica_id', obra)
    const r = await borrado.select('id')
    if (r.error) return { ...vacio, intactas: plan.intactas, error: traducirEscritura(r.error) }
    borradas = (r.data ?? []).length
    // EL EFECTO, NO EL INTENTO: un delete que la policy rechaza sin error devuelve cero filas.
    if (borradas === 0) {
      return { ...vacio, intactas: plan.intactas, error: 'La base no borró ninguna hora de ese día. Puede ser un permiso: no cambió nada.' }
    }
  }
  return { borradas, intactas: plan.intactas, mensaje: acuseDeVaciado(borradas, plan.intactas), error: null }
}
