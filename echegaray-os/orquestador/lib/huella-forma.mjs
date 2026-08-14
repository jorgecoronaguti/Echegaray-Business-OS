// LA FORMA DE UNA CELDA, Y EL VEREDICTO QUE NO NECESITA LA POSICIÓN.
//
// ═══ POR QUÉ SE PARTIÓ DE `huella-celda.mjs` (13/08) ═══
//
// El vocabulario de la forma —enmascarar lo variable para que un rótulo con la fecha de hoy no
// parezca una edición— vivía junto a la persistencia y a la decisión por coordenada. Se separó
// cuando hizo falta un SEGUNDO veredicto: el que decide cuando el mapa de coordenadas ya no sirve.
// Los dos usan la misma noción de forma y no puede haber dos definiciones de "la misma celda".
//
// ═══ EL AGUJERO QUE ESTE ARCHIVO CIERRA (13/08) ═══
//
// El dueño, otra vez y ya cansado: *"seguís sin respetar q si hay celdas con contenido q yo borro,
// no las vuelvas a escribir"*.
//
// La huella por celda decide con posición Y forma, y si las formas no caen donde el mapa dice, NO
// DECIDE: devuelve la grilla intacta y el generador reescribe todo. Falla ABIERTO. Medido hoy contra
// el archivo vivo, fracción de huellas que caen donde el mapa dice:
//
//     Cash Flow Semanal      0,47   ← el dueño lo nombró: "pasó en los dos cash flows"
//     Cash Flow Mensual      0,52
//     Recurrentes            0,59
//     _PRESUPUESTO_MENSUAL   0,37
//
// El umbral es 0,60: en esas cuatro pestañas la huella no decidió NUNCA. Y se puede probar que nunca
// decidió, porque `sheet_huella_celda` tiene 4.430 huellas del Cash Flow Semanal y **cero marcas de
// borrado**: no es que el dueño no borró nada ahí, es que el mecanismo no podía registrarlo. Todo lo
// que borraba volvía dos horas después.
//
// ═══ QUÉ SE PUEDE AFIRMAR SIN CREERLE AL MAPA ═══
//
// Cuando la posición no es confiable queda el anclaje que este repo ya declara como regla —al TEXTO,
// no al renglón—. La pregunta se reformula sin coordenadas:
//
//     escribí esta forma alguna vez  +  hoy NO está en NINGUNA parte de la pestaña
//     +  la celda donde iría está vacía                    →  la vaciaste vos  →  no la repongo
//
// Es la misma lógica que `respetar-ediciones.mjs` aplica a los rótulos, extendida a lo que aquella no
// puede ver: fórmulas e importes. Y no depende de que la pestaña haya conservado su geometría, que es
// exactamente lo que se rompe en un cuadro que crece una columna por semana.
//
// ═══ LOS TRES FRENOS, PORQUE ESTO VACÍA ═══
//
//   1. SÓLO FORMAS DISTINTIVAS. `<$>` es la forma de CUALQUIER importe: si contara, un número que el
//      dueño no borró bastaría para dejar de escribir otro. Ver `esDistintiva`.
//   2. LA PESTAÑA TIENE QUE TENER CONTENIDO. Una lectura transitoria que devuelve poco se lee como
//      "borraste todo". Sin un piso de formas presentes, no se decide nada.
//   3. UN TECHO POR CORRIDA para los borrados NUEVOS. Un rediseño del propio generador puede dejar
//      muchas formas huérfanas de golpe; una persona borra de a poco. Por encima del techo no se
//      aplica ninguno de los nuevos y se dice en voz alta. Los YA CONFIRMADOS no tienen techo: ésos
//      son una decisión probada del dueño y no se revisan cada corrida.

import { VACIO } from './preservar-anotaciones.mjs'
import { MIA_PROBADA } from './no-borrar.mjs'
import { ALERTA, ALERTA_HEREDADA } from './glifos.mjs'

/** Cuántas formas tiene que haber HOY en la pestaña para creerle a la lectura. */
export const MIN_FORMAS_PRESENTES = 8
/**
 * HASTA DÓNDE SE GUARDA UNA FORMA — y por lo tanto hasta dónde se puede comparar.
 *
 * ═══ LA CAUSA RAÍZ DE LA DESALINEACIÓN DE LOS DOS CASH FLOW (13/08) ═══
 *
 * `huellasDeEscritura` sella `forma.slice(0, 300)` y la comparación usaba la forma ENTERA. Una
 * fórmula de más de 300 caracteres —el Cash Flow Semanal está hecho de ésas— por lo tanto **nunca
 * coincide consigo misma**. Medido sobre el archivo vivo:
 *
 *     sellado  "=sumproduct(isnumber(_movimientos!$a$#:$a)*(_movimientos!$a$#:$a>=$n$#"   ← cortado
 *     hoy      "=SUMPRODUCT(ISNUMBER('_MOVIMIENTOS'!$A$2:$A)*('_MOVIMIENTOS'!$A$2:$A>=…"  ← entera
 *
 * De ahí salían los 2.268 "borrados" del Cash Flow Semanal que el dueño nunca hizo, y de ahí salía la
 * alineación 0,47 que dejaba a la huella sin decidir NUNCA en esa pestaña. El truncado ya estaba
 * aplicado en UNO de los tres caminos de comparación (el de la limpieza del propio residuo) y faltaba
 * en los otros dos: media cura no cura.
 *
 * Va dentro de `formaComparable` por el mismo motivo que el apóstrofo: son miles de huellas ya
 * guardadas, y exigir una migración para que la regla vuelva a funcionar sería dejar el agujero
 * abierto hasta que alguien corra un script.
 */
