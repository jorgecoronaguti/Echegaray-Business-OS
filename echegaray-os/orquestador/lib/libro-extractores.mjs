// LOS EXTRACTORES DEL LIBRO CANÓNICO — de cada pestaña de origen, a Movimiento[].
//
// ═══ EL CONTRATO ═══
//
// Núcleo PURO: cada extractor recibe las filas YA LEÍDAS de su pestaña (con UNFORMATTED_VALUE, que es
// la única lectura donde una fecha es un número y un importe no es un string) y devuelve movimientos.
// No lee Google, no escribe, no toca la base. El que orquesta las lecturas es el script de la pestaña
// `_MOVIMIENTOS`; acá vive la lógica, que es lo que se prueba en frío.
//
// ═══ POR QUÉ LAS COLUMNAS SE RESUELVEN POR ENCABEZADO ═══
//
// Una columna fija ya rompió en silencio (memoria del proyecto: "ubicarCaja() por rótulo — columna
// fija rompía en silencio"). Cada extractor recibe el encabezado y resuelve por nombre, con
// `resolverColumnas`, la misma función que ya usa todo el repo. Si un rótulo no está, el extractor
// FALLA CERRADO nombrándolo — una fila de origen que se lee corrida un lugar produce movimientos
// plausibles y equivocados, que es el peor resultado posible.
//
// ═══ QUÉ FUENTE CUBRE CADA UNO, Y POR QUÉ ESA PUERTA ═══
//
// · Compras           → los PAGOS (reales y proyectados) y su estado. Es el registro maestro del
//                       egreso con factura; los rubros salen de su columna "Rubro de caja" (AC), que
//                       escribe rubro-caja-sheet.mjs con la taxonomía única.
// · Cobranzas         → los COBROS: cobrado (real) y esperado (proyectado), con la fecha que manda.
// · Cheques Emitidos  → el COMPROMETIDO: firmado y entregado, no debitado. El debitado NO se emite
//                       desde acá — ya está en el saldo del banco, y emitirlo lo contaría dos veces.
// · Jornales          → la nómina de obra y oficina, pagada (real) y proyectada.
// · _BANCO_RAW        → NO emite movimientos de caja. Es deliberado y es la regla que más plata
//                       cuidó: el saldo del banco YA CONTIENE sus movimientos. El banco entra al
//                       libro sólo como (a) verificación de estado —un cheque debitado, un pago que
//                       pasó a real— y (b) los cargos sin factura (comisiones, impuesto al cheque)
//                       que ninguna otra pestaña registra. Duplicar el resto inventó $9,9M una vez.

import { movimiento, ENTRA, SALE, estadoContraCorte } from './libro-movimientos.mjs'
import { rubroDeCaja, SIN_CLASIFICAR } from './rubro-caja.mjs'
import { resolverColumnas } from './compras-columnas.mjs'

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const txt = (v) => String(v ?? '').trim()

/** Falla cerrado si el encabezado no trae las columnas pedidas: nombra las que faltan. */
function columnasObligatorias(encabezado, nombres, fuente) {
  const { idx, faltan } = resolverColumnas(encabezado, nombres)
  if (faltan.length) {
    throw new Error(`libro-extractores(${fuente}): faltan columnas en el encabezado: ${faltan.join(' · ')}. `
      + 'Leer por posición produciría movimientos plausibles y equivocados — no extraigo.')
  }
  return idx
}

/**
 * COMPRAS → movimientos de egreso.
 *
 * El estado sale de "Estado pago": Pagado = REAL (con su fecha real de pago), lo demás = PROYECTADO
 * contra la fecha estimada — y `estadoContraCorte` lo convierte en VENCIDO si la fecha ya pasó.
 *
 * EL INSTRUMENTO IMPORTA PARA EL PERCIBIDO: una compra "Pagada" con cheque cuyo cheque no se debitó
 * NO salió de la cuenta. Ese caso NO se emite desde acá: lo emite Cheques Emitidos como COMPROMETIDO,
 * y la clave de dedup (instrumento+número) impide que las dos puertas lo dupliquen.
 *
 * @param {Array<Array>} filas todas las filas de Compras (fila 1 = título), UNFORMATTED_VALUE
 * @param {number} corte serial de hoy/corte para vencidos
 */
