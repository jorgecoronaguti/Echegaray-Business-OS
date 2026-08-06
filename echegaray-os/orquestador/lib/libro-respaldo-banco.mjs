// EL EXTRACTO COMO TESTIGO — qué compromiso del libro ya está adentro del saldo del banco.
//
// ═══ POR QUÉ EXISTE (06/08/2026) ═══
//
// El libro clasifica cada movimiento por lo que dice SU pestaña de origen. Eso alcanza mientras la
// pestaña y el banco cuenten lo mismo, y deja de alcanzar en los dos casos que se midieron hoy sobre
// el archivo vivo:
//
//   · LA CUOTA DE TARJETA YA PAGADA QUE SIGUE COMPROMETIDA. "Tarjeta de Credito" f46 (Pinturería
//     Córdoba, cuota 1/3, $263.813,91, vence 02/08) no tiene la marca DEBITADO puesta, así que el
//     extractor la emite COMPROMETIDA. Pero el resumen VISA ya se debitó: `_BANCO_RAW` tiene un
//     "Pago tarjeta de credito visa" de $1.384.664,47 el 03/08. Ese débito CONTIENE la cuota. El
//     tramo "Vencido" de la escalera mostraba −$487.814 cuando el vencido real es $224.000 (la parte
//     abierta de PEDRO TELLO, Compras f821): los otros $263.814 ya estaban pagos.
//
//   · EL RETIRO DE DIRECCIÓN "PAGADO" CON FECHA FUTURA. La planilla de nómina marca julio como
//     pagado ($9.000.000, tres socios) con fecha de caja 10/08 — POSTERIOR al corte del extracto
//     (06/08). Un "Pagado" con fecha futura entraba como REAL, y un REAL no lo mira ninguna de las
//     vistas de proyección porque se asume que ya está en el saldo del banco. No estaba: el extracto
//     termina el 06/08. Nueve millones invisibles, ni en COMPROMETIDA ni en la línea de posteriores
//     al corte. Es la misma causa raíz que `caja-canales.mjs` documenta para Compras — "Pagado con un
//     cheque no quiere decir que la plata salió" — del lado de la nómina.
//
// ═══ LA REGLA DE ORO DE ESTE ARCHIVO: ANTE LA DUDA, EL COMPROMISO SIGUE VIVO ═══
//
// Los dos casos se resuelven buscando respaldo en el extracto, y buscar respaldo por MONTO es
// adivinar salvo que la coincidencia sea única. Los dos errores posibles no valen lo mismo:
//
//   · decir que se debe $9M cuando se deben $3M  → se reserva plata de más. Cuesta oportunidad.
//   · decir que se debe $3M cuando se deben $9M  → se planifica un pago que no se puede hacer.
//
// El segundo es el que rompe una tesorería, así que cuando el emparejamiento no es único este módulo
// NO empareja y lo dice. Es la regla del repo: no escribir donde el mapeo dice que no.
//
// NÚCLEO PURO. No lee Google, no escribe, no toca la base: recibe las filas ya leídas de `_BANCO_RAW`
// y devuelve decisiones, que es lo que se puede probar en frío con el caso real armado a mano.

import { NAT } from './banco-santander.mjs'

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const txt = (v) => String(v ?? '').trim()

/** La primera fila de datos de `_BANCO_RAW`: 1 rótulo, 2 nota de la réplica, 3 encabezado. */
export const FILA0_BANCO = 4

/**
 * NÚCLEO PURO: los DÉBITOS del extracto — fecha, concepto, naturaleza e importe en MAGNITUD.
 *
 * El importe se devuelve positivo a propósito: acá "cuánto salió" es una magnitud y el sentido ya lo
 * fija el nombre de la función. Guardar −3.000.000 y además llamarlo débito es tener el mismo hecho
 * dos veces, y el día que uno de los dos se invierta la comparación da un número plausible y
 * equivocado — es la misma razón por la que `movimiento()` separa importe y signo.
 *
 * @param {Array<Array>} filas `_BANCO_RAW`: A fecha · B concepto · C importe · F naturaleza
 * @returns {Array<{fecha:number, concepto:string, importe:number, naturaleza:string, fila:number}>}
 */
