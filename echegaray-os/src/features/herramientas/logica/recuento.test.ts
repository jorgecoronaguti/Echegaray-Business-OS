import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  diferenciaDe, lineasDe, lineasParaEnviar, recuentoAbierto, recuentosDelLugar, resumenCerrado, resumenRecuento, sePuedeCerrar,
  itemsDeRecuento, textoCierre, textoResumen, todoBien, validarCantidad, type LineaEnCurso, type Recuento, type RecuentoLinea,
} from './recuento.ts'
import { armarParque } from './parque.ts'
import { historial } from './historial.ts'
import { activo, ubicacion } from './fixture.test-util.ts'

const linea = (activoId: string, esperado: number, texto: string, nota?: string): LineaEnCurso => ({ activoId, esperado, texto, nota })

test('lo que se tipea: sólo enteros de 0 o más; vacío es «sin contar», nunca 0', () => {
  assert.deepEqual(validarCantidad('7'), { ok: true, valor: 7 })
  assert.deepEqual(validarCantidad(' 0 '), { ok: true, valor: 0 })
  assert.deepEqual(validarCantidad(''), { ok: true, valor: null })
  assert.deepEqual(validarCantidad('   '), { ok: true, valor: null })
  assert.equal(validarCantidad('7,5').ok, false)
  assert.equal(validarCantidad('-1').ok, false)
  assert.equal(validarCantidad('abc').ok, false)
  assert.equal(validarCantidad('100001').ok, false)
})

test('la diferencia es contado menos esperado, y no existe hasta contar', () => {
  assert.equal(diferenciaDe(8, 7), -1)
  assert.equal(diferenciaDe(8, 10), 2)
  assert.equal(diferenciaDe(8, 8), 0)
  assert.equal(diferenciaDe(8, null), null)
})

test('el resumen cuenta lo contado, las diferencias, lo que falta y lo que sobra, y los ceros', () => {
  const r = resumenRecuento([
    linea('a', 8, '8'),
    linea('b', 5, '3'),
    linea('c', 1, '0'),
    linea('d', 2, '4'),
    linea('e', 1, ''),
    linea('f', 1, 'x'),
  ])
  assert.equal(r.total, 6)
  assert.equal(r.contados, 4, 'el vacío y el inválido no cuentan')
  assert.equal(r.conDiferencia, 3)
  assert.equal(r.faltan, 3, '2 de b y 1 de c')
  assert.equal(r.sobran, 2)
  assert.deepEqual(r.enCero, ['c'])
  assert.deepEqual(r.invalidos, ['f'])
  assert.equal(sePuedeCerrar(r), false, 'con un campo inválido no se cierra')
  assert.equal(sePuedeCerrar({ contados: 0, invalidos: [] }), false, 'sin contar nada no se cierra')
  assert.equal(sePuedeCerrar({ contados: 1, invalidos: [] }), true)
})

test('el texto del resumen es «N contados · M con diferencia»', () => {
  assert.equal(textoResumen({ contados: 0, conDiferencia: 0 }), 'Nada contado todavía')
  assert.equal(textoResumen({ contados: 1, conDiferencia: 0 }), '1 contado · sin diferencias')
  assert.equal(textoResumen({ contados: 12, conDiferencia: 3 }), '12 contados · 3 con diferencia')
})

test('«Todo bien» iguala cada campo a lo esperado, también los que ya tenían otra cosa', () => {
  const l = todoBien([linea('a', 8, ''), linea('b', 5, '3')])
  assert.deepEqual(l.map((x) => x.texto), ['8', '5'])
})

test('a la base viaja sólo lo contado, como número; la nota sólo si dice algo', () => {
  assert.deepEqual(lineasParaEnviar([linea('a', 8, '7', 'uno roto'), linea('b', 5, ''), linea('c', 1, '0', '  '), linea('d', 1, 'x')]), [
    { activo: 'a', contado: 7, nota: 'uno roto' },
    { activo: 'c', contado: 0 },
  ])
})

test('el aviso del cierre dice qué se ajustó y qué quedó en 0 sin ajustar', () => {
  assert.equal(textoCierre({ contados: 3, con_diferencia: 2, ajustadas: 1, sin_ajustar: ['ALA-006'] }, true),
    'Recuento cerrado · 3 contados · 2 con diferencia · 1 existencia ajustada · ALA-006 quedó en 0 y no se ajusta: es una baja o un movimiento.')
  assert.equal(textoCierre({ contados: 3, con_diferencia: 0, ajustadas: 0, sin_ajustar: [] }, true),
    'Recuento cerrado · 3 contados · sin diferencias · el inventario no cambió.')
  assert.equal(textoCierre({ contados: 3, con_diferencia: 2, ajustadas: 0, sin_ajustar: [] }, false),
    'Recuento guardado sin ajustar · 3 contados · 2 con diferencia.')
})