export function deCompras(filas = [], corte = null) {
  const enc = filas[2] ?? [] // fila 3: el encabezado real (1 título, 2 agrupador)
  // Los nombres son los del encabezado REAL de la fila 3, verificados contra el archivo el 05/08.
  // "Rubro de caja" y "Orden de pago (OS)" aparecen DOS veces en el encabezado: resolverColumnas se
  // queda con la primera aparición, que es la columna AB que escribe rubro-caja-sheet.mjs.
  const c = columnasObligatorias(enc, {
    proveedor: 'Proveedor', cuit: 'CUIT (OS)', comprobante: 'N° Comprobante',
    importe: 'Total', estado: 'Estado pago', tipoPago: 'Tipo pago',
    rubro: 'Rubro de caja', fechaCaja: 'Fecha de caja', obra: 'Detalles / Obra',
  }, 'Compras')
  const out = []
  for (let i = 3; i < filas.length; i++) {
    const f = filas[i] ?? []
    const importe = num(f[c.importe])
    const fecha = num(f[c.fechaCaja])
    if (importe === null || fecha === null) continue // sin importe o sin fecha de caja no hay movimiento
    const pagado = /^pagado$/i.test(txt(f[c.estado]))
    const tipo = txt(f[c.tipoPago]).toLowerCase()
    // El cheque lo emite Cheques Emitidos (comprometido) o el banco (debitado): acá se saltea para no
    // contarlo dos veces. La clave compartida es la red por si esta regla y aquélla divergen.
    if (/cheque|echeq/.test(tipo)) continue
    const instrumento = /transfer/.test(tipo) ? 'transferencia'
      : /efectivo/.test(tipo) ? 'efectivo'
        : /tarjeta/.test(tipo) ? 'tarjeta'
          : /d[eé]bito/.test(tipo) ? 'debito' : 'desconocido'
    const estadoBase = pagado ? 'REAL' : 'PROYECTADO'
    out.push(movimiento({
      fecha,
      signo: SALE,
      // Una NOTA DE CRÉDITO viene con importe negativo: es plata que VUELVE. El signo del movimiento
      // se invierte y la magnitud queda positiva — la clave de dedup ya distingue nota de factura.
      ...(importe < 0 ? { signo: ENTRA } : {}),
      importe: Math.abs(importe),
      concepto: txt(f[c.proveedor]),
      contraparte: txt(f[c.proveedor]),
      cuit: txt(f[c.cuit]),
      comprobante: txt(f[c.comprobante]),
      rubro: txt(f[c.rubro]) || rubroDeCaja({}) || SIN_CLASIFICAR,
      obra: txt(f[c.obra]),
      estado: estadoContraCorte(estadoBase, fecha, corte),
      instrumento,
      origen: { pestana: 'Compras', fila: i + 1 },
    }))
  }
  return out
}

/**
 * COBRANZAS → movimientos de ingreso.
 *
 * LA FECHA QUE MANDA: la real si está cobrado, la esperada si no. Los CINCO estados de la pestaña se
 * reducen a dos del libro — Cobrado = REAL, Pendiente/Proyectado/Facturado = PROYECTADO — y CANCELAR
 * no es un movimiento: es una fila que el dueño anuló. Mezclar los cinco en un solo filtro ya produjo
 * un reporte equivocado una vez (los $20,1M "cobrados con fecha futura" que eran echeqs).
 */
export function deCobranzas(filas = [], corte = null) {
  const enc = filas[3] ?? [] // fila 4: encabezado; los datos arrancan en la 5
  // Encabezado real de la fila 4, verificado el 05/08. El importe que mueve la caja es el TOTAL a
  // cobrar NETO de retenciones: el bruto incluye plata que nunca va a llegar a la cuenta (las
  // retenciones se sufren en el cobro — son los $7,38M que ninguna pestaña miraba).
  const c = columnasObligatorias(enc, {
    cliente: 'Obra / Cliente', estado: 'Estado', importe: 'TOTAL a cobrar (neto de retenciones)',
    fechaEsperada: 'Fecha cobro', fechaReal: 'Fecha cobro', forma: 'Forma de Cobro',
  }, 'Cobranzas')
  const out = []
  for (let i = 4; i < filas.length; i++) {
    const f = filas[i] ?? []
    const estadoTxt = txt(f[c.estado]).toLowerCase()
    if (!estadoTxt || /cancelar/.test(estadoTxt)) continue
    const importe = num(f[c.importe])
    if (importe === null || importe === 0) continue
    const cobrado = /^cobrado$/.test(estadoTxt)
    const fecha = cobrado ? (num(f[c.fechaReal]) ?? num(f[c.fechaEsperada])) : num(f[c.fechaEsperada])
    if (fecha === null) continue
    const forma = txt(f[c.forma]).toLowerCase()
    out.push(movimiento({
      fecha,
      signo: ENTRA,
      importe,
      concepto: txt(f[c.cliente]),
      contraparte: txt(f[c.cliente]),
      rubro: 'Cobranzas',
      estado: estadoContraCorte(cobrado ? 'REAL' : 'PROYECTADO', fecha, corte),
      instrumento: /echeq/.test(forma) ? 'echeq' : /cheque/.test(forma) ? 'cheque'
        : /efectivo/.test(forma) ? 'efectivo' : /transfer/.test(forma) ? 'transferencia' : 'desconocido',
      origen: { pestana: 'Cobranzas', fila: i + 1 },
    }))
  }
  return out
}

