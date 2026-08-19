// LAS SOLAPAS DE LA FICHA — el mismo renglón de solapas que el workspace de la obra.
//
// Se reusa el patrón de `NavObras` y `NavAdministracion` —línea, subrayado en el amarillo de la
// marca, desplazable en el teléfono— en vez de inventar un tercero. Dos formas de decir "dónde
// estoy" en la misma aplicación se aprenden dos veces y se aprenden mal.
//
// SON DOS NIVELES VISIBLES COMO MÁXIMO: la barra de Administración arriba y ésta. La ficha no abre
// un tercero.

import Link from 'next/link'

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
    <nav
      className="mb-5 flex gap-1 overflow-x-auto overscroll-x-contain border-b border-line"
      data-testid="nav-ficha-persona"
    >
      {VISTAS_FICHA.map((v) => (
        <Link
          key={v}
          href={hrefDe(v)}
          data-testid={`nav-ficha-${v}`}
          aria-current={v === activa ? 'page' : undefined}
          className={`-mb-px shrink-0 border-b-2 px-3.5 py-2 text-[13px] transition-colors ${
            v === activa ? 'border-marca font-medium text-ink' : 'border-transparent text-muted hover:text-ink'
          }`}
        >{LABEL[v]}</Link>
      ))}
    </nav>
  )
}
