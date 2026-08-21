// PROVEEDORES — el maestro canónico y la cola de nombres sin resolver.
//
// El dueño: *"Proveedor debe ser entidad canónica administrable y evitar duplicados por texto
// libre"*. Las dos mitades de esa frase son las dos sub-vistas de esta pantalla:
//
//   MAESTRO   quién es un proveedor, con el CUIT como identidad.
//   RESOLVER  los nombres que el Sheet trae sueltos y todavía no son nadie.
//
// La segunda es la que de verdad evita el duplicado: sin un lugar donde decir «este texto es este
// proveedor», el maestro se llena de variantes del mismo nombre y nadie sabe cuál es la buena.
//
// Las dos sub-vistas son NIVEL 3 —texto con subrayado, no una segunda barra de solapas—: arriba ya
// está la barra del área, y una tercera barra deja de decir dónde está parado el que mira. Cuál está
// abierta viaja en la URL, como todo el resto del estado de esta pantalla.

import { createClient } from '@/lib/supabase/server'
import { PageShell } from '@/shared/components/ui'
import { Aviso, BotonEnlace, BuscadorURL, SubTabs, Vacio } from '@/shared/components/ds'
import { plata } from '@/features/obras/components/formato'
import { NavAdministracion } from '@/features/administracion/components/NavAdministracion'
import { FiltrosURL } from '@/features/administracion/components/Controles'
import { NombresResueltos, TablaNombres } from '@/features/administracion/components/TablaNombres'
import { PanelNombre } from '@/features/administracion/components/PanelNombre'
import { PanelProveedor } from '@/features/administracion/components/PanelProveedor'
import { TablaProveedores } from '@/features/administracion/components/TablaProveedores'
import {
  getComprasDelProveedor, getNombresPendientes, getNombresResueltos, getProveedor, getProveedores,
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

type Busqueda = { q?: string; activo?: string; p?: string; vista?: string; n?: string; bq?: string }

function armarHref(base: Busqueda, cambios: Partial<Busqueda> = {}): string {
  const v = { ...base, ...cambios }
  const params = new URLSearchParams()
  if (v.q) params.set('q', v.q)
  if (v.activo) params.set('activo', v.activo)
  if (v.vista) params.set('vista', v.vista)
  if (v.p) params.set('p', v.p)
  if (v.n) params.set('n', v.n)
  if (v.bq) params.set('bq', v.bq)
  const qs = params.toString()
  return `/administracion/proveedores${qs ? `?${qs}` : ''}`
}

export default async function ProveedoresPage({ searchParams }: { searchParams: Promise<Busqueda> }) {
  const sp = await searchParams
  const vista = sp.vista === 'resolver' ? 'resolver' : 'maestro'
  const activo = (ACTIVOS.find((a) => a.valor === sp.activo)?.valor ?? 'activos') as FiltroActivo
  const supabase = await createClient()

  // El maestro se lee siempre. Los CANDIDATOS de la cola se leen con el término del panel: la
  // vinculación se elige buscando, no recorriendo una lista entera de proveedores.
  const [listado, candidatos, pendientesCuenta] = await Promise.all([
    getProveedores(supabase, { q: sp.q, activo }),
    getProveedores(supabase, { q: sp.bq, activo: 'activos' }),
    getNombresPendientes(supabase),
  ])

  if (listado.error) {
    return (
      <PageShell title="Proveedores">
        <NavAdministracion />
        <div data-testid="proveedores-error">
          <Aviso tono="neg" titulo="No pude leer los proveedores">{listado.error}</Aviso>
        </div>
      </PageShell>
    )
  }

  const proveedores = listado.data ?? []
  const abrirAlta = sp.p === 'nuevo'
  const seleccionadoId = abrirAlta ? undefined : sp.p
  let seleccionado: Proveedor | null = null
  // NO SE PUDO LEER ≠ NO ESTÁ. Esto redirigía sacando `p` de la URL: el panel se cerraba solo y la
  // pantalla quedaba idéntica a la de alguien que nunca hizo clic — el error dibujado como si nada
  // hubiera pasado, que es la versión más silenciosa del defecto que `INTERACTION.md` prohíbe. Un
  // fallo de permisos o de red se dice; la selección se conserva en la URL para poder reintentarla.
  let errorSeleccionado: string | null = null
  if (seleccionadoId) {
    const r = await getProveedor(supabase, seleccionadoId)
    if (r.error) errorSeleccionado = r.error
    else seleccionado = r.data
  }
  const compras = seleccionado ? await getComprasDelProveedor(supabase, seleccionado.id) : null

  const resueltos = vista === 'resolver' ? await getNombresResueltos(supabase) : null
  const cola = pendientesCuenta.data ?? []
  const nombreAbierto = sp.n ? cola.find((n) => n.nombre_norm === sp.n) : undefined
  const panelAbierto = abrirAlta || seleccionado !== null

  return (
    <PageShell
      title="Proveedores"
      subtitle="Identidad única por CUIT. Los nombres que llegan de Compras se resuelven contra ese maestro."
    >
      <NavAdministracion />

      <div className="mb-4">
        <SubTabs
          testid="vistas-proveedores"
          items={[
            {
              href: armarHref(sp, { vista: undefined, n: undefined, bq: undefined }),
              label: 'Proveedores', cuenta: proveedores.length,
              activo: vista === 'maestro', testid: 'vista-maestro',
            },
            {
              href: armarHref(sp, { vista: 'resolver', p: undefined, q: undefined }),
              label: 'Nombres sin resolver', cuenta: pendientesCuenta.error ? null : cola.length,
              activo: vista === 'resolver', testid: 'vista-resolver',
            },
          ]}
        />
      </div>

      {errorSeleccionado && (
        <div className="mb-4" data-testid="proveedor-seleccionado-error">
          <Aviso tono="neg" titulo="No pude abrir ese proveedor">{errorSeleccionado}</Aviso>
        </div>
      )}

      {vista === 'maestro'
        ? (
            <>
              <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-3">
                <BuscadorURL
                  accion="/administracion/proveedores"
                  q={sp.q}
                  placeholder="Buscar por nombre o CUIT"
                  oculto={{ activo: activo === 'activos' ? undefined : activo, p: sp.p }}
                  ancho="w-full sm:w-[240px]"
                  testid="buscar-proveedor"
                />
                <FiltrosURL
                  testid="filtro-activo"
                  opciones={ACTIVOS.map((a) => ({
                    label: a.etiqueta,
                    href: armarHref(sp, { activo: a.valor === 'activos' ? undefined : a.valor }),
                    activo: a.valor === activo,
                    testid: `filtro-activo-${a.valor}`,
                  }))}
                />
                <div className="ml-auto flex items-center gap-4">
                  {cola.length > 0 && (
                    <a
                      href={armarHref(sp, { vista: 'resolver', p: undefined, q: undefined })}
                      className="text-[12px] text-warn hover:underline"
                      data-testid="aviso-sin-resolver"
                    >{cola.length} {cola.length === 1 ? 'nombre' : 'nombres'} sin resolver</a>
                  )}
                  <BotonEnlace href={armarHref(sp, { p: 'nuevo' })} variante="primaria" data-testid="nuevo-proveedor">
                    + Nuevo proveedor
                  </BotonEnlace>
                </div>
              </div>

              {/* TRES COLUMNAS NO SE ESTIRAN A 1440. `LAYOUT_RESPONSIVE.md`: «una tabla de dos
                  columnas estirada a 1440 es ilegible». Con el panel abierto la lista usa lo que le
                  queda; con el panel cerrado se acota, para que el nombre y su CUIT sigan siendo la
                  misma fila para el ojo. */}
              <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
                <div className={`min-w-0 flex-1 ${panelAbierto ? '' : 'lg:max-w-[900px]'}`}>
                  {proveedores.length === 0
                    ? <div data-testid="proveedores-vacio"><Vacio>Ningún proveedor coincide con lo buscado.</Vacio></div>
                    : (
                        <TablaProveedores
                          proveedores={proveedores}
                          seleccionado={seleccionado?.id}
                          hrefDe={(id) => armarHref(sp, { p: id })}
                        />
                      )}
                  <p className="mt-3 text-[11px] text-faint">
                    {proveedores.length} {proveedores.length === 1 ? 'proveedor' : 'proveedores'} · el
                    CUIT es lo que identifica a un proveedor: dos fichas con el mismo CUIT no pueden existir.
                  </p>
                </div>
                {panelAbierto && (
                  <PanelProveedor
                    proveedor={seleccionado}
                    compras={compras}
                    crear={crearProveedor}
                    editar={seleccionado ? editarProveedor.bind(null, seleccionado.id) : crearProveedor}
                    archivar={archivarProveedor}
                    cerrarHref={armarHref(sp, { p: undefined })}
                  />
                )}
              </div>
            </>
          )
        : (
            <>
              {pendientesCuenta.error
                ? (
                    <div data-testid="cola-error">
                      <Aviso tono="neg" titulo="No pude leer los nombres de compras">{pendientesCuenta.error}</Aviso>
                    </div>
                  )
                : (
                    <>
                      <p className="mb-3 text-[12px] text-muted" data-testid="cola-total">
                        {cola.length} {cola.length === 1 ? 'nombre' : 'nombres'} sin proveedor ·{' '}
                        {cola.reduce((a, n) => a + n.comprobantes, 0)} comprobantes ·{' '}
                        {plata(cola.reduce((a, n) => a + Number(n.total ?? 0), 0))}
                      </p>
                      <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
                        <div className="min-w-0 flex-1">
                          <TablaNombres
                            pendientes={cola}
                            seleccionado={nombreAbierto?.nombre_norm}
                            hrefDe={(n) => armarHref(sp, { n, bq: undefined })}
                          />
                          <NombresResueltos resueltos={resueltos?.data ?? []} deshacer={deshacerResolucion} />
                        </div>
                        {nombreAbierto && (
                          <PanelNombre
                            nombre={nombreAbierto}
                            candidatos={candidatos.data ?? []}
                            busqueda={sp.bq}
                            accionBuscar="/administracion/proveedores"
                            camposBuscar={{ vista: 'resolver', n: nombreAbierto.nombre_norm }}
                            cerrarHref={armarHref(sp, { n: undefined, bq: undefined })}
                            vincular={vincularNombre}
                            crearYVincular={crearYVincular}
                            noEsProveedor={marcarNoEsProveedor}
                          />
                        )}
                      </div>
                    </>
                  )}
              <p className="mt-4 max-w-[760px] text-[11px] leading-relaxed text-faint">
                Estos nombres vienen de la columna de proveedor de Compras, que es texto libre. El OS
                no los vincula solo: sólo reconoce el nombre escrito exactamente igual — nunca por
                parecido. Resolver uno resuelve sus N comprobantes de una vez.
              </p>
            </>
          )}
    </PageShell>
  )
}
