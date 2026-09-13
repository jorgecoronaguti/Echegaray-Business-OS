// DE CUÁNDO SON LOS DATOS DE LA FICHA.
//
// Desde 20260913T1500 la ficha de Dirección se sirve de `ficha_cliente_cache`, que se recalcula cada
// cinco minutos: lo que se ve puede no incluir lo que un sincronizador escribió hace tres. Un número
// servido de una caché sin decir de cuándo es se lee como un número de ahora, y eso es presentar una
// foto como si fuera la realidad. La pantalla lo dice en una línea; esta función decide qué línea.

/**
 * `null` = los datos se calcularon EN VIVO para este pedido (la RPC no mandó `cache_calculado_en`),
 * o la marca no se puede leer: en los dos casos no hay nada que advertir y no se dibuja nada. Un
 * instante en el futuro —relojes corridos entre la base y el servidor— se lee como «recién».
 */
export function frescuraDeLaFicha(calculadoEn: string | null | undefined, ahora: Date): string | null {
  if (!calculadoEn) return null
  const t = Date.parse(calculadoEn)
  if (Number.isNaN(t)) return null
  const minutos = Math.floor((ahora.getTime() - t) / 60_000)
  return minutos < 1 ? 'datos de hace menos de 1 min' : `datos de hace ${minutos} min`
}
