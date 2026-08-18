// PROVEEDORES — el maestro canónico y la cola de nombres sin resolver.
//
// El dueño (19/08/2026): *"Proveedor debe ser entidad canónica administrable y evitar duplicados
// por texto libre"*. Las dos mitades de esa frase son las dos sub-vistas de esta pantalla:
//
//   MAESTRO   quién es un proveedor, con el CUIT como identidad.
//   RESOLVER  los nombres que el Sheet trae sueltos y todavía no son nadie.
//
// La segunda es la que de verdad evita el duplicado: sin un lugar donde decir "este texto es este
// proveedor", el maestro se llena de variantes del mismo nombre y nadie sabe cuál es la buena.
// Cuál está abierta viaja en la URL, como todo el resto del estado de esta pantalla.

import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { PageShell } from '@/shared/components/ui'
import { BarraFiltros, SelectFiltro } from '@/features/administracion/components/BarraFiltros'
import { ColaNombres } from '@/features/administracion/components/ColaNombres'
import { PanelProveedor } from '@/features/administracion/components/PanelProveedor'
import { TablaProveedores } from '@/features/administracion/components/TablaProveedores'
import {
  getNombresPendientes, getNombresResueltos, getProveedor, getProveedores,
  type FiltroActivo,
} from '@/features/administracion/services/proveedoresService'
import {
  archivarProveedor, crearProveedor, crearYVincular, deshacerResolucion,
  editarProveedor, marcarNoEsProveedor, vincularNombre,
} from '@/features/administracion/services/proveedoresActions'
import type { Proveedor } from '@/features/administracion/types'

export const dynamic = 'force-dynamic'

const ACTIVOS: { valor: FiltroActivo; etiqueta: string }[] = [
  { valor: 'activos', etiqueta: 'Activos' },
  { valor: 'archivados', etiqueta: 'Archivados' },
  { valor: 'todos', etiqueta: 'Todos' },
]

type Busqueda = { q?: string; activo?: string; p?: string; vista?: string }

function armarHref(base: Busqueda, cambios: Partial<Busqueda> = {}): string {
  const v = { ...base, ...cambios }
  const params = new URLSearchParams()
  if (v.q) params.set('q', v.q)
  if (v.activo) params.set('activo', v.activo)
  if (v.vista) params.set('vista', v.vista)
  if (v.p) params.set('p', v.p)
  const qs = params.toString()
  return `/administracion/proveedores${qs ? `?${qs}` : ''}`
}

function Pestana({ href, activa, children, testid }: {
  href: string; activa: boolean; children: string; testid: string
}) {
  return (
    <Link
      href={href}
      data-testid={testid}
      className={`border-b-2 px-1 pb-1.5 text-[13px] ${
        activa ? 'border-slate-900 font-medium text-ink' : 'border-transparent text-muted hover:text-ink'
      }`}
    >
      {children}
    </Link>
  )
}

