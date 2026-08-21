// EL NIVEL 3 DE LA BASE MAESTRA — texto subrayado, no una tercera barra.
//
// `design/system/LAYOUT_RESPONSIVE.md`: máximo dos niveles visibles; el tercero es texto con
// subrayado de 1,5px. Es `SubTabs` del design system, sin nada propio: acá sólo vive QUÉ sub-vistas
// hay y a qué ruta va cada una.
//
// LAS SEIS SON ENLACES, NO ESTADO DE COMPONENTE. La sub-vista viaja en la URL, así que un enlace a
// «Mano de obra» se puede pegar en un mensaje y abre en Mano de obra. Un `useState` acá haría que
// todas las sub-vistas compartieran la misma dirección y que volver con el botón de atrás no
// volviera a ninguna parte.

import { SubTabs } from '@/shared/components/ds'

export const VISTAS_RECURSOS = ['insumos', 'mano-obra', 'equipos', 'plantillas', 'precios'] as const
export type VistaRecursos = (typeof VISTAS_RECURSOS)[number]

export const RUTA_TAREAS = '/administracion/base-maestra/tareas'
export const RUTA_RECURSOS = '/administracion/base-maestra/recursos'

export const hrefRecursos = (v: VistaRecursos) => `${RUTA_RECURSOS}?v=${v}`

/** La sub-vista pedida, o `insumos`. Nunca falla: un `?v=` inventado cae en la primera. */
export function vistaDe(v: string | undefined): VistaRecursos {
  return (VISTAS_RECURSOS as readonly string[]).includes(v ?? '') ? (v as VistaRecursos) : 'insumos'
}

const ITEMS: { label: string; href: string; clave: string }[] = [
  { label: 'Tareas tipo', href: RUTA_TAREAS, clave: 'tareas' },
  { label: 'Insumos', href: hrefRecursos('insumos'), clave: 'insumos' },
  { label: 'Mano de obra', href: hrefRecursos('mano-obra'), clave: 'mano-obra' },
  { label: 'Equipos', href: hrefRecursos('equipos'), clave: 'equipos' },
  { label: 'Plantillas de secuencia', href: hrefRecursos('plantillas'), clave: 'plantillas' },
  { label: 'Versiones de precio', href: hrefRecursos('precios'), clave: 'precios' },
]

export function NavBaseMaestra({ activa }: { activa: 'tareas' | VistaRecursos }) {
  return (
    <div data-testid="nav-base-maestra" className="mb-4">
      <SubTabs
        testid="subtabs-base-maestra"
        items={ITEMS.map((i) => ({
          href: i.href,
          label: i.label,
          activo: i.clave === activa,
          cuenta: null,
          testid: `bm-vista-${i.clave}`,
        }))}
      />
    </div>
  )
}
