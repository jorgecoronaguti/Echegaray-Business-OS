#!/usr/bin/env node
/**
 * ¿CAJA VE TODAS LAS PESTAÑAS DEL ARCHIVO, O HAY PLATA QUE NO ENTRA EN EL PISO?
 *
 * SÓLO LEE. No escribe una celda. Se puede correr contra el Sheet real sin riesgo.
 *
 * POR QUÉ EXISTE (05/08/2026). El dueño pidió CAJA "eficiente y conectada a todas las pestañas". Eso
 * no se contesta con una lista de nombres: se contesta con un MONTO. Una pestaña "conectada" que
 * aporta $0 al calendario está igual de desconectada que una que no se nombra, y la única forma de
 * distinguirlas es medir cuánta plata de cada una llega efectivamente al piso proyectado.
 *
 * ═══ EL CONTROL NO SE VALIDA CONTRA LO QUE PRODUCE ═══
 *
 * No se leen las celdas del calendario para preguntarles si están completas. Se parte del MAPA de
 * cobertura (lib/cash-flow-cobertura.mjs), que declara el rol de cada pestaña frente al cuadro, y se
 * lo confronta contra lo que el calendario REALMENTE suma —los sumandos que arma
 * `expresionSaleEnVentana` sobre el horizonte completo— y contra el saldo vivo de cada pestaña.
 *
 * Las DERIVADAS no se suman y eso NO es un hueco: su plata ya viaja por Compras. Confundir "no la
 * suma" con "no la ve" es el error que llevaría a contar todo dos veces.
 *
 *   node orquestador/scripts/caja-conectividad.mjs
 */

import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { MAPA, ROLES_SUMADOS, fuentesSumadas } from '../lib/cash-flow-cobertura.mjs'
import { lineasDeCaja, conceptosFueraDelCalendario, marcaDeLinea } from '../lib/calendario-egresos.mjs'
import { RAW } from '../lib/conciliacion-por-naturaleza.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const pesos = (n) => (n < 0 ? '-' : '') + '$' + Math.abs(Math.round(n)).toLocaleString('es-AR')

/**
 * EL PUENTE entre la línea del cuadro que el calendario no puede ubicar y la naturaleza con la que el
 * clasificador la escribió en `_BANCO_RAW`. Explícito y no por palabra clave: los rótulos de los dos
 * lados no se parecen ("Intereses del acuerdo en descubierto" contra "Costo financiero del
 * descubierto") y un emparejamiento por texto devolvía $0 — un cero de matcheo disfrazado de medición.
 */
export const NATURALEZA_DE_MARCA = {
  descubierto: 'Costo financiero del descubierto',
  comisiones: 'Comisiones y gastos bancarios',
  impuestoCheque: 'Impuesto al cheque (Ley 25.413)',
}
const NATURALEZA_DE_MARCA_INV = new Set(Object.values(NATURALEZA_DE_MARCA))

/**
 * NÚCLEO PURO: el veredicto de conectividad de cada pestaña del MAPA.
 *
 * @param {Set<string>} sumadas las pestañas de las que el cuadro efectivamente suma
 * @param {Array<string>} ciegos conceptos del cuadro que el calendario no ubica en el tiempo
 * @returns {Array<{pestania:string, rol:string, estado:'conectada'|'derivada'|'DESCONECTADA'|'informativa', porque:string}>}
 */
export function veredictoConectividad(sumadas, ciegos = []) {
  return MAPA.map((m) => {
    if (!ROLES_SUMADOS.has(m.rol)) {
      // ANCLA e INFORMATIVO no aportan flujo por diseño. Declararlas "desconectadas" sería un falso
      // positivo que enseña a ignorar el control.
      return {
        pestania: m.pestania, rol: m.rol,
        estado: m.rol === 'DERIVADA' ? 'derivada' : 'informativa',
        porque: m.rol === 'DERIVADA' ? `su plata ya viaja por ${m.deriva_de}: sumarla la contaría dos veces` : m.nota.split('.')[0],
      }
    }
    if (!sumadas.has(m.pestania)) {
      return { pestania: m.pestania, rol: m.rol, estado: 'DESCONECTADA', porque: 'el cuadro no suma de esta pestaña' }
    }
    return { pestania: m.pestania, rol: m.rol, estado: 'conectada', porque: m.concepto }
  }).concat(ciegos.map((n) => ({
    pestania: '(sin pestaña)', rol: 'CALCULADO', estado: 'DESCONECTADA',
    porque: `"${n}" no tiene fuente con fecha: el calendario lo vale CERO en todos los tramos`,
  })))
}

