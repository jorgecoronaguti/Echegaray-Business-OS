// MEDIR EL TEXTO ANTES DE DIBUJARLO. Es lo único que separa una plantilla de un accidente.
//
// ═══ EL PROBLEMA ═══
//
// La Slides API acepta cualquier texto en cualquier caja y no avisa nada: el texto que no entra se
// dibuja igual, encima de lo que sigue o cortado por el borde. El defecto se ve recién en el PDF,
// cuando ya se mandó. Por eso el motor mide ACÁ, con el ancho real de la caja, y decide antes de
// escribir: achica, parte en dos láminas, o devuelve el defecto.
//
// ═══ POR QUÉ UNA TABLA DE ANCHOS Y NO UN FACTOR ═══
//
// El atajo de siempre es «ancho ≈ 0,5 × tamaño × caracteres». Con eso «MINIMIZACIÓN DE RIESGOS»
// (mayúsculas anchas) y «lililili» miden lo mismo, y una de las dos desborda. La tabla clasifica
// por familia de glifo, que es como funcionan de verdad las tipografías proporcionales. No es
// exacta —para eso habría que leer la fuente— y no necesita serlo: necesita ser CONSERVADORA, y
// por eso `HOLGURA` infla la medida un 4%. Preferimos una lámina con un poco de aire de más a una
// con una línea comida.
//
// PURO ENTERO: ni red, ni disco, ni API. Se testea con `node --test` en milisegundos.

import { alRitmo } from './marca.mjs'

/** Ancho de cada familia de glifo, en múltiplos del tamaño de fuente (em), para una sans
 *  humanista tipo Inter. Medidos sobre los avances reales de la familia, redondeados hacia arriba. */