export function debitosDelExtracto(filas = [], { fila0 = FILA0_BANCO } = {}) {
  const out = []
  for (let i = fila0 - 1; i < filas.length; i++) {
    const f = filas[i] ?? []
    const fecha = num(f[0])
    const importe = num(f[2])
    if (fecha === null || importe === null || importe >= 0) continue
    out.push({ fecha, concepto: txt(f[1]), importe: -importe, naturaleza: txt(f[5]), fila: i + 1 })
  }
  return out
}

/**
 * NÚCLEO PURO: el CORTE del extracto — la última fecha que el banco publicó.
 *
 * Se deriva del dato y no se recibe por parámetro porque es una propiedad de la réplica: el día que
 * el extracto se actualice, el corte se mueve solo. Un corte tipeado se queda viejo sin gritar.
 */
export function corteDelExtracto(filas = [], { fila0 = FILA0_BANCO } = {}) {
  let max = null
  for (let i = fila0 - 1; i < filas.length; i++) {
    const fecha = num((filas[i] ?? [])[0])
    if (fecha !== null && (max === null || fecha > max)) max = fecha
  }
  return max
}

// ── LA TARJETA: EL RESUMEN QUE SE DEBITÓ CONTIENE SUS CUOTAS ──────────────────────────────────────

/**
 * NÚCLEO PURO: los débitos del RESUMEN de la tarjeta, por su naturaleza.
 *
 * La naturaleza la escribe el importador (`banco-santander.mjs`) y se importa de `NAT.tarjeta` en vez
 * de tipear el rótulo: el mismo texto lo usan `conciliacion-por-naturaleza` y `tarjeta-pestana`, y
 * escrito cuatro veces se desincroniza el día que alguien lo renombre — sin dar un solo error, porque
 * un filtro que no encuentra filas devuelve cero.
 *
 * OJO CON EL PARECIDO: "Compras con tarjeta de débito" NO es un pago de resumen. Es plata que sale en
 * el momento, con la tarjeta de débito, y no cancela ninguna cuota. Por eso se filtra por naturaleza
 * exacta y no por un `/tarjeta/` sobre el concepto, que las agarraría a las dos.
 */
export function pagosDeResumen(filas = [], { fila0 = FILA0_BANCO } = {}) {
  return debitosDelExtracto(filas, { fila0 })
    .filter((d) => d.naturaleza === NAT.tarjeta)
    .sort((a, b) => a.fecha - b.fecha)
}

/**
 * NÚCLEO PURO: ¿el resumen ya se pagó, y por lo tanto esta cuota ya salió de la cuenta?
 *
 * LA REGLA, EN UNA ORACIÓN: una cuota cuyo vencimiento ya pasó cuando el banco debitó un resumen está
 * ADENTRO de ese débito — el resumen de la tarjeta es la suma de lo que vence en el período.
 *
 * SE DEVUELVE EL PRIMER DÉBITO EN O DESPUÉS DEL VENCIMIENTO, no el último ni el más grande: es el
 * resumen del ciclo al que la cuota pertenece. Medido en vivo: cuota del 02/08 → débito del 03/08.
 *
 * Y SI NO HAY NINGUNO, LA CUOTA SIGUE COMPROMETIDA. Es la mitad conservadora de la regla y es la que
 * importa: sin débito posterior no hay ninguna evidencia de que esa plata haya salido, y darla por
 * pagada sacaría de la escalera un compromiso vivo.
 *
 * @param {number} vencimiento serial de la fecha de pago de la cuota
 * @param {Array<{fecha:number}>} pagos los débitos de resumen, de `pagosDeResumen`
 * @returns {number|null} el serial del débito que la contiene, o null si todavía no se debitó
 */
export function cubiertaPorResumen(vencimiento, pagos = []) {
  if (!Number.isFinite(vencimiento) || vencimiento <= 0) return null
  const cubre = pagos.filter((p) => p.fecha >= vencimiento).sort((a, b) => a.fecha - b.fecha)
  return cubre.length ? cubre[0].fecha : null
}

// ── EL LOTE: UN PAGO "HECHO" CON FECHA FUTURA, PARTIDO CONTRA EL EXTRACTO ─────────────────────────

/**
 * Cuántos días antes de la fecha prevista se acepta un lote como respaldo.
 *
 * Dos meses: un retiro o una liquidación se adelanta o se atrasa unas semanas, no medio año. Sin este
 * techo, un lote de febrero podría respaldar un pago de agosto sólo porque los montos dan.
 */
export const HOLGURA_LOTE = 62

