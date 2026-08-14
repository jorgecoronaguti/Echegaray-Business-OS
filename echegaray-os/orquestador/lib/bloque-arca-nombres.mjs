import { ARCA } from './rangos-nombrados.mjs'
import { ALERTA } from './glifos.mjs'

// EL BLOQUE DE COBERTURA DE ARCA: SUS RÓTULOS Y LOS NOMBRES QUE CUELGAN DE CADA LÍNEA.
//
// ═══ POR QUÉ VIVE ACÁ Y NO EN EL GENERADOR (13/08) ═══
//
// Los rótulos estaban escritos DOS VECES en `proveedores-materiales-pestana.mjs`: una donde se arma
// la grilla y otra, seiscientas líneas más abajo, donde se buscan las filas para reapuntar los doce
// rangos con nombre. Dos copias del mismo literal divergen, y divergieron: la pestaña viva decía
// "· cargados SIN su N° de comprobante" y el buscador preguntaba por "· cargados sin su N° de
// comprobante". `startsWith` distingue mayúsculas, así que esa línea "no aparecía en la pestaña
// escrita" y sus dos nombres —ARCA_SIN_NUMERO_N y ARCA_SIN_NUMERO_MONTO— se quedaron donde estaban:
// apuntando a la fila 129, que hoy tiene un CUIT y un número de comprobante.
//
// Un rótulo es un CONTRATO entre quien escribe la fila y quien la busca. Con una sola constante, el
// día que alguien reescriba el texto se mueven los dos lados juntos y no hay nada que desincronizar.

/** La cabecera del bloque. Es el ANCLA: las seis líneas van inmediatamente debajo de ella. */
export const CABECERA_ARCA = 'Cobertura del libro de IVA de ARCA'

/**
 * Las seis líneas del bloque, EN EL ORDEN EN QUE SE ESCRIBEN.
 *
 * `texto` es literalmente lo que va en la columna A —sangría incluida: las cuatro líneas de detalle
 * cuelgan de la primera y la sangría es lo que lo muestra—. La búsqueda compara sin espacios de los
 * bordes, así que la sangría se puede cambiar sin romper el reapuntado.
 */
export const LINEAS_ARCA = Object.freeze([
  { texto: 'Comprobantes de compra (neto de notas)', n: ARCA.comprobantes, monto: ARCA.total },
  { texto: '  · notas de crédito (restan)', n: ARCA.notasN, monto: ARCA.notasMonto },
  { texto: '  · cargados en Compras, por N° de comprobante', n: ARCA.enComprasN, monto: ARCA.enComprasMonto },
  { texto: '  · cargados sin su N° de comprobante', n: ARCA.sinNumeroN, monto: ARCA.sinNumeroMonto },
  { texto: `  · ${ALERTA} sin cargar en Compras`, n: ARCA.faltanN, monto: ARCA.faltanMonto, publica: true },
  { texto: 'Comprobantes emitidos (ventas)', n: ARCA.ventasN, monto: ARCA.ventasMonto },
].map(Object.freeze))

// ═══ DIEZ DE LOS DOCE NOMBRES NO LOS LEÍA NADIE (14/08/2026) ═══
//
// MEDIDO SOBRE EL ARCHIVO VIVO, recorriendo TODAS las fórmulas de las 30 pestañas y preguntando por
// cada nombre con límites de palabra propios (`usaNombre`, lib/rangos-con-nombre.mjs):
//
//   ARCA_FALTAN_MONTO   → 2 citas: Materiales!B53 · Proveedores!G11
//   ARCA_FALTAN_N       → 1 cita:  Proveedores!H11
//   los otros DIEZ      → NINGUNA
//
// El comentario de `lib/rangos-nombrados.mjs` sigue diciendo que existen porque "el Cash Flow los
// referencia en vez de copiarlos", y el de la línea de ventas que ARCA_VENTAS_* "consume el Cash Flow
// Mensual por rango con nombre". Era cierto y dejó de serlo: el Mensual se rehizo como matriz el
// 06/08 y no cita ni uno. Un comentario que sobrevive a su motivo es la misma clase de fósil que el
// rango que describe — por eso la lista de arriba se mide contra el archivo, no se recuerda.
//
// LO QUE SE PIERDE Y LO QUE NO. Las seis líneas se siguen ESCRIBIENDO en la pestaña: el dueño las lee
// ahí, con sus cifras, igual que ayer. Lo único que se retira es el nombre — la puerta por la que
// otra pestaña podía leer esa celda sin decir de dónde la saca. Si mañana hace falta publicar una,
// se le vuelve a poner `publica: true` a su línea y el generador la reapunta en la corrida siguiente.
//
// POR QUÉ RETIRARLOS Y NO SIMPLEMENTE REAPUNTARLOS. Los doce vivían sobre `Proveedores!B124:C129`,
// que hoy son la tabla de comprobantes faltantes: once de los doce publicaban un CUIT o un número de
// comprobante bajo un nombre que promete un contador o un importe. Diez anclas que hay que volver a
// clavar cada dos horas, que ninguna fórmula usa y que en cada rediseño de la pestaña vuelven a caer
// sobre lo que quede en esa fila. El auditor de este repo ya lo tiene escrito: un huérfano "no hace
// daño todavía; es exactamente cómo nace un ciego".

