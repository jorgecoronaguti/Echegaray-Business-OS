// LA QUINCENA CERRADA MUESTRA LO SELLADO — probado con la tarifa VIGENTE distinta de la SELLADA.
//
// Son los casos que el auditor independiente reprodujo contra la base real el 18/09/2026 (ver cabecera de
// `liquidacionSellada.ts`). Cada fixture tiene una línea VIVA —lo que `armarCuadros` calcula hoy— y una línea SELLADA
// que dice otra cosa. Si la pantalla mostrara la viva, estos tests dan rojo.
//
// MUTACIONES QUE PONEN ESTE ARCHIVO EN ROJO:
//   · tomar `valorHora`, `horas` o `cobra` de la línea viva en vez de la foto (Bazán vuelve a $4.000/h).
//   · rellenar una columna sellada vacía con el cálculo de hoy (deja de ser `null`).
//   · marcar «sin tarifa» a quien no tiene fila en `persona_tarifa` pero sí línea sellada (Gonzales Abel).
//   · repetir en Obreros a quien está sellado en Oficina.
//   · perder a quien está en lo vivo sin línea sellada (tiene que quedar, con todo en `null` y en `sinLinea`).

import test from 'node:test'
import assert from 'node:assert/strict'
import { cuadroSellado, ORIGEN_SELLADO, type PersonaSellable } from './liquidacionSellada.ts'
import { sinOverrides } from './liquidacionOverrides.ts'
import type { LineaSelladaLeida } from './liquidacionGuardadas.ts'
import type { LineaLiquidada } from './liquidacionQuincena.ts'

/** Una línea VIVA como la arma `liquidarLinea` hoy: horas de `registros_hh` × tarifa vigente de `persona_tarifa`. */
const viva = (personaId: string, nombre: string, extra: Partial<LineaLiquidada> = {}): LineaLiquidada => ({
  personaId, nombre, esJefe: false,
  horas: 8, horasEquivalentes: 8, extras: [], valorHora: 4000, netoMensual: null, modalidad: 'hora',
  cobra: 32000, adelanto: 0, yaTransferido: 0, porBanco: 0, enEfectivo: 32000, total: 32000,
  efectivoRedondeado: null, sinTarifa: false, reciboNeto: null, blancoAcuerdo: 16000, efectivoAcuerdo: 16000,
  reciboSinGiro: false, origenTarifa: 'liquidacion_linea sellada quincena 2026-01-01',
  ...extra,
})

const sellada = (personaId: string, extra: Partial<LineaSelladaLeida> = {}): LineaSelladaLeida => ({
  personaId, horas: 9, valorHora: 4300, cobra: 38700, adelanto: 0, yaTransferido: 0, porBanco: 0, enEfectivo: 38700, total: 38700,
  ...extra,
})

const personas = (...ps: PersonaSellable[]): Map<string, PersonaSellable> => new Map(ps.map((p) => [p.id, p]))

test('BAZÁN, 16–31/03: el $/h y el cobra son los SELLADOS ($4.300 · $38.700), no la tarifa vigente ($4.000 · $36.000)', () => {
  const { lineas, sinLinea } = cuadroSellado({
    grupo: 'obreros',
    selladas: [sellada('bazan')],
    // LO VIVO DICE OTRA COSA: 9 h × $4.000 = $36.000 (la única tarifa cargada es la de enero).
    vivas: [viva('bazan', 'BAZAN JUAN', { horas: 9, horasEquivalentes: 9, cobra: 36000, enEfectivo: 36000, total: 36000 })],
    personas: personas({ id: 'bazan', nombre: 'BAZAN JUAN', esJefe: false }),
    selladosEnLaQuincena: new Set(['bazan']),
    redondeos: new Map(),
  })
  assert.equal(lineas.length, 1)
  const l = lineas[0]
  assert.equal(l.valorHora, 4300, 'MUTACIÓN: la tarifa vigente disfrazada de sellada')
  assert.equal(l.horas, 9)
  assert.equal(l.cobra, 38700, 'MUTACIÓN: cobra recalculado con la tarifa de hoy')
  assert.equal(l.total, 38700)
  assert.equal(l.origenTarifa, ORIGEN_SELLADO)
  assert.equal(l.sinTarifa, false)
  assert.equal(sinLinea.size, 0)
  // Y EL SELLO QUE LLEVA LA FILA DIBUJA ESE $/h: es lo que lee «Se liquidó a $4.300/h» (`categoriasDeLaFila`).
  const fila = sinOverrides(l, null, {}, { valorHora: l.valorHora, conLinea: true, piso: null, pisoDesde: null, hasta: '2026-03-31' })
  assert.equal(fila.sello?.valorHora, 4300)
  assert.equal(fila.cobra, 38700)
})

