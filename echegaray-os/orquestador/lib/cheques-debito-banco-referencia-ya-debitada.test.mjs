// UN DÉBITO QUE UN CHEQUE YA DEBITADO EXPLICA NO PUEDE EXPLICAR A OTRO (30/09/2026).
//
// El caso, con las filas reales del Sheet: FISICO 328 (Corralón, $1.000.000, DEBITADO = SI) salió el
// 09/09 como «Canje interno recibido 24 hs», ref 328. ECHEQ 390 (SURI, $1.000.000, emitido el 30/09,
// DEBITADO = No, sin fecha de pago) es un compromiso vivo. El libro le asignó el débito del 328 al
// 390 y lo pasó a REAL el 09/09: $1 M desaparecieron del COMPROMETIDO del Cash Flow.
import test from 'node:test'
import assert from 'node:assert/strict'
import { deChequesEmitidos } from './libro-extractores.mjs'
import { chequesYaDebitadosDelRegistro } from './libro-cheques-debitados.mjs'
import { chequesCubiertosPorBanco } from './libro-respaldo-banco.mjs'
import { consolidar } from '../scripts/libro-movimientos-pestana.mjs'

const S_22_08 = 46256
const S_09_09 = 46274
const S_30_09 = 46295

const ENC = ['Tipo', 'Nro', 'fecha de emisión', 'CUIT', 'Proveedor', 'Monto', 'Tipo comp', 'Nro comp',
  'fecha de pago', 'fecha pago', 'DEBITADO', 'Unidad de Negocio', 'Estado en el OS']
const F328 = ['FISICO', 328, 46230, '', 'Corralón Progreso', 1000000, 'FA', '0001-1', S_22_08, S_22_08, 'SI', 'Civil', '']
const F390 = ['ECHEQ', 390, S_30_09, '', 'SURI S.A.', 1000000, 'FA', '0001-2', '', '', 'No', 'Civil', '']
const registro = (...filas) => [[], ENC, ...filas]
const FILA0 = 3

// Lo que el extracto tiene del 09/09: concepto del banco, sin la referencia (la réplica no la trae).
const DEBITO_328 = { fecha: S_09_09, concepto: 'Canje interno recibido 24 hs', importe: 1000000, fila: 500 }

function libroDe(filas) {
  return {
    porFuente: { 'Cheques Emitidos': deChequesEmitidos(filas, { fila0: FILA0, corte: S_30_09 }) },
    yaDebitados: chequesYaDebitadosDelRegistro(filas, { fila0: FILA0 }),
  }
}

test('328 ya DEBITADO + 390 vivo: el débito del 09/09 es del 328 y el 390 sigue COMPROMETIDO', () => {
  const { porFuente, yaDebitados } = libroDe(registro(F328, F390))
  assert.equal(yaDebitados.length, 1, 'el registro publica el 328 como testigo del débito')
  const { consolidado } = consolidar(porFuente, { debitosBanco: [DEBITO_328], corteBanco: S_30_09, usadosBanco: new Set(), chequesYaDebitados: yaDebitados })
  const c390 = consolidado.find((m) => m.origen.fila === 4)
  assert.equal(c390.estado, 'COMPROMETIDO', 'el 390 sigue vivo')
  assert.equal(c390.fecha, 0, 'sin fecha de pago cae al corte: por diseño, no se toca')
  assert.equal(c390.importe, 1000000)
})

test('REGLA 2: un débito anterior a la emisión nunca es candidato, aunque el registro no sepa del 328', () => {
  // Sin yaDebitados (registro sin marcar): sólo la fecha de emisión (30/09) descarta el débito del 09/09.
  const { porFuente } = libroDe(registro(F390))
  const { consolidado } = consolidar(porFuente, { debitosBanco: [DEBITO_328], corteBanco: S_30_09, usadosBanco: new Set() })
  assert.equal(consolidado.find((m) => m.origen.fila === 3).estado, 'COMPROMETIDO')
})

test('REGLA 3: dos vivos del mismo importe y un solo débito posible = ambiguo, ninguno se cubre y se avisa', () => {
  const otro = ['ECHEQ', 391, 46230, '', 'Otro S.A.', 1000000, 'FA', '0001-3', S_30_09, S_30_09, 'No', 'Civil', '']
  const { porFuente } = libroDe(registro(otro, F390))
  const movs = porFuente['Cheques Emitidos']
  const r = chequesCubiertosPorBanco(movs, [DEBITO_328])
  // El 390 no puede (emitido después): el único candidato plausible para el débito es el 391.
  assert.equal(r.cubiertos.size, 1)
  assert.ok(r.cubiertos.has(movs.findIndex((m) => m.contraparte === 'Otro S.A.')))
  // Si ambos pudieran reclamar el mismo débito único, no se elige al primero que coincide.
  const ambos = movs.map((m) => ({ ...m, fechaEmision: 46230 }))
  const r2 = chequesCubiertosPorBanco(ambos, [DEBITO_328])
  assert.equal(r2.cubiertos.size, 0)
  assert.match(r2.avisos[0], /ambiguo/)
})

test('un cheque sin DEBITADO ni fecha de emisión conocida conserva el comportamiento de siempre', () => {
  const movs = [{ signo: -1, instrumento: 'echeq', estado: 'COMPROMETIDO', importe: 1000000, fecha: S_30_09, concepto: 'x' }]
  assert.equal(chequesCubiertosPorBanco(movs, [DEBITO_328]).cubiertos.size, 1)
})
