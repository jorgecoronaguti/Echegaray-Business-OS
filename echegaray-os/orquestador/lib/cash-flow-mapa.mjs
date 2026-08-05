// QUÉ ES CADA LÍNEA DEL CASH FLOW Y DE DÓNDE SALE — el contrato, escrito una sola vez.
//
// POR QUÉ EXISTE (04/08). "De dónde sale este número" se contestaba leyendo un SUMIFS de 900
// caracteres dentro de una celda. Acá cada línea declara su fuente y su criterio de fecha en
// castellano, al lado de la función que la rehace desde esa fuente. Si mañana alguien cambia la
// columna de la que lee el cuadro y no toca esto, la conciliación se pone roja — que es todo el punto.
//
// NATURALEZA. `fuente` = la línea se puede rehacer desde una pestaña de origen y su diferencia con la
// celda es un hallazgo. `derivada` = la línea sale del propio cuadro (un porcentaje de otras filas, el
// saldo anterior); rehacerla desde el cuadro no prueba nada sobre el origen y se informa como tal.
// Mezclar las dos categorías es la trampa clásica: un control validado contra lo que él mismo produce.

import {
  conciliarCobranzas, conciliarCompras, conciliarEstructuraNeta, conciliarSinFactura,
  conciliarBanco, conciliarJornales, conciliarSueldos, impuestoAlCheque, serialDeFecha,
} from './cash-flow-conciliacion.mjs'

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)

/**
 * IVA + IIBB que vencen dentro de la ventana.
 *
 * LA VENTANA DE ARCA NO ES LA DE COMPRAS: el IVA de un mes se paga el mes siguiente. El vencimiento
 * se modela como fin de mes + 20 días, que es lo que usa el cuadro semanal; el mensual lo resuelve
 * apuntando a la columna del mes anterior. Las dos formas tienen que dar lo mismo y por eso acá hay
 * UNA sola: si el mensual y el semanal difieren, la diferencia aparece.
 */
export function ivaIibbEnVentana(impuestos = [], { desde, hasta, anio = 2026 }, filaIva = 18, filaIibb = 28) {
  let total = 0
  const detalle = []
  for (let m = 1; m <= 12; m++) {
    const vence = serialDeFecha(anio, m + 1, 1) - 1 + 20 // fin de mes + 20 días
    if (vence < desde || vence >= hasta) continue
    const iva = num((impuestos[filaIva - 1] || [])[m])
    const iibb = num((impuestos[filaIibb - 1] || [])[m])
    total += iva + iibb
    detalle.push({ mes: m, vence, iva, iibb })
  }
  return { total, detalle }
}

/** Las filas del cuadro que alimentan el impuesto al cheque, en el orden en que las lista la fórmula. */
export const FILAS_IMPUESTO_CHEQUE = [7, 8, 9, 11, 12, 13, 15, 16, 17, 18, 19, 20, 24, 25, 26, 27, 29, 30, 32, 33, 38, 43, 44, 45]

/**
 * EL MAPA. `fila` es 1-indexada y se verifica contra el rótulo de la columna A antes de usarse:
 * las dos pestañas comparten esqueleto pero una fila insertada corre todo, y una conciliación que
 * compara la fila equivocada es peor que no conciliar.
 */
