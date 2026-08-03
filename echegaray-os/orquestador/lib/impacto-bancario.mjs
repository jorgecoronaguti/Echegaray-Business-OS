// EL MAPA DE IMPACTO: QUÉ EVENTO BANCARIO TOCA QUÉ PESTAÑA DEL "Flujo de Caja - Cash Flow".
//
// POR QUÉ EXISTE (25/07). El dueño carga movimientos del banco "a diario y quizás dos veces por día
// vía CSV o capturas de pantalla, y esto debe impactar en TODO el sheet conforme corresponde, no sólo
// en CAJA". El importador (scripts/importar-banco.mjs) ya mete el extracto en la base y la réplica
// _BANCO_RAW; de ahí cuelgan por fórmula CAJA, Impuestos y Cheques. Lo que faltaba no era otro motor:
// era que el destino de cada evento estuviera DECLARADO EN UN SOLO LUGAR y fuera VERIFICABLE, en vez
// de vivir disperso y de memoria entre cinco generadores.
//
// QUÉ HACE, Y QUÉ NO. Este archivo NO recalcula ningún número —no es una tercera copia de la plata—.
// Toma la naturaleza que ya deduce banco-santander.mjs (clasificarMovimiento / naturalezaIngreso) y le
// pone su DESTINO: pestaña, sección y el mecanismo/fuente que ya lo consume. Es el índice del impacto,
// no el cálculo. El invariante que hace que valga la pena: TODO bucket que clasificarMovimiento pueda
// emitir tiene que tener un destino declarado acá. Si mañana se agrega una naturaleza nueva y nadie le
// asigna destino, el test se cae — así ningún evento bancario entra al Sheet sin que se sepa a dónde va.
//
// LA REGLA QUE MANDA: un débito (importe < 0) sale por la pestaña de su naturaleza; un crédito
// (importe > 0) casi nunca se ESCRIBE en una pestaña —el saldo del banco ya lo contiene— y sólo se
// CONCILIA contra Cobranzas cuando su naturaleza es 'cobranza'. Contar un crédito como ingreso nuevo
// además del saldo lo duplica: es el error de los $11,9M de Balanz y los $16,2M de San Francisco.

import { clasificarMovimiento, naturalezaIngreso } from './banco-santander.mjs'

/**
 * IMPACTO UNIVERSAL — vale para TODOS los movimientos, sin importar su naturaleza.
 * El saldo corrido y la fecha del último movimiento alimentan CAJA por fórmula contra _BANCO_RAW.
 */
export const IMPACTO_UNIVERSAL = [
  {
    evento: 'Saldo de cuenta (último saldo declarado del extracto)',
    pestaña: 'Caja',
    seccion: '1 · Disponibilidades por cuenta → Banco Santander (saldo en pesos)',
    mecanismo: 'formulaUltimoSaldo(_BANCO_RAW!D): INDEX al último saldo ISNUMBER y <>0, no un total pegado',
    fuente: 'lib/caja-posterior-al-corte.mjs · scripts/caja-pestana.mjs',
  },
  {
    evento: 'Fecha de corte del extracto (fecha del último movimiento)',
    pestaña: 'Caja',
    seccion: '1 · Disponibilidades → Fecha del saldo, y ancla de "movimientos posteriores al corte"',
    mecanismo: 'formulaFechaCorte(_BANCO_RAW!A): MAX de la columna de fechas',
    fuente: 'lib/caja-posterior-al-corte.mjs',
  },
]

/**
 * DESTINO DE CADA NATURALEZA que emite `clasificarMovimiento`. La clave es EXACTAMENTE el string que
 * devuelve esa función: el test lo verifica, así no se puede desincronizar sin que grite.
 */
