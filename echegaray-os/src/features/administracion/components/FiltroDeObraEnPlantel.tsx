// ═══ LA SEGUNDA FILA DE FILTROS DEL PLANTEL: EL RECORTE POR OBRA (dueño, 16/09/2026) ═══
//
// *«necesito filtros por obra en la sección de plantel donde marco asistencias, tardanzas etc., en
// vista computadora de app.ecsas.com.ar»*.
//
// ═══ MISMO CONTROL QUE LA FILA DE ARRIBA, A PROPÓSITO ═══
//
// La alternativa era el chip de la solapa Horas —`ChipsDeObra`, pastilla redondeada CON borde— y se
// descartó: el v2 le sacó el borde justo a este control para no volver a dibujar la caja que la tabla
// acaba de perder. Dos formas distintas de pastilla en la misma pantalla serían dos lenguajes para el
// mismo gesto, y la de esta pantalla ya está elegida.
//
// UN DESPLEGABLE TAMPOCO: con cinco obras, un `select` esconde detrás de un clic lo que el chip ya
// publica —cuánta gente hay en cada una—, que es justamente lo que se mira ANTES de elegir. Si algún
// día son quince obras a la vez, esta decisión se vuelve a discutir con ese dato en la mano.
//
// ═══ NO SE DIBUJA SI NO HAY NADA QUE ELEGIR ═══
//
// En «Inactivos» ninguna persona tiene obra vigente (57 de 57 el 16/09/2026): la fila sería un
// «Todas» solitario ocupando un renglón para no ofrecer ninguna opción.
//
// LO QUE ESTE ARCHIVO NO DECIDE: quién entra en el recorte y cuánto anuncia cada chip — eso es
// `services/recorteDeObra.ts`, que es puro y está probado. Acá sólo se elige qué chip está activo y a
// dónde apunta cada uno.

import { FiltrosSuaves } from '@/shared/components/v2/FiltrosSuaves'
import type { ChipDeObra } from '../services/recorteDeObra'
import type { FiltroPersonal } from '../services/personasService'

export function FiltroDeObraEnPlantel({ chips, sinObra, elegida, filtro, hrefDe }: {
  /** Las obras con gente en el corte, ya contadas y ordenadas (`obrasDelCorte`). */
  chips: ChipDeObra[]
  /** Cuántos del corte no tienen obra, o `null` si acá ese chip no va (`sinObraDelCorte`). */
  sinObra: number | null
  /** El id de la obra puesta en la URL. */
  elegida?: string
  /** La pastilla de la fila de arriba: «Sin asignar» también es un recorte por obra. */
  filtro: FiltroPersonal
  /** Esta misma pantalla con otro recorte. La regla de qué se conserva vive en la página. */
  hrefDe: (cambios: Record<string, string | undefined>) => string
}) {
  if (chips.length === 0 && sinObra === null) return null
  return (
    <FiltrosSuaves
      testid="filtro-obra"
      rotulo="Obra"
      opciones={[
        {
          clave: 'todas',
          etiqueta: 'Todas',
          href: hrefDe({ obra: undefined }),
          // «SIN ASIGNAR» ES UN RECORTE POR OBRA, aunque viva en la fila de arriba: con esa pastilla
          // puesta, «Todas» mentiría diciendo que no hay ninguno.
          activo: !elegida && filtro !== 'sin_asignar',
        },
        ...chips.map((o) => ({
          clave: o.clave,
          // EL NOMBRE DE LA OBRA, SIN EL CÓDIGO INTERNO: es el mismo texto que la celda OBRA escribe
          // en cada fila. Un «OB-0012 · » delante de cinco chips gasta medio renglón repitiendo lo
          // que acá no distingue una obra de otra.
          etiqueta: o.etiqueta,
          // CLIC EN LA OBRA YA ACTIVA LA APAGA. Sin esto, el único camino de vuelta al plantel entero
          // sería borrar el parámetro a mano en la barra de direcciones.
          href: hrefDe({ obra: o.clave === elegida ? undefined : o.clave }),
          activo: o.clave === elegida,
          cuenta: o.cuenta,
        })),
        // «SIN OBRA» ES EL RECORTE QUE YA EXISTE, NO UNO NUEVO: su enlace es la pastilla «Sin asignar»
        // de la fila de arriba y su número sale de ese mismo corte. Dos controles con el mismo
        // significado y distinto nombre se contradicen el día que uno cambie de criterio.
        ...(sinObra !== null ? [{
          clave: 'sin-obra',
          etiqueta: 'Sin obra',
          href: hrefDe({ f: 'sin_asignar', obra: undefined }),
          activo: filtro === 'sin_asignar' && !elegida,
          cuenta: sinObra,
        }] : []),
      ]}
    />
  )
}
