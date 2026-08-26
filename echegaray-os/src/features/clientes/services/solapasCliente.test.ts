// LO QUE ESTAS PRUEBAS IMPIDEN: ofrecerle a un jefe de obra la cara que decide qué ve el CLIENTE
// desde afuera, y romper en silencio los enlaces que ya se compartieron.

import test from 'node:test'
import assert from 'node:assert/strict'
import { A_SANGRE, solapaDe, solapasDeCliente } from './solapasCliente.ts'

const CUENTAS = { obras: 3, presupuestos: 2, documentos: 18 }

test('las siete caras del mockup, con los rótulos del mockup', () => {
  const s = solapasDeCliente({ veEconomia: true, ...CUENTAS })
  assert.deepEqual(s.map((x) => x.label), [
    'Obras', 'Presupuestos', 'Documentos', 'Actividad',
    'Cuenta corriente', 'Esquema de pago', 'Acceso al portal',
  ])
  // Sólo cuentan las tres que el canónico 26 numera. Un «0» al lado de «Cuenta corriente» se
  // leería como saldo cero, que es una afirmación económica; y la actividad se recorta, así que
  // contarla diría que el cliente tuvo tres movimientos cuando tuvo cuarenta.
  assert.deepEqual(s.map((x) => x.cuenta), [3, 2, 18, null, null, null, null])
})

test('sin permiso económico no se ofrecen las cuatro caras económicas', () => {
  // «Acceso al portal» es la más grave de las cuatro: desde ahí se habilita a alguien de AFUERA a
  // ver montos y a aprobar certificados.
  const s = solapasDeCliente({ veEconomia: false, ...CUENTAS })
  assert.deepEqual(s.map((x) => x.clave), ['obras', 'documentos', 'actividad'])
})

test('un enlace viejo con ?solapa= sigue abriendo su cara', () => {
  assert.equal(solapaDe('esquema', undefined), 'esquema')
  assert.equal(solapaDe(undefined, 'cuenta'), 'cuenta')
  // El nombre nuevo gana cuando llegan los dos.
  assert.equal(solapaDe('accesos', 'cuenta'), 'accesos')
  // Lo que no existe abre Obras en vez de dejar la ficha en blanco. Incluye `?vista=resumen`, que
  // fue una cara real hasta el v2 y sigue circulando en enlaces compartidos.
  assert.equal(solapaDe('inventada', undefined), 'obras')
  assert.equal(solapaDe('resumen', undefined), 'obras')
  assert.equal(solapaDe(undefined, undefined), 'obras')
})

test('las tres caras nuevas van a sangre y las viejas no', () => {
  // Si alguien suma una cara a `A_SANGRE` sin darle su propio panel, la ficha pierde el aside de
  // identidad y no se entera nadie hasta abrirla.
  assert.deepEqual([...A_SANGRE], ['cuenta', 'esquema', 'accesos'])
  for (const vieja of ['obras', 'presupuestos', 'documentos', 'actividad'] as const) {
    assert.equal(A_SANGRE.includes(vieja), false, `${vieja} no puede ir a sangre`)
  }
})
