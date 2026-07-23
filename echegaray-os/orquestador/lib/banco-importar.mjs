// LEER UN EXTRACTO DEL SANTANDER PEGADO O EXPORTADO. NÚCLEO PURO, SIN RED NI BASE.
//
// POR QUÉ EXISTE (23/07). El dueño: "a diario y quizás dos veces por día te tengo que cargar los
// movimientos bancarios vía archivo csv o capturas de pantalla". Hasta hoy eso significaba que yo
// editara a mano un array de 127 movimientos adentro de lib/banco-santander.mjs. Un dato que se
// carga todos los días no puede vivir en el código.
//
// ═══ POR QUÉ EL PARSEO ES DESCONFIADO ═══
//
// Un extracto llega de tres formas y ninguna es un CSV limpio:
//   · descarga CSV/Excel del homebanking, con separador `;` y coma decimal (es-AR);
//   · copiar y pegar de la pantalla, que separa las columnas con tabulaciones o con varios espacios;
//   · texto leído de una captura, que es lo mismo pero con más ruido.
//
// Y el modo de falla es SILENCIOSO: "1.234,56" leído como número inglés da 1.23456 o NaN, y un
// importe mal leído no rompe nada — deja un saldo equivocado. Por eso cada fila que no se entiende
// se DEVUELVE como rechazada con su texto, en vez de descartarse: un importador que come 80 filas
// de 100 y no lo dice es peor que uno que falla.
//
// ═══ EL CONTROL QUE HACE CONFIABLE TODO ESTO ═══
//
// El extracto trae el saldo corrido. Entonces saldo(n) tiene que ser saldo(n−1) + importe(n), y eso
// es una identidad, no una estimación: si no cierra, hay un typo o falta un movimiento. Es el mismo
// control que ya encontró dos errores de transcripción en este archivo. Se aplica DESPUÉS de mezclar
// lo nuevo con lo que ya estaba, porque un extracto nuevo puede arrancar a mitad de la serie.

/** El importe a la argentina: "1.234,56" / "-1.234,56" / "$ 1.234,56-" → número. */
export function importe(txt) {
  let s = String(txt ?? '').trim()
  if (!s) return null
  // El signo puede venir al final ("1.234,56-"), como en varios exports de homebanking.
  const negativoAlFinal = /-\s*$/.test(s)
  s = s.replace(/[^\d,.-]/g, '')
  if (!s || !/\d/.test(s)) return null
  // es-AR: el punto es separador de miles y la coma decimal. Se saca el punto y se cambia la coma.
  // Sin esto "1.234,56" se lee como 1.23456 — no da error, da un número plausible y equivocado.
  s = s.replace(/\./g, '').replace(',', '.').replace(/-(?!^)/g, '')
  const n = Number(s)
  if (!Number.isFinite(n)) return null
  const negativo = negativoAlFinal || /^\s*-/.test(String(txt))
  return negativo ? -Math.abs(n) : n
}

