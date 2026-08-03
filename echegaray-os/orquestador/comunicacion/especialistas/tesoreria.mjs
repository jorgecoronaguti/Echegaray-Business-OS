// TESORERO INVERSOR IA — el especialista que mira la caja y el mercado, a pedido.
//
// ═══ POR QUÉ HACÍA FALTA ESTE ARCHIVO ═══
//
// El motor ya existía y andaba: leía el Flujo de Fondos, calculaba el excedente, entraba a Balanz y
// recomendaba. Pero el bot no sabía que existía. Preguntarle "qué sabés hacer" devolvía el catálogo
// del registro —Personal, Gestión General, el asistente— y el Tesorero no estaba, porque la lista no
// se escribe a mano en ningún lado: **se arma desde este directorio**.
//
// Una capacidad que el dueño no puede descubrir preguntando es, en la práctica, una capacidad que no
// tiene. Y peor: el ruteo tampoco la alcanzaba, así que un "fijate qué hay disponible en Balanz" caía
// en "no supe a quién derivarlo" con el agente entero construido y andando del otro lado.
//
// ═══ LO QUE NO HACE ═══
//
// No opera. No compra, no vende, no suscribe, no rescata y no caucióna — no existe la herramienta con
// la que podría hacerlo. Toda colocación es Nivel E y la firma una persona.

import { tesoreriaTools } from '../../lib/tools/tesoreria-tool.mjs'
import { limpiar } from '../../lib/fecha-operativa.mjs'

/**
 * GRAMÁTICA PROPIA — por RAÍCES, no por palabras enteras.
 *
 * El dueño escribe en voseo y con las formas de acá: "fijate", "analizá", "conviene", "me sobra".
 * Una lista de infinitivos ("analizar", "invertir") no engancha ni una sola de esas. Es el mismo
 * error que este repo ya pagó en el ruteo del chat y en la barrera de Balanz.
 */
const RE_MERCADO = /\b(balanz|broker|bróker|inversion|inversión|invert|plazo\s*fijo|money\s*market|caucion|caución|fci|lecap|bono|letra)/i
// "me sobra" NO alcanzaba: el dueño escribe "la plata que sobra", y esa forma no engancha con
// ninguna de las anteriores. Una gramática que falla en la frase más natural del dominio es una
// gramática que no se va a usar.
const RE_EXCEDENTE = /\b(exceden|plata\s+(parada|quieta|sin\s+usar)|(me|que|qué)\s+sobra|cuanta\s+plata|cuánta\s+plata|liquidez\s+libre|(que|qué)\s+hago\s+con\s+la\s+plata)/i
const RE_ANALIZAR = /\b(analiz|fijate|fíjate|revisa|revisá|mira|mirá|busca|buscá|recomend|conviene)/i
// EL RENDIMIENTO ES SEÑAL DE MERCADO POR SÍ SOLO. "mirá qué rinde más" no nombra Balanz ni la plata
// que sobra, y es exactamente un pedido de tesorería. Queda fuera "tasa", que en una constructora
// aparece en tasas municipales y en la tasa del descubierto: robaría pedidos que no son de acá.
const RE_RENDIMIENTO = /\b(rinde|rendimiento|rendir|rendimientos)\b/i
const RE_FLUJO = /\b(flujo\s+de\s+(fondos|caja)|cash\s*flow)\b/i

/** Un enlace de Google Sheets pegado en el mensaje: el dueño puede pedir OTRO libro. */
const RE_SHEET = /https:\/\/docs\.google\.com\/spreadsheets\/d\/[a-zA-Z0-9-_]+/

