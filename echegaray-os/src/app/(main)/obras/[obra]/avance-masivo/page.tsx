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
import { CabeceraDeObra } from '@/features/obras/components/CabeceraDeObra'
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
      <>
        {/* LA CABECERA ES LA DE LA OBRA, no un encabezado propio (24/08 · C-CANON §12). Ya usaba
            `EntityHeader` —el slab grafito se había retirado el 23/08— pero titulaba «Avance
            masivo» y no mostraba ni los campos de identidad ni las solapas: seguía siendo una
            cabecera distinta de la de las otras cuatro pantallas de la misma obra. El título es la
            OBRA; el nombre de la pantalla va en la línea meta, que es donde el contrato lo pone. */}
        <CabeceraDeObra
          obraId={obraId}
          obra={obra}
          // Avance masivo ES Trabajo (contrato 06): cierra de una vez las actividades del árbol.
          vistaActiva="tareas"
          pantalla="Avance masivo"
          // «Fin plan» ya lo publica la cabecera como campo de identidad — repetirlo acá sería el
          // mismo número dos veces en el mismo renglón. Queda el avance, que es lo que se va a mover.
          kpis={[
            { rotulo: 'Avance de la obra', valor: porcentaje(obra.avance_pct), falta: 'sin medir' },
          ]}
        />

        {arbol.error !== null || arbol.data === null ? (
          <p className="mx-5 mt-4 rounded-lg border border-neg/25 bg-neg-soft px-3.5 py-2.5 text-[13px] text-neg">
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
      </>
    </div>
  )
}