/**
 * CHEQUES EMITIDOS → el COMPROMETIDO.
 *
 * Un cheque firmado y entregado salió de tus manos, no de tu cuenta: es la definición de
 * COMPROMETIDO. El ya DEBITADO no se emite —está en el saldo del banco, y restarlo otra vez fue el
 * error de los $12.188.441—. La fecha del movimiento es la FECHA DE PAGO del cheque (cuándo va a
 * golpear la cuenta), no la de emisión.
 */
export function deChequesEmitidos(filas = [], { fila0 = 20 } = {}) {
  const enc = filas[fila0 - 2] ?? [] // el encabezado del registro, una fila arriba del primer dato
  // El encabezado real del registro (fila 20 del archivo, verificado el 05/08): "Nro" es el número
  // del cheque, "Monto" el importe, y hay DOS columnas de fecha de pago — "fecha de pago" (la fecha)
  // y "fecha pago" (el mes en texto). resolverColumnas matchea exacto, así que no se confunden.
  const c = columnasObligatorias(enc, {
    tipo: 'Tipo', numero: 'Nro', proveedor: 'Proveedor', importe: 'Monto',
    fechaPago: 'fecha de pago', debitado: 'DEBITADO',
  }, 'Cheques Emitidos')
  const out = []
  for (let i = fila0 - 1; i < filas.length; i++) {
    const f = filas[i] ?? []
    const importe = num(f[c.importe])
    if (importe === null || importe === 0) continue
    if (/^si$/i.test(txt(f[c.debitado]))) continue // ya está en el saldo del banco
    const esEcheq = /echeq/i.test(txt(f[c.tipo]))
    out.push(movimiento({
      // Sin fecha de pago cargada el cheque existe igual: cae al corte para que pese YA — un
      // compromiso sin fecha no es un compromiso que no vence, es uno que puede vencer mañana.
      fecha: num(f[c.fechaPago]) ?? 0,
      signo: SALE,
      importe,
      concepto: txt(f[c.proveedor]),
      contraparte: txt(f[c.proveedor]),
      rubro: 'Cheques emitidos',
      estado: 'COMPROMETIDO',
      instrumento: esEcheq ? 'echeq' : 'cheque',
      numeroCheque: txt(f[c.numero]),
      origen: { pestana: 'Cheques Emitidos', fila: i + 1 },
    }))
  }
  return out
}

/**
 * _BANCO_RAW → SÓLO los cargos sin factura.
 *
 * El resto del extracto NO se emite: el saldo del banco ya lo contiene, y las compras pagadas por
 * transferencia ya entran por Compras. Lo único que ninguna otra pestaña registra son los cargos que
 * el banco debita solo — impuesto al cheque, comisiones, intereses del descubierto ($2.504.655
 * medidos—: sin esta puerta, esa plata es "una diferencia sin causa" para siempre.
 *
 * @param {Array<Array>} filas de _BANCO_RAW: A fecha · B concepto · C importe · E signo · F naturaleza
 */
export function deBancoCargos(filas = [], { fila0 = 4 } = {}) {
  const out = []
  for (let i = fila0 - 1; i < filas.length; i++) {
    const f = filas[i] ?? []
    const fecha = num(f[0])
    const importe = num(f[2])
    const naturaleza = txt(f[5]).toLowerCase()
    if (fecha === null || importe === null || importe === 0) continue
    // La naturaleza la clasifica banco-santander.mjs al importar. Sólo pasan los cargos del banco.
    if (!/impuesto|comisi[oó]n|inter[eé]s|descubierto|cargo/.test(naturaleza)) continue
    out.push(movimiento({
      fecha,
      signo: importe < 0 ? SALE : ENTRA,
      importe: Math.abs(importe),
      concepto: txt(f[1]),
      contraparte: 'Banco Santander',
      rubro: 'Financiero',
      estado: 'REAL',
      instrumento: 'debito',
      referenciaBanco: `${fecha}|${txt(f[1])}|${importe}`,
      origen: { pestana: '_BANCO_RAW', fila: i + 1 },
    }))
  }
  return out
}
