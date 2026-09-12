// LO QUE ESTAS PRUEBAS IMPIDEN: ofrecerle a un jefe de obra la cara que decide qué ve el CLIENTE
// desde afuera, y romper en silencio los enlaces que ya se compartieron.

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  A_SANGRE, CARAS_RETIRADAS, destinoDe, esCaraRetirada, solapaDe, solapasDeCliente,
} from './solapasCliente.ts'

const CUENTAS = { obras: 3, presupuestos: 2, documentos: 18 }

// ═══ NUEVE CARAS ERAN DEMASIADAS (dueño, 12/09/2026 13:10) ═══
//
// «El CRM admin en cada cliente tiene secciones inútiles y repetitivas con datos que pueden
// unificarse en menos secciones.» Cuatro se fueron y NINGUNA capacidad se perdió: cuenta corriente y
// esquema de pago son bloques de Cobranzas, la actividad vive en el costado y el portal se abre desde
// el costado con `?portal=1`.

test('las cinco caras, con los rótulos del mockup y las órdenes al lado de «Trabajos»', () => {
  const s = solapasDeCliente({ veEconomia: true, ...CUENTAS })
  assert.deepEqual(s.map((x) => x.label), [
    'Trabajos', 'Órdenes de compra y de pago', 'Cobranzas', 'Presupuestos', 'Documentos',
  ])
  // Sólo cuentan las que el canónico 26 numera. Un «0» al lado de una cara económica se leería como
  // una afirmación de plata.
  assert.deepEqual(s.map((x) => x.cuenta), [3, null, null, 2, 18])
})

test('sin permiso económico quedan las dos que no hablan de plata', () => {
  const s = solapasDeCliente({ veEconomia: false, ...CUENTAS })
  assert.deepEqual(s.map((x) => x.clave), ['obras', 'documentos'])
})

test('un enlace viejo con ?solapa= sigue abriendo su cara', () => {
  assert.equal(solapaDe('cobranzas', undefined), 'cobranzas')
  assert.equal(solapaDe(undefined, 'documentos'), 'documentos')
  // El nombre nuevo gana cuando llegan los dos.
  assert.equal(solapaDe('ordenes', 'documentos'), 'ordenes')
  // Lo que no existe abre Trabajos en vez de dejar la ficha en blanco. Incluye `?vista=resumen`, que
  // fue una cara real hasta el v2 y sigue circulando en enlaces compartidos.
  assert.equal(solapaDe('inventada', undefined), 'obras')
  assert.equal(solapaDe('resumen', undefined), 'obras')
  assert.equal(solapaDe(undefined, undefined), 'obras')
})

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// LOS ENLACES DE LAS CARAS RETIRADAS
//
// QUÉ DEFECTO ATRAPA: que `?vista=esquema` —compartido por mail y en favoritos— caiga en la ficha
// genérica. No rompe la pantalla: abre Trabajos, que se parece bastante a «algo», y por eso nadie
// reporta nada mientras el enlace deja de llevar a donde decía.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

test('cada cara retirada tiene un destino EXACTO, no la ficha genérica', () => {
  assert.deepEqual(destinoDe('cuenta'), { solapa: 'cobranzas', ancla: 'cuenta-corriente', parametro: null })
  assert.deepEqual(destinoDe('esquema'), { solapa: 'cobranzas', ancla: 'esquema-de-pago', parametro: null })
  assert.deepEqual(destinoDe('actividad'),
    { solapa: 'obras', ancla: null, parametro: { clave: 'actividad', valor: 'todo' } })
  assert.deepEqual(destinoDe('accesos'),
    { solapa: 'obras', ancla: null, parametro: { clave: 'portal', valor: '1' } })
  // Y por el nombre viejo del parámetro, que es como están escritos los enlaces más viejos.
  assert.equal(destinoDe(undefined, 'cuenta').ancla, 'cuenta-corriente')
})

test('las cuatro retiradas se redirigen, y una cara viva NO', () => {
  // Redirigir de verdad es lo que saca la dirección vieja de la barra. Sin eso el enlace sigue
  // circulando y volviendo a caer.
  for (const vieja of CARAS_RETIRADAS) assert.equal(esCaraRetirada(vieja), true, vieja)
  for (const viva of ['obras', 'ordenes', 'cobranzas', 'presupuestos', 'documentos', 'inventada']) {
    assert.equal(esCaraRetirada(viva), false, viva)
  }
  assert.equal(esCaraRetirada(undefined), false)
})

test('ninguna cara retirada quedó también como solapa', () => {
  // El defecto opuesto: dejar `cuenta` en la barra Y en el mapa de retiradas, con lo que la solapa
  // se dibujaría y al tocarla redirigiría a otro lado.
  const s = solapasDeCliente({ veEconomia: true, ...CUENTAS }).map((x) => x.clave as string)
  for (const vieja of CARAS_RETIRADAS) assert.equal(s.includes(vieja), false, vieja)
})

test('sólo Cobranzas va a sangre: es la única cara que usa el ancho entero', () => {
  // Si alguien suma una cara a `A_SANGRE` sin darle su propio panel, la ficha pierde el aside de
  // identidad —y con él la actividad y el portal— y no se entera nadie hasta abrirla.
  assert.deepEqual([...A_SANGRE], ['cobranzas'])
  for (const conCostado of ['obras', 'ordenes', 'presupuestos', 'documentos'] as const) {
    assert.equal(A_SANGRE.includes(conCostado), false, `${conCostado} no puede ir a sangre`)
  }
})
