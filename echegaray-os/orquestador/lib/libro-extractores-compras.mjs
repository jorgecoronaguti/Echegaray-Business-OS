// EL LADO "COMPRAS" DE LOS EXTRACTORES — dónde están sus columnas, y cuánto debe cada fila.
//
// ═══ POR QUÉ SE SEPARÓ DE `libro-extractores.mjs` (06/08) ═══
//
// Compras dejó de tener UN solo lector. Desde que existe el cruce cheque↔factura hay dos:
// `deCompras`, que emite los movimientos, y `comprasPagadasConCheque`, que arma el lado de Compras
// que el cruce empareja. Los dos tienen que resolver las MISMAS columnas — y si los rótulos se
// tipean en dos archivos, el día que la planilla renombre "Rubro de caja" uno falla cerrado y el
// otro sigue leyendo con el índice viejo. Un lector que falla y otro que miente es peor que dos que
// fallan: el que miente produce movimientos plausibles y equivocados, que no se ven nunca.
//
// Acá vive lo que Compras es COMO FUENTE (sus rótulos, cuánto debe una fila, qué filas pagó con un
// instrumento diferido); en `libro-extractores.mjs` vive lo que Compras PRODUCE (los movimientos).
// Es la misma partición que ya tenían `libro-extractores-nomina.mjs` y `-fechas.mjs`.

import { columnasObligatorias } from './compras-columnas.mjs'
import { instrumentoDePago } from './caja-canales.mjs'
import { movimiento, estadoContraCorte } from './libro-movimientos.mjs'
import { debitoRealDePlan } from './vencimientos-fiscales.mjs'
import { isoDeSerial, serialDe } from './libro-extractores-fechas.mjs'

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const txt = (v) => String(v ?? '').trim()

/**
 * LOS RÓTULOS DE COMPRAS, DECLARADOS UNA VEZ. Son los del encabezado REAL de la fila 3, verificados
 * contra el archivo el 05/08. "Rubro de caja" y "Orden de pago (OS)" aparecen DOS veces en el
 * encabezado: `resolverColumnas` se queda con la primera aparición, que es la columna AB que escribe
 * rubro-caja-sheet.mjs.
 */
export const NOMBRES_COMPRAS = Object.freeze({
  proveedor: 'Proveedor', cuit: 'CUIT (OS)', comprobante: 'N° Comprobante',
  // 'Estado' (columna X), NO 'Estado pago' (Z). La Z es el SEMÁFORO derivado —"✅ Pagado",
  // "🟡 Por vencer"— y /^pagado$/ no matchea un emoji adelante: TODA compra pagada quedaba
  // PROYECTADO. La X es la columna que escribe el cargador con el contrato Pagado/Pendiente.
  importe: 'Total', estado: 'Estado', tipoPago: 'Tipo pago', montoPagado: 'Monto Pagado',
  rubro: 'Rubro de caja', fechaCaja: 'Fecha de caja', obra: 'Detalles / Obra',
  // ═══ EL CLIENTE DEL EGRESO ES LA J, NO LA K ═══
  //
  // La K ("Detalles / Obra") es texto libre y ya alimenta la columna `obra` del libro: su inventario
  // vivo tiene 130 valores distintos —"combustible", "Cuota 18", "Junio", "46381", "Emiliano"— y
  // ninguno es un cliente. La J ("Cliente / Asignación") sí: 21 valores, de los cuales seis son los
  // clientes reales y el resto son centros de costo internos que `clienteCanonico` descarta.
  cliente: 'Cliente / Asignación',
})

/**
 * EL RUBRO DE LAS CUOTAS DE PLANES DE FACILIDADES DE ARCA. Es el único egreso de Compras que se debita
 * SOLO, en la fecha que fija el organismo — por eso su fecha se puede corregir y la de las demás no.
 */
export const RUBRO_PLANES_ARCA = 'Deuda previsional (planes de pago)'

/** Las columnas de Compras, resueltas por rótulo sobre la fila 3. Falla cerrado si falta alguna. */
export const columnasDeCompras = (filas = []) => columnasObligatorias(filas[2] ?? [], NOMBRES_COMPRAS, 'Compras')