const rec = (p: Partial<Recuento> & Pick<Recuento, 'id' | 'ubicacion_id'>): Recuento =>
  ({ iniciado_en: '2026-09-23T10:00:00Z', cerrado_en: null, aplicado: null, hecho_por: null, cerrado_por: null, observaciones: null, ...p })

test('los recuentos del lugar: los cerrados del más nuevo al más viejo; el abierto aparte; null = sin la migración', () => {
  const rs = [
    rec({ id: '1', ubicacion_id: 'u', cerrado_en: '2026-09-20T10:00:00Z', aplicado: true }),
    rec({ id: '2', ubicacion_id: 'u', cerrado_en: '2026-09-22T10:00:00Z', aplicado: false }),
    rec({ id: '3', ubicacion_id: 'u' }),
    rec({ id: '4', ubicacion_id: 'otro', cerrado_en: '2026-09-23T10:00:00Z', aplicado: true }),
  ]
  assert.deepEqual(recuentosDelLugar(rs, 'u').map((r) => r.id), ['2', '1'])
  assert.equal(recuentoAbierto(rs, 'u')?.id, '3')
  assert.equal(recuentoAbierto(rs, 'otro'), null)
  assert.deepEqual(recuentosDelLugar(null, 'u'), [])
})

test('el resumen de un recuento cerrado sale de sus líneas', () => {
  const ls: RecuentoLinea[] = [
    { recuento_id: '1', activo_id: 'a', esperado: 8, contado: 8, diferencia: 0, nota: null },
    { recuento_id: '1', activo_id: 'b', esperado: 5, contado: 3, diferencia: -2, nota: null },
    { recuento_id: '1', activo_id: 'c', esperado: 1, contado: null, diferencia: null, nota: null },
    { recuento_id: '2', activo_id: 'a', esperado: 8, contado: 9, diferencia: 1, nota: null },
  ]
  assert.deepEqual(resumenCerrado(lineasDe(ls, '1')), { total: 3, contados: 2, conDiferencia: 1 })
  assert.deepEqual(lineasDe(ls, '2').map((l) => l.activo_id), ['a'])
})

test('un recuento guardado sin ajustar deja la diferencia en el historial del activo; uno ajustado no se duplica', () => {
  const p = armarParque({
    ubicaciones: [ubicacion({ id: 't', tipo: 'taller', nombre: 'Taller' })],
    obras: [],
    activos: [activo({ id: 'a', codigo: 'BAL-001', nombre: 'Balde', cantidad: 8, ubicacion_id: 't' }), activo({ id: 'b', codigo: 'PAL-001', nombre: 'Pala', ubicacion_id: 't' })],
    movimientos: [], incidencias: [], nombres: { u1: 'R. Sosa' },
    recuentos: [
      rec({ id: 'r1', ubicacion_id: 't', cerrado_en: '2026-09-23T15:00:00Z', aplicado: false, cerrado_por: 'u1' }),
      rec({ id: 'r2', ubicacion_id: 't', cerrado_en: '2026-09-22T15:00:00Z', aplicado: true, cerrado_por: 'u1' }),
    ],
    recuentoLineas: [
      { recuento_id: 'r1', activo_id: 'a', esperado: 8, contado: 7, diferencia: -1, nota: 'uno roto' },
      { recuento_id: 'r1', activo_id: 'b', esperado: 1, contado: 1, diferencia: 0, nota: null },
      { recuento_id: 'r2', activo_id: 'a', esperado: 8, contado: 6, diferencia: -2, nota: null },
    ],
  })
  const deA = historial(p, 'a').filter((r) => r.tipo === 'recuento')
  assert.equal(deA.length, 1, 'el aplicado ya figura por su ajuste; el sin ajustar, por el recuento')
  assert.equal(deA[0].texto, 'Recuento en Taller: se esperaban 8, se contaron 7 · sin ajustar · R. Sosa')
  assert.equal(deA[0].nota, 'uno roto')
  assert.equal(deA[0].fecha, '2026-09-23T15:00:00Z')
  assert.equal(historial(p, 'b').filter((r) => r.tipo === 'recuento').length, 0, 'sin diferencia no hay renglón')
  assert.deepEqual(itemsDeRecuento(p, 't').map((i) => [i.codigo, i.esperado]), [['BAL-001', 8], ['PAL-001', 1]])
})
