import test from 'node:test'
import assert from 'node:assert/strict'

import {
  PESTANA_REPLICA, REPLICA_COL, REPLICA_COLUMNAS, REPLICA_DESDE, REPLICA_HASTA, formulaCostoProyectado,
} from './obras-replica.mjs'
import { problemaDeSintaxis } from './obras-grilla.mjs'

test('la fórmula PARSEA y no interpola nada roto', () => {
  for (const obra of ['PISOS INDUSTRIALES', 'PLAYÓN DE AZUFRE', 'BSA']) {
    assert.equal(problemaDeSintaxis(formulaCostoProyectado(obra)), null, obra)
  }
  // Una obra sin nombre deja `""` como criterio, no `undefined` — el defecto que ya publicó
  // `$undefined$5:$undefined` en 40 celdas.
  assert.equal(problemaDeSintaxis(formulaCostoProyectado(undefined)), null)
})

test('es-AR: separa argumentos con «;» y nunca con «,»', () => {
  const f = formulaCostoProyectado('BSA')
  assert.ok(f.includes(';'))
  assert.ok(!f.includes(','), 'una coma la interpreta como decimal y rompe la fórmula entera')
})

test('el rango es CERRADO y sale del contrato, no de un literal', () => {
  const f = formulaCostoProyectado('BSA')
  assert.ok(f.includes(`$${REPLICA_COL.obra}$${REPLICA_DESDE}:$${REPLICA_COL.obra}$${REPLICA_HASTA}`))
  assert.ok(f.includes(`$${REPLICA_COL.monto}$${REPLICA_DESDE}:$${REPLICA_COL.monto}$${REPLICA_HASTA}`))
  assert.ok(!/\$[A-Z]\$\d+:\$[A-Z]\b(?!\$)/.test(f), 'ningún rango abierto')
  // Si mañana la réplica crece, la fórmula tiene que crecer con ella y no quedarse en la 200.
  assert.ok(formulaCostoProyectado('BSA', { hasta: 400 }).includes('$400'))
})

test('la ausencia de plan sale como #N/A y NO como cero', () => {
  const f = formulaCostoProyectado('OBRA QUE NO ESTÁ')
  assert.ok(f.startsWith('=IF(COUNTIFS('), 'primero pregunta si hay filas')
  assert.ok(f.includes('=0;NA();'), 'sin filas grita; el formato de moneda dibujaría un cero como «—»')
  // El criterio de la obra aparece DOS veces: en el COUNTIFS y en el SUMIFS. Si aparece una sola,
  // uno de los dos está mirando otra cosa.
  assert.equal(f.split('"OBRA QUE NO ESTÁ"').length - 1, 2)
})

test('la pestaña citada es un INSUMO: guion bajo adelante', () => {
  assert.ok(PESTANA_REPLICA.startsWith('_'), 'así los auditores de pantalla no la miran')
  assert.ok(formulaCostoProyectado('X').includes(`${PESTANA_REPLICA}!`))
})

test('las letras del contrato apuntan a las columnas que la réplica escribe', () => {
  const nombres = REPLICA_COLUMNAS.map(([n]) => n)
  const letra = (i) => String.fromCharCode(65 + i)
  assert.equal(letra(nombres.indexOf('Obra')), REPLICA_COL.obra)
  assert.equal(letra(nombres.indexOf('Monto')), REPLICA_COL.monto)
  assert.equal(letra(nombres.indexOf('Obra (clave)')), REPLICA_COL.obraClave)
  assert.equal(letra(nombres.indexOf('Tipo')), REPLICA_COL.tipo)
})