export const DESTINOS = {
  'Impuesto al cheque (Ley 25.413)': {
    pestaña: 'Impuestos y Financieros',
    seccion: '4 · Otros impuestos → Impuesto al cheque (Ley 25.413), por mes',
    mecanismo: 'SUMPRODUCT sobre _BANCO_RAW: YEAR/MONTH(col A) × SEARCH del patrón (col F Naturaleza) × ABS(col C)',
    fuente: 'scripts/impuestos-pestana.mjs · porMesBanco',
    escribe: 'no', // no crea fila propia: la pestaña Impuestos lo lee de _BANCO_RAW
  },
  'Costo financiero del descubierto': {
    pestaña: 'Caja',
    seccion: '4.3 · Costo del descubierto (interés + IVA 10,5% + percepción RG 2408)',
    mecanismo: 'SUMIFS _BANCO_RAW col C donde Naturaleza = marca, por mes; MAX(proyectado; real) — CFT ×1,12 verificado',
    fuente: 'lib/costo-descubierto.mjs · formulaInteresMes / REAL',
    escribe: 'no',
  },
  // LO QUE EL BANCO SE LLEVA POR EXISTIR. Hasta el 31/07 no tenía destino porque no tenía naturaleza:
  // caía en el cajón de sastre "Transferencias a proveedores" y se leía como pago a proveedor. Ahora
  // tiene línea propia en Financiación del Cash Flow (mensual y semanal), que lee _BANCO_RAW —el banco
  // no emite factura por esto, así que Compras nunca lo va a tener— y la reconcilia el bloque 4.7 de
  // CAJA contra "ninguna pestaña", que es la verdad: el único registro es el extracto.
  'Comisiones y gastos bancarios': {
    pestaña: 'Cash Flow Mensual / Cash Flow Semanal',
    seccion: 'Actividades de Financiación → línea "Comisiones y gastos bancarios (Santander)"',
    mecanismo: 'SUMIFS _BANCO_RAW col C donde Naturaleza = "Comisiones y gastos bancarios", por mes/semana; '
      + 'los meses sin extracto proyectan el promedio de los meses que sí tienen (cash-flow-lineas.mjs · formulaComisionesMes)',
    fuente: 'lib/cash-flow-lineas.mjs · COMISIONES / formulaComisionesMes / formulaComisionesSemana',
    escribe: 'no',
  },
  'Préstamo prendario': {
    pestaña: 'Impuestos y Financieros',
    seccion: '6 · Deuda financiera → cuota del prendario, proyectada a los meses que faltan',
    mecanismo: 'ABS(SUMIF _BANCO_RAW col F "Préstamo prendario" col C)',
    fuente: 'scripts/impuestos-pestana.mjs',
    escribe: 'no',
  },
  'Cheques y echeq': {
    pestaña: 'Cheques Emitidos',
    seccion: 'Columna DEBITADO (K): SI cuando el banco lo pagó',
    mecanismo: 'cheques-emitidos-sync-banco.mjs marca DEBITADO cruzando por (instrumento, número) — la '
      + 'chequera física y la electrónica numeran por separado y el registro tiene el 313 en las dos. '
      + 'Fuente: public.cheques (desde el 30/07; antes era la lista a mano ECHEQS_EMITIDOS, con corte congelado). '
      + 'El débito del CHEQUE FÍSICO sale de la referencia del extracto, que trae el número pero NO el '
      + 'instrumento: conciliarDebitosDeCheques declara AMBIGUO lo que no puede resolver, en vez de marcar el '
      + 'cheque equivocado. Los debitados DESPUÉS del corte restan en la línea neta de CAJA '
      + '(formulaChequesDebitadosPosteriores)',
    fuente: 'scripts/cheques-emitidos-sync-banco.mjs · lib/cheques-debito-banco.mjs · lib/caja-posterior-al-corte.mjs',
    escribe: 'columna DEBITADO',
  },
  AFIP: {
    pestaña: 'Impuestos y Financieros',
    seccion: 'Débito de AFIP — el detalle (qué impuesto) vive en Compras/DDJJ, no se infiere del banco',
    mecanismo: 'El saldo lo absorbe; el desglose por impuesto no sale del concepto bancario (gap declarado)',
    fuente: 'scripts/impuestos-pestana.mjs',
    escribe: 'no',
  },
  'Pago de la tarjeta': {
    pestaña: 'Tarjeta de Credito',
    seccion: 'Débito automático del resumen — se controla contra el consumo no debitado de la tarjeta',
    mecanismo: 'CAJA controla el disponible de tarjeta vs pestaña Tarjeta; el pago en sí baja el saldo del banco',
    fuente: 'scripts/caja-pestana.mjs · bloque 4.2',
    escribe: 'no',
  },
  Sueldos: {
    pestaña: 'Jornales por Quincena / Cargas Sociales',
    seccion: 'El detalle de la nómina vive en sus pestañas; el banco confirma la SALIDA',
    mecanismo: 'El saldo del banco absorbe el pago; el detalle no se reconstruye desde el concepto bancario',
    fuente: 'pestañas de nómina (fuera de este camino)',
    escribe: 'no',
  },
  'Compras con tarjeta de débito': {
    pestaña: 'Compras',
    seccion: 'Egreso de proveedor pagado con débito — el detalle (obra, rubro) lo pone Compras',
    mecanismo: 'El saldo lo absorbe. Si se pagó por Débito y es posterior al corte, resta en la línea neta de CAJA',
    fuente: 'lib/caja-posterior-al-corte.mjs · formulaComprasPagadasPosteriores',
    escribe: 'no',
  },
  'Débitos automáticos (seguros)': {
    pestaña: 'Recurrentes / Compras',
    seccion: 'Seguros y débitos automáticos (Federación Patronal, Sancor) — gasto recurrente',
    mecanismo: 'El saldo lo absorbe; el reconocimiento del gasto vive en Recurrentes/Compras',
    fuente: 'pestañas de gasto (fuera de este camino)',
    escribe: 'no',
  },
  'Transferencias a proveedores': {
    pestaña: 'Compras',
    seccion: 'Pago a proveedor por transferencia — el detalle (factura, obra) lo pone Compras',
    mecanismo: 'El saldo lo absorbe. Posterior al corte y con estado Pagado/Transferencia, resta en la línea neta de CAJA',
    fuente: 'lib/caja-posterior-al-corte.mjs · formulaComprasPagadasPosteriores',
    escribe: 'no',
  },
  'Ajuste sin detalle del banco': {
    pestaña: 'Caja',
    seccion: 'Hold/retención intradía que ninguna línea del extracto explica — rotulado, no disfrazado',
    mecanismo: 'Entra a _BANCO_RAW con su rótulo propio para cerrar la cadena; no ensucia la conciliación por naturaleza',
    fuente: 'lib/banco-santander.mjs · MOVIMIENTOS_DIA',
    escribe: 'no',
  },
  'Cobranzas de clientes': {
    pestaña: 'Cobranzas (conciliación, NO alta automática)',
    seccion: 'Un crédito con naturaleza cobranza se COMPARA contra Cobranzas de la misma ventana',
    mecanismo: 'ingresosPorNaturaleza; el saldo ya contiene el cobro — no se da de alta desde el banco',
    fuente: 'lib/banco-santander.mjs · naturalezaIngreso / ingresosPorNaturaleza',
    escribe: 'concilia',
  },
  'Rescates de inversión y financiero': {
    pestaña: 'Ninguna (no es ingreso operativo)',
    seccion: 'Rescate de inversión / desembolso de préstamo — plata propia o financiamiento',
    mecanismo: 'naturalezaIngreso lo marca financiero por CUIT de contraparte; queda fuera de Cobranzas',
    fuente: 'lib/banco-santander.mjs · CONTRAPARTES / naturalezaIngreso',
    escribe: 'no',
  },
  'Traslados de fondos propios (no es ingreso)': {
    pestaña: 'Caja (alerta de efectivo sin depositar)',
    seccion: 'Depósito de efectivo o acreditación de echeq ya en cartera — plata propia cambiando de lugar',
    mecanismo: 'naturalezaIngreso → traslado; alimenta la alerta "efectivo cobrado que no se depositó" de CAJA',
    fuente: 'lib/banco-santander.mjs · naturalezaIngreso · scripts/caja-pestana.mjs',
    escribe: 'no',
  },
}

