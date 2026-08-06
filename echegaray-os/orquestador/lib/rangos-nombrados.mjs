import { ref as refPestana } from './partir-pestana.mjs'

// RANGOS CON NOMBRE — para que un número tenga UNA dirección estable en todo el archivo.
//
// POR QUÉ (21/07). El Cash Flow Mensual es una pestaña "calculada": la regla es que TODO tiene que
// ser fórmula, porque un número pegado no se puede auditar y el día que cambia el dato de origen
// miente sin avisar. Pero el bloque de cobertura mostraba las cifras de ARCA —cuántos comprobantes,
// por cuánto— y ésas no salen del Sheet: salen de Postgres. Las escribí pegadas y el auditor me lo
// marcó: 8 números a mano en la pestaña más importante del archivo.
//
// LA SALIDA NO ES RELAJAR LA REGLA, es darle a esos números un lugar donde SÍ corresponden. Viven
// en "Proveedores y Materiales", que es una pestaña RÉPLICA (su origen declarado es el libro de IVA
// de ARCA), y el Cash Flow los referencia por nombre. Así hay un solo lugar donde el número existe
// y cualquier otra pestaña lo mira.
//
// POR QUÉ POR NOMBRE Y NO POR CELDA. Las dos pestañas se reescriben enteras cada 2 horas y el
// bloque se corre de fila según cuántos proveedores o cuántas notas de crédito haya ese día. Una
// referencia 'Proveedores y Materiales'!D147 apunta a otra cosa mañana, en silencio. El nombre
// sobrevive porque el rango se actualiza junto con la pestaña.

/** Los números de ARCA que el resto del archivo puede mirar. El nombre es el contrato. */
export const ARCA = {
  comprobantes: 'ARCA_COMPRAS_N',
  total: 'ARCA_COMPRAS_TOTAL',
  notasN: 'ARCA_NOTAS_N',
  notasMonto: 'ARCA_NOTAS_MONTO',
  enComprasN: 'ARCA_EN_COMPRAS_N',
  enComprasMonto: 'ARCA_EN_COMPRAS_MONTO',
  sinNumeroN: 'ARCA_SIN_NUMERO_N',
  sinNumeroMonto: 'ARCA_SIN_NUMERO_MONTO',
  faltanN: 'ARCA_FALTAN_N',
  faltanMonto: 'ARCA_FALTAN_MONTO',
  ventasN: 'ARCA_VENTAS_N',
  ventasMonto: 'ARCA_VENTAS_MONTO',
}

/**
 * Los números de CAJA que el resto del archivo mira.
 *
 * POR QUÉ EXISTEN (21/07). El Cash Flow Mensual leía el saldo declarado con una referencia por
 * celda —`CAJA!$F$10:$F$14`— y el día que se insertó un bloque arriba en CAJA, esas celdas pasaron a
 * ser otra cosa: las dos filas más importantes del cuadro, "Efectivo al inicio" y "al cierre",
 * quedaron VACÍAS. Sin error, sin aviso.
 *
 * Peor todavía: el cash flow corre ANTES que CAJA en el agente, así que aunque recalcule la
 * referencia leyendo la pestaña, siempre está una corrida atrasado. Con un nombre, el orden deja de
 * importar: el nombre sigue a la celda aunque se mueva.
 */
export const CAJA = {
  total: 'CAJA_TOTAL_DISPONIBLE',
  fecha: 'CAJA_FECHA_SALDO',
}

/**
 * LO QUE LA PESTAÑA "Proveedores" LE OFRECE AL RESTO DEL ARCHIVO.
 *
 * `libreta` es la tabla proveedor → comentario que el dueño escribe a mano. La sección 1 —que desde el
 * 31/07 es un derrame de fórmula y se reordena sola en cada recálculo— la lee por nombre para traer
 * cada nota al lado de SU proveedor. Con la nota escrita al lado de la fila no alcanzaba: la fila se
 * mueve y la nota no, así que terminaba describiendo a otro proveedor.
 */