/** Los nombres que este bloque publica y mantiene apuntados. Sale de `publica`, una sola fuente. */
export const NOMBRES_ARCA = Object.freeze(LINEAS_ARCA.filter((l) => l.publica).flatMap((l) => [l.n, l.monto]))

/**
 * Los que el bloque DEJÓ de publicar y hay que borrar del archivo.
 *
 * No alcanza con no reapuntarlos: el que ya está publicado se queda donde esté —hoy, sobre un CUIT—
 * hasta que alguien lo borre. Se emite el `deleteNamedRange` en cada corrida; los que ya no existen
 * se descartan solos (ver `retirar` en lib/rangos-nombrados.mjs), así que es idempotente.
 */
export const NOMBRES_ARCA_RETIRADOS = Object.freeze(
  LINEAS_ARCA.filter((l) => !l.publica).flatMap((l) => [l.n, l.monto]),
)

/** B es SIEMPRE cuántos y C es SIEMPRE plata. Lo declara el formato del bloque; acá se lo respeta. */
const COL_N = 2
const COL_MONTO = 3

// El bloque son seis filas contiguas debajo de su cabecera. Se busca en una ventana un poco más
// ancha —por si mañana se intercala una línea— pero ACOTADA: veinte filas más abajo empieza la lista
// de comprobantes faltantes, y un nombre que resuelve a esa lista es exactamente el defecto del
// 05/08. Sin techo, "el que aparezca" vuelve a poder ser cualquiera.
const VENTANA = LINEAS_ARCA.length + 3

const rotulo = (fila) => String(fila?.[0] ?? '').trim()

/**
 * NÚCLEO PURO: a qué fila REAL de la pestaña apunta cada nombre, según LA GRILLA QUE SE ACABA DE
 * ESCRIBIR.
 *
 * ═══ POR QUÉ NO SE RELEE LA PESTAÑA (13/08) ═══
 *
 * La versión anterior leía `Proveedores!A1:A400` y se quedaba con la ÚLTIMA fila cuyo texto empezaba
 * con el rótulo. En el archivo vivo hay TRES copias del bloque —una fósil en la 126, la buena en la
 * 177-182 y un fragmento huérfano en la 229-230—, así que "el último" resultó ser el fragmento
 * huérfano: ARCA_EN_COMPRAS_N/MONTO quedaron publicados sobre 456 · $179.091.614 cuando el bloque
 * bueno dice 380 · $126.944.008. Dos cifras distintas del mismo concepto, y el nombre —que es lo que
 * el resto del archivo mira— señalando la equivocada.
 *
 * Anclar en "el último" es anclar en la posición. Lo único que este generador PUEDE afirmar es qué
 * escribió él, y eso está en la grilla: fila `i` de la grilla es la fila `filaArranque + i` de la
 * pestaña. Si lo que quedó ahí no es lo que se escribió, `publicar` lo ve al releer la especie y
 * falla cerrado — pero ya no puede engancharse a una copia vieja creyendo que acertó.
 *
 * ═══ QUÉ CUENTA COMO ERROR Y QUÉ COMO AVISO (14/08/2026) ═══
 *
 * `faltan` son los rótulos AUSENTES DE LOS QUE CUELGA UN NOMBRE: sin ellos el nombre se queda donde
 * estaba, que es el defecto que este archivo persigue, y por eso la corrida sale con código ≠0 y no
 * se retira ninguna pestaña. `faltanSinNombre` son los otros: una línea del cuadro que no se emitió
 * es un defecto del generador y hay que decirlo, pero no puede dejar en rojo un pipeline que publica
 * al Sheet cada dos horas — no hay ningún nombre en juego. Un aviso que frena lo que no le
 * corresponde termina siendo el aviso que nadie mira.
 *
 * @param {Array<Array<unknown>>} grid la grilla escrita, fila 0 = fila `filaArranque` de la pestaña
 * @param {number} filaArranque fila REAL (1-indexada) donde aterrizó la primera fila de la grilla
 * @returns {{destinos:Array<{name:string,fila:number,col:number}>, faltan:string[],
 *            faltanSinNombre:string[], cabecera:number|null, cabeceras:number}}
 */
