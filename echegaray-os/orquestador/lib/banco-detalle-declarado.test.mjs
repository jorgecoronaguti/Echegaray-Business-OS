// EL HUECO DE $45.080 TIENE QUE VERSE EN LA PESTAÑA, NO SÓLO EN UN LOG.
//
// El saldo declarado por el banco al 13/08/2026 es $15.982.032,70 y los 386 movimientos cargados de
// `_BANCO_RAW` suman $15.936.952,70. La diferencia existe desde antes del primer movimiento cargado y
// no hay extracto para cerrarla. `auditar-saldo-banco.mjs` la mide en cada corrida del pipeline —en
// el log, que nadie abre—. Estos tests son los del RÓTULO: que la pestaña lo diga, que lo diga con la
// misma identidad que el auditor, y que se apague solo el día que el hueco se cierre.
import test from 'node:test'
import assert from 'node:assert/strict'
import { expresionDetalle, expresionDiferencia, filaHuecoDelExtracto, COL_SALDO } from './banco-detalle-declarado.mjs'
import { DEP } from './caja-posterior-al-corte.mjs'
import { auditarCuenta } from './banco-cadena-saldos.mjs'
import { grillaAnexo, ANCHO_ANEXO } from './caja-anexo.mjs'
import { VACIO } from './preservar-anotaciones.mjs'

const REFS = { bancoRaw: '_BANCO_RAW', cheques: 'Cheques Emitidos', tarjeta: 'Tarjeta de Credito', cierre: 60, inicio: 50, cab: 5 }
const CARTERA = { origen: 'test', enCartera: [], endosados: [] }

test('el detalle se reconstruye como lo hace el auditor: inicial + Σ importes', () => {
  // La identidad tiene que ser LA MISMA que `auditarCuenta` — si el rótulo midiera otra cosa, la
  // pestaña y el auditor dirían dos números distintos del mismo hueco, que es peor que no decir nada.
  const mov = [
    { fecha: '2026-05-28', concepto: 'comisión', importe: -69000, saldo_despues: 130408.47 },
    { fecha: '2026-05-29', concepto: 'cobro', importe: 1000000, saldo_despues: 1130408.47 },
    { fecha: '2026-05-30', concepto: 'pago', importe: -130408.47, saldo_despues: 1045080 },
  ]
  const { identidad } = auditarCuenta(mov)
  // inicial = primer saldo − primer importe = 199.408,47 · suma = 800.591,53 · esperado = 1.000.000
  assert.equal(identidad.inicial, 199408.47)
  assert.equal(Math.round(identidad.esperado), 1000000)
  // y el declarado (último saldo) es 1.045.080: faltan 45.080, el mismo orden del caso real.
  assert.equal(Math.round(identidad.declarado - identidad.esperado), 45080)

  // La fórmula dice literalmente eso: (primer saldo − primer importe) + suma de importes.
  const e = expresionDetalle()
  assert.equal(e, `(INDEX(${DEP.hoja}!$${COL_SALDO}$4:$${COL_SALDO};1)-INDEX(${DEP.hoja}!$${DEP.importe}$4:$${DEP.importe};1))`
    + `+SUM(${DEP.hoja}!$${DEP.importe}$4:$${DEP.importe})`)
})

test('la diferencia se mide contra el ÚLTIMO saldo del extracto, que es el que muestra CAJA', () => {
  const d = expresionDiferencia()
  assert.ok(d.startsWith('INDEX('), 'el declarado sale del último saldo de la réplica')
  assert.ok(d.includes(`${DEP.hoja}!$${COL_SALDO}$4:$${COL_SALDO}`))
  assert.ok(d.includes(`-(${expresionDetalle()})`), 'declarado − detalle, en ese orden: positivo = falta cargar')
})

test('el rótulo NO es un texto fijo: dice que cerró el día que cierre', () => {
  const [rotulo] = filaHuecoDelExtracto()
  assert.match(rotulo, /^=IF\(/)
  assert.match(rotulo, /✓ El detalle del extracto cierra/)
  assert.match(rotulo, /⚠ El detalle del extracto NO cierra/)
  // Y con la réplica vacía no afirma que cierra: no poder verificar no es una buena noticia.
  assert.match(rotulo, /Sin extracto cargado/)
})

test('ni un número pegado: el monto y la fecha del hueco son fórmulas sobre _BANCO_RAW', () => {
  const fila = filaHuecoDelExtracto()
  for (const i of [0, 2, 5]) assert.match(String(fila[i]), /^=/, `la celda ${i} tiene que ser fórmula`)
  // El $45.080 y el 28/05 son el estado de HOY: escritos, quedarían congelados cuando se cargue el
  // movimiento que falta — es exactamente el defecto de "número calculado afuera y pegado".
  assert.doesNotMatch(fila.join(' '), /45\.?080/)
  assert.doesNotMatch(fila.join(' '), /28\/0?5/)
  assert.equal(fila[1], 'ARS')
})

test('la línea entra al anexo, arriba de todo lo que se apoya en ese saldo', () => {
  const g = grillaAnexo({ refs: REFS, cartera: CARTERA, conceptosCiegos: [] })
  const i = g.filas.findIndex((f) => /El detalle del extracto/.test(String(f?.[0] ?? '')))
  assert.ok(i > 0, 'el anexo tiene que declarar el hueco del extracto')
  const iCorte = g.filas.findIndex((f) => /Posteriores al CORTE DEL EXTRACTO/.test(String(f?.[0] ?? '')))
  assert.ok(i < iCorte, 'el hueco va ANTES de los movimientos que se le suman al saldo, no al final')
  assert.equal(g.filas[i].length, ANCHO_ANEXO, 'una fila más ancha que la tabla hace fallar el batch entero')
  assert.notEqual(g.filas[i][2], VACIO)
})
