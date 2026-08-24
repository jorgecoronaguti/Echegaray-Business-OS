// ═══ 06 · AVANCE MASIVO ═══
//
// Cerrar veinte actividades de un frente de a una son veinte pantallas. Acá el árbol se aplana, se
// tilda por rango y se escribe una vez — y la columna «QUEDARÁ EN» muestra, antes de escribir, qué
// va a quedar en cada fila y cuáles no se van a tocar.

import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getObra } from '@/features/obras/services/obrasService'
import { getArbol } from '@/features/obras/services/tareasService'
import { getCuadrillas } from '@/features/obras/services/personalService'
import { aplicarEnLote } from '@/features/obras/services/actionsAvance'
import { AvanceMasivo } from '@/features/obras/components/AvanceMasivo'
import { EntityHeader } from '@/shared/components/ds'
import { fecha, porcentaje } from '@/features/obras/components/formato'

export const dynamic = 'force-dynamic'

export default async function AvanceMasivoPage({ params }: { params: Promise<{ obra: string }> }) {
  const { obra: obraId } = await params
  const supabase = await createClient()
  const [{ data: obra }, arbol, cuadrillas] = await Promise.all([
    getObra(supabase, obraId),
    getArbol(supabase, obraId),
    getCuadrillas(supabase),
  ])
  if (!obra) notFound()

  return (
    <div className="min-h-screen bg-canvas">
      <div className="w-full px-4 py-6 lg:px-10">
        {/* EL ENCABEZADO ES EL DEL SISTEMA, no un slab propio (Design 23/08). La pantalla vivía en
            una franja grafito que no usa ninguna otra vista de la obra: entrar acá parecía entrar a
            otra aplicación, que es exactamente lo que «una obra = un workspace» existe para evitar. */}
        <EntityHeader
          volverA={`/obras/${obraId}?vista=tareas`}
          volverLabel={`${obra.nombre} · Tareas`}
          titulo="Avance masivo"
          campos={[
            { rotulo: 'Avance de la obra', valor: porcentaje(obra.avance_pct), falta: 'sin medir' },
            { rotulo: 'Fin plan', valor: obra.fecha_fin_plan && fecha(obra.fecha_fin_plan), falta: 'sin fecha' },
          ]}
        />

        {arbol.error !== null || arbol.data === null ? (
          <p className="rounded-lg border border-neg/25 bg-neg-soft px-3.5 py-2.5 text-[13px] text-neg">
            No pude leer la estructura de la obra: {arbol.error ?? 'la lectura volvió vacía'}
          </p>
        ) : (
          <AvanceMasivo
            obraId={obraId}
            nodos={arbol.data}
            cuadrillas={cuadrillas}
            aplicarEnLote={aplicarEnLote.bind(null, obraId)}
          />
        )}
      </div>
    </div>
  )
}
