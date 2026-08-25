import { AvisoError, TopBarDetalle } from '@/shared/components/movil/Piezas'
import { FormularioMasivo } from '@/features/jefe/components/FormularioMasivo'
import { SinObra } from '@/features/jefe/components/SinObra'
import { contextoDeObra, hoyEnObra } from '@/features/jefe/services/contexto'
import { getActividades, getArbol } from '@/features/jefe/services/jefeService'
import { frentePorTarea } from '@/features/jefe/services/frentes'
import { aplicarAvanceMasivo } from '@/features/jefe/services/actionsMasivo'
import { conObra } from '@/features/jefe/services/navegacion'

// J04 · AVANCE MASIVO — la carga de fin de jornada, de una sola pasada.
//
// Es la acción del día de J01 y J02: el jefe llega al obrador, abre esto, toca las que avanzaron y
// pone a cuánto llegaron. Cada fila queda marcada `masivo = true` en la base — un 75 % aplicado a
// veinte tareas a la vez no vale lo mismo que uno medido de a uno, y eso queda dicho en el dato.

export const dynamic = 'force-dynamic'

type Estado = { ok: boolean; mensaje: string } | null

export default async function JefeAvanceMasivoPage({
  searchParams,
}: {
  searchParams: Promise<{ obra?: string }>
}) {
  const { obra: pedida } = await searchParams
  const { supabase, obra, error } = await contextoDeObra(pedida)
  if (!obra) return <SinObra error={error} />

  const [actividades, arbol] = await Promise.all([
    getActividades(supabase, obra.id),
    getArbol(supabase, obra.id),
  ])
  const volver = { href: conObra('/obra/hoy', obra.id), label: 'Hoy' }

  if (actividades.error) {
    return (
      <>
        <TopBarDetalle volver={volver} testidVolver="volver-jefe" titulo="Avance del día" sub={obra.nombre} />
        <div style={{ padding: '16px 16px 24px' }}>
          <AvisoError testid="jefe-masivo-error">{actividades.error}</AvisoError>
        </div>
      </>
    )
  }

  const aplicar = async (_estado: Estado, form: FormData): Promise<Estado> => {
    'use server'
    const r = await aplicarAvanceMasivo(obra.id, form)
    return r.ok ? { ok: true, mensaje: r.mensaje ?? 'Aplicado' } : { ok: false, mensaje: r.error }
  }

  return (
    <FormularioMasivo
      actividades={actividades.data ?? []}
      frentes={Object.fromEntries(
        [...frentePorTarea(arbol.data ?? [])].map(([id, f]) => [id, f.nombre]))}
      fecha={hoyEnObra()}
      obraNombre={obra.nombre}
      volver={volver}
      accion={aplicar}
    />
  )
}
