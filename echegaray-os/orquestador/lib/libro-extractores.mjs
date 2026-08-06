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
// · Cheques Emitidos  → el COMPROMETIDO SIN FACTURA: firmado y entregado, no debitado, y que Compras
//                       no tiene. El que sí está en Compras entra por ahí (con su cheque como
//                       instrumento) y el debitado no entra por ningún lado — ya está en el saldo.
// · Tarjeta de Credito→ lo mismo para la cuota de tarjeta sin factura cargada.
// · Jornales/Oficina/ → la nómina, desde la planilla y NO desde Compras. Vive en
//   Dirección            libro-extractores-nomina.mjs, con el por qué medido en pesos.
// · Impuestos y       → el IVA y el IIBB a pagar, que no están en Compras: los calcula esa pestaña y
//   Financieros          el libro los LEE, con el vencimiento a fin de mes + 20 días.
// · _CHEQUES_RAW      → la CARTERA: los valores de terceros que todavía no son caja. Es lo único que
//                       ENTRA además de Cobranzas.
// · _BANCO_RAW        → NO emite movimientos de caja. Es deliberado y es la regla que más plata
//                       cuidó: el saldo del banco YA CONTIENE sus movimientos. El banco entra al
//                       libro sólo como (a) verificación de estado —un cheque debitado, un pago que
//                       pasó a real— y (b) los cargos sin factura (comisiones, impuesto al cheque)
//                       que ninguna otra pestaña registra. Duplicar el resto inventó $9,9M una vez.
//
// ═══ QUÉ FUENTES SABEN DE QUÉ CLIENTE ES CADA MOVIMIENTO (06/08/2026) ═══
//
// Sólo TRES: Compras (columna J, "Cliente / Asignación"), Cobranzas (G, "Obra / Cliente") y
// `_CHEQUES_RAW` (K, "Obra"). Las demás NO lo saben y no se les inventa:
//
// · Cheques Emitidos tiene "Unidad de Negocio", que dice Civil (101 filas) o Mantenimiento (4) — es
//   la línea de negocio, no el cliente. Mapearla sería fabricar una asignación que nadie hizo.
// · Tarjeta, banco, IVA/IIBB y la nómina son gasto de estructura o de empresa: no tienen cliente
//   porque no lo tienen, y forzarlos a uno repartiría a mano un costo indirecto.
//
// Todo lo que queda sin cliente cae en el residuo VISIBLE de la vista ("Otros y sin asignar"), que se
// despeja por diferencia contra el subtotal. Son $179,3M reales y $187,9M proyectados medidos el
// 06/08: es la cifra más grande del bloque, y esconderla sería el peor resultado de todos.

import { movimiento, ENTRA, SALE, estadoContraCorte } from './libro-movimientos.mjs'
import { clienteCanonico } from './libro-clientes.mjs'
import { instrumentoDePago, estadoDeEgreso } from './caja-canales.mjs'
import { rubroDeCaja, SIN_CLASIFICAR } from './rubro-caja.mjs'
import { resolverColumnas } from './compras-columnas.mjs'
import { INSTRUMENTOS, MARCA_ENDOSADO, COL_VALOR_BANCO, colMesDelAnio } from './cash-flow-lineas.mjs'
// El default de `deChequesEmitidos` era un 20 escrito a mano y el registro se movió a la 27. El
// llamador real (libro-movimientos-pestana) pasa el ancla viva; el default es para todos los demás.
import { FILA_DATO0 as FILA_DATO0_CHEQUES } from './cheques-emitidos-geometria.mjs'
import { MARCAS } from './cheques-cobertura.mjs'
import { EN_CARTERA } from './cartera-cheques.mjs'
import { COL as COL_RAW, FILA0 as FILA0_RAW, PESTAÑA as PESTANA_RAW } from '../scripts/cheques-raw-pestana.mjs'
import { finDeMes } from './libro-extractores-fechas.mjs'
import { RUBRO_JORNALES, RUBRO_ADMINISTRACION } from './libro-extractores-nomina.mjs'

