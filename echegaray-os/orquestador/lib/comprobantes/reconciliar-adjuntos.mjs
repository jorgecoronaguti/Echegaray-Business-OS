// EL PAPEL SIGUE A SU FILA, Y SE RECALCULA CADA VEZ QUE LA PESTAÑA CAMBIA. Núcleo puro.
//
// ═══ EL DEFECTO (medido el 10/09/2026 sobre la base viva) ═══
//
// La clave de una compra NO ES ESTABLE: es `c:<cuit>|<numero>` cuando la fila tiene CUIT y
// `p:<proveedor>|<numero>` cuando no lo tiene. La columna «CUIT (OS)» del Sheet se llena y se vacía
// sola (la resuelve el directorio de proveedores), así que la MISMA fila cambia de clave sin que
// nadie la toque, y el adjunto que se vinculó ayer queda huérfano hoy. Medidos: 5 adjuntos de 194
// con la clave desalineada contra su propia fila, todos del mismo comprobante.
//
// Y ahí entraba el segundo defecto, el que produce «datos errados»: la pantalla, al no encontrar el
// papel por clave, caía a buscarlo POR NÚMERO DE RENGLÓN — justo lo que la migración de
// `compra_adjunto` prohíbe en su propio comentario, porque el ID de la pestaña es `=ROW()-4` y una
// fila insertada arriba corre todos los renglones de abajo. Así la fila 932 (Lliteras, CUIT
// 30708390557) mostraba el papel de un comprobante leído con CUIT 20349213347.
//
// ═══ LA SOLUCIÓN: RESOLVER EN EL SYNC, NO EN LA PANTALLA ═══
//
// El sync reescribe el espejo entero cada vez que corre. Si en la misma transacción vuelve a
// resolver a qué fila pertenece cada adjunto —con la regla de `clave-conciliada.mjs`, que exige que
// el NÚMERO y el TIPO coincidan siempre y sólo afloja la identidad cuando el proveedor la
// confirma—, el vínculo no puede envejecer: se recalcula junto con lo que lo hace envejecer. La
// pantalla vuelve a ser un cruce exacto por clave, sin atajos.
//
// LO QUE NO HACE: no inventa vínculos. Un adjunto que no empata con exactamente UNA fila se queda
// como está y se cuenta como colgado, para que alguien lo asigne a mano. Y `match_manual` no se
// pisa nunca: lo que dijo una persona le gana a este cálculo (sólo se le refresca el renglón).

import { filaConciliada } from './clave-conciliada.mjs'

/** El proveedor que el lector le entendió al papel, si quedó anotado. */
const proveedorLeido = (a) => a?.lectura?.proveedor ?? a?.lectura?.emisor?.nombre ?? null

/**
 * Qué hay que escribir para que cada adjunto quede colgado de su fila. Puro: no toca la base.
 *
 * @param {Array<{id:string, compra_clave:string|null, fila_compras:number|null, vinculado_por:string, lectura?:object}>} adjuntos
 * @param {Array<{fila:number, clave:string|null, proveedor?:string|null}>} filas  el espejo recién escrito
 * @returns {{refrescar:Array<{id:string,fila:number}>, reasignar:Array<object>, colgados:Array<object>, sinClave:number}}
 */
export function planDeReconciliacion(adjuntos = [], filas = []) {
  const porClave = new Map()
  for (const f of filas) {
    if (!f.clave) continue
    const l = porClave.get(f.clave) ?? []
    l.push(f)
    porClave.set(f.clave, l)
  }
  const conClave = filas.filter((f) => f.clave)
  const plan = { refrescar: [], reasignar: [], colgados: [], sinClave: 0 }

  for (const a of adjuntos) {
    if (!a.compra_clave) { plan.sinClave++; continue }
    const exactas = porClave.get(a.compra_clave) ?? []
    // Una clave que apunta a UNA fila es el caso sano: sólo se refresca la pista del renglón.
    if (exactas.length === 1) {
      if (exactas[0].fila !== a.fila_compras) plan.refrescar.push({ id: a.id, fila: exactas[0].fila })
      continue
    }
    // Dos filas con la MISMA clave son un comprobante cargado dos veces: no se elige ninguna.
    if (exactas.length > 1) { plan.colgados.push({ ...a, motivo: `la clave está en ${exactas.length} filas` }); continue }
    const f = filaConciliada(a.compra_clave, conClave, { proveedor: proveedorLeido(a) })
    if (!f) { plan.colgados.push({ ...a, motivo: 'ninguna fila es ese comprobante' }); continue }
    // Lo que dijo una persona no se recalcula: se le refresca el renglón y nada más.
    if (a.vinculado_por === 'match_manual') {
      if (f.fila !== a.fila_compras) plan.refrescar.push({ id: a.id, fila: f.fila })
      continue
    }
    plan.reasignar.push({ id: a.id, de: a.compra_clave, clave: f.clave, fila: f.fila, proveedor: f.proveedor ?? null })
  }
  return plan
}