const ANCHOS = [
  [/[ ]/, 0.28],
  [/[iIl.,;:'`!|]/, 0.30],
  [/[jftr()[\]{}/\\-]/, 0.37],
  [/[mwMW@]/, 0.90],
  [/[A-ZÁÉÍÓÚÑÜ]/, 0.70],
  [/[0-9$%]/, 0.60],
]
const ANCHO_POR_DEFECTO = 0.55

// ═══ LOS TRES FACTORES, Y DE DÓNDE SALIERON ═══
//
// HOLGURA es el margen conservador de siempre. Los otros dos se agregaron el 27/08/2026 MIRANDO
// una presentación real: «$ 84,2 M» a 28 pt entraba según esta tabla (118 pt disponibles) y en la
// lámina renderizada por Google se partió en dos líneas y se comió la nota de abajo.
//
//   NEGRITA — la tabla se armó con los avances del peso regular. El bold de una humanista pesa
//             entre 5% y 8% más, y los números grandes de una presentación son SIEMPRE bold.
//   DISPLAY — a 30 pt un 4% de error son 5 pt; a 12 pt son 0,5. El texto grande no tiene dónde
//             equivocarse, así que se lo mide con más margen que al cuerpo.
//
// Nada de esto reemplaza mirar el resultado: es lo que hace que mirarlo casi nunca encuentre nada.
const HOLGURA = 1.04
const NEGRITA = 1.06
const DISPLAY = 1.04
const DESDE_DISPLAY = 20

// La búsqueda por regex se hace UNA vez por carácter distinto. Sin esto, medir un texto largo
// vuelve a recorrer seis expresiones regulares por letra y por intento de corte.
const _cache = new Map()
function anchoGlifo(ch) {
  let v = _cache.get(ch)
  if (v === undefined) {
    const regla = ANCHOS.find(([re]) => re.test(ch))
    v = regla ? regla[1] : ANCHO_POR_DEFECTO
    _cache.set(ch, v)
  }
  return v
}

/** Ancho de un texto en PT a un tamaño dado. PURA. */
export function anchoTexto(texto, tamano, { negrita = false } = {}) {
  let em = 0
  for (const ch of String(texto ?? '')) em += anchoGlifo(ch)
  const factor = HOLGURA * (negrita ? NEGRITA : 1) * (tamano >= DESDE_DISPLAY ? DISPLAY : 1)
  return em * tamano * factor
}

/** Cuántos caracteres de `s` entran en `ancho`. Búsqueda binaria: la variante que descontaba de a
 *  uno era cuadrática y una URL de 4.000 caracteres colgaba la composición varios minutos. PURA. */
function cuantosEntran(s, ancho, tamano, negrita) {
  let bajo = 1
  let alto = s.length
  while (bajo < alto) {
    const medio = Math.ceil((bajo + alto) / 2)
    if (anchoTexto(s.slice(0, medio), tamano, { negrita }) <= ancho) bajo = medio
    else alto = medio - 1
  }
  return Math.max(1, bajo)
}

/**
 * Parte un texto en las líneas que le van a salir dentro de `ancho`. Respeta los saltos que ya
 * traía y corta la palabra que sola no entra (una URL larga, un código de obra). PURA.
 */
export function partirEnLineas(texto, { ancho, tamano, negrita = false }) {
  const lineas = []
  for (const parrafo of String(texto ?? '').split('\n')) {
    if (!parrafo.trim()) { lineas.push(''); continue }
    let actual = ''
    for (const palabra of parrafo.trim().split(/\s+/)) {
      const tentativa = actual ? `${actual} ${palabra}` : palabra
      if (anchoTexto(tentativa, tamano, { negrita }) <= ancho) { actual = tentativa; continue }
      if (actual) { lineas.push(actual); actual = '' }
      // La palabra sola tampoco entra: se parte por caracter, que es lo que hace el renderer.
      let resto = palabra
      while (anchoTexto(resto, tamano, { negrita }) > ancho && resto.length > 1) {
        const corte = cuantosEntran(resto, ancho, tamano, negrita)
        lineas.push(resto.slice(0, corte))
        resto = resto.slice(corte)
      }
      actual = resto
    }
    lineas.push(actual)
  }
  return lineas
}

/** Alto que va a ocupar un texto. `alto` es el interlineado (1,42 = 142%). PURA. */
export function medirTexto(texto, { ancho, tamano, alto = 1.35, negrita = false }) {
  const lineas = partirEnLineas(texto, { ancho, tamano, negrita })
  return { lineas: lineas.length, altoPt: lineas.length * tamano * alto, textoLineas: lineas }
}

/**
 * Mide una lista de bullets con su sangría y el espacio entre ítems. El aire ENTRE bullets es la
 * mitad del interlineado: menos que eso y la lista se lee como un bloque, más y se desarma.
 * PURA.
 */
export function medirBullets(items, { ancho, tamano, alto = 1.42, sangria = 16, negrita = false }) {
  const util = ancho - sangria
  let total = 0
  const detalle = []
  for (const it of items || []) {
    const m = medirTexto(String(it ?? ''), { ancho: util, tamano, alto, negrita })
    detalle.push(m)
    total += m.altoPt
  }
  const separacion = Math.max(0, (items?.length ?? 0) - 1) * tamano * alto * 0.5
  return { altoPt: total + separacion, detalle }
}

/**
 * AUTOAJUSTE. Baja el tamaño en escalones de 0,5 pt hasta que el texto entra, sin pasar del piso.
 * Devuelve `{tamano, entra}`. Si `entra` es false, el motor NO achica más: parte el contenido en
 * otra lámina. Achicar sin piso es como se llega a la lámina de cuerpo 7 que nadie lee. PURA.
 */
export function ajustarTamano(texto, { ancho, altoDisponible, tamano, alto = 1.42, piso = 0.82, negrita = false }) {
  const minimo = Math.max(9, tamano * piso)
  for (let t = tamano; t >= minimo - 0.001; t -= 0.5) {
    if (medirTexto(texto, { ancho, tamano: t, alto, negrita }).altoPt <= altoDisponible) return { tamano: Number(t.toFixed(1)), entra: true }
  }
  return { tamano: Number(minimo.toFixed(1)), entra: false }
}

/**
 * Reparte una lista de bullets en tantas láminas como haga falta para que ninguna desborde.
 * Devuelve `[[...], [...]]`. Nunca deja una lámina con un solo bullet si se puede evitar: una
 * continuación de un ítem se ve como un error de armado. PURA.
 */
export function repartirBullets(items, { ancho, altoDisponible, tamano, alto = 1.42, sangria = 16 }) {
  const lista = (items || []).map((i) => String(i ?? '')).filter(Boolean)
  if (!lista.length) return []
  const grupos = []
  let actual = []
  for (const it of lista) {
    const prueba = [...actual, it]
    if (medirBullets(prueba, { ancho, tamano, alto, sangria }).altoPt <= altoDisponible || !actual.length) {
      actual = prueba
    } else {
      grupos.push(actual); actual = [it]
    }
  }
  if (actual.length) grupos.push(actual)
  // Huérfano: si la última lámina quedó con uno solo y la anterior tiene de sobra, se mueve uno.
  if (grupos.length > 1 && grupos.at(-1).length === 1 && grupos.at(-2).length > 2) {
    const previo = grupos.at(-2)
    const movido = previo.pop()
    grupos[grupos.length - 1] = [movido, ...grupos.at(-1)]
  }
  return grupos
}

/**
 * Reparte `n` cajas iguales a lo ancho de un tramo, con canaleta. Es la geometría de las tarjetas
 * de KPI y de las columnas. Devuelve `[{x, ancho}]`. PURA.
 */
export function repartirEnFila(n, { x, ancho, canaleta = 16 }) {
  const cantidad = Math.max(1, Math.round(n))
  const ancho1 = (ancho - canaleta * (cantidad - 1)) / cantidad
  return Array.from({ length: cantidad }, (_, i) => ({ x: x + (ancho1 + canaleta) * i, ancho: ancho1 }))
}

/** ¿Se pisan dos cajas? Con una tolerancia de 0,5 pt: dos bordes que se tocan no se pisan. PURA. */
export function seSuperponen(a, b, tolerancia = 0.5) {
  return a.x + a.ancho - tolerancia > b.x
    && b.x + b.ancho - tolerancia > a.x
    && a.y + a.alto - tolerancia > b.y
    && b.y + b.alto - tolerancia > a.y
}

/** Apila cajas desde `y`, devolviendo la y siguiente al ritmo vertical. PURA. */
export function apilar(y, altoPt, separacion = 0) {
  return alRitmo(y + altoPt + separacion)
}
