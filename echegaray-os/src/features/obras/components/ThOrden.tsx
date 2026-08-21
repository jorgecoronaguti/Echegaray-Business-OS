// EL ENCABEZADO ORDENABLE DEL PORTAFOLIO — el genérico del DS, con los campos de Obras atados.
//
// El componente subió a `@/shared/components/ds/ThOrden` el 21/08/2026 porque lo necesitan cinco
// tablas más. Acá queda lo único que ES de Obras: qué campos existen, cómo se llaman en la pantalla
// y con qué dirección abre cada uno. Las dos pantallas que ya lo usaban no cambiaron una línea.

import { ThOrden as ThOrdenBase } from '@/shared/components/ds/ThOrden'
import { CAMPOS, proximaDireccion, type CampoOrden, type Direccion } from '../services/ordenObras'

export function ThOrden({
  campo, activo, dir, base, extra = {}, alineado = 'left', className = '',
}: {
  campo: CampoOrden
  activo: CampoOrden | null
  dir: Direccion
  base: string
  extra?: Record<string, string | undefined>
  alineado?: 'left' | 'right'
  className?: string
}) {
  return (
    <ThOrdenBase
      campo={campo}
      etiqueta={CAMPOS[campo]}
      activo={activo}
      dir={dir}
      proxima={proximaDireccion(campo, activo, activo === campo ? dir : null)}
      base={base}
      extra={extra}
      alineado={alineado}
      className={className}
    />
  )
}
