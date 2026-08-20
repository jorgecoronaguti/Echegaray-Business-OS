// UN SEMÁFORO NO SE ARREGLA CON UNA SOLA ALERTA.
//
// ═══ EL DEFECTO (15/08) ═══
//
// `Cobranzas!V` publica el estado de cada cobro con cinco marcas: `✅ Cobrado`, `🔴 Vencido`,
// `🟠 Por vencer`, `🟢 Vigente` y `🔵 Proyectado`. Las cinco son emoji, y el exportador no las embebe
// (ver la cabecera de `glifos.mjs`): en el PDF —que es lo que el dueño mira y con lo que se imparte
// una reunión— la columna se lee "Cobrado", "Vencido", "Por vencer", "Vigente", "Proyectado", sin
// una sola marca. 91 celdas medidas por `auditar-pantalla` como `glifo_invisible`.
//
// ═══ POR QUÉ NO ALCANZA CON `ALERTA` ═══
//
// `ALERTA` (`▲`) responde una pregunta binaria: "mirá acá". Esto es una ESCALA de cinco estados, y
// mapear los cinco a `▲` los colapsa en uno: la columna diría `▲ Cobrado` y `▲ Vencido` con la misma
// marca, o sea ninguna información. Peor que perder el glifo, porque el que quedaría grita en la fila
// que ya está cobrada.
//
// ═══ LA ESCALA, Y POR QUÉ CADA GLIFO ES EL QUE ES ═══
//
// En el PDF también se pierde el COLOR que traía el emoji, así que el glifo tiene que cargar solo el
// orden de urgencia. Están elegidos por peso visual decreciente, todos dentro del vocabulario ya
// verificado dibujándose en este archivo (`⇒ ↳ ⊘ ✓ ✗ ▲ ·`):
//
//   ▲ Vencido      la alerta del archivo — es la única fila que exige una acción hoy. Es `ALERTA`,
//                  importada y no tipeada, para que el día que cambie la señal cambie también acá.
//   ⇒ Por vencer   apunta hacia adelante: viene en los próximos 7 días. Pesa menos que el triángulo
//                  y más que el resto, que es exactamente su lugar en la escala.
//   ✓ Cobrado      cerrado, sin nada que hacer. Es la marca de aprobación que ya usa el archivo.
//   · Vigente      el estado por defecto: no hay nada que mirar. El punto ocupa el lugar de la marca
//                  sin llamar la atención — sacarlo directamente desalinearía la columna y haría que
//                  "Vigente" se leyera como un rótulo y no como un estado más de la escala.
//   ⊘ Proyectado   todavía no es un derecho de cobro. `⊘` es el glifo con el que este archivo dice
//                  "esto no cuenta acá" ("⊘ No incluye…" en Jornales por Quincena).
//
// ═══ ESTO NO DEFINE EL SEMÁFORO: LO TRADUCE ═══
//
// Quién decide que un cobro está "Por vencer" a 7 días es la fórmula que el dueño escribió en la
// planilla, y sigue siendo suya. Acá sólo vive la correspondencia glifo publicado → glifo que se
// dibuja, que es un problema del exportador y no del negocio. Por eso el reemplazo es TEXTUAL y no
// regenera nada: si el dueño cambia el umbral de 7 días o agrega un estado, lo suyo sobrevive.

import { ALERTA, ALERTA_HEREDADA, glifosInvisibles } from './glifos.mjs'

/**
 * EL GLIFO PUBLICADO → EL QUE SE DIBUJA. Cinco entradas, una por estado del semáforo.
 *
 * Las claves son los emoji tal cual están hoy en la planilla. `✅` lleva además su forma con selector
 * de variación (U+FE0F): las dos se ven idénticas y una comparación exacta contra la otra falla.
 */
export const SEMAFORO = Object.freeze({
  '🔴': ALERTA,   // vencido: hay que hacer algo hoy
  '🟠': '⇒',      // por vencer: viene en los próximos días
  '✅': '✓',      // cobrado: cerrado
  '🟢': '·',      // vigente: nada que mirar
  '🔵': '⊘',      // proyectado: todavía no es un derecho de cobro
})

/**
 * NÚCLEO PURO: el texto con los glifos del semáforo reemplazados por los que sí se dibujan.
 *
 * Sirve igual para un valor de celda que para una fórmula: reemplaza CARACTERES, no celdas, así que
 * `=IF(...;"🔴 Vencido";...)` sale `=IF(...;"▲ Vencido";...)` con todo lo demás intacto —incluidos
 * los umbrales, los rangos y cualquier cosa que el dueño haya cambiado.
 *
 * Saca también el selector de variación (U+FE0F), que es invisible, no se dibuja y hace fallar una
 * igualdad exacta entre dos textos idénticos a la vista.
 *
 * IDEMPOTENTE a propósito: ningún valor del mapa es una clave, así que correrlo dos veces da lo
 * mismo que correrlo una. Es la condición para que un script de una sola pasada se pueda repetir sin
 * miedo.
 *
 * @param {unknown} texto
 * @returns {string}
 */
export function aGlifosQueDibujan(texto) {
  let s = String(texto ?? '').replaceAll('\uFE0F', '')
  for (const [emoji, glifo] of Object.entries(SEMAFORO)) s = s.replaceAll(emoji, glifo)
  // `⚠` no es del semáforo —es la alerta binaria que quedó publicada antes del cambio a `▲`— pero
  // vive en las mismas celdas y se pierde en el mismo PDF. Traducirla acá evita que un texto quede
  // medio arreglado: `glifos.mjs` ya declara que las dos son la misma marca.
  return s.replaceAll(ALERTA_HEREDADA, ALERTA)
}

/**
 * NÚCLEO PURO: los glifos que se van a perder y para los que NO hay traducción.
 *
 * Es lo que impide que el reparador afirme haber arreglado una celda que sigue rota. Un emoji que
 * nadie mapeó no se inventa un reemplazo: se nombra, y lo decide una persona.
 *
 * @param {unknown} texto
 * @returns {string[]} los distintos, en orden de aparición
 */
export function sinTraduccion(texto) {
  return glifosInvisibles(aGlifosQueDibujan(texto))
}

/**
 * NÚCLEO PURO: ¿este texto cambia al traducirlo? Distingue "hay que escribir" de "ya está bien".
 *
 * @param {unknown} texto
 */
export function necesitaTraduccion(texto) {
  const s = String(texto ?? '')
  return aGlifosQueDibujan(s) !== s
}
