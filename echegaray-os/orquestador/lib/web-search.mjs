// Búsqueda en internet para el OS, vía la web search NATIVA de Anthropic (sin API key
// extra ni proveedor aparte). Autocontenida: hace una llamada propia con el tool
// server-side `web_search` y devuelve el texto + las fuentes. La usa la tool `web_search`
// del registry, así el loop agéntico principal la ve como una tool normal.
//
// Costo: cada búsqueda tiene un cargo (Anthropic) + tokens. Por eso `max_uses` acotado y
// modelo barato (haiku) por defecto. Es lectura (Nivel A) — sin efecto externo.
import Anthropic from '@anthropic-ai/sdk'

/** Busca en internet y devuelve un resumen conciso con fuentes. */
export async function webSearch(query, { maxUses = 3, model = 'claude-haiku-4-5-20251001' } = {}) {
  const client = new Anthropic()
  const r = await client.messages.create({
    model,
    max_tokens: 900,
    tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: maxUses }],
    messages: [{
      role: 'user',
      content: `Buscá en internet y respondé CONCISO, con los datos concretos y la FUENTE (nombre + fecha si la hay). Si son precios, dá el valor con su unidad y aclarar que es una referencia a verificar. Consulta: ${query}`,
    }],
  })
  const text = (r.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim()
  const searches = (r.content || []).filter((b) => b.type === 'server_tool_use').length
  return { text: text || 'sin resultados', searches }
}