export function destinosDeArca(grid = [], filaArranque = 1) {
  const cabeceras = grid.reduce((n, f) => n + (rotulo(f) === CABECERA_ARCA ? 1 : 0), 0)
  const i0 = grid.findIndex((f) => rotulo(f) === CABECERA_ARCA)
  const clasificar = (lineas) => ({
    faltan: lineas.filter((l) => l.publica).map((l) => l.texto.trim()),
    faltanSinNombre: lineas.filter((l) => !l.publica).map((l) => l.texto.trim()),
  })
  if (i0 < 0) return { destinos: [], ...clasificar(LINEAS_ARCA), cabecera: null, cabeceras }

  const destinos = []
  const ausentes = []
  const hasta = Math.min(grid.length, i0 + 1 + VENTANA)
  for (const l of LINEAS_ARCA) {
    const buscado = l.texto.trim()
    let fila = null
    for (let k = i0 + 1; k < hasta; k++) if (rotulo(grid[k]) === buscado) { fila = filaArranque + k; break }
    if (fila == null) { ausentes.push(l); continue }
    // La línea que ya no publica se busca igual —su ausencia sigue siendo un defecto que hay que
    // decir— pero no genera destino: reapuntar un nombre que se está retirando sería trabajo para
    // dejarlo mejor clavado.
    if (l.publica) destinos.push({ name: l.n, fila, col: COL_N }, { name: l.monto, fila, col: COL_MONTO })
  }
  return { destinos, ...clasificar(ausentes), cabecera: filaArranque + i0, cabeceras }
}

/**
 * NÚCLEO PURO: dónde vive HOY cada nombre, leído del archivo — no dónde se lo quiso poner.
 *
 * ═══ UN CONTROL NO SE VALIDA CONTRA LA INFORMACIÓN QUE PRODUCE ═══
 *
 * `publicar` verifica el destino que se le PIDIÓ y, cuando no convence, no publica: correcto, pero
 * entonces el nombre se queda donde estaba y eso no lo mira nadie. El 13/08 salieron cuatro nombres
 * de esa puerta —ARCA_COMPRAS_TOTAL en la 126, ARCA_SIN_NUMERO_* en la 129— apuntando a un CUIT y a
 * dos números de comprobante, y la corrida informó "1 celda en error" como si fuera un detalle.
 *
 * Esto releé la tabla de rangos con nombre DEL ARCHIVO y devuelve destinos con los que se puede
 * volver a correr la verificación de especie. La fuente es otra: no la lista que el generador armó,
 * sino el estado que quedó.
 *
 * @param {string[]} nombres los que este generador se hace responsable de mantener
 * @param {Array<{name:string, range?:object}>} rangos lo que devuelve `getNamedRanges`
 * @param {number} sheetId la pestaña donde tienen que vivir
 * @returns {{destinos:Array<{name:string,fila:number,col:number}>, ausentes:string[], enOtraPestana:string[]}}
 */
export function dondeViveCadaNombre(nombres = [], rangos = [], sheetId = null) {
  const porNombre = new Map(rangos.map((r) => [r.name, r.range]))
  const destinos = []
  const ausentes = []
  const enOtraPestana = []
  for (const name of nombres) {
    const r = porNombre.get(name)
    if (!r) { ausentes.push(name); continue }
    // Un nombre de este bloque que emigró a otra pestaña no es "está bien donde está": es un nombre
    // que dejó de significar lo que promete, y hay que decirlo con la misma voz.
    if (sheetId != null && r.sheetId !== sheetId) { enOtraPestana.push(name); continue }
    destinos.push({ name, fila: (r.startRowIndex ?? 0) + 1, col: (r.startColumnIndex ?? 0) + 1 })
  }
  return { destinos, ausentes, enOtraPestana }
}
