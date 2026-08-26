// 25 · CLIENTES v2 — el patrón de sección aplicado a la cartera.
//
// ═══ EL ORDEN DE LA PANTALLA ES EL ARGUMENTO ═══
//
// Criterio 1: la primera línea de contenido muestra TRABAJO, no un maestro. Lo primero que ve quien
// entra no es la lista de clientes —que casi nunca hay que tocar— sino lo que impide cobrarles: los
// que no tienen CUIT o teléfono, y las obras en ejecución sin contrato cargado. Los dos verbos
// aterrizan en el MISMO recorte que produjo el número («Datos faltantes»).
//
// Criterio 4: la obra en ejecución no es una columna del cliente, es una FILA indentada bajo él, con
// sus mismas columnas. La pregunta que contesta la pantalla deja de ser «qué clientes tengo» y pasa
// a ser «qué le estoy ejecutando a cada uno».
//
// ═══ UNA SOLA DEFINICIÓN DE LA CARTERA ═══
//
// Las filas las arma `homeCartera.armarCartera`, la MISMA que dibuja la entrada de Administración.
// Antes había dos: `getObrasEnEjecucion` para esta pantalla y `getObrasDeLaCartera` para la otra,
// con dos criterios de «en ejecución» que ya se habían separado una vez. Un concepto crítico se
// define una sola vez; que dos pantallas del mismo maestro digan números distintos es el defecto,
// no el ahorro.
//
// ═══ EL ALTA Y EL PANEL VIVEN EN LA URL ═══
//
// `?nuevo=1` abre el formulario y `?c=<id>` abre el panel. Estado compartible por chat, deshacible
// con el botón de atrás, y el panel entero se renderiza en el servidor: no lee nada que esta página
// no haya traído ya.
//
// ═══ LO QUE NO SE DIBUJA, Y POR QUÉ ═══
//
// · TASA DE CONVERSIÓN de presupuestos: `public.presupuestos` cuelga de la OBRA
//   (`obra_canonica_id`), no del cliente. Un porcentaje calculado sobre eso sería inventado.
// · ÚLT. MOV. (que el 00 v2 sí dibuja): acá el mockup no la trae, y la que existe —`updated_at`—
//   es la última edición de la FICHA, no un movimiento comercial.

import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getPerfilActual } from '@/features/auth/services/authService'
import { esAdministracion, veEconomia as puedeVerEconomia } from '@/features/auth/types/areas'
import { getClientes, getObrasPorCliente } from '@/features/clientes/services/clientesService'
import { esVistaCartera, recortarCartera, separarArchivados } from '@/features/clientes/services/cartera'
import { senalesDeClientes } from '@/features/clientes/services/senalesClientes'
import { crearCliente } from '@/features/clientes/services/actions'
import { CamposCliente } from '@/features/clientes/components/CamposCliente'
import { PanelCliente } from '@/features/clientes/components/PanelCliente'
import { TablaClientes } from '@/features/clientes/components/TablaClientes'
import {
  armarCartera, getCertificadosDeLaCartera, getObrasDeLaCartera, getUltimoParte,
} from '@/features/administracion/services/homeCartera'
import { Aviso } from '@/shared/components/ds'
import { SelloDatoBueno } from '@/shared/components/estado/SelloDatoBueno'
import { FormAccion } from '@/shared/components/ui'
import { IconoCliente, IconoDinero } from '@/shared/components/iconos'
import { CabeceraSeccion } from '@/shared/components/v2/CabeceraSeccion'
import { FiltrosSuaves } from '@/shared/components/v2/FiltrosSuaves'
import { TrabajoDeSeccion } from '@/shared/components/v2/TrabajoDeSeccion'
import { NotaBloque, V } from '@/shared/components/v2/patron'
import { contieneEnAlguno } from '@/shared/utils/busqueda'

export const dynamic = 'force-dynamic'

const RUTA = '/clientes'

/** Los dos iconos que esta sección mezcla: un cliente incompleto y una obra sin contrato. */
const ICONOS = { cliente: IconoCliente, dinero: IconoDinero }

type Query = { archivados?: string; nuevo?: string; vista?: string; q?: string; c?: string }

function armarHref(base: Query, cambios: Partial<Query> = {}): string {
  const v = { ...base, ...cambios }
  const p = new URLSearchParams()
  for (const k of ['archivados', 'nuevo', 'vista', 'q', 'c'] as const) {
    if (v[k]) p.set(k, v[k] as string)
  }
  const s = p.toString()
  return `${RUTA}${s ? `?${s}` : ''}`
}

