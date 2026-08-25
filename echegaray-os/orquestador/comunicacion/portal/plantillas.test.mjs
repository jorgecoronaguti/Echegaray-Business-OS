// Un mail a un cliente es lo único de este trabajo que sale de la empresa y no se puede deshacer.
// Estos tests cubren lo que haría daño: filtrar la cuenta corriente, romper el HTML con un nombre
// raro, mandar una fecha ambigua, o mandar dos veces lo mismo.
import test from 'node:test'
import assert from 'node:assert/strict'
import { esc, pesos, fechaAR, habilitacionPortal, esquemaPublicado, avisoVencimiento } from './plantillas.mjs'

test('el nombre del cliente se escapa: un « < » suelto rompería el HTML del mail', () => {
  assert.equal(esc('<script>alert(1)</script>'), '&lt;script&gt;alert(1)&lt;/script&gt;')
  assert.equal(esc('Pérez & Cía "SA"'), 'Pérez &amp; Cía &quot;SA&quot;')
})

test('los montos van en es-AR y sin centavos', () => {
  assert.equal(pesos(1234567.89), '$ 1.234.568')
  assert.equal(pesos(0), '$ 0')
  assert.equal(pesos('x'), null)
})

test('la fecha va DD/MM/AAAA, nunca el ISO', () => {
  assert.equal(fechaAR('2026-08-25'), '25/08/2026')
  assert.equal(fechaAR('2026-01-06'), '06/01/2026')
  assert.equal(fechaAR(null), null)
})

test('la habilitación NO lleva el link de acceso adentro: un reenvío daría entrada a cualquiera', () => {
  const m = habilitacionPortal({ para: 'maria@arcor.com', persona_contacto: 'María', cliente_nombre: 'ARCOR', acceso_id: 'a-1' })
  assert.match(m.html, /ingresar/)
  assert.ok(!/token|otp|magic|access_token/i.test(m.html), 'ningún credencial viaja en el mail')
  assert.match(m.html, /Hola María:/)
  assert.match(m.html, /ARCOR/)
  assert.equal(m.clave_unica, 'habilitacion:a-1')
  assert.equal(m.plantilla, 'habilitacion_portal')
})

test('sin nombre de persona el saludo sigue siendo correcto, no «Hola undefined»', () => {
  const m = habilitacionPortal({ para: 'x@y.com', cliente_nombre: 'ARCOR', acceso_id: 'a-1' })
  assert.match(m.html, /<p>Hola:<\/p>/)
  assert.ok(!/undefined|null/.test(m.html))
})

test('todas las plantillas llevan el logo y los colores de la marca', () => {
  const ms = [
    habilitacionPortal({ para: 'x@y.com', cliente_nombre: 'ARCOR', acceso_id: '1' }),
    esquemaPublicado({ cliente_nombre: 'ARCOR', cliente_id: 'c1', publicado_at: '2026-08-25T10:00:00Z' }),
    avisoVencimiento({ cliente_nombre: 'ARCOR', concepto: 'Certificación 1/9', fecha: '2026-09-01', monto: 100, dias: 3, esquema_pago_id: 'e1' }),
  ]
  for (const m of ms) {
    assert.match(m.html, /<img [^>]*alt="Echegaray Construcciones"/)
    assert.match(m.html, /#FDC900/, 'el amarillo de la marca')
    assert.match(m.html, /#30302F/, 'el grafito de la marca')
    assert.match(m.html, /lang="es"/)
    assert.ok(m.asunto && m.asunto.length < 80, 'el asunto entra en una bandeja')
  }
})

test('el esquema publicado NO mete el saldo ni el detalle en el mail: eso vive detrás del login', () => {
  const m = esquemaPublicado({
    persona_contacto: 'Juan', cliente_nombre: 'Messina', cantidad_pagos: 9,
    proximo: { fecha: '2026-09-01', monto: 6564250 }, cliente_id: 'c1', publicado_at: '2026-08-25T10:00:00Z',
  })
  assert.match(m.html, /9 pagos previstos/)
  assert.match(m.html, /01\/09\/2026/)
  assert.match(m.html, /\$ 6\.564\.250/, 'sólo el próximo vencimiento, no la cartera entera')
  assert.equal(m.clave_unica, 'esquema:c1:2026-08-25T10:00:00Z')
})

test('republicar tras cambiar fechas manda un mail nuevo; dos clicks sobre lo mismo, uno solo', () => {
  const a = esquemaPublicado({ cliente_id: 'c1', publicado_at: '2026-08-25T10:00:00Z', cliente_nombre: 'X' })
  const b = esquemaPublicado({ cliente_id: 'c1', publicado_at: '2026-08-25T10:00:00Z', cliente_nombre: 'X' })
  const c = esquemaPublicado({ cliente_id: 'c1', publicado_at: '2026-08-26T09:00:00Z', cliente_nombre: 'X' })
  assert.equal(a.clave_unica, b.clave_unica, 'mismo publicado_at = un solo mail')
  assert.notEqual(a.clave_unica, c.clave_unica, 'republicar sí avisa de nuevo')
})

test('el aviso recuerda, no intima: nada de mora, intereses ni suspensión', () => {
  const m = avisoVencimiento({
    persona_contacto: 'Ana', cliente_nombre: 'Quattropani', concepto: 'Certificación 2/9',
    fecha: '2026-09-01', monto: 6564250, dias: 3, esquema_pago_id: 'e1',
  })
  assert.match(m.html, /vence en 3 días/)
  assert.ok(!/mora|intimad|interes|suspend|legal|incumpl/i.test(m.html),
    'la consecuencia contractual la escribe una persona, no una plantilla')
  assert.match(m.html, /informarnos la transferencia/)
  assert.equal(m.clave_unica, 'aviso:e1:2026-09-01')
})

test('el aviso de HOY dice «hoy», no «en 0 días»', () => {
  const m = avisoVencimiento({ cliente_nombre: 'X', concepto: 'c', fecha: '2026-08-25', monto: 1, dias: 0, esquema_pago_id: 'e' })
  assert.match(m.html, /vence hoy/)
  assert.ok(!/en 0 días/.test(m.html))
})

test('«en 1 día», no «en 1 días»', () => {
  const m = avisoVencimiento({ cliente_nombre: 'X', concepto: 'c', fecha: '2026-08-26', monto: 1, dias: 1, esquema_pago_id: 'e' })
  assert.match(m.html, /vence en 1 día,/)
})

test('sin identificador no hay clave de idempotencia — mejor null que una clave que colisione', () => {
  assert.equal(habilitacionPortal({ para: 'x@y.com', cliente_nombre: 'X' }).clave_unica, null)
  assert.equal(esquemaPublicado({ cliente_nombre: 'X' }).clave_unica, null)
})
