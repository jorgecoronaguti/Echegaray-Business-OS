// LA REGLA QUE DECIDE SI EL CHECKOUT QUE ESCRIBE EL SHEET SE ACTUALIZA SOLO.
//
// El defecto que este script existe para que no vuelva: el timer del Flujo de Caja corre desde un
// checkout aparte, ese checkout quedó días atrás, y una corrida con el generador viejo PISÓ 115
// fórmulas ya aplicadas a «Plantel». Silencioso: sin error, sin log rojo, y el dueño abrió el Sheet
// y no había cambiado nada.

import test from 'node:test'
import assert from 'node:assert/strict'
import { decidir } from './produccion-al-dia.mjs'

test('al día no hace nada: no se toca un checkout que ya está donde tiene que estar', () => {
  assert.equal(decidir({ sucio: false, alDia: true, puedeAvanzar: true }).accion, 'nada')
})

test('atrasado y sin divergir: avanza, que es todo el punto del script', () => {
  const d = decidir({ sucio: false, alDia: false, puedeAvanzar: true })
  assert.equal(d.accion, 'avanzar')
  assert.match(d.porQue, /sin merge/)
})

test('con el árbol SUCIO no se toca, aunque esté atrasado', () => {
  // ═══ EL DEFECTO QUE ATRAPA ═══
  //
  // Que el script pise el trabajo sin commitear de quien esté depurando en ese checkout. Sería
  // reemplazar una forma de perder trabajo por otra — y encima automática.
  assert.equal(decidir({ sucio: true, alDia: false, puedeAvanzar: true }).accion, 'no-tocar')
  assert.equal(decidir({ sucio: true, alDia: false, puedeAvanzar: false }).accion, 'no-tocar')
  // El árbol sucio gana incluso sobre «al día»: no hay ninguna razón para tocarlo.
  assert.equal(decidir({ sucio: true, alDia: true, puedeAvanzar: true }).accion, 'no-tocar')
})

test('si producción DIVERGIÓ, avisa y NO mergea', () => {
  // ═══ POR QUÉ ESTO NO PUEDE SER UN `git pull` A SECAS ═══
  //
  // Un merge automático en el checkout que escribe el Sheet real es exactamente cómo se pierde una
  // pestaña: resuelve un conflicto solo, publica el resultado, y nadie lo miró. Si divergió, hace
  // falta una persona.
  const d = decidir({ sucio: false, alDia: false, puedeAvanzar: false })
  assert.equal(d.accion, 'avisar')
  assert.match(d.porQue, /una persona/)
  assert.notEqual(d.accion, 'avanzar')
})

test('la decisión es PURA: los mismos insumos dan lo mismo, y no hay más acciones que estas cuatro', () => {
  // Un quinto estado que caiga en un `undefined` haría que el llamador no haga nada sin decirlo.
  const acciones = new Set()
  for (const sucio of [true, false]) {
    for (const alDia of [true, false]) {
      for (const puedeAvanzar of [true, false]) {
        const d = decidir({ sucio, alDia, puedeAvanzar })
        assert.ok(d && typeof d.accion === 'string' && d.porQue, `sin decisión para ${JSON.stringify({ sucio, alDia, puedeAvanzar })}`)
        acciones.add(d.accion)
      }
    }
  }
  assert.deepEqual([...acciones].sort(), ['avanzar', 'avisar', 'nada', 'no-tocar'])
})
