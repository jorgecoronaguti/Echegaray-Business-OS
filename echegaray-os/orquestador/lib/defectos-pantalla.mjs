// LOS DEFECTOS QUE NO VE NINGÚN CONTROL QUE SUMA.
//
// POR QUÉ EXISTE (21/07). El dueño, tercera vez sobre la misma pestaña: "sigue sin estar bien el
// formato de proveedores y materiales, te demando revisión completa, lectura completa".
//
// Tenía razón otra vez, y el problema de fondo es mío: yo verificaba que los TOTALES cerraran. Los
// totales cerraban. Lo que estaba roto era lo que se VE, y de eso no había ni un control:
//
//   · 22 filas mostraban "30/12/99" como próximo pago — es el serial 0 con formato de fecha, o sea
//     "no hay fecha" disfrazado de un día de 1899.
//   · "ninguno llega al 1% del total" en una celda con formato moneda.
//   · 29 filas en blanco en el medio, que son el colchón que se reserva para que un QUERY derrame.
//   · CUIT como 30681641730 en vez de 30-68164173-0.
//
// Ninguno de esos cambia un total en un peso. Todos hacen que la pestaña se lea mal, que es
// exactamente lo que el dueño viene señalando tres veces.
//
// ═══ LA REGLA QUE SE DERIVA ═══
//
// Un control que suma no ve un defecto de pantalla. Hace falta mirar la celda: su VALOR junto con su
// FORMATO. Este archivo es eso — núcleo puro, para poder correrlo sobre cualquier pestaña del
// archivo y no sólo sobre la que el dueño acaba de rechazar.

/** El serial 0 de una fecha en Sheets: 30/12/1899. Un MINIFS sin coincidencias devuelve 0. */
export const FECHA_CERO = /^30\/12\/(1899|99)$/

/** Los tipos de formato que dicen "esta celda es un número". */
const NUMERICO = new Set(['CURRENCY', 'NUMBER', 'PERCENT'])

/** ¿El texto es un número que Sheets ya formateó? Sirve para saber si el valor es texto de verdad. */
const esTextoDeVerdad = (v) => {
  const s = String(v ?? '').trim()
  if (!s) return false
  // EL GUION ES EL CERO. Los formatos de número dibujan el cero como un guion para que una columna
  // de importes no se llene de "$0" — y cada variante lo hace distinto: el estándar del OS usa "—"
  // (largo) y el formato contable de Cobranzas usa "-" (corto), a veces con espacios. Reconocer sólo
  // uno reportaba 684 ceros correctos como texto mal puesto, y ese ruido tapaba los 50 defectos
  // reales que sí tiene esa pestaña.
  if (/^\s*[—–-]\s*$/.test(s)) return false
  // EL SIGNO VA ANTES DEL PESO. La primera versión sólo aceptaba "$-1.234" y marcaba "-$2.949.816"
  // como texto: 2.486 falsos positivos en catorce pestañas, o sea un control inservible. Un
  // detector que grita por todo es peor que no tenerlo, porque enseña a ignorarlo.
  if (/^[-+]?\s*[$]?\s*[-+]?[\d.,\s]+\s*%?$/.test(s)) return false
  // Los dólares se escriben "U$S 581,39" en Argentina, y el símbolo va con letras adelante. Sin
  // esto, cada importe en moneda extranjera se reportaba como texto mal puesto.
  if (/^[-+]?\s*(?:U\$S|US\$|USD)\s*[-+]?[\d.,\s]+$/i.test(s)) return false
  // NOTACIÓN CONTABLE: el paréntesis es el signo menos. "($ 96.800,00)" es un importe negativo, no
  // un texto — así lo dibuja el formato contable que usa Cobranzas en dos columnas enteras. Sin
  // esto el detector reportaba 688 celdas correctas como defectos: el 93% del ruido de esa pestaña,
  // y suficiente para que nadie mire la lista donde SÍ hay 49 defectos reales.
  if (/^\(\s*(?:U\$S|US\$|USD|\$)?\s*[\d.,\s]+\)$/i.test(s)) return false
  if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(s)) return false
  // UN NÚMERO CON SUFIJO DECLARADO SIGUE SIENDO UN NÚMERO. El formato `0" facturas"` produce
  // "46 facturas" y el formato `0" d"` produce "7 d": los dos son la forma correcta de mostrar un
  // contador para que no se lea como plata. Marcarlos era ruido, y un detector ruidoso enseña a
  // ignorarlo — que es peor que no tenerlo.
  if (/^-?[\d.,]+\s+[a-zá-ú.]+$/i.test(s)) return false
  return true
}

