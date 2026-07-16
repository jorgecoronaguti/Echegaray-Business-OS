// Formateo determinístico (0-API) de la respuesta del chat antes de devolverla.
// El modelo a veces antepone un preámbulo de proceso ("Ahora tengo todo lo que necesito.",
// "Tengo todos los datos.", "Perfecto,", "Voy a…") que el dueño odia — y a veces ES toda la
// respuesta. Lo sacamos del arranque. CONSERVADOR: si al sacarlo casi no queda nada,
// devolvemos el original (nunca arriesgamos comerle la respuesta real).
//
// CLAVE es_AR: el punto es separador de miles ($800.000), NO fin de oración. Por eso el corte
// de oración exige punto/dos-puntos SEGUIDO de espacio (o salto de línea), nunca "punto+dígito".

// Narración de proceso: arranca con un verbo de proceso y termina en el primer fin de oración.
const NARRACION_RE = /^\s*(ahora\s+(tengo|s[ií]|voy|armo|filtro|cruzo|reviso|te\s+paso|paso|calculo|busco|leo|ubico|corrijo)|tengo\s+(todo|todos\s+los\s+datos|lo\s+que\s+necesito)|voy\s+a|d[eé]jame|dej[aá]me)\b[^\n]*?([.:]\s+|\n+)/i
// Interjección de relleno al inicio ("Perfecto,", "Listo,", "Dale —"): se saca solo la palabra.
const INTERJECCION_RE = /^\s*(perfecto|listo|dale|ok|okey|bien|entendido|genial|confirmado)\b[,:.\s—-]+/i

export function stripPreamble(text) {
  if (!text) return text
  const original = String(text)
  let t = original
  for (let i = 0; i < 3; i++) {
    let m = t.match(NARRACION_RE)
    if (m) { t = t.slice(m[0].length); continue }
    m = t.match(INTERJECCION_RE)
    if (m) { t = t.slice(m[0].length); continue }
    break
  }
  t = t.trim()
  return t.length >= 40 ? t : original.trim()
}