/** "22/07/2026" · "22/07/26" · "2026-07-22" → "YYYY-MM-DD". Null si no es una fecha. */
export function fecha(txt, anioPorDefecto = new Date().getFullYear()) {
  const s = String(txt ?? '').trim()
  let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (m) return s
  // DD/MM/AAAA — nunca MM/DD: todo el Drive es es-AR y leerlo al revés da el día equivocado sin
  // avisar (07/05 puede ser 7 de mayo o 5 de julio, y el error es invisible hasta que no cierra).
  m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/.exec(s)
  if (m) {
    const [, d, mes, a] = m
    const anio = a.length === 2 ? 2000 + Number(a) : Number(a)
    if (Number(mes) < 1 || Number(mes) > 12 || Number(d) < 1 || Number(d) > 31) return null
    return `${anio}-${String(mes).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  }
  // "22/07" sin año: pasa en las capturas de pantalla del listado del día.
  m = /^(\d{1,2})[/-](\d{1,2})$/.exec(s)
  if (m && Number(m[2]) >= 1 && Number(m[2]) <= 12) {
    return `${anioPorDefecto}-${String(m[2]).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}`
  }
  return null
}

/**
 * Parte una línea en campos. Acepta `;`, tabulación, o dos o más espacios seguidos.
 *
 * NO se corta por UN espacio: el concepto del Santander tiene espacios adentro
 * ("Transferencia realizada - A gisela agostina d amico") y partirlo ahí lo haría pedazos.
 */
export function campos(linea) {
  const s = String(linea ?? '').replace(/\r$/, '')
  if (s.includes('\t')) return s.split('\t').map((c) => c.trim())
  if (s.includes(';')) return s.split(';').map((c) => c.trim())
  return s.split(/\s{2,}/).map((c) => c.trim()).filter((c, i, a) => c !== '' || i < a.length - 1)
}

/** Las líneas que no son un movimiento: encabezados, totales, cortes de página. */
const ES_RUIDO = /^(fecha\b|saldo (inicial|final|anterior)|movimientos|cuenta|per[ií]odo|total\b|p[áa]gina|banco santander|consolidado|=+$|-+$)/i

/**
 * NÚCLEO PURO: lee un extracto pegado o exportado y devuelve movimientos y rechazos.
 *
 * @param {string} texto  el extracto tal cual, con sus saltos de línea
 * @param {{anio?:number}} opts
 * @returns {{movimientos:{fecha:string,concepto:string,importe:number,saldo:number|null}[], rechazos:{linea:number,texto:string,motivo:string}[]}}
 */
export function parsearExtracto(texto, { anio = new Date().getFullYear() } = {}) {
  const movimientos = []
  const rechazos = []
  const lineas = String(texto ?? '').split('\n')

  lineas.forEach((linea, i) => {
    const cruda = linea.trim()
    if (!cruda) return
    if (ES_RUIDO.test(cruda)) return
    const c = campos(cruda)
    // Una línea de movimiento tiene, como mínimo, fecha + concepto + importe.
    if (c.length < 3) { rechazos.push({ linea: i + 1, texto: cruda.slice(0, 90), motivo: 'no tiene fecha, concepto e importe' }); return }
    const f = fecha(c[0], anio)
    if (!f) { rechazos.push({ linea: i + 1, texto: cruda.slice(0, 90), motivo: `"${c[0]}" no es una fecha` }); return }

    // El IMPORTE es el último campo numérico, o el anteúltimo si además viene el saldo. Se busca de
    // atrás para adelante porque el concepto puede tener números adentro (el CUIT, el nº de tarjeta)
    // y tomarlos como importe es el error clásico de este parseo.
    const numericos = []
    for (let j = c.length - 1; j >= 1; j--) {
      const n = importe(c[j])
      // Un campo con letras no es un importe aunque tenga dígitos ("tarj nro. 6077").
      if (n === null || /[a-záéíóúñ]/i.test(c[j])) break
      numericos.unshift({ j, n })
    }
    if (!numericos.length) { rechazos.push({ linea: i + 1, texto: cruda.slice(0, 90), motivo: 'no encontré el importe' }); return }

    const concepto = c.slice(1, numericos[0].j).join(' ').replace(/\s+/g, ' ').trim()
    if (!concepto) { rechazos.push({ linea: i + 1, texto: cruda.slice(0, 90), motivo: 'la fila no tiene concepto' }); return }

    // Con dos números, el primero es el importe y el segundo el saldo corrido. Con uno solo —típico
    // de los "Movimientos del Día"— hay importe y todavía no hay saldo: se guarda en null, no en 0.
    // Un saldo 0 inventado rompería la cadena y haría gritar al control sin motivo.
    const imp = numericos[0].n
    const saldo = numericos.length >= 2 ? numericos[numericos.length - 1].n : null
    movimientos.push({ fecha: f, concepto, importe: imp, saldo })
  })

  return { movimientos, rechazos }
}

/** La clave natural de un movimiento. El SALDO entra a propósito: dos transferencias iguales el
 *  mismo día son dos movimientos distintos y sólo el saldo corrido los separa. */
export const clave = (m) => `${m.fecha}|${String(m.concepto).toLowerCase().replace(/\s+/g, ' ').trim()}|${Number(m.importe).toFixed(2)}|${m.saldo == null ? '' : Number(m.saldo).toFixed(2)}`

/**
 * NÚCLEO PURO: qué de lo nuevo NO estaba todavía.
 *
 * Las descargas del homebanking se piden con ventanas que se superponen, así que la mayor parte de
 * un extracto nuevo ya está cargada. Sin esto, cada importación duplicaría el tramo común: no daría
 * error, daría un saldo equivocado.
 */
export function novedades(nuevos = [], existentes = []) {
  const vistos = new Set(existentes.map(clave))
  const out = []
  for (const m of nuevos) {
    const k = clave(m)
    if (vistos.has(k)) continue
    vistos.add(k) // el propio extracto puede traer la misma fila dos veces
    out.push(m)
  }
  return out
}

/**
 * NÚCLEO PURO: ¿la cadena de saldos cierra?
 *
 * saldo(n) = saldo(n−1) + importe(n). Es una identidad del extracto, no una estimación: si no da,
 * hay un typo o falta un movimiento. Los que no traen saldo (movimientos del día) se saltean sin
 * cortar la cadena — arrastran el último saldo conocido.
 *
 * @returns {{ok:boolean, cortes:{fecha:string,concepto:string,esperado:number,declarado:number,diferencia:number}[]}}
 */
export function verificarCadena(movs = [], saldoInicial = null, tolerancia = 0.005) {
  const cortes = []
  let anterior = saldoInicial
  for (const m of movs) {
    if (m.saldo == null) continue
    if (anterior != null) {
      const esperado = anterior + Number(m.importe)
      const dif = esperado - Number(m.saldo)
      if (Math.abs(dif) > tolerancia) {
        cortes.push({ fecha: m.fecha, concepto: m.concepto, esperado, declarado: Number(m.saldo), diferencia: dif })
      }
    }
    anterior = Number(m.saldo)
  }
  return { ok: cortes.length === 0, cortes }
}