/**
 * NÚCLEO PURO: el destino declarado de UN movimiento del extracto.
 * @param {{concepto:string, importe:number}} mov
 * @returns {{bucket:string, importe:number, entra:boolean, destino:object}}
 */
export function destinoDeMovimiento(mov) {
  const bucket = clasificarMovimiento(mov?.concepto ?? '')
  const destino = DESTINOS[bucket]
  if (!destino) throw new Error(`sin destino declarado para la naturaleza "${bucket}" — agregala a DESTINOS`)
  return { bucket, importe: Number(mov?.importe) || 0, entra: (Number(mov?.importe) || 0) >= 0, destino }
}

/**
 * NÚCLEO PURO: agrupa una lista de movimientos por su destino, con total y cantidad.
 * Es la "previsualización de impacto": qué pestañas va a tocar un extracto antes de importarlo.
 * @param {{concepto:string, importe:number}[]} movimientos
 * @returns {{bucket:string, pestaña:string, cantidad:number, monto:number, escribe:string}[]}
 */
export function resumirImpacto(movimientos = []) {
  const acc = new Map()
  for (const m of movimientos) {
    const { bucket, importe, destino } = destinoDeMovimiento(m)
    const a = acc.get(bucket) ?? { bucket, pestaña: destino.pestaña, escribe: destino.escribe, cantidad: 0, monto: 0 }
    a.cantidad++
    a.monto += importe
    acc.set(bucket, a)
  }
  return [...acc.values()].sort((x, y) => x.monto - y.monto)
}

/**
 * NÚCLEO PURO: los créditos separados por su naturaleza real, para la conciliación.
 * SÓLO 'cobranza' se compara contra Cobranzas; traslado y financiero comparados inventan una
 * diferencia falsa. Reusa naturalezaIngreso (no la reimplementa).
 * @param {{concepto:string, importe:number}[]} movimientos
 */
export function creditosParaConciliar(movimientos = []) {
  const out = { cobranza: [], traslado: [], financiero: [] }
  for (const m of movimientos) {
    if ((Number(m?.importe) || 0) <= 0) continue
    out[naturalezaIngreso(m)].push(m)
  }
  return out
}