export const PROVEEDORES = {
  libreta: 'PROV_LIBRETA',
}

/**
 * NÚCLEO PURO: los pedidos de la API para dejar un conjunto de nombres apuntando donde toca.
 * Actualiza el que ya existe en vez de crear otro — la API no falla al duplicar un nombre, se queda
 * con dos y las fórmulas empiezan a leer el equivocado.
 *
 * @param {Array<{name:string, fila:number, col:number}>} destinos fila y columna 1-indexadas
 * @param {Array<{name:string, namedRangeId:string}>} existentes lo que ya hay en el archivo
 */
export function pedidos(sheetId, destinos = [], existentes = []) {
  return destinos.map((d) => {
    // UN NOMBRE PUEDE CUBRIR UN BLOQUE, NO SÓLO UNA CELDA (31/07). La libreta de proveedores es una
    // TABLA de dos columnas que el dueño extiende hacia abajo, y su nombre tiene que seguirla: con
    // `abierto` se omite `endRowIndex`, que en la API de Sheets significa "hasta el final de la hoja".
    // Un rango con fila final se fosiliza —la fila que él agregue mañana queda afuera y el VLOOKUP que
    // lo mira devuelve vacío sin dar ningún error—, que es el mismo defecto que este archivo evita en
    // las fórmulas. Por defecto sigue siendo una celda: los doce nombres de ARCA no cambian.
    const range = {
      sheetId,
      startRowIndex: d.fila - 1,
      startColumnIndex: d.col - 1, endColumnIndex: d.col - 1 + (d.cols ?? 1),
    }
    if (!d.abierto) range.endRowIndex = d.fila - 1 + (d.filas ?? 1)
    const ya = existentes.find((r) => r.name === d.name)
    return ya
      ? { updateNamedRange: { namedRange: { namedRangeId: ya.namedRangeId, name: d.name, range }, fields: 'name,range' } }
      : { addNamedRange: { namedRange: { name: d.name, range } } }
  })
}

// ═══ UN NOMBRE PUBLICADO NO ES UN NOMBRE QUE APUNTA A ALGO (05/08) ═══
//
// EL CASO REAL. `ARCA_COMPRAS_TOTAL` prometía un importe y devolvía "0001-00000204" — un número de
// comprobante—; `ARCA_FALTAN_N` prometía un contador y devolvía "30-71647696-7", un CUIT. Los doce
// nombres apuntaban a la fila que el generador había CALCULADO para su bloque, pero esa fila todavía
// tenía el contenido de un diseño anterior: la escritura de valores no llegó a esas celdas y la
// publicación de los nombres siguió adelante igual.
//
// LA API DE SHEETS ACEPTA CUALQUIER RANGO. `addNamedRange` sobre una celda con basura devuelve 200,
// así que la corrida imprimía "12 rangos con nombre publicados" y se daba por terminada. El efecto
// se veía cuatro pestañas más allá —Recurrentes, Estructura, Materiales y Cash Flow Mensual mostraban
// un número de comprobante donde prometían plata— y nadie lo ataba a esta línea.
//
// LO QUE PRUEBA UNA ESCRITURA ES EL DATO LEÍDO EN SU DESTINO. Después de publicar se RELEE cada
// celda y se compara con la ESPECIE que el nombre promete. No alcanza con "hay algo": un texto
// donde va plata es exactamente el defecto.

