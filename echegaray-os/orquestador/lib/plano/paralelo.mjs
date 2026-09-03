// TRABAJOS INDEPENDIENTES QUE SE HACEN A LA VEZ, CON EL RESULTADO EN ORDEN DE ENTRADA.
//
// ═══ POR QUÉ EL ORDEN ES LO PRIMERO Y NO UN DETALLE ═══
//
// Leer veinte láminas de a una tardaba veinte veces lo que tarda una. Son independientes: nada de
// lo que devuelve la lámina 3 cambia lo que se le pregunta a la 4. Pero paralelizar por la vía
// obvia —`Promise.all` sobre `map`, o peor, empujar al array a medida que llegan— hace que la
// SALIDA quede en orden de llegada, y el orden de llegada lo decide la latencia de la red.
//
// Este repo publica `huella(seleccion)` justamente para poder decir «dos corridas dieron lo mismo».
// Una lista que se reordena sola rompe esa afirmación sin romper ningún test obvio: el resultado
// sigue siendo «correcto», sólo que distinto cada vez. Por eso el resultado se coloca en el ÍNDICE
// de su entrada y se compacta al final; el paralelismo cambia CUÁNDO se hace cada cosa, nunca en
// qué orden queda.
//
// ═══ CANCELAR ENTRE UNIDADES, NUNCA A MITAD ═══
//
// `cancelado()` se consulta antes de tomar la unidad siguiente. Una llamada de visión ya empezada
// se termina y se guarda: ya se pagó, y tirarla es pagar dos veces por lo mismo cuando el usuario
// vuelva a pedirlo.

/** Cuántas llamadas de visión conviven. 4 sale de la latencia observada por lámina contra el
 *  límite de concurrencia del proveedor: más no acelera, y empieza a producir 429. */
export const CONCURRENCIA_POR_DEFECTO = 4

const enteroPositivo = (v, porDefecto) => {
  const n = Math.floor(Number(v))
  return Number.isFinite(n) && n > 0 ? n : porDefecto
}

/**
 * CORRE `trabajo` SOBRE CADA ITEM CON CONCURRENCIA ACOTADA.
 *
 * @param {Array} items                 las unidades, en el orden que debe tener la salida
 * @param {(item:unknown, i:number)=>Promise<unknown>} trabajo
 * @param {{ concurrencia?:number, cancelado?:(()=>Promise<boolean>)|null,
 *           onProgreso?:((p:object)=>Promise<void>)|null, fase?:string|null,
 *           que?:((item:unknown)=>string)|null }} opciones
 * @returns {Promise<{ resultados:Array, cancelada:boolean, hechos:number, total:number }>}
 *          `resultados` en el MISMO orden que `items`, sólo con las unidades que llegaron a correr.
 */
export async function enParalelo(items = [], trabajo, {
  concurrencia = CONCURRENCIA_POR_DEFECTO, cancelado = null, onProgreso = null, fase = null, que = null,
} = {}) {
  const total = items.length
  const VACIO = Symbol('sin correr')
  const salida = new Array(total).fill(VACIO)
  let siguiente = 0
  let hechos = 0
  let cancelada = false

  const obrero = async () => {
    for (;;) {
      if (cancelada) return
      // Se pregunta ANTES de tomar la unidad: una vez tomada, se termina y se cobra.
      if (cancelado && await cancelado()) { cancelada = true; return }
      const i = siguiente++
      if (i >= total) return
      salida[i] = await trabajo(items[i], i)
      hechos += 1
      // El progreso es informativo y su orden lo decide la latencia, no el índice: `hecho` es el
      // conteo REAL de terminadas, que es lo único que una barra de progreso necesita.
      if (onProgreso) await onProgreso({ fase, hecho: hechos, total, que: que ? que(items[i], i) : null })
    }
  }

  const obreros = Math.min(enteroPositivo(concurrencia, CONCURRENCIA_POR_DEFECTO), Math.max(total, 1))
  await Promise.all(Array.from({ length: obreros }, obrero))
  return { resultados: salida.filter((x) => x !== VACIO), cancelada, hechos, total }
}
