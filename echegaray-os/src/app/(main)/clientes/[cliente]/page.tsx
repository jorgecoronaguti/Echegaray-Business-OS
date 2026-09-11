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

import { notFound } from 'next/navigation'
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
import { BloqueActividad } from '@/features/clientes/components/BloqueActividad'
import { BloqueContactos } from '@/features/clientes/components/BloqueContactos'
import { BloqueDocumentos } from '@/features/clientes/components/BloqueDocumentos'
import { getArchivosDeEntidad } from '@/features/documentos/services/carpetaDeEntidadService'
import { getDocumentosSubidos } from '@/features/documentos/services/documentosSubidosService'
import { ArchivosDeDrive } from '@/features/documentos/components/ArchivosDeDrive'
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
import { SIN_PRECIO_EN_OBRAS } from '@/features/clientes/services/economiaObras'
import {
  esRecorteCobranza, getCobranzasDelCliente, type FilaCobranza,
} from '@/features/clientes/services/cobranzasCliente'
import { SolapaCobranzas } from '@/features/clientes/components/cobranzas/SolapaCobranzas'
import { cuentaDeTrabajos } from '@/features/clientes/services/cuentaDeTrabajos'
import { getAccesos, getActividadPortal } from '@/features/clientes/services/accesosService'
import { getOrdenesDe, getOrdenesDelCliente } from '@/features/clientes/services/ordenesCliente'
import { OrdenesDelCliente } from '@/features/clientes/components/OrdenesDelCliente'
import { PanelOrdenes } from '@/features/clientes/components/PanelOrdenes'
import { PapelesPorTipo } from '@/features/clientes/components/PapelesPorTipo'
import { registrarCobroDeCertificado } from '@/features/clientes/services/cuentaCorrienteActions'
import { editarPagoDelEsquema, publicarEsquema } from '@/features/clientes/services/esquemaActions'
import {
  habilitarAcceso, reenviarInvitacion, revocarAcceso,
} from '@/features/clientes/services/accesosActions'
import { resumenAccesos } from '@/features/clientes/services/reglasPortal'
import { cambiosSinPublicar } from '@/features/clientes/services/reglasEsquema'
import { A_SANGRE, solapaDe, solapasDeCliente } from '@/features/clientes/services/solapasCliente'
import { tasaDeConversion } from '@/features/clientes/services/tasaConversion'
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
}

