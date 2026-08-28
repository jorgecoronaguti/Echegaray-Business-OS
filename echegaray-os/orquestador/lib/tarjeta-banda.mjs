// LA BANDA DE "Tarjeta de Credito" — NÚCLEO PURO: no mira el reloj, la red ni la base.
//
// ═══ LA PESTAÑA CONTESTA LAS CINCO PREGUNTAS DEL DUEÑO, EN SU ORDEN ═══
//
// Textual, el 28/08/2026: «no me sirve la pestaña, nada de la información que expresa es lo que
// necesito. Quiero saber CUÁNTO TENGO QUE PAGAR en ambos saldos, ARS y USD, QUÉ ME ESTÁN COBRANDO en
// los resúmenes, SI YA SE PAGÓ, CUÁNTO PUEDE VENIR LA PRÓXIMA. Rehacer toda la pestaña, y cuando
// empiece a enviar los resúmenes se debe actualizar».
//
// Lo que había contestaba otras cuatro —cuánto puedo gastar, cuánto vence, cuánto me costó, si la
// uso como financiamiento— y su titular era el DISPONIBLE. El disponible sale del homebanking, no
// del resumen: había que sacarle una captura a mano, y por eso se publicaba con el aviso «foto de
// hace 30 días». Un número que envejece solo no puede ser el titular de la pestaña. Ahora el titular
// es LO QUE HAY QUE PAGAR, que sale del resumen y tiene fecha cierta.
//
// ═══ DE DÓNDE SALE CADA COSA — Y POR QUÉ NO TODO PUEDE SER FÓRMULA ═══
//
//   · Lo del RESUMEN (a debitar, cargos, cuotas comprometidas, pago mínimo) se PEGA, con su fecha y
//     su semáforo de antigüedad: no existe en ninguna otra pestaña del archivo, así que no hay
//     fórmula posible. Entra por `scripts/importar-tarjeta.mjs` desde el PDF y vive en Postgres.
//   · Lo del BANCO (si el débito ocurrió, cuándo y por cuánto) es FÓRMULA sobre `_BANCO_RAW`. Así se
//     actualiza solo cada vez que se importa el extracto, sin volver a correr este generador — que
//     es exactamente lo que hace que "¿ya se pagó?" no envejezca.
//   · Lo del REGISTRO de abajo (cuánto de lo que se va a debitar está cargado) también es fórmula:
//     el control se pone en verde solo, a medida que el dueño carga las cuotas que faltan.
//
// ═══ LO QUE ESTE ARCHIVO NO PUEDE ROMPER ═══
//
//   · NUNCA ESCRIBE FUERA DE A, B Y C. CAJA suma
//        SUMPRODUCT((UPPER('Tarjeta de Credito'!$J$3:$J$400)<>"SI")*IF(ISNUMBER($E$3:$E$400);…))
//     sobre el rango de columna ENTERO, y la banda cae adentro: un importe en E se sumaría al
//     consumo de tarjeta de CAJA como si fuera una compra más. Hay test.
//   · EL ALTO ES FIJO (`BANDA`), aunque los datos varíen. De ese número cuelga `filaCab` en
//     `cash-flow-lineas.mjs`, y un rango corrido no da error: da cero, que se lee como un cero real.
//     Por eso las secciones de largo variable tienen tope y el sobrante se rellena al final.

import { seccion, total, sub } from './patron-pestana.mjs'
import { BANDA, FILA_DATO0, rangoAbierto } from './tarjeta-geometria.mjs'
import { VENTANA, TOLERANCIA, BANDA_TC, estadoDePago, historial, proyectarProxima } from './tarjeta-estado.mjs'
import { ALERTA } from './glifos.mjs'

/** Ancho de grilla de la banda. El registro es más ancho: es el ledger, y el patrón admite uno. */
export const COLS = 12

/** La fila del titular (1-based): lo que hay que pagar en pesos. Con eso se decide. */
export const TITULAR = 6

/** Topes de las secciones de largo variable. Sin tope, el alto de la banda dependería de los datos
 *  y `filaCab` del cash flow apuntaría a otra fila cada mes. */
export const TOPES = { componentes: 5, huecos: 3, historial: 6 }

