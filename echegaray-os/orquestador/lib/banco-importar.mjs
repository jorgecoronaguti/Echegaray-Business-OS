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
  // El CSV descargado del Santander marca los débitos ENTRE PARÉNTESIS: "(1.234,56)" = -1.234,56.
  // Sin esto, el débito entra POSITIVO y el saldo no cierra (además de invertir cada egreso).
  const entreParentesis = /^\(.*\d.*\)$/.test(s)
  s = s.replace(/[^\d,.-]/g, '')
  if (!s || !/\d/.test(s)) return null
  // es-AR: el punto es separador de miles y la coma decimal. Se saca el punto y se cambia la coma.
  // Sin esto "1.234,56" se lee como 1.23456 — no da error, da un número plausible y equivocado.
  s = s.replace(/\./g, '').replace(',', '.').replace(/-(?!^)/g, '')
  const n = Number(s)
  if (!Number.isFinite(n)) return null
  const negativo = negativoAlFinal || entreParentesis || /^\s*-/.test(String(txt))
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
const ES_RUIDO = /^(fecha\b|saldo (inicial|final|anterior|al\b)|[úu]ltimos movimientos|movimientos|cuenta|per[ií]odo|total\b|p[áa]gina|banco santander|consolidado|=+$|-+$)/i

/**
 * NÚCLEO PURO: lee un extracto pegado o exportado y devuelve movimientos y rechazos.
 *
 * @param {string} texto  el extracto tal cual, con sus saltos de línea
 * @param {{anio?:number}} opts
 * @returns {{movimientos:{fecha:string,concepto:string,importe:number,saldo:number|null}[], rechazos:{linea:number,texto:string,motivo:string}[]}}
 */
/**
 * El CSV que descarga el homebanking del Santander ("descargaUltimosMovimientos") NO es el formato
 * de pegado. Trae 8 columnas separadas por `;` —Fecha;Suc. Origen;Desc. Sucursal;Cod. Operativo;
 * Referencia;Concepto;Importe;Saldo— con los débitos entre paréntesis. Dos trampas que rompían todo:
 * las columnas Suc/Desc/Cod/Referencia se metían adentro del concepto (y así ningún movimiento
 * deduplicaba contra la base), y varios conceptos tienen espacios largos adentro ("Pago haberes -
 * 260717507        260717507") que `campos()` —que parte por 2+ espacios— cortaba en pedazos,
 * corriendo las columnas. La solución es leer la LÍNEA DE ENCABEZADO, fijar la posición de cada
 * columna, y para las filas de datos partir SÓLO por `;`.
 *
 * @returns {{fecha:number, concepto:number, importe:number, saldo:number|null}|null}
 */
function encabezadoCsvBanco(linea) {
  if (!linea.includes(';')) return null
  const partes = linea.split(';').map((s) => s.toLowerCase().trim())
  if (partes[0] !== 'fecha') return null
  const iConcepto = partes.indexOf('concepto')
  const iImporte = partes.indexOf('importe')
  const iSaldo = partes.indexOf('saldo')
  // LA REFERENCIA ES LA CLAVE DEL MOVIMIENTO Y SE VENÍA TIRANDO (30/07). Es el identificador del banco:
  // no cambia entre descargas, al contrario del saldo corrido —que depende de la ventana y por eso dejó
  // entrar 62 movimientos duplicados—. Y para los cheques ES el número de cheque ("0133;000000315;
  // Cheque debitado" → físico 315), así que el cruce contra el extracto pasa a ser una identidad.
  const iRef = partes.indexOf('referencia')
  // Sólo el formato con columnas EXTRA entre fecha y concepto (concepto no es la columna 1): ése es el
  // que el parseo genérico no sabe leer. Un "fecha;concepto;importe" común sigue por la vía de siempre.
  if (iConcepto < 2 || iImporte < 2) return null
  return { fecha: 0, concepto: iConcepto, importe: iImporte, saldo: iSaldo >= 0 ? iSaldo : null, referencia: iRef >= 0 ? iRef : null }
}

