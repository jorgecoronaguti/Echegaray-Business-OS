import test from 'node:test'
import assert from 'node:assert/strict'
import { cuentaDeTrabajos } from './cuentaDeTrabajos.ts'
import type { CobroDeObra } from '../../administracion/services/homeCartera.ts'

const cobro = (p: Partial<CobroDeObra>): CobroDeObra => ({
  total: null, neto: null, porCobrar: null, vencido: null, proximo: null, imputacion: null, ...p,
})

test('los cuatro números salen de los trabajos, con la misma cuenta que el pie de OBRAS', () => {
  const c = cuentaDeTrabajos(
    [{ obra_id: 'a', contratado: 9_463_142 }, { obra_id: 'b', contratado: 17_704_199 }],
    {
      disponible: true,
      por: new Map([
        ['a', cobro({ total: 8_465_136, porCobrar: 2_848_649, vencido: null })],
        ['b', cobro({ total: 4_848_135, porCobrar: 16_493_725, vencido: 16_493_725 })],
      ]),
    },
  )
  assert.deepEqual(c, {
    contratado: 27_167_341, cobrado: 13_313_271, porCobrar: 19_342_374, vencido: 16_493_725,
    trabajos: 2,
  })
})

test('ninguno con dato NO es cero: es `null`, y la pantalla lo dice con palabras', () => {
  // Un «$ 0 vencido» afirmaría que este cliente no debe nada atrasado. Es la conclusión que hace
  // que nadie revise, y es la que este caso impide.
  const c = cuentaDeTrabajos([{ obra_id: 'a', contratado: null }], { disponible: true, por: new Map() })
  assert.equal(c.cobrado, null)
  assert.equal(c.vencido, null)
  assert.equal(c.contratado, null)
  assert.equal(c.trabajos, 1)
})

test('sin lectura del cobro, lo contratado se sigue sumando y el resto calla', () => {
  const c = cuentaDeTrabajos([{ obra_id: 'a', contratado: 100 }], null)
  assert.equal(c.contratado, 100)
  assert.equal(c.cobrado, null)
})

test('un trabajo con vencido en cero de verdad se suma como cero, no como hueco', () => {
  // La vista puede publicar 0 cuando midió y no hay mora. Eso es un HECHO y tiene que sumar 0, no
  // desaparecer: si desapareciera, un cliente con todo al día se leería igual que uno sin datos.
  const c = cuentaDeTrabajos(
    [{ obra_id: 'a', contratado: 10 }],
    { disponible: true, por: new Map([['a', cobro({ total: 5, vencido: 0 })]]) },
  )
  assert.equal(c.vencido, 0)
})
