// ═══ UNA SOLA TABLA DE PRECIOS (26/09/2026) ═══
// Había dos: la del engine (opus-5 a $5/$25, sonnet-5 a $3/$15) y la del fusible, que estimaba
// por familia con opus a $15/$75. Cada lectura de comprobantes con Opus 5 pasa por el fusible
// (vision registra usd = null) y quedaba anotada al TRIPLE: 13.332 in + 1.292 out = $0,297 en el
// libro contra $0,099 reales. Y sonnet-5 figuraba 1,5× más caro de lo que cuesta.
// Fuente: tabla de precios de la API de Anthropic, verificada el 26/09/2026 ($ por millón).
// PURA: sin SDK, la importan el fusible y el engine.
export const PRECIOS = {
  'claude-fable-5-1': { in: 10, out: 50 },
  'claude-fable-5': { in: 10, out: 50 },
  'claude-opus-5-5': { in: 4, out: 20 },
  'claude-opus-5': { in: 5, out: 25 },
  'claude-opus-4-8': { in: 5, out: 25 },
  'claude-opus-4-7': { in: 5, out: 25 },
  'claude-opus-4-6': { in: 5, out: 25 },
  'claude-opus-4-5': { in: 5, out: 25 },
  'claude-sonnet-5': { in: 2, out: 10 },
  'claude-sonnet-4-6': { in: 3, out: 15 },
  'claude-sonnet-4-5': { in: 3, out: 15 },
  'claude-haiku-4-5': { in: 1, out: 5 },
}

// Para un ID que la tabla todavía no conoce: el precio más alto vigente de su familia, así el
// error queda del lado de sobrestimar poco y nunca del de no contar.
const FAMILIA = [
  [/fable|mythos/i, { in: 10, out: 50 }],
  [/opus/i, { in: 5, out: 25 }],
  [/sonnet/i, { in: 3, out: 15 }],
  [/haiku/i, { in: 1, out: 5 }],
]

/** Precio exacto del ID (con o sin sufijo -AAAAMMDD). `null` si no está. PURA. */
export function precioExacto(modeloId) {
  const id = String(modeloId ?? '')
  return PRECIOS[id] ?? PRECIOS[id.replace(/-\d{8}$/, '')] ?? null
}

/** Precio exacto o, si no está, el de la familia. `null` si no hay ninguno. PURA. */
export function precioDeModelo(modeloId) {
  return precioExacto(modeloId) ?? FAMILIA.find(([re]) => re.test(String(modeloId ?? '')))?.[1] ?? null
}
