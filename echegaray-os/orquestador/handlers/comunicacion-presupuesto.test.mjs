import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { conPresupuesto, presupuestoActual } from '../lib/ia/fusible.mjs'

// EL DEFECTO (09/09/2026): el worker corría cada tarea sobre el presupuesto DE PROCESO, que se
// renueva por hora y mide el tope de 5 min desde la primera llamada de la hora. Dos posts de
// comprobantes con 15 min de diferencia: el segundo se cortaba «runtime» sin leer nada.
test('el handler de comunicación envuelve la tarea en su propio presupuesto de IA', () => {
  const src = readFileSync(new URL('./comunicacion.mjs', import.meta.url), 'utf8')
  assert.match(src, /import \{ conPresupuesto \} from '\.\.\/lib\/ia\/fusible\.mjs'/)
  assert.match(src, /export function comunicacionResponderHandler\(task, ctx\) \{\s*return conPresupuesto\(/,
    'la tarea tiene que correr DENTRO de conPresupuesto: fuera, hereda el t0 de la hora')
})

test('dos tareas envueltas no comparten t0: la segunda no hereda el reloj de la primera', async () => {
  const t0s = []
  await conPresupuesto({ correlacion: 'a' }, async () => { t0s.push(presupuestoActual().t0) })
  await new Promise((r) => setTimeout(r, 5))
  await conPresupuesto({ correlacion: 'b' }, async () => { t0s.push(presupuestoActual().t0) })
  assert.ok(t0s[1] > t0s[0], 'cada presupuesto arranca su propio reloj')
  const fuera = presupuestoActual()
  assert.notEqual(fuera.correlacion, 'b', 'al salir, el presupuesto de proceso sigue siendo otro')
})
