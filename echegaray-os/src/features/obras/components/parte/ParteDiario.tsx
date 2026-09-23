// ═══ 06 · OBRA · TRABAJO · PARTE DIARIO — y M08 en el teléfono (diseño ERP Obras, 23/09/2026) ═══
//
// ES UN SERVER COMPONENT A PROPÓSITO: la página lo monta con los partes, el plantel y las horas de
// la obra, y acá se leen las CUATRO cosas que el diseño nuevo agrega y que la página no conoce —el
// % del ítem por partes, quién estuvo en cada parte, con qué, y los activos que Herramientas ubica
// hoy en esta obra—. Lo que se dibuja vive en `ParteDiarioCliente`, que es el que tiene el día en
// la mano y el formulario.
//
// `registrar` (la acción vieja de un parte por vez) y `equipos` (el catálogo de `herramientas`, el
// espejo del Sheet) siguen llegando de la página y NO SE USAN: el parte del diseño se guarda entero
// con `guardarParteDiario`, y los equipos son ACTIVOS del modelo nuevo. Se aceptan para no tocar
// la página, y se dice.

import { createClient } from '@/lib/supabase/server'
import type { AccionFormulario, ResultadoAccion } from '@/shared/components/ui'
import type { Actividad, ParteEjecucion, Persona } from '../../types'
import {
  getActivosEnObra, getEquiposDePartes, getGenteDePartes, getResumenPartes, type HoraDeJornada,
} from '../../services/ejecucionService'
import { guardarParteDiario } from '../../services/actionsEjecucion'
import { ParteDiarioCliente } from './ParteDiarioCliente'

export async function ParteDiario({
  obraId, actividades, partes, personas, hoy, registrosHH,
}: {
  obraId: string
  actividades: Actividad[]
  partes: ParteEjecucion[]
  personas: Persona[]
  cuadrillas?: { id: string; nombre: string }[]
  integrantes?: Record<string, string[]>
  hoy: string
  equipos?: string[]
  registrosHH?: HoraDeJornada[]
  registrar?: AccionFormulario
  borrarParte?: (parteId: string) => Promise<ResultadoAccion>
}) {
  const supabase = await createClient()
  const [resumen, gente, equipos, activos] = await Promise.all([
    getResumenPartes(supabase, obraId),
    getGenteDePartes(supabase, obraId),
    getEquiposDePartes(supabase, obraId),
    getActivosEnObra(supabase, obraId),
  ])
  const fallas = [resumen.error, gente.error, equipos.error, activos.error].filter((e): e is string => Boolean(e))
  return (
    <ParteDiarioCliente
      obraId={obraId}
      actividades={actividades}
      partes={partes}
      personas={personas}
      hoy={hoy}
      registrosHH={registrosHH}
      resumen={resumen.data ?? []}
      gente={gente.data ?? []}
      equipos={equipos.data ?? []}
      activos={activos.data ?? []}
      fallas={fallas}
      guardar={guardarParteDiario.bind(null, obraId)}
    />
  )
}
