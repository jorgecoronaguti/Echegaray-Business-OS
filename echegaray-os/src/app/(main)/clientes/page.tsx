// 25 · CLIENTES — LA ÚNICA PANTALLA DE LA SECCIÓN (09/09/2026, orden del dueño).
//
// «Hay mezcla de pantalla con información; dejá, en lo que respecta a módulo Administración sección
// Clientes, UNA pantalla que contenga la info de las dos.» Eran dos: ésta y la entrada
// `/administracion`, que dibujaba `CarteraHome` con las MISMAS filas y otra verdad —$156.174.253
// contratado de Messina acá se leía «sin contrato»—. `/administracion` ahora redirige acá y
// `CarteraHome` se eliminó.
//
// LA DISCREPANCIA ERA DE FUENTE, no de formato: la entrada le pasaba `economia` a `armarCartera`
// (`obra_economia_cartera` = la pestaña OBRAS del Flujo de Caja) y esta pantalla no, así que caía a
// `obra_panel.monto_contratado`, el campo del formulario que nadie carga. Ahora la lee una sola vez
// y la pasa siempre. Y «sin contrato» dejó de ser la palabra para un hueco de precio: es un
// documento con rol `contrato` en la ficha, que es otro concepto y tiene su propia lectura.
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
import { esVistaCartera, separarArchivados } from '@/features/clientes/services/cartera'
import { getOrdenesDeLaCartera } from '@/features/clientes/services/ordenesCliente'
import { getEconomiaDeObras } from '@/features/clientes/services/economiaObras'
import { crearCliente } from '@/features/clientes/services/actions'
import { CamposCliente } from '@/features/clientes/components/CamposCliente'
import { PanelCliente } from '@/features/clientes/components/PanelCliente'
import { TablaClientes } from '@/features/clientes/components/TablaClientes'
import {
  armarCartera, getCertificadosDeLaCartera, getContratosDeLaCartera, getObrasDeLaCartera,
  getUltimoParte, hoyEnLaEmpresa,
} from '@/features/administracion/services/homeCartera'
import { pesos } from '@/shared/components/canon/formato'
import { Aviso } from '@/shared/components/ds'
import { SelloDatoBueno } from '@/shared/components/estado/SelloDatoBueno'
import { FormAccion } from '@/shared/components/ui'
import { CabeceraSeccion } from '@/shared/components/v2/CabeceraSeccion'
import { FiltrosSuaves } from '@/shared/components/v2/FiltrosSuaves'
import { NotaBloque, V } from '@/shared/components/v2/patron'
import { contieneEnAlguno } from '@/shared/utils/busqueda'

export const dynamic = 'force-dynamic'

const RUTA = '/clientes'

