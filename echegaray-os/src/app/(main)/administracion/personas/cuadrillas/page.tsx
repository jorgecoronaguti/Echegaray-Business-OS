// CUADRILLAS — dentro de Personal, no como módulo aparte.
//
// El dueño: *"Resolvelo DENTRO de Personal; no armes un módulo enorme aparte."* Por eso es una
// subruta de `/administracion/personas` y no una solapa nueva en la barra de Administración, que ya
// tiene sus cinco secciones declaradas.
//
// LA CUADRILLA NO GUARDA SU OBRA NI SU GENTE «ACTUAL» EN NINGÚN CAMPO. Los integrantes son períodos
// (`cuadrilla_integrante`, con `desde`/`hasta`) y las obras se derivan de las asignaciones vigentes
// de esos integrantes. Nada de lo que se ve acá puede quedar desactualizado, porque nada se copia.

import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Callout, Campo, CTRL, FormAccion, PageShell } from '@/shared/components/ui'
import { PanelCuadrilla } from '@/features/administracion/components/PanelCuadrilla'
import { TablaCuadrillas } from '@/features/administracion/components/TablaCuadrillas'
import { getCuadrillas, getIntegrantes } from '@/features/administracion/services/cuadrillasService'
import {
  agregarIntegrante, archivarCuadrilla, crearCuadrilla, editarCuadrilla, quitarIntegrante,
} from '@/features/administracion/services/cuadrillasActions'
import { asignarCuadrillaAObra } from '@/features/obras/services/actionsPersonal'
import { getPersonas } from '@/features/obras/services/personalService'
import { getPortafolio } from '@/features/obras/services/obrasService'

export const dynamic = 'force-dynamic'

type Busqueda = { c?: string; archivadas?: string }

const href = (sp: Busqueda, c?: string) => {
  const p = new URLSearchParams()
  if (sp.archivadas) p.set('archivadas', sp.archivadas)
  if (c) p.set('c', c)
  const qs = p.toString()
  return `/administracion/personas/cuadrillas${qs ? `?${qs}` : ''}`
}

export default async function CuadrillasPage({ searchParams }: { searchParams: Promise<Busqueda> }) {
  const sp = await searchParams
  const supabase = await createClient()
  const verArchivadas = sp.archivadas === '1'

  const [listado, plantel, obras] = await Promise.all([
    getCuadrillas(supabase, verArchivadas),
    getPersonas(supabase),
    getPortafolio(supabase),
  ])

  if (listado.error) {
    return (
      <PageShell title="Cuadrillas" maxWidth="max-w-6xl">
        <p data-testid="cuadrillas-error" className="text-[13px] text-neg">
          No pude leer las cuadrillas: {listado.error}
        </p>
      </PageShell>
    )
  }

  const cuadrillas = listado.data ?? []
  const abierta = cuadrillas.find((c) => c.id === sp.c) ?? null
  const integrantes = abierta ? (await getIntegrantes(supabase, abierta.id, true)).data ?? [] : []
  const activas = (obras.data ?? []).filter((o) => o.estado !== 'cerrada')

  return (
    <PageShell
      eyebrow={<Link href="/administracion/personas" className="hover:underline">← Personal</Link>}
      title="Cuadrillas"
      subtitle="Quién conduce cada cuadrilla, quiénes la integran hoy y en qué obra está trabajando."
      maxWidth="max-w-6xl"
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <Link
          href={href({ ...sp, archivadas: verArchivadas ? undefined : '1' })}
          data-testid="ver-archivadas"
          className="text-[12px] text-muted hover:text-ink hover:underline"
        >{verArchivadas ? 'Ver sólo las activas' : 'Ver también las archivadas'}</Link>
      </div>

      <div className="mb-4 rounded-xl border border-line bg-white p-4" data-testid="alta-cuadrilla">
        <h2 className="mb-2 text-[13px] font-semibold text-ink">Nueva cuadrilla</h2>
        <FormAccion accion={crearCuadrilla} testid="form-cuadrilla-alta" enviar="Crear" limpiarAlOk mensajeOk="Cuadrilla creada.">
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            <Campo label="Nombre" ancho="col-span-2">
              <input name="nombre" required maxLength={120} className={CTRL} data-testid="nueva-cuadrilla-nombre" />
            </Campo>
            <Campo label="Responsable / capataz" ancho="col-span-2">
              <select name="responsable_id" defaultValue="" className={CTRL}>
                <option value="">sin responsable</option>
                {(plantel.data ?? []).map((p) => (
                  <option key={p.id} value={p.id}>{p.nombre_completo}</option>
                ))}
              </select>
            </Campo>
          </div>
        </FormAccion>
      </div>

      {cuadrillas.length === 0
        ? (
            <Callout>
              Todavía no hay cuadrillas. Hasta hoy la cuadrilla era el texto suelto de cada
              asignación —valores «1» y «2»—: eso no dice quién la conduce ni quién la integra.
            </Callout>
          )
        : (
            <div className="flex flex-col overflow-hidden rounded-xl border border-line bg-white lg:flex-row">
              <div className="min-w-0 flex-1">
                <TablaCuadrillas
                  cuadrillas={cuadrillas}
                  abierta={abierta?.id}
                  hrefDe={(id) => href(sp, id)}
                />
              </div>
              {abierta && (
                <PanelCuadrilla
                  cuadrilla={abierta}
                  integrantes={integrantes}
                  plantel={plantel.data ?? []}
                  obras={activas.map((o) => ({ id: o.obra_id, nombre: o.nombre }))}
                  // `bind` y NO una arrow: una función nueva la rechaza React en runtime y la
                  // pantalla queda en blanco sin que typecheck ni build lo vean.
                  editar={editarCuadrilla.bind(null, abierta.id)}
                  archivar={archivarCuadrilla.bind(null, abierta.id)}
                  agregar={agregarIntegrante.bind(null, abierta.id)}
                  quitar={quitarIntegrante}
                  asignarAObra={asignarCuadrillaAObra}
                  cerrarHref={href({ ...sp, c: undefined })}
                />
              )}
            </div>
          )}
    </PageShell>
  )
}
