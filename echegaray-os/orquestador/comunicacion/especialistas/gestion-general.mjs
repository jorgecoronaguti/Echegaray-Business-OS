// GESTIÓN GENERAL — el especialista del estado del propio OS.
//
// Existe para que el handler no tenga NINGÚN caso especial: "estado del sistema" era un
// `if` suelto en la capa de comunicación y ahora es un especialista más, con su área
// (`gestion_general`) y su gramática propia. Mismo contrato que cualquier otro.

import { estadoSistema } from '../estado-sistema.mjs'
import { limpiar } from '../../lib/fecha-operativa.mjs'

const RE_ESTADO = /^(estado( del sistema| del os)?|status|como (viene|va) el sistema)$/

export const especialista = {
  slug: 'sistema',
  agentSlug: 'director-planner',
  area: 'gestion_general',
  titulo: 'Gestión General',
  descripcion: 'Estado del propio Business OS: cola de trabajo, tareas, salud del orquestador.',
  ejemplos: ['estado del sistema'],
  operativo: true,

  reconoce(texto) {
    const t = limpiar(texto)
    return RE_ESTADO.test(t) ? { destino: 'estado' } : null
  },

  async atender({ port }) {
    const e = await estadoSistema({ query: port.query })
    return { texto: e.texto, estado: 'estado_sistema', privado: false, datos: e.datos }
  },

  skillDe() { return 'gestion_general.estado_sistema' },
}
