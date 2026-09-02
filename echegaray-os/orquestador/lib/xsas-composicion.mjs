// COMPOSICIÓN A.output → B.input — por CONTRATO, nunca por texto ni por modelo.
//
// Cuando un objetivo compuesto ejecuta una capacidad, su resultado estructurado entra al BUS:
// campo por campo, con el nombre que la tool declaró en su salida y la tool de origen. Una
// capacidad posterior cuyo `input_schema` pide un argumento que la frase no trajo lo toma del bus
// SI Y SÓLO SI existe un campo con EXACTAMENTE ese nombre y el tipo declarado. Nada se convierte,
// nada se adivina: nombre distinto = no hay conexión (FALTA_DATO); tipo distinto = INCOMPATIBLE.
//
// PURO: sin red, sin base, sin modelo.

/** ¿El valor satisface el tipo declarado en el input_schema? Sin conversiones. PURA. */
export function compatible(valor, tipoDeclarado) {
  const t = String(tipoDeclarado ?? 'string')
  if (valor === null || valor === undefined) return false
  if (t === 'string') return typeof valor === 'string' && valor.trim() !== ''
  if (t === 'number' || t === 'integer') return typeof valor === 'number' && Number.isFinite(valor)
  if (t === 'boolean') return typeof valor === 'boolean'
  if (t === 'array') return Array.isArray(valor)
  if (t === 'object') return typeof valor === 'object' && !Array.isArray(valor)
  return false
}

/**
 * Suma el resultado de una tool al bus: campos de primer nivel, con su origen.
 * Un campo que dos tools produjeron queda con el ÚLTIMO valor (el paso más reciente manda) —
 * y el origen lo dice, así la genealogía no se pierde. PURA (devuelve un bus nuevo).
 */
export function sumarAlBus(bus = {}, { tool, datos } = {}) {
  const salida = { ...bus }
  if (!datos || typeof datos !== 'object' || Array.isArray(datos)) return salida
  for (const [k, v] of Object.entries(datos)) {
    if (v === null || v === undefined) continue
    if (k === 'resumen_texto' || k === 'error') continue // texto y fallas no son datos encadenables
    salida[k] = { valor: v, origen: tool }
  }
  return salida
}

/**
 * Completa los argumentos que FALTAN de una tool desde el bus, por contrato.
 *
 * @returns {{args, faltan, incompatibles: [{arg, origen, esperaba, recibio}], conectados: [{arg, origen}]}}
 */
export function completarDesdeBus(tool, { args = {}, faltan = [] } = {}, bus = {}) {
  const props = tool?.schema?.input_schema?.properties ?? {}
  const salida = { ...args }
  const quedan = []
  const incompatibles = []
  const conectados = []
  for (const k of faltan) {
    const enBus = bus[k]
    if (!enBus) { quedan.push(k); continue }
    if (!compatible(enBus.valor, props[k]?.type)) {
      incompatibles.push({ arg: k, origen: enBus.origen, esperaba: props[k]?.type ?? 'string', recibio: Array.isArray(enBus.valor) ? 'array' : typeof enBus.valor })
      quedan.push(k)
      continue
    }
    salida[k] = enBus.valor
    conectados.push({ arg: k, origen: enBus.origen })
  }
  return { args: salida, faltan: quedan, incompatibles, conectados }
}

/** El bus reducido a lo persistible (escalares y refs chicas): para retomar un objetivo a medias. */
export function busPersistible(bus = {}, { topeTexto = 500 } = {}) {
  const salida = {}
  for (const [k, e] of Object.entries(bus)) {
    const v = e?.valor
    if (typeof v === 'string' && v.length <= topeTexto) salida[k] = e
    else if (typeof v === 'number' || typeof v === 'boolean') salida[k] = e
  }
  return salida
}
