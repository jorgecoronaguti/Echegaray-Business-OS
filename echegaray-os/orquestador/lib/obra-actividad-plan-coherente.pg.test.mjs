// PASADA D del E2E Quattropani (22/08): el formulario aceptaba un plazo que termina antes de
// empezar, y la fila quedaba viva alimentando Gantt/forecast con un intervalo imposible. La
// action tiene su Zod; ESTO ataca el piso —el CHECK de 20260822T6800— que ninguna cara puede
// esquivar. En transacción con ROLLBACK: no queda nada.
import test from 'node:test'
import assert from 'node:assert/strict'
import { getPool } from './db.mjs'

const hayBase = await getPool().query('select 1').then(() => true).catch(() => false)

test('un plazo no puede terminar antes de empezar — el CHECK del piso', { skip: !hayBase }, async () => {
  const c = await getPool().connect()
  try {
    await c.query('begin')
    await c.query(`insert into obra_canonica (id, nombre) values ('zz-plan-coherente', 'ZZ') on conflict (id) do nothing`)
    const rechaza = async (campos, mensaje) => {
      await c.query('savepoint s')
      await assert.rejects(
        () => c.query(`insert into obra_actividad (obra_id, nombre, tipo, orden, clave, fuente, ${campos.cols})
                       values ('zz-plan-coherente', 'zz imposible', 'tarea', 9001, 'zz:imposible', 'web', ${campos.vals})`),
        /coherente/,
        mensaje)
      await c.query('rollback to savepoint s')
    }
    await rechaza({ cols: 'inicio_plan, fin_plan', vals: "'2026-09-10', '2026-09-05'" },
      'el plan con fin anterior al inicio entró igual')
    await rechaza({ cols: 'inicio_base, fin_base', vals: "'2026-09-10', '2026-09-05'" },
      'la línea base con fin anterior al inicio entró igual')
    // y el caso legítimo pasa: mismo día (una actividad de un día es un plazo válido)
    await c.query(`insert into obra_actividad (obra_id, nombre, tipo, orden, clave, fuente, inicio_plan, fin_plan)
                   values ('zz-plan-coherente', 'zz un dia', 'tarea', 9002, 'zz:un-dia', 'web', '2026-09-05', '2026-09-05')`)
  } finally {
    await c.query('rollback')
    c.release()
    await getPool().end()
  }
})
