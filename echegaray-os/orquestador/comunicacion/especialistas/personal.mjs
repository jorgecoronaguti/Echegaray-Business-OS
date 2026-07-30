// PERSONAL IA — el PRIMER especialista operativo del OS en Mattermost.
//
// Área `personas` (public.area_canonica), agente `rrhh` (orq.agents). Capacidad de hoy:
// registrar y consultar la asistencia de obreros en el Sheet JORNALES.
//
// Lo que este archivo hace es DECLARARSE: su gramática (`reconoce`) y su ejecución
// (`atender`) viajan con él. La capa de comunicación no sabe qué es "3 ausente" ni tiene
// que saberlo — y por eso agregar Compras mañana no la toca.
//
// La ejecución sigue siendo DETERMINÍSTICA: qué fila, qué columna y qué número se escriben
// lo decide código sobre la planilla leída, no un modelo. El Director decide QUIÉN atiende;
// el especialista decide QUÉ hace. Un modelo eligiendo celdas sería más caro y peor.

import { manejarAsistencia, consultarAsistencia } from '../asistencia-flujo.mjs'
import { clasificar } from '../asistencia-ui.mjs'
import { parsearConsulta } from '../../lib/asistencia-consultas.mjs'
import { fechaOperativaSanJuan } from '../../lib/fecha-operativa.mjs'
import { emitirEnlace, armarUrl } from '../enlace-firmado.mjs'
import { textoInvitacion } from '../comando-asistencia.mjs'

/** Pedido explícito de cargar por chat en vez de abrir la pantalla. Existe porque el
 *  jefe que está sin señal para el navegador igual tiene que poder cargar. */
const RE_POR_CHAT = /\bpor\s+(chat|mensaje|acá|aca|aquí|aqui)\b/i

/**
 * Invitación a la pantalla: el camino principal desde el 31/07/2026. Devuelve null si el
 * enlace no está configurado — y ahí el flujo conversacional sigue siendo el que atiende,
 * que es lo que hace que esto no pueda dejar a nadie sin poder cargar.
 */
function invitarAPantalla({ actor, ahora = Date.now } = {}) {
  const secreto = process.env.ASISTENCIA_ENLACE_SECRETO
  const urlBase = process.env.ASISTENCIA_URL_BASE
  const userId = actor?.plataforma_user_id
  if (!secreto || !urlBase || !userId) return null
  try {
    const { token, expira } = emitirEnlace({
      secreto,
      userId,
      username: actor?.plataforma_username ?? null,
      ttlSegundos: Number(process.env.ASISTENCIA_ENLACE_TTL) || undefined,
      ahora,
    })
    return textoInvitacion(armarUrl({ urlBase, token }), expira, ahora())
  } catch {
    // Un enlace mal configurado NO puede dejar sin cargar: se cae al flujo por chat.
    return null
  }
}

export const especialista = {
  slug: 'personal',
  agentSlug: 'rrhh',
  area: 'personas',
  titulo: 'Personal IA',
  descripcion: 'Asistencia diaria de obreros, jornales, horas trabajadas y horas extra sobre la planilla JORNALES. Registra, corrige y responde consultas por fecha, obra, trabajador o período.',
  ejemplos: ['registrar asistencia', 'quién trabajó ayer', 'horas extra del 17/01'],
  operativo: true,

  /**
   * Gramática PROPIA. Devuelve la intención ya parseada para no volver a parsear después.
   * `isoContexto` no es opcional: sin él una fecha sin año cae en el año 2000.
   */
  reconoce(texto) {
    const r = clasificar(texto, { parsearConsulta, isoContexto: fechaOperativaSanJuan() })
    return r?.destino ? r : null
  },

  /**
   * Ejecuta. `intencion` es lo que devolvió `reconoce`; si viene null (llegó por área de
   * canal o por razonamiento) se resuelve acá, que es donde vive el conocimiento.
   */
  async atender({ texto, intencion, port, google, actor, correlationId, invitar = invitarAPantalla }) {
    const ruta = intencion ?? this.reconoce(texto)
    const comun = { port, google, actor, texto, correlationId }

    // ARRANCAR UNA CARGA = abrir la pantalla. La conversación quedó como respaldo: sirve
    // para el celular sin navegador y para cuando la pantalla no está disponible, y se pide
    // con "asistencia por chat". Un paso intermedio del formulario (`obra 1`, `confirmar`)
    // NUNCA cae acá: ya hay una sesión abierta y sigue por donde venía.
    const arranca = ruta?.destino === 'registro' && ruta.intencion?.tipo === 'iniciar'
    if (arranca && !RE_POR_CHAT.test(texto ?? '')) {
      const invitacion = invitar({ actor })
      if (invitacion) return { texto: invitacion, privado: true, estado: 'invitado' }
    }

    // Sin intención reconocible pero en el canal correcto: se ofrece el arranque del flujo.
    if (!ruta) return manejarAsistencia({ ...comun, texto: 'asistencia' })
    return ruta.destino === 'consulta'
      ? consultarAsistencia({ ...comun, consulta: ruta.consulta })
      : manejarAsistencia(comun)
  },

  /** Skill que se declara en la auditoría del Work Fabric. */
  skillDe(intencion) {
    return `personal.${intencion?.destino === 'consulta' ? 'consultar' : 'registrar'}_asistencia`
  },
}