/** Qué especie de dato promete cada nombre. Un contador es un ENTERO; un monto es PLATA. */
export const ESPECIE = {
  [ARCA.comprobantes]: 'entero', [ARCA.total]: 'importe',
  [ARCA.notasN]: 'entero', [ARCA.notasMonto]: 'importe',
  [ARCA.enComprasN]: 'entero', [ARCA.enComprasMonto]: 'importe',
  [ARCA.sinNumeroN]: 'entero', [ARCA.sinNumeroMonto]: 'importe',
  [ARCA.faltanN]: 'entero', [ARCA.faltanMonto]: 'importe',
  [ARCA.ventasN]: 'entero', [ARCA.ventasMonto]: 'importe',
  [CAJA.total]: 'importe',
  // Una fecha SÍ tiene criterio verificable: el serial de Sheets vive en una banda angosta conocida.
  // El 06/08 este nombre quedó apuntando a la celda del total ($68M) y nada gritó: el piso
  // MAX(CAJA_FECHA_SALDO;TODAY()) de la escalera se fue a millones y vació todos los tramos futuros.
  [CAJA.fecha]: 'fecha',
  // PROV_LIBRETA es una tabla de texto: no declara especie. Declarar de más sería inventar un criterio.
}

// La banda de seriales que puede ser una fecha real de este archivo: 2000–2100. Un importe de caja
// (millones) o un número de comprobante caen afuera, que es exactamente la confusión que hay que ver.
const SERIAL_2000 = 36526
const SERIAL_2100 = 73050
export const esSerialDeFecha = (v) => typeof v === 'number' && Number.isInteger(v) && v >= SERIAL_2000 && v <= SERIAL_2100

/**
 * NÚCLEO PURO: qué especie de dato es este valor, leído con UNFORMATTED_VALUE.
 *
 * Se lee SIN formatear a propósito: "$209.231.271" formateado es un string y un número de
 * comprobante también, así que el formato borra justo la distinción que hace falta. Ver la memoria
 * "Fechas dd/mm/yy: el parser que vacía la pestaña".
 *
 * @param {unknown} valor
 * @returns {'vacio'|'entero'|'numero'|'texto'}
 */
export function especieDe(valor) {
  if (valor === null || valor === undefined) return 'vacio'
  if (typeof valor === 'number') return Number.isInteger(valor) ? 'entero' : 'numero'
  const s = String(valor).trim()
  if (s === '') return 'vacio'
  // La API puede devolver el número como string según la ruta; "0001-00000204" no matchea acá, que
  // es todo el punto: los ceros a la izquierda y el guión lo delatan como comprobante.
  if (/^-?\d+$/.test(s)) return 'entero'
  if (/^-?\d+\.\d+$/.test(s)) return 'numero'
  return 'texto'
}

/**
 * NÚCLEO PURO: los nombres cuya celda NO tiene la especie que el nombre promete.
 *
 * Un importe acepta entero o decimal (y el negativo: las notas de crédito restan). Un contador
 * acepta sólo un entero. Ninguno de los dos acepta texto NI vacío: una celda vacía bajo un nombre
 * publicado es el caso de "el nombre se reapuntó a una grilla que todavía no se escribió", que es
 * tan mudo como el texto y tan equivocado.
 *
 * @param {Array<{name:string, fila:number, col:number, especie?:string}>} destinos
 * @param {(d:{name:string}) => unknown} leer devuelve el valor crudo de la celda de ese destino
 * @returns {{name:string, fila:number, col:number, espera:string, encontro:string, valor:unknown}[]}
 */
export function desalineados(destinos = [], leer = () => undefined) {
  const out = []
  for (const d of destinos) {
    const espera = d.especie ?? ESPECIE[d.name]
    if (!espera) continue
    const valor = leer(d)
    const hay = especieDe(valor)
    const ok = espera === 'importe' ? (hay === 'entero' || hay === 'numero')
      : espera === 'fecha' ? esSerialDeFecha(typeof valor === 'string' && /^\d+$/.test(valor.trim()) ? Number(valor) : valor)
      : hay === espera
    if (!ok) out.push({ name: d.name, fila: d.fila, col: d.col, espera, encontro: hay, valor })
  }
  return out
}

/** La celda A1 de una fila/columna 1-indexadas. Sólo hasta la Z: los nombres viven en las primeras. */
const a1 = (fila, col) => `${String.fromCharCode(64 + col)}${fila}`

