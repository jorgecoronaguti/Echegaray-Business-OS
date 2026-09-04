// QUÉ PASA CUANDO UNA PERSONA CORRIGE UNA IDENTIDAD. NÚCLEO PURO: decide, no escribe.
//
// ═══ POR QUÉ ESTO NO VIVE ADENTRO DE `identidad.mjs` ═══
//
// La corrección humana la disparan DOS caras: la pantalla de Compras (que habla Supabase) y los
// scripts del OS (que hablan Postgres directo). Escrita una vez por cara serían dos definiciones de
// «qué significa confirmar un proveedor» — y la que se olvide de crear el alias haría que la misma
// confirmación se tenga que repetir para siempre, sin que nadie note por qué.
//
// Acá se decide QUÉ hay que escribir. Cada cara lo escribe con su cliente.
//
// ═══ LO QUE UNA CONFIRMACIÓN VALE ═══
//
// Es el dato más caro del sistema y el único que no se puede fabricar: una persona mirando dos
// nombres y diciendo que son el mismo proveedor. Por eso una confirmación hace TRES cosas, no una:
// corrige la fila, crea un alias verificado para que ese texto nunca más haya que resolverlo, y
// deja el par escrito como ground truth para volver a medir los umbrales.

/** Lo que una persona puede decidir sobre una identidad. */
export const DECISION = Object.freeze({
  CONFIRMAR: 'confirmar',        // sí, es este proveedor
  OTRO: 'otro',                  // es otro proveedor, y lo eligió
  SIN_RESOLVER: 'sin_resolver',  // no sé / no es ninguno: que quede pendiente
})

/**
 * @typedef {{id:number, entidad:string, valor_original:string, entidad_id?:string|null}} ResolucionPrevia
 * @typedef {{id:number, estado:'verificado_humano'|'sin_match', entidad_id_correcta:string|null,
 *            corregido_por:string}} EscrituraResolucion
 * @typedef {{entidad:string, entidad_id:string, alias:string, fuente:string, confianza:number,
 *            verificado:boolean, verificado_por:string}} EscrituraAlias
 * @typedef {{ok:false, porQue:string, resolucion?:undefined, alias?:undefined}} CorreccionRechazada
 * @typedef {{ok:true, porQue?:undefined, resolucion:EscrituraResolucion, alias:EscrituraAlias|null}} CorreccionAceptada
 */

/**
 * Las escrituras que corresponden a una decisión humana.
 *
 * @param {ResolucionPrevia} resolucion
 * @param {{decision:string, entidadId?:string|null, por:string}} eleccion
 * @returns {CorreccionRechazada|CorreccionAceptada}
 */
export function escriturasDeCorreccion(resolucion, { decision, entidadId = null, por }) {
  if (!resolucion?.id) return { ok: false, porQue: 'no hay resolución que corregir' }
  if (!por) return { ok: false, porQue: 'una corrección sin autor no es una corrección: no se puede auditar' }

  // «Dejar sin resolver» NO es un no-op. Deja escrito que una persona miró y no pudo decidir, que
  // es información —evita que la misma fila vuelva a la cola como si nadie la hubiera visto— y NO
  // crea alias: no hay nada confirmado que recordar.
  if (decision === DECISION.SIN_RESOLVER) {
    return {
      ok: true,
      resolucion: { id: resolucion.id, estado: 'sin_match', entidad_id_correcta: null, corregido_por: por },
      alias: null,
    }
  }

  const destino = decision === DECISION.CONFIRMAR ? (entidadId ?? resolucion.entidad_id) : entidadId
  if (!destino) {
    return { ok: false, porQue: decision === DECISION.CONFIRMAR
      ? 'no hay proveedor sugerido que confirmar: hay que elegir uno'
      : 'elegir otro proveedor exige decir cuál' }
  }
  const valor = String(resolucion.valor_original ?? '').trim()
  if (!valor) return { ok: false, porQue: 'la resolución no guarda el texto original: no se puede crear el alias' }

  return {
    ok: true,
    resolucion: { id: resolucion.id, estado: 'verificado_humano', entidad_id_correcta: String(destino), corregido_por: por },
    // El alias es lo que hace que la próxima vez no haya que preguntar. `alias_norm` lo calcula
    // quien escribe, con la MISMA `normalizar()` que usa el resolver — si lo calculara acá, este
    // archivo dejaría de ser puro y tendría que arrastrar el motor de embeddings.
    alias: { entidad: resolucion.entidad, entidad_id: String(destino), alias: valor,
             fuente: 'correccion-humana', confianza: 1, verificado: true, verificado_por: por },
  }
}
