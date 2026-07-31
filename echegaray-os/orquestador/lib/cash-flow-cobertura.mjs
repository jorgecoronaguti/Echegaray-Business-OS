// EL MAPA pestaña → concepto DEL CASH FLOW — UNA SOLA DEFINICIÓN, VERIFICABLE (T04).
//
// LA REGLA DEL DUEÑO (T04): "todo movimiento de toda pestaña se refleja en los conceptos de los Cash
// Flows, sin doble conteo y sin huecos." Este archivo hace ese mapa EXPLÍCITO y lo somete a un test
// contra el CUADRO y las REGLAS reales, para que:
//   · ninguna pestaña que aporta plata al cuadro quede sin concepto (hueco), y
//   · ninguna pestaña DERIVADA de otra se sume dos veces (doble conteo).
//
// NO CALCULA NADA. El cuadro lo arma cash-flow-lineas.mjs; la partición de Compras la garantiza
// rubro-caja.mjs; la caja física y el saldo, caja-posterior-al-corte.mjs. Este archivo es la
// guardiana de coherencia: declara QUÉ ROL cumple cada pestaña frente al cash flow y prueba que ese
// rol coincide con lo que el cuadro realmente hace.
//
// ═══ LOS CINCO ROLES, Y LA GARANTÍA ANTI-DOBLE-CONTEO DE CADA UNO ═══
//
//   PARTICION   — Compras. Cada fila cae en EXACTAMENTE un rubro de caja (rubro-caja.mjs); el cuadro
//                 suma esos rubros. Duplicar es imposible (una fila, un rubro) y quedar afuera es
//                 visible (el control del pie resta rubros contra el total de Compras).
//   FUENTE      — sus movimientos ENTRAN al cuadro por un concepto propio, con dato que NO sale de
//                 Compras: Cobranzas (ingresos), Jornales por Quincena (el real reemplaza la
//                 estimación de Compras), Cheques Emitidos y Tarjeta de Crédito (SÓLO los pagos cuya
//                 factura no está en Compras — el resto ya viajó por el rubro de esa factura).
//   DERIVADA    — es una VISTA o PROYECCIÓN de otra pestaña. El dinero YA entró por su fuente, así
//                 que la derivada NO se suma: sumarla sería contar dos veces. Cargas Sociales,
//                 Impuestos y Financieros, Estructura, Recurrentes, Proveedores y Materiales son
//                 detalle/proyección de Compras.
//   ANCLA       — CAJA. Aporta el SALDO (Efectivo al inicio/cierre), no un flujo. Sumar un saldo como
//                 si fuera un movimiento sería mezclar stock con flujo.
//   INFORMATIVO — Cheques Recibidos. Registro histórico de operaciones eCHEQ; la cartera real vive en
//                 CAJA y el cobro en Cobranzas. NO se suma (lo dice su propio encabezado: cada fila es
//                 una operación, no un cheque, y sumar la columna contaría el mismo valor tres veces).

import { CUADRO, instrumentosDeLinea, CALENDARIO_IMPUESTOS } from './cash-flow-lineas.mjs'
import { REGLAS } from './rubro-caja.mjs'

/**
 * NÚCLEO PURO: las pestañas de las que el cuadro SUMA plata, derivadas del CUADRO + REGLAS reales.
 * Es la fuente de verdad contra la que se valida el MAPA: si el cuadro empieza a sumar de una pestaña
 * nueva, esto la incluye sola y el test exige que el mapa la contemple.
 * @returns {Set<string>}
 */
export function fuentesSumadas() {
  const src = new Set()
  const porRubro = new Map(REGLAS.map((r) => [r.rubro, r]))
  for (const act of CUADRO) {
    for (const g of act.grupos) {
      for (const l of g.lineas) {
        if (l.cobranzas) src.add('Cobranzas')
        else if (l.cheques) for (const i of instrumentosDeLinea(l.inst)) src.add(i.pestaña)
        // IVA/IIBB neto a pagar: NO vive en Compras, así que el cuadro lo SUMA de "Impuestos y Financieros".
        else if (l.calendarioImpuestos) src.add(CALENDARIO_IMPUESTOS.pestaña)
        // Las comisiones del banco tampoco tienen pestaña dueña: se leen del extracto, igual que el
        // interés del descubierto y el impuesto al cheque.
        else if (l.descubierto || l.impuestoCheque || l.comisionesBancarias) { /* calculado o leído del extracto (tasa/ley/comisión del banco), sin pestaña de origen */ }
        else if (l.soloSub) src.add('Compras') // bienes de uso: un sub-rubro de Compras
        else if (l.rubro) {
          const regla = porRubro.get(l.rubro)
          // paga='compras' → el dinero sale de Compras; si no, de la pestaña que paga (Jornales).
          src.add(regla?.paga === 'compras' ? 'Compras' : regla?.paga)
        }
      }
    }
  }
  src.delete(undefined)
  return src
}