/**
 * NÚCLEO PURO: revisa una pestaña y devuelve los defectos de PANTALLA.
 *
 * @param {{filas:Array<Array<{valor:string, formato:object}>>, anchos:number[]}} f salida de readSheetFormats
 * @param {{desdeFila?:number, huecoMax?:number}} [opts]
 * @returns {Array<{tipo:string, fila:number, col:string, valor:string, que:string}>}
 */
/**
 * NÚCLEO PURO: ¿este texto en una celda numérica es el ENCABEZADO de la columna?
 *
 * La diferencia con una nota mal puesta no está en la celda: está en dónde cae. Un encabezado va
 * ARRIBA de los números de su columna; una nota metida en una tabla los tiene arriba y abajo.
 *
 * Se mira la propia columna: si no hay ningún número por encima, esto es el rótulo. En cuanto hay
 * un importe más arriba, el texto está en el medio de los datos y ahí sí molesta.
 *
 * @param {Array<Array<object>>} filas la grilla completa
 * @param {number} i índice de la fila (0-based)
 * @param {number} j índice de la columna
 */
export function esRotuloDeColumna(filas = [], i = 0, j = 0) {
  // "HAY UN NÚMERO ARRIBA" SE DECIDE POR EL VALOR QUE SE VE, no por un campo `numero`: el lector de
  // formatos (readSheetFormats) devuelve sólo `valor` y `formato`. La primera versión preguntaba por
  // `numero`, que ahí siempre viene vacío, así que TODO parecía encabezado y el detector dejó de
  // marcar hasta las notas legítimas. Un control que se apaga entero es peor que uno ruidoso.
  for (let k = 0; k < i; k++) {
    const v = String(filas[k]?.[j]?.valor ?? '').trim()
    if (v && !esTextoDeVerdad(v)) return false
  }
  return true
}

