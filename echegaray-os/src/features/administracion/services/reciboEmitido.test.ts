import { test } from 'node:test'
import assert from 'node:assert/strict'
import { armarRecibo, eleccionInicial } from './reciboDeLaQuincena.ts'
import { motivoParaNoEmitir, palabrasProhibidas, sellarRecibo } from './reciboEmitido.ts'
import { pagoDeLaLinea } from './pagoDeLaQuincena.ts'
import type { LineaConOverrides } from './liquidacionOverrides.ts'

const fmt = (n: number) => `$${n}`
const quien = {
  personaId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', nombre: '  Pérez, Juan  ',
  categoria: 'Oficial', desde: '2026-09-16', hasta: '2026-09-30',
}

// El mismo jornalero de `reciboDeLaQuincena.test.ts`: 45 h en blanco + 51 en negro, banco 230.000,
// efectivo 306.000, y 100.000 ya pagados en mano.
const jornalero = {
  porBanco: 230000, enEfectivo: 306000, pagadoBanco: 0, pagadoEfectivo: 100000,
  sueldo: { horasBlanco: 45, valorHoraCategoria: 6666.67, bruto: 300000, horasNegro: 51, valorHoraNegro: 6000, negro: 306000 },
  pago: pagoDeLaLinea({ banco: 230000, negro: 306000, pagadoEfectivo: 100000 }),
} as unknown as LineaConOverrides

test('lo sellado son las cifras DEL PAPEL: horas totales, banco, efectivo y total', () => {
  const s = sellarRecibo(quien, armarRecibo(jornalero, eleccionInicial(jornalero), fmt))
  assert.equal(s.horas, 96)
  assert.equal(s.banco, 230000)
  assert.equal(s.efectivo, 306000)
  assert.equal(s.total, 536000)
  // El nombre va sin los espacios de los datos, y la categoría como texto: una recategorización posterior
  // no puede cambiar el recibo que la persona ya firmó.
  assert.equal(s.nombre, 'Pérez, Juan')
  assert.equal(s.categoria, 'Oficial')
  assert.equal(s.quincenaDesde, '2026-09-16')
})

test('se guardan los renglones ENTEROS: la reimpresión no recalcula, copia', () => {
  const papel = armarRecibo(jornalero, { horas: true, banco: true, efectivo: true, pagado: true }, fmt)
  const s = sellarRecibo(quien, papel)
  assert.deepEqual(s.renglones.medios, papel.medios)
  assert.deepEqual(s.renglones.horas, papel.horas)
  // Y es una copia: seguir tildando opciones en la pantalla no puede mutar lo que ya se aceptó.
  papel.medios.push({ rotulo: 'agregado después', importe: 1 })
  assert.equal(s.renglones.medios.length, papel.medios.length - 1)
})

test('un medio sin tildar deja su columna en null, que NO es $ 0', () => {
  const s = sellarRecibo(quien, armarRecibo(jornalero, { horas: false, banco: false, efectivo: true, pagado: false }, fmt))
  assert.equal(s.banco, null)
  assert.equal(s.horas, null)
  assert.equal(s.efectivo, 306000)
})

test('nada de blanco ni negro en lo guardado: el papel limpio pasa', () => {
  const s = sellarRecibo(quien, armarRecibo(jornalero, eleccionInicial(jornalero), fmt))
  assert.deepEqual(palabrasProhibidas(s), [])
  assert.equal(motivoParaNoEmitir(s), null)
})

test('un renglón que abra el reparto NO se puede emitir, y se dice cuál', () => {
  const s = sellarRecibo(quien, armarRecibo(jornalero, eleccionInicial(jornalero), fmt))
  s.renglones.medios.push({ rotulo: 'Horas en negro', importe: 306000 })
  assert.deepEqual(palabrasProhibidas(s), ['negro'])
  assert.match(motivoParaNoEmitir(s) ?? '', /negro/)
})

test('un apellido Blanco NO rebota: el control mira los rótulos, no el nombre', () => {
  const s = sellarRecibo({ ...quien, nombre: 'Blanco, Ramón' }, armarRecibo(jornalero, eleccionInicial(jornalero), fmt))
  assert.deepEqual(palabrasProhibidas(s), [])
  assert.equal(motivoParaNoEmitir(s), null)
  assert.equal(s.nombre, 'Blanco, Ramón')
})

test('un recibo sin ningún renglón no se emite', () => {
  const s = sellarRecibo(quien, armarRecibo(jornalero, { horas: false, banco: false, efectivo: false, pagado: false }, fmt))
  assert.match(motivoParaNoEmitir(s) ?? '', /Tildá al menos un concepto/)
})