test('AGÜERO, 1ª de junio: 87 h · cobra 469.800 · pagado en efectivo 469.800 → saldo 0, con las horas vivas incompletas', () => {
  const { lineas } = cuadroSellado({
    grupo: 'obreros',
    selladas: [sellada('aguero', { horas: 87, valorHora: 5400, cobra: 469800, enEfectivo: 469800, total: 469800 })],
    // HOY `registros_hh` sólo tiene 17 h cargadas: la pantalla decía «Cobra $91.800 · saldo −378.000».
    vivas: [viva('aguero', 'AGUERO CRISTIAN DOMINGO', { horas: 17, horasEquivalentes: 17, valorHora: 5400, cobra: 91800, enEfectivo: 91800, total: 91800 })],
    personas: personas({ id: 'aguero', nombre: 'AGUERO CRISTIAN DOMINGO', esJefe: false }),
    selladosEnLaQuincena: new Set(['aguero']),
    redondeos: new Map(),
  })
  const fila = sinOverrides(lineas[0], null, { pagadoBanco: 0, pagadoEfectivo: 469800 },
    { valorHora: 5400, conLinea: true, piso: null, pisoDesde: null, hasta: '2026-06-15' })
  assert.equal(fila.horas, 87)
  assert.equal(fila.cobra, 469800)
  assert.equal(fila.pago.pagado, 469800)
  assert.equal(fila.pago.saldoTotal, 0, 'MUTACIÓN: el saldo sale del cobra vivo y da −378.000')
})

test('GONZALES ABEL, 1ª de junio: sin fila en persona_tarifa pero con 94 h × $4.000 sellados → $376.000, NO «sin tarifa»', () => {
  const { lineas } = cuadroSellado({
    grupo: 'obreros',
    selladas: [sellada('abel', { horas: 94, valorHora: 4000, cobra: 376000, adelanto: 200000, porBanco: 176000, enEfectivo: 0, total: 176000 })],
    vivas: [viva('abel', 'GONZALES ABEL VALENTIN', { valorHora: null, cobra: null, enEfectivo: null, total: null, sinTarifa: true, blancoAcuerdo: null, efectivoAcuerdo: null })],
    personas: personas({ id: 'abel', nombre: 'GONZALES ABEL VALENTIN', esJefe: false }),
    selladosEnLaQuincena: new Set(['abel']),
    redondeos: new Map(),
  })
  const l = lineas[0]
  assert.equal(l.sinTarifa, false, 'MUTACIÓN: «sin tarifa» sobre una quincena pagada')
  assert.equal(l.valorHora, 4000)
  assert.equal(l.cobra, 376000)
  assert.equal(l.adelanto, 200000)
  assert.equal(l.porBanco, 176000)
  assert.equal(l.total, 176000)
})

test('EL PIE DEL CUADRO CERRADO ES LA SUMA DE LAS FILAS SELLADAS: 20 líneas · 1.886,5 h · $9.393.250', () => {
  // Veinte fixtures que suman lo que la 1ª de junio tiene sellado; lo vivo suma menos (1.676,5 h · $7.970.750).
  const selladas: LineaSelladaLeida[] = []
  const vivas: LineaLiquidada[] = []
  const dir: PersonaSellable[] = []
  for (let i = 0; i < 20; i++) {
    const id = `p${i}`
    const horas = i === 0 ? 1886.5 - 19 * 94 : 94
    const cobra = i === 0 ? 9393250 - 19 * 470000 : 470000
    selladas.push(sellada(id, { horas, valorHora: 5000, cobra, enEfectivo: cobra, total: cobra }))
    vivas.push(viva(id, `PERSONA ${String(i).padStart(2, '0')}`, { horas: horas - 10.5, cobra: cobra - 71125, enEfectivo: cobra - 71125, total: cobra - 71125 }))
    dir.push({ id, nombre: `PERSONA ${String(i).padStart(2, '0')}`, esJefe: false })
  }
  const { lineas } = cuadroSellado({
    grupo: 'obreros', selladas, vivas, personas: personas(...dir),
    selladosEnLaQuincena: new Set(selladas.map((s) => s.personaId)), redondeos: new Map(),
  })
  assert.equal(lineas.length, 20)
  assert.equal(Math.round(lineas.reduce((s, l) => s + (l.horas ?? 0), 0) * 100) / 100, 1886.5)
  assert.equal(lineas.reduce((s, l) => s + (l.cobra ?? 0), 0), 9393250, 'MUTACIÓN: el pie suma lo vivo')
})

test('UNA COLUMNA SELLADA VACÍA QUEDA EN NULL: no se rellena con el cálculo de hoy', () => {
  const { lineas } = cuadroSellado({
    grupo: 'obreros',
    selladas: [sellada('vieja', { horas: null, valorHora: null, cobra: 250000, enEfectivo: 250000, total: 250000 })],
    vivas: [viva('vieja', 'QUINCENA VIEJA')],
    personas: personas({ id: 'vieja', nombre: 'QUINCENA VIEJA', esJefe: false }),
    selladosEnLaQuincena: new Set(['vieja']),
    redondeos: new Map(),
  })
  const l = lineas[0]
  assert.equal(l.horas, null, 'MUTACIÓN: las horas de hoy en una foto que no las tiene')
  assert.equal(l.valorHora, null, 'MUTACIÓN: la tarifa de hoy en una foto que no la tiene')
  assert.equal(l.cobra, 250000, 'lo que sí está sellado se muestra')
  assert.equal(l.sinTarifa, false, 'no es «sin tarifa»: la pantalla dice «sin dato sellado»')
})

