// LO QUE VE EL CLIENTE, PROBADO.
//
// ═══ LOS DOS DEFECTOS QUE ESTOS TESTS IMPIDEN ═══
//
// 1. OFERTAR AL COSTO. `subtotal` es costo, no precio. Si la oferta lo publicara tal cual, el
//    documento saldría sin margen, sin indirectos y sin impuestos — y se vería perfectamente normal.
// 2. UN DOCUMENTO QUE NO CIERRA. Redondear cada renglón por su cuenta deja unos pesos de diferencia
//    contra el total, y ésa es la clase de error que un cliente encuentra en treinta segundos.
//
// La mutación del final reimplementa el reparto con el redondeo ingenuo y verifica que la suma deja
// de dar el total: sin ella, el test de arriba podría estar pasando por casualidad.

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import type { CascadaMotor, PartidaDelMotor } from './cotizadorPuente.ts'
import { ofertaDe, repartir } from './oferta.ts'

function partida(p: Partial<PartidaDelMotor> = {}): PartidaDelMotor {
  return {
    id: 'p1', codigo: null, descripcion: 'Mampostería de ladrillo hueco', rubro: 'Albañilería',
    unidad: 'm2', cantidad: 520, costoUnitario: 1000, subtotal: 520_000, hh: 300,
    subcontratada: false, precioSubcontrato: null, sinAnalisis: false, congelada: false,
    alcance: null,
    ...p,
  }
}

const cascada = (ventaSinIva: number | null, costoDirecto: number | null = 1_000_000): CascadaMotor => ({
  estado: 'ok', costoDirecto, ventaSinIva, ventaFinal: null, iva: null,
  coeficienteSinIva: ventaSinIva !== null && costoDirecto ? ventaSinIva / costoDirecto : null,
  porQue: null,
})

describe('la oferta no publica el costo como precio', () => {
  const partidas = [
    partida({ id: 'a', rubro: 'Albañilería', subtotal: 600_000 }),
    partida({ id: 'b', rubro: 'Pintura', subtotal: 400_000, descripcion: 'Pintura látex interior' }),
  ]

  test('el importe de cada línea es mayor que su costo: lleva la cascada encima', () => {
    const o = ofertaDe(partidas, cascada(1_682_000))
    assert.ok(o.lineas[0].importe! > 600_000, 'la línea salió al costo: la oferta no lleva margen')
    assert.ok(o.lineas[1].importe! > 400_000)
  })

  test('las líneas suman EXACTAMENTE el total de la cascada', () => {
    const o = ofertaDe(partidas, cascada(1_682_000))
    const suma = o.lineas.reduce((a, l) => a + (l.importe ?? 0), 0)
    assert.equal(suma, o.total)
    assert.equal(o.total, 1_682_000)
  })

  test('la línea no lleva cantidad, unidad, HH ni costo: el cliente no los ve', () => {
    const [l] = ofertaDe(partidas, cascada(1_682_000)).lineas
    assert.deepEqual(Object.keys(l).sort(), ['detalle', 'importe', 'rubro', 'sinPrecio'])
  })

  test('el coeficiente viaja para poder declararlo en el pie', () => {
    assert.equal(ofertaDe(partidas, cascada(1_682_000)).coeficiente, 1.682)
  })
})

describe('lo que no tiene precio no se dibuja en cero', () => {
  test('un rubro entero sin valorizar sale con importe null y su cuenta', () => {
    const o = ofertaDe([
      partida({ id: 'a', rubro: 'Albañilería', subtotal: 1_000_000 }),
      partida({ id: 'b', rubro: 'Sanitaria', subtotal: null, cantidad: null }),
    ], cascada(1_682_000))
    const sanitaria = o.lineas.find((l) => l.rubro === 'Sanitaria')!
    assert.equal(sanitaria.importe, null, 'un $0 diría que la sanitaria es gratis')
    assert.equal(sanitaria.sinPrecio, 1)
    assert.equal(o.sinPrecio, 1)
  })

  test('sin precio de cascada NINGUNA línea inventa un importe', () => {
    const o = ofertaDe([partida()], cascada(null))
    assert.equal(o.total, null)
    assert.deepEqual(o.lineas.map((l) => l.importe), [null])
  })

  test('el $0 del coalesce tampoco es un total', () => {
    assert.equal(ofertaDe([partida()], cascada(0)).total, null)
  })

  test('una partida excluida no aparece en el documento', () => {
    const o = ofertaDe([
      partida({ id: 'a', rubro: 'Albañilería' }),
      partida({ id: 'z', rubro: 'Pintura', alcance: 'EXCLUIDO' }),
    ], cascada(1_682_000))
    assert.deepEqual(o.lineas.map((l) => l.rubro), ['Albañilería'])
  })
})

describe('el reparto por resto mayor', () => {
  test('tres tercios de un total impar cierran exacto', () => {
    const r = repartir([1, 1, 1], 100)
    assert.equal(r.reduce((a: number, b) => a + (b ?? 0), 0), 100)
    assert.deepEqual(r, [34, 33, 33])
  })

  test('un costo null no participa y no se vuelve cero', () => {
    const r = repartir([100, null, 100], 1000)
    assert.deepEqual(r, [500, null, 500])
  })

  test('un costo de cero no participa: no tiene proporción que reclamar', () => {
    assert.deepEqual(repartir([0, 100], 500), [null, 500])
  })

  test('sin ningún costo conocido no hay reparto posible', () => {
    assert.deepEqual(repartir([null, null], 1000), [null, null])
  })

  test('el desempate es por el orden de la fila: el mismo presupuesto da el mismo documento', () => {
    assert.deepEqual(repartir([1, 1, 1], 100), repartir([1, 1, 1], 100))
  })
})

describe('MUTACIÓN — el control puede dar rojo', () => {
  test('con el redondeo ingenuo las líneas dejan de sumar el total', () => {
    const ingenuo = (costos: number[], total: number) => {
      const suma = costos.reduce((a, b) => a + b, 0)
      return costos.map((c) => Math.round((c / suma) * total))
    }
    const costos = [1, 1, 1]
    assert.notEqual(ingenuo(costos, 100).reduce((a, b) => a + b, 0), 100,
      'si el ingenuo cerrara, este caso no probaría nada')
    assert.equal(repartir(costos, 100).reduce((a: number, b) => a + (b ?? 0), 0), 100)
  })

  test('publicar el costo como importe se detecta: sería igual al subtotal', () => {
    const partidas = [partida({ id: 'a', subtotal: 1_000_000 })]
    const o = ofertaDe(partidas, cascada(1_682_000, 1_000_000))
    assert.notEqual(o.lineas[0].importe, 1_000_000, 'la oferta está publicando el costo')
  })
})