export { deJornalesQuincenas, deOficina, deDireccion } from './libro-extractores-nomina.mjs'

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const txt = (v) => String(v ?? '').trim()
/** Letra de columna → índice 0-based. 'A'→0, 'BB'→53. Las coordenadas del archivo son letras. */
export const indiceDeColumna = (letra) => String(letra).toUpperCase().split('')
  .reduce((n, c) => n * 26 + (c.charCodeAt(0) - 64), 0) - 1

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
 * ═══ LA COMPRA PAGADA CON CHEQUE SÍ ENTRA POR ACÁ (05/08) ═══
 *
 * Hasta hoy se salteaba, razonando que la emitía "Cheques Emitidos" como COMPROMETIDO. Era falso de
 * los dos lados y dejaba un agujero: el calendario de CAJA suma Compras entera con un SUMIFS por rubro
 * y fecha, SIN mirar el tipo de pago, y del lado de los cheques suma únicamente los marcados "⚠ FALTA
 * cargar la factura" (`formulaChequesSinFactura`, que existe porque sumar los cheques enteros contaba
 * $43.380.472 dos veces). O sea: la factura pagada con cheque la cuenta Compras, y el cheque sin
 * factura lo cuenta su pestaña. Las dos puertas son COMPLEMENTARIAS por la marca, no por el tipo de
 * pago — y salteando acá, esa plata no estaba en el libro por ninguna de las dos.
 *
 * NO SE LE PONE `numeroCheque` a propósito: la clave de esta fila es (CUIT, comprobante, signo) y la
 * del cheque sin factura es (instrumento, número, signo). Son universos disjuntos y no colisionan.
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
    // 'Estado' (columna X), NO 'Estado pago' (Z). La Z es el SEMÁFORO derivado —"✅ Pagado",
    // "🟡 Por vencer"— y /^pagado$/ no matchea un emoji adelante: TODA compra pagada quedaba
    // PROYECTADO. La X es la columna que escribe el cargador con el contrato Pagado/Pendiente.
    importe: 'Total', estado: 'Estado', tipoPago: 'Tipo pago',
    rubro: 'Rubro de caja', fechaCaja: 'Fecha de caja', obra: 'Detalles / Obra',
    // ═══ EL CLIENTE DEL EGRESO ES LA J, NO LA K ═══
    //
    // La K ("Detalles / Obra") es texto libre y ya alimenta la columna `obra` del libro: su inventario
    // vivo tiene 130 valores distintos —"combustible", "Cuota 18", "Junio", "46381", "Emiliano"— y
    // ninguno es un cliente. La J ("Cliente / Asignación") sí: 21 valores, de los cuales seis son los
    // clientes reales y el resto son centros de costo internos que `clienteCanonico` descarta.
    cliente: 'Cliente / Asignación',
  }, 'Compras')
  const out = []
  for (let i = 3; i < filas.length; i++) {
    const f = filas[i] ?? []
    const importe = num(f[c.importe])
    const fecha = num(f[c.fechaCaja])
    if (importe === null || fecha === null) continue // sin importe o sin fecha de caja no hay movimiento
    // Se tolera decoración alrededor de la palabra ("✅ Pagado"): se compara sólo lo alfabético.
    const pagado = /^pagado$/i.test(txt(f[c.estado]).replace(/[^a-záéíóúüñ]/gi, ''))
    const tipo = txt(f[c.tipoPago]).toLowerCase()
    const rubro = txt(f[c.rubro])
    // LA NÓMINA NO SALE DE ACÁ, Y NO ES UNA PREFERENCIA: son $30,5M de jornales tipeados a mano como
    // estimación y cinco sueldos de administración cargados en Compras que la planilla ya trae. El
    // CUADRO del cash flow lo resuelve poniendo esa línea en un grupo con `signo: 0` (memo); el libro,
    // que cuenta cada movimiento UNA vez, lo resuelve no emitiéndola. Ver libro-extractores-nomina.mjs.
    if (rubro === RUBRO_JORNALES || rubro === RUBRO_ADMINISTRACION) continue
    const instrumento = instrumentoDePago(tipo)
    // ═══ "PAGADO CON CHEQUE" NO ES "LA PLATA SALIÓ" (06/08) ═══
    //
    // Medido en vivo: cuatro filas por $2.569.676 netos marcadas "Pagado" con echeq/cheque y fecha de
    // caja POSTERIOR al corte del extracto salían de acá como REAL. Un REAL no lo mira ninguna de las
    // tres vistas de proyección (CAJA COMPROMETIDA, CAJA PROYECTADA 30 DÍAS, la escalera) porque se
    // asume que ya está en el saldo — y no estaba: el extracto termina en el corte y el cheque no
    // debitó. Tampoco lo restaba la línea de posteriores, que mira sólo Transferencia y Débito. Esa
    // plata no existía en ninguna parte del cuadro.
    //
    // La regla vive en `caja-canales.mjs` junto con la lista de medios que SÍ pegan al banco en el
    // día, importada de la fórmula viva de CAJA — para que no puedan discrepar.
    const estadoBase = estadoDeEgreso({ instrumento, pagado, fecha, corte })
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
      rubro: rubro || rubroDeCaja({}) || SIN_CLASIFICAR,
      obra: txt(f[c.obra]),
      cliente: txt(f[c.cliente]),
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
 *
 * ═══ UN VALOR ENDOSADO NO VA A ENTRAR NUNCA (la columna BB, "Valor banco") ═══
 *
 * Dos echeq de LA ESTRELLA por $10.000.000 cada uno se entregaron a Alumetal para pagarle. Cobranzas
 * los registra con fecha de cobro 15/08 y 31/08 —y hace bien, el echeq entró— pero esa plata no va a
 * pasar por la cuenta corriente jamás. Sin este filtro el cuadro esperaba $20.000.000 de ingreso en
 * agosto que ya se habían entregado. Es el MISMO criterio de `formulaCobranzas` (`MARCA_ENDOSADO`
 * sobre `COL_VALOR_BANCO`), importado y no copiado.
 *
 * @param {Array<Array>} filas de Cobranzas, leída HASTA BB (si se lee menos, el endoso no se ve)
 * @param {number|null} corte
 * @param {{colValorBanco?:number}} opciones el índice de "Valor banco"; por defecto se resuelve por
 *        encabezado y, si no está, cae en la BB que declara `COL_VALOR_BANCO`.
 */
export function deCobranzas(filas = [], corte = null, { colValorBanco = null } = {}) {
  const enc = filas[3] ?? [] // fila 4: encabezado; los datos arrancan en la 5
  // Encabezado real de la fila 4, verificado el 05/08. El importe que mueve la caja es el TOTAL a
  // cobrar NETO de retenciones: el bruto incluye plata que nunca va a llegar a la cuenta (las
  // retenciones se sufren en el cobro — son los $7,38M que ninguna pestaña miraba).
  const c = columnasObligatorias(enc, {
    cliente: 'Obra / Cliente', estado: 'Estado', importe: 'TOTAL a cobrar (neto de retenciones)',
    fechaEsperada: 'Fecha cobro', fechaReal: 'Fecha cobro', forma: 'Forma de Cobro',
  }, 'Cobranzas')
  // Por encabezado primero: una columna fija ya rompió en silencio. La BB de `COL_VALOR_BANCO` es el
  // respaldo declarado, porque el rótulo puede no estar escrito en la fila del encabezado.
  const iBB = colValorBanco ?? (resolverColumnas(enc, { vb: 'Valor banco' }).idx.vb
    ?? indiceDeColumna(/([A-Z]+)/.exec(COL_VALOR_BANCO)[1]))
  const out = []
  for (let i = 4; i < filas.length; i++) {
    const f = filas[i] ?? []
    const estadoTxt = txt(f[c.estado]).toLowerCase()
    if (!estadoTxt || /cancelar/.test(estadoTxt)) continue
    // Se compara con LEFT, igual que la fórmula: la celda dice "ENDOSADO A ALUMETAL", no "ENDOSADO".
    if (txt(f[iBB]).toUpperCase().startsWith(MARCA_ENDOSADO)) continue
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
      // La misma celda es la contraparte Y el cliente: en un cobro son la misma persona. Se manda a
      // las dos porque `contraparte` guarda el texto crudo (el que se lee en el detalle) y `cliente`
      // guarda el canónico (el que agrupa) — y el crudo no se pierde al canonizar.
      cliente: txt(f[c.cliente]),
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
 * CHEQUES EMITIDOS → el COMPROMETIDO **SIN FACTURA CARGADA**.
 *
 * Un cheque firmado y entregado salió de tus manos, no de tu cuenta: es la definición de
 * COMPROMETIDO. El ya DEBITADO no se emite —está en el saldo del banco, y restarlo otra vez fue el
 * error de los $12.188.441—. La fecha del movimiento es la FECHA DE PAGO del cheque (cuándo va a
 * golpear la cuenta), no la de emisión.
 *
 * ═══ SÓLO LOS MARCADOS "FALTA LA FACTURA", Y ESE FILTRO VALE $43.380.472 ═══
 *
 * El cheque es el INSTRUMENTO y la factura es la OBLIGACIÓN. Si la factura está en Compras, esa plata
 * ya viaja por la puerta de Compras: emitir además el cheque la contaría dos veces —es exactamente lo
 * que dice `caja-calendario.mjs` sobre por qué el calendario suma `formulaChequesSinFactura` y no los
 * cheques enteros—. La marca la escribe `cheques-cobertura` fila por fila cruzando el número de
 * comprobante normalizado; acá se LEE, no se rehace la normalización ("0001-000036" vs "1-36").
 *
 * LA COLUMNA DE LA MARCA VA POR ÍNDICE Y NO POR RÓTULO, a propósito: su encabezado lleva la fecha de
 * la última corrida ("Estado en el OS · al 05/08"), así que no se puede matchear por texto. El índice
 * se importa de `INSTRUMENTOS.cheques.colMarca`, que es la MISMA constante que usan el que marca y el
 * que suma — declarada una vez justamente porque escrita tres veces se desincronizaba en silencio.
 */
export function deChequesEmitidos(filas = [], { fila0 = FILA_DATO0_CHEQUES, colMarca = INSTRUMENTOS.cheques.colMarca } = {}) {
  const enc = filas[fila0 - 2] ?? [] // el encabezado del registro, una fila arriba del primer dato
  // El encabezado real del registro: "Nro" es el número
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
    if (txt(f[colMarca]) !== MARCAS.falta) continue // con factura, ya entró por Compras
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

/**
 * TARJETA DE CRÉDITO → la cuota SIN FACTURA cargada, con el mismo criterio que el cheque.
 *
 * Misma puerta y mismo filtro que "Cheques Emitidos" (la marca del cruce + no debitada); cambia sólo
 * dónde están las columnas, y eso ya vive declarado en `INSTRUMENTOS.tarjeta`: monto E, fecha H,
 * debitado J, marca L, y el encabezado del registro en la fila 31 —no en la 2, que era la banda de la
 * pestaña y hacía que las marcas se estamparan encima del subtítulo—.
 *
 * @param {Array<Array>} filas la pestaña "Tarjeta de Credito" entera, UNFORMATTED_VALUE
 */
export function deTarjetaSinFactura(filas = [], { filaCab = INSTRUMENTOS.tarjeta.filaCab } = {}) {
  const T = INSTRUMENTOS.tarjeta
  const iMonto = indiceDeColumna(T.colMonto)
  const iFecha = indiceDeColumna(T.colFecha)
  const iDeb = indiceDeColumna(T.colDebitado)
  const out = []
  for (let i = filaCab; i < filas.length; i++) {
    const f = filas[i] ?? []
    const importe = num(f[iMonto])
    if (!importe) continue
    if (/^si$/i.test(txt(f[iDeb]))) continue
    if (txt(f[T.colMarca]) !== MARCAS.falta) continue
    out.push(movimiento({
      // Sin fecha cargada la cuota cae al serial 0 y pesa YA, igual que el cheque sin fecha: un
      // compromiso sin fecha no es uno que no vence, es uno que puede vencer mañana.
      fecha: num(f[iFecha]) ?? 0,
      signo: SALE,
      importe,
      concepto: txt(f[indiceDeColumna(T.colComprobante)]) || 'Cuota de tarjeta sin factura',
      contraparte: 'Tarjeta de crédito',
      rubro: 'Cheques y tarjeta sin factura cargada',
      estado: 'COMPROMETIDO',
      instrumento: 'tarjeta',
      origen: { pestana: T.pestaña, fila: i + 1 },
    }))
  }
  return out
}

/**
 * IMPUESTOS Y FINANCIEROS → el IVA y el IIBB a pagar. La salida que Compras NO tiene.
 *
 * `impuestos-pestana.mjs` lo dice sin ambigüedad: *"En Compras no hay UNA SOLA fila de IVA ni de
 * IIBB"*. El neto a pagar lo calcula esa pestaña mes por mes y el resto del archivo lo LEE —no lo
 * recalcula, que es la regla de una sola fuente—. Sin esta puerta el calendario proyecta ~$13,18M
 * anuales de IVA que nadie ve salir.
 *
 * ═══ EL VENCIMIENTO ES FIN DE MES DEL PERÍODO + 20 DÍAS ═══
 *
 * Es exactamente el `EOMONTH(DATE(anio;m;1);0)+20` de `formulaCalendarioImpuestosSemana`: el IVA de un
 * período se paga al mes siguiente, alrededor del día 20. En percibido lo que importa es cuándo sale
 * la plata, no cuándo se devengó — y el caso que un `mes+1` ingenuo rompe es diciembre, que vence el
 * 20/01 del año SIGUIENTE.
 *
 * LA IDENTIDAD DE ESTE MOVIMIENTO ES UNA CELDA, NO UNA FILA. Los doce meses viven en la misma fila
 * (B..M); con la fila sola, la clave de dedup —que cae en `origen:pestaña:fila` cuando no hay
 * comprobante— colapsaría los doce en uno y quedaría un mes de IVA en todo el año.
 *
 * @param {Array<Array>} filas la pestaña entera, UNFORMATTED_VALUE
 * @param {{filaIva:number, filaIibb:number}} filasCal filas ubicadas POR RÓTULO (1-based)
 * @param {number} anio el año de la grilla
 * @param {number|null} corte serial del corte: un vencimiento ya pasado es VENCIDO, no proyectado
 */
export function deImpuestosCalendario(filas = [], { filaIva, filaIibb } = {}, anio, corte = null) {
  if (!filaIva || !filaIibb || !anio) {
    throw new Error('libro-extractores(Impuestos y Financieros): necesito las filas del IVA y del IIBB '
      + 'ubicadas por rótulo y el año. Una fila muerta devolvería $0 sin un solo error.')
  }
  const out = []
  for (const [clave, fila] of [['IVA', filaIva], ['IIBB', filaIibb]]) {
    const f = filas[fila - 1] ?? []
    for (let m = 1; m <= 12; m++) {
      const importe = num(f[m]) // B..M = índices 1..12 = meses 1..12
      if (!importe) continue
      const fecha = finDeMes(anio, m) + 20
      out.push(movimiento({
        fecha,
        signo: SALE,
        importe,
        concepto: `${clave} a pagar · período ${String(m).padStart(2, '0')}/${anio}`,
        contraparte: clave === 'IVA' ? 'ARCA' : 'DGR San Juan',
        rubro: 'Impuestos',
        estado: estadoContraCorte('PROYECTADO', fecha, corte),
        origen: { pestana: 'Impuestos y Financieros', fila: `${colMesDelAnio(m)}${fila}` },
      }))
    }
  }
  return out
}

/**
 * _CHEQUES_RAW → LA CARTERA: los valores de terceros que todavía NO son caja.
 *
 * Es la única fuente de ENTRA además de Cobranzas, y la condición es la misma que la fórmula viva de
 * `cartera-cheques.mjs`: **tipo "recibido" Y estado "En custodia"**. Depositado, rechazado o endosado
 * ya no es cartera. La fecha que decide es la de PAGO del valor: es cuándo se vuelve plata.
 *
 * POR QUÉ COMPROMETIDO Y NO REAL: el valor está en la mano, con fecha, pero la plata no está en la
 * cuenta hasta que se acredita. Es la misma categoría que el cheque emitido, del otro lado del signo.
 *
 * UN VALOR SIN FECHA DE PAGO NO SE EMITE. No cae en ningún tramo del calendario tampoco, y meterlo con
 * fecha 0 lo pondría en un tramo donde CAJA no lo tiene. Ese caso ya lo grita el canario de la pestaña
 * de cartera ("⚠ hay un valor en cartera sin fecha de pago"), que es donde corresponde verlo.
 *
 * LA ESPECIE (físico o eCHEQ) NO ESTÁ EN LA RÉPLICA: su columna "Tipo" dice recibido/emitido. Se
 * declara `cheque` salvo que el texto diga echeq, y la clave no depende de eso porque el signo ya
 * separa el 514 que me dieron del 514 que libré.
 */
export function deCartera(filas = [], { fila0 = FILA0_RAW } = {}) {
  const i = (letra) => indiceDeColumna(letra)
  const out = []
  for (let r = fila0 - 1; r < filas.length; r++) {
    const f = filas[r] ?? []
    const tipo = txt(f[i(COL_RAW.tipo)]).toLowerCase()
    if (tipo !== 'recibido') continue
    if (txt(f[i(COL_RAW.estado)]).toLowerCase() !== EN_CARTERA.toLowerCase()) continue
    const importe = num(f[i(COL_RAW.importe)])
    const fecha = num(f[i(COL_RAW.fechaPago)])
    if (!importe || fecha === null) continue
    out.push(movimiento({
      fecha,
      signo: ENTRA,
      importe,
      concepto: txt(f[i(COL_RAW.librador)]) || txt(f[i(COL_RAW.contraparte)]),
      contraparte: txt(f[i(COL_RAW.librador)]),
      cuit: txt(f[i(COL_RAW.libradorCuit)]),
      obra: txt(f[i(COL_RAW.obra)]),
      // La columna "Obra" de la réplica es donde el propio archivo asigna el valor a un cliente
      // ("MESSINA"); el librador es el respaldo para cuando esa celda viene vacía. Se prueba la
      // asignación PRIMERO porque es una decisión del dueño: la razón social del librador puede no
      // decir a qué cliente pertenece el cheque ("Alimentos Del Sur SA" por LA ESTRELLA).
      cliente: clienteCanonico(txt(f[i(COL_RAW.obra)])) || txt(f[i(COL_RAW.librador)]),
      rubro: 'Valores en cartera',
      estado: 'COMPROMETIDO',
      instrumento: /echeq/i.test(tipo) ? 'echeq' : 'cheque',
      numeroCheque: txt(f[i(COL_RAW.numero)]),
      origen: { pestana: PESTANA_RAW, fila: r + 1 },
    }))
  }
  return out
}
