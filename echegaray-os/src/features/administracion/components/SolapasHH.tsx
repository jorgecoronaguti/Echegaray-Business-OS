// LAS TRES VISTAS DE «CUADRILLAS Y HH» — nivel 3, texto subrayado y no una barra más.
//
// Son tres RUTAS y no un parámetro de una sola pantalla: cada vista lee fuentes distintas
// (`cuadrilla_panel`, `presencia_del_dia`, `periodo_hh_panel`) y con una sola ruta las tres
// consultas correrían siempre, para mostrar una. Además así cada vista se puede compartir por su
// URL, que es como Administración pasa un problema a Dirección.

import { SubTabs } from '@/shared/components/ds'

export type VistaHH = 'cuadrillas' | 'asistencia' | 'periodos'

const RUTA = '/administracion/personas/cuadrillas'

export function SolapasHH({ vista, cuenta }: { vista: VistaHH; cuenta?: number | null }) {
  return (
    <SubTabs
      testid="solapas-hh"
      items={[
        { href: RUTA, label: 'Cuadrillas', cuenta: vista === 'cuadrillas' ? cuenta : null, activo: vista === 'cuadrillas', testid: 'solapa-cuadrillas' },
        { href: `${RUTA}/asistencia`, label: 'Asistencia', activo: vista === 'asistencia', testid: 'solapa-asistencia' },
        { href: `${RUTA}/periodos`, label: 'Períodos de HH', activo: vista === 'periodos', testid: 'solapa-periodos' },
      ]}
    />
  )
}
