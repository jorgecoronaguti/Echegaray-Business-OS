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
import { Campo, CTRL, PageShell } from '@/shared/components/ui'
import { PanelEdicion } from '@/features/administracion/components/PanelEdicion'
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
  const alta = sp.c === 'nueva'
  const abierta = alta ? null : cuadrillas.find((c) => c.id === sp.c) ?? null
  const integrantes = abierta ? (await getIntegrantes(supabase, abierta.id, true)).data ?? [] : []
  const activas = (obras.data ?? []).filter((o) => o.estado !== 'cerrada')

  return (
    <PageShell
      eyebrow={<Link href="/administracion/personas" className="hover:underline">← Personal</Link>}
      title="Cuadrillas"
      maxWidth="max-w-6xl"
    >
      {/* UNA LÍNEA: el filtro discreto y la acción primaria. El alta abre el MISMO panel lateral
          que la edición — un formulario siempre abierto arriba de la tabla ocupa la mitad de la
          pantalla para algo que se hace una vez cada tanto. */}
      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        <Link
          href={href({ ...sp, archivadas: verArchivadas ? undefined : '1' })}
          data-testid="ver-archivadas"
          className="text-[12px] text-muted hover:text-ink hover:underline"
        >{verArchivadas ? 'Ver sólo las activas' : 'Ver también las archivadas'}</Link>
        <Link
          href={href(sp, 'nueva')}
          data-testid="nueva-cuadrilla"
          className="ml-auto rounded-control bg-slate-900 px-3.5 py-1.5 text-[13px] font-medium text-white hover:bg-slate-700"
        >+ Nueva cuadrilla</Link>
      </div>

      <div className="flex flex-col gap-4 lg:flex-row">
        <div className="min-w-0 flex-1">
          {cuadrillas.length === 0
            ? (
                <p data-testid="cuadrillas-vacio" className="rounded-xl border border-line bg-white px-4 py-8 text-center text-[13px] text-muted">
                  Todavía no hay cuadrillas cargadas.
                </p>
              )
            : (
                <div className="overflow-hidden rounded-xl border border-line bg-white">
                  <TablaCuadrillas
                    cuadrillas={cuadrillas}
                    abierta={abierta?.id}
                    hrefDe={(id) => href(sp, id)}
                  />
                </div>
              )}
        </div>

        {alta && (
          <PanelEdicion
            titulo="Nueva cuadrilla"
            accion={crearCuadrilla}
            cerrarHref={href({ ...sp, c: undefined })}
            enviar="Crear"
            testid="panel-alta-cuadrilla"
          >
            <div className="grid grid-cols-2 gap-2.5">
              <Campo label="Nombre" ancho="col-span-2">
                <input name="nombre" required maxLength={120} className={CTRL} data-testid="nueva-cuadrilla-nombre" autoFocus />
              </Campo>
              <Campo label="Responsable / capataz" ancho="col-span-2" ayuda="Una persona del legajo, no un texto.">
                <select name="responsable_id" defaultValue="" className={CTRL}>
                  <option value="">sin responsable</option>
                  {(plantel.data ?? []).map((p) => (
                    <option key={p.id} value={p.id}>{p.nombre_completo}</option>
                  ))}
                </select>
              </Campo>
            </div>
          </PanelEdicion>
        )}

        {abierta && (
          <PanelCuadrilla
            cuadrilla={abierta}
            integrantes={integrantes}
            plantel={plantel.data ?? []}
            obras={activas.map((o) => ({ id: o.obra_id, nombre: o.nombre }))}
            // `bind` y NO una arrow: una función nueva la rechaza React en runtime y la pantalla
            // queda en blanco sin que typecheck ni build lo vean.
            editar={editarCuadrilla.bind(null, abierta.id)}
            archivar={archivarCuadrilla.bind(null, abierta.id)}
            agregar={agregarIntegrante.bind(null, abierta.id)}
            quitar={quitarIntegrante}
            asignarAObra={asignarCuadrillaAObra}
            cerrarHref={href({ ...sp, c: undefined })}
          />
        )}
      </div>
    </PageShell>
  )
}
