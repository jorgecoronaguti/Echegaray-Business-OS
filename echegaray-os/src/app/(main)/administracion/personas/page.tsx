// PERSONAL — la entrada al módulo. Buscar, filtrar, crear, y entrar a una ficha.
//
// El dueño dibujó esta pantalla y dijo *"Nada más salvo razón operativa fuerte"*: una línea con la
// búsqueda, los cuatro filtros y el alta, y debajo cinco columnas. Lo que NO está es tan deliberado
// como lo que está —ni DNI, ni CUIL, ni teléfono, ni documentos, ni HH— y no está de verdad: el
// listado sale de `persona_directorio`, que no publica esos campos, así que tampoco viajan al
// navegador aunque alguien abra las herramientas de desarrollo.
//
// Es una vista de GESTIÓN, no un tablero: sin tarjetas, sin cifras de arriba, sin gráficos. Todo el
// estado vive en la URL y es un server component entero — no hay un `useState` que se pierda al
// recargar ni una segunda copia de los datos en el navegador.

import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { PageShell } from '@/shared/components/ui'
import { BarraFiltros } from '@/features/administracion/components/BarraFiltros'
import { FiltrosPersonal } from '@/features/administracion/components/FiltrosPersonal'
import { CamposAlta } from '@/features/administracion/components/FormularioPersona'
import { PanelEdicion } from '@/features/administracion/components/PanelEdicion'
import { TablaPersonas } from '@/features/administracion/components/TablaPersonas'
import { FILTROS, getDirectorio, type FiltroPersonal } from '@/features/administracion/services/personasService'
import { crearPersona } from '@/features/administracion/services/personasActions'

export const dynamic = 'force-dynamic'

type Busqueda = { q?: string; f?: string; nueva?: string }

function armarHref(base: Busqueda, filtro?: FiltroPersonal, nueva?: boolean): string {
  const params = new URLSearchParams()
  if (base.q) params.set('q', base.q)
  const f = filtro ?? base.f
  if (f && f !== 'todos') params.set('f', f)
  if (nueva) params.set('nueva', '1')
  const qs = params.toString()
  return `/administracion/personas${qs ? `?${qs}` : ''}`
}

export default async function PersonalPage({ searchParams }: { searchParams: Promise<Busqueda> }) {
  const sp = await searchParams
  const filtro = (FILTROS.find((f) => f.valor === sp.f)?.valor ?? 'todos') as FiltroPersonal
  const supabase = await createClient()
  const listado = await getDirectorio(supabase, filtro, sp.q)

  // EL ERROR DE LA BASE SE MUESTRA, NO SE PINTA COMO LISTA VACÍA. Una tabla en blanco porque la RLS
  // rechazó la consulta es indistinguible de una tabla en blanco porque no hay personas, y la
  // diferencia entre las dos es todo. Esta pantalla estuvo muerta un día por eso mismo
  // ("permission denied for table personas") y este mensaje es lo que permitió encontrarlo.
  if (listado.error) {
    return (
      <PageShell title="Personal" maxWidth="max-w-6xl">
        <p data-testid="personas-error" className="text-[13px] text-neg">
          No pude leer el legajo: {listado.error}
        </p>
      </PageShell>
    )
  }

  const personas = listado.data ?? []

  return (
    <PageShell title="Personal" maxWidth="max-w-6xl">
      {/* UNA SOLA LÍNEA: buscar · filtros · la acción primaria. Cuadrillas va discreta al lado
          porque es navegación, no una acción — y vive DENTRO de Personal, no como sección nueva. */}
      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="w-52 shrink-0">
          <BarraFiltros
            accion="/administracion/personas"
            q={sp.q}
            placeholder="Buscar…"
            testid="filtros-personas"
            compacta
            extra={{ f: filtro === 'todos' ? undefined : filtro }}
          />
        </div>
        <FiltrosPersonal activo={filtro} hrefDe={(f) => armarHref(sp, f)} />
        <div className="ml-auto flex items-center gap-4">
          <Link
            href="/administracion/personas/cuadrillas"
            data-testid="ir-cuadrillas"
            className="text-[12px] text-muted hover:text-ink hover:underline"
          >Cuadrillas</Link>
          <Link
            href={armarHref(sp, filtro, true)}
            data-testid="nueva-persona"
            className="rounded-control bg-slate-900 px-3.5 py-1.5 text-[13px] font-medium text-white hover:bg-slate-700"
          >+ Nueva persona</Link>
        </div>
      </div>

      <div className="flex flex-col gap-4 lg:flex-row">
        <div className="min-w-0 flex-1">
          {personas.length === 0
            ? (
                // ESTADO VACÍO SIMPLE Y ACCIONABLE: dice qué pasa y qué hacer, en una línea.
                <p data-testid="personas-vacio" className="rounded-xl border border-line bg-white px-4 py-8 text-center text-[13px] text-muted">
                  {filtro === 'sin_asignar' ? 'Todo el plantel está asignado a una obra.'
                    : filtro === 'en_obra' ? 'Nadie tiene una asignación vigente. Se asigna desde la solapa Personal de la obra.'
                      : filtro === 'inactivos' ? 'Nadie egresó del plantel.'
                        : sp.q ? `Ninguna persona coincide con «${sp.q}».`
                          : 'Todavía no hay personas cargadas.'}
                </p>
              )
            : <TablaPersonas personas={personas} />}
        </div>

        {sp.nueva === '1' && (
          <PanelEdicion
            titulo="Nueva persona"
            accion={crearPersona}
            cerrarHref={armarHref(sp, filtro)}
            enviar="Crear"
            testid="panel-alta-persona"
          >
            <CamposAlta />
          </PanelEdicion>
        )}
      </div>

      <p className="mt-3 px-1 text-[11px] text-faint">
        {personas.length} {personas.length === 1 ? 'persona' : 'personas'}
      </p>
    </PageShell>
  )
}
