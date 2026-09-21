import { test } from 'node:test'
import assert from 'node:assert/strict'
import { casilleros, colaDeEtiquetas, ETIQUETA, HOJA, hojas, POR_HOJA, renglonesDeNombre } from './etiquetas.ts'
import { activo } from './fixture.test-util.ts'

test('24 casilleros de 50×25 que entran en el A4 sin tocarse', () => {
  const c = casilleros()
  assert.equal(c.length, 24)
  assert.equal(POR_HOJA, 24)
  for (const k of c) {
    assert.ok(k.x >= 5 && k.x + ETIQUETA.ancho <= HOJA.ancho - 5, `se sale por el costado: x=${k.x}`)
    assert.ok(k.y >= 5 && k.y + ETIQUETA.alto <= HOJA.alto - 5, `se sale por arriba o abajo: y=${k.y}`)
  }
  for (let i = 0; i < c.length; i++) {
    for (let j = i + 1; j < c.length; j++) {
      const a = c[i], b = c[j]
      const pisa = a.x < b.x + ETIQUETA.ancho && b.x < a.x + ETIQUETA.ancho && a.y < b.y + ETIQUETA.alto && b.y < a.y + ETIQUETA.alto
      assert.equal(pisa, false, `el casillero ${i} pisa al ${j}`)
    }
  }
})

test('la grilla queda centrada: el mismo margen a izquierda y derecha', () => {
  const c = casilleros()
  const izq = Math.min(...c.map((k) => k.x))
  const der = HOJA.ancho - Math.max(...c.map((k) => k.x + ETIQUETA.ancho))
  assert.ok(Math.abs(izq - der) < 0.001)
})

test('la cola se parte en hojas de 24; la última puede quedar a medias', () => {
  const h = hojas(Array.from({ length: 50 }, (_, i) => i))
  assert.deepEqual(h.map((x) => x.length), [24, 24, 2])
  assert.deepEqual(hojas([]), [])
})

test('la cola: lo pedido primero y en su orden, después altas desde obra, después nunca impresas; sin bajas', () => {
  const as = [
    activo({ id: '1', codigo: 'HER-0001', nombre: 'a' }),
    activo({ id: '2', codigo: 'HER-0002', nombre: 'b', etiqueta_impresa_en: '2026-03-12T10:00:00Z' }),
    activo({ id: '3', codigo: 'HER-0003', nombre: 'c', alta_desde_obra: true }),
    activo({ id: '4', codigo: 'HER-0004', nombre: 'd', estado: 'baja', baja_motivo: 'robada', baja_en: '2026-07-03T10:00:00Z' }),
  ]
  const cola = colaDeEtiquetas(as, ['HER-0002', 'HER-0004', 'HER-0002', 'NO-EXISTE'])
  assert.deepEqual(cola.map((x) => `${x.activo.codigo}:${x.motivo}`), [
    'HER-0002:pedida', 'HER-0003:alta_desde_obra', 'HER-0001:nunca_impresa',
  ])
})

test('el nombre entra en dos renglones; lo que sobra se corta con «…», nunca se superpone', () => {
  assert.deepEqual(renglonesDeNombre('Hidrolavadora Karcher K5'), ['Hidrolavadora Karcher', 'K5'])
  assert.deepEqual(renglonesDeNombre('Amoladora'), ['Amoladora'])
  const r = renglonesDeNombre('Vibrador de inmersión Menegotti con manguera de seis metros')
  assert.equal(r.length, 2)
  assert.ok(r[1].endsWith('…'))
  assert.ok(r.every((x) => x.length <= 22))
})