export const LARGO_FORMA = 300
/**
 * Hasta dónde se COMPARA, que es menos de lo que se guarda, y el margen no es arbitrario.
 *
 * Las huellas ya selladas se cortaron a 300 CON los apóstrofos adentro; al normalizarlas quedan más
 * cortas que una forma de hoy cortada a 300 SIN ellos, así que los dos textos terminarían en puntos
 * distintos y volverían a no coincidir — la misma trampa un nivel más abajo. Comparando hasta 260 los
 * dos lados caen siempre dentro de la parte que las dos versiones tienen completa.
 */
export const LARGO_CLAVE = 260
/** Cuántos borrados NUEVOS (todavía sin confirmar) se aceptan en una corrida sin mapa de posición. */
export const TOPE_BORRADOS_NUEVOS = 40

/**
 * LA FORMA DE UNA CELDA: su contenido con cada parte variable enmascarada.
 *
 * Es el corazón de la inmunidad al contenido variable. Una fecha, un importe, un porcentaje y un
 * contador se reemplazan por su marca; el resto se normaliza (sin apóstrofo inicial, espacios
 * colapsados, minúsculas). Dos textos "iguales salvo el día" dan la misma forma.
 *
 * Una celda vacía —o el centinela VACIO, que significa "es mía y va vacía"— no tiene forma: devuelve
 * cadena vacía. Ese es el estado que distingue "borrada" de todo lo demás.
 */