/**
 * EL MAPA. Cada pestaña del Flujo de Fondos que T04 nombra, con su rol y el porqué de que no haya
 * doble conteo. `deriva_de` (sólo en DERIVADA) nombra la pestaña cuya plata ya contempla el cuadro —
 * la razón por la que esta NO se suma.
 * @type {Array<{pestania:string, rol:'PARTICION'|'FUENTE'|'DERIVADA'|'ANCLA'|'INFORMATIVO', concepto:string, deriva_de?:string, nota:string}>}
 */
export const MAPA = [
  {
    pestania: 'Compras', rol: 'PARTICION',
    concepto: 'los 10 rubros de egreso del cuadro (jornales, sueldos, cargas, materiales, estructura, impuestos, financiero…)',
    nota: 'Cada fila cae en exactamente un rubro de caja. El cuadro suma esos rubros; el control del pie resta rubros contra el total de Compras: si algo quedara afuera, la diferencia deja de ser $0.',
  },
  {
    pestania: 'Cobranzas', rol: 'FUENTE',
    concepto: 'Cobranzas de obra civil · de mantenimiento · Otras cobranzas (los tres cobros del cuadro)',
    nota: 'Único origen de los ingresos. Un valor endosado no se suma (no entra a la cuenta). Los cobros sin unidad o sin fecha los grita el bloque de control del ingreso (T04).',
  },
  {
    pestania: 'Jornales por Quincena', rol: 'FUENTE',
    concepto: 'Jornales de obra (dentro de Pagos al personal)',
    nota: 'El dato REAL de la planilla de jornales, no la estimación tipeada en Compras ($114,4M reales vs $144,8M estimados). Por eso el total de egresos del año no coincide con Compras, y está bien.',
  },
  {
    pestania: 'Cheques Emitidos', rol: 'FUENTE',
    concepto: 'Cheques y tarjeta sin factura cargada (dentro de Pagos a proveedores)',
    nota: 'Sólo entran los cheques cuya factura NO está en Compras. El cheque cuya factura SÍ está ya viajó al cuadro por el rubro de esa factura — sumarlo acá lo duplicaría. Es una línea que existe para desaparecer cuando se cargan las facturas.',
  },
  {
    pestania: 'Tarjeta de Credito', rol: 'FUENTE',
    concepto: 'Cheques y tarjeta sin factura cargada (misma línea, junto con Cheques Emitidos)',
    nota: 'Mismo criterio anti-doble-conteo que Cheques Emitidos: sólo los consumos cuya factura no está en Compras. El resto ya está en su rubro.',
  },
  {
    pestania: 'Proveedores', rol: 'DERIVADA', deriva_de: 'Compras',
    concepto: 'detalle de Materiales Civil / Mantenimiento por proveedor',
    nota: 'Vista de las mismas compras, agrupadas por proveedor. El dinero ya está en los rubros de materiales de Compras: NO se suma.',
  },
  {
    pestania: 'Materiales', rol: 'DERIVADA', deriva_de: 'Compras',
    concepto: 'detalle de Materiales Civil / Mantenimiento por insumo',
    nota: 'Vista de las mismas compras, agrupadas por material. El dinero ya está en los rubros de materiales de Compras: NO se suma.',
  },
  {
    pestania: 'Cargas Sociales', rol: 'DERIVADA', deriva_de: 'Compras',
    concepto: 'detalle de Cargas sociales (F931), Gremiales y Deuda previsional',
    nota: 'Vista/proyección de los rubros de cargas sociales de Compras. El pago vive en Compras: NO se suma.',
  },
  {
    pestania: 'Impuestos y Financieros', rol: 'FUENTE',
    concepto: 'IVA e Ingresos Brutos a pagar (dentro de Pagos de impuestos)',
    nota: 'El IVA/IIBB NETO a pagar NO vive en Compras (no hay una sola fila de IVA ni de IIBB ahí): el cuadro lo SUMA de las filas "⇒ IVA a pagar" / "⇒ IIBB a pagar" del calendario, imputado al mes. NO duplica la línea de "Impuestos" (rubro de Compras = otros impuestos). El RESTO de la pestaña (prendario, planes, detalle) sí es vista de Compras y NO se suma.',
  },
  {
    pestania: 'Estructura', rol: 'DERIVADA', deriva_de: 'Compras',
    concepto: 'detalle + proyección de Gastos de estructura y de Bienes de uso',
    nota: 'El monto REAL sale del rubro Estructura de Compras; esta pestaña sólo aporta la PROYECCIÓN de los meses futuros (que el cuadro LEE, no recalcula). El real NO se suma dos veces.',
  },
  {
    pestania: 'Recurrentes', rol: 'DERIVADA', deriva_de: 'Compras',
    concepto: 'detalle + proyección de Servicios recurrentes',
    nota: 'Igual que Estructura: el real sale del rubro de Compras; esta pestaña aporta sólo la proyección de meses futuros que el cuadro LEE. El real NO se suma dos veces.',
  },
  {
    pestania: 'CAJA', rol: 'ANCLA',
    concepto: 'Efectivo y equivalentes al inicio / al cierre del período',
    nota: 'Aporta el SALDO, no un flujo. El cuadro lo usa como punto de partida y encadena. Sumar su saldo como movimiento mezclaría stock con flujo. Su composición (banco, caja física, valores) ya cuenta cada cobro/pago una sola vez por su canal (T03/T06).',
  },
  {
    pestania: 'Cheques Recibidos', rol: 'INFORMATIVO',
    concepto: '(ninguno — registro histórico de operaciones eCHEQ)',
    nota: 'Cada fila es una operación (Aceptación→Custodia→Depósito o Endoso), no un cheque: sumar la columna contaría el mismo valor varias veces. La cartera real vive en CAJA y el cobro en Cobranzas. NO alimenta el cuadro.',
  },
]

