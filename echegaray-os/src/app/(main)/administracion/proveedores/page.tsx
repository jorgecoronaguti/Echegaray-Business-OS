// 22 · PROVEEDORES v2 — el patrón de sección aplicado a la sección con más trabajo encima.
//
// ═══ EL ORDEN DE LA PANTALLA ES EL ARGUMENTO ═══
//
// Criterio 1 del patrón: la primera línea de contenido muestra TRABAJO, no un maestro. Lo primero
// que ve quien entra no es la lista de proveedores —que casi nunca hay que tocar— sino los dos
// frentes que bloquean plata: los proveedores sin CUIT y los nombres de Compras sin resolver.
// Debajo, las dos sub-vistas de nivel 3 con la lista que corresponda.
//
//   MAESTRO   quién es un proveedor, con el CUIT como identidad.
//   RESOLVER  los nombres que Compras trae sueltos y todavía no son nadie.
//
// La segunda es la que de verdad evita el duplicado: sin un lugar donde decir «este texto es este
// proveedor», el maestro se llena de variantes del mismo nombre y nadie sabe cuál es la buena.
//
// ═══ LAS LECTURAS: CUATRO CONSULTAS EN PARALELO, NINGUNA POR FILA ═══
//
// La versión anterior disparaba seis consultas en paralelo MÁS tres encadenadas (la ficha del
// seleccionado, sus compras y los resueltos), y pedía `proveedor_nombre_resuelto` DOS veces — una
// vista que reagrupa `costos_obra` entera en cada llamada. Ahora:
//
//   · el maestro se lee una vez y el filtro por texto, por «sin CUIT» y por subcontratista se
//     resuelve en memoria sobre esas decenas de filas: da los DOS conteos que el encabezado
//     necesita (con y sin búsqueda) sin una segunda consulta, y busca sin tildes como el resto del
//     OS —«corralon» encuentra «Corralón», que el `ilike` de Postgres no hacía—;
//   · `proveedor_nombre_resuelto` se lee UNA vez y de ahí salen la columna COMPRADO de todas las
//     filas y el detalle del proveedor abierto;
//   · la resolución de nombres y los subcontratos se leen sólo en la sub-vista que los usa.
//
// Cero consultas por fila: el «qué bloquea» de la primera línea sale de un conteo agregado y de la
// vista de pendientes, no de un bucle por proveedor.

import { createClient } from '@/lib/supabase/server'
import { Aviso } from '@/shared/components/ds'
import { SelloDatoBueno } from '@/shared/components/estado/SelloDatoBueno'
import { NavAdministracion } from '@/features/administracion/components/NavAdministracion'
import { NombresResueltos, TablaNombres } from '@/features/administracion/components/TablaNombres'
import { PanelNombre } from '@/features/administracion/components/PanelNombre'
import { PanelProveedor } from '@/features/administracion/components/PanelProveedor'
import { TablaProveedores } from '@/features/administracion/components/TablaProveedores'
import { CabeceraProveedores } from '@/features/administracion/components/proveedores/CabeceraProveedores'
import { FiltrosSuaves } from '@/features/administracion/components/proveedores/FiltrosSuaves'
import { LoQuePideTrabajo } from '@/features/administracion/components/proveedores/LoQuePideTrabajo'
import { armarSenales } from '@/features/administracion/services/senalesProveedores'
import { NotaBloque, V } from '@/features/administracion/components/proveedores/patron'
import { pesos } from '@/shared/components/canon/formato'
import { contiene } from '@/shared/utils/busqueda'
import {
  agruparComprado, coincideProveedor, contarProveedores, getNombresPendientes, getNombresResueltos,
  getProveedor, getProveedores, getResolucionCartera, getSubcontratistas, resumirCompras,
  type FiltroActivo,
} from '@/features/administracion/services/proveedoresService'
import {
  archivarProveedor, crearProveedor, crearYVincular, deshacerResolucion,
  editarProveedor, marcarNoEsProveedor, vincularNombre,
} from '@/features/administracion/services/proveedoresActions'
import type { Proveedor } from '@/features/administracion/types'

export const dynamic = 'force-dynamic'

type Busqueda = {
  q?: string; activo?: string; p?: string; vista?: string; n?: string; cuit?: string
  /** `sub` = sólo los que tienen al menos un paquete de subcontrato. */
  tipo?: string
  /** El id del proveedor cuyo formulario de CUIT llega abierto, desde el verbo de su fila. */
  editcuit?: string
}