/**
 * La referencia, normalizada: sólo dígitos y sin ceros a la izquierda.
 *
 * POR QUÉ NORMALIZAR. El banco la escribe con relleno ("000000315") y en otras filas sin él
 * ("16862006"). Como clave única el relleno da igual, pero para cruzar contra un cheque —cuyo número
 * el OS guarda como "00000315" o "315" según de dónde salió— hay que compararlos en la misma forma.
 * Se conserva '' → null: una referencia vacía NO es una referencia, y guardarla como cadena vacía
 * haría que dos movimientos sin referencia choquen contra el índice único.
 */
export function normalizarReferencia(v) {
  const s = String(v ?? '').replace(/\D/g, '').replace(/^0+/, '')
  return s === '' ? null : s
}

/** El primer campo de la línea. Sirve para ver si la línea ABRE una fila (arranca con una fecha). */
function empiezaConFecha(linea) {
  const primero = linea.includes(';') ? linea.split(';')[0].trim() : (campos(linea)[0] ?? '')
  return fecha(primero) !== null
}

/** Un token que es un importe DE VERDAD y no un número escondido en el concepto (CUIT, nº de tarjeta,
 *  Id debin): tiene dígitos, no tiene letras, y parsea a la argentina. */
const esNumeroPuro = (t) => t !== '' && !/[a-záéíóúñ]/i.test(t) && importe(t) !== null

/**
 * ¿La línea CIERRA una fila? Una fila del extracto termina en el par final `importe;saldo` —o sólo en
 * el importe, en los "Movimientos del Día" que aún no traen saldo—. Su último campo no vacío es un
 * número puro.
 *
 * POR QUÉ EXISTE (28/07). El dueño pega el listado de la banca online y, cuando el concepto es largo
 * ("Transferencia recibida - credin - Id debin <id> cuit <cuit>"), la pantalla lo ENVUELVE y el pegado
 * mete un salto de línea en medio del concepto. La primera mitad arranca con fecha pero su último
 * campo es TEXTO (parte del concepto), así que no cierra: la fila sigue en la línea de abajo. Sin
 * re-unirlas, esos movimientos —entre ellos $30.000.000 y $35.000.000 del cobro de Quattropani— se
 * descartaban y banco_movimientos cortaba en el 24/07.
 */
function cierraFila(linea) {
  const f = linea.includes(';') ? linea.split(';').map((s) => s.trim()) : campos(linea)
  let k = f.length - 1
  while (k >= 0 && f[k] === '') k-- // el saldo puede venir vacío (movimiento del día): no invalida
  return k >= 1 && esNumeroPuro(f[k])
}