/** Los roles que representan plata que el cuadro SUMA (tienen que estar en fuentesSumadas()). */
export const ROLES_SUMADOS = new Set(['PARTICION', 'FUENTE'])

/** NÚCLEO PURO: las pestañas que el mapa marca como sumadas (PARTICION o FUENTE). */
export function pestanasSumadasSegunMapa() {
  return new Set(MAPA.filter((m) => ROLES_SUMADOS.has(m.rol)).map((m) => m.pestania))
}

/**
 * NÚCLEO PURO: verifica que el mapa sea coherente con el cuadro real. Devuelve la lista de problemas
 * (vacía = todo cierra). Lo usa el test y puede usarlo un auditor.
 * @returns {string[]}
 */
export function verificarCobertura() {
  const problemas = []
  const sumadasReal = fuentesSumadas()
  const sumadasMapa = pestanasSumadasSegunMapa()

  // 1. Toda pestaña de la que el cuadro suma plata tiene que estar declarada como sumada en el mapa.
  for (const p of sumadasReal) {
    if (!sumadasMapa.has(p)) problemas.push(`el cuadro suma de "${p}" pero el mapa no la marca como FUENTE/PARTICION (hueco)`)
  }
  // 2. El mapa no puede declarar como sumada una pestaña de la que el cuadro no suma.
  for (const p of sumadasMapa) {
    if (!sumadasReal.has(p)) problemas.push(`el mapa marca "${p}" como sumada pero el cuadro no suma de ella`)
  }
  // 3. Ninguna DERIVADA/ANCLA/INFORMATIVO puede estar entre las sumadas: sería doble conteo.
  for (const m of MAPA) {
    if (!ROLES_SUMADOS.has(m.rol) && sumadasReal.has(m.pestania)) {
      problemas.push(`"${m.pestania}" está marcada ${m.rol} pero el cuadro suma de ella (doble conteo)`)
    }
  }
  // 4. Cada DERIVADA nombra la fuente cuya plata la cubre, y esa fuente sí se suma.
  for (const m of MAPA.filter((x) => x.rol === 'DERIVADA')) {
    if (!m.deriva_de) problemas.push(`"${m.pestania}" es DERIVADA pero no dice de qué pestaña deriva`)
    else if (!sumadasReal.has(m.deriva_de)) problemas.push(`"${m.pestania}" deriva de "${m.deriva_de}", que el cuadro no suma`)
  }
  return problemas
}
