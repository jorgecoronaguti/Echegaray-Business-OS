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
import { getOrdenesDe, getPapelesDeLaCartera } from '@/features/clientes/services/ordenesCliente'
import { PanelOrdenes } from '@/features/clientes/components/PanelOrdenes'
import { getEconomiaDeObras } from '@/features/clientes/services/economiaObras'
import { getEconomiaDeClientes } from '@/features/clientes/services/economiaCliente'
import { crearCliente } from '@/features/clientes/services/actions'
import { CamposCliente } from '@/features/clientes/components/CamposCliente'
import { PanelCliente } from '@/features/clientes/components/PanelCliente'
import { TablaClientes } from '@/features/clientes/components/TablaClientes'
import {
  armarCartera, getCertificadosDeLaCartera, getCobradoPorObra, getContratosDeLaCartera,
  getObrasDeLaCartera,
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

type Query = { archivados?: string; nuevo?: string; vista?: string; q?: string; c?: string; ordenes?: string }

function armarHref(base: Query, cambios: Partial<Query> = {}): string {
  const v = { ...base, ...cambios }
  const p = new URLSearchParams()
  for (const k of ['archivados', 'nuevo', 'vista', 'q', 'c', 'ordenes'] as const) {
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
  const [lectura, perfil, obras, cobrado, certificados, todasLasObras, papeles, economia, contratos,
    economiaCliente]
    = await Promise.all([
    getClientes(supabase),
    getPerfilActual(supabase),
    getObrasDeLaCartera(supabase),
    // LO COBRADO POR OBRA (percibido), para la barra de progreso. La vista lleva `ve_economia()`:
    // al jefe de obra le devuelve cero filas, y la pantalla además no le dibuja la celda.
    getCobradoPorObra(supabase),
    getCertificadosDeLaCartera(supabase),
    // El panel muestra TODAS las obras del cliente, no sólo las activas. Una consulta más para toda
    // la cartera, no una por cliente abierto.
    getObrasPorCliente(supabase),
    // LOS PAPELES DEL CLIENTE (OC, OP, retenciones y facturas bajadas de Gmail), YA AGRUPADOS por
    // `papelesCliente` — la misma función que usa la ficha, para que las dos pantallas no puedan
    // decir números distintos. Una sola consulta para toda la cartera: una por obra sería una
    // cascada de decenas. La RLS de `cliente_orden` ya recorta por rol —el jefe de obra sólo ve la
    // suya—, así que acá no se vuelve a filtrar.
    getPapelesDeLaCartera(supabase),
    // LO QUE OBRAS PUBLICA POR OBRA: contratado, costo MO, materiales y margen. Es la fuente del
    // dinero de esta tabla y la única — el campo del formulario de la obra queda de respaldo.
    getEconomiaDeObras(supabase),
    // QUIÉN TIENE EL CONTRATO CARGADO. Es un papel (`cliente_documento.rol = 'contrato'`), no un
    // monto: por eso es una lectura aparte y no se deduce de que haya precio.
    getContratosDeLaCartera(supabase),
    // LO CONTRATADO Y LO COBRADO **DEL CLIENTE**, sumado por la base (`public.cliente_economia`).
    // Es la fuente única del PRP de realidad única: la fila del cliente ya no suma las de abajo, y
    // el panel lateral dejó de leer `cliente_panel.contratado` —el campo del formulario— que decía
    // $31,8 M de Messina mientras esta misma tabla decía $156,1 M.
    getEconomiaDeClientes(supabase),
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
  const cartera = armarCartera({
    clientes: base, obras, cobrado, certificados, economia, contratos, economiaCliente,
    // TODAS sus obras, cerradas incluidas: el cobro que Cobranzas no pudo repartir cae en la obra
    // bolsa del cliente, que casi siempre está cerrada y no aparece en `obras` —que sólo trae las
    // `activa`—. Ya está leída para el panel: no es una consulta más.
    todasLasObras,
  })
  // ═══ EL RECORTE SALE DE LA MISMA FILA QUE SE DIBUJA ═══
  //
  // DOS RECORTES Y NO TRES (10/09/2026). «Datos faltantes» se retiró: contaba a los clientes por lo
  // que les falta —CUIT, teléfono, contrato sin cargar— y esas mismas aclaraciones son las que el
  // dueño mandó sacar de la pantalla dos veces («quiero info precisa»). Un chip que recorta por un
  // criterio que no se ve en ninguna fila es una puerta a ciegas. Ver `cartera.ts`.
  const enElRecorte = (c: (typeof cartera)[number]) =>
    vista === 'todo' ? true : c.enCurso.length > 0
  const visibles = cartera
    .filter(enElRecorte)
    .filter((c) => contieneEnAlguno([c.nombre, razonDe(base, c.cliente_id)], sp.q ?? ''))
  const obrasEnCurso = visibles.reduce((a, c) => a + c.enCurso.length, 0)
  const conMonto = visibles.filter((c) => c.contratado !== null)
  const contratadoTotal = conMonto.length
    ? conMonto.reduce((a, c) => a + (c.contratado ?? 0), 0)
    : null

  // ═══ EL PANEL DE ÓRDENES (`?ordenes=<obra_id>` o `?ordenes=cliente:<id>`) ═══
  //
  // Se resuelve DESDE LA CARTERA que la página ya trajo: el cliente y el nombre no se vuelven a
  // consultar, y una clave que no corresponda a ninguna fila visible no abre nada — así la URL
  // tipeada a mano no puede pedir el detalle de una obra que esta sesión no ve.
  const pedido = sp.ordenes ?? null
  const dueno = pedido?.startsWith('cliente:')
    ? cartera.find((c) => c.cliente_id === pedido.slice('cliente:'.length))
    : cartera.find((c) => c.enCurso.some((o) => o.obra_id === pedido))
  const obraPedida = pedido?.startsWith('cliente:') ? null : pedido
  const ordenesDelPanel = dueno
    ? await getOrdenesDe(supabase, { clienteId: dueno.cliente_id, obraId: obraPedida })
    : null
  const tituloPanel = !dueno
    ? ''
    : obraPedida
      ? (dueno.enCurso.find((o) => o.obra_id === obraPedida)?.nombre ?? dueno.nombre)
      : `${dueno.nombre} · sin obra atribuida`

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
            clave: 'clientes',
            titulo: 'Clientes',
            // NINGUNA CIFRA SIN RÓTULO (10/09/2026). `cuenta` dibuja el número SOLO —«Clientes 5»—
            // y con una única sub-vista no hay solapa que lo explique: el dueño lo leyó como un «5»
            // suelto pegado a «$ 251.494.283 contratado». El conteo se dice con su sustantivo, en
            // el resumen, junto a los otros dos.
            cuenta: null,
            activa: true,
            href: armarHref({}),
            // EL RESUMEN CUENTA LO QUE SE VE. Un total de la cartera entera al lado de tres filas
            // filtradas es un número que no cuadra con nada de lo que hay en pantalla.
            subtitulo: [
              `${visibles.length} ${visibles.length === 1 ? 'cliente' : 'clientes'}`,
              obras === null
                ? 'no pude leer sus trabajos'
                : `${obrasEnCurso} ${obrasEnCurso === 1 ? 'trabajo' : 'trabajos'} en curso`,
              // «EN CURSO» NO ES ADORNO: es la suma de la columna Contratado, que sólo mira los
              // trabajos en marcha. Sin la aclaración se lee como el contrato histórico del cliente.
              veEconomia
                ? (contratadoTotal === null
                    ? 'sin precios en OBRAS'
                    : `${pesos(contratadoTotal)} contratado en curso`)
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
                // EL CONTEO LLEVA SU SUSTANTIVO. «5/5» solo es una cifra sin rótulo —la regla del
                // dueño que este módulo ya aplicó al «Clientes 5» de la cabecera—: dos números
                // pegados a un total de plata no dicen de qué están hablando.
                conteo={{ n: visibles.length, total: base.length, sustantivo: 'clientes' }}
                opciones={[
                  { clave: 'todo', etiqueta: 'Todos', href: armarHref(sp, { vista: undefined, c: undefined }), activo: vista === 'todo' },
                  { clave: 'activos', etiqueta: 'Con trabajo en curso', href: armarHref(sp, { vista: 'activos', c: undefined }), activo: vista === 'activos' },
                ]}
              />

              <TablaClientes
                clientes={visibles}
                papeles={papeles.porCliente}
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
                hrefOrdenes={(clave) => armarHref(sp, { ordenes: clave, c: undefined })}
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
                {/* ═══ EL PÁRRAFO DEL PIE SE FUE ENTERO (10/09/2026) ═══

                    Decía «el cliente es la relación empresarial y la obra la unidad operativa… esto
                    no es un embudo comercial». Explicaba el modelo de datos a alguien que ya lo está
                    mirando dibujado: la fila del cliente con sus obras colgando dice eso mismo sin
                    una palabra. La skill de diseño lo prohíbe con nombre —«no párrafos explicativos
                    permanentes»— y el dueño lo marcó dos veces. Lo que haya que explicar de un
                    número vive en el `title` de su columna.

                    Lo que NO es un párrafo y se queda: la puerta de vuelta a los archivados, que es
                    un verbo con su número. */}
              </NotaBloque>
            </div>

            {dueno && (
              <PanelOrdenes
                titulo={tituloPanel}
                ordenes={ordenesDelPanel}
                de={obraPedida ? 'de este trabajo' : 'del cliente'}
                verEnObras={obraPedida ? `/obras/${obraPedida}` : null}
                veEconomia={veEconomia}
                cerrarHref={armarHref(sp, { ordenes: undefined })}
              />
            )}

            {seleccionado && (
              <PanelCliente
                c={seleccionado}
                obras={Object.fromEntries(todasLasObras)[seleccionado.cliente_id] ?? []}
                veEconomia={veEconomia}
                puedeEditar={puedeEditar}
                cerrarHref={armarHref(sp, { c: undefined })}
                // LOS DOS NÚMEROS DE PLATA DEL PANEL SALEN DE LA MISMA VISTA QUE LA FILA. Antes
                // venían dentro de `cliente_panel` y eran otra suma: el panel decía «$31.846.475»
                // y la fila de al lado «$156.174.253» del mismo cliente.
                economia={economiaCliente?.get(seleccionado.cliente_id) ?? null}
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
