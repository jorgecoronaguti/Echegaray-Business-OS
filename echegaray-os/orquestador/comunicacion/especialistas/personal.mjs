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
  async atender({ texto, intencion, port, google, actor, correlationId }) {
    const ruta = intencion ?? this.reconoce(texto)
    const comun = { port, google, actor, texto, correlationId }
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