export function detectar(f, { desdeFila = 1, huecoMax = 3 } = {}) {
  const out = []
  if (!f?.filas) return out
  const anchos = f.anchos || []
  const altos = f.altos || []
  const L = (n) => { let s = ''; for (let i = n; i >= 0; i = Math.floor(i / 26) - 1) s = String.fromCharCode(65 + (i % 26)) + s; return s }

  // ¿Hay una celda con formato de FECHA cerca, en la misma columna?
  //
  // POR QUÉ "CERCA" Y NO "EN TODA LA COLUMNA": mirar la columna entera daba falsos positivos en las
  // pestañas que apilan varias tablas distintas sobre las mismas columnas —que son casi todas—. En
  // Proveedores y Materiales marcó "$54.358" de Ferretería y consumibles como si fuera una fecha,
  // porque veinte filas más abajo la misma columna E pertenece a otra tabla donde sí hay fechas.
  // La vecindad es lo que define una tabla en un layout de bloques apilados.
  //
  // Y UNA FILA DE ENCABEZADO DE MESES NO CUENTA. Casi todos los cuadros de este archivo tienen
  // arriba una fila con "ene feb mar…" que son fechas de verdad, con formato de fecha. Contándola,
  // TODAS las columnas de importes de ese cuadro pasaban a "tener fechas cerca" y cualquier importe
  // en el rango de seriales se marcaba: pasó con $54.043 en Recurrentes y $48.613 en Estructura, que
  // son gastos reales. Una fila con tres o más fechas es un encabezado de períodos, no datos.
  const VENTANA = 15
  const conFecha = f.filas.map((fila) => {
    const cols = (fila || []).map((c, j) => ((c?.formato?.numberFormat?.type === 'DATE' || c?.formato?.numberFormat?.type === 'DATE_TIME') ? j : -1)).filter((j) => j >= 0)
    return new Set(cols.length >= 3 ? [] : cols)
  })
  const fechaCerca = (fila, col) => {
    for (let k = Math.max(0, fila - VENTANA); k <= Math.min(conFecha.length - 1, fila + VENTANA); k++) {
      if (conFecha[k].has(col)) return true
    }
    return false
  }

  let vacias = 0, inicioHueco = 0
  f.filas.forEach((fila, i) => {
    const nFila = i + 1
    const tieneAlgo = (fila || []).some((c) => String(c?.valor ?? '').trim())

    // ── HUECOS: filas en blanco seguidas ────────────────────────────────────────────────────────
    // Son el colchón que se reserva para que un QUERY derrame. Reservar está bien; que se vean
    // veintinueve filas vacías en el medio de la pestaña, no.
    if (!tieneAlgo && nFila >= desdeFila) {
      if (!vacias) inicioHueco = nFila
      vacias++
    } else {
      if (vacias > huecoMax) {
        out.push({ tipo: 'hueco', fila: inicioHueco, col: '—', valor: `${vacias} filas`, que: `${vacias} filas en blanco seguidas (${inicioHueco} a ${inicioHueco + vacias - 1}): es colchón de derrame a la vista` })
      }
      vacias = 0
    }
    if (!tieneAlgo) return

    ;(fila || []).forEach((c, j) => {
      const v = String(c?.valor ?? '').trim()
      if (!v) return
      const nf = c?.formato?.numberFormat?.type
      const col = L(j)

      // ── LA FECHA CERO ───────────────────────────────────────────────────────────────────────
      // Un MINIFS o un MIN sin coincidencias devuelve 0, y 0 con formato de fecha es 30/12/1899.
      // Se lee como una fecha real y no lo es: significa "no hay ninguna".
      if (FECHA_CERO.test(v)) {
        out.push({ tipo: 'fecha_cero', fila: nFila, col, valor: v, que: 'es el serial 0 con formato de fecha: significa "no hay fecha", no un día de 1899' })
        return
      }

      // ── TEXTO EN UNA CELDA CON FORMATO DE NÚMERO ────────────────────────────────────────────
      // Una nota metida en una columna de importes. Se ve como si fuera un dato de la tabla.
      //
      // SALVO EN UNA FILA DE ENCABEZADO, y esta excepción es la diferencia entre un control que se
      // usa y uno que se ignora. "IMPORTES" arriba de una columna de moneda es lo correcto, no un
      // defecto: medido, 1.107 de los 1.182 avisos del archivo eran rótulos de columna. Un detector
      // que grita mil veces por cosas bien hechas entrena a no mirar la lista — ya pasó con los 688
      // falsos positivos del guion del cero contable.
      //
      // Una fila de encabezado se reconoce sin adivinar: TODAS sus celdas con contenido son texto.
      // En cuanto aparece un número, es una fila de datos y ahí sí el texto molesta.
      if (NUMERICO.has(nf) && esTextoDeVerdad(v) && !esRotuloDeColumna(f.filas, i, j)) {
        out.push({ tipo: 'texto_en_numero', fila: nFila, col, valor: v.slice(0, 40), que: `texto en una celda con formato ${nf}` })
      }

      // ── UN PORCENTAJE FUERA DE ESCALA ───────────────────────────────────────────────────────
      // "2083%" es un ratio al que le pusieron formato de porcentaje sin dividirlo.
      if (nf === 'PERCENT') {
        const n = Number(String(v).replace(/[^\d,-]/g, '').replace(',', '.'))
        if (Number.isFinite(n) && Math.abs(n) > 1000) {
          out.push({ tipo: 'porcentaje_fuera_de_escala', fila: nFila, col, valor: v, que: 'un porcentaje de más de 1000% casi siempre es un ratio sin dividir' })
        }
      }

      // ── UN IMPORTE QUE EN REALIDAD ES UN SERIAL DE FECHA ────────────────────────────────────
      // Entre 40000 y 60000 sin decimales y con formato moneda cae en el rango de seriales de 2009
      // a 2064. Pero un importe REAL de ese tamaño existe y es común, así que sólo por el rango la
      // señal es puro ruido: marcaba veintitrés importes legítimos del cash flow.
      //
      // LO QUE LO VUELVE CONCLUYENTE: que la MISMA COLUMNA tenga además celdas con formato de fecha.
      // Una columna que mezcla fechas e importes en el rango de seriales es una columna de fechas a
      // la que se le escapó el formato — que es exactamente lo que pasó con "$46.198".
      if (nf === 'CURRENCY' && fechaCerca(i, j)) {
        const n = Number(String(v).replace(/[^\d,-]/g, '').replace(',', '.'))
        if (Number.isInteger(n) && n >= 40000 && n <= 60000) {
          out.push({ tipo: 'fecha_como_moneda', fila: nFila, col, valor: v, que: 'un entero en el rango de seriales de fecha, en una columna que en otras filas SÍ tiene formato de fecha' })
        }
      }

      // ── UN TEXTO QUE NO ENTRA EN SU CELDA ───────────────────────────────────────────────────
      //
      // POR QUÉ (21/07). El dueño, tres veces sobre la misma pestaña: "no se entiende una mierda".
      // Los totales estaban bien y no había defectos de formato: lo que pasaba es que los rótulos y
      // los orígenes eran más largos que su columna y se cortaban a mitad de palabra. Eso no lo ve
      // ningún control que suma NI el detector de formatos — hay que MEDIR el texto contra el ancho
      // de la columna, que es lo único que decide si algo se puede leer.
      //
      // Se marca sólo cuando el texto REALMENTE se corta: si la celda de al lado está vacía, Sheets
      // lo derrama y se lee perfecto. Un rótulo largo sobre columnas vacías no es un defecto.
      // EL ANCHO QUE DE VERDAD TIENE UNA CELDA no es el de su columna: es el que hay hasta la
      // próxima celda con contenido. Así funciona el derrame de Sheets y así funciona una celda
      // combinada. Midiendo sólo la columna propia, cada rótulo de bloque y cada párrafo de
      // introducción salía reportado — y son justamente los que mejor se leen, porque tienen media
      // pestaña vacía a la derecha.
      let anchoCol = anchos[j] ?? 0
      let vecinaOcupada = false
      for (let k = j + 1; k < Math.max(fila.length, anchos.length); k++) {
        if (String(fila?.[k]?.valor ?? '').trim() !== '') { vecinaOcupada = true; break }
        anchoCol += anchos[k] ?? 0
      }
      if (anchoCol && !NUMERICO.has(nf)) {
        const tam = c?.formato?.textFormat?.fontSize ?? 10
        const px = v.length * tam * 0.57
        const wrap = c?.formato?.wrapStrategy
        if (px > anchoCol) {
          if (wrap === 'WRAP') {
            const lineas = Math.ceil(px / anchoCol)
            const alto = altos[i] ?? 21
            if (alto < lineas * (tam + 5)) {
              out.push({ tipo: 'texto_apretado', fila: nFila, col, valor: v.slice(0, 40), que: `necesita ${lineas} líneas y la fila mide ${alto}px: se ve la primera y el resto queda cortado abajo` })
            }
          } else if (vecinaOcupada || wrap === 'CLIP') {
            out.push({ tipo: 'texto_cortado', fila: nFila, col, valor: v.slice(0, 40), que: `${v.length} caracteres en una columna de ${anchoCol}px: entran ${Math.floor(anchoCol / (tam * 0.57))}` })
          }
        }
      }

      // ── UN CUIT SIN FORMATEAR ───────────────────────────────────────────────────────────────
      if (/^\d{11}$/.test(v)) {
        out.push({ tipo: 'cuit_sin_formato', fila: nFila, col, valor: v, que: 'once dígitos seguidos: si es un CUIT va como 30-71063067-0' })
      }
    })
  })

  return out
}

/** NÚCLEO PURO: el resumen por tipo, para el log y para decidir qué arreglar primero. */
export function resumen(defectos = []) {
  const acc = new Map()
  for (const d of defectos) {
    const a = acc.get(d.tipo) ?? { tipo: d.tipo, n: 0, ejemplo: d }
    a.n++
    acc.set(d.tipo, a)
  }
  return [...acc.values()].sort((a, b) => b.n - a.n)
}
