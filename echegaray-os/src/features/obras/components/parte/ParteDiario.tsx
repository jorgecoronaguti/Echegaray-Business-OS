// ═══ 06 · OBRA · TRABAJO · PARTE DIARIO — y M08 en el teléfono (diseño ERP Obras, 23/09/2026) ═══
//
// ES UN SERVER COMPONENT A PROPÓSITO: la página lo monta con los partes, el plantel y las horas de
// la obra, y acá se lee lo ÚNICO que la 06 necesita y la página no trae: quiénes son los ESPERADOS
// de «Quién vino» —el plantel asignado a la obra, con su cuadrilla y su categoría—, no el legajo
// entero. Lo que se dibuja vive en `ParteDiarioCliente`, que tiene el día en la mano y el formulario.
//
// «NO QUIERO LAYOUT NUEVO» (dueño, 23/09/2026): la 06 no dibuja equipos, ni «quién y con qué», ni
// «% ítem», ni destino de la novedad. Por eso acá NO se leen `actividad_partes_resumen`, la gente ni
// los equipos de los partes, ni los activos de Herramientas. Lo que no se dibuja no se lee.
//
// FOTOS Y REGISTRO DEL DÍA (dueño, 23/09/2026): el bloque multimedia se dibuja en el aside de la 06 y
// antes del pie de la M08. Las filas las pide el cliente por día (`adjuntosDelDia`) porque la fecha
// se cambia sin recargar; acá sólo se resuelve quién es el usuario para ofrecer «Borrar».
//
// `registrar`, `borrarParte`, `equipos`, `cuadrillas` e `integrantes` siguen llegando de la página y
// NO SE USAN: el parte del diseño se guarda entero con `guardarParteDiario`, y la cuadrilla de cada
// persona sale de su asignación. Se aceptan para no tocar la página, y se dice.

import { createClient } from '@/lib/supabase/server'
import type { AccionFormulario, ResultadoAccion } from '@/shared/components/ui'
import type { Actividad, ParteEjecucion, Persona } from '../../types'
import type { HoraDeJornada } from '../../services/ejecucionService'
import { getAsignaciones } from '../../services/personalService'
import { getPerfilActual } from '@/features/auth/services/authService'
import { esAdministracion } from '@/shared/auth/areas'
import { guardarParteDiario } from '../../services/actionsEjecucion'
import { ParteDiarioCliente } from './ParteDiarioCliente'

export async function ParteDiario({
  obraId, actividades, partes, hoy, registrosHH,
}: {
  obraId: string
  actividades: Actividad[]
  partes: ParteEjecucion[]
  personas?: Persona[]
  cuadrillas?: { id: string; nombre: string }[]
  integrantes?: Record<string, string[]>
  hoy: string
  equipos?: string[]
  registrosHH?: HoraDeJornada[]
  registrar?: AccionFormulario
  borrarParte?: (parteId: string) => Promise<ResultadoAccion>
}) {
  const supabase = await createClient()
  // El perfil decide sólo qué BOTÓN se ofrece en el visor de fotos («Borrar»: quien subió o
  // Administración); la cerradura es la policy de `obra_parte_adjunto`.
  const [asignaciones, perfil] = await Promise.all([getAsignaciones(supabase, obraId), getPerfilActual(supabase)])
  const fallas = asignaciones.error ? [asignaciones.error] : []
  const usuario = perfil.data ? { id: perfil.data.id, esAdministracion: esAdministracion(perfil.data.rol) } : null
  return (
    <ParteDiarioCliente
      obraId={obraId}
      actividades={actividades}
      partes={partes}
      asignaciones={asignaciones.data ?? []}
      hoy={hoy}
      registrosHH={registrosHH}
      fallas={fallas}
      usuario={usuario}
      guardar={guardarParteDiario.bind(null, obraId)}
    />
  )
}
