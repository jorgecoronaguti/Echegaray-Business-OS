// LO QUE VE EL CLIENTE — pantallas 29 y 30.
//
// ═══ DOS CERRADURAS, Y NINGUNA SOBRA ═══
//
// 1. LA BASE decide QUÉ FILAS. `cliente_de_sesion()` y las policies filtran por cliente y por obra:
//    eso vale aunque alguien consulte PostgREST directo, sin pasar por ninguna pantalla.
// 2. ESTA CAPA decide QUÉ CAMPOS. `puede_ver_montos` no se puede expresar como una policy —RLS
//    filtra filas, no columnas— así que el enmascarado de importes vive acá.
//
// LÍMITE CONOCIDO Y DECLARADO: la segunda cerradura es de aplicación, no de base. Un cliente con
// `puede_ver_montos = false` que consultara PostgREST con su propio token VERÍA los importes de sus
// propias filas. Cerrarlo del todo exige mover estas lecturas a funciones `security definer` que
// enmascaren en Postgres. Está declarado en el informe y no se dio por resuelto.
//
// Cuando no se pueden ver, los importes van en `null` y NUNCA en 0: un 0 es un número y el cliente
// leería «este certificado no vale nada».
//
// ═══ POR QUÉ NO RECIBEN EL `SupabaseClient` ═══
//
// El resto del repo lo pasa como primer parámetro. Acá no, y es a propósito: TODAS son de la sesión
// —no existe «la obra de otro» que pedirles—. El filtro no lo pone este archivo: lo ponen las
// policies de `cliente_de_sesion()`. Si el filtro estuviera acá, una llamada directa a PostgREST con
// el token del cliente devolvería la cartera entera.
//
// ═══ LO QUE ESTA BASE TODAVÍA NO PUEDE CONTESTAR (25/08/2026, al integrar los tres frentes) ═══
//
// Las pantallas 29 y 30 dibujan más de lo que las nueve migraciones sostienen. No se rellena nada:
// cada hueco vuelve como `null`/vacío CON SU MOTIVO, y `cargarPortal` los junta en `avisos` para
// que la pantalla los escriba. La lista completa está en el informe de integración.
//
//   · LA OBRA (avance, plan, hitos, fotos, dotación). `obra_canonica` NO tiene policy para el rol
//     `cliente`: una consulta del portal devuelve CERO filas, no un error. Y no se agrega acá —
//     decidir qué ve un tercero del avance y del desvío de su obra es del dueño, no de una
//     integración. Sin eso no hay hitos ni fotos, que además no tienen tabla.
//   · LOS DOCUMENTOS. `obra_documento` tampoco tiene policy para `cliente`, y ninguna columna dice
//     si un documento es COMPARTIBLE: todo lo que hay ahí se cargó bajo el supuesto de que lo ve
//     sólo Administración. Publicarlo entero es Nivel E.
//   · EL CBU y LOS CONTACTOS de la empresa: no hay de dónde leerlos con la sesión del cliente.
//
// LO QUE SÍ ESTÁ Y ES REAL: los certificados con su detalle de rubros, el esquema de pagos
// publicado, las consultas, y el contrato armado con esos mismos certificados.

import { createClient } from '@/lib/supabase/server'
import { enmascararMonto } from '../reglas/permisos'
import type { ServiceResult } from '@/features/auth/services/authService'
import type {
  CertificadoPortal, ConsultaPortal, ContratoPortal, DocumentoPortal, MiObra, PermisosPortal,
  QuienMira, RubroCertificado,
} from '../types'

/** La migración que trae el portal a la base. Su nombre se escribe en la pantalla cuando falta. */
export const MIGRACION_PORTAL = '20260825T1200_el_cliente_es_un_rol'

/** Lo que la pantalla escribe cuando la base todavía no tiene la capacidad. */
const noDisponible = (que: string): string =>
  `Todavía no puedo mostrar ${que}: falta aplicar en la base la migración ${MIGRACION_PORTAL} `
  + 'y las ocho que la siguen. No es que no haya nada — es que esta base no tiene la capacidad todavía.'

