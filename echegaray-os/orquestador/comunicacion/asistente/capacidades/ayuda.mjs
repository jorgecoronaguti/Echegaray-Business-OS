// AYUDA — "¿qué sabés hacer?" respondido con la verdad, no con un texto escrito a mano.
//
// La respuesta se arma LEYENDO EL REGISTRO en el momento de preguntar, filtrado por lo que
// está habilitado para ESA persona. Por eso no puede prometer una capacidad que no existe,
// ni omitir una que sí: no hay una segunda lista que mantener sincronizada. Si mañana se
// borra `capacidades/drive.mjs`, la ayuda deja de ofrecer Drive sin que nadie edite nada.
//
// Y por eso también nunca menciona lo que "va a venir": una capacidad futura es una promesa,
// y una promesa que falla cuesta más confianza que la funcionalidad que no existe.
//
// Cero API: es la capacidad más barata del asistente y la que más se pide.

import { z } from 'zod'
import { CAPACIDAD, resultadoOk } from '../contratos.mjs'
import { capacidadesHabilitadas, renderAyuda } from '../registro.mjs'

export const capacidad = {
  id: CAPACIDAD.AYUDA,
  nombre: 'Ayuda',
  descripcion: 'decirte qué sé hacer y cómo pedírmelo',
  version: '1.0.0',
  permisos: [],
  ejemplos: ['¿qué sabés hacer?', '¿en qué me podés ayudar?'],
  efectoExterno: false,

  /** Siempre disponible: si el asistente contesta, contesta al menos esto. */
  async habilitada() { return true },

  entrada: z.object({}).passthrough(),

  /**
   * @param {object} _parametros  no lleva ninguno
   * @param {import('../contratos.mjs').ContextoAsistente} ctx
   */
  async ejecutar(_parametros, ctx) {
    const lista = await capacidadesHabilitadas(ctx)
    const texto = renderAyuda(lista)
    // La evidencia es la lista real que se ofreció: permite auditar después qué vio esa
    // persona, que es lo único que hace verificable una respuesta de ayuda.
    return resultadoOk(CAPACIDAD.AYUDA, texto, { capacidades: lista.map((c) => c.id) })
  },
}
