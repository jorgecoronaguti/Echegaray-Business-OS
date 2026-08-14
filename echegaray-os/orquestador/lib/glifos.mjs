// LOS GLIFOS QUE EL ARCHIVO SÍ DIBUJA — y por qué el ⚠ no era uno de ellos.
//
// ═══ QUÉ PASÓ (13/08/2026) ═══
//
// "Calendario de Cobros" y "OBRAS" se publicaron con la señal de alerta puesta donde correspondía:
// `⚠ Vencido` en el encabezado, `⚠ fin 21/08` en el hito que se cobra después de que termina su obra,
// `⚠ sin proveedor` en el egreso sin identificar. La celda LA TENÍA (verificado por API). En la
// pantalla no estaba: se leía "Vencido", "fin 21/08", "sin proveedor". La marca que existe para que
// alguien mire justo ahí era la única parte que no se veía.
//
// ═══ LA CAUSA, MEDIDA Y NO SUPUESTA ═══
//
// Se exportaron tres pestañas del archivo vivo a PDF (`ver-pestana.mjs`) y se miraron:
//
//   · `Calendario de Cobros!D4`  "⚠ Vencido"        → dibuja "Vencido"
//   · `Cobranzas!V45`            "🟢 Vigente"        → dibuja "Vigente"
//   · `Jornales por Quincena`    "⇒ TOTAL", "✓ ofi…", "⊘ No incluye…" → se dibujan enteros
//   · `Calendario de Cobros!C4`  "↳ endosado"        → se dibuja entero
//
// El corte no es "símbolo raro sí / símbolo raro no": es la PROPIEDAD EMOJI de Unicode. `⚠` (U+26A0)
// y `🟢` (U+1F7E2) son emoji y el exportador no los embebe; `⇒` (U+21D2), `↳` (U+21B3), `⊘` (U+2298),
// `✓` (U+2713) y `—` (U+2014) no lo son y salen dibujados. En el navegador el emoji probablemente se
// vea — el que lo pierde es el PDF, que es con lo que el OS verifica y con lo que se imparte una
// reunión. Una alerta que desaparece al imprimir no es una alerta.
//
// ═══ POR QUÉ ▲ Y NO OTRO ═══
//
// Está en Geometric Shapes (U+25B2) y NO tiene propiedad Emoji — la misma familia de `⊘`, `⇒`, `↳` y
// `✓`, los cuatro verificados dibujándose en este archivo. Los vecinos ▶ (U+25B6) y ◀ (U+25C0) SÍ son
// emoji: por eso el triángulo que se usa es el que apunta hacia arriba y no cualquiera.
//
// Y ES UNA SOLA CONSTANTE A PROPÓSITO. El glifo estaba tipeado en cada generador, así que "cambiar la
// señal de alerta" eran veinte ediciones y la que se olvidara quedaba invisible sin avisar. Ahora la
// decisión vive acá; lo que cada pestaña elige es CUÁNDO alertar, no con qué carácter.

/** LA SEÑAL DE ALERTA DE TODO EL ARCHIVO: "esto es lo que hay que mirar". */
export const ALERTA = '▲'

/**
 * EL GLIFO QUE YA ESTÁ PUBLICADO, y por qué sigue vivo en el código.
 *
 * El cambio de `⚠` a `▲` no reescribe el archivo: cada pestaña se corrige cuando corre SU generador,
 * y hasta entonces conviven las dos marcas en las celdas. Eso importa porque hay tres mecanismos que
 * reconocen lo publicado POR SU TEXTO y no por su coordenada:
 *
 *   · la huella de celda (`huella-celda`, `huella-forma`), que decide "esta celda la escribí yo" para
 *     poder sellar que el dueño la borró — si deja de reconocer una marca, el borrado no se sella y a
 *     la corrida siguiente la celda VUELVE, que es el reclamo del dueño palabra por palabra;
 *   · el cash flow, que suma cheques y tarjeta contando las filas cuya marca dice "FALTA la factura":
 *     ahí un texto que no coincide no da error, da $0;
 *   · la piel de las pestañas (`impuestos-piel`, `estilo-statement`), que pinta la alarma en rojo por
 *     cómo empieza el texto de la columna A.
 *
 * Reconocer las dos es lo que hace que el cambio sea gradual en vez de un corte. Cuando ninguna celda
 * del archivo tenga `⚠` —lo mide `auditar-pantalla` con `glifo_invisible`— esta constante se saca y
 * con ella los dos brazos de cada comparación.
 */
export const ALERTA_HEREDADA = '⚠'

/** Cualquiera de las dos marcas de alerta: la vigente y la que quedó publicada. Para RECONOCER. */
export const MARCA_ALERTA = /[▲⚠]/

/**
 * UN TEXTO PUBLICADO, LLEVADO A LA MARCA VIGENTE.
 *
 * Sirve para comparar contra lo que hay hoy en una celda sin que el glifo decida el resultado. Saca
 * también el selector de variación (U+FE0F), que es invisible y hace fallar una igualdad exacta entre
 * dos textos que se ven idénticos.
 *
 * @param {unknown} texto
 * @returns {string}
 */
