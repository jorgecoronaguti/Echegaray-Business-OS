// ¿DE QUÉ VENTANA DE TIEMPO HABLA CADA CIFRA? — el medidor de la regla que el titular no puede violar.
//
// Vive en su propio archivo y no en `cash-flow-matriz` porque ese módulo ya estaba en 575 líneas
// —por encima del tope de 500 del repo— antes de este trabajo, y engordarlo para meter un control de
// cuarenta líneas es empujar una deuda que no es mía con el hombro. Acá se lee entero de una vez.
//
// NÚCLEO PURO: no toca la red, no lee el Sheet, no sabe de Google.

/**
 * A QUÉ VENTANA DE TIEMPO PERTENECE CADA FILA DEL TRONCO.
 *
 * ═══ LA REGLA QUE ESTO HACE VERIFICABLE (29/08/2026) ═══
 *
 * El dueño rechazó el titular anterior —*"todo eso rehacer no me convence nada"*— y el diagnóstico
 * fue el mismo en las cuatro tarjetas: `ENTRA EN EL AÑO $816.416.110` fundía $496.729.892 YA COBRADO
 * con $319.686.218 POR COBRAR adentro de un solo número, y el lector no podía separar el hecho de la
 * proyección. Regla de oro 3, y regla 17: distinguir actividad de progreso.
 *
 * Desde el rediseño, NINGUNA cifra del titular puede citar filas de las dos ventanas. Eso deja de ser
 * una intención escrita en un comentario y pasa a ser medible: `ventanasDe` dice qué ventanas cita una
 * fórmula, y el test de cada vista exige que nunca sean dos. El saldo (inicial, final) no está en el
 * mapa a propósito: un stock no pertenece a una ventana, es una foto en un instante.
 */
export const VENTANA_DEL_CONCEPTO = Object.freeze({
  ingresoReal: 'ya pasó',
  egresoReal: 'ya pasó',
  ingresoProyectado: 'proyección',
  egresoProyectado: 'proyección',
})

/**
 * NÚCLEO PURO: qué ventanas de tiempo cita una fórmula, mirando a qué filas apunta.
 *
 * @param {string} formula la fórmula tal como se escribe en la celda
 * @param {Record<string,number>} fila el mapa clave → nº de fila que publica cada vista en su `meta`
 * @returns {string[]} las ventanas citadas, sin repetir
 */
export function ventanasDe(formula, fila = {}) {
  const texto = String(formula ?? '')
  const out = new Set()
  for (const [clave, ventana] of Object.entries(VENTANA_DEL_CONCEPTO)) {
    const f = fila[clave]
    // `\b` al final para que la fila 9 no empareje con la 90: `$N$9)` sí, `$N$90` no.
    if (f && new RegExp(`\\$[A-Z]+\\$${f}\\b`).test(texto)) out.add(ventana)
  }
  return [...out]
}