export function parsearExtracto(texto, { anio = new Date().getFullYear() } = {}) {
  const movimientos = []
  const rechazos = []
  const lineas = String(texto ?? '').split('\n')
  let cols = null // mapeo posicional, si apareció un encabezado del CSV del banco

  for (let i = 0; i < lineas.length; i++) {
    let cruda = lineas[i].trim()
    if (!cruda) continue
    // Un encabezado del CSV del banco fija el mapeo de columnas y no es un movimiento en sí.
    const cab = encabezadoCsvBanco(cruda)
    if (cab) { cols = cab; continue }
    if (ES_RUIDO.test(cruda)) continue

    // ── RE-UNIR UNA FILA ENVUELTA POR UN SALTO DE LÍNEA ──
    // Si la línea ABRE una fila (arranca con fecha) pero NO cierra (su último campo es texto del
    // concepto, no un importe), el pegado partió el concepto en dos. Se pegan las líneas siguientes
    // —que no abren su propia fila ni son ruido/encabezado— hasta que cierre. Se unen con un espacio:
    // el corte cae dentro de un campo (el concepto), y ese campo se normaliza igual más abajo. Las
    // filas normales de una sola línea ya cierran, así que este bloque ni las toca.
    const numLinea = i + 1
    if (empiezaConFecha(cruda) && !cierraFila(cruda)) {
      let j = i + 1
      while (j < lineas.length) {
        const sig = lineas[j].trim()
        if (encabezadoCsvBanco(sig) || ES_RUIDO.test(sig) || empiezaConFecha(sig)) break
        if (sig) cruda = `${cruda} ${sig}`
        j++
        if (cierraFila(cruda)) break
      }
      // Consumimos sólo las líneas de continuación (el while corta ANTES de una fecha/ruido/encabezado,
      // así que nunca nos comemos la fila siguiente). Si aun así no cerró, la fila unida se parsea igual
      // y caerá en `rechazos` una sola vez, visible, en lugar de desaparecer en silencio.
      i = j - 1
    }

    // ── Vía CSV del banco: columnas fijas, se parte SÓLO por `;` (los conceptos tienen espacios) ──
    if (cols) {
      const p = cruda.split(';').map((s) => s.trim())
      const f = fecha(p[cols.fecha], anio)
      if (!f) { rechazos.push({ linea: numLinea, texto: cruda.slice(0, 90), motivo: `"${p[cols.fecha]}" no es una fecha` }); continue }
      const imp = importe(p[cols.importe])
      if (imp === null) { rechazos.push({ linea: numLinea, texto: cruda.slice(0, 90), motivo: 'no encontré el importe' }); continue }
      const concepto = String(p[cols.concepto] ?? '').replace(/\s+/g, ' ').trim()
      if (!concepto) { rechazos.push({ linea: numLinea, texto: cruda.slice(0, 90), motivo: 'la fila no tiene concepto' }); continue }
      const saldo = cols.saldo != null ? importe(p[cols.saldo]) : null
      const referencia = cols.referencia != null ? normalizarReferencia(p[cols.referencia]) : null
      movimientos.push({ fecha: f, concepto, importe: imp, saldo, referencia })
      continue
    }

    const c = campos(cruda)
    // Una línea de movimiento tiene, como mínimo, fecha + concepto + importe.
    if (c.length < 3) { rechazos.push({ linea: numLinea, texto: cruda.slice(0, 90), motivo: 'no tiene fecha, concepto e importe' }); continue }
    const f = fecha(c[0], anio)
    if (!f) { rechazos.push({ linea: numLinea, texto: cruda.slice(0, 90), motivo: `"${c[0]}" no es una fecha` }); continue }

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
    if (!numericos.length) { rechazos.push({ linea: numLinea, texto: cruda.slice(0, 90), motivo: 'no encontré el importe' }); continue }

    const concepto = c.slice(1, numericos[0].j).join(' ').replace(/\s+/g, ' ').trim()
    if (!concepto) { rechazos.push({ linea: numLinea, texto: cruda.slice(0, 90), motivo: 'la fila no tiene concepto' }); continue }

    // Con dos números, el primero es el importe y el segundo el saldo corrido. Con uno solo —típico
    // de los "Movimientos del Día"— hay importe y todavía no hay saldo: se guarda en null, no en 0.
    // Un saldo 0 inventado rompería la cadena y haría gritar al control sin motivo.
    const imp = numericos[0].n
    const saldo = numericos.length >= 2 ? numericos[numericos.length - 1].n : null
    movimientos.push({ fecha: f, concepto, importe: imp, saldo })
  }

  // EL HOMEBANKING DESCARGA DEL MÁS NUEVO AL MÁS VIEJO. La cadena de saldos —saldo(n)=saldo(n−1)+
  // importe(n)— sólo cierra en orden CRONOLÓGICO. Si el extracto viene en fechas descendentes, se
  // invierte entero (invertir también corrige el orden DENTRO de cada día, que también viene al revés).
  // Un pegado ya cronológico o de un solo movimiento no se toca.
  if (movimientos.length > 1) {
    const conFecha = movimientos.filter((m) => m.fecha)
    if (conFecha.length > 1 && conFecha[0].fecha > conFecha[conFecha.length - 1].fecha) movimientos.reverse()
  }

  // BACK-FILL DEL SALDO INTRADÍA. Las filas de "Movimientos del Día" (los cheques debitados HOY) vienen
  // sin saldo declarado, pero su saldo corrido se DEDUCE de la cadena: saldo anterior + importe. No es
  // inventar un número —es el mismo que el banco imprime en "Saldo al DD/MM"—. Sin esto, CAJA toma el
  // último saldo POSTEADO (el de ayer) e ignora los débitos de hoy: el saldo queda inflado. Sólo se
  // completa cuando hay un saldo previo con qué encadenar; si arranca en null, se respeta el null.
  let corrido = null
  for (const m of movimientos) {
    if (m.saldo != null) { corrido = Number(m.saldo); continue }
    if (corrido == null) continue
    corrido = Number((corrido + Number(m.importe)).toFixed(2))
    m.saldo = corrido
  }

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
    // ═══ UN MOVIMIENTO SIN SALDO IGUAL MUEVE LA PLATA ═══
    //
    // La primera versión los SALTEABA, y eso rompía la cadena en el primer movimiento con saldo que
    // viniera después: los "Movimientos del Día" (el cheque Nº 221, la transferencia a Katsuda, la
    // recibida de Manufacturas) suman −$465.732,51 que el arrastre no estaba contando. Contra el
    // extracto real daba un corte de $-609.232,51 —el saldo pendiente de conciliar entero— cuando la
    // parte que el banco de verdad no explica es sólo $-143.500. Un control que exagera el problema
    // es tan inútil como uno que lo tapa: no se sabe cuánto mirar.
    //
    // Sin saldo declarado no hay nada que comparar, pero SÍ hay que arrastrar el importe.
    if (m.saldo == null) {
      if (anterior != null) anterior += Number(m.importe)
      continue
    }
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

/**
 * DRY-RUN: parsea un texto de extracto y devuelve las filas + el veredicto de la cadena de saldos.
 * NO toca red ni base — es sólo el núcleo puro encadenado, para mirar un extracto antes de importarlo.
 *
 * @param {string} texto
 * @param {{anio?:number, saldoInicial?:number|null}} opts
 */
export function dryRun(texto, { anio, saldoInicial = null } = {}) {
  const { movimientos, rechazos } = parsearExtracto(texto, anio != null ? { anio } : {})
  const cadena = verificarCadena(movimientos, saldoInicial)
  return { movimientos, rechazos, cadena }
}

// ── CLI DE DRY-RUN (sin red ni base) ────────────────────────────────────────────────────────────
// Para que main mire el extracto 25-28/07 real ANTES de importar nada:
//   node orquestador/lib/banco-importar.mjs --dry-run < extracto.txt
//   node orquestador/lib/banco-importar.mjs --dry-run extracto.txt [saldoInicial]
// Imprime cada fila parseada, los rechazos, y si la cadena de saldos cierra. No escribe nada.
if (import.meta.url === `file://${process.argv[1]}` && process.argv.includes('--dry-run')) {
  const { readFileSync } = await import('node:fs')
  const args = process.argv.slice(2).filter((a) => a !== '--dry-run')
  const posiblePath = args.find((a) => !/^-?[\d.,]+$/.test(a))
  const saldoInicial = (() => {
    const s = args.find((a) => /^-?[\d.,]+$/.test(a))
    return s == null ? null : importe(s)
  })()
  const texto = posiblePath ? readFileSync(posiblePath, 'utf8') : readFileSync(0, 'utf8')
  const { movimientos, rechazos, cadena } = dryRun(texto, { saldoInicial })

  const fmt = (n) => (n == null ? '—' : Number(n).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))
  console.log(`\nMOVIMIENTOS PARSEADOS: ${movimientos.length}`)
  for (const m of movimientos) {
    console.log(`  ${m.fecha}  imp ${fmt(m.importe).padStart(18)}  saldo ${fmt(m.saldo).padStart(18)}  ${m.concepto.slice(0, 70)}`)
  }
  if (rechazos.length) {
    console.log(`\nRECHAZOS: ${rechazos.length}`)
    for (const r of rechazos) console.log(`  línea ${r.linea}: ${r.motivo} — ${r.texto}`)
  }
  console.log(`\nCADENA DE SALDOS: ${cadena.ok ? 'CIERRA ✓' : `NO CIERRA — ${cadena.cortes.length} corte(s)`}`)
  for (const c of cadena.cortes) {
    console.log(`  ${c.fecha} ${c.concepto.slice(0, 40)}: esperado ${fmt(c.esperado)} vs declarado ${fmt(c.declarado)} (dif ${fmt(c.diferencia)})`)
  }
  console.log('')
}
