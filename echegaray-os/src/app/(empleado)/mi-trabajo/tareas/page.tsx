import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getUsuarioActual } from '@/features/auth/services/authService'
import { getPerfilPropio } from '@/features/mi-cuenta/services/miCuentaService'
import { SinVinculo } from '@/features/mi-cuenta/components/SinVinculo'
import { Aviso, Estado } from '@/shared/components/ds'
import { PantallaEmpleado } from '@/features/empleado/components/ShellEmpleado'
import { Fila, Nada } from '@/features/empleado/components/Filas'
import { getMisTareas } from '@/features/empleado/services/empleadoService'
import { hoyISO } from '@/features/empleado/services/acciones'
import { clasificar, lecturaDeEstado, lecturaDeFecha, SOLAPA_LABEL, type Solapa } from '@/features/empleado/services/tareas'

// «MIS TAREAS» — tres solapas: Hoy · Próximas · Completadas.
//
// LA SOLAPA VIVE EN LA URL y no en un `useState`. Dos razones concretas: volver de una tarea al
// listado devuelve a la solapa donde estaba (con estado local, siempre vuelve a «Hoy»), y la
// pantalla se puede compartir o marcar. El costo es un viaje al servidor por toque, y en una lista
// de veinte filas eso no se nota.

export const dynamic = 'force-dynamic'

const SOLAPAS: Solapa[] = ['hoy', 'proximas', 'completadas']

export default async function MisTareasPage({
  searchParams,
}: {
  searchParams: Promise<{ ver?: string }>
}) {
  const supabase = await createClient()
  const user = await getUsuarioActual(supabase)
  if (!user) redirect('/login')
  const perfil = await getPerfilPropio(supabase, user.id)

  if (!perfil.data?.persona_id) {
    return (
      <PantallaEmpleado titulo="Mis tareas" volver={{ href: '/mi-trabajo', label: 'Mi trabajo' }}>
        <SinVinculo que="tus tareas" disponible={perfil.data?.vinculoDisponible !== false} />
      </PantallaEmpleado>
    )
  }

  const { ver } = await searchParams
  const solapa: Solapa = SOLAPAS.includes(ver as Solapa) ? (ver as Solapa) : 'hoy'
  const hoy = await hoyISO()
  const tareas = await getMisTareas(supabase)
  const grupos = clasificar(tareas.data ?? [], hoy)
  const lista = grupos[solapa]

  return (
    <PantallaEmpleado titulo="Mis tareas" volver={{ href: '/mi-trabajo', label: 'Mi trabajo' }}>
      {tareas.error && <Aviso tono="neg" titulo="No se pudieron leer tus tareas." testid="tareas-error">{tareas.error}</Aviso>}

      <nav className="flex gap-1 border-b border-line" data-testid="solapas-tareas">
        {SOLAPAS.map((s) => (
          <Link
            key={s}
            href={`/mi-trabajo/tareas?ver=${s}`}
            data-testid={`solapa-${s}`}
            aria-current={solapa === s ? 'page' : undefined}
            className={`-mb-px border-b-2 px-3 py-2 text-[13px] ${
              solapa === s ? 'border-marca font-semibold text-ink' : 'border-transparent text-muted hover:text-ink'
            }`}
          >
            {SOLAPA_LABEL[s]}
            <span className="ml-1.5 font-mono text-[11.5px] tabular-nums text-faint">{grupos[s].length}</span>
          </Link>
        ))}
      </nav>

      <div className="mt-3" data-testid="lista-tareas">
        {lista.length === 0 ? (
          <Nada testid="sin-tareas">
            {solapa === 'completadas'
              ? 'Todavía no completaste ninguna tarea.'
              : solapa === 'proximas'
                ? 'No hay trabajos planificados a tu nombre. Los planifica el jefe de obra en el Gantt de la obra.'
                : 'No tenés tareas para hoy. Una actividad es tuya cuando sos su responsable o es de tu cuadrilla; lo asigna el jefe de obra.'}
          </Nada>
        ) : (
          lista.map((t) => {
            const e = lecturaDeEstado(t)
            const f = lecturaDeFecha(t, hoy)
            return (
              <Fila
                key={t.id}
                testid="fila-tarea"
                href={`/mi-trabajo/tareas/${t.id}`}
                titulo={t.nombre}
                detalle={
                  <>
                    {t.seccion ?? t.obra}
                    {t.impedimentos > 0 && (
                      <span className="text-neg"> · frenada por {t.impedimentos} impedimento{t.impedimentos === 1 ? '' : 's'}</span>
                    )}
                  </>
                }
                senal={<Estado tono={e.tono} clave={t.estado ?? ''}>{e.texto}</Estado>}
                accion={<span className={`whitespace-nowrap text-[12px] ${f.vencida ? 'text-neg' : 'text-faint'}`}>{f.texto}</span>}
              />
            )
          })
        )}
      </div>
    </PantallaEmpleado>
  )
}