export function formaDe(v) {
  if (v === undefined || v === null) return ''
  let s = String(v).replace(/^'/, '').trim()
  // Los DOS centinelas no tienen forma: ninguno es contenido. `MIA_PROBADA` además nunca puede dejar
  // huella — si la dejara, la corrida siguiente encontraría "huella propia sobre celda vacía" y
  // marcaría como borrada por el dueño una celda que limpié yo.
  if (!s || s === VACIO.trim() || s === VACIO || s === MIA_PROBADA) return ''
  // Una fórmula se enmascara por sus números: así `=SUMA(B4:B9)` y `=SUMA(B5:B10)` —la misma fórmula
  // después de insertar una fila— comparten forma y el corrimiento no se lee como una edición.
  // Y SIN APÓSTROFOS: ver `formaComparable`, la razón por la que la huella no decidía en los dos
  // Cash Flow. Se saca acá además de en la comparación para que las huellas nuevas nazcan limpias.
  if (s.startsWith('=')) return formaComparable(`=${s.slice(1).replace(/\d+/g, '#').toLowerCase()}`)
  s = s
    .replace(/\d{4}-\d{2}(-\d{2})?/g, '<F>')                       // 2026-08-04 · 2026-08
    .replace(/\d{1,2}[/-]\d{1,2}([/-]\d{2,4})?/g, '<F>')           // 4/8/2026 · 4-8
    .replace(/\b(ene|feb|mar|abr|may|jun|jul|ago|sep|set|oct|nov|dic)[a-z]*[-/ ]\d{2,4}\b/gi, '<F>')
    .replace(/-?\$\s?[\d.]+(,\d+)?/g, '<$>')                       // -$1.234,56
    .replace(/-?[\d.]+(,\d+)?\s?%/g, '<%>')                        // 12,5%
    .replace(/-?\b\d[\d.]*(,\d+)?\b/g, '<N>')                      // 1.234,56 · 7
  return s.replace(/\s+/g, ' ').trim().toLowerCase()
}

/**
 * LA FORMA, COMO SE COMPARA — sin los apóstrofos que Google agrega por su cuenta.
 *
 * ═══ POR QUÉ EXISTE, Y POR QUÉ ERA EL AGUJERO MÁS GRANDE (13/08) ═══
 *
 * La huella se sella con lo que el generador MANDÓ. Google guarda otra cosa: al nombre de una pestaña
 * que arranca con `_` le pone comillas. El generador escribe `_MOVIMIENTOS!$A$2:$A` y la pestaña
 * devuelve `'_MOVIMIENTOS'!$A$2:$A`. Misma fórmula, forma distinta.
 *
 * SE NORMALIZAN LOS DOS LADOS AL COMPARAR, no sólo el nuevo: las miles de huellas ya guardadas se
 * escribieron sin apóstrofo, y exigir una migración para que la regla vuelva a funcionar sería dejar
 * el agujero abierto hasta que alguien corra un script.
 *
 * El costo: dos fórmulas que sólo difieren en un apóstrofo comparten forma. Son la misma fórmula.
 *
 * Y SE TRUNCA A `LARGO_CLAVE`. Ver esa constante y `LARGO_FORMA`: sin el truncado, una fórmula larga
 * no coincidía ni consigo misma, y con el truncado en el largo equivocado tampoco. El apóstrofo se
 * saca ANTES de cortar, nunca después.
 */
export const formaComparable = (f) => String(f ?? '').replace(/'/g, '').slice(0, LARGO_CLAVE)

/** ¿El generador quiere ESCRIBIR esta celda? El centinela VACIO cuenta: es una orden de limpiar. */
export function quiereEscribir(v) {
  return v === VACIO || formaDe(v) !== ''
}

/** ¿La celda TIENE algo? Es la única pregunta que decide "borrada": la contesta la lectura FORMULA. */
export const hayContenido = (v) => formaDe(v) !== ''

/**
 * LAS MARCAS QUE NADIE TIPEA AL ANOTAR AL MARGEN — la prueba de que una celda la escribió el OS.
 *
 * Están LAS DOS alertas: la vigente (`▲`) y la que quedó publicada en ~1.060 celdas (`⚠`). Si esta
 * lista se quedara sólo con la nueva, cada rótulo ya publicado dejaría de ser "mío", su borrado no se
 * sellaría, y la corrida siguiente lo repondría — el reclamo del dueño, causado por el arreglo. Y si
 * se quedara sólo con la vieja, lo mismo pero al revés y para siempre. Ver `ALERTA_HEREDADA`.
 *
 * Vive acá y `huella-celda` la importa: eran dos copias del mismo criterio de propiedad y una sola
 * puede quedarse atrás.
 */
export const MARCAS_TIPOGRAFICAS = new RegExp(`[${ALERTA}${ALERTA_HEREDADA}⇒‖§·—]`)

export const claveCelda = (fila, col) => `${fila}:${col}`

/**
 * ¿ESTA FORMA PUEDE SER EVIDENCIA DE UN BORRADO, SIN AYUDA DE LA POSICIÓN?
 *
 * Sólo si es lo bastante singular como para que su ausencia signifique algo. Las que quedan afuera y
 * por qué:
 *
 *   · lo puramente enmascarado (`<$>`, `<n>`, `<f>`, `<%>` y sus mezclas) — es la forma de CUALQUIER
 *     importe, contador o fecha del archivo. Un cuadro tiene cientos: usarla como prueba haría que un
 *     número presente en otra fila "explique" la ausencia de otro, o peor, que su ausencia real
 *     apagara una columna entera de importes.
 *   · el texto corto sin marca — "total", "iva", "saldo". El mismo rechazo que ya se le hizo a
 *     `formasDeTextoPropio`: son palabras que una persona tipea al anotar.
 *
 * Adentro quedan las fórmulas (nadie tipea `=sumproduct(...)` a mano dos veces igual) y el texto
 * largo o con una marca tipográfica del generador. Es el mismo criterio de propiedad que el resto
 * del repo, no uno nuevo.
 */
export function esDistintiva(forma) {
  const f = String(forma ?? '').trim()
  if (!f) return false
  if (f.startsWith('=')) return true
  if ((f.match(/[a-záéíóúüñ]/g) || []).length < 3) return false
  return MARCAS_TIPOGRAFICAS.test(f) || f.length >= 23
}

/** Las formas que hay HOY en la pestaña, en cualquier posición. Es el conjunto contra el que se juzga. */
export function formasPresentes(actual = []) {
  const out = new Set()
  for (const f of actual || []) {
    for (const c of f || []) {
      const forma = formaComparable(formaDe(c))
      if (forma) out.add(forma)
    }
  }
  return out
}

/**
 * NÚCLEO PURO: qué formas selladas por el OS ya NO están en la pestaña — o sea, las que el dueño
 * borró — separadas en confirmadas (ya marcadas en la base) y nuevas (detectadas en esta corrida).
 *
 * @param {Map<string,{forma:string,borrada:boolean}>} huellas el mapa sellado, por coordenada
 * @param {Set<string>} presentes las formas que la pestaña tiene hoy
 * @returns {{confirmadas:Set<string>, nuevas:Set<string>}}
 */
export function formasAusentes(huellas = new Map(), presentes = new Set()) {
  const confirmadas = new Set()
  const nuevas = new Set()
  for (const h of huellas.values()) {
    const forma = formaComparable(h.forma)
    if (!forma || presentes.has(forma)) continue
    if (h.borrada) { confirmadas.add(forma); continue }
    if (esDistintiva(forma)) nuevas.add(forma)
  }
  // Una forma confirmada nunca es "nueva" también: la decisión ya está tomada y no paga el techo.
  for (const f of confirmadas) nuevas.delete(f)
  return { confirmadas, nuevas }
}

/**
 * NÚCLEO PURO Y LA RESPUESTA COMPLETA: la grilla del generador con las celdas que el dueño vació
 * puestas en `''` —que `fusionar()` lee como "no es mi celda, dejá lo que hay"— cuando el mapa de
 * coordenadas no se puede usar.
 *
 * NO limpia nada: `''` nunca borra. Sólo deja de reponer. La celda queda como el dueño la dejó.
 *
 * @param {any[][]} generado lo que el generador quiere escribir
 * @param {any[][]} actual   el mismo rectángulo leído con render FORMULA
 * @param {Map} huellas      el mapa sellado (se usa por su FORMA, nunca por su coordenada)
 * @param {{fila0?:number, col0?:number}} opts sólo para nombrar las celdas en el resultado
 * @returns {{grid:any[][], suprimidas:Array, motivo:string}}
 */
export function noReponerAusentes(generado = [], actual = [], huellas = new Map(), { fila0 = 1, col0 = 0 } = {}) {
  const suprimidas = []
  const quieto = (motivo) => ({ grid: generado, suprimidas: [], motivo })
  if (!huellas.size) return quieto('sin huella previa: no hay nada que pueda probarse borrado')
  const presentes = formasPresentes(actual)
  // FRENO 2: una pestaña que hoy casi no tiene formas no es una pestaña vaciada, es una lectura que
  // no llegó. Decidir sobre eso convertiría un 429 en un borrado masivo permanente.
  if (presentes.size < MIN_FORMAS_PRESENTES) {
    return quieto(`la pestaña devolvió sólo ${presentes.size} forma(s): no alcanza para juzgar qué falta`)
  }
  const { confirmadas, nuevas } = formasAusentes(huellas, presentes)
  if (!confirmadas.size && !nuevas.size) return quieto('todas mis formas siguen en la pestaña')

  const marcar = (usarNuevas) => {
    const out = []
    const grid = generado.map((f, i) => (f || []).map((c, j) => {
      const forma = formaComparable(formaDe(c))
      if (!forma) return c
      const yaConfirmada = confirmadas.has(forma)
      if (!yaConfirmada && !(usarNuevas && nuevas.has(forma))) return c
      // ═══ ACÁ NO SE PREGUNTA POR LA CELDA DE DESTINO, Y ES A PROPÓSITO ═══
      //
      // La primera versión exigía además que la celda donde iría estuviera vacía hoy. Suena prudente y
      // es exactamente el error: este veredicto existe para la pestaña CORRIDA —la que no alinea— y ahí
      // la celda que el dueño vació no es la que le toca a este renglón. Con esa condición el caso para
      // el que se escribió esto no se cumplía nunca (probado: 0 supresiones sobre un bloque corrido 9
      // filas), que es el mismo silencio del defecto original.
      //
      // No hace falta preguntar: si la forma NO está en ninguna parte de la pestaña, la celda de
      // destino tampoco la tiene. Y devolver `''` no borra —`fusionar()` lo lee como "no es mi celda"—
      // así que lo que haya ahí, sea del dueño o mío, se conserva intacto.
      out.push({
        fila: fila0 + i, col: col0 + j, filaHoy: fila0 + i, colHoy: col0 + j,
        forma, huella: '', confirmada: yaConfirmada, mio: String(c).slice(0, 60),
      })
      return ''
    }))
    return { grid, out }
  }

  // FRENO 3: el techo se mide sobre los borrados NUEVOS, contándolos sobre la grilla real (una misma
  // forma puede caer en varias celdas). Si se pasa, se aplican SÓLO los confirmados.
  let r = marcar(true)
  const nuevosAplicados = r.out.filter((s) => !s.confirmada).length
  let motivo = `${r.out.length} celda(s) que vaciaste y no repongo`
  if (nuevosAplicados > TOPE_BORRADOS_NUEVOS) {
    r = marcar(false)
    motivo = `${nuevosAplicados} formas mías desaparecieron de golpe (el techo es ${TOPE_BORRADOS_NUEVOS}): `
      + 'eso no parece que las hayas borrado una por una sino un cambio de layout. No decido sobre las nuevas.'
  }
  suprimidas.push(...r.out)
  return { grid: r.grid, suprimidas, motivo }
}
