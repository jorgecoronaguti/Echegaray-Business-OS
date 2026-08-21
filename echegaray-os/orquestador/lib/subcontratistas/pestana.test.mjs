// LO QUE ESTA PESTAÑA NO PUEDE HACER NUNCA: guardar un monto.
//
// La regla de oro 5 del dueño —«nunca un número pegado»— es fácil de cumplir el primer día y
// fácil de romper el segundo, cuando alguien "arregla" una celda escribiendo el resultado. Esto
// lo pone rojo.
import test from 'node:test'
import assert from 'node:assert/strict'
import { construir } from './pestana.mjs'
import { SUBCONTRATISTAS, PROFESIONALES, COMERCIOS } from './padron.mjs'

const { filas, bloques } = construir()

test('ningún monto está pegado: las columnas de plata son todas fórmula', () => {
  for (const b of bloques) {
    for (let f = b.f0; f <= b.total; f++) {
      for (const col of [2, 3, 4, 5, 6, 7]) { // C..H
        const v = filas[f - 1]?.[col]
        if (v === undefined || v === '' || v === null) continue
        assert.ok(String(v).startsWith('='), `fila ${f} col ${col} tiene un valor pegado: ${v}`)
      }
    }
  }
})

test('las fórmulas hablan es-AR: separador «;» y ningún rango abierto', () => {
  for (const fila of filas) {
    for (const c of fila) {
      const s = String(c ?? '')
      if (!s.startsWith('=')) continue
      assert.ok(!/,/.test(s.replace(/"[^"]*"/g, '')), `usa coma como separador: ${s}`)
      assert.ok(!/Compras!\$?[A-Z]+:\$?[A-Z]+/.test(s), `rango abierto (se come toda la columna): ${s}`)
    }
  }
})

test('cada persona aparece UNA sola vez en todo el padrón', () => {
  const todos = [...SUBCONTRATISTAS, ...PROFESIONALES, ...COMERCIOS].map(([n]) => n)
  assert.equal(new Set(todos).size, todos.length, 'hay un nombre repetido entre los tres grupos')
})

test('nadie entra al padrón sin rubro: un renglón sin rubro no explica nada', () => {
  for (const [n, r] of [...SUBCONTRATISTAS, ...PROFESIONALES, ...COMERCIOS]) {
    assert.ok(String(r || '').trim().length > 3, `«${n}» no tiene rubro`)
  }
})

test('los tres bloques suman por separado — el total de subcontratistas no se infla', () => {
  const sub = bloques.find((b) => b.clave === 'sub')
  assert.equal(sub.f1 - sub.f0 + 1, SUBCONTRATISTAS.length)
  assert.equal(bloques.length, 3, 'se perdió un bloque: profesionales y comercios volverían al total')
})
