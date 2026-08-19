// PERSONAL — la entrada al módulo. Buscar, filtrar, crear, y entrar a una ficha.
//
// El dueño dibujó esta pantalla entera y dijo *"Nada más"*: la barra de búsqueda, el botón de alta,
// los cuatro filtros y cinco columnas. Lo que NO está es tan deliberado como lo que está —ni DNI, ni
// CUIL, ni sueldo, ni teléfono, ni documentación, ni métricas—, y no está de verdad: el listado sale
// de `persona_directorio`, que no publica esos campos, así que tampoco viajan al navegador.
//
// Todo el estado vive en la URL. Es un server component entero: no hay un `useState` que se pierda
// al recargar ni una segunda copia de los datos en el navegador.

import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Callout, FormAccion, PageShell } from '@/shared/components/ui'
import { BarraFiltros } from '@/features/administracion/components/BarraFiltros'
import { FiltrosPersonal } from '@/features/administracion/components/FiltrosPersonal'
import { CamposInformacion, CamposLaboral } from '@/features/administracion/components/FormularioPersona'
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
  // ("permission denied for table personas") y el mensaje es lo que permitió encontrarlo.
  if (listado.error) {
    return (
      <PageShell title="Personal" subtitle="El legajo del personal." maxWidth="max-w-6xl">
        <p data-testid="personas-error" className="text-[13px] text-neg">
          No pude leer el legajo: {listado.error}
        </p>
      </PageShell>
    )
  }

  const personas = listado.data ?? []
  const abrirAlta = sp.nueva === '1'

  return (
    <PageShell
      title="Personal"
      subtitle="Quién trabaja en la empresa, con qué categoría, en qué cuadrilla y en qué obra."
      maxWidth="max-w-6xl"
    >
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <BarraFiltros
          accion="/administracion/personas"
          q={sp.q}
          placeholder="Nombre, DNI, CUIL o cuadrilla"
          testid="filtros-personas"
          extra={{ f: filtro === 'todos' ? undefined : filtro }}
        />
        <div className="flex items-center gap-3">
          {/* Cuadrillas vive DENTRO de Personal —el dueño pidió no armar un módulo aparte—, así que
              se entra por acá y no por una solapa nueva en la barra de Administración. */}
          <Link
            href="/administracion/personas/cuadrillas"
            data-testid="ir-cuadrillas"
            className="text-[12px] text-muted hover:text-ink hover:underline"
          >Cuadrillas</Link>
          <a
            href={armarHref(sp, filtro, true)}
            data-testid="nueva-persona"
            className="rounded-control bg-slate-900 px-3.5 py-1.5 text-[13px] font-medium text-white hover:bg-slate-700"
          >+ Nueva persona</a>
        </div>
      </div>

      <div className="mb-3">
        <FiltrosPersonal activo={filtro} hrefDe={(f) => armarHref(sp, f)} />
      </div>

      {abrirAlta && (
        <div className="mb-4 rounded-xl border border-line bg-white p-4" data-testid="panel-alta">
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h2 className="text-[13px] font-semibold text-ink">Nueva persona</h2>
            <a href={armarHref(sp, filtro)} data-testid="cerrar-alta" className="text-[12px] text-muted hover:text-ink">
              cerrar
            </a>
          </div>
          <FormAccion accion={crearPersona} testid="form-persona-alta" enviar="Crear" limpiarAlOk mensajeOk="Persona creada.">
            <div className="space-y-4">
              <CamposInformacion persona={null} />
              <div className="border-t border-line pt-4"><CamposLaboral persona={null} /></div>
            </div>
          </FormAccion>
        </div>
      )}

      <TablaPersonas personas={personas} />

      {personas.length === 0 && filtro === 'en_obra' && (
        <div className="mt-3">
          <Callout>
            Nadie tiene una asignación vigente. La obra actual se DERIVA de la asignación: se carga
            desde la solapa Personal de cada obra.
          </Callout>
        </div>
      )}

      <p className="mt-3 px-1 text-[11px] text-faint">
        {personas.length} {personas.length === 1 ? 'persona' : 'personas'} ·
        {' '}cuadrilla y obra actual se derivan de la pertenencia y la asignación vigentes: no se
        cargan acá.
      </p>
    </PageShell>
  )
}
