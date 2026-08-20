// LAS SOLAPAS DE LA FICHA — el nivel 2 DENTRO del legajo.
//
// Son las mismas cuatro preguntas que se le hacen a una persona: quién es, dónde estuvo, cuánto
// trabajó y qué papeles tiene. Se dibujan con `Tabs` del design system —regla amarilla de 2px— en
// vez de con una tercera copia de la misma barra escrita a mano.
//
// ACÁ NO ESTÁ LA BARRA DEL ÁREA, y es a propósito: el legajo está un nivel por debajo de Personas y
// vuelve con el `← Personal` del encabezado. Poner las dos daría TRES niveles de navegación a la
// vista, que es lo que prohíbe `design/system/LAYOUT_RESPONSIVE.md`.

import { Tabs } from '@/shared/components/ds'

export const VISTAS_FICHA = ['resumen', 'asignaciones', 'horas', 'documentos'] as const
export type VistaFicha = (typeof VISTAS_FICHA)[number]

const LABEL: Record<VistaFicha, string> = {
  resumen: 'Resumen',
  asignaciones: 'Asignaciones',
  horas: 'Horas',
  documentos: 'Documentos',
}

export function NavFicha({ activa, hrefDe }: { activa: VistaFicha; hrefDe: (v: VistaFicha) => string }) {
  return (
    <div className="mb-6" data-testid="nav-ficha-persona">
      <Tabs
        testid="tabs-ficha-persona"
        tabs={VISTAS_FICHA.map((v) => ({
          href: hrefDe(v), label: LABEL[v], activo: v === activa, testid: `nav-ficha-${v}`,
        }))}
      />
    </div>
  )
}
