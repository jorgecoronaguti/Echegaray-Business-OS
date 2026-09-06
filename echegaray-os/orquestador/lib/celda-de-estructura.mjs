// LA ESTRUCTURA DE UNA PESTAÑA NO LA BORRA NADIE A PROPÓSITO.
//
// ═══ EL DEFECTO MEDIDO EL 04/09/2026 ═══
//
// `huella-celda.mjs` protege lo que el dueño borra: si tiene huella propia de una celda y hoy esa
// celda está vacía, no la resucita («la vaciaste vos»). Es la regla correcta.
//
// Falla cuando el GENERADOR cambia el layout. «Impuestos y Financieros» pasó de 105 filas a 68 y las
// huellas quedaron apuntando a coordenadas donde hoy no hay nada, así que el generador se negó a
// escribir —entre otras— `A23` («Concepto», el encabezado del cuadro de IIBB) y `A42` («⇒ Total
// otros impuestos»). El resultado es visible y lo cuenta el auditor de patrón: dos filas con
// importes y sin nada en la columna A que diga qué son.
//
// ═══ POR QUÉ ESTE SEGURO Y NO INVALIDAR LAS HUELLAS DE CELDA ═══
//
// Las huellas de celda son lo único que impide resucitar un dato que el dueño borró a mano. Tirarlas
// enteras ante un cambio de layout sería desarmar esa protección justo cuando más se mueve la
// pestaña. Se recorta al mínimo: SÓLO se ignora la supresión cuando lo que el generador quiere
// escribir es ESTRUCTURA —el título de una sección, el encabezado de una tabla, la fila de un total—.
//
// El criterio no es nuevo: `respetar-ediciones.mjs` ya lo estableció el 23/07 con la misma razón
// escrita («hay borrados que nadie pide … si desaparecieron, el que falló fui yo»), y se le comió el
// subtítulo de esta misma pestaña antes de tenerlo. Acá se reusa esa función y se le suma el
// encabezado de tabla, que es la clase que faltaba: nadie borra la palabra «Concepto» de un cuadro y
// deja los doce importes debajo.
//
// Un IMPORTE, un texto libre y una nota siguen protegidos: si el dueño los borra, siguen borrados.

import { esEstructural } from './respetar-ediciones.mjs'
import { ES_ENCABEZADO } from './patron-pestana.mjs'

/**
 * NÚCLEO PURO: ¿el RÓTULO de una fila la declara estructural?
 * Es el título de una sección, el encabezado de una tabla o la fila de un total.
 */
export function esRotuloDeEstructura(v) {
  if (typeof v !== 'string') return false
  const t = v.trim()
  if (!t || t.startsWith('=')) return false
  if (esEstructural(t)) return true
  // Un encabezado de tabla ocupa su fila con los nombres de las columnas; la palabra que abre la
  // columna A es la dimensión del cuadro («Concepto», «Período», «Proveedor»). Se compara contra el
  // patrón que la piel ya usa para dibujarlos, así que hay una sola definición.
  return ES_ENCABEZADO.test(t)
}

/**
 * NÚCLEO PURO: ¿esta celda es estructura de la pestaña, y por lo tanto su ausencia es un movimiento
 * mío y no un borrado del dueño?
 *
 * SE MIRA LA FILA ENTERA, NO LA CELDA SUELTA (04/09/2026). El primer intento sólo reconocía la
 * columna A, y el defecto siguió a la vista: se escribía «Concepto» en A23 pero no `'ene-26` en B23,
 * y «⇒ Total otros impuestos» en A42 pero no su `=SUM(B40:B41)` en B42. El auditor de patrón las
 * siguió contando —"tiene valores pero ni la columna A ni la B dicen qué son"— porque media fila de
 * encabezado no es un encabezado. Los doce meses de una fila de encabezado son tan estructura como
 * la palabra que la abre, y las doce sumas de una fila de total, tan estructura como su rótulo.
 *
 * @param {unknown} v lo que el generador quiere escribir en la celda
 * @param {unknown[]} [fila] la fila entera que se está escribiendo; su columna A decide
 * @returns {boolean}
 */
