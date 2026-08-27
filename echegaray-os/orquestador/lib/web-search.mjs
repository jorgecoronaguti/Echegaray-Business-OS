// BÚSQUEDA EN INTERNET PARA EL OS — por la puerta única, como todo lo demás.
//
// ═══ POR QUÉ CAMBIÓ (26/08/2026) ═══
//
// Este archivo instanciaba `new Anthropic()` del SDK por su cuenta. Consecuencias, todas reales:
//
//   · el modelo estaba HARDCODEADO en la línea 11 — ni capacidad, ni variable, ni tabla;
//   · no registraba una sola fila en `orq.chat_cost`: era gasto invisible, y encima la web search
//     tiene un CARGO POR BÚSQUEDA además de los tokens, así que era el gasto que más se subestima;
//   · no miraba `estado-cerebro`: con el razonador marcado caído seguía llamando igual;
//   · no clasificaba el error ni tenía tope de reintentos;
//   · y pasaba el control de independencia sin ser vista, porque ese control buscaba la URL
//     `api.anthropic.com` y el SDK la lleva adentro. El guardián tenía un agujero del tamaño exacto
//     de esta dependencia.
//
// Ahora pasa por `pedirTexto`. La búsqueda sigue siendo del proveedor —es un tool server-side suyo—
// pero la LLAMADA es del OS: capacidad declarada, costo contado, degradación respetada.
//
// Es lectura (Nivel A): no tiene efecto externo. `maxUses` acotado porque cada búsqueda se paga.
import { CAPACIDAD, pedirTexto } from './ia/cliente.mjs'

/** Busca en internet y devuelve un resumen conciso con fuentes. */
export async function webSearch(query, { maxUses = 3, model = null } = {}) {
  const r = await pedirTexto({
    // SIMPLE: buscar y resumir con la fuente al lado no es razonamiento con consecuencia
    // económica. El costo acá lo domina el cargo por búsqueda, no el tamaño del modelo.
    capacidad: CAPACIDAD.SIMPLE,
    maxTokens: 900,
    herramientas: [{ type: 'web_search_20250305', name: 'web_search', max_uses: maxUses }],
    agente: 'os',
    funcion: 'web-search',
    modelo: model,
    mensajes: [{
      role: 'user',
      content: `Buscá en internet y respondé CONCISO, con los datos concretos y la FUENTE (nombre + fecha si la hay). Si son precios, dá el valor con su unidad y aclarar que es una referencia a verificar. Consulta: ${query}`,
    }],
  })
  return { text: r.texto || 'sin resultados', searches: r.busquedas ?? 0 }
}
