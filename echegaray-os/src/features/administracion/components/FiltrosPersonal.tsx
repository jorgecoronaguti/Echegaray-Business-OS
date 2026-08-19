// LOS CUATRO FILTROS DEL LISTADO — enlaces, no un desplegable.
//
// Son cuatro estados que se miran todo el día («¿quién está sin asignar?»), y un `select` los
// esconde detrás de un toque y no deja ver cuál está puesto de un vistazo. Como enlaces, además, el
// filtro vive en la URL: se comparte, se recarga y vuelve con el botón de atrás.
//
// Se reusa el lenguaje visual de `NavObras` y `NavAdministracion` —subrayado en el amarillo de la
// marca— en vez de inventar un tercer estilo de solapa para la misma idea.

import Link from 'next/link'
import { FILTROS, type FiltroPersonal } from '../services/personasService'

export function FiltrosPersonal({
  activo,
  hrefDe,
}: {
  activo: FiltroPersonal
  hrefDe: (filtro: FiltroPersonal) => string
}) {
  return (
    <nav className="flex gap-1 overflow-x-auto border-b border-line" data-testid="filtros-personal">
      {FILTROS.map((f) => {
        const puesto = f.valor === activo
        return (
          <Link
            key={f.valor}
            href={hrefDe(f.valor)}
            data-testid={`filtro-${f.valor}`}
            aria-current={puesto ? 'page' : undefined}
            className={`-mb-px shrink-0 border-b-2 px-3.5 py-2 text-[13px] transition-colors ${
              puesto ? 'border-marca font-medium text-ink' : 'border-transparent text-muted hover:text-ink'
            }`}
          >{f.etiqueta}</Link>
        )
      })}
    </nav>
  )
}
