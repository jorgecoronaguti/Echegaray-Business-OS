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

/** El importe a la argentina: "1.234,56" / "-1.234,56" / "$ 1.234,56-" / "(1.234,56)" → número. */
export function importe(txt) {
  let s = String(txt ?? '').trim()
  if (!s) return null
  // El signo puede venir al final ("1.234,56-"), como en varios exports de homebanking.
  const negativoAlFinal = /-\s*$/.test(s)
  // ═══ EL PARÉNTESIS ES UN SIGNO MENOS ═══
  //
  // La descarga CSV del Santander Empresas NO usa el guión: escribe los débitos y los saldos
  // negativos entre paréntesis — "(168.730,09)", "(7.462.120,94)". La primera versión de este
  // archivo limpiaba todo lo que no fuera dígito, coma, punto o guión, así que el paréntesis
  // desaparecía y CADA DÉBITO ENTRABA COMO CRÉDITO. No da error: da una cuenta que sube cuando
  // en realidad baja. Se detectó el 23/07 comparando el extracto contra los 127 movimientos ya
  // cargados: los 128 del archivo daban todos positivos.
  const entreParentesis = /^\(.*\)$/.test(s)
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
// `saldo al` se saltea acá porque lo lee `saldoDeclarado()` aparte: es el control final del archivo,
// no un movimiento. La marca de hora ("23/07/2026 11:50:45") y el rótulo de cada bloque son parte de
// la estructura del export: informarlos como "líneas que no entendí" en cada corrida es ruido, y el
// ruido constante hace que nadie mire las líneas que sí importan.
const ES_RUIDO = /^(fecha\b|saldo (inicial|final|anterior|al)\b|movimientos|[úu]ltimos movimientos|cuenta|per[ií]odo|total\b|p[áa]gina|banco santander|consolidado|\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\s+\d{1,2}:\d{2}(:\d{2})?$|=+$|-+$)/i

/**
 * ¿Esta línea es el ENCABEZADO de columnas del export? Si lo es, devuelve dónde está cada cosa.
 *
 * POR QUÉ (23/07). La descarga CSV del Santander trae ocho columnas:
 *   Fecha;Suc. Origen;Desc. Sucursal;Cod. Operativo;Referencia;Concepto;Importe;Saldo
 * La heurística de "todo lo del medio es el concepto" pega el código operativo y la referencia
 * adentro del texto ("0179 San Juan 4633 000008508 Impuesto ley 25.413…"). Eso no da error: da un
 * concepto distinto del que ya está cargado, la deduplicación no lo reconoce y el movimiento entra
 * DOS VECES. Cuando el archivo dice dónde está cada columna, no hay nada que adivinar.
 */
export function encabezado(c = []) {
  const norm = c.map((x) => String(x).toLowerCase().replace(/[.\s]/g, ''))
  const iFecha = norm.indexOf('fecha')
  const iConcepto = norm.indexOf('concepto')
  const iImporte = norm.indexOf('importe')
  const iSaldo = norm.indexOf('saldo')
  if (iFecha < 0 || iConcepto < 0 || iImporte < 0) return null
  return { fecha: iFecha, concepto: iConcepto, importe: iImporte, saldo: iSaldo }
}

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
  // El mapa de columnas vale desde el encabezado que lo declaró hasta el próximo. Un mismo archivo
  // trae dos bloques ("Movimientos del Día" y "Últimos Movimientos"), cada uno con su encabezado.
  let mapa = null

  lineas.forEach((linea, i) => {
    const cruda = linea.trim()
    if (!cruda) return
    const c = campos(cruda)

    const enc = encabezado(c)
    if (enc) { mapa = enc; return }
    if (ES_RUIDO.test(cruda)) return

    // ── Con encabezado: cada columna en su lugar, sin adivinar ──
    if (mapa && c.length > mapa.importe && c.length > mapa.concepto) {
      const f = fecha(c[mapa.fecha], anio)
      if (!f) { rechazos.push({ linea: i + 1, texto: cruda.slice(0, 90), motivo: `"${c[mapa.fecha]}" no es una fecha` }); return }
      const imp = importe(c[mapa.importe])
      if (imp === null) { rechazos.push({ linea: i + 1, texto: cruda.slice(0, 90), motivo: 'no encontré el importe' }); return }
      const concepto = String(c[mapa.concepto] ?? '').replace(/\s+/g, ' ').trim()
      if (!concepto) { rechazos.push({ linea: i + 1, texto: cruda.slice(0, 90), motivo: 'la fila no tiene concepto' }); return }
      // La columna Saldo viene VACÍA en los movimientos del día: es null, nunca cero. Un cero
      // inventado rompería la cadena y haría gritar al control sin motivo.
      const saldo = mapa.saldo >= 0 ? importe(c[mapa.saldo]) : null
      movimientos.push({ fecha: f, concepto, importe: imp, saldo })
      return
    }

    // ── Sin encabezado (pegado de pantalla, texto de una captura): la heurística ──
    // Una columna final vacía (el Saldo que todavía no existe) dejaría la búsqueda del importe sin
    // arrancar: importe('') es null y el barrido corta en el primer campo.
    while (c.length > 3 && c[c.length - 1] === '') c.pop()
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

/** El movimiento SIN el saldo. Identifica el hecho económico; el saldo es lo que el banco dice que
 *  quedó después, y eso puede haberse cargado mal sin que el hecho cambie. */
export const claveSinSaldo = (m) => `${m.fecha}|${String(m.concepto).toLowerCase().replace(/\s+/g, ' ').trim()}|${Number(m.importe).toFixed(2)}`

/**
 * NÚCLEO PURO: emparejar lo que ya está con lo que dice el extracto, por el hecho económico.
 *
 * POR QUÉ EXISTE (23/07). La descarga real del Santander demostró que los 127 movimientos que había
 * cargados tenían TODOS los saldos $143.500 más altos que los del banco: venían de una transcripción
 * manual anterior arrastrada desde un saldo de apertura equivocado, y para que la serie cerrara se
 * había agregado una fila inventada —"Diferencia sin detalle del banco (hold intradía)", −$143.500—
 * que compensaba el error. Dos errores que se tapaban entre sí.
 *
 * Los movimientos eran los correctos: lo que estaba mal era el saldo. Emparejando por
 * fecha+concepto+importe (el hecho, sin el saldo) se ve exactamente eso, y el banco gana: el saldo
 * corrido es un dato del banco, no una opinión del OS.
 *
 * Las repeticiones se emparejan EN ORDEN (tres "Cheque debitado" de $200.000 el mismo día son tres
 * movimientos distintos y sólo el saldo los separa), así que ambas listas tienen que venir en el
 * orden real del extracto.
 *
 * @returns {{pares:{base:object,banco:object}[], soloBase:object[], soloExtracto:object[]}}
 */
export function emparejar(existentes = [], leidos = []) {
  const usados = new Set()
  const pares = []

  // Un índice por clave, con las posiciones en orden. `shift()` consume la primera libre: así las
  // repeticiones se emparejan en el orden en que ocurrieron.
  const indexar = (fn) => {
    const m = new Map()
    existentes.forEach((x, i) => {
      if (usados.has(i)) return
      const k = fn(x)
      if (!m.has(k)) m.set(k, [])
      m.get(k).push(i)
    })
    return m
  }

  // ── Pasada 1: el hecho completo (fecha + concepto + importe) ──
  const porTexto = indexar(claveSinSaldo)
  const resto = []
  for (const b of leidos) {
    const cola = porTexto.get(claveSinSaldo(b))
    const i = cola && cola.length ? cola.shift() : undefined
    if (i === undefined) { resto.push(b); continue }
    usados.add(i)
    pares.push({ base: existentes[i], banco: b })
  }

  // ── Pasada 2: fecha + importe, para los que sobraron ──
  //
  // POR QUÉ HACE FALTA. El concepto que hay cargado no es el del banco palabra por palabra: se
  // limpió a mano al transcribirlo ("Pago haberes - 260701507" contra "Pago haberes - 260701507
  // 260701507", "Cheque debitado - Nº 221" contra "Cheque debitado"). Exigir el texto idéntico
  // dejaba 33 movimientos sin emparejar y los volvía a insertar: el mismo débito dos veces.
  // Fecha+importe alcanza porque el emparejamiento es por multiplicidad —si el banco lista tres
  // débitos de $200.000 ese día, hay exactamente tres cargados— y lo que sobra se informa.
  const porMonto = indexar((m) => `${m.fecha}|${Number(m.importe).toFixed(2)}`)
  const soloExtracto = []
  for (const b of resto) {
    const cola = porMonto.get(`${b.fecha}|${Number(b.importe).toFixed(2)}`)
    const i = cola && cola.length ? cola.shift() : undefined
    if (i === undefined) { soloExtracto.push(b); continue }
    usados.add(i)
    pares.push({ base: existentes[i], banco: b })
  }

  const soloBase = existentes.filter((_, i) => !usados.has(i))
  return { pares, soloBase, soloExtracto }
}

/**
 * NÚCLEO PURO: el "Saldo al DD/MM/AAAA X" que el extracto DECLARA, aparte del corrido de cada fila.
 *
 * POR QUÉ IMPORTA (23/07). El extracto de ese día trae dos movimientos sin saldo corrido —una compra
 * de $168.730,09 y un depósito de e-cheq de $3.940.000— y abajo declara "Saldo al 23/07/2026
 * 4.813.461,54". Ese número es el control final: cierra con el último saldo confirmado MENOS la
 * compra, y SIN el depósito. Dicho de otro modo, el banco todavía no acreditó los $3,94M (e-cheq de
 * otras plazas, 48 hs de clearing). Sin este dato habría que suponer cuál de los dos movimientos del
 * día ya impactó, y suponer sobre plata es exactamente lo que no se hace.
 *
 * @returns {{fecha:string, saldo:number}|null}
 */
export function saldoDeclarado(texto, anio = new Date().getFullYear()) {
  const m = /saldo\s+al\s+(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})\s*:?\s*\$?\s*(\(?-?[\d.]+,\d{2}\)?)/i.exec(String(texto ?? ''))
  if (!m) return null
  const f = fecha(m[1], anio)
  const s = importe(m[2])
  if (!f || s === null) return null
  return { fecha: f, saldo: s }
}

/**
 * NÚCLEO PURO: el mismo movimiento no entra dos veces por venir en los dos bloques del archivo.
 *
 * La descarga trae "Movimientos del Día" (sin saldo corrido, porque todavía no se liquidó) y
 * "Últimos Movimientos" (ya con saldo). Un movimiento que aparece en los dos es UNO SOLO: se queda
 * el que trae saldo, que es el que el banco ya confirmó.
 *
 * Las repeticiones legítimas no se tocan: tres cheques de $200.000 el mismo día vienen los tres con
 * saldo distinto, así que ninguno tiene saldo nulo y ninguno se descarta.
 */
export function sinDuplicadosDelDia(movs = []) {
  const conSaldo = new Map()
  for (const m of movs) {
    if (m.saldo == null) continue
    const k = claveSinSaldo(m)
    conSaldo.set(k, (conSaldo.get(k) || 0) + 1)
  }
  return movs.filter((m) => {
    if (m.saldo != null) return true
    const k = claveSinSaldo(m)
    const n = conSaldo.get(k) || 0
    if (n <= 0) return true
    conSaldo.set(k, n - 1)
    return false
  })
}

/**
 * NÚCLEO PURO: de los emparejados, cuáles tienen el saldo distinto del que dice el banco.
 *
 * Sólo cuenta cuando el banco DECLARA un saldo: los movimientos del día vienen sin saldo corrido y
 * eso no es motivo para borrar el que ya estaba.
 */
export function saldosACorregir(pares = [], tolerancia = 0.005) {
  const out = []
  for (const { base, banco } of pares) {
    if (banco.saldo == null) continue
    if (base.saldo != null && Math.abs(Number(base.saldo) - Number(banco.saldo)) <= tolerancia) continue
    out.push({ base, saldoBase: base.saldo == null ? null : Number(base.saldo), saldoBanco: Number(banco.saldo) })
  }
  return out
}

/**
 * NÚCLEO PURO: el saldo de apertura que el propio extracto implica.
 *
 * saldo(1) − importe(1). Preferirlo a una constante escrita a mano es lo que habría evitado el error
 * de los $143.500: una constante equivocada no se puede detectar, un saldo derivado del banco sí.
 */
export function saldoAperturaSegun(movs = []) {
  const i = movs.findIndex((m) => m.saldo != null)
  if (i < 0) return null
  // Si la serie arranca con movimientos sin saldo, sus importes también hay que descontarlos: ya
  // movieron la plata aunque el banco todavía no muestre el corrido.
  let s = Number(movs[i].saldo)
  for (let j = i; j >= 0; j--) s -= Number(movs[j].importe)
  return s
}

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
