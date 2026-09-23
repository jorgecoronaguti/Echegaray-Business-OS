// `/campo/asistencia` → `/administracion/personas/asistencia` (dueño, 23/09/2026 · mapa de
// pantallas, duda 5).
//
// La decisión del 17/09 era UNA sola carga del día, y esta ruta seguía dibujando la segunda: la
// misma `CargaDelDia`, el mismo `presenciaDelDiaActions`, otra URL. La pantalla de Administración ya
// es responsive y elige la obra en el teléfono (`ObraEnTelefono`), así que acá no queda nada que
// dibujar: sólo conservar la URL, que circula en enlaces y en pruebas, y llevar `?obra=` y `?dia=`
// tal como los entiende la pantalla de destino (`hrefCargaDeAsistencia`).
import { redirect } from 'next/navigation'
import { hrefCargaDeAsistencia } from '@/features/administracion/services/cargaDeAsistencia'

export default async function AsistenciaCampoPage({ searchParams }: {
  searchParams: Promise<{ obra?: string; dia?: string }>
}) {
  const sp = await searchParams
  redirect(hrefCargaDeAsistencia({ obra: sp.obra, dia: sp.dia }))
}