export default async function ProveedoresPage({ searchParams }: { searchParams: Promise<Busqueda> }) {
  const sp = await searchParams
  const vista = sp.vista === 'resolver' ? 'resolver' : 'maestro'
  const activo = (ACTIVOS.find((a) => a.valor === sp.activo)?.valor ?? 'activos') as FiltroActivo
  const supabase = await createClient()

  // El maestro se lee siempre: la cola necesita la lista completa de proveedores activos para poder
  // ofrecerlos como destino de una vinculación.
  const [listado, activosParaVincular] = await Promise.all([
    getProveedores(supabase, { q: sp.q, activo }),
    getProveedores(supabase, { activo: 'activos' }),
  ])

  if (listado.error) {
    return (
      <PageShell title="Proveedores" subtitle="El maestro de proveedores.">
        <p data-testid="proveedores-error" className="text-[13px] text-neg">
          No pude leer los proveedores: {listado.error}
        </p>
      </PageShell>
    )
  }

  const proveedores = listado.data ?? []
  const abrirAlta = sp.p === 'nuevo'
  const seleccionadoId = abrirAlta ? undefined : sp.p
  let seleccionado: Proveedor | null = null
  if (seleccionadoId) {
    const r = await getProveedor(supabase, seleccionadoId)
    if (r.error) redirect(armarHref(sp, { p: undefined }))
    seleccionado = r.data
  }

  const [pendientes, resueltos] = vista === 'resolver'
    ? await Promise.all([getNombresPendientes(supabase), getNombresResueltos(supabase)])
    : [null, null]

  const panelAbierto = abrirAlta || seleccionado !== null

  return (
    <PageShell
      title="Proveedores"
      subtitle="A quién se le compra, identificado por CUIT."
      maxWidth="max-w-6xl"
    >
      <nav className="mb-4 flex gap-4 border-b border-line" data-testid="vistas-proveedores">
        <Pestana href={armarHref(sp, { vista: undefined })} activa={vista === 'maestro'} testid="vista-maestro">
          Proveedores
        </Pestana>
        <Pestana href={armarHref(sp, { vista: 'resolver', p: undefined })} activa={vista === 'resolver'} testid="vista-resolver">
          Nombres sin asignar
        </Pestana>
      </nav>

      {vista === 'maestro'
        ? (
            <>
              <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
                <BarraFiltros
                  accion="/administracion/proveedores"
                  q={sp.q}
                  placeholder="Nombre, razón social o CUIT"
                  testid="filtros-proveedores"
                  extra={{ p: sp.p }}
                >
                  <SelectFiltro
                    label="Estado" name="activo" valor={activo} testid="filtro-activo"
                    opciones={ACTIVOS.map((a) => ({ valor: a.valor, etiqueta: a.etiqueta }))}
                  />
                </BarraFiltros>
                <a
                  href={armarHref(sp, { p: 'nuevo' })}
                  data-testid="nuevo-proveedor"
                  className="rounded-control bg-slate-900 px-3.5 py-1.5 text-[13px] font-medium text-white hover:bg-slate-700"
                >
                  Nuevo proveedor
                </a>
              </div>

              <div className="flex flex-col overflow-hidden rounded-xl border border-line bg-white lg:flex-row">
                <div className="min-w-0 flex-1">
                  <TablaProveedores
                    proveedores={proveedores}
                    seleccionado={seleccionado?.id}
                    hrefDe={(id) => armarHref(sp, { p: id })}
                  />
                </div>
                {panelAbierto && (
                  <PanelProveedor
                    proveedor={seleccionado}
                    crear={crearProveedor}
                    editar={seleccionado ? editarProveedor.bind(null, seleccionado.id) : crearProveedor}
                    archivar={archivarProveedor}
                    cerrarHref={armarHref(sp, { p: undefined })}
                  />
                )}
              </div>

              <p className="mt-3 px-1 text-[11px] text-faint">
                {proveedores.length} {proveedores.length === 1 ? 'proveedor' : 'proveedores'}.
                El CUIT es lo que identifica a un proveedor: dos fichas con el mismo CUIT no pueden existir.
              </p>
            </>
          )
        : (
            <>
              {pendientes?.error
                ? (
                    <p data-testid="cola-error" className="text-[13px] text-neg">
                      No pude leer los nombres de compras: {pendientes.error}
                    </p>
                  )
                : (
                    <ColaNombres
                      pendientes={pendientes?.data ?? []}
                      resueltos={resueltos?.data ?? []}
                      proveedores={activosParaVincular.data ?? []}
                      vincular={vincularNombre}
                      crearYVincular={crearYVincular}
                      noEsProveedor={marcarNoEsProveedor}
                      deshacer={deshacerResolucion}
                    />
                  )}
              <p className="mt-3 px-1 text-[11px] text-faint">
                Estos nombres vienen de la columna de proveedor de Compras, que es texto libre. El OS
                no los vincula solo: sólo reconoce el nombre escrito exactamente igual. El resto lo
                decide una persona.
              </p>
            </>
          )}
    </PageShell>
  )
}
