// LA COLUMNA B DE "Compras" NO ES UN RUBRO: ES **BLANCO O NEGRO**. NÚCLEO PURO, CERO MODELO.
//
// ═══ EL DEFECTO (13/08, reclamo textual del dueño) ═══
//
// «toma mal la "categoria", estoy poniendo comprobantes justamente es en B blanco».
//
// En la pestaña Compras del Flujo de Caja, la columna B se rotula "Categoría" y su desplegable
// estricto tiene DOS valores. Leídos del Sheet vivo el 13/08:
//
//     Compras!B4:B12  →  ["B", "N"]      B = en blanco (con comprobante fiscal) · N = en negro
//
// El bot le pasaba esa lista al modelo de visión con este encabezado:
//
//     «CATEGORÍA (columna B) — qué se compró, en el vocabulario de la empresa: · B · N»
//     «Sale de LOS RENGLONES del comprobante, no del nombre del proveedor»
//
// O sea: se le preguntaba QUÉ SE COMPRÓ y se le ofrecía elegir entre "B" y "N". No hay forma de que
// eso salga bien. La fila 840 —Rodamientos Cuyo, **factura A 0012-00050057**— quedó clasificada `N`:
// un gasto documentado con factura, registrado como si fuera en negro.
//
// ═══ LA REGLA, DERIVADA DE LAS FILAS REALES (no de un criterio propio) ═══
//
// Filas 826-842 de Compras, el mismo día, unas cargadas por Claude Code y otras por el bot:
//
//     826 B · 827 B · 830 B · 831 B · 833 B · 835 B · 838 B · 839 B   ← todas con comprobante fiscal
//     828 N · 829 N · 834 N   ← Sueldos y PEDRO TELLO, tipo "N/A": SIN comprobante fiscal
//     841 B (F A) · 842 B (F C)   ← el bot acertó
//     840 N (F A)                 ← el bot falló
//
// **Hay comprobante fiscal ⇒ B. No lo hay ⇒ N.** Es todo. Y por lo tanto NO ES UNA DECISIÓN DE
// MODELO: sale de dos datos que ya se leyeron y que ya deciden otras columnas —el tipo (G) y el
// número (H)—. Una columna que se puede derivar y se le pregunta a un modelo es una columna que
// alguna vez va a salir mal.
//
// ═══ QUÉ CUENTA COMO "COMPROBANTE FISCAL" ═══
//
// El tipo del desplegable G (`F A`, `F B`, `F C`, `N C`) MÁS un número de comprobante. Las dos cosas:
// el número solo no alcanza (un remito tiene número) y el tipo solo tampoco (sin número no hay
// comprobante que respalde nada).
//
// · Un TIQUE FACTURA A o B es comprobante fiscal: es factura, la emite un controlador fiscal, y va B.
//   El CAE **no** entra en la regla — muchos tiques térmicos no lo imprimen legible y quedarían mal
//   clasificados por un problema de foto, que es exactamente el error que se está arreglando.
// · Una NOTA DE CRÉDITO es fiscal: va B (con sus importes en negativo, que decide `lectura.mjs`).
// · Un gasto sin comprobante —un sueldo, un pago a una persona, tipo `N/A`— va N.
//
// ═══ Y AUN ASÍ SE VALIDA CONTRA EL DESPLEGABLE ═══
//
// La regla dice "B" o "N", pero lo que se escribe se compara igual contra la lista viva de la columna.
// Si mañana el dueño cambia los rótulos, esto devuelve null y la celda queda VACÍA —que él completa en
// dos segundos— en vez de quedar en ROJO rompiendo los cruces del Cash Flow.

import { valorDeLista } from './desplegables.mjs'

/** Los dos valores de la columna B, tal como están escritos en el desplegable. */
export const CATEGORIA = Object.freeze({ BLANCO: 'B', NEGRO: 'N' })

/** Los tipos del desplegable G que SON un comprobante fiscal. `NC` es la nota de crédito. */
const TIPOS_FISCALES = new Set(['A', 'B', 'C', 'NC'])

/**
 * ¿Este comprobante está respaldado por un comprobante FISCAL?
 *
 * @param {{tipo?:string|null, numero?:string|null, esNotaCredito?:boolean}} c
 */
export function tieneComprobanteFiscal(c = {}) {
  const tipo = String(c?.tipo ?? '').toUpperCase().replace(/[^A-Z]/g, '')
  const numero = String(c?.numero ?? '').trim()
  // Un número que no tiene un solo dígito no es un número de comprobante.
  if (!/\d/.test(numero)) return false
  if (c?.esNotaCredito === true) return true
  return TIPOS_FISCALES.has(tipo)
}

/**
 * La categoría (columna B) que le corresponde a este comprobante. DETERMINÍSTICA.
 *
 * @param {object} comprobante  el normalizado de `lectura.mjs` (tipo, numero, esNotaCredito)
 * @param {string[]} [categorias]  el desplegable vivo de la columna B. Si se pasa, manda.
 * @returns {'B'|'N'|null}  null = el desplegable no tiene el valor que corresponde: celda vacía.
 */
export function categoriaDelComprobante(comprobante = {}, categorias = null) {
  const valor = tieneComprobanteFiscal(comprobante) ? CATEGORIA.BLANCO : CATEGORIA.NEGRO
  if (!Array.isArray(categorias) || !categorias.length) return valor
  return valorDeLista(valor, categorias)
}