/** Los dos iconos que esta sección mezcla: un cliente incompleto y una obra sin contrato. */

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
  const [lectura, perfil, obras, partes, certificados, todasLasObras, ordenes, economia, contratos]
    = await Promise.all([
    getClientes(supabase),
    getPerfilActual(supabase),
    getObrasDeLaCartera(supabase),
    getUltimoParte(supabase),
    getCertificadosDeLaCartera(supabase),
    // El panel muestra TODAS las obras del cliente, no sólo las activas. Una consulta más para toda
    // la cartera, no una por cliente abierto.
    getObrasPorCliente(supabase),
    // LAS ÓRDENES DEL CLIENTE (OC/OP bajadas de Gmail). Una sola consulta para toda la cartera: una
    // por obra sería una cascada de decenas. La RLS de `cliente_orden` ya recorta por rol —el jefe
    // de obra sólo ve la suya—, así que acá no se vuelve a filtrar.
    getOrdenesDeLaCartera(supabase),
    // LO QUE OBRAS PUBLICA POR OBRA: contratado, costo MO, materiales y margen. Es la fuente del
    // dinero de esta tabla y la única — el campo del formulario de la obra queda de respaldo.
    getEconomiaDeObras(supabase),
    // QUIÉN TIENE EL CONTRATO CARGADO. Es un papel (`cliente_documento.rol = 'contrato'`), no un
    // monto: por eso es una lectura aparte y no se deduce de que haya precio.
    getContratosDeLaCartera(supabase),
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
  const cartera = armarCartera({ clientes: base, obras, partes, certificados, economia, contratos })
  // ═══ EL RECORTE SALE DE LA MISMA FILA QUE SE DIBUJA ═══
  //
  // `recortarCartera` decidía «Datos faltantes» con `cliente_panel.contratado === null`, que es la
  // suma del campo del formulario: por eso Messina entraba en «datos faltantes» al mismo tiempo que
  // la tabla le mostraba $156M. Ahora el corte es `faltaUnDato` de la fila —CUIT, teléfono,
  // contrato cargado—, el mismo booleano que enciende el filo ámbar y dibuja los chips.
  const enElRecorte = (c: (typeof cartera)[number]) =>
    vista === 'todo' ? true : vista === 'activos' ? c.enCurso.length > 0 : c.faltaUnDato
  const visibles = cartera
    .filter(enElRecorte)
    .filter((c) => contieneEnAlguno([c.nombre, razonDe(base, c.cliente_id)], sp.q ?? ''))
  const obrasEnCurso = visibles.reduce((a, c) => a + c.enCurso.length, 0)
  const conMonto = visibles.filter((c) => c.contratado !== null)
  const contratadoTotal = conMonto.length
    ? conMonto.reduce((a, c) => a + (c.contratado ?? 0), 0)
    : null

  const abierta = sp.nuevo === '1' && puedeEditar
  const seleccionado = sp.c ? base.find((c) => c.cliente_id === sp.c) ?? null : null
  const hayPanel = seleccionado !== null

  return (
    <Marco>
      {/* EL INTERLINEADO DEL MOCKUP, DECLARADO UNA VEZ. El `.dc.html` no declara `line-height` —corre
          con `normal`— y el preflight de Tailwind pone 1.5: cada bloque de texto salía 4-5px más
          alto y eso corría la tabla 25px hacia abajo. Ver `patron.tsx · CAJA_CONTENIDO`. */}
      <div style={{ lineHeight: 'normal' }}>
        {/* ═══ LA BANDA DE SEÑALES SE FUE (handoff CRM / Administración v4) ═══

            Decía en tres renglones —clientes sin CUIT, sin teléfono, obras sin contrato— lo que
            cada fila ya marca en su propia celda y lo que el recorte «Datos faltantes» ya aísla de
            un clic. La v4 revierte el criterio 1 del patrón v2 para las pantallas de área: lo que
            falta se lee donde está, no en un resumen que empuja la lista fuera de la pantalla. */}

        {/* EL ENLACE A `/administracion/portal` SE RETIRÓ (26/08/2026). Esa pantalla duplicaba la
            solapa «Acceso al portal» de la ficha del cliente, que administra lo mismo sobre
            `cliente_acceso`. Quién entra al portal se decide ADENTRO del cliente al que se le da
            acceso, no en una lista aparte: «es un crm ahi tiene q estar todo». */}

        <CabeceraSeccion
          testid="vistas-clientes"
          espacioPanel={hayPanel}
          vistas={[{
            clave: 'clientes', titulo: 'Clientes', cuenta: base.length, activa: true, href: armarHref({}),
            // EL RESUMEN CUENTA LO QUE SE VE. Un total de la cartera entera al lado de tres filas
            // filtradas es un número que no cuadra con nada de lo que hay en pantalla.
            subtitulo: [
              obras === null
                ? 'no pude leer las obras'
                : `${obrasEnCurso} ${obrasEnCurso === 1 ? 'obra' : 'obras'} en ejecución`,
              veEconomia
                ? (contratadoTotal === null ? 'sin precios en OBRAS' : `${pesos(contratadoTotal)} contratado`)
                : null,
            ].filter(Boolean).join(' · '),
          }]}
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
                  {
                    clave: 'sin-datos', etiqueta: 'Datos faltantes',
                    href: armarHref(sp, { vista: 'sin-datos', c: undefined }),
                    activo: vista === 'sin-datos',
                    // LA POBLACIÓN DEL CORTE, no la de la página, y contada sobre las MISMAS filas
                    // que la tabla dibuja: si saliera de otra cuenta diría 4 con 3 filas abajo.
                    cuenta: cartera.filter((c) => c.faltaUnDato).length,
                  },
                ]}
              />

              <TablaClientes
                clientes={visibles}
                ordenes={ordenes}
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
                hoy={hoyEnLaEmpresa()}
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
