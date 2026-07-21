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
  // "—" es el guion del formato de número para el cero: no es texto pegado a mano.
  if (s === '—') return false
  // EL SIGNO VA ANTES DEL PESO. La primera versión sólo aceptaba "$-1.234" y marcaba "-$2.949.816"
  // como texto: 2.486 falsos positivos en catorce pestañas, o sea un control inservible. Un
  // detector que grita por todo es peor que no tenerlo, porque enseña a ignorarlo.
  if (/^[-+]?\s*[$]?\s*[-+]?[\d.,\s]+\s*%?$/.test(s)) return false
  if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(s)) return false
  if (/^-?[\d.,]+ d$/.test(s)) return false
  return true
}

/**
 * NÚCLEO PURO: revisa una pestaña y devuelve los defectos de PANTALLA.
 *
 * @param {{filas:Array<Array<{valor:string, formato:object}>>, anchos:number[]}} f salida de readSheetFormats
 * @param {{desdeFila?:number, huecoMax?:number}} [opts]
 * @returns {Array<{tipo:string, fila:number, col:string, valor:string, que:string}>}
 */
export function detectar(f, { desdeFila = 1, huecoMax = 3 } = {}) {
  const out = []
  if (!f?.filas) return out
  const L = (n) => { let s = ''; for (let i = n; i >= 0; i = Math.floor(i / 26) - 1) s = String.fromCharCode(65 + (i % 26)) + s; return s }

  // ¿Hay una celda con formato de FECHA cerca, en la misma columna?
  //
  // POR QUÉ "CERCA" Y NO "EN TODA LA COLUMNA": mirar la columna entera daba falsos positivos en las
  // pestañas que apilan varias tablas distintas sobre las mismas columnas —que son casi todas—. En
  // Proveedores y Materiales marcó "$54.358" de Ferretería y consumibles como si fuera una fecha,
  // porque veinte filas más abajo la misma columna E pertenece a otra tabla donde sí hay fechas.
  // La vecindad es lo que define una tabla en un layout de bloques apilados.
  const VENTANA = 15
  const conFecha = f.filas.map((fila) => new Set(
    (fila || []).map((c, j) => ((c?.formato?.numberFormat?.type === 'DATE' || c?.formato?.numberFormat?.type === 'DATE_TIME') ? j : -1)).filter((j) => j >= 0)))
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
      if (NUMERICO.has(nf) && esTextoDeVerdad(v)) {
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
