// DOBLES PARA LOS TESTS DE ESTE MÓDULO. No se usa en producción.
//
// REGLA DE ORO QUE MANDA ACÁ: nunca se corre el pipeline real ni se toca la planilla
// productiva para validar. El doble está en la FRONTERA DE E/S —el cliente de Google— y no
// en la lógica: el núcleo de JORNALES, el catálogo de motivos y el repositorio de sesiones
// que entran acá son los REALES. Doblar el núcleo habría dejado probada una simulación del
// núcleo, que es exactamente lo que no sirve.
//
// El fixture (`lib/jornales-fixture.mjs`) reproduce las rarezas del archivo verdadero:
// bloques de ancho distinto, fechas como serial, celdas con fórmula de horas extra, texto
// libre en una columna diaria, una obra ya cargada el día operativo, homónimos en filas
// distintas y nombres con espacio final.

import { CATALOGO, motivosPara, validarNovedad } from '../../lib/asistencia-motivos.mjs'
import { FECHA_HOY, fakeGoogleJornales } from '../../lib/jornales-fixture.mjs'
import {
  listarObrasPorFecha, listarPersonalPorObraYFecha, planificarAsistencia, registrarAsistencia,
} from '../../lib/tools/jornales-asistencia.mjs'
import { SesionesMemoria } from '../asistencia-sesion.mjs'
import { crearRuteadorAcciones } from './acciones.mjs'

export { FECHA_HOY }

/** Claves de obra del fixture, tal como las normaliza el parser estructural. */
export const OBRA = Object.freeze({
  REVOQUE: 'JAVIER SANCHEZ|REVOQUE', // 3 personas, el 30/07 sin cargar
  ESTRELLA: 'LA ESTRELLA|OFICINAS Y FABRICA', // 2 personas
  MESSINAS: 'MESSINAS|BASES DE TANQUE', // 1 persona, el 30/07 YA cargado con 9
  INEXISTENTE: 'OBRA QUE NO EXISTE|NADA',
})

export const USUARIO = Object.freeze({ id: 'mm-user-1', nombre: 'jefe.obra' })

/** El núcleo REAL. Lo único falso es el cliente de Google que hay debajo. */
export const nucleoReal = Object.freeze({
  listarObrasPorFecha, listarPersonalPorObraYFecha, planificarAsistencia, registrarAsistencia,
})

/** El catálogo REAL de motivos. */
export const motivosReales = Object.freeze({ CATALOGO, motivosPara, validarNovedad })

/** Permisos: por defecto concede; `permisosDoble(false)` deniega como el modo estricto. */
export function permisosDoble(concede = true) {
  return {
    tienePermiso: async () => (concede
      ? { ok: true, modo: 'abierto' }
      : { ok: false, motivo: 'sin_permiso', modo: 'estricto' }),
  }
}

/** Jornada por configuración. Por defecto: sin configuración (manda la calibración). */
export function jornadaConfigDoble(respuesta = { horas: null, origen: 'sin_config' }) {
  return async () => respuesta
}

/** Cliente de Mattermost: registra lo que se le pidió, no habla con nadie.
 *  `posts` son las ACTUALIZACIONES y `creados` los posts nuevos: son dos operaciones
 *  distintas y mezclarlas en una lista haría pasar una por la otra. */
export function mattermostDoble({ abre = true, actualiza = true, crea = true } = {}) {
  const dialogos = []
  const posts = []
  const creados = []
  return {
    dialogos,
    posts,
    creados,
    async abrirDialogo(d) { dialogos.push(d); return { ok: abre } },
    // EXIGE `channel_id` y un `message` string, igual que el cliente real: sin canal
    // Mattermost devuelve 400, y `message` es el texto de respaldo que ven las
    // notificaciones y los clientes que no dibujan attachments.
    async crearPost(p) {
      if (!crea) {
        const e = new Error('fallo simulado al crear el post')
        e.status = 403
        throw e
      }
      if (!p?.channel_id) throw new Error('crearPost: falta `channel_id` (así se llama en el cliente real)')
      if (typeof p.message !== 'string') throw new Error('crearPost: `message` tiene que ser un string')
      const post = { id: `post-nuevo-${creados.length + 1}`, ...p, props: p.props ?? {} }
      creados.push(post)
      return post
    },
    // EXIGE `id`, igual que el cliente real. Este doble aceptaba cualquier forma, y por eso
    // nadie vio que el ruteador mandaba `postId`: en producción salía `PUT /posts/undefined`.
    // Un doble más permisivo que el original no prueba la frontera: la tapa.
    async actualizarPost(p) {
      if (!p?.id) throw new Error('actualizarPost: falta `id` (así se llama en el cliente real)')
      posts.push(p)
      return { ok: actualiza }
    },
  }
}

