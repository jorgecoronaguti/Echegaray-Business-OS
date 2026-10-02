import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  borradorDeLaDiferencia, conceptoDeLaDiferencia, loteDeDiferencias, marcaDeLaQuincena, reciboDeLaDiferencia, restaDeEfectivo, ROTULO_DIFERENCIA,
} from './reciboPorLaDiferencia.ts'
import { armarRecibo, eleccionInicial } from './reciboDeLaQuincena.ts'
import { pagoDeLaLinea } from './pagoDeLaQuincena.ts'
import { validarReciboPago, fraseDelReciboPago } from '../../efectivo/logica/reciboPago.ts'
import type { LineaConOverrides } from './liquidacionOverrides.ts'

// El mismo jornalero de `reciboDeLaQuincena.test.ts`: efectivo 306.000 con 100.000 ya pagados.
const linea = (pagadoEfectivo: number, negro = 306000) => ({
  porBanco: 230000, enEfectivo: negro, pagadoBanco: 0, pagadoEfectivo,
  sueldo: { horasBlanco: 45, valorHoraCategoria: 6666.67, bruto: 300000, horasNegro: 51, valorHoraNegro: 6000, negro },
  pago: pagoDeLaLinea({ banco: 230000, negro, pagadoEfectivo }),
}) as unknown as LineaConOverrides

const Q2_SEPT = { desde: '2026-09-16', hasta: '2026-09-30' }

test('el importe precargado es la «resta» del Efectivo del recibo de la quincena, no otra cuenta', () => {
  const l = linea(100000)
  const delPapel = armarRecibo(l, { horas: true, horasRecibo: false, horasFuera: false, banco: true, efectivo: true, pagado: true }, String)
    .medios.filter((m) => m.rotulo === 'resta').at(-1)?.importe
  assert.equal(restaDeEfectivo(l, false), 206000)
  assert.equal(restaDeEfectivo(l, false), delPapel)
})

test('sin saldo de efectivo no hay recibo por la diferencia: pagado entero, o cobró de más', () => {
  assert.equal(restaDeEfectivo(linea(306000), false), null)
  assert.equal(restaDeEfectivo(linea(400000), false), null)
})

test('la 1ª quincena del mensual no ofrece el recibo: el mes se liquida en la 2ª', () => {
  const l = { ...linea(0), seLiquidaEnLa2da: true } as LineaConOverrides
  assert.equal(restaDeEfectivo(l, true), null)
})

test('el concepto es el texto del dueño, con la quincena, el mes y el año, y no dice blanco ni negro', () => {
  assert.equal(conceptoDeLaDiferencia(Q2_SEPT),
    'Diferencia de pago en efectivo de la 2ª quincena de septiembre de 2026. '
    + 'Con este importe queda cubierto lo que no se había pagado en efectivo de esa quincena.')
  assert.match(conceptoDeLaDiferencia({ desde: '2026-10-01', hasta: '2026-10-15' }), /de la 1ª quincena de octubre de 2026\./)
  assert.doesNotMatch(conceptoDeLaDiferencia(Q2_SEPT), /blanco|negro/i)
})

test('el borrador precargado pasa la misma validación que el servidor y el papel dice 55.000', () => {
  const b = borradorDeLaDiferencia({ importe: 55000, quincena: Q2_SEPT, hoy: '2026-10-02', aNombreDe: 'AGÜERO JUAN', documento: '30111222' })
  assert.equal(b.importe, '55.000')
  assert.equal(b.fecha, '2026-10-02')
  const v = validarReciboPago(b, '2026-10-02')
  assert.ok(v.ok)
  if (!v.ok) return
  assert.equal(v.dato.importe, 55000)
  assert.equal(v.dato.documento, '30111222')
  assert.match(fraseDelReciboPago(v.dato), /cincuenta y cinco mil \(\$ 55\.000,00\) en concepto de Diferencia de pago en efectivo de la 2ª quincena/)
})

test('el formulario no escribe lo pagado de la liquidación: el dueño lo suma a mano', () => {
  const fuente = readFileSync(new URL('../components/liquidacion/cuadro/ReciboPorLaDiferencia.tsx', import.meta.url), 'utf8')
  assert.match(fuente, /emitirReciboPagoAction/)
  assert.match(fuente, /personaId: fila\.personaId/)
  assert.doesNotMatch(fuente, /pagadoEfectivo|guardarOverride|liquidacionOverridesActions/)
})

// ═══ EN LOTE — las cifras del 02/10/2026 (2ª quincena de septiembre) ═══
// Las LÍNEAS son armadas (efectivo 400.000 con lo pagado que deja esa resta), no leídas de la base: lo que se prueba
// es que el lote toma la resta de cada uno, deja afuera a quien no debe nada y suma lo que el dueño contó.
const DIFERENCIAS: [string, number][] = [
  ['Agüero', 55000], ['González Carlos', 54000], ['Pastrán', 55000], ['Petina', 54000], ['Rosales', 54000],
  ['Alaniz', 16000], ['González Emiliano', 16000], ['González Juan', 17000], ['Quiroga Alexander', 16000],
  ['Quiroga Sebastián', 16000], ['Reta', 17000],
]
const AL_DIA = ['Castillo', 'Ochoa', 'Zogbe', 'Tello Juan']
const mensualAlDia = {
  porBanco: 500000, enEfectivo: 0, cobra: 2500000, adelanto: 0, yaTransferido: 0, pagadoBanco: 500000, pagadoEfectivo: 2000000,
  sueldo: null, reciboNeto: null, sello: null, manual: {},
  pago: pagoDeLaLinea({ banco: 500000, negro: 2000000, pagadoBanco: 500000, pagadoEfectivo: 2000000 }),
} as unknown as LineaConOverrides

