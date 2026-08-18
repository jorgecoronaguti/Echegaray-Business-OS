// PERSONAS — la pantalla donde Administración gestiona el legajo sin entrar a Supabase.
//
// El dueño (19/08/2026): *"El usuario Administración debe poder gestionar datos normales sin entrar
// a Supabase, SQL o código"*. Hasta hoy NO existía forma de dar de alta una persona desde la web:
// `personas` sólo se leía, desde la pantalla de Personal de la obra, para poder elegir un nombre.
//
// Todo el estado de la pantalla —qué se buscó, qué filtro está puesto, qué ficha está abierta— vive
// en la URL. Es un server component entero: no hay un `useState` que se pierda al recargar ni una
// segunda copia de los datos en el navegador.

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { PageShell } from '@/shared/components/ui'
import { BarraFiltros, SelectFiltro } from '@/features/administracion/components/BarraFiltros'
import { PanelPersona } from '@/features/administracion/components/PanelPersona'
import { TablaPersonas } from '@/features/administracion/components/TablaPersonas'
import {
  getAsignacionesDe, getCategoriasEnUso, getConteoAsignaciones, getPersona, getPersonas,
  type FiltroEstado,
} from '@/features/administracion/services/personasService'
import {
  crearPersona, darDeBaja, editarPersona, reincorporar,
} from '@/features/administracion/services/personasActions'
import { CATEGORIA_LABEL, etiquetaCategoria, type Persona } from '@/features/administracion/types'

export const dynamic = 'force-dynamic'

const ESTADOS: { valor: FiltroEstado; etiqueta: string }[] = [
  { valor: 'activas', etiqueta: 'En el plantel' },
  { valor: 'egresadas', etiqueta: 'Egresadas' },
  { valor: 'todas', etiqueta: 'Todas' },
]

type Busqueda = { q?: string; estado?: string; categoria?: string; p?: string }

/** El enlace que conserva los filtros vigentes y cambia sólo la ficha abierta. */
function armarHref(base: Busqueda, p?: string): string {
  const params = new URLSearchParams()
  if (base.q) params.set('q', base.q)
  if (base.estado) params.set('estado', base.estado)
  if (base.categoria) params.set('categoria', base.categoria)
  if (p) params.set('p', p)
  const qs = params.toString()
  return `/administracion/personas${qs ? `?${qs}` : ''}`
}

export default async function PersonasPage({ searchParams }: { searchParams: Promise<Busqueda> }) {
  const sp = await searchParams
  const estado = (ESTADOS.find((e) => e.valor === sp.estado)?.valor ?? 'activas') as FiltroEstado
  const supabase = await createClient()

  const [listado, categorias] = await Promise.all([
    getPersonas(supabase, { q: sp.q, estado, categoria: sp.categoria }),
    getCategoriasEnUso(supabase),
  ])

  // EL ERROR DE LA BASE SE MUESTRA, NO SE PINTA COMO LISTA VACÍA. Una tabla en blanco porque la RLS
  // rechazó la consulta es indistinguible de una tabla en blanco porque no hay personas, y la
  // diferencia entre las dos es todo.
  if (listado.error) {
    return (
      <PageShell title="Personas" subtitle="El legajo del personal.">
        <p data-testid="personas-error" className="text-[13px] text-neg">
          No pude leer el legajo: {listado.error}
        </p>
      </PageShell>
    )
  }

  const personas = listado.data ?? []
  const abrirAlta = sp.p === 'nueva'
  const seleccionadaId = abrirAlta ? undefined : sp.p

  // Una ficha pedida por URL que no existe (o que el filtro esconde) se busca igual en la base: si
  // no, editar a alguien y filtrarlo sin querer dejaría el panel vacío sin explicación.
  let seleccionada: Persona | null = null
  if (seleccionadaId) {
    const r = await getPersona(supabase, seleccionadaId)
    if (r.error) redirect(armarHref(sp))
    seleccionada = r.data
  }

  const [asignaciones, conteo] = await Promise.all([
    seleccionada ? getAsignacionesDe(supabase, seleccionada.id) : null,
    getConteoAsignaciones(supabase, personas.map((p) => p.id)),
  ])

  const panelAbierto = abrirAlta || seleccionada !== null

  return (
    <PageShell
      title="Personas"
      subtitle="Quién trabaja en la empresa, con qué categoría y en qué obras está."
      maxWidth="max-w-6xl"
    >
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <BarraFiltros
          accion="/administracion/personas"
          q={sp.q}
          placeholder="Nombre, DNI o CUIL"
          testid="filtros-personas"
          extra={{ p: sp.p }}
        >
          <SelectFiltro
            label="Estado" name="estado" valor={estado} testid="filtro-estado"
            opciones={ESTADOS.map((e) => ({ valor: e.valor, etiqueta: e.etiqueta }))}
          />
          <SelectFiltro
            label="Categoría" name="categoria" valor={sp.categoria} testid="filtro-categoria"
            opciones={[
              { valor: '', etiqueta: 'Todas' },
              ...categorias.map((c) => ({ valor: c, etiqueta: etiquetaCategoria(c) })),
            ]}
          />
        </BarraFiltros>
        <a
          href={armarHref(sp, 'nueva')}
          data-testid="nueva-persona"
          className="rounded-control bg-slate-900 px-3.5 py-1.5 text-[13px] font-medium text-white hover:bg-slate-700"
        >
          Nueva persona
        </a>
      </div>

      <div className="flex flex-col overflow-hidden rounded-xl border border-line bg-white lg:flex-row">
        <div className="min-w-0 flex-1">
          <TablaPersonas
            personas={personas}
            seleccionada={seleccionada?.id}
            hrefDe={(id) => armarHref(sp, id)}
            conteoAsignaciones={conteo}
          />
        </div>

        {panelAbierto && (
          <PanelPersona
            persona={seleccionada}
            asignaciones={asignaciones?.data ?? []}
            crear={crearPersona}
            editar={seleccionada ? editarPersona.bind(null, seleccionada.id) : crearPersona}
            baja={darDeBaja}
            alta={reincorporar}
            cerrarHref={armarHref(sp)}
          />
        )}
      </div>

      <p className="mt-3 px-1 text-[11px] text-faint">
        {personas.length} {personas.length === 1 ? 'persona' : 'personas'}
        {estado === 'activas' ? ' en el plantel' : estado === 'egresadas' ? ' egresadas' : ''}
        {' · '}
        las categorías son las del convenio UOCRA:{' '}
        {Object.values(CATEGORIA_LABEL).join(', ').toLowerCase()}.
      </p>
    </PageShell>
  )
}
