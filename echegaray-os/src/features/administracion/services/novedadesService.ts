// LA LECTURA DE «NOVEDADES PARA EL ESTUDIO»: las mismas filas del panel de Liq. de hs + el legajo.
//
// `leerCuadroDeLaQuincena` es LA lectura que dibuja la pantalla, la «Caja» y el «Cierre»: usarla acá es lo que
// hace que el archivo del contador no pueda diferir de lo que el dueño ve. Lo único que se agrega es lo que la
// fila no trae: el nombre legal con el apellido primero, el legajo, el CUIL, el convenio y el puesto.

import type { SupabaseClient } from '@supabase/supabase-js'
import { leerCuadroDeLaQuincena } from './cuadroDeLaQuincenaService.ts'
import { novedadesParaElEstudio, type AlcanceDeNovedades, type DatosDelLegajo, type ReporteDeNovedades } from './novedadesParaElEstudio.ts'
import type { Quincena } from './quincena.ts'

/** Un campo del legajo por su rótulo (los mismos que arma `datosDePersona`). */
const campo = (cs: readonly { rotulo: string; valor: string | null }[], rotulo: string): string | null =>
  cs.find((c) => c.rotulo === rotulo)?.valor ?? null

export async function leerNovedadesParaElEstudio(
  supabase: SupabaseClient, quincena: Quincena, hoy: string, alcance: AlcanceDeNovedades = 'todos',
): Promise<ReporteDeNovedades> {
  const cuadro = await leerCuadroDeLaQuincena(supabase, quincena, hoy)
  const ids = cuadro.filas.map((f) => f.personaId)
  const nombres = await supabase.from('personas').select('id, nombre_completo').in('id', ids)
  // Sin el nombre legal se cae al nombre de la fila: se ordena igual (el helper ordena por lo que reciba).
  const legal = new Map((nombres.data ?? []).map((p: { id: string; nombre_completo: string | null }) => [p.id, p.nombre_completo]))
  const legajos = new Map<string, DatosDelLegajo>()
  for (const f of cuadro.filas) {
    const d = cuadro.datos.porPersona[f.personaId]
    legajos.set(f.personaId, {
      nombreCompleto: legal.get(f.personaId)?.trim().replace(/\s+/g, ' ') || null,
      legajo: d ? campo(d.laboral, 'Legajo') : null,
      cuil: d ? campo(d.legajo, 'CUIL') : null,
      convenio: d ? campo(d.laboral, 'Convenio') : null,
      puesto: d ? campo(d.laboral, 'Puesto') : null,
    })
  }
  return novedadesParaElEstudio({ filas: cuadro.filas, legajos, quincena, emision: hoy, alcance })
}