/** ¿La fila dice "Pagado"? Se tolera decoración alrededor de la palabra ("✅ Pagado"). */
export const estaPagada = (celda) => /^pagado$/i.test(txt(celda).replace(/[^a-záéíóúüñ]/gi, ''))

/**
 * NÚCLEO PURO: lo que una fila de Compras TODAVÍA DEBE.
 *
 * Devuelve el total salvo que la fila esté abierta y con un pago parcial encima, en cuyo caso devuelve
 * el saldo. Los tres guardas no son paranoia, cada uno tapa un caso real de la planilla:
 *
 *   · `pagado` — la fila cerrada carga el instrumento por el total; su "Monto Pagado" es el total.
 *   · `importe > 0` — una nota de crédito viene en negativo y no tiene pagos parciales que restar.
 *   · `montoPagado < importe` — si la planilla dice "no está pagada" y a la vez "pagué todo" (hoy: la
 *     fila 457, FCL Junio, $800.000 con Estado=Proyectado), las dos columnas se contradicen. Devolver
 *     cero borraría el movimiento del libro entero por una celda mal cargada, y fabricar un cero es
 *     peor que arrastrar el total: se avisa y manda el total, que es la lectura conservadora.
 *
 * @param {{importe:number, pagado:boolean, montoPagado:number|null}} f
 * @param {(m:string)=>void} aviso
 * @returns {number}
 */
export function pendienteDeCompra({ importe, pagado, montoPagado }, aviso = () => {}) {
  const ya = num(montoPagado) ?? 0
  if (pagado || !(importe > 0) || !(ya > 0)) return importe
  if (ya >= importe) {
    aviso(`"Monto Pagado" ${ya} cubre o supera el Total ${importe} pero el Estado no es "Pagado". `
      + 'Va el total: la planilla se contradice y el libro no inventa un saldo cero.')
    return importe
  }
  return importe - ya
}

/**
 * NÚCLEO PURO: la fecha de caja de una fila de Compras, con el día de débito real si es una cuota de
 * plan de ARCA cargada en fin de semana.
 *
 * ═══ LA CUOTA QUE VENCÍA UN DOMINGO (06/08) ═══
 *
 * Compras tiene dos cuotas de plan al 16/08/2026 —domingo— por $2.968.642,73. ARCA no debita fines de
 * semana: su calendario las pone el 18/08, y ahí las mostraba "Impuestos y Financieros" mientras el
 * libro las llevaba al 16. La misma plata con dos fechas, dos días de diferencia, en el cuadro con el
 * que se decide un pago.
 *
 * TRES CONDICIONES, TODAS NECESARIAS:
 *
 *   · el rubro es el de los planes de ARCA — es el único egreso que se debita SOLO en una fecha que
 *     fija un tercero, con tabla verificada. Una compra a proveedor con fecha de sábado es una
 *     estimación del dueño y se respeta;
 *   · la fila NO está pagada — un pago ya ocurrido es un hecho con su fecha, y moverlo desalinearía la
 *     conciliación contra el extracto. (La cuota de mayo, cargada el 16/05 sábado y ya pagada, no se
 *     toca a propósito.);
 *   · la fecha cargada cae sábado o domingo — un débito automático en domingo no es una decisión del
 *     dueño, es imposible. Una fecha hábil que no coincide con la tabla SÍ manda sobre la tabla.
 *
 * Y NO SE ESCRIBE EN COMPRAS. Lo que el dueño cargó queda como lo cargó; corrige el que lee.
 *
 * @param {{serial:number|null, rubro:string, pagado:boolean}} f
 * @param {(m:string)=>void} aviso
 * @returns {number|null} el serial corregido (o el mismo)
 */
export function fechaDeCajaDeCompra({ serial, rubro, pagado }, aviso = () => {}) {
  if (serial === null || !Number.isFinite(serial)) return serial
  if (pagado || txt(rubro) !== RUBRO_PLANES_ARCA) return serial
  const r = debitoRealDePlan(isoDeSerial(serial))
  if (!r.corregida) return serial
  aviso(`cuota de plan ARCA: ${r.motivo}`)
  const [a, m, d] = r.fecha.split('-').map(Number)
  return serialDe(a, m, d)
}