const monto = enmascararMonto

/**
 * QUIÉN ESTÁ MIRANDO. Es lo primero que hay que resolver: todo lo demás depende.
 *
 * Devuelve `null` sin error cuando quien consulta no es un cliente del portal (un empleado, por
 * ejemplo). No es un fallo — es la respuesta correcta a «¿qué cliente sos?» cuando no sos ninguno.
 */
export async function getQuienMira(): Promise<ServiceResult<QuienMira | null>> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { data: null, error: 'No hay sesión' }

  const { data, error } = await supabase
    .from('cliente_acceso')
    .select('id, cliente_id, email, persona_contacto, puede_ver_obra, puede_ver_montos,'
      + ' puede_aprobar, obras, revocado_at, clientes:cliente_id (nombre_comercial)')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  if (error) return { data: null, error: noDisponible('su acceso') }
  if (!data || (data as unknown as Record<string, unknown>).revocado_at) return { data: null, error: null }

  const fila = data as unknown as Record<string, unknown>
  const cliente = fila.clientes as { nombre_comercial: string } | null
  return {
    data: {
      acceso_id: String(fila.id),
      cliente_id: String(fila.cliente_id),
      cliente_nombre: cliente?.nombre_comercial ?? '',
      persona_contacto: fila.persona_contacto == null ? null : String(fila.persona_contacto),
      email: String(fila.email),
      permisos: {
        puede_ver_obra: Boolean(fila.puede_ver_obra),
        puede_ver_montos: Boolean(fila.puede_ver_montos),
        puede_aprobar: Boolean(fila.puede_aprobar),
        obras: (fila.obras as string[] | null) ?? null,
      },
    },
    error: null,
  }
}

/**
 * LOS CERTIFICADOS DEL CLIENTE (pantalla 29, «Certificados y pagos»).
 *
 * El RLS ya limitó las filas al cliente y a sus obras. Acá sólo se enmascaran los importes.
 *
 * `obraId` filtra en memoria y no en la consulta: la lista de un cliente son decenas de filas, no
 * miles, y filtrar en la base obligaría a repetir la consulta al cambiar de obra en el selector.
 */
export async function getMisCertificados(obraId?: string): Promise<ServiceResult<CertificadoPortal[]>> {
  const quien = await getQuienMira()
  if (quien.error) return { data: null, error: quien.error }
  if (!quien.data) return { data: [], error: null }
  const permisos = quien.data.permisos

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('certificado_cliente')
    .select('id, numero, factura, obra_id, periodo_desde, periodo_hasta, avance_periodo, monto,'
      + ' reparo, emitido_at, vence, estado, observacion, detalle_rubros')
    .order('emitido_at', { ascending: false, nullsFirst: false })

  if (error) return { data: null, error: noDisponible('sus certificados y facturas') }

  const filas = (data ?? []) as unknown as Record<string, unknown>[]
  const certificados = filas.map((c): CertificadoPortal => ({
    id: String(c.id),
    obra_id: c.obra_id == null ? '' : String(c.obra_id),
    // El nombre de la obra no viaja: `obra_canonica` no es legible para el rol `cliente`. La
    // pantalla lo trata como ausente en vez de escribir el id, que no le dice nada a nadie.
    obra_nombre: '',
    numero: String(c.numero ?? ''),
    factura: c.factura == null ? null : String(c.factura),
    periodo_desde: c.periodo_desde == null ? null : String(c.periodo_desde),
    periodo_hasta: c.periodo_hasta == null ? null : String(c.periodo_hasta),
    avance_periodo_pct: c.avance_periodo == null ? null : Number(c.avance_periodo),
    monto: monto(c.monto, permisos.puede_ver_montos) ?? 0,
    reparo: monto(c.reparo, permisos.puede_ver_montos),
    emitido_at: c.emitido_at == null ? null : String(c.emitido_at),
    vence: c.vence == null ? null : String(c.vence),
    // La columna Q guarda la fecha esperada y se pisa con la real al cobrarse: para un certificado
    // cobrado, `vence` ES el día del cobro. Ver `features/clientes/types/cobranzas.ts`.
    cobrado_at: c.estado === 'cobrado' && c.vence != null ? String(c.vence) : null,
    estado: c.estado as CertificadoPortal['estado'],
    observacion: c.observacion == null ? null : String(c.observacion),
    // El detalle de rubros lleva importes adentro: si no puede ver montos, no viaja.
    rubros: permisos.puede_ver_montos ? rubrosDe(c.detalle_rubros) : [],
    // El certificado guarda el NÚMERO de la factura, no su archivo: no hay PDF que ofrecer.
    pdf_url: null,
  }))

  return {
    data: obraId ? certificados.filter((c) => c.obra_id === obraId) : certificados,
    error: null,
  }
}