/** A partir de cuántos días un resumen deja de ser el presente. Llega uno por mes: a los 40 días sin
 *  resumen nuevo, o no llegó o nadie lo cargó — y las dos cosas hay que verlas. */
const DIAS_FRESCURA = 40

const ymd = (iso) => { const [a, m, d] = String(iso).split('-').map(Number); return { a, m, d } }
const dmy = (iso) => { const { a, m, d } = ymd(iso); return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${a}` }
const DATE = (iso) => { const { a, m, d } = ymd(iso); return `DATE(${a};${m};${d})` }
const corrida = (iso, n) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10)
const MES = ['', 'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const mesCorto = (iso) => { const { a, m } = ymd(iso); return `${MES[m].slice(0, 3)}/${String(a).slice(2)}` }
const $ = (n) => `$${Number(n || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const u$s = (n) => `U$S ${Number(n || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

/**
 * El semáforo de antigüedad. PURA.
 *
 * Un número pegado no puede envejecer en silencio: la celda de al lado dice de qué documento es, y
 * cuando el documento pasa de `dias` deja de decir la fecha y pasa a pedir uno nuevo.
 */
export function frescura(iso, dias = DIAS_FRESCURA, rotulo = 'resumen al') {
  const { a, m, d } = ymd(iso)
  return `=LET(dd_;TODAY()-DATE(${a};${m};${d});IF(dd_>${dias};"${ALERTA} el último resumen es de hace "&dd_&" días";"${rotulo} ${dmy(iso)}"))`
}

/** Los nombres de los cargos, como los entiende un humano. Lo que el banco imprime es un código. */
const NOMBRE_CARGO = {
  sellos: 'Impuesto de sellos',
  sellos_provinciales: 'Impuesto de sellos provincial',
  rg5617: 'Percepción RG 5617 (30% sobre los consumos en dólares)',
  iva: 'IVA',
  interes_financiacion: 'Intereses de financiación',
  punitorio: 'Intereses punitorios',
  comision: 'Comisiones y cargos administrativos',
  seguro: 'Seguros',
  percepcion: 'Otras percepciones',
}

/**
 * LAS FILAS DE LA BANDA. PURA y determinística.
 *
 * @param {number} hdr    fila (1-based) del encabezado del registro
 * @param {object} datos  { resumen, estado, historial, proyeccion } — lo que arma `datosDeLaBanda`
 * @returns {{filas:string[][], …índices de filas para el formateador}}
 */
export function bandaFilas(hdr = BANDA + 1, datos = {}) {
  const r = datos.resumen
  if (!r) throw new Error('bandaFilas: sin resumen no hay pestaña. Cargá uno con importar-tarjeta.mjs.')
  const hist = datos.historial || []
  const proy = datos.proyeccion || { componentes: [], huecos: [], piso: 0 }

  const filas = []
  const usd = []
  /** Agrega una fila y devuelve su número 1-based: una fórmula que cita una fila fija se desalinea
   *  el día que la banda cambia. */
  const push = (a = '', b = '', c = '') => { filas.push([a, b, c, ...Array(COLS - 3).fill('')]); return filas.length }

  // ── Rangos. Los del registro, ABIERTOS: una cuota nueva entra sola al control ───────────────────
  const E = rangoAbierto('E')   // monto de la cuota
  const H = rangoAbierto('H')   // fecha de pago (la misma columna que lee el cash flow)
  // El extracto, adentro del Sheet. El pago REAL de la tarjeta no se pega: se suma de _BANCO_RAW.
  const RF = "'_BANCO_RAW'!$A$4:$A$1000"
  const RC = "'_BANCO_RAW'!$C$4:$C$1000"
  const RN = "'_BANCO_RAW'!$F$4:$F$1000"
  const PAGO = `${RN};"Pago de la tarjeta"`
  const desde = corrida(r.vencimiento, -VENTANA.antes)
  const hasta = corrida(r.vencimiento, VENTANA.despues)
  const enVentana = `${RF};">="&${DATE(desde)};${RF};"<="&${DATE(hasta)}`

  push('Tarjeta de crédito')
  // TODA la trazabilidad, una sola vez y acá. En el cuerpo no va una línea de prosa: el dueño borra
  // siempre las columnas de aclaraciones, y tiene razón — compiten con los números.
  push(`${r.tarjeta}${r.titular ? ` · ${r.titular}` : ''} · Santander · resumen Nro ${r.numero ?? 's/n'} cerrado el ${dmy(r.cierre)} · lo pegado sale de ese resumen (entra por importar-tarjeta.mjs); si ya se pagó y cuánto falta cargar se calculan solos, del extracto en _BANCO_RAW y del registro de abajo`)
  push()

  // ── HERO: LA PREGUNTA 1. Cuánto hay que pagar ───────────────────────────────────────────────────
  push(`CUÁNTO HAY QUE PAGAR — VENCE EL ${dmy(r.vencimiento)}`)
  push('Concepto', 'Monto', 'Cuándo')
  // La celda de al lado dice de qué documento sale y, si el documento envejeció, deja de decirlo y
  // pide uno nuevo: un resumen de hace 40 días no describe lo que hay que pagar este mes.
  const fArs = push(total('A pagar en pesos'), r.aDebitarPesos,
    frescura(r.cierre, DIAS_FRESCURA, `débito automático de la cuenta ${r.cuentaDebito ?? '?'}`))
  // LOS DÓLARES SE MUESTRAN EN DÓLARES. Con el formato de pesos del resto de la columna, U$S 544,99
  // se leería "$545": el mismo símbolo para dos monedas invita a sumarlos, y son dos obligaciones
  // distintas que se cancelan por separado.
  if (r.aDebitarDolares > 0) usd.push(push(total('A pagar en dólares'), r.aDebitarDolares, 'de la misma cuenta, el mismo día, y NO se convierten acá'))
  push(sub('pago mínimo, si no se paga todo'), r.pagoMinimoVerificado ? r.pagoMinimo : '',
    r.pagoMinimoVerificado ? 'lo que no se pague financia al 6,411% mensual (TNA 78%)' : 'el resumen no lo publica en esta copia')
  push()

  // ── 1 · LA PREGUNTA 3. ¿Ya se pagó? Contra el banco, que es la OTRA fuente ──────────────────────
  push(seccion(1, '¿Ya se pagó? — se prueba contra el extracto, no contra el resumen'))
  push('Concepto', 'Monto', 'Cuándo')
  const fDeb = push('Débito de tarjeta en el extracto',
    `=-SUMIFS(${RC};${PAGO};${enVentana})`,
    `=LET(f_;MAXIFS(${RF};${PAGO};${enVentana});IF(f_=0;"todavía no aparece en el extracto";"el "&TEXT(f_;"dd/mm/yyyy")))`)
  const fDif = push(total('Diferencia contra el resumen'), `=IF(B${fDeb}=0;0;B${fDeb}-${r.aDebitarPesos})`)
  // EL VEREDICTO VIVE EN EL SHEET Y NO SE PEGA: si se pegara, diría "A VENCER" para siempre. Es la
  // misma regla que `estadoDePago()` —misma ventana, misma tolerancia, misma banda de tipo de
  // cambio, importadas de ahí— escrita como fórmula para que se recalcule sola cuando entre el
  // extracto. El día que el débito llegue por otro importe, esta celda lo grita sin que corra nadie.
  filas[fDif - 1][2] = veredicto({ r, fDeb, hasta })
  const anterior = hist.find((f) => f.cierre !== r.cierre)
  if (anterior) {
    push(sub(`el resumen anterior, vencido el ${dmy(anterior.vencimiento)}`), anterior.pesos, rotuloHistorial(anterior))
  }
  push()

  // ── 2 · LA PREGUNTA 2. Qué me están cobrando ────────────────────────────────────────────────────
  push(seccion(2, 'Qué me están cobrando — el resumen, abierto'))
  push('Concepto', 'Monto', 'Cuánto pesa')
  const fCons = push('Consumos del período', r.consumosPesos, `${(r.consumos || []).length} compra(s) y cuota(s)`)
  if (r.consumosDolares > 0) usd.push(push(sub('consumos en dólares'), r.consumosDolares, 'se pagan aparte, en dólares'))
  const pct = (f) => `=IF($B$${fCons}=0;"—";TEXT(B${f}/$B$${fCons};"0.0%")&" del consumo")`
  for (const c of (r.cargos || []).slice(0, 6)) {
    const f = push(NOMBRE_CARGO[c.concepto] ?? c.comercio ?? c.concepto, c.importe)
    // LA PERCEPCIÓN NO ES UN GASTO: ES PAGO A CUENTA DE GANANCIAS, o sea recuperable en la DDJJ.
    // Tratarla como costo pierde el crédito fiscal, y hoy ninguna pestaña la computa como crédito.
    // Acá se muestra separada y rotulada; el criterio contable lo decide el dueño con el estudio.
    filas[f - 1][2] = c.concepto === 'rg5617'
      ? `=IF($B$${fCons}=0;"—";TEXT(B${f}/$B$${fCons};"0.0%")&" del consumo — PAGO A CUENTA de Ganancias, no es gasto")`
      : pct(f)
  }
  const fCargos = push(total('Cargos e impuestos del período'), r.cargosPesos)
  filas[fCargos - 1][2] = pct(fCargos)
  push(total('Total a debitar'), r.aDebitarPesos, 'consumos + cargos — la identidad que verifica la carga')
  push()

  // ── 3 · LA PREGUNTA 4. Cuánto puede venir la próxima ────────────────────────────────────────────
  push(seccion(3, 'Cuánto puede venir la próxima — PROYECCIÓN, no un dato'))
  push('Concepto', 'Monto', 'De dónde sale')
  for (const c of proy.componentes.slice(0, TOPES.componentes)) {
    const f = push(c.concepto, c.importe, `${c.procedencia} — ${c.evidencia}`)
    if (c.moneda === 'USD') usd.push(f)
  }
  const fPiso = push(total('Piso de la próxima'), proy.piso,
    proy.proximoCierre ? `cierra el ${dmy(proy.proximoCierre)} y vence el ${dmy(proy.proximoVencimiento)}` : '')
  for (const h of proy.huecos.slice(0, TOPES.huecos)) push(sub(h))
  push()

  // ── 4 · EL HALLAZGO: lo que va a salir y el Cash Flow no está esperando ─────────────────────────
  const mesVto = `${mesCorto(r.vencimiento)}`
  const finMes = corrida(`${r.vencimiento.slice(0, 8)}01`, 32).slice(0, 8) + '01'
  push(seccion(4, 'Lo que va a salir y el Cash Flow no está esperando'))
  push('Concepto', 'Monto', 'Qué falta')
  const fSale = push(`A debitar el ${dmy(r.vencimiento)} según el resumen`, r.aDebitarPesos, 'sale de la cuenta sin que nadie lo mande')
  const fCargado = push(`Cargado en el registro con fecha de pago en ${mesVto}`,
    `=SUMIFS(${E};${H};">="&${DATE(`${r.vencimiento.slice(0, 8)}01`)};${H};"<"&${DATE(finMes)})`,
    'es lo único de la tarjeta que el Cash Flow proyecta')
  const fBrecha = push(total('Brecha sin proyectar'), `=B${fSale}-B${fCargado}`)
  filas[fBrecha - 1][2] = `=IF(ABS(B${fBrecha})<=1;"✓ el registro cubre el débito entero";"${ALERTA} el Cash Flow espera "&TEXT(B${fCargado};"$#,##0")&" y van a salir "&TEXT(B${fSale};"$#,##0"))`
  if (r.aDebitarDolares > 0) usd.push(push(sub('y los dólares, que ninguna línea del Cash Flow proyecta'), r.aDebitarDolares, 'no hay línea de tarjeta en moneda extranjera'))
  push()

  // ── 5 · LA PREGUNTA 5. Historial, resumen por resumen ──────────────────────────────────────────
  push(seccion(5, 'Historial — resumen por resumen'))
  push('Fecha de cierre', 'A debitar', 'Pagado')
  for (const f of hist.slice(0, TOPES.historial)) {
    push(`${dmy(f.cierre)}${f.numero ? ` · resumen ${f.numero}` : ''}${f.procedencia === 'INFERENCIA' ? ' (INFERIDO)' : ''}`, f.pesos, rotuloHistorial(f))
  }

  // ── El relleno. Ver la nota del encabezado: el alto es fijo porque de él cuelga el cash flow ────
  while (filas.length < BANDA - 2) push()
  push()
  const fDetalle = push(seccion(6, 'El detalle — cada compra y cada cuota'))
  if (filas.length !== BANDA) throw new Error(`bandaFilas: la banda quedó de ${filas.length} filas y el contrato dice ${BANDA}`)

  return { filas, fArs, fDeb, fDif, fCons, fCargos, fPiso, fSale, fCargado, fBrecha, fDetalle, usd, hdr }
}

/** El rótulo de "pagado" de una fila del historial. PURA: el hecho, con su prueba o su hueco. */
export function rotuloHistorial(f) {
  if (f.estado === 'PAGADO') {
    const tc = f.tcImplicito ? ` (incluye ${u$s(f.dolares)} a ${f.tcImplicito.toLocaleString('es-AR')})` : ''
    return `${f.concilia ? '✓' : ALERTA} ${$(f.pagado)} el ${dmy(f.debitos[f.debitos.length - 1].fecha)}${tc}${f.concilia ? '' : ' — NO coincide'}`
  }
  if (f.estado === 'IMPAGO') return `${ALERTA} IMPAGO — venció y el extracto no registra el débito`
  return `A VENCER el ${f.vencimiento ? dmy(f.vencimiento) : '?'}`
}

/**
 * EL VEREDICTO VIVO. PURA: devuelve la fórmula, no el resultado.
 *
 * Los tres estados son los mismos que decide `estadoDePago()` y con los mismos parámetros —de ahí se
 * importan `VENTANA`, `TOLERANCIA` y `BANDA_TC`—. La diferencia es que ésta la recalcula el Sheet:
 * el día que el extracto traiga el débito, la celda cambia sola. Pegar el veredicto haría que la
 * pestaña dijera "A VENCER" el mes que viene también.
 *
 * EL CASO QUE NO PUEDE DAR VERDE POR ERROR: cuando el débito no coincide con el resumen, la única
 * explicación admitida es el saldo en dólares convertido a un tipo de cambio cercano al del cierre.
 * Cualquier otra diferencia sale como hallazgo, con las dos cifras a la vista.
 */
export function veredicto({ r, fDeb, hasta }) {
  const ars = r.aDebitarPesos
  const usd = r.aDebitarDolares || 0
  const tc = r.tcCierre || 0
  const explicaDolares = usd > 0 && tc > 0
    ? `IF(AND(dif_/${usd}>=${(tc * BANDA_TC.piso).toFixed(2)};dif_/${usd}<=${(tc * BANDA_TC.techo).toFixed(2)});"✓ PAGADO — los ${u$s(usd)} se debitaron a "&TEXT(dif_/${usd};"#,##0.00")&" por dólar";${noCoincide(fDeb, ars)})`
    : noCoincide(fDeb, ars)
  return `=LET(dif_;B${fDeb}-${ars};IF(B${fDeb}=0;IF(TODAY()>${DATE(hasta)};"${ALERTA} IMPAGO — venció el ${dmy(r.vencimiento)} y el extracto no registra el débito";"A VENCER el ${dmy(r.vencimiento)}");IF(ABS(dif_)<=${TOLERANCIA};"✓ PAGADO — coincide con el resumen";${explicaDolares})))`
}

const noCoincide = (fDeb, ars) => `"${ALERTA} PAGADO POR OTRO IMPORTE: el banco debitó "&TEXT(B${fDeb};"$#,##0")&" y el resumen dice "&TEXT(${ars};"$#,##0")`

/** La primera fila del registro, para que el script no vuelva a calcularla. */
export { BANDA, FILA_DATO0 }

/**
 * LO QUE LA BANDA NECESITA, ARMADO DE UNA VEZ. PURA.
 *
 * Existe para que el script no tenga que saber en qué orden se llaman las tres funciones de estado,
 * y sobre todo para que el test le pase EXACTAMENTE la misma forma que le pasa la base. Un test que
 * construye a mano una forma parecida a la real prueba la forma parecida.
 */
export function datosDeLaBanda(resumenes = [], movimientos = [], { hoy } = {}) {
  const orden = [...resumenes].sort((a, b) => String(b.cierre).localeCompare(String(a.cierre)))
  const resumen = orden[0]
  if (!resumen) return { resumen: null, estado: null, historial: [], proyeccion: null }
  return {
    resumen,
    estado: estadoDePago(resumen, movimientos, { hoy }),
    historial: historial(orden, movimientos, { hoy }),
    proyeccion: proyectarProxima(orden),
  }
}