export function esCeldaDeEstructura(v, fila = null) {
  if (v === null || v === undefined || String(v).trim() === '') return false
  if (esRotuloDeEstructura(v)) return true
  return Array.isArray(fila) ? esRotuloDeEstructura(fila[0]) : false
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// UN CONTROL PUBLICADO NO SE PARTE POR LA MITAD
// ══════════════════════════════════════════════════════════════════════════════════════════════════
//
// ═══ EL DEFECTO MEDIDO EL 06/09/2026, CON LA BASE Y EL ARCHIVO VIVO AL LADO ═══
//
// `Estructura!B28` y `Recurrentes!B24` publican «⇒ Cobertura fiscal de esta pestaña» con la fórmula
// entera —`=IF(B25=0;"";B26/B25)`— y B25/B26 VACÍAS: devuelven `""` pase lo que pase. `Recurrentes!B14`
// («⇒ Diferencia — un proveedor del rubro que el cuadro no lista») igual, con B12/B13 vacías. Y
// `Estructura!B19` es peor todavía: su `=ROUND($B18-$N15;0)` con B18 vacía publica el total del cuadro
// EN ROJO como si faltara todo. Tres controles que no pueden dar rojo y uno que da rojo siempre.
//
// LA CAUSA, probada en `sheet_huella_celda`: 15 celdas de Estructura marcadas `borrada_en` en UN
// instante (13/08 15:13) y 19 de Recurrentes en otro (13/08 19:30) — el día que `control-arca-bloque`
// les cambió la forma al bloque. Son exactamente las celdas de sus dos cuadros de control, ni una del
// resto de la pestaña. `Materiales`, que corre el MISMO bloque y no se movió ese día, tiene cero
// marcas y publica su cobertura sin problema.
//
// Nadie vacía diecinueve celdas de dos cuadros de control en un instante y deja los `⇒` en pie. El
// generador movió su bloque, la huella leyó el hueco como «lo vaciaste vos», y la marca es
// PERMANENTE: se sale de ella sólo si la celda vuelve a tener contenido, y el generador dejó de
// escribirla justamente porque la marca se lo prohíbe. Lazo cerrado, desde hace tres semanas.
//
// El seguro de alineación (15/08) no alcanza: la pestaña ALINEA —281 de 293 celdas caen donde el mapa
// dice— porque el cuadro de arriba, que es casi toda la pestaña, no se movió. Se mueve un bloque, no
// la pestaña. Y `esCeldaDeEstructura` (04/09) rescata sólo el `⇒` y el `N ·`, que es la razón exacta
// por la que hoy sobrevive el rótulo del control y no sus insumos.
//
// ═══ POR QUÉ SE DECLARA Y NO SE ADIVINA ═══
//
// Un heurístico de texto no puede saber que B25 es el insumo de B28: son un rótulo y una fórmula como
// cualquier otra. Quien SÍ lo sabe es el generador que emite el bloque — ahí está escrito que esas
// nueve filas son una sola idea. La declaración viaja desde el generador hasta la huella y no se
// deduce de la pantalla.
//
// ═══ EL COSTO, DECLARADO ═══
//
// Dentro de un bloque declarado, un borrado a mano del dueño VUELVE en la corrida siguiente. Es
// deliberado y es el lado correcto para equivocarse: media fila de un control es una afirmación falsa
// («acá se está mirando») y eso vale más que la molestia de que una línea reaparezca. La salida sigue
// existiendo y es la de siempre — candar la pestaña (`pestana-bloqueada.mjs`), que frena a TODOS los
// escritores, no sólo a éste. Se declara el CUADRO DE CONTROL, nunca el cuerpo de datos: ahí es donde
// el dueño anota, y ahí la huella sigue mandando entera.

/**
 * NÚCLEO PURO: ¿esta fila cae dentro de un bloque que el generador declaró indivisible?
 *
 * @param {number} fila fila de la PESTAÑA (1-based), la de hoy — no la del mapa de huellas
 * @param {Array<{desde:number, hasta:number}>} bloques rangos inclusivos declarados por el generador
 * @returns {boolean}
 */
export function enBloqueIndivisible(fila, bloques = []) {
  if (!Number.isFinite(fila) || !Array.isArray(bloques)) return false
  return bloques.some((b) => Number.isFinite(b?.desde) && Number.isFinite(b?.hasta) && fila >= b.desde && fila <= b.hasta)
}