const ACTIVOS: FiltroActivo[] = ['activos', 'archivados', 'todos']
const RUTA = '/administracion/proveedores'

function armarHref(base: Busqueda, cambios: Partial<Busqueda> = {}): string {
  const v = { ...base, ...cambios }
  const params = new URLSearchParams()
  for (const k of ['q', 'activo', 'vista', 'p', 'n', 'cuit', 'tipo', 'editcuit'] as const) {
    if (v[k]) params.set(k, v[k] as string)
  }
  const qs = params.toString()
  return `${RUTA}${qs ? `?${qs}` : ''}`
}

export default async function ProveedoresPage({ searchParams }: { searchParams: Promise<Busqueda> }) {
  const sp = await searchParams
  const vista = sp.vista === 'resolver' ? 'resolver' : 'maestro'
  const maestro = vista === 'maestro'
  const activo = (ACTIVOS.find((a) => a === sp.activo) ?? 'activos') as FiltroActivo
  // En la cola sólo se ofrecen proveedores ACTIVOS para vincular: uno archivado salió de la cartera
  // justamente para dejar de recibir imputaciones.
  const activoLeido: FiltroActivo = maestro ? activo : 'activos'
  const soloSinCuit = maestro && sp.cuit === 'falta'
  const soloSub = maestro && sp.tipo === 'sub'
  const supabase = await createClient()

  const [listado, sinCuit, pendientes, resolucion, subcontratistas, resueltos] = await Promise.all([
    getProveedores(supabase, { activo: activoLeido }),
    // LA SEÑAL NO DEPENDE DE LO QUE ESTOY MIRANDO. Cuenta siempre sobre los ACTIVOS, con el mismo
    // predicado que filtra la lista: un aviso que cambiara al pasar a «Archivados» diría que la
    // empresa tiene menos trabajo pendiente porque alguien tocó un filtro.
    contarProveedores(supabase, { activo: 'activos', sinCuit: true }),
    getNombresPendientes(supabase),
    maestro ? getResolucionCartera(supabase) : null,
    maestro ? getSubcontratistas(supabase) : null,
    maestro ? null : getNombresResueltos(supabase),
  ])

  if (listado.error) {
    return (
      <Marco>
        <NavAdministracion />
        <div style={{ padding: '24px 20px' }} data-testid="proveedores-error">
          <Aviso tono="neg" titulo="No pude leer los proveedores">{listado.error}</Aviso>
        </div>
      </Marco>
    )
  }

  const todos = listado.data ?? []
  const cola = pendientes.data ?? []
  const comprado = resolucion?.data ? agruparComprado(resolucion.data) : null
  const subs = subcontratistas?.data ?? null

  // EL FILTRO POR TIPO NO PUEDE SER UNA CONSULTA: «es subcontratista» no es una columna de
  // `proveedores`, es la existencia de un paquete en otra tabla. Cuando no se pudo leer, no recorta
  // nada: esconder filas por un error de lectura dibujaría una cartera más chica que la real.
  const porFiltro = todos.filter((p) => {
    if (soloSinCuit && p.cuit) return false
    if (soloSub && subs && !subs.has(p.id)) return false
    return true
  })
  const lista = porFiltro.filter((p) => coincideProveedor(p, sp.q))

  const abrirAlta = sp.p === 'nuevo'
  const seleccionadoId = abrirAlta ? undefined : sp.p
  let seleccionado: Proveedor | null = seleccionadoId ? (todos.find((p) => p.id === seleccionadoId) ?? null) : null
  // NO ESTÁ EN ESTE FILTRO ≠ NO EXISTE. Se busca aparte sólo en ese caso —el que abrió un archivado
  // y volvió a «Activos»—: cerrar el panel solo dejaría la pantalla idéntica a la de alguien que
  // nunca hizo clic, que es la versión más silenciosa del defecto.
  let errorSeleccionado: string | null = null
  if (seleccionadoId && !seleccionado) {
    const r = await getProveedor(supabase, seleccionadoId)
    if (r.error) errorSeleccionado = r.error
    else seleccionado = r.data
  }
  const compras = seleccionado && resolucion?.data
    ? resumirCompras(resolucion.data.filter((f) => f.proveedor_id === seleccionado?.id))
    : null

  const nombreAbierto = sp.n ? cola.find((n) => n.nombre_norm === sp.n) : undefined
  const panelAbierto = maestro ? (abrirAlta || seleccionado !== null) : nombreAbierto !== undefined

  const senales = armarSenales(
    sinCuit,
    { data: pendientes.error ? null : cola.length, error: pendientes.error },
    { sinCuit: armarHref({}, { cuit: 'falta' }), sinResolver: armarHref({}, { vista: 'resolver' }) },
  )

  return (
    <Marco>
      <NavAdministracion />

      {/* ═══ EL INTERLINEADO DE ESTA PANTALLA ES EL DEL MOCKUP, Y SE DECLARA UNA SOLA VEZ ═══

          Medido a 1520×900 contra el `.dc.html`: cada bloque de texto de la app era 4-5px más alto
          que el del zip —«Lo que pide trabajo» 24 contra 20, la solapa de nivel 3 24 contra 20, el
          chip de filtro 26 contra 15—, y esos milímetros acumulados corrían todo lo de abajo 25px.
          Era el diff de píxeles «repartido parejo»: no había ningún bloque mal maquetado, había una
          unidad base distinta.

          La causa: el `.dc.html` no declara `line-height` en ningún lado, así que corre con el
          default de CSS (`normal`, ≈1.25); el preflight de Tailwind pone `1.5` en el body y la app
          lo heredaba. Donde el mockup quiere otro interlineado lo escribe explícito —1.6 en las
          notas al pie, 1.25 en el título del panel— y esos siguen mandando sobre esta herencia.

          Va acá y no en `globals.css` porque el token global lo gobierna otro frente, y no en
          `Marco` porque ahí adentro está `NavAdministracion`, que es de la barra de áreas y no de
          esta pantalla: moverle el interlineado sería corregir mi corrimiento rompiendo el de otro. */}
      <div style={{ lineHeight: 'normal' }}>
      <LoQuePideTrabajo senales={senales} />

      <CabeceraProveedores
        espacioPanel={panelAbierto}
        altaHref={armarHref({}, { p: 'nuevo' })}
        buscador={{
          accion: RUTA,
          q: sp.q,
          placeholder: maestro ? 'Buscar proveedor' : 'Buscar nombre',
          oculto: { activo: sp.activo, vista: sp.vista, cuit: sp.cuit, tipo: sp.tipo, p: sp.p, n: sp.n },
        }}
        vistas={[
          {
            clave: 'maestro', titulo: 'Proveedores', cuenta: porFiltro.length, activa: maestro,
            href: armarHref(sp, { vista: undefined, n: undefined, q: undefined }),
          },
          {
            clave: 'resolver', titulo: 'Nombres sin resolver', cuenta: pendientes.error ? null : cola.length,
            activa: !maestro,
            href: armarHref(sp, { vista: 'resolver', p: undefined, q: undefined, editcuit: undefined }),
          },
        ]}
      />

      {errorSeleccionado && (
        <div style={{ padding: '12px 20px 0' }} data-testid="proveedor-seleccionado-error">
          <Aviso tono="neg" titulo="No pude abrir ese proveedor">{errorSeleccionado}</Aviso>
        </div>
      )}

      <div style={{ padding: '10px 20px 24px' }}>
        <div className="flex flex-col lg:flex-row lg:items-stretch">
          <div className="min-w-0 flex-1">
            {maestro
              ? (
                  <>
                    <FiltrosSuaves
                      testid="filtro-activo"
                      conteo={{ n: lista.length, total: porFiltro.length }}
                      opciones={[
                        ...ACTIVOS.map((a) => ({
                          clave: a,
                          etiqueta: a === 'activos' ? 'Activos' : a === 'archivados' ? 'Archivados' : 'Todos',
                          href: armarHref(sp, { activo: a === 'activos' ? undefined : a, cuit: undefined, p: undefined, editcuit: undefined }),
                          activo: a === activo && !soloSinCuit,
                        })),
                        {
                          clave: 'sin-cuit', etiqueta: 'Sin CUIT',
                          href: armarHref(sp, { cuit: soloSinCuit ? undefined : 'falta', p: undefined, editcuit: undefined }),
                          activo: soloSinCuit,
                        },
                        // El ÚNICO recorte por tipo que la base puede probar: los que tienen un
                        // paquete en `subcontrato`. Si esa lectura falló, el filtro no se ofrece —
                        // recortaría por un conjunto vacío y mostraría una cartera sin nadie.
                        ...(subs
                          ? [{
                              clave: 'sub', etiqueta: 'Subcontratistas',
                              href: armarHref(sp, { tipo: soloSub ? undefined : 'sub', p: undefined, editcuit: undefined }),
                              activo: soloSub,
                            }]
                          : []),
                      ]}
                    />

                    {(resolucion?.error || subcontratistas?.error) && (
                      <p style={{ marginBottom: 10, fontSize: '12px', color: V.warn }} data-testid="cartera-sin-derivados">
                        {resolucion?.error
                          ? 'No pude leer lo comprado por proveedor: esa columna no dice nada, y ningún «sin compras» de esta lista significa que no se le compró.'
                          : 'No pude leer los paquetes de subcontrato: esta lista no puede decir quién es subcontratista.'}
                      </p>
                    )}

                    <TablaProveedores
                      proveedores={lista}
                      seleccionado={seleccionado?.id}
                      hrefDe={(id) => armarHref(sp, { p: id, editcuit: undefined })}
                      hrefCuitDe={(id) => armarHref(sp, { p: id, editcuit: id })}
                      limpiarHref={armarHref(sp, { q: undefined, cuit: undefined, tipo: undefined, activo: undefined })}
                      comprado={comprado}
                      subcontratistas={subs}
                    />

                    <NotaBloque testid="nota-proveedores">
                      Lo que identifica a un proveedor es el CUIT, no el nombre: «Corralón Progreso»,
                      «CORRALON PROGRESO» y «Corralon Progreso SRL» son tres textos y un proveedor.
                      Sin CUIT no cruza con ARCA ni con el banco. Lo comprado es histórico, no de los
                      últimos doce meses.
                    </NotaBloque>
                  </>
                )
              : pendientes.error
                ? (
                    <div data-testid="cola-error">
                      <Aviso tono="neg" titulo="No pude leer los nombres de Compras">{pendientes.error}</Aviso>
                    </div>
                  )
                : (
                    <>
                      <p style={{ fontSize: '12px', color: V.apagado, marginBottom: 10 }} data-testid="cola-total">
                        {cola.length} {cola.length === 1 ? 'nombre' : 'nombres'} sin proveedor ·{' '}
                        {cola.reduce((a, n) => a + n.comprobantes, 0)} comprobantes ·{' '}
                        {pesos(cola.reduce((a, n) => a + Number(n.total ?? 0), 0))}
                      </p>
                      <TablaNombres
                        pendientes={cola.filter((n) => contiene(n.nombre_origen, sp.q ?? ''))}
                        seleccionado={nombreAbierto?.nombre_norm}
                        hrefDe={(n) => armarHref(sp, { n })}
                      />
                      <NotaBloque testid="nota-cola">
                        Vienen de la columna de proveedor de Compras, que es texto libre. El OS
                        reconoce el nombre escrito exactamente igual, nunca por parecido. Resolver uno
                        resuelve sus N comprobantes de una vez.
                      </NotaBloque>
                      <NombresResueltos resueltos={resueltos?.data ?? []} deshacer={deshacerResolucion} />
                    </>
                  )}
          </div>

          {maestro && panelAbierto && (
            <PanelProveedor
              proveedor={seleccionado}
              compras={compras}
              crear={crearProveedor}
              editar={seleccionado ? editarProveedor.bind(null, seleccionado.id) : crearProveedor}
              archivar={archivarProveedor}
              abrirCuit={sp.editcuit !== undefined && sp.editcuit === seleccionado?.id}
              cerrarHref={armarHref(sp, { p: undefined, editcuit: undefined })}
            />
          )}
          {!maestro && nombreAbierto && (
            <PanelNombre
              nombre={nombreAbierto}
              candidatos={todos}
              cerrarHref={armarHref(sp, { n: undefined })}
              vincular={vincularNombre}
              crearYVincular={crearYVincular.bind(null, nombreAbierto.nombre_norm, nombreAbierto.nombre_origen)}
              noEsProveedor={marcarNoEsProveedor}
            />
          )}
        </div>
      </div>
      </div>
    </Marco>
  )
}

/**
 * EL MARCO: fondo #F7F7F5 a toda la altura y nada más (`22v2:23`).
 *
 * `SelloDatoBueno` viene de `PageShell`, que esta pantalla no usa —el shell dibuja padding 16/24px
 * y un ancho de lectura, y el canon dibuja 20px con la lista hasta el borde—. Sin él, `error.tsx`
 * pierde la hora del último dato bueno y muestra un error que no sabe desde cuándo está roto.
 */
function Marco({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', background: V.fondo, display: 'flex', flexDirection: 'column' }}>
      <SelloDatoBueno />
      {children}
    </div>
  )
}
