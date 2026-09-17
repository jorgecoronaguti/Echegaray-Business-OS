import Link from 'next/link'
import { hrefCargaDeAsistencia } from '@/features/administracion/services/cargaDeAsistencia'

// LA PUERTA A LA CARGA ÚNICA DESDE PLANTEL Y DESDE HORAS (17/09/2026). Un solo componente para las dos
// solapas: el día que la ruta cambie, se cambia en `hrefCargaDeAsistencia` y no en dos enlaces sueltos.
// Visible, con borde: en este hito los botones viejos siguen, y el dueño tiene que encontrar la nueva.
export function EnlaceCargarAsistencia({ obra, testid = 'ir-a-cargar-asistencia' }: { obra?: string; testid?: string }) {
  return (
    <Link
      prefetch={false} href={hrefCargaDeAsistencia({ obra })} data-testid={testid}
      className="inline-flex min-h-[36px] items-center rounded-control border border-ink px-3 text-[12.5px] font-medium text-ink hover:bg-surface-sunken"
    >
      Cargar asistencia
    </Link>
  )
}
