import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getUsuarioActual } from '@/features/auth/services/authService'
import { getPerfilPropio } from '@/features/mi-cuenta/services/miCuentaService'
import { SinVinculo } from '@/features/mi-cuenta/components/SinVinculo'
import { Aviso } from '@/shared/components/ds'
import { PantallaEmpleado } from '@/features/empleado/components/ShellEmpleado'
import { Nada } from '@/features/empleado/components/Filas'
import { FormProblema } from '@/features/empleado/components/FormProblema'
import { getMiObra, getMisImpedimentos, getMisTareas } from '@/features/empleado/services/empleadoService'

// La pantalla que envuelve al formulario. Trae MIS tareas —no las de la obra— para el desplegable:
// un impedimento se cuelga de lo que uno está haciendo, y ofrecer las 349 actividades de la obra
// convertiría el paso más simple en el más largo.

export const dynamic = 'force-dynamic'

export default async function ReportarPage({
  searchParams,
}: {
  searchParams: Promise<{ obra?: string; tarea?: string }>
}) {
  const supabase = await createClient()
  const user = await getUsuarioActual(supabase)
  if (!user) redirect('/login')
  const perfil = await getPerfilPropio(supabase, user.id)

  if (!perfil.data?.persona_id) {
    return (
      <PantallaEmpleado titulo="Avisar un problema" volver={{ href: '/mi-trabajo', label: 'Mi trabajo' }}>
        <SinVinculo que="tus tareas" disponible={perfil.data?.vinculoDisponible !== false} />
      </PantallaEmpleado>
    )
  }

  const { obra: obraQuery, tarea } = await searchParams
  const [tareas, obras, avisados] = await Promise.all([
    getMisTareas(supabase), getMiObra(supabase), getMisImpedimentos(supabase),
  ])
  const obraId = obraQuery ?? obras.data?.[0]?.id ?? null

  return (
    <PantallaEmpleado titulo="Avisar un problema" volver={{ href: '/mi-trabajo', label: 'Mi trabajo' }}>
      {tareas.error && <Aviso tono="neg" titulo="No se pudieron leer tus tareas." testid="reportar-error">{tareas.error}</Aviso>}
      {obraId ? (
        <FormProblema
          tareas={tareas.data ?? []}
          obraId={obraId}
          tareaId={tarea ?? null}
          yaAvisado={avisados.data ?? []}
        />
      ) : (
        <Nada testid="sin-obra-para-reportar">
          No tenés ninguna obra asignada, así que no hay dónde anotar el impedimento. Las asignaciones
          las carga Administración desde Personal.
        </Nada>
      )}
    </PantallaEmpleado>
  )
}