/** Cuántas partes iguales puede tener un bloque mensual. Tres socios, cinco sueldos: no cuarenta y
 *  cinco. Es lo que descarta que dos débitos de $200.000 "expliquen" $9.000.000 por ser divisores. */
export const PARTES_MAXIMAS = 12

/**
 * NÚCLEO PURO: ¿cuánto de este importe ya salió, según el extracto?
 *
 * ═══ QUÉ CUENTA COMO RESPALDO, Y POR QUÉ ASÍ ═══
 *
 * Un LOTE: dos o más débitos del MISMO DÍA y del MISMO MONTO, cuyo monto divide exacto el importe
 * buscado. Los tres requisitos hacen trabajo y ninguno sobra:
 *
 *   · MISMO DÍA — un bloque de nómina o de retiros se paga en una tanda. Débitos sueltos de distintos
 *     días que sumen el total es una coincidencia aritmética, no un lote.
 *   · MISMO MONTO, ≥2 — es la firma de una distribución (tres socios, el mismo retiro). Un débito
 *     solo que casualmente divide el total no prueba nada: medido en vivo, una transferencia de
 *     $750.000 a Herrajes San Juan divide $9.000.000 y no tiene nada que ver.
 *   · DIVIDE EXACTO Y EN ≤12 PARTES — $9.000.000 / $3.000.000 = 3 partes ✓; $9.000.000 / $200.000 =
 *     45 partes ✗. Sin este límite, cualquier par de débitos chicos "explica" cualquier total.
 *
 * Sobre el extracto vivo del 06/08 esas tres condiciones dejan UN solo candidato para los $9.000.000
 * de Dirección: los dos débitos de $3.000.000 del 03/08. Si dejaran dos, este módulo no empareja.
 *
 * ═══ AMBIGUO = NO SE APLICA, Y SE DICE ═══
 *
 * Con más de un lote candidato no hay forma de saber cuál es, y elegir "el más grande" sería inventar
 * un criterio para no quedarse sin respuesta. El resultado es `cubierto: 0` con el motivo escrito,
 * que deja el compromiso entero vivo — el lado seguro del error.
 *
 * @param {number} importe el total del movimiento
 * @param {number} prevista serial de la fecha en que la planilla dice que se paga
 * @param {Array} debitos los del extracto (`debitosDelExtracto`)
 * @param {{corte:number, usados?:Set<number>, holgura?:number}} ctx `usados` marca las FILAS de
 *        `_BANCO_RAW` ya reclamadas por otro movimiento: un débito respalda a uno solo.
 * @returns {{cubierto:number, fecha:number|null, filas:number[], motivo:string}}
 */
export function respaldoEnLote(importe, prevista, debitos = [], { corte, usados = new Set(), holgura = HOLGURA_LOTE } = {}) {
  const nada = (motivo) => ({ cubierto: 0, fecha: null, filas: [], motivo })
  if (!Number.isFinite(importe) || importe <= 0) return nada('sin importe')
  if (!Number.isFinite(corte)) return nada('sin corte del extracto: no sé hasta dónde llega lo que el banco publicó')
  const desde = Number.isFinite(prevista) ? prevista - holgura : corte - holgura
  const lotes = new Map()
  for (const d of debitos) {
    if (usados.has(d.fila)) continue
    if (d.fecha > corte || d.fecha < desde) continue
    const clave = `${d.fecha}|${d.importe}`
    if (!lotes.has(clave)) lotes.set(clave, [])
    lotes.get(clave).push(d)
  }
  const candidatos = []
  for (const grupo of lotes.values()) {
    const unidad = grupo[0].importe
    if (grupo.length < 2 || unidad > importe) continue
    const partes = importe / unidad
    if (!Number.isInteger(partes) || partes > PARTES_MAXIMAS) continue
    const usar = grupo.slice(0, partes)
    candidatos.push({
      cubierto: usar.length * unidad,
      fecha: Math.max(...usar.map((d) => d.fecha)),
      filas: usar.map((d) => d.fila),
    })
  }
  if (!candidatos.length) return nada('ningún lote del extracto (≥2 débitos iguales del mismo día) divide este importe')
  if (candidatos.length > 1) {
    return nada(`${candidatos.length} lotes del extracto podrían explicarlo y no sé cuál es — no empareje`)
  }
  const c = candidatos[0]
  return { ...c, motivo: `respaldado por ${c.filas.length} débito(s) iguales de _BANCO_RAW` }
}

