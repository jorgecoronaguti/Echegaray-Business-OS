// 26 v2 · CLIENTE FICHA — porte medido de `26 · Cliente Ficha v2.dc.html`.
//
// ═══ QUÉ CAMBIÓ CONTRA LA VERSIÓN DE AGOSTO ═══
//
// El marco. Antes: `PageShell` + `CabeceraCliente` (slab blanco con avatar y nombre a 21px) +
// `TiraMetricas` en celdas + un cuerpo de `Bloque`s con tablas adentro. El v2 abre con la MIGA
// —«← Clientes / La Estrella»—, pone el nombre a 24px con la razón social debajo, las cifras sin
// tarjeta y las listas sin caja: criterio 3 del patrón.
//
// Y «RESUMEN» DEJÓ DE SER UNA CARA. Repetía la tabla de Obras con los presupuestos apilados debajo:
// dos caras con otro nombre. La ficha abre por OBRAS, que es lo que el mockup pone primero, y
// ACTIVIDAD sube a cara propia — en el v2 el costado guarda lo que IDENTIFICA al cliente
// (identidad, contactos, portal) y la historia de la relación es contenido, no identidad.
//
// ═══ EL COSTADO NO CAMBIA CON LA SOLAPA ═══
//
// Es lo que hace que partir el record en caras no cueste el caso del 19/08 («¿a quién llamo?» tiene
// que contestarse desde cualquier cara). Las tres caras a sangre —cuenta corriente, esquema y
// accesos, mockups 28/32/31— son la excepción: usan la columna derecha para su propio panel.
//
// ═══ CONSULTAR NO ES ADMINISTRAR ═══
//
// El record se abre para Obras y Administración; los formularios de escritura sólo se dibujan para
// Administración. No es la cerradura —la RLS rechaza la escritura igual—, es no ofrecer un botón que
// la base va a rechazar. El predicado de pantalla SIGUE a la policy, nunca al revés.
//
// FRONTERA: el cliente CONSOLIDA, no administra. El contratado y el avance salen de `obra_panel` —o
// sea, de Compras y de Cotización—. Acá no se calcula ni se guarda un número propio.

import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { esAdministracion, veEconomia as puedeVerEconomia } from '@/features/auth/types/areas'
import { leerFichaDeUnaConsulta } from '@/features/clientes/services/fichaDeUnaConsulta'
import {
  archivarCliente, borrarContacto, crearContacto, crearNota, editarCliente, editarContacto,
} from '@/features/clientes/services/actions'
import {
  clasificarDocumentoCliente, desvincularDocumentoCliente, vincularCarpetaCliente, vincularDocumentoCliente,
} from '@/features/clientes/services/actionsDocumentos'
import { crearObra } from '@/features/obras/services/actions'
import { jerarquiaDeObras, recortarPorEstado } from '@/features/clientes/services/obrasAdicionales'
import { CaraDeDocumentos } from '@/features/clientes/components/CaraDeDocumentos'
import { armarCaraDocumentos } from '@/features/clientes/services/caraDocumentos'
import { BloqueActividad } from '@/features/clientes/components/BloqueActividad'
import { BloqueContactos } from '@/features/clientes/components/BloqueContactos'
import { BloqueDocumentos } from '@/features/clientes/components/BloqueDocumentos'
import { getArchivosDeEntidad } from '@/features/documentos/services/carpetaDeEntidadService'
import { getDocumentosSubidos } from '@/features/documentos/services/documentosSubidosService'
import { DocumentosSubidos } from '@/features/documentos/components/DocumentosSubidos'
import { BloqueInformacion } from '@/features/clientes/components/BloqueInformacion'
import {
  ObrasDelCliente, PresupuestosDelCliente, type PresupuestoDeFicha,
} from '@/features/clientes/components/ListasClienteV2'
import { CuentaCorriente } from '@/features/clientes/components/cuenta/CuentaCorriente'
import { EsquemaPago } from '@/features/clientes/components/esquema/EsquemaPago'
import { AccesosPortal } from '@/features/clientes/components/accesos/AccesosPortal'
import { CamposObra } from '@/features/obras/components/CamposObra'
import { getCertificados, getCuentaCorriente } from '@/features/clientes/services/cuentaCorrienteService'
import { getEsquemaCliente } from '@/features/clientes/services/esquemaService'
import { SIN_PRECIO_EN_OBRAS, baseContractualDe } from '@/features/clientes/services/economiaObras'
import {
  esRecorteCobranza, getCobranzasDelCliente, type FilaCobranza,
} from '@/features/clientes/services/cobranzasCliente'
import { SolapaCobranzas } from '@/features/clientes/components/cobranzas/SolapaCobranzas'
import { getAccesos, getActividadPortal } from '@/features/clientes/services/accesosService'
import { getOrdenesDe, getOrdenesDelCliente } from '@/features/clientes/services/ordenesCliente'
import { OrdenesDelCliente } from '@/features/clientes/components/OrdenesDelCliente'
import { PanelOrdenes } from '@/features/clientes/components/PanelOrdenes'
import { registrarCobroDeCertificado } from '@/features/clientes/services/cuentaCorrienteActions'
import { editarPagoDelEsquema, publicarEsquema } from '@/features/clientes/services/esquemaActions'
import {
  habilitarAcceso, reenviarInvitacion, revocarAcceso,
} from '@/features/clientes/services/accesosActions'
import { resumenAccesos } from '@/features/clientes/services/reglasPortal'
import { cambiosSinPublicar } from '@/features/clientes/services/reglasEsquema'
import { A_SANGRE, destinoDe, esCaraRetirada, solapaDe, solapasDeCliente } from '@/features/clientes/services/solapasCliente'
import { tasaDeConversion } from '@/features/clientes/services/tasaConversion'
import { leerDesgloseHH } from '@/features/clientes/services/desgloseHH'
import { totalesDelCliente } from '@/features/clientes/services/costosDeObra'
import { DesgloseHH } from '@/features/clientes/components/DesgloseHH'
import { PieDeLosTrabajos } from '@/features/clientes/components/PieDeLosTrabajos'
import { ActividadReciente } from '@/features/clientes/components/ActividadReciente'
import { Aviso } from '@/shared/components/ds'
import { FormAccion } from '@/shared/components/ui'
import { EstadoError } from '@/shared/components/estado'
import { crearLector } from '@/shared/components/estado/lecturas'
import { IconoCrear, IconoEditar } from '@/shared/components/iconos'
import { RotuloPanel, V } from '@/shared/components/v2/patron'
import {
  AccionPrimaria, AccionSecundaria, AvisoDeFicha, CifrasDeFicha, CostadoDeFicha, CuerpoDeFicha,
  Migas, PastillaFilo, SolapasDeFicha, TituloDeFicha, type CifraDeFicha, PantallaV2,
} from '@/shared/components/v2/segundoNivel'
import { money } from '@/shared/utils/format'

export const dynamic = 'force-dynamic'

/** Quién puede ver certificaciones, facturaciones y cobranzas. Es un ESPEJO del predicado
 *  `es_administracion()` de la RLS, y sirve sólo para explicar la ausencia: quien decide sigue
 *  siendo Postgres, que devuelve cero filas. */
const VE_CONTRACTUALES = ['direccion', 'administracion']