export function normalizarAlerta(texto) {
  return String(texto ?? '').replaceAll(ALERTA_HEREDADA, ALERTA).replaceAll('\uFE0F', '')
}

/** ¿Estos dos textos son la misma marca, más allá de con qué glifo se publicó cada uno? */
export function mismaMarca(a, b) {
  return normalizarAlerta(a) === normalizarAlerta(b)
}

/**
 * LOS TEXTOS CON LOS QUE UNA MARCA PUEDE ESTAR PUBLICADA HOY: el vigente y, si lleva alerta, el viejo.
 *
 * Lo usa quien no puede escribir una comparación booleana —un `COUNTIF` por texto, una lista de
 * "rótulos míos"— y necesita las dos formas enumeradas.
 *
 * @param {string} marca
 * @returns {string[]}
 */
export function variantesDeMarca(marca) {
  const heredada = String(marca).replaceAll(ALERTA, ALERTA_HEREDADA)
  return heredada === marca ? [String(marca)] : [String(marca), heredada]
}

/**
 * EL PREDICADO DE FÓRMULA QUE RECONOCE LA MARCA CON CUALQUIERA DE LOS DOS GLIFOS.
 *
 * Un `SUMPRODUCT` que compara contra el texto exacto deja de sumar las filas que todavía tienen el
 * glifo viejo, y no da error: da $0. Los dos brazos se suman porque una celda no puede tener las dos
 * marcas a la vez, así que la suma es un OR y no un doble conteo.
 *
 * Se saca junto con `ALERTA_HEREDADA` cuando el archivo no tenga más `⚠`.
 *
 * @param {string} rango la referencia ya armada, tal cual va en la fórmula
 * @param {string} marca el texto exacto que escribe el generador HOY
 * @returns {string} una expresión booleana lista para multiplicar dentro de un SUMPRODUCT
 */
export function comparaMarca(rango, marca) {
  const heredada = String(marca).replaceAll(ALERTA, ALERTA_HEREDADA)
  if (heredada === marca) return `(${rango}="${marca}")`
  return `((${rango}="${marca}")+(${rango}="${heredada}"))`
}

/**
 * LOS RANGOS QUE EL PDF NO DIBUJA: los pictográficos y los símbolos con presentación emoji.
 *
 * Es una lista CONSERVADORA y explícita, no "todo lo que no sea ASCII": el archivo usa a propósito
 * `—`, `·`, `⇒`, `↳`, `⊘`, `✓`, `‖` y `≈`, y marcarlos convertiría el detector en ruido — que en este
 * repo es la forma conocida de que un control deje de mirarse.
 *
 * El corte fino importa dentro de Dingbats: `✓` (U+2713) y `✗` (U+2717) NO son emoji y se dibujan;
 * `✔` (U+2714), `✖` (U+2716) y `✅` (U+2705) sí lo son y no se dibujan. Se listan uno por uno.
 */
const RANGOS_EMOJI = [
  [0x1F000, 0x1FAFF], // pictográficos: 🟢 🔴 🔒 ✅…
  [0x2600, 0x26FF],   // Miscellaneous Symbols: ⚠ ⛔ ☀ …
  [0xFE0F, 0xFE0F],   // el selector de variación que fuerza presentación emoji
  [0x1F1E6, 0x1F1FF], // banderas
]

/** Los de Dingbats que sí son emoji. El resto del bloque (✓ ✗ ✱…) se dibuja y no se marca. */
const DINGBATS_EMOJI = new Set([
  0x2702, 0x2705, 0x2708, 0x2709, 0x270A, 0x270B, 0x270C, 0x270D, 0x270F, 0x2712, 0x2714, 0x2716,
  0x271D, 0x2721, 0x2728, 0x2733, 0x2734, 0x2744, 0x2747, 0x274C, 0x274E, 0x2753, 0x2754, 0x2755,
  0x2757, 0x2763, 0x2764, 0x2795, 0x2796, 0x2797, 0x27A1, 0x27B0, 0x27BF, 0x2B05, 0x2B06, 0x2B07,
  0x2B1B, 0x2B1C, 0x2B50, 0x2B55,
])

/** ¿Este carácter se pierde al exportar? */
export function esInvisible(ch) {
  const c = String(ch).codePointAt(0)
  if (DINGBATS_EMOJI.has(c)) return true
  return RANGOS_EMOJI.some(([a, b]) => c >= a && c <= b)
}

/**
 * LOS CARACTERES DE UN TEXTO QUE NO SE VAN A DIBUJAR.
 *
 * Devuelve los distintos, en orden de aparición: lo que interesa es QUÉ glifo hay que cambiar, no
 * cuántas veces aparece.
 *
 * @param {string} texto
 * @returns {string[]}
 */
export function glifosInvisibles(texto) {
  const out = []
  for (const ch of String(texto ?? '')) {
    if (esInvisible(ch) && !out.includes(ch)) out.push(ch)
  }
  return out
}