export const LINEAS = [
  { fila: 6, concepto: 'Cobros por ventas y servicios (ya cobrado)', tipo: 'subtotal', hijos: [7, 8, 9] },
  { fila: 7, concepto: 'Cobranzas de obra civil', tipo: 'fuente', fuente: 'Cobranzas', criterio: 'F=Civil · O=Cobrado · no endosada · fecha de cobro Q (si no, venta P) · monto M', calc: (F, v) => conciliarCobranzas(F.cobranzas, { unidad: 'civil', cobrado: true, ...v }) },
  { fila: 8, concepto: 'Cobranzas de mantenimiento', tipo: 'fuente', fuente: 'Cobranzas', criterio: 'F=Mantenimiento · O=Cobrado · no endosada · fecha de cobro Q', calc: (F, v) => conciliarCobranzas(F.cobranzas, { unidad: 'mantenimiento', cobrado: true, ...v }) },
  { fila: 9, concepto: 'Otras cobranzas', tipo: 'fuente', fuente: 'Cobranzas', criterio: 'F distinta de Civil y Mantenimiento · O=Cobrado · fecha de cobro Q', calc: (F, v) => conciliarCobranzas(F.cobranzas, { unidad: 'otras', cobrado: true, ...v }) },
  { fila: 10, concepto: 'Cobranzas esperadas — de este mes en adelante (suma al flujo)', tipo: 'subtotal', hijos: [11, 12, 13] },
  { fila: 11, compuerta: true, concepto: 'Esperado · obra civil', tipo: 'fuente', fuente: 'Cobranzas', criterio: 'F=Civil · O≠Cobrado y ≠Endosado · fecha de cobro Q · sólo de este mes en adelante', calc: (F, v) => conciliarCobranzas(F.cobranzas, { unidad: 'civil', cobrado: false, ...v }) },
  { fila: 12, compuerta: true, concepto: 'Esperado · mantenimiento', tipo: 'fuente', fuente: 'Cobranzas', criterio: 'F=Mantenimiento · O≠Cobrado · fecha de cobro Q · de este mes en adelante', calc: (F, v) => conciliarCobranzas(F.cobranzas, { unidad: 'mantenimiento', cobrado: false, ...v }) },
  { fila: 13, compuerta: true, concepto: 'Esperado · otras', tipo: 'fuente', fuente: 'Cobranzas', criterio: 'F≠Civil y ≠Mantenimiento · O≠Cobrado · fecha de cobro Q', calc: (F, v) => conciliarCobranzas(F.cobranzas, { unidad: 'otras', cobrado: false, ...v }) },
  { fila: 14, concepto: '(–) Pagos al personal y cargas sociales', tipo: 'subtotal', hijos: [15, 16, 17, 18, 19, 20] },
  { fila: 15, concepto: 'Jornales de obra', tipo: 'fuente', fuente: 'Jornales por Quincena', criterio: 'quincenas reales por "Pagado el" (si no, "Se paga el", si no "Hasta") + quincenas proyectadas', calc: (F, v) => conciliarJornales(F.jornalesReales, F.jornalesProy, v) },
  { fila: 16, concepto: 'Sueldos de administración', tipo: 'fuente', fuente: 'Jornales por Quincena (Oficina + Dirección)', criterio: 'OFICINA_PAGO / DIRECCION_PAGO dentro de la ventana · pagado + proyectado', calc: (F, v) => conciliarSueldos([...F.oficina, ...F.direccion], v) },
  { fila: 17, rubro: "Nómina · SAC", concepto: 'Sueldo anual complementario', tipo: 'fuente', fuente: 'Compras', criterio: 'AC="Nómina · SAC" · fecha de caja AD · total O', calc: (F, v) => conciliarCompras(F.compras, { rubro: 'Nómina · SAC', ...v }) },
  { fila: 18, rubro: "Nómina · Cargas sociales", concepto: 'Cargas sociales (F931)', tipo: 'fuente', fuente: 'Compras', criterio: 'AC="Nómina · Cargas sociales" · fecha de caja AD', calc: (F, v) => conciliarCompras(F.compras, { rubro: 'Nómina · Cargas sociales', ...v }) },
  { fila: 19, rubro: "Nómina · Gremiales", concepto: 'Aportes y contribuciones gremiales', tipo: 'fuente', fuente: 'Compras', criterio: 'AC="Nómina · Gremiales" · fecha de caja AD', calc: (F, v) => conciliarCompras(F.compras, { rubro: 'Nómina · Gremiales', ...v }) },
  { fila: 20, rubro: "Deuda previsional (planes de pago)", concepto: 'Planes de pago de deuda previsional', tipo: 'fuente', fuente: 'Compras', criterio: 'AC="Deuda previsional (planes de pago)" · fecha de caja AD', calc: (F, v) => conciliarCompras(F.compras, { rubro: 'Deuda previsional (planes de pago)', ...v }) },
  { fila: 21, concepto: 'ℹ La misma nómina de administración, según Compras (control)', tipo: 'subtotal', hijos: [22], noSuma: true },
  { fila: 22, rubro: "Nómina · Sueldos administración", concepto: 'Sueldos de administración cargados a mano en Compras', tipo: 'fuente', fuente: 'Compras', criterio: 'AC="Nómina · Sueldos administración" · fecha de caja AD', noSuma: true, calc: (F, v) => conciliarCompras(F.compras, { rubro: 'Nómina · Sueldos administración', ...v }) },
  { fila: 23, concepto: '(–) Pagos a proveedores de obra', tipo: 'subtotal', hijos: [24, 25, 26, 27] },
  { fila: 24, rubro: "Materiales Civil", concepto: 'Materiales e insumos de obra civil', tipo: 'fuente', fuente: 'Compras', criterio: 'AC="Materiales Civil" · fecha de caja AD', calc: (F, v) => conciliarCompras(F.compras, { rubro: 'Materiales Civil', ...v }) },
  { fila: 25, rubro: "Materiales Mantenimiento", concepto: 'Materiales de mantenimiento', tipo: 'fuente', fuente: 'Compras', criterio: 'AC="Materiales Mantenimiento" · fecha de caja AD', calc: (F, v) => conciliarCompras(F.compras, { rubro: 'Materiales Mantenimiento', ...v }) },
  { fila: 26, concepto: 'Cheques sin factura cargada', tipo: 'fuente', fuente: 'Cheques Emitidos', criterio: 'M = "⚠ FALTA cargar la factura…" · fecha de pago I · monto F', calc: (F, v) => conciliarSinFactura(F.cheques, { tipo: 'cheque', ...v }) },
  { fila: 27, concepto: 'Cuotas de tarjeta sin factura cargada', tipo: 'fuente', fuente: 'Tarjeta de Credito', criterio: 'L = "⚠ FALTA cargar la factura…" · fecha de pago H · monto E', calc: (F, v) => conciliarSinFactura(F.tarjeta, { tipo: 'tarjeta', ...v }) },
  { fila: 28, concepto: '(–) Gastos de estructura y servicios', tipo: 'subtotal', hijos: [29, 30] },
  { fila: 29, rubro: "Estructura", concepto: 'Gastos de estructura y administración', tipo: 'fuente', fuente: 'Compras', criterio: 'AC="Estructura" MENOS AF="Equipos y rodados (inversión)" · fecha de caja AD', calc: (F, v) => conciliarEstructuraNeta(F.compras, v) },
  { fila: 30, rubro: "Servicios recurrentes", concepto: 'Servicios recurrentes', tipo: 'fuente', fuente: 'Compras', criterio: 'AC="Servicios recurrentes" · fecha de caja AD', calc: (F, v) => conciliarCompras(F.compras, { rubro: 'Servicios recurrentes', ...v }) },
  { fila: 31, concepto: '(–) Pagos de impuestos', tipo: 'subtotal', hijos: [32, 33] },
  { fila: 32, rubro: "Impuestos", concepto: 'Impuestos nacionales y provinciales', tipo: 'fuente', fuente: 'Compras', criterio: 'AC="Impuestos" · fecha de caja AD', calc: (F, v) => conciliarCompras(F.compras, { rubro: 'Impuestos', ...v }) },
  { fila: 33, concepto: 'IVA e Ingresos Brutos a pagar', tipo: 'fuente', fuente: 'Impuestos y Financieros', criterio: 'fila 18 (IVA) + fila 28 (IIBB) del mes que VENCE en la ventana (fin de mes + 20 días)', calc: (F, v) => ivaIibbEnVentana(F.impuestos, v) },
  { fila: 34, concepto: 'FLUJO NETO DE ACTIVIDADES OPERATIVAS', tipo: 'derivada', criterio: '= 6 + 10 − 14 − 23 − 28 − 31', calc: null },
  { fila: 37, concepto: '(–) Adquisición de bienes de uso', tipo: 'subtotal', hijos: [38] },
  { fila: 38, subrubroInv: 'Equipos y rodados (inversión)', concepto: 'Equipos, rodados y maquinaria', tipo: 'fuente', fuente: 'Compras', criterio: 'AF="Equipos y rodados (inversión)" · fecha de caja AD', calc: (F, v) => conciliarCompras(F.compras, { subrubro: 'Equipos y rodados (inversión)', ...v }) },
  { fila: 42, concepto: '(–) Servicio de deuda financiera', tipo: 'subtotal', hijos: [43, 44, 45, 46] },
  { fila: 43, rubro: "Financiero", concepto: 'Cuotas de crédito prendario y gastos bancarios', tipo: 'fuente', fuente: 'Compras', criterio: 'AC="Financiero" · fecha de caja AD', calc: (F, v) => conciliarCompras(F.compras, { rubro: 'Financiero', ...v }) },
  { fila: 44, concepto: 'Intereses del acuerdo en descubierto (proyectados)', tipo: 'derivada', criterio: 'MAX(interés sobre el saldo inicial NEGATIVO del propio cuadro; el costo real del extracto)', calc: (F, v) => conciliarBanco(F.banco, { naturaleza: 'Costo financiero del descubierto', ...v }) },
  { fila: 45, concepto: 'Comisiones y gastos bancarios (Santander)', tipo: 'fuente', fuente: '_BANCO_RAW', criterio: 'F="Comisiones y gastos bancarios" · fecha A · importe C (se invierte el signo)', calc: (F, v) => { const r = conciliarBanco(F.banco, { naturaleza: 'Comisiones y gastos bancarios', ...v }); return { ...r, total: -r.total } } },
  { fila: 46, concepto: 'Impuesto al cheque (Ley 25.413, 0,6% de cada lado)', tipo: 'derivada', criterio: '0,6% de la suma de las filas que mueven la cuenta', calc: null },
  { fila: 47, concepto: 'ℹ Salió del banco y no está en Compras (control)', tipo: 'subtotal', hijos: [48, 49, 50], noSuma: true },
  { fila: 48, concepto: 'AFIP — pagos debitados de la cuenta', tipo: 'fuente', fuente: '_BANCO_RAW', criterio: 'E="sale" · F="AFIP" · fecha A · |importe C|', noSuma: true, calc: (F, v) => conciliarBanco(F.banco, { naturaleza: 'AFIP', sentido: 'sale', ...v }) },
  { fila: 49, concepto: 'Consumos con tarjeta de débito', tipo: 'fuente', fuente: '_BANCO_RAW', criterio: 'E="sale" · F="Compras con tarjeta de débito"', noSuma: true, calc: (F, v) => conciliarBanco(F.banco, { naturaleza: 'Compras con tarjeta de débito', sentido: 'sale', ...v }) },
  { fila: 50, concepto: 'Débitos automáticos (seguros)', tipo: 'fuente', fuente: '_BANCO_RAW', criterio: 'E="sale" · F="Débitos automáticos (seguros)"', noSuma: true, calc: (F, v) => conciliarBanco(F.banco, { naturaleza: 'Débitos automáticos (seguros)', sentido: 'sale', ...v }) },
  { fila: 53, concepto: 'AUMENTO / (DISMINUCIÓN) NETA DEL EFECTIVO', tipo: 'derivada', criterio: '= 34 + 39 + 51', calc: null },
]

/** Los subtotales del cuadro, para el invariante padre = suma de hijos. */
export const SUBTOTALES = LINEAS.filter((l) => l.tipo === 'subtotal').map(({ fila, hijos, concepto }) => ({ fila, hijos, concepto }))

/** El impuesto al cheque rehecho desde las celdas del propio cuadro (línea derivada). */
export function impuestoAlChequeDeColumna(grid = [], col) {
  return impuestoAlCheque(FILAS_IMPUESTO_CHEQUE.map((f) => num((grid[f - 1] || [])[col])))
}
