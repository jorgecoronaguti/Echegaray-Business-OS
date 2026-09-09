import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  calcularCadena, diasDelPanel, hhPorMes, rastroDelDia, type CorreccionDeDia, type RegistroDelPanel,
} from './panelDePersona.ts'

// ═══ R1 · SIN RETRIBUCIÓN NO HAY COBRA, Y NO ES CERO ═══

test('sin valor hora cargado, COBRA es null y la fila queda marcada', () => {
  const c = calcularCadena({
    horas: 56, valorHora: null, adelanto: 50000, yaTransferido: null, porBanco: null,
    efectivoRedondeado: null,
  })
  assert.equal(c.cobra, null, 'un 0 acá le paga cero a alguien que trabajó 56 horas')
  assert.equal(c.enEfectivo, null)
  assert.equal(c.total, null)
  assert.equal(c.sinRetribucion, true)
})

test('la cadena de R5: cuatro celdas escritas y tres calculadas', () => {
  const c = calcularCadena({
    horas: 56, valorHora: 3650, adelanto: 50000, yaTransferido: null, porBanco: null,
    efectivoRedondeado: 155000,
  })
  assert.equal(c.cobra, 204400)
  assert.equal(c.enEfectivo, 154400)
  // TOTAL = POR BANCO + EN EFECTIVO, nunca COBRA: el adelanto ya salió de la caja antes.
  assert.equal(c.total, 154400)
  assert.equal(c.efectivoRedondeado, 155000, 'el redondeo del dueño se publica tal cual')
})

test('lo que va por banco no se vuelve a pagar en efectivo', () => {
  const c = calcularCadena({
    horas: 100, valorHora: 1000, adelanto: null, yaTransferido: 20000, porBanco: 30000,
    efectivoRedondeado: null,
  })
  assert.equal(c.enEfectivo, 50000)
  assert.equal(c.total, 80000)
})

// ═══ R8 · EL RASTRO, Y EL ORIGINAL QUE NO SE PIERDE ═══

const corr = (p: Partial<CorreccionDeDia>): CorreccionDeDia => ({
  horasAntes: 9, horasDespues: 12, autor: 'Jorge Corona', corregidoEn: '2026-09-08T14:00:00Z', ...p,
})

test('un día sin correcciones no dice que lo corrigieron', () => {
  const r = rastroDelDia([])
  assert.equal(r.texto, null)
  assert.equal(r.original, null)
  assert.equal(r.veces, 0)
})

test('el rastro nombra a quien corrigió último y el valor con el que el día nació', () => {
  const r = rastroDelDia([corr({})])
  assert.equal(r.texto, 'corrigió J. Corona el 08/09 · era 9')
  assert.equal(r.original, 9)
})

test('DOS correcciones: «era» sigue siendo el original, no el valor intermedio', () => {
  // El defecto que atrapa: leer `horas_antes` de la ÚLTIMA corrección diría «era 12» y el 9
  // original quedaría enterrado — exactamente lo que la tabla de historial existe para evitar.
  const r = rastroDelDia([
    corr({ horasAntes: 12, horasDespues: 8, autor: 'Ana Laura', corregidoEn: '2026-09-09T10:00:00Z' }),
    corr({ horasAntes: 9, horasDespues: 12, corregidoEn: '2026-09-08T14:00:00Z' }),
  ])
  assert.equal(r.veces, 2)
  assert.equal(r.original, 9, 'el original es el de la PRIMERA corrección')
  assert.match(r.texto ?? '', /^corrigió A\. Laura el 09\/09 · era 9$/)
})

test('el original puede ser «sin cargar»: un día que nació vacío y alguien completó', () => {
  const r = rastroDelDia([corr({ horasAntes: null, horasDespues: 9 })])
  assert.equal(r.original, null)
  assert.match(r.texto ?? '', /era sin cargar$/)
})

// ═══ PANTALLA 3 · LOS DÍAS ═══

const reg = (p: Partial<RegistroDelPanel>): RegistroDelPanel => ({
  id: 'r1', fecha: '2026-09-07', horas: 12, tipo_hora: 'extra_50', obra: 'SF · PISOS',
  actividad: null, cargo: null, fuenteLegacy: 'JORNALES', creadoEn: '2026-09-07T12:00:00Z', ...p,
})

test('los días bajan del más nuevo al más viejo y dicen quién cargó', () => {
  const dias = diasDelPanel(
    [reg({ id: 'a', fecha: '2026-09-07' }), reg({ id: 'b', fecha: '2026-09-09', cargo: 'Jorge Corona', fuenteLegacy: null, creadoEn: '2026-09-09T12:00:00Z' })],
    new Map([['a', [corr({})]]]),
    { editable: true },
  )
  assert.deepEqual(dias.map((d) => d.fecha), ['2026-09-09', '2026-09-07'])
  assert.equal(dias[0].cargo, 'Jorge Corona · 09/09')
  // SIN PERFIL NO SE INVENTA UN NOMBRE: la fila vino de la planilla y lo dice.
  assert.equal(dias[1].cargo, 'JORNALES (planilla) · 07/09')
  assert.equal(dias[1].clase, 'Extra 50%')
  assert.equal(dias[1].rastro.original, 9)
  assert.equal(dias[0].rastro.texto, null)
})

test('quincena cerrada: ningún día queda editable', () => {
  const dias = diasDelPanel([reg({})], new Map(), { editable: false })
  assert.equal(dias[0].editable, false)
})

// ═══ HH POR MES · UN MES SIN CARGAR NO ES UN MES SIN TRABAJAR ═══

test('el mes sin ninguna hora cargada vale null, nunca 0', () => {
  const meses = hhPorMes(
    [{ fecha: '2026-09-07', horas: 9 }, { fecha: '2026-09-08', horas: 9 }, { fecha: '2026-08-20', horas: 8 }],
    '2026-09-15',
    3,
  )
  assert.deepEqual(meses.map((m) => m.rotulo), ['jul', 'ago', 'sep'])
  assert.equal(meses[0].horas, null, 'julio no tiene filas: no es un mes de cero horas')
  assert.equal(meses[1].horas, 8)
  assert.equal(meses[2].horas, 18)
  assert.equal(meses[2].actual, true)
})
