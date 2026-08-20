// UN GENERADOR TIENE QUE PODER BORRAR SU PROPIA BASURA — Y NADA MÁS QUE SU PROPIA BASURA.
//
// ═══ POR QUÉ EXISTE (13/08) ═══
//
// La pestaña "Proveedores" del Sheet real acumulaba TRES copias del mismo bloque de ARCA: la viva en
// 177-182, un fósil en 126 (con la fórmula `=SUMPRODUCT('_ARCA_RAW'…)` idéntica a la de B177) y un
// fragmento en 229-230 que decía 456 comprobantes / $179.091.614 donde el vivo dice 380 /
// $126.944.008 — $52,1M de contradicción a la vista, en la pestaña que el dueño mira.
//
// La causa no era que el generador no quisiera limpiarlas. Las pedía limpiar en cada corrida:
// `fusionar()` traduce su centinela a cadena vacía y `rellenoDeCola()` escribe cadenas vacías sobre
// la cola. Las dos escrituras terminan en `batchUpdateValues`, y ahí `no-borrar.mjs` —la única guarda
// del repo sin bypass, escrita después de siete pérdidas de trabajo del dueño— hace lo que dice:
// **celda por celda, si el valor nuevo está vacío y el destino tiene algo, gana el destino.**
//
// Es correcto para lo del dueño y es exactamente lo contrario de lo que hace falta para lo propio.
// El resultado medido: el generador imprime "🧹 limpié N filas", la guarda las revierte en silencio,
// y cada corrida con la región corrida de lugar deja una copia más. Las tres copias están a ±50 filas
// del bloque vivo, que es el alto que ocupa la tabla dinámica de la sección 2 (filas 53-101): la
// región del generador arranca donde esa dinámica termina, así que se mueve con ella.
//
// ═══ LA PRUEBA DE PROPIEDAD, Y POR QUÉ NO ALCANZA UN PERMISO ═══
//
// Un permiso del llamador ("confiá, esto es mío") sería el bypass que este repo ya decidió no tener.
// Acá el llamador aporta su registro de rótulos y la decisión se toma contra **el valor que la guarda
// releyó en el destino**, no contra lo que el llamador dice que hay. Un control no se valida contra
// la información que él mismo produce.
//
// Son dos preguntas, y las dos tienen que dar que sí:
//
//   1. ¿La FILA es del generador?   → tiene un rótulo del registro, o una marca tipográfica que un
//                                     humano no escribe al anotar (▲ ⚠ ⇒ ‖ § · ✓ 🟡 ✅).
//   2. ¿La CELDA es del generador?  → es un rótulo del registro, o tiene forma de dato generado
//                                     (importe, fecha, CUIT, comprobante, fórmula, marca).
//
// La primera existe para que una tabla de números del dueño —sin un solo rótulo mío— quede intacta
// aunque cada celda suelta "parezca" generada. La segunda, para que dentro de una fila mía su nota al
// costado se preserve: en la fila 229 real se vacían A/B/C y sobrevive la columna I, que dice
// "Conciliación del OS al 2026-08-04 — …" y no se puede probar propia (lleva la fecha adentro, así
// que al día siguiente ya no coincide con el registro).
//
// EL LADO PARA EQUIVOCARSE ES CONSERVAR. Sin registro, sin ancla o ante la duda, la celda se queda.

import { ALERTA, ALERTA_HEREDADA, SEMAFORO } from './glifos.mjs'

// LAS MARCAS QUE PRODUCE UN GENERADOR Y QUE NADIE TIPEA AL ANOTAR AL MARGEN.
//
// Están las dos alertas —la vigente `▲` y la `⚠` que quedó publicada— y siguen los emoji de estado
// (🟡 ✅), que este módulo NO escribe: los lee. Son de la columna Z de "Compras".
//
// ═══ POR QUÉ ENTRA `△` Y NO ENTRA `○` (15/08) ═══
//
// El semáforo de esa columna dejó de escribirse con emoji. Si acá sólo quedaran los viejos, las filas
// que ya se reescribieron dejarían de reconocerse como generadas y su residuo se volvería INMORTAL:
// la guarda de borrado conservaría para siempre lo que el generador pide limpiar. Por eso el cambio
// de glifo y esta lista van en el mismo commit — separarlos rompe la guarda en silencio.
//
// De los cuatro estados sólo se agrega uno. `✓` (pagado) y `▲` (vencido) YA estaban. `△` (por
// vencer) reemplaza al `🟡`, que estaba: sin él se PIERDE reconocimiento. `○` (vigente) reemplaza al
// `🟢`, que NUNCA estuvo: agregarlo ensancharía qué celda puede borrar un generador, y ensanchar la
// guarda no es lo que este cambio viene a hacer. La lista queda exactamente tan ancha como estaba.
const MARCAS_DE_GENERADOR = new RegExp(`[${ALERTA}${ALERTA_HEREDADA}⇒‖§·✓🟡✅${SEMAFORO.porVencer}]`)