export const especialista = {
  slug: 'tesoreria',
  agentSlug: 'tesorero',
  area: 'administracion_finanzas',
  titulo: 'Tesorero Inversor IA',
  descripcion:
    'Cuánta plata sobra de verdad y por cuánto tiempo, a partir del Flujo de Fondos (o del Sheet que le indiques), '
    + 'y qué hay disponible hoy en Balanz para colocarla. Entra al bróker en SOLO LECTURA, compara contra la vara que '
    + 'corresponde y propone. Nunca ejecuta una operación: toda colocación la aprueba una persona.',
  ejemplos: [
    'fijate qué hay disponible en Balanz',
    'cuánta plata me sobra',
    'analizá si conviene invertir',
  ],
  operativo: true,

  // ── DUEÑO DEL CANAL, PERO PRUDENTE ADENTRO ────────────────────────────────────────────────────
  //
  // El primer intento fue `preferidoDeArea: false` —atender sólo por reclamo— y rompió un invariante
  // del registro: un área que TIENE especialistas debe resolver a exactamente uno preferido, o el
  // canal se queda sin dueño y los mensajes que nadie reclama caen al catálogo. Dos tests lo
  // agarraron, y tienen razón: hoy este es el único especialista de Administración y Finanzas.
  //
  // Aceptar el canal trae su propio riesgo, y está resuelto en `atender`: llegar por área NO alcanza
  // para disparar el análisis caro. Un "cuánto le debemos a Cemento SA" escrito en este canal no
  // puede desencadenar ocho minutos de relevamiento del bróker.
  preferidoDeArea: true,

  reconoce(texto) {
    const t = limpiar(texto)
    if (!t) return null
    const sheet = texto?.match?.(RE_SHEET)?.[0] ?? null

    // ANÁLISIS COMPLETO: pide mirar el mercado. Es el caro (entra a Balanz, ~8 minutos), así que se
    // exige una señal explícita de mercado o de análisis sobre el excedente — no se dispara por
    // nombrar la palabra "plata".
    if ((RE_MERCADO.test(t) || RE_RENDIMIENTO.test(t)) && (RE_ANALIZAR.test(t) || RE_EXCEDENTE.test(t) || RE_FLUJO.test(t) || sheet)) {
      return { destino: 'analisis', sheet }
    }
    if (RE_FLUJO.test(t) && RE_ANALIZAR.test(t) && (RE_EXCEDENTE.test(t) || sheet)) {
      return { destino: 'analisis', sheet }
    }
    // SÓLO LA CAJA: barato, sin navegador. "cuánta plata me sobra" no tiene por qué esperar 8 minutos.
    if (RE_EXCEDENTE.test(t)) return { destino: 'excedente', sheet }
    // Nombrar Balanz sin pedir nada es una consulta de mercado igual.
    if (RE_MERCADO.test(t)) return { destino: 'analisis', sheet }
    return null
  },

  async atender({ texto, intencion, google }) {
    const ruta = intencion ?? this.reconoce(texto)

    // LLEGAR POR EL CANAL NO ES PEDIR UN ANÁLISIS. Sin una intención reconocible, se ofrece lo que
    // este especialista sabe hacer en vez de arrancar un relevamiento de ocho minutos que nadie
    // pidió — y que además ocuparía el navegador y el cerrojo.
    if (!ruta) {
      return {
        texto: [
          'Soy el **Tesorero Inversor IA**. Puedo:',
          '',
          '· **cuánta plata te sobra** — sale del Flujo de Fondos, es inmediato',
          '· **qué hay disponible en Balanz** — entra al bróker y compara (tarda unos minutos)',
          '',
          'Podés indicarme otro libro pegando el enlace del Sheet.',
          '_Nunca ejecuto una operación: toda colocación la aprobás vos._',
        ].join('\n'),
        estado: 'ayuda',
        privado: false,
      }
    }

    const tools = tesoreriaTools(google)

    if (ruta?.destino === 'excedente') {
      const r = await tools['tesoreria.excedente_invertible'].run()
      if (r.error) return { texto: r.error, estado: 'error', privado: false }
      return { texto: r.texto, estado: 'excedente', privado: false, datos: { posicion: r.posicion } }
    }

    // EL AVISO DE QUE VA A TARDAR NO ES CORTESÍA. El análisis completo recorre ocho pantallas del
    // bróker y tarda varios minutos; sin decirlo, el silencio se lee como que el bot se colgó.
    const r = await tools['tesoreria.analisis_inversion'].run({ sheet: ruta?.sheet ?? undefined })
    if (r.error) return { texto: r.error, estado: 'error', privado: false }
    return { texto: r.texto, estado: 'analisis_inversion', privado: false, datos: { estado: r.estado } }
  },

  skillDe(intencion) {
    return `tesoreria.${intencion?.destino === 'excedente' ? 'excedente_invertible' : 'analisis_inversion'}`
  },
}