/**
 * COMPRAS, EL LADO QUE MIRA EL CRUCE: las filas PAGADAS con cheque o echeq. PURO.
 *
 * Se filtra por INSTRUMENTO, no por texto: `instrumentoDePago` pregunta "echeq" antes que "cheque"
 * porque un e-cheque contiene la palabra cheque, y confundirlos manda la fila al canal equivocado.
 *
 * SÓLO LAS PAGADAS. Una fila "Pendiente" ya viaja como PROYECTADO y la escalera la ve igual; el
 * agujero que el cruce cierra es específicamente el de la fila que la planilla da por saldada.
 *
 * @param {Array<Array>} filas Compras entera, UNFORMATTED_VALUE
 */
export function comprasPagadasConCheque(filas = []) {
  const c = columnasDeCompras(filas)
  const out = []
  for (let i = 3; i < filas.length; i++) {
    const f = filas[i] ?? []
    const total = num(f[c.importe])
    if (total === null || total === 0) continue
    if (!estaPagada(f[c.estado])) continue
    const instrumento = instrumentoDePago(txt(f[c.tipoPago]))
    if (instrumento !== 'cheque' && instrumento !== 'echeq') continue
    out.push({
      fila: i + 1, proveedor: txt(f[c.proveedor]), comprobante: txt(f[c.comprobante]),
      total, fecha: num(f[c.fechaCaja]), instrumento, rubro: txt(f[c.rubro]),
      cliente: txt(f[c.cliente]), obra: txt(f[c.obra]), cuit: txt(f[c.cuit]),
    })
  }
  return out
}

/**
 * NÚCLEO PURO: la parte de una fila de Compras que todavía viaja en un cheque sin debitar.
 *
 * ═══ POR QUÉ LA IDENTIDAD DE ESTE MOVIMIENTO ES "FILA · CHEQUE" Y NO LA FILA SOLA ═══
 *
 * `claveDe` deduplica, y las tres formas obvias de nombrar este movimiento lo destruyen:
 *
 *   · con `cuit` + `comprobante` → clave `comp:CUIT:N°:S`, la MISMA que el resto REAL de su propia
 *     fila. Dedup se queda con el REAL (es más fuerte) y el compromiso desaparece: el agujero
 *     original, reintroducido por el arreglo.
 *   · con `numeroCheque` → clave `cheque:N°:S`. Medido en el registro vivo: los cheques de las filas
 *     101 y 102 se llaman los DOS "FISICO 316" ($500.000 y $510.000). Colapsarían y se perderían
 *     $500.000 sin un solo error. El número no identifica un cheque ni dentro de su propia especie.
 *   · con `origen.fila` = la fila del cheque → un cheque contra un CONJUNTO de facturas emite una
 *     cuota por factura, todas con la misma fila de cheque. Colapsarían entre sí (medido: el echeq
 *     365 de Con-Sec paga tres facturas; se perderían $508.705).
 *
 * Queda `Compras` + "fila · cheque N", que es lo único único: esta plata es de ESTA factura y viaja
 * en ESE cheque. Y no puede chocar con `deChequesEmitidos`, cuya clave es `cheque:N°:S`.
 *
 * @param {object} base los campos que la cuota hereda de su factura (rubro, cliente, obra…)
 * @param {Array} cuotas de `repartirPorCompra`
 * @param {number|null} corte
 * @param {{fila:number, comprobante:string}} factura la fila de Compras de la que sale esta plata
 */
export function cuotasEnCheque(base, cuotas = [], corte = null, factura = { fila: 0, comprobante: '' }) {
  return cuotas.map((q) => movimiento({
    ...base,
    // Un cheque sin fecha de pago cae al serial 0 y pesa YA, igual que en `deChequesEmitidos`: un
    // compromiso sin fecha no es uno que no vence, es uno que puede vencer mañana.
    fecha: q.fechaPago ?? 0,
    importe: q.importe,
    instrumento: q.instrumento,
    concepto: `${base.concepto} · ${q.instrumento} ${q.numero}`.trim(),
    // El comprobante SÍ viaja (es lo que se lee para reconciliar contra Compras); el CUIT no, porque
    // los dos juntos arman la clave `comp:` que colisiona con el resto REAL de la misma fila.
    comprobante: factura.comprobante,
    estado: estadoContraCorte('COMPROMETIDO', q.fechaPago, corte),
    origen: { pestana: 'Compras', fila: `${factura.fila} · cheque ${q.filaCheque}` },
  }))
}
