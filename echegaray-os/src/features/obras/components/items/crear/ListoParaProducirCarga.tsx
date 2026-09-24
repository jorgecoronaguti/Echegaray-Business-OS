// C10 · MC11 — LAS LECTURAS DEL CHECKLIST «LISTO PARA PRODUCIR», en un Server Component propio para que
// la página de la obra no cargue con seis consultas más. Lee el árbol, los pesos, las órdenes del cliente,
// el avance ponderado y los días hábiles, y se los da a `listoParaProducir` (puro, con test).

import type { SupabaseClient } from '@supabase/supabase-js'
import type { ReactNode } from 'react'
import { ListoParaProducir } from './ListoParaProducir'
import { listoParaProducir } from '../../../services/listoParaProducir'
import { getArbol } from '../../../services/tareasService'
import { contarOrdenesDeObra, getPonderaciones } from '../../../services/estructuraService'
import { getAvancePonderado, getDiasHabilesDeObra } from '../../../services/obrasService'
import type { ObraPanel } from '../../../types'
import { C } from '../../canon/tokens'
import { clienteDeObra } from '../../../../../shared/clientes/nombre.ts'

export async function ListoParaProducirCarga({ supabase, obraId, obra, puedeSellar, sellar, editar }: {
  supabase: SupabaseClient
  obraId: string
  obra: Pick<ObraPanel, 'cliente_nombre' | 'cliente_texto' | 'jefe_obra' | 'fecha_inicio_plan' | 'fecha_fin_plan'>
  puedeSellar: boolean
  sellar: () => Promise<{ ok: true; mensaje?: string } | { ok: false; error: string }>
  editar?: ReactNode
}) {
  const [arbol, ponds, nOrdenes, avance, dias] = await Promise.all([
    getArbol(supabase, obraId),
    getPonderaciones(supabase, obraId),
    contarOrdenesDeObra(supabase, obraId),
    getAvancePonderado(supabase, obraId),
    getDiasHabilesDeObra(supabase, obraId),
  ])
  if (arbol.error !== null || arbol.data === null) {
    return <p style={{ margin: '16px 30px', fontSize: '13px', color: C.neg }} data-testid="producir-error">No pude leer la estructura de la obra: {arbol.error ?? 'la lectura volvió vacía'}</p>
  }
  const preparacion = listoParaProducir({
    obraId,
    clienteNombre: clienteDeObra(obra),
    nOrdenes,
    jefeObra: obra.jefe_obra ?? null,
    inicioPlan: obra.fecha_inicio_plan,
    finPlan: obra.fecha_fin_plan,
    diasHabilesPlan: dias.data?.dias_habiles_plan ?? null,
    nodos: arbol.data,
    ponds: ponds.data ?? {},
    avancePct: avance.data?.avance_pct ?? null,
    costoTeorico: avance.data?.costo_teorico ?? null,
  })
  return <ListoParaProducir obraId={obraId} preparacion={preparacion} puedeSellar={puedeSellar} sellar={sellar} editar={editar} />
}
