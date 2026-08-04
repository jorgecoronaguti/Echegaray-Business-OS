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
import { capacidadesHabilitadas, capacidadesNoDisponibles, renderAyuda } from '../registro.mjs'

export const capacidad = {
  id: CAPACIDAD.AYUDA,
  nombre: 'Ayuda',
  descripcion: 'decirte qué sé hacer y cómo pedírmelo',
  version: '1.0.0',
  orden: 90,
  enAyuda: false, // no se enumera a sí misma: quien pregunta ya la encontró
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
    // El registro llega por contexto cuando quien orquesta usa uno propio (tests, o un
    // registro acotado a un canal). Si no viene, el del OS. Nunca una lista escrita acá.
    const listar = ctx?.registro?.capacidadesHabilitadas ?? capacidadesHabilitadas
    const lista = await listar(ctx)
    // LO QUE NO PUEDE, TAMBIÉN. Listar sólo lo habilitado hacía que alguien sin identidad viera un
    // OS mucho más tonto de lo que es, sin una palabra sobre por qué. La ayuda mostraba el
    // síntoma de un defecto del OS como si fuera el alcance del producto.
    const faltantes = ctx?.registro?.capacidadesNoDisponibles ?? capacidadesNoDisponibles
    let noDisponibles = []
    try { noDisponibles = await faltantes(ctx, lista) } catch { noDisponibles = [] }
    const texto = renderAyuda(lista, { noDisponibles })
    // La evidencia es la lista real que se ofreció: permite auditar después qué vio esa
    // persona, que es lo único que hace verificable una respuesta de ayuda.
    return resultadoOk(CAPACIDAD.AYUDA, texto, {
      capacidades: lista.map((c) => c.id),
      noDisponibles: noDisponibles.map((n) => ({ id: n.capacidad.id, motivo: n.motivo.codigo })),
    })
  },
}