/** Un débito del extracto que ES un cheque saliendo: el papel presentado o el echeq canjeado. */
const ES_DEBITO_DE_CHEQUE = /cheque debitado|echeq (canje|clearing)|canje interno recibido/i

/**
 * NÚCLEO PURO: los cheques del libro que el banco YA debitó — la corrección del 06/08.
 *
 * ═══ EL CASO QUE ESTO CURA (dueño, textual: "hay cheques q ya fueron pagados") ═══
 *
 * El banco debitó DOS cheques de $500.000 el 24/07 (refs 314/315) y el libro seguía contando la
 * cuota en cheque de Diesel Rodriguez como COMPROMETIDA al 12/08 — $500.000 de obligación que ya
 * había salido de la cuenta. La fuente de estados (`public.cheques`) tenía corte 31/07 y nadie
 * grita cuando envejece: el extracto es la única verdad.
 *
 * LA REGLA ES POR IMPORTE EXACTO Y POR CONTEO, no por número (Compras no siempre lo tiene, y el
 * número sin el instrumento no identifica — trampa conocida):
 *   1. se toman SÓLO los débitos con concepto de cheque (`ES_DEBITO_DE_CHEQUE`);
 *   2. cada movimiento REAL del libro con instrumento cheque/echeq CONSUME primero su débito de
 *      igual importe (el más cercano en fecha) — sin este paso, el débito del cheque ya contado
 *      cubriría además al pendiente y el mismo papel pagaría dos veces;
 *   3. una cuota pendiente queda CUBIERTA sólo si los débitos restantes de su importe EXACTO
 *      alcanzan para TODAS las pendientes de ese importe — si hay más pendientes que débitos, no
 *      se cubre ninguna: decir "pagado" de más es el error que rompe una tesorería.
 *
 * El $1 de diferencia ya probó ser señal, no ruido: el débito de $470.945 NO cubre la cuota de
 * $470.944 — y está bien, porque ese débito es el cheque 313 que el libro ya tiene como REAL.
 *
 * @param {Array} movimientos el libro completo (se lee, no se muta)
 * @param {Array} debitos `debitosDelExtracto(banco)`
 * @returns {{cubiertos:Map<number,{fecha:number,fila:number}>, avisos:string[]}} índice del
 *   movimiento → con qué débito quedó cubierto
 */
export function chequesCubiertosPorBanco(movimientos = [], debitos = []) {
  const esCheque = (m) => m?.signo === -1 && /cheq/i.test(String(m?.instrumento ?? ''))
  const deCheque = debitos.filter((d) => ES_DEBITO_DE_CHEQUE.test(d.concepto))
  const libres = new Map() // importe exacto → débitos no consumidos
  for (const d of deCheque) {
    if (!libres.has(d.importe)) libres.set(d.importe, [])
    libres.get(d.importe).push(d)
  }
  // Paso 2: lo REAL consume primero.
  for (const m of movimientos) {
    if (!esCheque(m) || m.estado !== 'REAL') continue
    const grupo = libres.get(m.importe)
    if (!grupo?.length) continue
    grupo.sort((a, b) => Math.abs(a.fecha - m.fecha) - Math.abs(b.fecha - m.fecha))
    grupo.shift()
  }
  // Paso 3: conteo por importe exacto sobre lo pendiente.
  const pendientes = new Map()
  movimientos.forEach((m, i) => {
    if (!esCheque(m) || m.estado === 'REAL') return
    if (!pendientes.has(m.importe)) pendientes.set(m.importe, [])
    pendientes.get(m.importe).push(i)
  })
  const cubiertos = new Map()
  const avisos = []
  for (const [importe, indices] of pendientes) {
    const grupo = (libres.get(importe) ?? []).sort((a, b) => a.fecha - b.fecha)
    if (!grupo.length) continue
    if (grupo.length < indices.length) {
      avisos.push(`respaldo-banco: ${grupo.length} débito(s) de $${importe} contra ${indices.length} `
        + 'cheque(s) pendientes del mismo importe — ambiguo, no cubro ninguno')
      continue
    }
    indices.forEach((i, k) => cubiertos.set(i, { fecha: grupo[k].fecha, fila: grupo[k].fila }))
  }
  return { cubiertos, avisos }
}
