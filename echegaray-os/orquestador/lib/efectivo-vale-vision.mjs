// LA FOTO DEL VALE — «$25.000 · Rubén Sosa · galpón 8», escrito a mano y firmado.
//
// ═══ EL PEDIDO, TEXTUAL (22/09/2026) ═══
//
// *«tb registro mediante multimedia, la tecnologia tiene q estar el servicio»*. Administración saca la foto
// del vale que firmó quien recibió la plata y la manda al canal: el OS registra la entrega y guarda esa
// misma foto como la conformidad en papel.
//
// ═══ LO QUE EL PAPEL PUEDE DECIR, Y LO QUE NO ═══
//
// El vale dice cuánto, a quién y —a veces— para qué. NO dice el id de la persona ni el de la obra: eso lo
// resuelve el padrón, con las mismas reglas del texto escrito (`efectivo-entrega-texto.mjs`). El modelo
// EXTRAE, no interpreta: si no está seguro de un número, devuelve null y el bot pregunta. Un vale mal
// leído es plata mal imputada, y eso se descubre cuando falta.
//
// Un papel que no es un vale —una factura, un remito— se declara como tal y el circuito de comprobantes lo
// atiende como siempre. Esa es la diferencia que evita cargar una factura como entrega de efectivo.
import { bloqueAdjunto, MODELO_LECTURA, unaLectura } from './comprobantes/vision.mjs'

export const PROMPT_VALE = [
  'Mirá la foto. Es un VALE DE ENTREGA DE EFECTIVO escrito a mano: la constancia de que una empresa le',
  'entregó plata en efectivo a una persona para gastos de obra.',
  '',
  'Devolvé SÓLO un JSON, sin texto alrededor:',
  '{"es_vale": true|false, "monto": number|null, "persona": string|null, "para_que": string|null,',
  ' "fecha": "AAAA-MM-DD"|null, "firmado": true|false, "nota": string|null}',
  '',
  'REGLAS:',
  '- "es_vale": false si es una factura, un remito, un ticket de compra o cualquier comprobante de un',
  '  proveedor. Un vale lo escribe la empresa a una persona; una factura la emite un proveedor y tiene',
  '  CUIT, punto de venta y número.',
  '- "monto": el importe entregado, en números. Los puntos separan miles y la coma los centavos',
  '  (1.250.000,50 son un millón doscientos cincuenta mil). Si hay más de un importe y no se sabe cuál es',
  '  el entregado, devolvé null.',
  '- "persona": el nombre de quien RECIBE, tal como está escrito. No lo completes ni lo corrijas.',
  '- "para_que": para qué es la plata, si lo dice (una obra, «gasoil», «materiales»). Si no lo dice, null.',
  '- "fecha": la del vale. Si no la dice, null.',
  '- "firmado": true sólo si hay una firma o aclaración de quien recibió.',
  '- Un dato que no se lee con certeza va en null. NUNCA inventes un número ni un nombre.',
].join('\n')

/** Saca el JSON de la respuesta del modelo, venga pelado o dentro de un bloque. */
export function leerJson(texto) {
  const s = String(texto ?? '')
  const m = s.match(/\{[\s\S]*\}/)
  if (!m) return null
  try { return JSON.parse(m[0]) } catch { return null }
}

/** Normaliza lo que dijo el modelo. Todo lo dudoso queda en null: el bot pregunta, no completa. */
export function normalizarVale(crudo = {}) {
  const num = (v) => {
    if (typeof v === 'number' && Number.isFinite(v) && v > 0) return Math.round(v * 100) / 100
    if (typeof v !== 'string') return null
    const n = Number(v.replace(/[^\d.,-]/g, '').replace(/\./g, '').replace(',', '.'))
    return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null
  }
  const txt = (v, max) => {
    const t = String(v ?? '').trim()
    return t && t.length <= max ? t : null
  }
  return {
    esVale: crudo.es_vale === true,
    monto: num(crudo.monto),
    persona: txt(crudo.persona, 120),
    paraQue: txt(crudo.para_que, 200),
    fecha: /^\d{4}-\d{2}-\d{2}$/.test(String(crudo.fecha ?? '')) ? String(crudo.fecha) : null,
    firmado: crudo.firmado === true,
    nota: txt(crudo.nota, 300),
  }
}

/**
 * Lee la foto del vale. Nunca lanza: devuelve `{ ok: false, error }` y el que llama decide.
 *
 * @param {{data:string, mediaType:string}} adjunto  ya bajado y en base64 (`bajarAdjunto`)
 */
export async function leerVale(adjunto, ctx = {}) {
  const bloque = bloqueAdjunto(adjunto)
  if (!bloque) return { ok: false, error: 'no puedo mirar ese archivo' }
  const r = await unaLectura(bloque, {
    apiKey: ctx.apiKey ?? process.env.ANTHROPIC_API_KEY,
    fetchImpl: ctx.fetchImpl ?? globalThis.fetch,
    modelo: ctx.modelo ?? MODELO_LECTURA,
    maxTokens: ctx.maxTokens ?? 1200,
    prompt: PROMPT_VALE,
  })
  // `unaLectura` devuelve `{ok:true, crudo}` o `{ok:false, error}` — y `{error}` pelado cuando corta el fusible.
  if (!r?.ok) return { ok: false, error: String(r?.error ?? 'no pude leer el vale').slice(0, 160) }
  return { ok: true, vale: normalizarVale(r.crudo ?? {}) }
}