/**
 * El `detalle_rubros` es `jsonb` sin esquema fijo — su forma la define el certificado real de cada
 * obra. Se lee defensivamente: lo que no tiene la forma esperada NO se dibuja, en vez de romper la
 * pantalla del cliente o publicar una fila con campos vacíos que parecen ceros.
 */
function rubrosDe(v: unknown): RubroCertificado[] {
  if (!Array.isArray(v)) return []
  const num = (x: unknown): number | null => (x == null || x === '' ? null : Number(x))
  return v
    .filter((r): r is Record<string, unknown> => typeof r === 'object' && r !== null)
    .filter((r) => typeof r.rubro === 'string' && r.rubro !== '')
    .map((r) => ({
      rubro: String(r.rubro),
      contratado: num(r.contratado),
      avance_acum_pct: num(r.avance_acum_pct),
      este_certificado: num(r.este_certificado),
      falta: num(r.falta),
    }))
}

/**
 * LO QUE EL CLIENTE VE DE SU OBRA (pantalla 29, bloque «Mi obra»).
 *
 * ═══ HOY DEVUELVE LA IDENTIDAD Y EL CONTRATO, NO LA OBRA ═══
 *
 * `obra_canonica` no tiene policy para el rol `cliente`: el avance, el plan, la dotación y las
 * fechas devuelven CERO FILAS para esta sesión, y hitos y fotos no tienen tabla. Se devuelve
 * `obra: null` con el motivo escrito en vez de un objeto con nueve `null` adentro, que la pantalla
 * no podría distinguir de una obra que recién arranca.
 *
 * El CONTRATO sí se arma, y con la misma fuente que ya lee esta pantalla: los certificados. Cobrado,
 * certificado sin cobrar y fondo de reparo salen de ahí, así que la barra no puede discrepar con la
 * tabla de abajo. `monto` queda `null` —lo contratado sale de `obra_panel`, que tampoco es legible
 * para el cliente— y con `monto` en `null` la barra directamente no se dibuja.
 */
export async function getMiObra(obraId?: string): Promise<ServiceResult<MiObra | null>> {
  const quien = await getQuienMira()
  if (quien.error) return { data: null, error: quien.error }
  if (!quien.data) return { data: null, error: null }

  const certificados = await getMisCertificados(obraId)
  if (certificados.error) return { data: null, error: certificados.error }

  return {
    data: {
      acceso: quien.data,
      // El selector necesita el NOMBRE de cada obra y no hay de dónde leerlo: sin obras, el header
      // dibuja el nombre del cliente y no ofrece cambiar de obra. Es lo correcto hasta que exista
      // la policy — un selector con ids crudos es peor que no tener selector.
      obras: [],
      obra: null,
      cobro: { cbu: null },
      contactos: [],
    },
    error: null,
  }
}

/**
 * POR QUÉ `MiObra.obra` VIENE EN NULL AUNQUE EL ACCESO PUEDA VER LA OBRA.
 *
 * `ServiceResult` es «o el dato o el motivo», nunca los dos, y acá el dato SÍ está —la identidad y
 * el contrato— mientras que una parte falta. El motivo viaja por separado y lo junta `cargarPortal`
 * con los demás avisos. Es una función y no un texto suelto para que la pantalla no tenga que
 * acordarse de cuándo corresponde escribirlo.
 */