/**
 * LA MARCA CON LA QUE ARRANCA UNA CELDA PROPIA — deliberadamente MÁS ANGOSTA que la de arriba.
 *
 * `‖` y `§` no están: separan columnas y numeran adentro de un rótulo, no lo abren. Ensancharla acá
 * sería ampliar en silencio qué celda puede borrar el generador, y eso no es lo que este cambio viene
 * a hacer — lo único que se agrega es la alerta nueva al lado de la publicada, y el `△` del semáforo
 * al lado del `🟡` publicado, por el mismo motivo escrito arriba.
 */
const INICIA_MARCA = new RegExp(`^(?:✓|${ALERTA}|${ALERTA_HEREDADA}|${SEMAFORO.porVencer}|🟡|✅|⇒|·)`)

/**
 * NÚCLEO PURO: ¿la celda tiene una forma que sólo produce un generador? Un importe, una fecha, un
 * CUIT, un comprobante, un porcentaje, un rótulo de sección numerada, una marca de estado. NO un
 * texto libre.
 *
 * Vive acá —y no en `preservar-anotaciones.mjs`, de donde se movió— porque la guarda de borrado la
 * necesita y no puede depender de ese módulo: es él quien depende de la guarda. `preservar-anotaciones`
 * la re-exporta, así que no hay dos definiciones de "esto lo escribió un generador" dando vueltas.
 */
export function formaDeGenerador(v) {
  const t = String(v ?? '').trim()
  if (!t) return true
  if (t === '—') return true
  // Los tres centinelas de vacío declarado que circulan por la plomería (`::VACIO::` de la fusión,
  // `VACIO` de la guarda, `::MIA_Y_VACIA::` de la huella). Ninguno debería llegar nunca a una celda
  // del Sheet, pero si llegara es basura propia y hay que poder sacarla.
  if (/::VACIO::|::MIA_Y_VACIA::/.test(t) || t === 'VACIO') return true
  if (/^=/.test(t)) return true                                  // una fórmula la escribe el generador
  if (/^\$?\s*-?[\d.]+(,\d+)?$/.test(t)) return true             // importe / número es-AR
  if (/^-?\$[\d.]+(,\d+)?$/.test(t)) return true                  // moneda con signo
  if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(t)) return true         // fecha DD/MM/AAAA
  if (/^\d{2}-\d{8}-\d$/.test(t) || /^\d{11}$/.test(t)) return true // CUIT
  if (/^\d{3,5}-\d{6,8}$/.test(t)) return true                    // N° de comprobante
  if (/^\d+([.,]\d+)?\s*(d|días|%)$/i.test(t)) return true        // plazo / porcentaje
  if (/^\d+\s*(fac\.|comprobantes?)$/i.test(t)) return true       // "1 fac."
  if (/^\d+\s·\s/.test(t)) return true                           // "6 · LO QUE ARCA REGISTRÓ"
  if (INICIA_MARCA.test(t)) return true                           // marcas y viñetas del generador
  return false
}

/** Cómo se compara un texto contra el registro de rótulos: sin espacios de más, sin apóstrofo. */
const norm = (v) => String(v ?? '').replace(/^'/, '').trim()

/**
 * NÚCLEO PURO: ¿esta CELDA se puede probar del generador? (pregunta 2)
 *
 * Una celda vacía no es de nadie: devuelve `false` para que no cuente como evidencia ni como daño.
 */
export function celdaEsPropia(v, mios = new Set()) {
  const t = norm(v)
  if (!t) return false
  return mios.has(t) || formaDeGenerador(t)
}

/**
 * NÚCLEO PURO: ¿esta FILA es del generador? (pregunta 1)
 *
 * El ancla es un texto: un rótulo que el generador registró como propio, o un texto con una marca
 * tipográfica suya. Un número, un importe o una fecha NUNCA anclan — son justo lo que una tabla del
 * dueño tiene de sobra, y anclar con eso convertiría su planilla en territorio del generador.
 */
export function filaTieneAncla(fila = [], mios = new Set()) {
  for (const c of fila || []) {
    const t = norm(c)
    if (!t) continue
    if (mios.has(t)) return true
    if (MARCAS_DE_GENERADOR.test(t) && (t.match(/[a-záéíóúüñ]/gi) || []).length >= 3) return true
  }
  return false
}

/**
 * NÚCLEO PURO Y LA RESPUESTA COMPLETA: qué celdas de lo que HAY HOY en el destino se pueden vaciar.
 *
 * @param {any[][]} actual  lo que la guarda releyó en el destino (nunca lo que el llamador supone)
 * @param {Set<string>} mios los rótulos que el generador registró como suyos (`sheet_rotulos`)
 * @returns {{vaciables:Set<string>, ancladas:number, conservadas:{fila:number,col:number,valor:string}[]}}
 *          las claves de `vaciables` son "fila:col" 0-based dentro de `actual`
 */
export function residuosPropios(actual = [], mios = new Set()) {
  const vaciables = new Set()
  const conservadas = []
  let ancladas = 0
  actual.forEach((fila, i) => {
    if (!filaTieneAncla(fila, mios)) return
    ancladas++
    ;(fila || []).forEach((c, j) => {
      if (!norm(c)) return
      if (celdaEsPropia(c, mios)) vaciables.add(`${i}:${j}`)
      else conservadas.push({ fila: i, col: j, valor: String(c).slice(0, 60) })
    })
  })
  return { vaciables, ancladas, conservadas }
}