/**
 * Publica los nombres Y COMPRUEBA QUE APUNTEN A ALGO DE LA ESPECIE PROMETIDA.
 *
 * La relectura es UNA sola llamada: el rectángulo que cubre todos los destinos. Doce lecturas
 * sueltas por corrida son doce oportunidades más de comerse un 429 justo después de escribir.
 *
 * Sin `titulo` no se puede releer (la API de valores direcciona por nombre de pestaña, no por
 * sheetId) y se devuelve `verificado: false` — que es la verdad, no un éxito.
 *
 * @returns {Promise<{nombres:number, verificado:boolean, malApuntados:Array<object>}>}
 */
export async function publicar(google, fileId, sheetId, destinos = [], { titulo = null } = {}) {
  if (!destinos.length) return { nombres: 0, verificado: false, malApuntados: [], noPublicados: [] }
  const existentes = await google.getNamedRanges(fileId).catch(() => [])

  // ═══ SE MIRA ANTES DE APUNTAR, NO DESPUÉS (05/08) ═══
  //
  // Hasta hoy esto publicaba los doce nombres y RECIÉN DESPUÉS releía para avisar cuáles habían
  // quedado mal apuntados. El aviso salía —y sirvió: así apareció que cinco `ARCA_*` apuntaban a
  // números de comprobante y CUITs— pero para entonces el daño ya estaba hecho: los nombres apuntando
  // a basura, y Recurrentes, Estructura, Materiales y el Cash Flow Mensual mostrando un número de
  // comprobante donde prometen plata. Un aviso que llega después del daño es una autopsia.
  //
  // Las CELDAS ya están escritas cuando se llama a esta función; lo único que falta es a dónde apunta
  // cada nombre. Así que se lee primero, se descartan los destinos que no tienen la especie prometida,
  // y se publican sólo los que sí. El nombre descartado se queda donde estaba —o no se crea— y el que
  // llama recibe la lista para gritarla. Las dos salidas son ruidosas; apuntar a basura era silenciosa.
  //
  // Sin `titulo` no se puede releer (la API de valores direcciona por nombre de pestaña, no por
  // sheetId): ahí se publica todo y se devuelve `verificado: false`, que es la verdad y no un éxito.
  let malApuntados = []
  let aPublicar = destinos
  let verificado = false
  if (titulo) {
    const f0 = Math.min(...destinos.map((d) => d.fila)), f1 = Math.max(...destinos.map((d) => d.fila))
    const c0 = Math.min(...destinos.map((d) => d.col)), c1 = Math.max(...destinos.map((d) => d.col))
    // La relectura es UNA sola llamada: el rectángulo que cubre todos los destinos. Doce lecturas
    // sueltas por corrida son doce oportunidades más de comerse un 429.
    let leido = null
    try {
      leido = await google.readSheetValues(fileId, `${refPestana(titulo)}!${a1(f0, c0)}:${a1(f1, c1)}`, { render: 'UNFORMATTED_VALUE' })
    } catch { leido = null }
    // NO PODER RELEER NO ES "SALIÓ BIEN" NI ES "NO PUBLIQUES": es no saber. Se publica —para no dejar
    // el archivo sin nombres por un 429— y se dice que no se verificó.
    if (leido) {
      verificado = true
      malApuntados = desalineados(destinos, (d) => (leido[d.fila - f0] || [])[d.col - c0])
      const malos = new Set(malApuntados.map((m) => m.name))
      aPublicar = destinos.filter((d) => !malos.has(d.name))
    }
  }

  if (aPublicar.length) await google.spreadsheetBatchUpdate(fileId, pedidos(sheetId, aPublicar, existentes))
  return {
    nombres: aPublicar.length,
    verificado,
    malApuntados,
    /** Los que NO se apuntaron a la celda pedida porque esa celda no tiene lo que el nombre promete. */
    noPublicados: malApuntados.map((m) => m.name),
  }
}