export function motivoSinObra(mi: MiObra | null): string | null {
  if (!mi || mi.obra != null) return null
  if (!mi.acceso.permisos.puede_ver_obra) return null      // no es un hueco: es su permiso
  return 'Todavía no puedo mostrar el avance, los hitos ni las fotos de su obra: '
    + 'falta habilitar esa lectura para el portal.'
}

/**
 * EL CONTRATO ARMADO CON LOS CERTIFICADOS que la pantalla ya tiene.
 *
 * Se calcula acá y no en la base porque los insumos son exactamente las filas que se dibujan abajo:
 * si saliera de otra consulta, la barra podría no cerrar contra la tabla. `reglas/contrato.ts`
 * reparte los cuatro tramos; esta función sólo suma los insumos.
 */
export function contratoDeCertificados(certificados: CertificadoPortal[]): ContratoPortal {
  const suma = (fs: CertificadoPortal[]) => fs.reduce((s, c) => s + (c.monto ?? 0), 0)
  return {
    // Sin `obra_panel` no hay contratado que leer para esta sesión: la barra no se dibuja.
    monto: null,
    retencion_pct: null,
    cobrado: suma(certificados.filter((c) => c.estado === 'cobrado')),
    certificado_sin_cobrar: suma(certificados.filter((c) => c.estado !== 'cobrado')),
    fondo_reparo: certificados
      .filter((c) => c.estado !== 'cobrado')
      .reduce((s, c) => s + (c.reparo ?? 0), 0),
  }
}

/**
 * LOS DOCUMENTOS DE LA OBRA (pantalla 29, «Documentos»).
 *
 * LÍMITE DECLARADO: devuelve vacío CON MOTIVO. `obra_documento` no tiene policy para el rol
 * `cliente` y ninguna de sus columnas dice si un documento es COMPARTIBLE: todo lo que hay ahí se
 * cargó bajo el supuesto de que sólo lo ve Administración —contratos, notas internas, documentación
 * fiscal—. Publicarlo entero al portal es una decisión de Nivel E que no toma un service.
 *
 * El vacío viaja con su razón y no como una lista vacía a secas: «no hay documentos» y «no puedo
 * mostrarte los documentos» son dos frases distintas, y la primera es falsa.
 */
export async function getMisDocumentos(obraId?: string): Promise<ServiceResult<DocumentoPortal[]>> {
  void obraId
  // `data: null` con motivo, y NO `data: []`: la lista vacía se lee «Echegaray no le compartió
  // ningún documento», que es una afirmación sobre la relación comercial. `cargarPortal` la
  // convierte en `[]` para dibujar y escribe el motivo arriba.
  return {
    data: null,
    error: 'Todavía no puedo mostrar los documentos de su obra: falta decidir cuáles se publican al portal.',
  }
}

/**
 * LAS CONSULTAS DEL CLIENTE Y SU RESPUESTA.
 *
 * NO ESTABA EN LA LISTA DEL CONTRATO y existe igual: el `29` dibuja el bloque «Consultas» con sus
 * hilos y su estado, y el contrato sólo nombraba `crearConsulta(...)`. Un alta sin lectura deja al
 * cliente escribiendo a un buzón que no puede volver a abrir.
 */
export async function getMisConsultas(): Promise<ServiceResult<ConsultaPortal[]>> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('consulta_portal')
    .select('id, titulo, respuesta, estado, at')
    .order('at', { ascending: false })

  if (error) return { data: null, error: noDisponible('sus consultas') }

  return {
    data: (data ?? []).map((c): ConsultaPortal => ({
      id: String(c.id),
      titulo: String(c.titulo ?? ''),
      respuesta: c.respuesta == null ? null : String(c.respuesta),
      estado: c.estado as ConsultaPortal['estado'],
      at: String(c.at),
    })),
    error: null,
  }
}

/** Los permisos de quien mira, para las reglas que sólo necesitan eso. */
export async function getPermisos(): Promise<ServiceResult<PermisosPortal | null>> {
  const quien = await getQuienMira()
  if (quien.error) return { data: null, error: quien.error }
  return { data: quien.data?.permisos ?? null, error: null }
}
