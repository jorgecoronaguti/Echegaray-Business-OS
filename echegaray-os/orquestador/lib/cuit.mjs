// EL CUIT: VALIDARLO ANTES DE CREERLE, Y SABER DE QUIÉN ES.
//
// POR QUÉ EXISTE (21/07). El dueño: "agregar al OS que si hay CUIT que lo busque en internet y
// traiga la razón social". El pedido nació de un caso concreto: el extracto mostraba
// "Transferencia Recibida - Credin - Cuit 30710630670" por $11.913.568 y el OS no tenía forma de
// decir de quién era. Un CUIT suelto en un concepto bancario es un dato que el OS ve y no entiende,
// y por eso terminó reportado como "una transferencia que Cobranzas no tiene" cuando en realidad
// era el rescate de una inversión.
//
// ═══ LO PRIMERO NO ES INTERNET: ES ARITMÉTICA ═══
//
// El CUIT lleva dígito verificador módulo 11. Eso significa que un CUIT mal transcripto se detecta
// SIN consultar nada, gratis y con certeza total. Antes de salir a buscar quién es, este archivo
// contesta si el número siquiera puede existir. Buscar la razón social de un CUIT inválido devuelve
// "no encontrado" y esconde que el problema era un typo — que es el error más frecuente de todos.
//
// El prefijo también informa, y también sin consultar nada:
//   20 · 23 · 24 · 27  → persona física   (20 y 23/24 varón, 27 y 23/24 mujer)
//   30 · 33 · 34       → persona jurídica (sociedad)
//   los demás          → casos especiales (sucesiones, extranjeros, entes)
//
// Con eso solo ya se puede decir que 30-71063067-0 es una SOCIEDAD y que el número es válido, antes
// de tocar la red.
//
// ═══ LO QUE ESTE ARCHIVO NO HACE ═══
//
// No consulta. Es núcleo puro: entra un string, sale un juicio. Quién resuelve la razón social —y
// con qué nivel de confianza según de dónde la sacó— es `razon-social.mjs`.

/** Los pesos del dígito verificador, en orden. Es la definición del algoritmo, no una constante mía. */
const PESOS = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2]

/** Qué es cada prefijo. Los que no están acá existen pero son casos especiales. */
export const PREFIJOS = new Map([
  ['20', 'persona física'],
  ['23', 'persona física'],
  ['24', 'persona física'],
  ['27', 'persona física'],
  ['30', 'persona jurídica'],
  ['33', 'persona jurídica'],
  ['34', 'persona jurídica'],
])

/**
 * NÚCLEO PURO: deja el CUIT en 11 dígitos, sin guiones ni puntos ni espacios.
 * Devuelve '' si lo que entró no puede ser un CUIT.
 */
export function normalizar(v) {
  const d = String(v ?? '').replace(/\D/g, '')
  return d.length === 11 ? d : ''
}

/**
 * NÚCLEO PURO: el dígito verificador que le corresponde a los primeros 10 dígitos.
 * @returns {number|null} null si no hay 10 dígitos con los que calcularlo.
 */
export function digitoVerificador(v) {
  const d = String(v ?? '').replace(/\D/g, '')
  if (d.length < 10) return null
  const suma = PESOS.reduce((s, p, i) => s + p * Number(d[i]), 0)
  const r = 11 - (suma % 11)
  // Los dos casos de borde del módulo 11, que son la parte que se implementa mal:
  //   resto 0  → el verificador es 0 (no 11)
  //   resto 1  → el verificador es 9 para persona física con prefijo 23, y 4 si no
  if (r === 11) return 0
  if (r === 10) return String(d).startsWith('23') ? 9 : 4
  return r
}

/** NÚCLEO PURO: ¿el CUIT es aritméticamente posible? Un `false` acá es un typo, no un "no existe". */
export function valido(v) {
  const c = normalizar(v)
  if (!c) return false
  const dv = digitoVerificador(c)
  return dv !== null && dv === Number(c[10])
}

/** NÚCLEO PURO: 'persona física' | 'persona jurídica' | 'caso especial' | null. Sin consultar nada. */
export function tipo(v) {
  const c = normalizar(v)
  if (!c) return null
  return PREFIJOS.get(c.slice(0, 2)) ?? 'caso especial'
}

/** NÚCLEO PURO: 30-71063067-0. El formato en que lo escribe cualquier documento argentino. */
export function formatear(v) {
  const c = normalizar(v)
  return c ? `${c.slice(0, 2)}-${c.slice(2, 10)}-${c.slice(10)}` : String(v ?? '')
}

/**
 * NÚCLEO PURO: encuentra los CUIT que haya dentro de un texto libre.
 *
 * Para qué: los conceptos del extracto bancario los traen embebidos ("Debito Automatico - Afip
 * -30716304643", "Transferencia Recibida - Credin - Cuit 30710630670") y ahí es donde el OS los
 * necesita. SÓLO devuelve los que pasan el dígito verificador: en un concepto bancario hay números
 * de cheque, de CBU y de lote, y once dígitos cualesquiera no son un CUIT.
 *
 * @returns {string[]} CUIT normalizados, sin repetir, en el orden en que aparecen.
 */
export function extraer(texto) {
  const s = String(texto ?? '')
  const out = []
  // Con o sin guiones. El \d{11} suelto también entra porque el extracto los pega sin separador.
  for (const m of s.matchAll(/\d{2}-?\d{8}-?\d{1}/g)) {
    const c = normalizar(m[0])
    if (c && valido(c) && !out.includes(c)) out.push(c)
  }
  return out
}

/**
 * NÚCLEO PURO: el juicio completo sobre un CUIT, sin red.
 * @returns {{cuit:string, formateado:string, valido:boolean, tipo:string|null, problema:string|null}}
 */
export function analizar(v) {
  const c = normalizar(v)
  if (!c) {
    return { cuit: '', formateado: String(v ?? ''), valido: false, tipo: null, problema: 'no son 11 dígitos' }
  }
  const ok = valido(c)
  return {
    cuit: c,
    formateado: formatear(c),
    valido: ok,
    tipo: tipo(c),
    // Un dígito verificador que no cierra es un ERROR DE CARGA, y decirlo así evita que alguien
    // salga a buscar en internet una empresa que no existe.
    problema: ok ? null : `el dígito verificador no cierra: debería terminar en ${digitoVerificador(c)} y termina en ${c[10]}`,
  }
}
