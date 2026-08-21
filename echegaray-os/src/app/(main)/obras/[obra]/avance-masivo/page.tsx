// ═══ 06 · AVANCE MASIVO ═══
//
// Cerrar veinte actividades de un frente de a una son veinte pantallas. Acá el árbol se aplana, se
// tilda por rango y se escribe una vez — y la columna «QUEDARÁ EN» muestra, antes de escribir, qué
// va a quedar en cada fila y cuáles no se van a tocar.

import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getObra } from '@/features/obras/services/obrasService'
import { getArbol } from '@/features/obras/services/tareasService'
import { getCuadrillas } from '@/features/obras/services/personalService'
import { aplicarEnLote } from '@/features/obras/services/actionsAvance'
import { AvanceMasivo } from '@/features/obras/components/AvanceMasivo'
import { porcentaje } from '@/features/obras/components/formato'

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
        <div className="mb-4 border-l-4 border-marca bg-accent px-4 py-2.5">
          <p className="text-[11px] text-faint">
            <Link href={`/obras/${obraId}?vista=tareas`} className="hover:underline">← {obra.nombre} · Tareas</Link>
          </p>
          <div className="flex flex-wrap items-baseline gap-x-5">
            <h1 className="text-[20px] font-semibold text-white">Avance masivo</h1>
            <span className="text-[11.5px] text-line">
              Avance {porcentaje(obra.avance_pct) ?? 'sin medir'}
              {obra.fecha_fin_plan && ` · Fin plan ${obra.fecha_fin_plan.slice(8, 10)}/${obra.fecha_fin_plan.slice(5, 7)}`}
            </span>
          </div>
        </div>

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