type Query = {
  /** `archivadas` fue el interruptor de «ver las obras cerradas». Se lee y se ignora: desde el
   *  10/09/2026 las cerradas se listan SIEMPRE en su propio grupo, así que un enlace viejo con el
   *  parámetro puesto muestra exactamente lo mismo que uno sin él. */
  contacto?: string; editar?: string; archivadas?: string; actividad?: string; documentos?: string
  vista?: string
  /** Qué fila tiene su línea de acciones abierta. UNA a la vez, porque es un parámetro y no una
   *  lista: la alternativa era un `useState` en la tabla, que es de servidor, y volverla de cliente
   *  obligaría a cruzar `editar(id)` por la frontera — el React #419 que deja la pantalla en
   *  blanco. Son dos llaves distintas porque son dos tablas: abrir el menú de un contacto no puede
   *  cerrar el de un documento. */
  accContacto?: string
  accDoc?: string
  /** El nombre viejo del mismo parámetro. Sigue leyéndose para que un enlace ya compartido no caiga
   *  en otra cara sin decir por qué. No se escribe más: `url()` emite `vista`. */
  solapa?: string
  /** Abre el alta de obra, que en el v2 es la acción primaria de la cabecera y no un `details`
   *  escondido arriba de la tabla. */
  nueva?: string
  /** El recorte de la solapa Cobranzas: `todo` · `pendiente` · `cobrado` · `b` · `n`. Viaja en la
   *  URL como todo filtro del OS: se comparte por chat y vuelve con el botón de atrás. */
  cob?: string
  /**
   * EL DETALLE DE UN TRABAJO, DENTRO DEL CRM (`?trabajo=<obra_id>`).
   *
   * Hasta el 10/09/2026 la fila del trabajo saltaba a `/obras/<id>`: un clic y el dueño estaba en
   * el ERP —que él mismo describe como descuidado— sin haber pedido irse. Lo que el CRM sí puede
   * contestar de un trabajo son sus papeles: qué OC lo encargó y qué OP pagó el cliente. Eso se
   * abre en el panel lateral de esta misma ficha, con la MISMA lectura que usa `/clientes`.
   */
  trabajo?: string
  /**
   * EL DESGLOSE DE HORAS DE UN TRABAJO (`?hh=<obra_id>`), y `hhq` la quincena que dibuja.
   *
   * «Que de ahí me lleve a un desglose de la obra entera con las personas por día que participaron
   * de las HH» (dueño, 11/09/2026 18:38). Va en la URL y no en un estado de cliente por la misma
   * razón que el resto de los filtros del OS: se comparte por chat y vuelve con el botón de atrás.
   * Reemplaza la cara Obras entera en vez de abrirse en un panel: la grilla persona × día necesita
   * todo el ancho, y a 300px de panel lateral no se lee.
   */
  hh?: string
  hhq?: string
  /**
   * LA PANTALLA DEL PORTAL, COMO SUB-PANTALLA DE LA FICHA (`?portal=1`).
   *
   * Dejó de ser una SOLAPA el 12/09/2026 («el CRM admin en cada cliente tiene secciones inútiles y
   * repetitivas»): quién entra al portal se CONSULTA mucho más de lo que se edita, así que el estado
   * vive en el costado y la pantalla completa —la cascada de permisos, el alta de un mail, el
   * registro de ingresos— se abre desde ahí. No se achicó a 300px: es un porte literal del handoff
   * 31 y su tabla pide 958px medidos.
   */
  portal?: string
}