test('lote real: de los tildados, 11 con diferencia que suman 370.000; los al día y los mensualizados, sin diferencia', () => {
  const filas = [
    ...DIFERENCIAS.map(([nombre, x]) => ({ personaId: nombre, nombre, linea: linea(400000 - x, 400000), mensual: false })),
    ...AL_DIA.map((nombre) => ({ personaId: nombre, nombre, linea: linea(400000, 400000), mensual: false })),
    { personaId: 'Maldonado', nombre: 'Maldonado', linea: mensualAlDia, mensual: true },
    { personaId: 'Nievas', nombre: 'Nievas', linea: mensualAlDia, mensual: true },
    // No tildado: aunque le falte plata, no entra.
    { personaId: 'Otro', nombre: 'Otro', linea: linea(0, 400000), mensual: false },
  ]
  const marcados = new Set(filas.map((f) => f.personaId).filter((id) => id !== 'Otro'))
  const lote = loteDeDiferencias(filas, marcados)
  assert.deepEqual(lote.con.map((c) => [c.nombre, c.resta]), DIFERENCIAS)
  assert.equal(lote.con.reduce((a, c) => a + c.resta, 0), 370000)
  assert.deepEqual(lote.sin.map((s) => s.nombre), [...AL_DIA, 'Maldonado', 'Nievas'])
})

test('el lote emite por la acción de lote, con ids del navegador, sin nombre del navegador ni escribir lo pagado', () => {
  const panel = readFileSync(new URL('../components/liquidacion/cuadro/RecibosPorLaDiferencia.tsx', import.meta.url), 'utf8')
  assert.match(panel, /emitirRecibosPorLaDiferenciaAction/)
  assert.match(panel, /crypto\.randomUUID\(\)/)
  assert.doesNotMatch(panel, /pagadoEfectivo|guardarOverride|liquidacionOverridesActions/)
  const accion = readFileSync(new URL('../../efectivo/services/reciboPagoLoteAcciones.ts', import.meta.url), 'utf8')
  assert.match(accion, /p_persona_id: r\.personaId/)
  assert.match(accion, /leerPersonasParaRecibo/, 'nombre y DNI salen del legajo, en el servidor')
  assert.doesNotMatch(accion, /aNombreDe: z\./, 'el esquema no acepta un nombre del navegador')
})

// ═══ EL PAPEL DE LA DIFERENCIA = EL DE LA QUINCENA (dueño 02/10: «como los demás recibos de liq de hs») ═══
test('papel de Alaniz (RP-000022): horas como el recibo de la quincena, Efectivo 259.000 · ya pagado 243.000 · diferencia 16.000, sin banco', () => {
  const l = linea(243000, 259000)
  const r = reciboDeLaDiferencia(l, false, 16000, String)
  assert.ok(r)
  assert.ok(r.horas.length >= 3, 'total, por recibo y fuera de recibo')
  assert.deepEqual(r.horas, armarRecibo(l, eleccionInicial(l), String).horas)
  assert.deepEqual(r.medios.map((m) => [m.rotulo, m.importe, !!m.sub]), [
    ['Efectivo', 259000, false], ['ya pagado', 243000, true], [ROTULO_DIFERENCIA, 16000, true],
  ])
  assert.equal(r.total, 16000, 'el total es la diferencia, no el efectivo de la quincena')
  const textos = [...r.horas, ...r.medios].map((m) => `${m.rotulo} ${m.detalle ?? ''}`).join(' ')
  assert.doesNotMatch(textos, /blanco|negro|banco/i)
})

test('la diferencia es el importe del RP, no la resta de hoy; y si el dueño ya sumó el pago, «ya pagado» sigue siendo el de antes', () => {
  // El RP dice 15.000 aunque la resta sea 16.000: manda lo emitido.
  assert.equal(reciboDeLaDiferencia(linea(243000, 259000), false, 15000, String)?.total, 15000)
  // Pagado ya incluye los 16.000: el papel no puede decir «ya pagado 259.000» al lado de «diferencia 16.000».
  const despues = reciboDeLaDiferencia(linea(259000, 259000), false, 16000, String)
  assert.equal(despues?.medios.find((m) => m.rotulo === 'ya pagado')?.importe, 243000)
})

test('un RP ya emitido se reconoce por la quincena que nombra su concepto', () => {
  assert.equal(marcaDeLaQuincena(Q2_SEPT), 'de la 2ª quincena de septiembre de 2026')
  assert.ok(conceptoDeLaDiferencia(Q2_SEPT).includes(marcaDeLaQuincena(Q2_SEPT)))
  assert.ok(!conceptoDeLaDiferencia({ desde: '2026-09-01', hasta: '2026-09-15' }).includes(marcaDeLaQuincena(Q2_SEPT)))
})

test('el lote imprime el papel de la quincena y no emite a quien ya tiene RP', () => {
  const panel = readFileSync(new URL('../components/liquidacion/cuadro/RecibosPorLaDiferencia.tsx', import.meta.url), 'utf8')
  assert.match(panel, /HojasDeRecibosA4/)
  assert.match(panel, /reciboDeLaDiferencia\(/)
  assert.doesNotMatch(panel, /recibo-pago\/lote/, 'no el PDF genérico de Efectivo')
  assert.match(panel, /diferenciasYaEmitidasAction/)
  assert.match(panel, /porEmitir = conocidos \? lote\.con\.filter\(\(c\) => !rpDe\(c\.personaId\)\)/)
})