async function main() {
  const g = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })
  const uno = async (r) => {
    const v = (await g.readSheetValues(ID, r, { render: 'UNFORMATTED_VALUE' }))?.[0]?.[0]
    return typeof v === 'number' && Number.isFinite(v) ? v : 0
  }

  const egresos = lineasDeCaja().filter(({ signo }) => signo === -1)
  const sinFuente = ['descubierto', 'comisiones', 'impuestoCheque']
  const nombresSinFuente = egresos.filter(({ linea }) => sinFuente.includes(marcaDeLinea(linea))).map(({ linea }) => linea.nombre)
  const ciegos = conceptosFueraDelCalendario(
    egresos.map(({ linea }) => linea.nombre).filter((n) => !nombresSinFuente.includes(n)))

  console.log('\n¿QUÉ PESTAÑAS VE CAJA, Y CUÁNTA PLATA DE CADA UNA LLEGA AL PISO?')
  console.log('─'.repeat(96))
  for (const v of veredictoConectividad(fuentesSumadas(), ciegos)) {
    const marca = v.estado === 'DESCONECTADA' ? '✗' : v.estado === 'conectada' ? '✓' : '·'
    console.log(`  ${marca} ${v.pestania.padEnd(24)} ${v.rol.padEnd(12)} ${v.estado.padEnd(14)} ${v.porque.slice(0, 40)}`)
  }

  // EL MONTO DE LO QUE QUEDA AFUERA. Las tres líneas sin fuente valen CERO en el calendario, así que
  // "cuánto queda afuera" no se puede leer del calendario: hay que ir a la única fuente que las
  // conoce, que es el extracto — y el extracto sólo prueba el pasado. Ese es exactamente el límite.
  console.log('─'.repeat(96))
  const total = await uno('CAJA_TOTAL_DISPONIBLE')
  console.log(`\n  disponibilidad percibida hoy: ${pesos(total)}`)

  // ═══ EL MONTO DE LO QUE QUEDA AFUERA, MEDIDO ═══
  //
  // "Tres conceptos sin fuente" es una lista; lo que decide es cuánto valen. La única fuente que los
  // conoce es el EXTRACTO, y por definición sólo prueba el pasado: lo que sigue NO es la proyección
  // que falta, es la magnitud del agujero medida sobre lo que ya pasó. Sale de la columna de
  // naturaleza que el clasificador ya escribió en la réplica — no se reclasifica acá.
  const [nat, imp, fec] = await Promise.all([
    g.readSheetValues(ID, `${RAW.hoja}!${RAW.naturaleza}${RAW.desde}:${RAW.naturaleza}`, { render: 'UNFORMATTED_VALUE' }),
    g.readSheetValues(ID, `${RAW.hoja}!${RAW.importe}${RAW.desde}:${RAW.importe}`, { render: 'UNFORMATTED_VALUE' }),
    g.readSheetValues(ID, `${RAW.hoja}!${RAW.fecha}${RAW.desde}:${RAW.fecha}`, { render: 'UNFORMATTED_VALUE' }),
  ])
  const porNat = new Map()
  const dias = new Set()
  nat.forEach((f, i) => {
    const n = String(f?.[0] ?? '').trim()
    if (!NATURALEZA_DE_MARCA_INV.has(n)) return
    porNat.set(n, (porNat.get(n) ?? 0) + Math.abs(Number(imp[i]?.[0]) || 0))
    if (typeof fec[i]?.[0] === 'number') dias.add(fec[i][0])
  })
  const suma = [...porNat.values()].reduce((a, b) => a + b, 0)
  console.log(`  lo que el calendario NO ubica en el tiempo (${ciegos.length} conceptos, medidos sobre el extracto):`)
  for (const { linea } of egresos.filter(({ linea }) => sinFuente.includes(marcaDeLinea(linea)))) {
    // EL PUENTE ES EXPLÍCITO, NO POR PALABRA CLAVE. La primera versión buscaba la naturaleza que
    // contuviera la primera palabra del concepto: "Intereses del acuerdo en descubierto" nunca iba a
    // encontrar "Costo financiero del descubierto" y el renglón mostraba $0 — un cero de emparejamiento
    // disfrazado de cero medido, que es justo lo que este script existe para no hacer.
    console.log(`     · ${linea.nombre.padEnd(56)} ${pesos(porNat.get(NATURALEZA_DE_MARCA[marcaDeLinea(linea)]) ?? 0).padStart(14)}`)
  }
  console.log(`     ${'TOTAL YA COBRADO POR EL BANCO en la ventana del extracto'.padEnd(58)} ${pesos(suma).padStart(14)}`)
  console.log(`     (${dias.size} días con movimiento en la réplica)\n`)
  console.log('  ⚠ Los tres cargos los debita el banco SIN factura: su único registro es el extracto, que')
  console.log('    por definición sólo cubre el pasado. El calendario los vale CERO y lo declara en su')
  console.log('    propia fila. El piso es optimista en la magnitud de estos tres costos.\n')
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(e); process.exitCode = 1 })