test('QUIEN ESTÁ EN LO VIVO SIN LÍNEA SELLADA QUEDA EN EL CUADRO CON TODO EN NULL Y EN `sinLinea`', () => {
  const { lineas, sinLinea } = cuadroSellado({
    grupo: 'obreros',
    selladas: [sellada('bazan')],
    vivas: [viva('bazan', 'BAZAN JUAN'), viva('castro', 'CASTRO ROBERTO', { horas: 8, cobra: 36000 })],
    personas: personas({ id: 'bazan', nombre: 'BAZAN JUAN', esJefe: false }, { id: 'castro', nombre: 'CASTRO ROBERTO', esJefe: false }),
    selladosEnLaQuincena: new Set(['bazan']),
    redondeos: new Map(),
  })
  assert.deepEqual(lineas.map((l) => l.nombre), ['BAZAN JUAN', 'CASTRO ROBERTO'])
  const castro = lineas[1]
  assert.equal(sinLinea.has('castro'), true)
  assert.equal(castro.cobra, null, 'MUTACIÓN: el cobra de hoy publicado como pagado')
  assert.equal(castro.horas, null)
  assert.equal(castro.valorHora, null)
  assert.equal(castro.sinTarifa, false)
})

test('QUIEN ESTÁ SELLADO EN OFICINA NO SE REPITE EN OBREROS, AUNQUE HOY NO SEA JEFE NI TENGA NETO MENSUAL', () => {
  // Enero: GALVAN tiene línea sellada en la cabecera de Oficina; hoy `armarCuadros` la mandaría a Obreros.
  const obreros = cuadroSellado({
    grupo: 'obreros',
    selladas: [sellada('bazan')],
    vivas: [viva('bazan', 'BAZAN JUAN'), viva('galvan', 'GALVAN GUADALUPE')],
    personas: personas({ id: 'bazan', nombre: 'BAZAN JUAN', esJefe: false }, { id: 'galvan', nombre: 'GALVAN GUADALUPE', esJefe: false }),
    selladosEnLaQuincena: new Set(['bazan', 'galvan']),
    redondeos: new Map(),
  })
  assert.deepEqual(obreros.lineas.map((l) => l.personaId), ['bazan'], 'MUTACIÓN: la misma persona en dos cuadros es cómo se paga dos veces')
  const oficina = cuadroSellado({
    grupo: 'oficina',
    selladas: [sellada('galvan', { horas: 76, valorHora: 6250, cobra: 475000, enEfectivo: 475000, total: 475000 })],
    vivas: [],
    personas: personas({ id: 'galvan', nombre: 'GALVAN GUADALUPE', esJefe: false }),
    selladosEnLaQuincena: new Set(['bazan', 'galvan']),
    redondeos: new Map(),
  })
  const g = oficina.lineas[0]
  assert.equal(g.modalidad, 'mensual', 'la cabecera sellada manda: cobra por mes')
  assert.equal(g.cobra, 475000)
  assert.equal(g.netoMensual, 475000, 'el importe del mes de la foto es `cobra`: la celda «Sueldo del mes» lo muestra')
  assert.equal(g.blancoAcuerdo, null, 'un mensual no tiene reparto 50/50')
})

test('EL JEFE DE OBRA CERRADO SIGUE EN OFICINA CON SU IMPORTE SELLADO, Y EL BANCO DE LA FOTO MANDA SOBRE EL RECIBO', async () => {
  const { pagoDelMensual } = await import('./liquidacionPorTipo.ts')
  const { lineas } = cuadroSellado({
    grupo: 'oficina',
    selladas: [sellada('maldonado', { horas: 105, valorHora: 8125, cobra: 853125, porBanco: 0, enEfectivo: 853125, total: 853125 })],
    // HOY hay un recibo del período: en la abierta el banco sería el recibo. En la cerrada, es `por_banco` sellado.
    vivas: [viva('maldonado', 'MALDONADO BATISTA EMILIANO MIGUEL', { esJefe: true, modalidad: 'mensual', reciboNeto: 600000 })],
    personas: personas({ id: 'maldonado', nombre: 'MALDONADO BATISTA EMILIANO MIGUEL', esJefe: true }),
    selladosEnLaQuincena: new Set(['maldonado']),
    redondeos: new Map(),
  })
  const l = sinOverrides(lineas[0], null, { pagadoBanco: 0, pagadoEfectivo: 853125 },
    { valorHora: 8125, conLinea: true, piso: null, pisoDesde: null, hasta: '2026-06-15' })
  assert.equal(l.esJefe, true)
  assert.equal(l.reciboNeto, 600000, 'el recibo del período viaja: es un hecho de ese período')
  const p = pagoDelMensual(l)
  assert.equal(p.origenBanco, 'sellado')
  assert.equal(p.banco, 0, 'MUTACIÓN: el banco de la cerrada sale del recibo y no de la foto')
  assert.equal(p.negro, 853125)
  assert.equal(p.saldoTotal, 0)
})
