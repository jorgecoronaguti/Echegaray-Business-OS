// QUÉ PARTE DEL NOMBRE COINCIDIÓ CON LO QUE SE BUSCÓ.
//
// Un resultado que no dice por qué entró a la lista obliga a leer las cuatro columnas buscando la
// palabra a ojo — y cuando la coincidencia está en una carpeta del medio no se ve en ninguna parte.
//
// ═══ LOS TOKENS SON LOS DE LA BASE, NO LOS DEL NAVEGADOR ═══
//
// Lo que se resalta son los tokens con los que Postgres filtró, que viajan en `Catalogo.busqueda`.
// Si esta pantalla volviera a partir el texto del buscador por su cuenta, habría un tercer
// tokenizador y se resaltaría una palabra distinta de la que hizo entrar la fila.
//
// ═══ POR QUÉ SE RESALTA LA PALABRA ENTERA ═══
//
// Los tokens vienen en singular («actividad» por «actividades», «obra» por «obras»). Pintar sólo las
// nueve primeras letras de ACTIVIDADES y dejar «ES» apagado se lee como un error de la pantalla, no
// como una coincidencia. Se resalta la palabra completa que EMPIEZA con el token.
//
// ═══ EL APLANADO ES CARÁCTER A CARÁCTER, Y ES A PROPÓSITO ═══
//
// `plano()` de la lib colapsa los separadores seguidos («A  B» → «a b») y por eso sus posiciones no
// sirven para cortar el texto original. Acá cada carácter se mapea a UNO, así que el índice de la
// versión comparable es el índice del texto que se muestra. La ñ se preserva como letra: `plano()`
// hace lo mismo y por la misma razón (Diseño no es «diseno»).

/** El tramo de un texto, y si coincidió con lo buscado. */
export interface Tramo {
  texto: string
  coincide: boolean
}

/** Un carácter, aplanado a su forma comparable. Devuelve siempre exactamente un carácter. */
function aplanarCaracter(c: string): string {
  if (c === 'ñ' || c === 'Ñ') return 'ñ'
  const base = c.normalize('NFD')[0].toLowerCase()
  return /[a-z0-9ñ]/.test(base) ? base : ' '
}

/** Texto comparable del MISMO largo que el original: posición por posición. */
export const aplanarConservandoPosiciones = (texto: string): string =>
  Array.from(texto ?? '', aplanarCaracter).join('')

/**
 * Parte el texto en tramos, marcando las palabras que empiezan con alguno de los tokens.
 *
 * Sin tokens devuelve un solo tramo sin coincidencia: la lista sin búsqueda se dibuja igual que
 * siempre y no hay que preguntarse si hay filtro puesto.
 */
export function tramosResaltados(texto: string | null, tokens: string[] = []): Tramo[] {
  const original = texto ?? ''
  if (!original) return []
  const utiles = tokens.filter(Boolean)
  if (utiles.length === 0) return [{ texto: original, coincide: false }]

  const plano = aplanarConservandoPosiciones(original)
  const marcado = new Array<boolean>(original.length).fill(false)
  // Las palabras del texto, con su posición. El corte es el mismo que usa el tokenizador: todo lo
  // que no es letra ni dígito separa.
  for (const m of plano.matchAll(/[a-z0-9ñ]+/g)) {
    const palabra = m[0]
    if (utiles.some((t) => palabra.startsWith(t))) {
      for (let i = m.index; i < m.index + palabra.length; i += 1) marcado[i] = true
    }
  }

  const tramos: Tramo[] = []
  for (let i = 0; i < original.length; i += 1) {
    const ultimo = tramos[tramos.length - 1]
    if (ultimo && ultimo.coincide === marcado[i]) ultimo.texto += original[i]
    else tramos.push({ texto: original[i], coincide: marcado[i] })
  }
  return tramos
}

/** ¿Alguna palabra de este texto coincidió? Sirve para decidir si hay algo que mostrar. */
export const hayCoincidencia = (texto: string | null, tokens: string[] = []): boolean =>
  tramosResaltados(texto, tokens).some((t) => t.coincide)
