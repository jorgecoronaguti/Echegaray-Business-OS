// ¿ESTA TABLA ES UNA TABLA, O SON DOS SUPERPUESTAS?
//
// ═══ POR QUÉ EXISTE (14/08/2026) ═══
//
// El dueño, sobre el cuadro 4 de "Proveedores": *"esta todo roto y arrastra el error para abajo, no se
// entiende y no estas respetando la regla de oro de diseño"*. Leído del archivo vivo, la fila 112 tenía
// el título del cuadro 4 en la A y una nota de crédito —otro cuadro— en B·C·D·F·G de la MISMA fila. La
// 114, el encabezado del cuadro 4 en A..E y "▲ revisar (parcial o descuento)" en la F. La 123,
// "TOTAL ACREDITADO" en el medio de la lista de comprobantes. La 134, un proveedor en A..D y la palabra
// "Importe" —un encabezado— en la F. La columna de fechas, con seriales en unas filas y el texto
// "26/2/2026" en otras.
//
// TODOS LOS CONTROLES DEL ARCHIVO PASABAN. Suman, comparan totales, buscan #REF!, cuentan comprobantes
// — y ninguno mira la FORMA. Un encabezado en el medio del cuerpo no cambia un total en un peso: cambia
// que la pestaña se pueda leer, que es para lo que existe. Esa es la brecha que este módulo cierra.
//
// ═══ LAS TRES PREGUNTAS, Y POR QUÉ SON ÉSAS ═══
//
// Son las tres formas en que se ve, desde afuera y sin saber nada del diseño, que en una zona de la
// pestaña quedaron dos tablas encimadas:
//
//   1. UN RÓTULO DENTRO DEL CUERPO. Una tabla tiene un encabezado arriba y un total abajo; si el texto
//      de un encabezado —o un "TOTAL …"— aparece entre los datos, hay dos tablas compartiendo filas.
//   2. UNA COLUMNA CON DOS TIPOS. Cada columna dice UNA cosa: fechas o texto o plata. Una columna con
//      seriales y strings de fecha mezclados no ordena, no compara y no filtra; y es exactamente lo que
//      queda cuando dos corridas con distinto layout escriben en la misma columna.
//   3. UNA FILA CON DOS DUEÑOS. La señal más directa: en la misma fila, unas columnas traen el dato de
//      esta tabla y otras el de otra. Se detecta por los HUECOS — una fila de datos completa hasta la
//      columna N y con algo suelto tres columnas más allá, donde su propio encabezado no declara nada.
//
// NO PRETENDE ADIVINAR EL DISEÑO. Recibe dónde está el encabezado y hasta dónde llega el cuerpo, que es
// lo que el generador sabe de su propia grilla, y contesta si lo que hay adentro es una sola tabla.

/** Sin acentos, sin espacios de los bordes, en mayúsculas: para comparar dos rótulos. */
export const normal = (v) => String(v ?? '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/\s+/g, ' ').trim().toUpperCase()

/** ¿Es un rótulo de cierre de tabla? "TOTAL", "TOTAL ACREDITADO", "SUBTOTAL …". */
export const esTotal = (v) => /^(TOTAL|SUBTOTAL)\b/.test(normal(v))

/**
 * ¿Es una leyenda de control caída entre los datos? Las del bloque de ARCA arrancan con la sangría de
 * su viñeta ("  · cargados en Compras, por N° de comprobante") y las de alerta, con el triángulo. Un
 * dato de una tabla nunca empieza así.
 */
export const esLeyenda = (v) => /^\s*[·▲⚠]/.test(String(v ?? ''))

/** El tipo de un valor tal como lo devuelve la API con UNFORMATTED_VALUE. */
export function tipoDe(v) {
  if (v === null || v === undefined || String(v).trim() === '') return 'vacio'
  if (typeof v === 'number') return 'numero'
  if (typeof v === 'boolean') return 'booleano'
  const s = String(v).trim()
  if (s.startsWith('=')) return 'formula'
  // Una fecha escrita como TEXTO es el defecto que se persigue, no un tipo legítimo: se nombra aparte
  // para que el hallazgo diga qué pasó, en vez de "texto donde va número".
  if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(s)) return 'fecha-texto'
  return 'texto'
}

const celda = (filas, f, c) => (filas[f] || [])[c]

/**
 * ¿LA ZONA ENTRE `encabezado` Y `hasta` ES UNA SOLA TABLA?
 *
 * Las filas van 1-indexadas y absolutas (las de la pestaña); `filas[0]` es la fila `desde`.
 *
 * @param {{filas:any[][], desde?:number, encabezado:number, hasta:number}} o
 * @returns {{tipo:string, fila:number, col:number, detalle:string}[]} vacío = la tabla está sana
 */
export function auditarTabla({ filas = [], desde = 1, encabezado, hasta } = {}) {
  const out = []
  const i = (fila) => fila - desde
  const cab = filas[i(encabezado)] || []
  // Los rótulos del encabezado, por columna y como conjunto: el mismo texto en el cuerpo es la señal.
  const rotulos = new Set(cab.map(normal).filter((s) => s !== ''))
  /** Las columnas que esta tabla declara: hasta la última que su encabezado nombra. */
  const anchoDeclarado = cab.reduce((n, v, j) => (normal(v) === '' ? n : j + 1), 0)

  const porColumna = new Map()
  for (let f = encabezado + 1; f <= hasta; f++) {
    const fila = filas[i(f)] || []
    for (let c = 0; c < Math.max(fila.length, anchoDeclarado); c++) {
      const v = celda(filas, i(f), c)
      const t = tipoDe(v)
      if (t === 'vacio') continue

      // 1 · un rótulo dentro del cuerpo
      if (rotulos.has(normal(v))) {
        out.push({ tipo: 'rotulo-en-el-cuerpo', fila: f, col: c, detalle: `"${String(v).trim()}" es un rótulo del encabezado de esta tabla y está entre los datos: hay dos tablas compartiendo filas` })
      } else if (c === 0 && (esTotal(v) || esLeyenda(v))) {
        out.push({ tipo: 'rotulo-en-el-cuerpo', fila: f, col: c, detalle: `"${String(v).trim()}" cierra o explica un cuadro y está en el medio del cuerpo de otro` })
      }

      // 3 · una fila con dos dueños: dato fuera de las columnas que el encabezado declara
      if (c >= anchoDeclarado) {
        out.push({ tipo: 'fila-con-dos-duenos', fila: f, col: c, detalle: `hay dato en la columna ${c + 1} y el encabezado de esta tabla sólo declara ${anchoDeclarado}: lo de esa columna es de otro cuadro` })
      }

      if (!porColumna.has(c)) porColumna.set(c, new Map())
      const m = porColumna.get(c)
      if (!m.has(t)) m.set(t, f)
    }
  }

  // 2 · una columna con dos tipos. Las fórmulas no se juzgan: su tipo se sabría evaluándolas.
  for (const [c, tipos] of [...porColumna.entries()].sort((a, b) => a[0] - b[0])) {
    const vistos = [...tipos.keys()].filter((t) => t !== 'formula')
    if (vistos.length > 1) {
      out.push({
        tipo: 'columna-mezclada', fila: tipos.get(vistos[1]), col: c,
        detalle: `la columna ${c + 1} tiene ${vistos.join(' y ')} en el mismo cuerpo: no ordena ni compara`,
      })
    }
  }
  return out
}