/** Auditor que no toca la base: guarda los eventos para poder afirmar sobre ellos. */
export function auditorDoble() {
  const eventos = []
  const auditar = async (evento, datos) => { eventos.push({ evento, datos }); return { ok: true } }
  auditar.eventos = eventos
  return auditar
}

/** Cliente de Google que revienta con un mensaje cargado de secretos y rutas. */
export function googleQueFalla() {
  const boom = () => {
    throw new Error('Bearer sk-SECRETO-123 falló en /home/jorge/echegaray-os/app/orquestador/lib/google.mjs:42')
  }
  return { listTabs: boom, readSheetGrid: boom, batchUpdateValues: boom }
}

/**
 * Arma el ruteador con todo inyectado y una sesión ya abierta para el usuario de prueba.
 * Devuelve helpers para simular exactamente lo que manda Mattermost.
 */
export async function crearEntorno({
  google = fakeGoogleJornales(), permisos = permisosDoble(), jornadaConfig = jornadaConfigDoble(),
  mattermost = mattermostDoble(), hoy = () => FECHA_HOY, abrirSesion = true, log = null,
} = {}) {
  const sesiones = new SesionesMemoria()
  const auditar = auditorDoble()
  const rutear = crearRuteadorAcciones({
    google, nucleo: nucleoReal, sesiones, permisos, motivos: motivosReales, mattermost,
    jornadaConfig, auditar, hoy, url: 'https://chat.example/asistencia/accion', log,
  })
  let sesion = null
  if (abrirSesion) {
    sesion = await sesiones.abrir({
      plataformaUserId: USUARIO.id, plataformaUsername: USUARIO.nombre,
      // SIN `rootPostId`, como en producción: el slash command publica por respuesta, así
      // que el OS no conoce el id del post hasta el primer click. El doble lo traía puesto
      // y por eso tapaba el defecto de «Otra fecha…» como primer toque.
      channelId: 'canal-1', rootPostId: null, fechaOperativa: hoy(),
    })
  }
  const base = { user_id: USUARIO.id, user_name: USUARIO.nombre, channel_id: 'canal-1', post_id: 'post-1' }
  return {
    google, sesiones, mattermost, rutear, eventos: auditar.eventos,
    get sesion() { return sesion },
    /** Un click de botón o una elección de desplegable. */
    accion: (context, extra = {}) => rutear({
      payload: { ...base, type: context.selected_option ? 'select' : 'button', trigger_id: 'trig-1', context, ...extra },
    }),
    /** El envío de un diálogo. */
    dialogo: (callbackId, submission, estado = {}, extra = {}) => rutear({
      payload: {
        ...base, type: 'dialog_submission', callback_id: callbackId,
        state: JSON.stringify({ sesion_id: sesion?.id, ...estado }), submission, ...extra,
      },
    }),
  }
}

/** Todos los attachments de una respuesta de acción, sin importar de qué forma vino. */
export function attachmentsDe(respuesta) {
  return respuesta?.body?.update?.props?.attachments ?? []
}

/** Todas las acciones de todos los attachments de una respuesta. */
export function accionesDe(respuesta) {
  return attachmentsDe(respuesta).flatMap((a) => a.actions ?? [])
}

/** El texto entero de una respuesta: attachments, campos y mensaje efímero. */
export function textoDe(respuesta) {
  const att = attachmentsDe(respuesta)
  return [
    respuesta?.body?.ephemeral_text ?? '',
    respuesta?.body?.error ?? '',
    JSON.stringify(respuesta?.body?.errors ?? {}),
    ...att.map((a) => [a.title, a.text, a.fallback, JSON.stringify(a.fields ?? [])].join(' ')),
  ].join('\n')
}