export default async function ClientePage({ params, searchParams }: {
  params: Promise<{ cliente: string }>
  searchParams: Promise<Query>
}) {
  const { cliente: slug } = await params
  const q = await searchParams

  const supabase = await createClient()
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
  const ficha = await leerFichaDeUnaConsulta(supabase, slug)
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
  const economiaCliente = veEconomia ? ficha.economiaCliente : null
  // LO COBRADO POR TRABAJO, de la MISMA conversión que usa `/clientes` (`armarCobradoPorObra` sobre
  // `public.obra_cuenta`). Sin esto la ficha no puede decir si un trabajo cobró; y con una lectura
  // propia, las dos pantallas del módulo volverían a poder decir números distintos.
  const cobradoPorObra = veEconomia ? ficha.cobradoPorObra : null

  // `crearLector` distingue «no pude leer» de «no hay». Se conserva aunque ahora la lectura sea una
  // sola: los componentes reciben la misma forma, y el día que alguna clave vuelva a poder fallar
  // sola, el que la agregue no tiene que reinventar la distinción.
  const lector = crearLector()

  const solapa = solapaDe(q.vista, q.solapa)
  // EL DÍA DE HOY LO DECIDE EL SERVIDOR, EN EL HUSO DE LA EMPRESA. Si «vencido» lo calculara el
  // navegador, un jefe con el reloj corrido vería una mora distinta sobre el mismo cliente.
  const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' })
  const aSangre = A_SANGRE.includes(solapa)
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
    solapa === 'cuenta' && veEconomia
      ? Promise.all([getCuentaCorriente(supabase, id), getCertificados(supabase, id)])
      : Promise.resolve<[Awaited<ReturnType<typeof getCuentaCorriente>>, Awaited<ReturnType<typeof getCertificados>>]>(
          [{ data: null, error: null }, { data: [], error: null }]),
    solapa === 'esquema' && veEconomia
      ? getEsquemaCliente(supabase, id)
      : Promise.resolve({ data: null, error: null }),
    solapa === 'accesos' && veEconomia
      ? Promise.all([getAccesos(supabase, id), getActividadPortal(supabase, id)])
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
  const cerradas = todas.filter((o) => o.estado === 'cerrada')
  const enCurso = todas.filter((o) => o.estado === 'activa')
  // ═══ LO CONTRATADO EN CURSO LO DICE `cliente_economia`, NO ESTA PÁGINA (H1, 10/09/2026) ═══
  //
  // Era `sumaConHuecos` sobre las obras con FALLBACK a `obra_panel.monto_contratado`. El fallback se
  // fue con la suma: el campo del formulario es la otra definición del contratado —la que sumaba
  // sólo las obras cerradas de Messina— y mientras siga siendo el respaldo de alguna cara, dos
  // pantallas pueden volver a discrepar sin que nadie lo note. Si la vista no se pudo leer, la
  // cifra dice qué falta; no se rellena con otra cuenta.
  const contratadoEnCurso = economiaCliente?.contratado_en_curso ?? null

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

  // ═══ LAS CUATRO CIFRAS (DISENO-FICHA-CLIENTE-v3 · §2.3) ═══
  //
  // Salieron «Contactos» y «Documentos»: los dos son conteos que ya se publican donde viven —el
  // costado dice cuántos contactos hay, la solapa dice cuántos papeles— y un dato dos veces es la
  // forma más barata de que dos partes de la pantalla empiecen a decir distinto.
  //
  // Entraron OC y OP, que es lo que no se veía en ningún lado. NO se publica «Facturado» ni
  // «Cobrado» aunque la fuente exista (`cliente_cuenta_corriente`): su ventana son 90 días y
  // Contratado y OC son acumulados desde 2024 — puestos en la misma línea invitan a restarlos, y
  // eso es mezclar ventanas incompatibles. Tampoco «Pendiente»: no tiene fuente, y la resta de dos
  // universos distintos sería un número inventado. El saldo real vive en Cuenta corriente.
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
    {
      // «c/IVA» EN EL RÓTULO, IGUAL QUE EN LA LISTA (10/09/2026). El importe de una OC es el TOTAL
      // del PDF —con IVA— y «Contratado en curso», tres cifras a la izquierda, es NETO. Puestas en
      // la misma línea sin decirlo, invitan a una resta que no significa nada: el Adicional Tercer
      // Muro tiene una OC de $12.100.000 contra $10.000.000 contratados, que es el mismo número.
      rotulo: `OC recibidas c/IVA${papeles ? ` (${papeles.totalOC.n})` : ''}`,
      valor: papeles?.totalOC.importe != null ? money(papeles.totalOC.importe) : null,
      // ═══ «NINGUNA» NO ERA LA VERDAD DE QUATTROPANI (dueño, 10/09/2026 18:10) ═══
      //
      // Su trabajo no se encargó con una orden de compra: se encargó con un CONTRATO en dólares.
      // «OC recibidas c/IVA (0) · ninguna» se lee como un papel que falta, y no falta ninguno.
      falta: papeles === null
        ? 'no pude leerlas'
        : contratoUsd != null ? `contrato U$S ${Math.round(contratoUsd).toLocaleString('es-AR')} · sin OC` : 'ninguna',
    },
    {
      // «RECIBIDAS», NO «COBRADAS»: una orden de pago es la instrucción del cliente a su banco. Que
      // el dinero entró lo prueba el extracto, no el PDF de un tercero.
      rotulo: `OP recibidas c/IVA${papeles ? ` (${papeles.totalOP.n})` : ''}`,
      valor: papeles?.totalOP.importe != null ? money(papeles.totalOP.importe) : null,
      falta: papeles === null ? 'no pude leerlas' : 'ninguna',
    },
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
  // LA CUENTA DE LA SOLAPA SON TODOS LOS PAPELES, no sólo los de Drive: desde hoy la cara los
  // muestra a los dos, y un número que cuenta la mitad de lo que se ve es un número que miente.
  const nPapeles = papeles ? papeles.oc.length + papeles.op.length + papeles.retenciones.length
    + papeles.facturas.length + papeles.otros.length : 0

  // ═══ EL PANEL DEL TRABAJO ═══
  //
  // La clave tiene que ser un trabajo DE ESTE CLIENTE: una URL tipeada a mano no puede pedir los
  // papeles de la obra de otro. `getOrdenesDe` además vuelve a pasar por la RLS, así que esto no es
  // la cerradura — es no hacerle la pregunta.
  const trabajoAbierto = q.trabajo && todas.some((o) => o.obra_id === q.trabajo) ? q.trabajo : null
  const ordenesDelTrabajo = trabajoAbierto
    ? await getOrdenesDe(supabase, { clienteId: id, obraId: trabajoAbierto })
    : null

  // LOS CUATRO NÚMEROS DE LA CUENTA, SUMADOS DE SUS TRABAJOS (misma fuente que `/clientes`).
  const cuentaTrabajos = cuentaDeTrabajos(
    todas.map((o) => ({ obra_id: o.obra_id, contratado: economia?.get(o.obra_id)?.contratado ?? null })),
    cobradoPorObra,
  )
  const cifrasDeLaCuenta: CifraDeFicha[] = [
    { rotulo: 'Contratado', valor: cuentaTrabajos.contratado != null ? money(cuentaTrabajos.contratado) : null, falta: SIN_PRECIO_EN_OBRAS },
    { rotulo: 'Cobrado c/IVA', valor: cuentaTrabajos.cobrado != null ? money(cuentaTrabajos.cobrado) : null, falta: 'sin cobranzas imputadas' },
    { rotulo: 'Por cobrar', valor: cuentaTrabajos.porCobrar != null ? money(cuentaTrabajos.porCobrar) : null, falta: 'sin pendientes' },
    // EL ÁMBAR ES PARA LO QUE RECLAMA TRABAJO: una mora vencida lo es. Y cuando no se pudo medir,
    // la cifra dice que no se midió — nunca «$ 0», que se leería como «no debe nada».
    {
      rotulo: '▲ Vencido',
      valor: cuentaTrabajos.vencido != null ? money(cuentaTrabajos.vencido) : null,
      falta: 'no medido', tono: cuentaTrabajos.vencido ? 'warn' : undefined,
    },
  ]

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
          documentos: lector.leer(documentos, []).length + nPapeles,
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

      {solapa === 'cobranzas' && veEconomia && (
        <SolapaCobranzas
          filas={cobranzas}
          obras={todas.map((o) => ({ obra_id: o.obra_id, nombre: o.nombre }))}
          obrasConOC={ordenesPorObra}
          contratado={contratadoEnCurso}
          contratadoUsd={contratoUsd}
          recorte={recorteCobranza}
          hrefRecorte={hrefRecorteCobranza}
        />
      )}

      {solapa === 'cuenta' && veEconomia && (
        <div style={{ padding: '18px 20px 24px' }}>
          {/* ═══ LOS CUATRO NÚMEROS DE LA PESTAÑA OBRAS, ARRIBA DE TODO (10/09/2026) ═══

              Son los MISMOS que la fila del trabajo en `/clientes`, sumados con la misma aritmética
              que el pie de esa pestaña y sobre la misma fuente (`obra_cuenta`). Existen porque la
              cuenta corriente de abajo mide el vencido con OTRO reloj —`fecha_cobro < hoy`, que se
              re-tipea cada vez que el cobro se posterga— y el mismo cliente tenía dos moras según
              la cara que se abriera. Acá arriba está la de OBRAS, con su rótulo. */}
          <CifrasDeFicha testid="cuenta-de-trabajos" cifras={cifrasDeLaCuenta} />
          <CuentaCorriente
            cuenta={lector.leer(cuenta, null)}
            documentos={lector.leer(certificados, [])}
            hoy={hoy}
            registrarCobro={registrarCobroDeCertificado}
          />
        </div>
      )}

      {solapa === 'esquema' && veEconomia && (
        <div style={{ padding: '18px 20px 24px' }}>
          <EsquemaPago
            esquema={lector.leer(esquema, null)}
            hoy={hoy}
            clienteId={id}
            editarPago={editarPagoDelEsquema}
            publicarEsquema={publicarEsquema}
          />
        </div>
      )}

      {solapa === 'accesos' && veEconomia && (
        <div style={{ padding: '18px 20px 24px' }}>
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

                <ObrasDelCliente
                  obras={enCurso}
                  veEconomia={veEconomia}
                  economia={economia}
                  papeles={papeles}
                  cobrado={cobradoPorObra}
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
                    cobrado={cobradoPorObra}
                    hrefTrabajo={hrefTrabajo}
                    titulo={`Terminados · ${cerradas.length}`}
                    vacio=""
                  />
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
                {/* LOS PAPELES DEL CLIENTE, POR TIPO, ARRIBA DEL ÍNDICE DE DRIVE. No son un archivo
                    más de la carpeta: son los documentos que encargan y pagan el trabajo, y viven
                    en el OS (bucket privado), no en Drive. */}
                <PapelesPorTipo
                  papeles={papeles}
                  veEconomia={veEconomia}
                  nombreDeObra={(obraId) => nombreDeObra.get(obraId) ?? obraId}
                />
                <p style={{ fontSize: '11px', letterSpacing: '.06em', textTransform: 'uppercase', color: V.tenue, padding: '6px 0 4px' }}>
                  Documentos de Drive · {lector.leer(documentos, []).length}
                </p>
              <BloqueDocumentos
                menuAbierto={q.accDoc ?? null}
                urlMenuDe={(d) => url({ accDoc: d })}
                documentos={lector.leer(documentos, [])}
                carpetaDriveId={cliente.drive_carpeta_id}
                vincular={vincularDocumentoCliente.bind(null, id)}
                clasificar={(f) => clasificarDocumentoCliente.bind(null, id, f)}
                desvincular={desvincularDocumentoCliente.bind(null, id)}
                puedeEditar={puedeEditar}
                todo={q.documentos === 'todo'}
                urlTodo={url({ documentos: 'todo' })}
                urlPoco={url({ documentos: null })}
              />
              {subidos && (
                <div style={{ marginTop: 32 }}>
                  <DocumentosSubidos datos={subidos} tipo="cliente" entidadId={id} testid="cliente-documentos-subidos" />
                </div>
              )}
              {archivosDrive && (
                <div style={{ marginTop: 32 }}>
                  <ArchivosDeDrive
                    datos={archivosDrive} tipo="cliente" rol={rol} testid="cliente-archivos-drive"
                  />
                </div>
              )}
              </>
            )}

            {solapa === 'actividad' && (
              <BloqueActividad
                linea={lector.leer(linea, { eventos: [], sinFecha: 0 })}
                puedeVerContractuales={VE_CONTRACTUALES.includes(rol ?? '')}
                puedeEscribir={puedeEditar}
                crearNota={crearNota.bind(null, id)}
                todo={q.actividad === 'todo'}
                urlTodo={url({ actividad: 'todo' })}
                urlPoco={url({ actividad: null })}
              />
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

            {veEconomia && (
              <>
                <div style={{ marginTop: 22 }}>
                  <RotuloPanel>Portal del cliente</RotuloPanel>
                </div>
                {/* EL RESUMEN SÓLO SE AFIRMA CUANDO SE LEYÓ, Y CUANDO NO, NO SE ESCRIBE NADA.
                    Decía «Se lee al abrir la cara», que es un placeholder: le explica al dueño una
                    decisión interna del renderizado en el lugar donde esperaba un dato (10/09/2026
                    18:10). Un «0 habilitados» tampoco se puede escribir sin haber leído: diría que
                    nadie de afuera puede entrar, que es la conclusión que hace que nadie revise. */}
                {solapa === 'accesos' && (
                  <p style={{ fontSize: '12px', color: V.tenue, padding: '7px 0' }} data-testid="resumen-portal">
                    {portal.habilitados} {portal.habilitados === 1 ? 'acceso habilitado' : 'accesos habilitados'}
                  </p>
                )}
                <a
                  href={url({ vista: 'accesos' })} data-testid="gestionar-accesos"
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
