// EL NIVEL 3 DE «TRABAJO» — las cuatro maneras de operar el trabajo de la obra, en una sola lista.
//
// ═══ QUÉ DEFECTO CIERRA ═══
//
// Cronograma y Subcontratos son pantallas de la solapa Trabajo que viven en su propia URL. Desde
// ellas no había forma de llegar al parte diario ni a la lista de tareas sin volver primero al
// workspace: la cabecera marca «Trabajo» como solapa activa y ahí se terminaba la navegación.
// Subcontratos tenía su propia lista de DOS ítems escrita a mano; el Cronograma, ninguna.
//
// El canónico 07 dibuja las cuatro —`Tareas · Cronograma · Parte diario · Subcontratos`— y son las
// mismas cuatro que ya emite el workspace. Acá se emiten una vez para las pantallas satélite: dos
// listas escritas a mano se separan en el primer rótulo que cambie, y ya estaban separadas
// («Actividades» en Subcontratos, «Tareas» en el workspace, para el mismo destino).
//
// EL WORKSPACE TODAVÍA EMITE SU PROPIA COPIA. `page.tsx` de la obra dibuja estas mismas cuatro a
// mano; es la pantalla 03, que en esta tanda tiene otro dueño, y tocarla desde acá sería pisarle el
// trabajo. Unificarla es cambiar ese bloque por `<SubTabsTrabajo obraId activa={subTareas} />` —una
// línea— y queda declarado como pendiente.
//
// ═══ POR QUÉ EN LA 07 NO QUEDA NINGUNA ACTIVA, Y ESO ES LO CORRECTO ═══
//
// En este repositorio hay DOS cronogramas y no es un descuido (ver el bloque largo de
// `services/vistasObra.ts`): `?vista=tareas&sub=gantt` dibuja el plan COMO ESTÁ CARGADO y
// `/obras/<obra>/cronograma` lo recalcula desde la secuencia, que es de donde salen la holgura y el
// camino crítico. El canónico dibuja UNO solo. Marcar «Cronograma» activa en la pantalla calculada
// afirmaría que son la misma vista; dejar la lista sin activa dice la verdad —esta pantalla no es
// ninguna de las cuatro— y quien la mira ya sabe dónde está por la línea meta de la cabecera, que
// dice «Cronograma calculado». El día que el dueño unifique los dos, este archivo es lo único que
// cambia.

import { SubTabs } from '@/shared/components/ds'
import { hrefSubcontratos, SUBS_TAREAS, type SubTareas } from '../services/vistasObra'

/** Cuál de las cuatro está activa. `ninguna` para las pantallas que cuelgan de Trabajo y no son
 *  ninguna de ellas — hoy, el cronograma calculado. */
export type PantallaDeTrabajo = SubTareas | 'subcontratos' | 'ninguna'

export function SubTabsTrabajo({ obraId, activa }: { obraId: string; activa: PantallaDeTrabajo }) {
  return (
    <SubTabs
      testid="subtabs-trabajo"
      items={[
        ...SUBS_TAREAS.map((sv) => ({
          href: `/obras/${obraId}?vista=tareas&sub=${sv.id}`,
          label: sv.label,
          activo: activa === sv.id,
          testid: `sub-${sv.id}`,
        })),
        // LA PANTALLA 10 ENTRA POR ACÁ: es otra URL, no otra sub-vista. Es el MISMO alcance de la
        // obra mirado desde el lado del tercero que lo ejecuta, y por eso cuelga de Trabajo en vez
        // de ser una séptima solapa — el tope de seis está declarado en `page.tsx` de la obra.
        {
          href: hrefSubcontratos(obraId),
          label: 'Subcontratos',
          activo: activa === 'subcontratos',
          testid: 'sub-subcontratos',
        },
      ]}
    />
  )
}
