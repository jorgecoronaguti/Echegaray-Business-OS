// EL RECORTE POR CATEGORÍA — EL MISMO CONTROL EN LAS TRES SOLAPAS DE PERSONAL (dueño, 17/09/2026).
//
// *«necesito en todo el módulo personal, filtro por categoría de empleados»*.
//
// ═══ POR QUÉ UN SOLO COMPONENTE PARA LAS TRES ═══
//
// Plantel, Horas y Liquidación son la MISMA población mirada con tres preguntas distintas, y la
// categoría significa exactamente lo mismo en las tres. Con una fila escrita tres veces, la que se
// olvide de una lección —que la elegida siempre tenga su pastilla, que el clic en la activa la
// apague— se comporta distinto en la solapa de al lado, y el dueño tiene que aprender tres filtros.
//
// ═══ MISMO CONTROL QUE EL RECORTE POR OBRA, A PROPÓSITO ═══
//
// `FiltrosSuaves` es la pastilla del v2: sin borde, y el activo con fondo. Un chip nuevo dibujado a
// mano metería un segundo lenguaje visual para el mismo gesto. Lo que este archivo decide es cuál
// está activa y a dónde apunta cada una; quién entra en cada cajón es `recorteDeCategoria.ts`.
//
// ═══ LO QUE NO ES ═══
//
// No es un desplegable: con cinco o seis categorías, un `select` esconde detrás de un clic lo que la
// pastilla ya publica —cuánta gente hay en cada una—, que es justo lo que se mira ANTES de elegir.

import { FiltrosSuaves } from '@/shared/components/v2/FiltrosSuaves'
import { V } from '@/shared/components/v2/patron'
import type { ChipDeCategoria } from '../services/recorteDeCategoria'

export function FiltroDeCategoria({ chips, elegida, hrefDe, conteo, nota, testid = 'filtro-categoria' }: {
  /** Las categorías presentes, ya contadas y ordenadas (`categoriasDelCorte`). */
  chips: ChipDeCategoria[]
  /** La clave puesta en la URL. */
  elegida?: string
  /** Esta misma vista con otro recorte. La regla de qué se conserva vive en la página. */
  hrefDe: (cambios: Record<string, string | undefined>) => string
  /** `{ n, total }` cuando esta fila es la que dice cuánta población quedó a la vista. En el Plantel
   *  lo escribe la fila de arriba, y repetirlo acá sería el mismo par de números dos veces. */
  conteo?: { n: number; total: number; sustantivo?: string }
  /** UNA LÍNEA, Y SÓLO CON EL RECORTE PUESTO: qué población están midiendo los totales de abajo.
   *  Con «Todas» no hay nada que aclarar, y un párrafo permanente bajo un número está prohibido. */
  nota?: string
  testid?: string
}) {
  // SIN NINGUNA CATEGORÍA QUE ELEGIR, LA FILA NO SE DIBUJA: un «Todas» solitario ocupa un renglón
  // para no ofrecer ninguna opción. Pasa en una quincena vacía o en un corte sin gente.
  if (chips.length === 0) return null
  return (
    <>
      <FiltrosSuaves
        testid={testid}
        rotulo="Categoría"
        conteo={conteo}
        opciones={[
          {
            clave: 'todas',
            etiqueta: 'Todas',
            href: hrefDe({ categoria: undefined }),
            activo: !elegida,
          },
          ...chips.map((c) => ({
            clave: c.clave,
            etiqueta: c.etiqueta,
            // CLIC EN LA CATEGORÍA YA ACTIVA LA APAGA. Sin esto, el único camino de vuelta a la lista
            // entera sería borrar el parámetro a mano en la barra de direcciones.
            href: hrefDe({ categoria: c.clave === elegida ? undefined : c.clave }),
            activo: c.clave === elegida,
            cuenta: c.cuenta,
          })),
        ]}
      />
      {elegida && nota && (
        <p
          data-testid={`${testid}-nota`}
          style={{ margin: '-4px 0 10px', fontSize: '11.5px', color: V.tenue }}
        >
          {nota}
        </p>
      )}
    </>
  )
}