export default async function ClientePage({ params, searchParams }: {
  params: Promise<{ cliente: string }>
  searchParams: Promise<Query>
}) {
  const { cliente: slug } = await params
  const q = await searchParams

  // ═══ UN ENLACE A UNA CARA RETIRADA NO CAE EN LA FICHA GENÉRICA (12/09/2026) ═══
  //
  // `?vista=cuenta|esquema|actividad|accesos` están compartidos por mail y en favoritos. Se redirige
  // DE VERDAD —no se dibuja otra cosa con la dirección vieja puesta— para que lo que quede en la
  // barra sea la dirección que existe hoy y el enlace deje de circular roto. El `#ancla` lleva al
  // bloque exacto adentro de Cobranzas.
  if (esCaraRetirada(q.vista, q.solapa)) {
    const d = destinoDe(q.vista, q.solapa)
    const p = new URLSearchParams(
      Object.entries({
        ...q, vista: d.solapa === 'obras' ? null : d.solapa, solapa: null,
        ...(d.parametro ? { [d.parametro.clave]: d.parametro.valor } : {}),
      }).filter(([, v]) => v != null && v !== '') as [string, string][],
    )
    const qs = p.toString()
    redirect(`/clientes/${slug}${qs ? `?${qs}` : ''}${d.ancla ? `#${d.ancla}` : ''}`)
  }

  const supabase = await createClient()
  // QUÉ CARA SE VA A DIBUJAR — se resuelve ANTES de leer, porque desde 20260911T1200 la RPC trae
  // sólo lo que esa cara pinta. Depende únicamente de la URL, así que adelantarla no espera nada.
  const solapa = solapaDe(q.vista, q.solapa)
  // ═══ LA LÍNEA DE TIEMPO ENTERA PESA, Y SÓLO SE PIDE CUANDO SE ABRE ═══
  //
  // El costado dibuja los últimos hechos con las fuentes BARATAS —la ficha, los contactos, los
  // trabajos, los certificados y las notas— que en la cara Trabajos no agregan ni un KB (medido el
  // 12/09/2026: Messina 41 KB con y sin ellas). Los DOCUMENTOS son otra cosa: `documentos` + `drive`
  // son 49 KB de los 90 de Messina, y arrastrarlos en la cara que todos abren es lo que
  // 20260911T1200 acaba de sacar. Se piden con `p_solapa = 'actividad'` sólo cuando alguien abre la
  // línea entera, y el bloque del costado DICE que su resumen no los incluye.
  const caraDeLaRPC = q.actividad === 'todo' ? 'actividad' : solapa
  // ═══ UN VIAJE, NO QUINCE (10/09/2026) ═══
  //
  // Eran TRES olas encadenadas: la ficha y el perfil; después nueve lecturas en paralelo —de las
  // que «actividad» escondía cinco—; y al final `drive_index` y `certificados`, que no compiten
  // sino que ESPERAN, porque dependen de ids que sólo existen cuando la ola anterior volvió.
  //
  // El costo dominante no es ninguna consulta: es el arranque en frío por CONEXIÓN (~800 ms de
  // catálogo la primera vez que un backend ve las vistas anidadas del OS), y quince consultas
  // pueden caer en quince backends del pool de PostgREST. `pantalla_cliente()` trae exactamente las
  // mismas filas en un viaje, y las dos dependencias de la tercera ola pasan a ser subconsultas.
  //
  // Los cruces en memoria NO se movieron a SQL: ver `fichaDeUnaConsulta.ts`.
  const ficha = await leerFichaDeUnaConsulta(supabase, slug, caraDeLaRPC)
  // NO EXISTE y NO PUEDO LEER son dos cosas distintas: confundirlas escondió un defecto de permisos
  // detrás de un «página no encontrada» durante horas.
  if (ficha.error) return <EstadoError mensaje={ficha.error} que="la ficha del cliente" />
  const cliente = ficha.cliente
  if (!cliente) notFound()

  const id = cliente.cliente_id
  const rol = ficha.perfil?.rol ?? null
  const puedeEditar = esAdministracion(rol)
  // EL PRECIO NO ES DE TODOS: el jefe de obra no ve contratado. Decide la RLS; acá sólo se deja de
  // dibujar la métrica, para no mostrarle un rótulo económico vacío y que parezca un error.
  const veEconomia = puedeVerEconomia(rol)

  // LAS DIEZ LISTAS YA VIENEN LEÍDAS, EN UN SOLO VIAJE. Se envuelven en la forma `{ data, error }`
  // que esperan los componentes y `crearLector`: una lectura que falló tira la ficha entera abajo
  // antes de llegar acá, así que a esta altura `error` es siempre `null`.
  const responsables = { data: puedeEditar ? ficha.responsables : [], error: null }
  const contactos = { data: ficha.contactos, error: null }
  const obras = { data: ficha.obras, error: null }
  const linea = { data: ficha.actividad, error: null }
  const documentos = { data: ficha.documentos, error: null }
  // Los presupuestos DE ESTE CLIENTE: la RPC ya recorta por `cliente_id`, con el mismo predicado.
  const cartera = { data: veEconomia ? ficha.presupuestos : [], error: null }
  const economia = ficha.economia
  const papeles = ficha.papeles
  // ═══ LO COBRADO POR TRABAJO YA NO SE DIBUJA EN ESTA FICHA (dueño, 12/09/2026 13:10) ═══
  //
  // «Incluso la columna de cobrado neto no me es un dato que sirve verlo, porque para eso está la
  // sección especial de cobranzas.» Salió de la tabla de trabajos y, con la cuenta corriente adentro
  // de Cobranzas, también de la fila de cifras que la abría. La clave `cobrado_por_obra` sigue
  // viajando en la RPC —son trece filas— y `armarCobradoPorObra` la sigue convirtiendo: la usa
  // `/clientes`, que es donde el cobro POR TRABAJO sí es la respuesta.

  // `crearLector` distingue «no pude leer» de «no hay». Se conserva aunque ahora la lectura sea una
  // sola: los componentes reciben la misma forma, y el día que alguna clave vuelva a poder fallar
  // sola, el que la agregue no tiene que reinventar la distinción.
  const lector = crearLector()

  // EL DÍA DE HOY LO DECIDE EL SERVIDOR, EN EL HUSO DE LA EMPRESA. Si «vencido» lo calculara el
  // navegador, un jefe con el reloj corrido vería una mora distinta sobre el mismo cliente.
  const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' })
  // LA SUB-PANTALLA DEL PORTAL TAMBIÉN VA A SANGRE: es el handoff 31 entero, con su tabla de 958px
  // y su panel de alta de 392px. Con el costado puesto no entra.
  const portalAbierto = q.portal === '1' && veEconomia
  /** La línea de tiempo COMPLETA, desplegada en la cara Trabajos. El costado dibuja los últimos ocho. */
  const actividadTodo = q.actividad === 'todo'
  const aSangre = A_SANGRE.includes(solapa) || portalAbierto
  // Los presupuestos DE ESTE CLIENTE. El corte se hace por `cliente_id`: filtrar por el nombre
  // escrito en el presupuesto ataría la ficha a la grafía del texto.
  const presupuestos = lector.leer(cartera, []).filter((p) => p.cliente_id === id)

  // ═══ LO DE LA SOLAPA SALE EN UNA SOLA OLA (10/09/2026) ═══
  //
  // Eran CUATRO `await` seguidos —cuenta, esquema, accesos, documentos— y ninguno depende del
  // anterior: sólo miran `solapa` y `id`, que ya están resueltos. Como la solapa activa es una
  // sola, la mayoría devolvía su valor de reposo sin viajar, pero Documentos pagaba dos olas
  // encadenadas (`getArchivosDeEntidad` y después `getDocumentosSubidos`) por nada. Con una ola
  // sola, la ficha tarda lo que su lectura más lenta y no la suma de todas.
  const [
    cuentaYCertificados, esquemaRes, accesosYActividad, archivosDrive, subidos, cobranzas, ordenesDelCliente,
  ] = await Promise.all([
    // LA CUENTA CORRIENTE Y SUS CERTIFICADOS SON UN BLOQUE DE COBRANZAS (12/09/2026): la misma plata
    // resumida, en la misma cara donde está fila por fila.
    solapa === 'cobranzas' && veEconomia
      ? Promise.all([getCuentaCorriente(supabase, id), getCertificados(supabase, id)])
      : Promise.resolve<[Awaited<ReturnType<typeof getCuentaCorriente>>, Awaited<ReturnType<typeof getCertificados>>]>(
          [{ data: null, error: null }, { data: [], error: null }]),
    // EL ESQUEMA DE PAGO, EN LA MISMA CARA Y ABAJO: es el CRONOGRAMA de esa plata, lo que el cliente
    // ve en el portal. Su ancla es `#esquema-de-pago`, que es a donde caen los enlaces viejos.
    solapa === 'cobranzas' && veEconomia
      ? getEsquemaCliente(supabase, id)
      : Promise.resolve({ data: null, error: null }),
    // ═══ LOS ACCESOS SE LEEN SIEMPRE QUE HAYA COSTADO; EL REGISTRO DE INGRESOS, SÓLO ADENTRO ═══
    //
    // El panel «Portal del cliente» del costado publica CUÁNTOS entran, y hasta hoy no lo decía en
    // ninguna cara salvo la suya —escribía un placeholder—. `cliente_acceso` son unas pocas filas
    // por cliente. `cliente_actividad_portal` es un libro que sólo crece (los últimos 50): ése se
    // pide nada más que cuando se abre la pantalla.
    veEconomia && (portalAbierto || !aSangre)
      ? Promise.all([
          getAccesos(supabase, id),
          portalAbierto ? getActividadPortal(supabase, id) : Promise.resolve({ data: [], error: null }),
        ])
      : Promise.resolve<[Awaited<ReturnType<typeof getAccesos>>, Awaited<ReturnType<typeof getActividadPortal>>]>(
          [{ data: [], error: null }, { data: [], error: null }]),
    // LO QUE HAY EN LA CARPETA DEL CLIENTE EN DRIVE (`PRESUPUESTOS - CLIENTES/<CLIENTE>`). El bloque
    // de arriba lista los archivos VINCULADOS; éste, lo que está en la carpeta aunque nadie lo haya
    // vinculado — que es la mitad de los papeles de un cliente nuevo.
    solapa === 'documentos' ? getArchivosDeEntidad(supabase, 'cliente', id) : Promise.resolve(null),
    // Lo que Administración sube desde la ficha del cliente: la factura, la OC, el contrato firmado.
    solapa === 'documentos' ? getDocumentosSubidos(supabase, 'cliente', id) : Promise.resolve(null),
    // ═══ LA PESTAÑA COBRANZAS DEL CLIENTE, FILA POR FILA (`public.cliente_cobranza`) ═══
    //
    // Es la ÚNICA lectura de esta ficha que no viaja en `pantalla_cliente()`: la RPC se escribió
    // antes de que existiera esta cara. Se pide sólo en su solapa —son todas las filas del cliente,
    // 24 en Messina— así que no encarece las otras siete, y por eso no bloquea publicar. PENDIENTE
    // DECLARADO: cuando la RPC la absorba, esta consulta se retira y la ficha vuelve a un viaje.
    solapa === 'cobranzas' && veEconomia
      ? getCobranzasDelCliente(supabase, id)
      // `null` FUERA DE SU CARA, y no `[]`: un cero al lado de la solapa diría que este cliente no
      // tiene ninguna cobranza, y lo que pasa es que no se leyó.
      : Promise.resolve<FilaCobranza[] | null>(null),
    // LAS OC Y LAS OP DEL CLIENTE, EN SU SOLAPA (dueño, 11/09/2026). Sólo en su cara.
    solapa === 'ordenes' && veEconomia
      ? getOrdenesDelCliente(supabase, id)
      : Promise.resolve<Awaited<ReturnType<typeof getOrdenesDelCliente>>>(null),
  ])
  const [cuenta, certificados] = cuentaYCertificados
  const esquema = esquemaRes
  const pagosDelEsquema = esquema.data?.pagos ?? []
  const sinPublicar = cambiosSinPublicar(pagosDelEsquema)
  const [accesos, actividadPortal] = accesosYActividad
  const portal = resumenAccesos(lector.leer(accesos, []))

  const todas = lector.leer(obras, [])
  // ═══ EL ADICIONAL VIAJA AL GRUPO DE SU OBRA MAYOR (dueño, 11/09/2026) ═══
  //
  // Recortado obra por obra, `bsa-adicional` —cerrada, con su madre `messina-bsa` activa— caía en
  // «Terminados» y su madre quedaba arriba sin el subnivel que el dueño pidió. Manda el estado de la
  // madre para elegir el grupo; la palabra de la columna Estado sigue siendo la del hijo.
  const cerradas = recortarPorEstado(todas, 'cerrada')
  const enCursoConAdicionales = recortarPorEstado(todas, 'activa')
  // ═══ LO QUE SE DIBUJA JUNTO NO ES LO QUE SE SUMA ═══
  //
  // `enCursoConAdicionales` es el GRUPO de la tabla: el adicional viaja con su madre aunque esté
  // terminado. `enCurso` es el universo ECONÓMICO —las obras que de verdad están en ejecución— y es
  // el que suma la cifra de arriba. Medido el 11/09/2026 con las dos mezcladas: «BSA - Adicional»
  // (cerrada, sin precio) entraba al grupo de su madre y volvía `null` el «Contratado en curso» de
  // Messina, que pasó de $ 159.758.209 a «sin precio en OBRAS». Mover una fila de grupo no puede
  // cambiar una cifra de plata.
  const enCurso = todas.filter((o) => o.estado === 'activa')
  // ═══ LO CONTRATADO EN CURSO LO DICE `cliente_economia`, NO ESTA PÁGINA (H1, 10/09/2026) ═══
  //
  // Era `sumaConHuecos` sobre las obras con FALLBACK a `obra_panel.monto_contratado`. El fallback se
  // fue con la suma: el campo del formulario es la otra definición del contratado —la que sumaba
  // sólo las obras cerradas de Messina— y mientras siga siendo el respaldo de alguna cara, dos
  // pantallas pueden volver a discrepar sin que nadie lo note. Si la vista no se pudo leer, la
  // cifra dice qué falta; no se rellena con otra cuenta.
  // LA MISMA BASE QUE LA CARTERA (auditor, 11/09/2026): mano de obra + materiales cuando el papel
  // desglosa (`obra_contrato`), si no el precio de OBRAS. `cliente_economia.contratado_en_curso`
  // sólo conoce OBRAS y publicaba $ 95,3 M de Quattropani contra $ 139,4 M en la lista.
  // O SUMA COMPLETA, O NADA (auditor final, 11/09/2026): la lista pone «—» cuando un trabajo no
  // tiene base; la ficha no puede publicar una parcial como total.
  // CADA TRABAJO UNA VEZ: `enCurso` es PLANO —el adicional es una fila más, no un hijo adentro de la
  // madre—, y por eso esta suma no puede contar dos veces lo que la obra mayor consolida en su celda.
  // Si alguien la reescribe sobre los consolidados, sobre Messina daría $142,59 M contra los
  // $132,59 M de `cliente_economia` y de la pestaña OBRAS (`obrasAdicionales.test.ts`).
  const basesEnCurso = enCurso.map((o) => baseContractualDe(economia?.get(o.obra_id)))
  const contratadoEnCurso = basesEnCurso.length && basesEnCurso.every((v): v is number => v !== null)
    ? basesEnCurso.reduce((a, v) => a + v, 0)
    : null

  // ═══ LA CARA DOCUMENTOS, ARMADA UNA VEZ ═══
  //
  // `armarCaraDocumentos` cruza las cuatro fuentes que ya viajaron —los papeles de Drive por obra,
  // los papeles del OS, los vínculos manuales y el índice de la carpeta del cliente— y garantiza que
  // ningún archivo se dibuje dos veces. El total que devuelve ES el número de la solapa: si contara
  // otra cosa, el N de arriba y las filas de abajo dirían cosas distintas sobre el mismo cliente.
  const cara = armarCaraDocumentos({
    filas: jerarquiaDeObras(todas).map((f) => ({
      obra_id: f.obra.obra_id, nombre: f.obra.nombre, nivel: f.nivel,
      esAdicional: f.esAdicional, huerfano: f.huerfano,
    })),
    papelesObra: ficha.papelesObra,
    papelesCliente: papeles,
    documentos: lector.leer(documentos, []),
    archivosDelCliente: archivosDrive?.archivos ?? [],
    carpetas: ficha.carpetasObra,
  })

  /** El detalle del trabajo, DENTRO del CRM. Es una función y no una arrow creada en el JSX: una
   *  arrow pasada a un componente compila, pasa `build` y revienta con React #419. */
  const hrefTrabajo = (obraId: string) => url({ trabajo: obraId })

  const recorteCobranza = esRecorteCobranza(q.cob) ? q.cob : 'todo'
  /** El recorte de Cobranzas en la URL. Función declarada y no arrow en el JSX: una arrow creada en
   *  un Server Component y pasada como prop revienta en producción con React #419. */
  const hrefRecorteCobranza = (r: string) => url({ cob: r === 'todo' ? null : r })

  /** Las OC de cada obra, para el encabezado de cada grupo de Cobranzas. Sale de los MISMOS papeles
   *  que ya trajo la ficha: ninguna consulta nueva. */
  const ordenesPorObra = new Map(
    (papeles ? [...papeles.porObra.entries()] : []).map(([obraId, r]) => [obraId, r.oc]),
  )

  // ═══ EL CONTRATO EN DÓLARES DEL CLIENTE ═══
  //
  // Σ de lo que sus obras tienen contratado en U$S. `null` = ninguna lo tiene, y entonces la
  // ausencia de órdenes de compra es lo que parece: no hay ningún papel.
  const contratoUsd = todas.reduce<number | null>((a, o) => {
    const usd = economia?.get(o.obra_id)?.contratado_usd ?? null
    return usd == null ? a : (a ?? 0) + usd
  }, null)

  /** La misma dirección con un parámetro cambiado. Los demás se preservan. */
  const url = (cambio: Partial<Record<keyof Query, string | null>>) => {
    const p = new URLSearchParams(
      // `solapa` se lee pero NO se propaga: un enlace viejo abre la cara que pedía y a partir de ahí
      // la dirección se escribe con el nombre de hoy.
      Object.entries({ ...q, solapa: null, ...cambio })
        .filter(([, v]) => v != null && v !== '') as [string, string][],
    )
    const s = p.toString()
    return `/clientes/${slug}${s ? `?${s}` : ''}`
  }

  // ═══ LAS DOS CIFRAS (DISENO-FICHA-CLIENTE-v3 · §2.3, recortado el 11/09/2026) ═══
  //
  // Salieron «Contactos» y «Documentos»: son conteos que ya se publican donde viven —el costado dice
  // cuántos contactos hay, la solapa dice cuántos papeles— y un dato dos veces es la forma más barata
  // de que dos partes de la pantalla empiecen a decir distinto.
  //
  // Y SALIERON «OC RECIBIDAS C/IVA» Y «OP RECIBIDAS C/IVA» (dueño, 11/09/2026 18:42): «esas columnas
  // OC/OP quitarlas de TODO el CRM porque deben estar en la sección Órdenes». Los dos totales no se
  // perdieron: viven en el pie de la solapa «Órdenes de compra y de pago», sumados de las MISMAS
  // filas que esa cara dibuja. Acá arriba eran una tercera lectura de los mismos papeles, y estaban
  // al lado de un contratado NETO invitando a una resta que no significa nada.
  //
  // NO se publica «Facturado» ni «Cobrado» aunque la fuente exista (`cliente_cuenta_corriente`): su
  // ventana son 90 días y Contratado es un acumulado desde 2024 — puestos en la misma línea invitan a
  // restarlos, y eso es mezclar ventanas incompatibles. Tampoco «Pendiente»: no tiene fuente, y la
  // resta de dos universos distintos sería un número inventado. El saldo vive en Cuenta corriente.
  const cifras: CifraDeFicha[] = [
    // «TRABAJOS» Y NO «OBRAS»: el CRM habla de lo que el cliente encargó. La obra como unidad de
    // ejecución —con su plan, su avance y su costo— vive en el ERP.
    { rotulo: 'Trabajos', valor: todas.length || null, falta: 'ninguno cargado' },
    ...(veEconomia
      ? [{
          rotulo: 'Contratado en curso',
          // NADIE CARGÓ EL MONTO ≠ CONTRATADO $ 0. Con obras en curso sin monto, la cifra lo dice
          // en vez de publicar un cero que se leería como «trabajamos gratis».
          valor: contratadoEnCurso !== null ? money(contratadoEnCurso) : null,
          falta: enCurso.length ? SIN_PRECIO_EN_OBRAS : 'sin trabajo en curso',
        } as CifraDeFicha]
      : []),
  ]

  const filasPresupuesto: PresupuestoDeFicha[] = presupuestos.map((p) => ({
    presupuesto_id: p.id,
    nombre: p.obra_nombre?.trim() || p.numero || 'sin nombre',
    estado: p.vigente ? p.estado : `${p.estado} · no vigente`,
    revision: p.version > 1 ? p.version : null,
    precio: p.precio_venta,
    total: p.precio_venta,
    // EL VERBO VIAJA COMO OBJETO Y NO COMO FUNCIÓN: una arrow creada acá y pasada a un componente
    // compila, pasa `build` y revienta en producción con React #419.
    accion: p.convertida_obra_id
      ? { texto: 'Ver la obra', href: `/obras/${p.convertida_obra_id}` }
      : p.estado === 'adjudicada'
        ? { texto: 'Convertir en obra', href: `/presupuestos/${p.id}/convertir` }
        : undefined,
  }))

  // El nombre de cada obra por su clave: sin esto la columna «Obra» de los papeles dibujaría una
  // clave de URL («messina-bases-tanque-so2») en vez del nombre que el dueño reconoce.
  const nombreDeObra = new Map(todas.map((o) => [o.obra_id, o.nombre]))
  // ═══ `nPapeles` SE FUE (11/09/2026 17:50) ═══
  //
  // Sumaba los papeles del OS al `count(cliente_documento)` de la RPC, y las dos partes contaban
  // cosas que la cara ya no dibuja así: los papeles del OS que además están en Drive se contaban
  // DOS veces y los 226 archivos de las carpetas de obra, ninguna. El número de la solapa lo dice
  // ahora `cara.total`, que es literalmente lo que se dibuja.

  // ═══ EL PANEL DEL TRABAJO ═══
  //
  // La clave tiene que ser un trabajo DE ESTE CLIENTE: una URL tipeada a mano no puede pedir los
  // papeles de la obra de otro. `getOrdenesDe` además vuelve a pasar por la RLS, así que esto no es
  // la cerradura — es no hacerle la pregunta.
  const trabajoAbierto = q.trabajo && todas.some((o) => o.obra_id === q.trabajo) ? q.trabajo : null
  const ordenesDelTrabajo = trabajoAbierto
    ? await getOrdenesDe(supabase, { clienteId: id, obraId: trabajoAbierto })
    : null

  // ═══ EL DESGLOSE DE HORAS, SÓLO SI ESTÁ ABIERTO (dueño, 11/09/2026 18:38) ═══
  //
  // UN VIAJE MÁS, Y SÓLO CUANDO SE PIDE: no entra en `pantalla_cliente` porque es de UNA obra y
  // viajaría en las nueve caras para nada. La obra tiene que ser DE ESTE CLIENTE —una URL tipeada a
  // mano no pide el desglose de la obra de otro—; la cerradura sigue siendo la RLS adentro de la
  // función, esto es no hacerle la pregunta.
  const hhAbierta = q.hh && todas.some((o) => o.obra_id === q.hh) ? q.hh : null
  const desglose = hhAbierta && solapa === 'obras'
    ? await leerDesgloseHH(supabase, hhAbierta, q.hhq ?? null)
    : { desglose: null, error: null }

  /** Adónde lleva el número de HH de cada fila: su desglose, en esta misma ficha. */
  const hrefDesgloseHH = (obraId: string) => url({ hh: obraId, hhq: null })
  /** La misma obra, otra quincena. Función declarada y no arrow en el JSX (React #419). */
  const hrefPeriodoHH = (desde: string) => url({ hh: hhAbierta, hhq: desde })

  // ═══ EL ACUMULADO DE HH DEL CLIENTE (dueño, 11/09/2026 18:38) ═══
  //
  // «Un acumulado HH del CLIENTE (suma de sus obras).» Se suma de las MISMAS filas que dibuja la
  // tabla y no se pide a la base: cada obra publica lo suyo y ninguna obra mayor suma las de sus
  // adicionales, así que sumar las filas no cuenta dos veces el mismo jornal. `null` = no puedo
  // leerlas (rol sin permiso), que no es «este cliente no tiene horas».
  const hhDelCliente = ficha.horasPorObra == null
    ? null
    : todas.reduce<number | null>((a, o) => {
      const x = ficha.horasPorObra?.get(o.obra_id)?.hhReal ?? null
      return x == null ? a : (a ?? 0) + x
    }, null)

  // ═══ LO GASTADO POR EL CLIENTE, SUMADO DE LAS MISMAS FILAS QUE LA TABLA (dueño, 12/09/2026) ═══
  //
  // La regla y los huecos los decide `costosDeObra.ts`, con sus tests: acá no se suma a mano. El pie
  // declara si al total de mano de obra le faltan horas — un total parcial publicado liso se lee como
  // el costo completo.
  const costosDelCliente = totalesDelCliente(ficha.costosPorObra, todas.map((o) => o.obra_id))

  // ═══ LOS CUATRO NÚMEROS DE `obra_cuenta` SE RETIRARON (dueño, 12/09/2026 13:10) ═══
  //
  // Abrían la cara «Cuenta corriente» —Contratado · Cobrado c/IVA · Por cobrar · ▲ Vencido, sumados
  // de los trabajos— y existían porque la tabla de abajo medía el vencido con otro reloj. Con la
  // cuenta corriente adentro de Cobranzas, esa cara ya publica arriba las mismas cuatro preguntas
  // desde las filas de la pestaña Cobranzas, y las dos filas juntas mostraban dos «Vencido»
  // distintos a diez centímetros. `cuentaDeTrabajos` sigue existiendo y la usa `/clientes`, que es
  // donde ese corte por trabajo sí es la respuesta.
  const vencido = lector.leer(cuenta, null)?.vencido ?? null
  const tasa = tasaDeConversion(presupuestos)

  return (
    <PantallaV2>
      <Migas volverA="/clientes" padre="Clientes" actual={cliente.nombre_comercial} />

      <TituloDeFicha
        titulo={cliente.nombre_comercial}
        bajada={cliente.razon_social?.trim() || null}
        junto={
          <>
            {!cliente.activo && <PastillaFilo testid="pastilla-archivado">archivado</PastillaFilo>}
            {sinPublicar > 0 && (
              <PastillaFilo testid="pastilla-sin-publicar">
                {sinPublicar} {sinPublicar === 1 ? 'cambio sin publicar' : 'cambios sin publicar'}
              </PastillaFilo>
            )}
          </>
        }
        acciones={puedeEditar
          ? (
              <>
                <AccionSecundaria
                  href={url({ editar: q.editar === '1' ? null : '1' })} testid="editar-cliente"
                  icono={<IconoEditar className="h-[14px] w-[14px]" />}
                >
                  Editar
                </AccionSecundaria>
                {/* LA ÚNICA PRIMARIA. El alta de obra vivía en un `details` arriba de la tabla, que
                    es donde no la encuentra nadie. La obra nace COLGADA DE ESTE CLIENTE. */}
                <AccionPrimaria
                  href={url({ vista: 'obras', nueva: q.nueva === 'obra' ? null : 'obra' })}
                  testid="nueva-obra" icono={<IconoCrear className="h-[14px] w-[14px]" />}
                >
                  Nuevo trabajo
                </AccionPrimaria>
              </>
            )
          : undefined}
      />

      {/* LO QUE ESTÁ VENCIDO ARRIBA DE TODO, con su verbo. Sólo cuando la cuenta corriente se leyó:
          fuera de esa cara el dato no existe, y una barra vacía se leería como «no debe nada». */}
      {vencido != null && vencido > 0 && (
        <AvisoDeFicha tono="neg" verbo="Ver la cuenta" href={url({ vista: 'cuenta' })} testid="aviso-vencido">
          Este cliente tiene {money(vencido)} vencidos sin cobrar.
        </AvisoDeFicha>
      )}

      {lector.falla() && (
        <div style={{ padding: '14px 20px 0' }} data-testid="cliente-lectura-fallida">
          <Aviso tono="neg" titulo="Parte de esta ficha no se pudo leer">
            Lo que falta abajo NO significa que no exista: significa que la consulta falló. {lector.falla()}
          </Aviso>
        </div>
      )}

      {!aSangre && <CifrasDeFicha cifras={cifras} testid="cifras-cliente" />}

      <SolapasDeFicha
        testid="vistas-cliente"
        solapas={solapasDeCliente({
          veEconomia,
          obras: todas.length,
          presupuestos: presupuestos.length,
          // LA CUENTA SALE DE LA RPC, NO DEL `.length`: `documentos` viaja vacío fuera de las caras
          // Documentos y Actividad (20260911T1200), así que contar el array escribiría un cero
          // sobre un cliente que tiene 208 papeles.
          // EL N DE LA SOLAPA ES LO QUE SE DIBUJA ADENTRO (dueño, 11/09/2026): decía
          // `count(cliente_documento)`, que en San Francisco era 0 con 63 archivos abajo. Ahora lo
          // cuenta la RPC sobre las MISMAS cuatro fuentes que dibuja `armarCaraDocumentos`, y los dos
          // números se comparan sobre los cinco clientes reales en
          // `orquestador/lib/cara-documentos.pg.test.mjs`. Sale de la RPC y no de `cara.total` porque
          // la barra de solapas se dibuja en las NUEVE caras y los papeles de obra sólo viajan en
          // ésta: con `cara.total`, el mismo cliente mostraría un número distinto en cada solapa.
          documentos: ficha.nDocumentos,
          cobranzas: cobranzas?.length ?? null,
          ordenes: ordenesDelCliente?.length ?? null,
        }).map((s) => ({
          clave: s.clave,
          titulo: s.label,
          cuenta: s.cuenta,
          activa: solapa === s.clave,
          // Obras es la cara por defecto y por eso su enlace NO lleva parámetro: así la dirección de
          // la ficha sigue siendo `/clientes/<slug>` a secas.
          href: url({ vista: s.clave === 'obras' ? null : s.clave, nueva: null }),
        }))}
      />

      {/* ═══ COBRANZAS ES LA CARA DE LA PLATA, Y AHORA ES UNA SOLA (dueño, 12/09/2026 13:10) ═══

          «El CRM admin en cada cliente tiene secciones inútiles y repetitivas con datos que pueden
          unificarse en menos secciones.» Eran TRES caras sobre el mismo dinero —Cobranzas fila por
          fila, Cuenta corriente su resumen, Esquema de pago su cronograma— y para contestar «¿cuánto
          me debe y cuándo entra?» había que recorrer las tres y volver.

          EL ORDEN ES EL DE LA PREGUNTA: qué hay pendiente (las filas y su fila de cifras), cómo está
          la cuenta (saldo, antigüedad, certificados) y cuándo entra (el cronograma).

          NINGUNA CIFRA SE DIBUJA DOS VECES en esta cara: ver el comentario de cada bloque. */}
      {solapa === 'cobranzas' && veEconomia && (
        <>
          <SolapaCobranzas
            filas={cobranzas}
            obras={todas.map((o) => ({ obra_id: o.obra_id, nombre: o.nombre }))}
            obrasConOC={ordenesPorObra}
            contratado={contratadoEnCurso}
            contratadoUsd={contratoUsd}
            recorte={recorteCobranza}
            hrefRecorte={hrefRecorteCobranza}
          />

          {/* ═══ LAS CUATRO CIFRAS DE `obra_cuenta` NO VIAJAN ACÁ (12/09/2026) ═══

              Cuando la cuenta corriente era una cara aparte, arriba se dibujaban Contratado ·
              Cobrado · Por cobrar · Vencido leídos de `obra_cuenta`, porque la tabla de abajo mide
              el vencido con OTRO reloj. Juntas en la misma cara, esas cuatro quedaban al lado de las
              seis de `cifras-cobranzas` —que contestan lo mismo desde la pestaña Cobranzas— y el
              dueño veía dos «Vencido» distintos a diez centímetros. La fila de cifras de esta cara es
              UNA: la de arriba. */}
          <div id="cuenta-corriente" style={{ scrollMarginTop: 90 }}>
            <CuentaCorriente
              cuenta={lector.leer(cuenta, null)}
              documentos={lector.leer(certificados, [])}
              hoy={hoy}
              registrarCobro={registrarCobroDeCertificado}
            />
          </div>

          <div id="esquema-de-pago" style={{ scrollMarginTop: 90 }}>
            <EsquemaPago
              esquema={lector.leer(esquema, null)}
              hoy={hoy}
              clienteId={id}
              editarPago={editarPagoDelEsquema}
              publicarEsquema={publicarEsquema}
            />
          </div>
        </>
      )}

      {/* ═══ EL PORTAL, COMO SUB-PANTALLA Y NO COMO SOLAPA (dueño, 12/09/2026 13:10) ═══

          La pantalla es la misma de siempre —handoff 31, con su cascada de permisos, su alta de mail
          y su registro de ingresos—: lo que cambió es cómo se llega. Se abre desde el panel «Portal
          del cliente» del costado, que ahora publica CUÁNTOS entran sin necesidad de abrirla. */}
      {portalAbierto && (
        <div data-testid="sub-pantalla-portal">
          <div style={{ padding: '14px 24px 0' }}>
            <a
              href={url({ portal: null })} data-testid="volver-de-portal"
              style={{ fontSize: '12.5px', color: V.apagado }}
            >
              ‹ Volver a la ficha del cliente
            </a>
          </div>
          <AccesosPortal
            accesos={lector.leer(accesos, [])}
            actividad={lector.leer(actividadPortal, [])}
            // EL CRUCE CONTRA LOS CONTACTOS YA CARGADOS es el único control contra un typo en el
            // mail que se habilita. Sale de la MISMA lectura que dibuja el bloque Contactos.
            contactos={lector.leer(contactos, []).map((c) => ({ nombre: c.nombre, email: c.email, rol: c.rol }))}
            obras={todas.map((o) => ({ id: o.obra_id, nombre: o.nombre }))}
            hoy={hoy}
            clienteId={id}
            habilitarAcceso={habilitarAcceso}
            revocarAcceso={revocarAcceso}
            reenviarInvitacion={reenviarInvitacion}
          />
        </div>
      )}

      {!aSangre && (
        <CuerpoDeFicha>
          <div className="flex min-w-0 flex-1 flex-col gap-3" data-testid={`solapa-abierta-${solapa}`}>
            {solapa === 'obras' && (
              <>
                {q.nueva === 'obra' && puedeEditar && (
                  <div style={{ borderBottom: `1px solid ${V.linea}`, paddingBottom: 14, marginBottom: 4 }} data-testid="alta-obra">
                    {/* EL VERBO DICE «TRABAJO» Y LO QUE CREA SIGUE SIENDO UNA OBRA, con su id y su
                        ficha en el ERP. No es un eufemismo: es el mismo registro llamado como lo
                        nombra quien lo encarga. El formulario es el del módulo Obras, sin copia. */}
                    <FormAccion accion={crearObra} testid="form-obra" enviar="Crear trabajo" limpiarAlOk mensajeOk="Trabajo creado. Queda registrado como obra en el módulo Obras.">
                      {/* La obra nace COLGADA DE ESTE CLIENTE. Hasta que existió `cliente_id`, las
                          tres obras de La Estrella eran tres cadenas de texto iguales por casualidad. */}
                      <input type="hidden" name="cliente_id" value={id} />
                      <CamposObra />
                    </FormAccion>
                  </div>
                )}

                {/* ═══ EL DESGLOSE REEMPLAZA LA LISTA, NO SE ABRE AL LADO (dueño, 11/09/2026 18:38) ═══

                    La grilla persona × día tiene hasta 16 columnas de fechas: en el panel lateral de
                    300px no se lee, y debajo de la tabla obligaría a recorrer toda la lista para
                    llegar. Se vuelve con «‹ obras del cliente», que es un enlace y no el botón de
                    atrás del navegador. */}
                {desglose.error && <Aviso tono="neg">{`No pude leer el desglose de horas: ${desglose.error}`}</Aviso>}
                {hhAbierta && desglose.desglose === null && !desglose.error && (
                  <p data-testid="desglose-sin-permiso" style={{ fontSize: '12.5px', color: V.apagado }}>
                    No puedo mostrar el desglose de horas de este trabajo. Las horas de la obra las ve
                    Administración; tu rol sólo ve las propias.
                  </p>
                )}
                {desglose.desglose && (
                  <DesgloseHH
                    d={desglose.desglose}
                    totalHH={ficha.horasPorObra?.get(desglose.desglose.obra.obraId)?.hhReal ?? null}
                    volverHref={url({ hh: null, hhq: null })}
                    hrefPeriodo={hrefPeriodoHH}
                  />
                )}

                {/* ═══ LA LÍNEA DE TIEMPO ENTERA REEMPLAZA LA LISTA, COMO EL DESGLOSE DE HH ═══

                    «Actividad» dejó de ser una solapa el 12/09/2026: el costado publica los últimos
                    hechos y acá se despliega la historia completa —con los documentos, que el resumen
                    del costado no trae—. Se vuelve con un enlace, no con el botón de atrás. */}
                {actividadTodo && (
                  <div data-testid="actividad-completa">
                    <p style={{ fontSize: '12.5px', paddingBottom: 10 }}>
                      <a href={url({ actividad: null })} data-testid="volver-de-actividad" style={{ color: V.apagado }}>
                        ‹ Volver a los trabajos
                      </a>
                    </p>
                    <BloqueActividad
                      linea={lector.leer(linea, { eventos: [], sinFecha: 0 })}
                      puedeVerContractuales={VE_CONTRACTUALES.includes(rol ?? '')}
                      puedeEscribir={puedeEditar}
                      crearNota={crearNota.bind(null, id)}
                      todo
                      urlTodo={url({ actividad: 'todo' })}
                      urlPoco={url({ actividad: null })}
                    />
                  </div>
                )}

                {!hhAbierta && !actividadTodo && (
                <>
                <ObrasDelCliente
                  obras={enCursoConAdicionales}
                  veEconomia={veEconomia}
                  economia={economia}
                  papeles={papeles}
                  horas={ficha.horasPorObra}
                  costos={ficha.costosPorObra}
                  hrefDesgloseHH={hrefDesgloseHH}
                  hrefTrabajo={hrefTrabajo}
                  vacio={cerradas.length === 0
                    ? 'Este cliente no tiene ningún trabajo. Se crea desde arriba, colgado de este cliente.'
                    : 'Ningún trabajo en curso. Los terminados están abajo.'}
                />

                {/* LAS CERRADAS SE VEN SIEMPRE (DISENO-FICHA-CLIENTE-v3 · §3.1). Estaban detrás de
                    `?archivadas=1`, y por eso «ME - BASES TANQUE SO2» —cerrada, con su OC 1864, su
                    OP 4865 y sus dos facturas— no aparecía en ningún lado de la ficha. Una obra
                    cerrada con papeles no es una obra archivada: es la historia de lo que se le
                    vendió a este cliente, y es la mitad de la respuesta a «¿qué le facturamos?». */}
                {cerradas.length > 0 && (
                  <ObrasDelCliente
                    obras={cerradas}
                    veEconomia={veEconomia}
                    economia={economia}
                    papeles={papeles}
                    // LAS TERMINADAS TAMBIÉN LLEVAN SUS HORAS Y SUS COSTOS: son la historia de lo
                    // que costó cada trabajo, y es la mitad de lo que sirve para cotizar el próximo.
                    horas={ficha.horasPorObra}
                    costos={ficha.costosPorObra}
                    hrefDesgloseHH={hrefDesgloseHH}
                    hrefTrabajo={hrefTrabajo}
                    titulo={`Terminados · ${cerradas.length}`}
                    vacio=""
                  />
                )}

                {/* EL ACUMULADO DEL CLIENTE, EN EL PIE DE LA TABLA. No va en la fila de cifras del
                    titular: `hh_obra` viaja SÓLO en esta cara —es la única que las dibuja— y en las
                    otras ocho la cifra tendría que decir «no las tengo», que se lee como un cero. */}
                <PieDeLosTrabajos hh={hhDelCliente} obras={todas.length} costos={costosDelCliente} />
                </>
                )}

                {/* ═══ EL PÁRRAFO DEL PIE SE FUE (10/09/2026) ═══

                    Explicaba de dónde salen el contratado, las OC y el costo. La skill de diseño lo
                    prohíbe con nombre —«no párrafos explicativos permanentes»— y el dueño lo marcó
                    dos veces. Lo que había que explicar de cada columna vive en su `title`, que es
                    donde el OS pone la trazabilidad de un número. Y el costo ya no se nombra
                    siquiera: salió del CRM entero. */}
              </>
            )}

            {veEconomia && solapa === 'presupuestos' && (
              <>
                <PresupuestosDelCliente filas={filasPresupuesto} />
                <p style={{ fontSize: '11px', lineHeight: 1.6, color: V.tenue, maxWidth: 720 }} data-testid="nota-presupuestos">
                  {/* SIN CERRADOS NO SE ESCRIBE UNA TASA: «0 %» sobre tres presupuestos abiertos
                      diría que se perdieron, y no se perdió ninguno todavía. */}
                  {tasa === null
                    ? 'Ninguno cerró todavía, así que no hay tasa de conversión que medir. '
                    : `Tasa de conversión ${tasa} % — ganados sobre cerrados, sin contar los abiertos. `}
                  Un presupuesto adjudicado se convierte en obra: el plan nace de la plantilla y cada
                  actividad guarda de qué partida salió. Las revisiones anteriores existen y se abren
                  desde adentro; sólo la vigente cuenta. Acá no se muestra margen: se lee en el
                  presupuesto, con su cascada al lado, que es donde se puede auditar.
                </p>
              </>
            )}

            {solapa === 'ordenes' && veEconomia && (
              <OrdenesDelCliente ordenes={ordenesDelCliente} nombreDeObra={nombreDeObra} veEconomia={veEconomia} />
            )}

            {solapa === 'documentos' && (
              <>
                {/* ═══ UNA SOLA JERARQUÍA (dueño, 11/09/2026 17:50) ═══

                    «El CRM dice documentos de drive (0) y está pésimo eso» · «no se entiende nada
                    realmente la UX de esa sección documentos».

                    Eran CINCO bloques de primer nivel con el mismo peso visual —papeles por tipo,
                    «Documentos de Drive · N», vínculos manuales, documentos subidos y el índice de
                    la carpeta— y el mismo PDF podía estar en tres. Ahora es un árbol: trabajo →
                    adicional → categoría → archivo, y al final sólo lo que quedó afuera de alguna
                    obra. Qué se dibuja y qué se descarta lo decide `armarCaraDocumentos`, que es
                    puro y tiene sus tests; acá sólo se le pasan las listas que ya trajo la RPC. */}
                <CaraDeDocumentos
                  cara={cara}
                  truncado={archivosDrive?.truncado ?? false}
                  carpetaDelClienteHref={cliente.drive_carpeta_id
                    ? `https://drive.google.com/drive/folders/${cliente.drive_carpeta_id}`
                    : null}
                  vinculados={cara.vinculados.length > 0
                    ? (
                        <div style={{ paddingLeft: 16, paddingTop: 14 }} data-testid="papeles-vinculados">
                          <p style={{ fontSize: '11px', letterSpacing: '.06em', textTransform: 'uppercase', color: V.tenue, padding: '6px 0 2px' }}>
                            Vinculados a mano · {cara.vinculados.length}
                          </p>
                          <BloqueDocumentos
                            menuAbierto={q.accDoc ?? null}
                            urlMenuDe={(d) => url({ accDoc: d })}
                            documentos={cara.vinculados}
                            carpetaDriveId={cliente.drive_carpeta_id}
                            vincular={vincularDocumentoCliente.bind(null, id)}
                            clasificar={(f) => clasificarDocumentoCliente.bind(null, id, f)}
                            desvincular={desvincularDocumentoCliente.bind(null, id)}
                            puedeEditar={puedeEditar}
                            todo={q.documentos === 'todo'}
                            urlTodo={url({ documentos: 'todo' })}
                            urlPoco={url({ documentos: null })}
                          />
                        </div>
                      )
                    : null}
                  extra={subidos && subidos.filas.length > 0
                    ? (
                        <div style={{ marginTop: 24 }}>
                          <DocumentosSubidos datos={subidos} tipo="cliente" entidadId={id} testid="cliente-documentos-subidos" />
                        </div>
                      )
                    : null}
                />
              </>
            )}

          </div>

          {/* EL COSTADO NO CAMBIA CON LA CARA: es lo que identifica al cliente y a quién llamar. */}
          <CostadoDeFicha testid="panel-informacion">
            <RotuloPanel>Identidad</RotuloPanel>
            <BloqueInformacion
              cliente={cliente}
              responsables={lector.leer(responsables, [])}
              editar={editarCliente.bind(null, id)}
              vincularCarpeta={vincularCarpetaCliente.bind(null, id)}
              archivar={archivarCliente}
              puedeEditar={puedeEditar}
              edicionAbierta={q.editar === '1'}
            />

            <div style={{ marginTop: 22 }}>
              <RotuloPanel cuenta={lector.leer(contactos, []).length}>Contacto</RotuloPanel>
            </div>
            <BloqueContactos
              contactos={lector.leer(contactos, [])}
              enEdicion={q.contacto ?? null}
              menuAbierto={q.accContacto ?? null}
              urlDe={(c) => url({ contacto: c })}
              urlMenuDe={(c) => url({ accContacto: c })}
              editar={(c) => editarContacto.bind(null, c)}
              crear={crearContacto.bind(null, id)}
              borrar={borrarContacto}
              puedeEditar={puedeEditar}
            />

            {/* ═══ LA ACTIVIDAD BAJÓ AL COSTADO (dueño, 12/09/2026 13:10) ═══

                Era una de las nueve solapas. La historia de la relación se lee de reojo mientras se
                mira otra cosa: acá está al lado de los trabajos, y la línea entera se abre sin
                cambiar de cara. La nota nueva se escribe desde acá, que es donde se leyó lo que pasó. */}
            <div style={{ marginTop: 22 }}>
              <RotuloPanel>Actividad reciente</RotuloPanel>
            </div>
            <ActividadReciente
              linea={lector.leer(linea, { eventos: [], sinFecha: 0 })}
              puedeEscribir={puedeEditar}
              crearNota={crearNota.bind(null, id)}
              urlTodo={url({ actividad: 'todo' })}
            />

            {veEconomia && (
              <>
                <div style={{ marginTop: 22 }}>
                  <RotuloPanel>Portal del cliente</RotuloPanel>
                </div>
                {/* ═══ EL ESTADO SE PUBLICA SIEMPRE, NO SÓLO ADENTRO DE SU CARA (12/09/2026) ═══

                    Decía «Se lee al abrir la cara» —un placeholder que le explica al dueño una
                    decisión interna del renderizado en el lugar donde esperaba un dato (10/09/2026
                    18:10)— y sólo se reemplazaba por el número ADENTRO de la cara que se fue. Ahora
                    los accesos se leen en toda cara con costado, así que el número está acá: cuántos
                    entran y cuántos todavía no ingresaron nunca, que es la pregunta que se hace sin
                    querer editar nada. Un «0 habilitados» sin haber leído sigue prohibido: cuando la
                    lectura falla, `lector` deja la lista vacía y el renglón dice que no se pudo. */}
                {accesos.error
                  ? (
                    <p style={{ fontSize: '12px', color: V.warn, padding: '7px 0' }} data-testid="resumen-portal">
                      No pude leer los accesos de este cliente.
                    </p>
                    )
                  : (
                    <p style={{ fontSize: '12px', color: V.tenue, padding: '7px 0' }} data-testid="resumen-portal">
                      {portal.habilitados} {portal.habilitados === 1 ? 'acceso habilitado' : 'accesos habilitados'}
                      {portal.sinIngresar > 0 && ` · ${portal.sinIngresar} sin ingresar nunca`}
                      {portal.revocados > 0 && ` · ${portal.revocados} revocado${portal.revocados === 1 ? '' : 's'}`}
                    </p>
                    )}
                <a
                  href={url({ portal: '1' })} data-testid="gestionar-accesos"
                  style={{ display: 'inline-block', fontSize: '12.5px', fontWeight: 500, color: V.tinta, marginTop: 4 }}
                >
                  Gestionar accesos →
                </a>
              </>
            )}
          </CostadoDeFicha>
        </CuerpoDeFicha>
      )}
      {trabajoAbierto && (
        <PanelOrdenes
          titulo={nombreDeObra.get(trabajoAbierto) ?? trabajoAbierto}
          ordenes={ordenesDelTrabajo}
          de="de este trabajo"
          verEnObras={`/obras/${trabajoAbierto}`}
          veEconomia={veEconomia}
          cerrarHref={url({ trabajo: null })}
        />
      )}
    </PantallaV2>
  )
}
