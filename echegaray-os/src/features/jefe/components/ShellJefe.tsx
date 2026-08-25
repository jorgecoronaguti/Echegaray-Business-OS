'use client'

import { usePathname, useSearchParams } from 'next/navigation'
import type { ReactNode } from 'react'
import { CONTEXTOS, contextoActivo, conObra } from '../services/navegacion'
import { MarcoMovil, BarraContextos } from '@/shared/components/movil/Piezas'
import type { NombreIcono } from '@/shared/components/movil/Iconos'

// EL MARCO DEL JEFE DE OBRA EN EL TELÉFONO — porte literal de J01 (`J01 · Jefe Hoy.dc.html`).
//
// ═══ QUÉ CAMBIÓ EL 24/08 Y POR QUÉ ═══
//
// Hasta hoy este archivo dibujaba TAMBIÉN el encabezado: una barra propia de 52px con el isotipo,
// la palabra «ECHEGARAY» y la flecha de volver. Los seis mockups no tienen esa barra: J01 abre con
// el topbar de MARCA (isotipo 26 + empresa + obra + iniciales en un círculo grafito de 34) y
// J02…J06 abren cada uno con su topbar de DETALLE, que lleva su propio título, su bajada y su
// objetivo de 44 a la derecha (buscar, historial, «más»).
//
// Un encabezado genérico no puede dibujar los dos, así que el encabezado bajó a las pantallas —que
// son las que saben su título y a dónde vuelve su flecha— y acá quedó lo único que es del marco: el
// ancho de la columna y la barra de contextos.
//
// ═══ LA BARRA SE QUEDA AUNQUE J02, J03 Y J05 NO LA DIBUJEN — DESVÍO DECLARADO ═══
//
// Los `.dc.html` de esas tres no incluyen el bloque de la barra inferior; sólo J01 lo tiene. Pero
// J01 dibuja los cuatro destinos —Hoy · Tareas · Avance · Gente— y esos destinos SON J01, J02, J03 y
// J05. Sacar la barra al llegar convertiría tres de los cuatro botones en un viaje de ida: se entra
// por la barra y se vuelve por una flecha que el mockup de J02 y J03 tampoco dibuja hacia un
// contexto. Se conserva la barra en las cuatro pantallas de contexto, con el aspecto medido en J01.
//
// ═══ LA BARRA ES FIJA Y EL CONTENIDO LE DEJA LUGAR ═══
//
// Sin el hueco de `ALTO_BARRA`, la última fila de cualquier lista queda tapada por la barra y nadie
// la puede tocar. Es la misma trampa que ya pagó el perfil empleado.

const ICONO: Record<string, NombreIcono> = {
  '/obra/hoy': 'casa',
  '/obra/tareas': 'tarea',
  '/obra/avance': 'avance',
  '/obra/personas': 'gente',
}

export function ShellJefe({ children }: { children: ReactNode }) {
  // La ruta la pone el navegador: un layout de App Router no la recibe, y pasarla por `headers()`
  // volvería dinámica toda pantalla sólo para encender un rótulo.
  const pathname = usePathname() ?? ''
  const params = useSearchParams()
  const obraId = params?.get('obra') ?? null
  // `/obra/avance` son dos pantallas: J03 con barra, y el formulario de UNA tarea sin ella. El
  // porqué está en `navegacion.ts`; acá sólo se le pasa cuál de las dos es.
  const conActividad = !!params?.get('actividad')
  const activo = contextoActivo(pathname, conActividad)

  return (
    <MarcoMovil conBarra={!!activo}>
      <div data-testid="shell-jefe">{children}</div>
      {activo && (
        <BarraContextos
          testid="barra-jefe"
          items={CONTEXTOS.map((c) => ({
            href: conObra(c.href, obraId),
            label: c.label,
            icono: ICONO[c.href] ?? 'casa',
            activo: activo === c.href,
            testid: c.testid,
          }))}
        />
      )}
    </MarcoMovil>
  )
}