export default async function ClientesPage({ searchParams }: { searchParams: Promise<Query> }) {
  const sp = await searchParams
  const conArchivados = sp.archivados === '1'
  const vista = esVistaCartera(sp.vista) ? sp.vista : 'todo'

  const supabase = await createClient()
  const [lectura, perfil, obras, partes, certificados, todasLasObras] = await Promise.all([
    getClientes(supabase),
    getPerfilActual(supabase),
    getObrasDeLaCartera(supabase),
    getUltimoParte(supabase),
    getCertificadosDeLaCartera(supabase),
    // El panel muestra TODAS las obras del cliente, no sólo las activas. Una consulta más para toda
    // la cartera, no una por cliente abierto.
    getObrasPorCliente(supabase),
  ])

  const rol = perfil.data?.rol ?? null
  // LA CARTERA ES DE ADMINISTRACIÓN. El nivel Obras entra al detalle —necesita saber con quién habla
  // en la obra que ejecuta— pero no administra el maestro. No es la cerradura: la RLS rechaza la
  // escritura igual. Es no ofrecer un botón que la base va a rechazar.
  const puedeEditar = esAdministracion(rol)
  const veEconomia = puedeVerEconomia(rol)

  if (lectura.error) {
    return (
      <Marco>
        <div style={{ padding: '24px 20px' }}>
          <Aviso tono="neg" titulo="No pude leer los clientes">{lectura.error}</Aviso>
        </div>
      </Marco>
    )
  }

  const { activos, archivados: guardados } = separarArchivados(lectura.data ?? [])
  const base = conArchivados ? [...activos, ...guardados] : activos
  const cartera = armarCartera({ clientes: base, obras, partes, certificados })
  const porVista = recortarCartera(base, vista)
  const visibles = cartera
    .filter((c) => porVista.some((x) => x.cliente_id === c.cliente_id))
    .filter((c) => contieneEnAlguno([c.nombre, razonDe(base, c.cliente_id)], sp.q ?? ''))

  // LA SEÑAL NO DEPENDE DE LO QUE ESTOY MIRANDO: cuenta siempre sobre los ACTIVOS. Un aviso que
  // cambiara al poner un filtro diría que la empresa tiene menos trabajo porque alguien tocó un chip.
  const senales = senalesDeClientes(activos, obras === null ? null : obras.filter((o) => o.monto_contratado === null).length)

  const abierta = sp.nuevo === '1' && puedeEditar
  const seleccionado = sp.c ? base.find((c) => c.cliente_id === sp.c) ?? null : null
  const hayPanel = seleccionado !== null

  return (
    <Marco>
      {/* EL INTERLINEADO DEL MOCKUP, DECLARADO UNA VEZ. El `.dc.html` no declara `line-height` —corre
          con `normal`— y el preflight de Tailwind pone 1.5: cada bloque de texto salía 4-5px más
          alto y eso corría la tabla 25px hacia abajo. Ver `patron.tsx · CAJA_CONTENIDO`. */}
      <div style={{ lineHeight: 'normal' }}>
        <TrabajoDeSeccion
          senales={senales}
          icono={IconoCliente}
          iconos={ICONOS}
          vacio="Ningún cliente sin CUIT ni sin teléfono, y ninguna obra en ejecución sin contrato."
        />

        {/* EL ENLACE A `/administracion/portal` SE RETIRÓ (26/08/2026). Esa pantalla duplicaba la
            solapa «Acceso al portal» de la ficha del cliente, que administra lo mismo sobre
            `cliente_acceso`. Quién entra al portal se decide ADENTRO del cliente al que se le da
            acceso, no en una lista aparte: «es un crm ahi tiene q estar todo». */}

        <CabeceraSeccion
          testid="vistas-clientes"
          espacioPanel={hayPanel}
          vistas={[{ clave: 'clientes', titulo: 'Clientes', cuenta: base.length, activa: true, href: armarHref({}) }]}
          buscador={{
            accion: RUTA,
            q: sp.q,
            placeholder: 'Buscar cliente',
            oculto: { archivados: sp.archivados, vista: sp.vista, c: sp.c },
            testid: 'buscar-cliente',
          }}
          alta={puedeEditar
            ? { href: armarHref(sp, { nuevo: abierta ? undefined : '1' }), etiqueta: abierta ? 'Cancelar' : 'Nuevo cliente', testid: 'abrir-alta-cliente' }
            : undefined}
        />

        {abierta && (
          <div style={{ padding: '14px 20px 0' }} data-testid="alta-cliente">
            <h2 style={{ fontSize: '13px', fontWeight: 600, color: V.tinta, margin: '0 0 10px' }}>Nuevo cliente</h2>
            {/* El identificador de la URL sale del nombre y lo calcula el servidor: pedirlo acá sería
                pedir que alguien invente una clave primaria. Si ya existe, la acción avisa en vez de
                crear un segundo cliente que dejaría al primero inalcanzable. */}
            <FormAccion accion={crearCliente} testid="form-cliente" enviar="Crear cliente" limpiarAlOk mensajeOk="Cliente creado.">
              <CamposCliente />
            </FormAccion>
          </div>
        )}

        <div style={{ padding: '10px 20px 24px' }}>
          <div className="flex flex-col lg:flex-row lg:items-stretch">
            <div className="min-w-0 flex-1">
              <FiltrosSuaves
                testid="filtro-cartera"
                conteo={{ n: visibles.length, total: base.length }}
                opciones={[
                  { clave: 'todo', etiqueta: 'Todos', href: armarHref(sp, { vista: undefined, c: undefined }), activo: vista === 'todo' },
                  { clave: 'activos', etiqueta: 'Con obra activa', href: armarHref(sp, { vista: 'activos', c: undefined }), activo: vista === 'activos' },
                  { clave: 'sin-datos', etiqueta: 'Datos faltantes', href: armarHref(sp, { vista: 'sin-datos', c: undefined }), activo: vista === 'sin-datos' },
                ]}
              />

              <TablaClientes
                clientes={visibles}
                seleccionado={seleccionado?.cliente_id}
                // ═══ LA FILA ABRE LA FICHA, NO EL PANEL (26/08/2026) ═══
                //
                // Abría el panel lateral con `?c=<id>`. El panel es un buen resumen —quién es, sus
                // obras, sus datos faltantes— pero es un PASO INTERMEDIO: el cronograma de cobros y
                // el acceso al portal, que son las dos pantallas por las que se entra a este módulo,
                // viven en solapas de la ficha, un clic más adentro y sin nombrar desde acá. El dueño
                // lo probó y no encontró nada: «nunca encuentro nada».
                //
                // La ficha, en cambio, abre con sus siete solapas escritas —Obras · Presupuestos ·
                // Documentos · Actividad · Cuenta corriente · Esquema de pago · Acceso al portal—. No
                // hay que adivinar qué hay adentro: está a la vista.
                //
                // El panel NO se retiró: sigue abriéndose con `?c=<id>`, así que los enlaces
                // compartidos con ese parámetro siguen mostrando lo mismo que mostraban.
                hrefDe={(id) => {
                  const slug = visibles.find((c) => c.cliente_id === id)?.slug
                  return slug ? `/clientes/${slug}` : armarHref(sp, { c: id, nuevo: undefined })
                }}
                veEconomia={veEconomia}
                obrasNoLeidas={obras === null}
                limpiarHref={armarHref(sp, { q: undefined, vista: undefined, c: undefined })}
                vacio={sp.q ? 'Ningún cliente se llama así.' : 'Ningún cliente entra en este recorte.'}
              />

              <NotaBloque testid="nota-clientes">
                {/* LA PUERTA DE VUELTA. Un cliente archivado no es un cliente perdido: se dice
                    cuántos hay y el enlace los trae sin cambiar de pantalla. */}
                {guardados.length > 0 && (
                  <span data-testid="pie-archivados">
                    {conArchivados
                      ? <>Se muestran también {guardados.length} cliente{guardados.length === 1 ? '' : 's'} archivado{guardados.length === 1 ? '' : 's'}. <Link href={armarHref(sp, { archivados: undefined })} style={{ color: V.tinta, textDecoration: 'underline' }}>Ocultarlos</Link>. </>
                      : <>{guardados.length} cliente{guardados.length === 1 ? '' : 's'} archivado{guardados.length === 1 ? '' : 's'} fuera de esta lista. <Link href={armarHref(sp, { archivados: '1' })} data-testid="ver-archivados" style={{ color: V.tinta, textDecoration: 'underline' }}>Verlos</Link>. </>}
                  </span>
                )}
                El cliente es la relación empresarial y la obra la unidad operativa: un cliente puede
                tener varias obras. Esto no es un embudo comercial — no hay leads ni etapa de venta.
              </NotaBloque>
            </div>

            {seleccionado && (
              <PanelCliente
                c={seleccionado}
                obras={Object.fromEntries(todasLasObras)[seleccionado.cliente_id] ?? []}
                veEconomia={veEconomia}
                puedeEditar={puedeEditar}
                cerrarHref={armarHref(sp, { c: undefined })}
              />
            )}
          </div>
        </div>
      </div>
    </Marco>
  )
}

/** La razón social, para que el buscador la encuentre: quien la teclea la tiene en una factura. */
function razonDe(base: { cliente_id: string; razon_social: string | null }[], id: string): string | null {
  return base.find((c) => c.cliente_id === id)?.razon_social ?? null
}

/**
 * EL MARCO: fondo a toda la altura y nada más.
 *
 * `SelloDatoBueno` venía de `PageShell`, que esta pantalla no usa —el shell dibuja padding 16/24px y
 * un ancho de lectura, y el canon dibuja 20px con la lista hasta el borde—. Sin él, `error.tsx`
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
