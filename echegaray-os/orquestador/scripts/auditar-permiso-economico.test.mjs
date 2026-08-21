import test from 'node:test'
import assert from 'node:assert/strict'
import { veredicto, LO_ECONOMICO, LO_OPERATIVO } from './auditar-permiso-economico.mjs'

test('plata que llega a quien no le corresponde es una FUGA', () => {
  const v = veredicto({ que: 'recurso_precio', esperado: 'cero', visto: 389, hay: 389 })
  assert.equal(v.estado, 'fuga')
  assert.match(v.texto, /389/)
})

test('cero para quien no debe verlo está bien, y se dice si además la tabla estaba vacía', () => {
  assert.equal(veredicto({ que: 'cotizaciones', esperado: 'cero', visto: 0, hay: 12 }).estado, 'ok')
  assert.match(veredicto({ que: 'cotizaciones', esperado: 'cero', visto: 0, hay: 0 }).texto, /vacía/)
})

test('UNA TABLA VACÍA NO ES UNA CEGUERA — es el defecto que hace que un auditor se ignore', () => {
  // Sin `hay`, un cero legítimo y un bloqueo se ven igual, y el informe grita en falso.
  const vacia = veredicto({ que: 'cotizaciones', esperado: 'algo', visto: 0, hay: 0 })
  assert.equal(vacia.estado, 'ok')
  const bloqueada = veredicto({ que: 'cotizaciones', esperado: 'algo', visto: 0, hay: 12 })
  assert.equal(bloqueada.estado, 'ciego')
  assert.match(bloqueada.texto, /CERO de 12/)
})

test('las columnas que van por función SECDEF DEBEN fallar en la consulta directa', () => {
  const bien = veredicto({ que: 'obra_canonica.monto_contratado', esperado: 'algo', visto: 'ERROR', hay: null })
  assert.equal(bien.estado, 'ok')
  // Si un día se concede la columna, la función con portero deja de ser el único camino.
  const mal = veredicto({ que: 'obra_canonica.monto_contratado', esperado: 'algo', visto: 4, hay: 4 })
  assert.equal(mal.estado, 'fuga')
})

test('una consulta que falla donde NO debería es una fuga, no un «ok» silencioso', () => {
  // Un `permission denied` inesperado deja a alguien sin poder trabajar y no puede pasar por ok.
  assert.equal(veredicto({ que: 'tarea_tipo', esperado: 'algo', visto: 'ERROR', hay: 199 }).estado, 'fuga')
})

test('lo económico y lo operativo no se pisan: ninguna entrada está en las dos listas', () => {
  const eco = new Set(LO_ECONOMICO.map((x) => x.que))
  for (const o of LO_OPERATIVO) {
    assert.ok(!eco.has(o.que), `${o.que} está declarada como económica y como operativa a la vez`)
  }
})
