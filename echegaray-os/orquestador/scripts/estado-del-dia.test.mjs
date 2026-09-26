// Prueba de formato SOBRE FIXTURES — nunca sale a la red, nunca toca git/systemd/journal/Sheet.
import test from 'node:test'
import assert from 'node:assert/strict'
import { formatearMensaje } from './estado-del-dia.mjs'

const BASE = {
  fecha: '26/09/2026',
  commits: [{ sha: 'a5ee63a', asunto: 'ERP Obras · M07: HOY vuelve a dos tercios del gráfico del teléfono' }],
  shaMain: 'a5ee63a063c94bd264ba1486e5d8b36fb6ca6547',
  vercel: { estado: 'success', detalle: 'Deployment has completed' },
  servicios: { total: 39, activos: 8, fallidos: [] },
  auditor: { encontrado: false },
  cf: { encontrado: true, valor: 73161245 },
}

test('mensaje base: cabecera, commit, vercel ok, sin fallidos, auditor desconocido, saldo con signo de pesos', () => {
  const m = formatearMensaje(BASE)
  const lineas = m.split('\n')
  assert.ok(lineas.length <= 25, `tiene ${lineas.length} líneas`)
  assert.match(m, /Estado del día — 26\/09\/2026/)
  assert.match(m, /Commits en main hoy: 1/)
  assert.match(m, /a5ee63a ERP Obras/)
  assert.match(m, /Vercel \(a5ee63a\): ✓ success — Deployment has completed/)
  assert.match(m, /ninguno en FAILED/)
  assert.match(m, /Auditor cash-flow↔libro: DESCONOCIDO/)
  assert.match(m, /Saldo final dic 26: \$73\.161\.245/)
})

test('servicios en FAILED se listan, hasta 5, y el resto se cuenta', () => {
  const fallidos = Array.from({ length: 7 }, (_, i) => ({ unidad: `echegaray-x${i}.service` }))
  const m = formatearMensaje({ ...BASE, servicios: { total: 39, activos: 8, fallidos } })
  assert.match(m, /7 en FAILED/)
  assert.match(m, /echegaray-x0\.service/)
  assert.match(m, /echegaray-x4\.service/)
  assert.doesNotMatch(m, /echegaray-x5\.service/)
})

test('más de 6 commits: se listan 6 y se cuenta el resto, nunca un dump completo', () => {
  const commits = Array.from({ length: 10 }, (_, i) => ({ sha: `sha${i}`, asunto: `commit ${i}` }))
  const m = formatearMensaje({ ...BASE, commits })
  assert.match(m, /Commits en main hoy: 10/)
  assert.match(m, /y 4 más/)
  const lineas = m.split('\n')
  assert.ok(lineas.length <= 25)
})

test('asunto de más de 70 caracteres NO se trunca acá: ya llega recortado desde commitsDeHoy (contrato documentado)', () => {
  // formatearMensaje no vuelve a cortar: el corte a 70 es responsabilidad de quien arma `commits`.
  // Se deja constancia en el test para que un cambio futuro no lo mueva sin darse cuenta.
  const largo = 'x'.repeat(70)
  const m = formatearMensaje({ ...BASE, commits: [{ sha: 'aaa', asunto: largo }] })
  assert.ok(m.includes(largo))
})

test('vercel DESCONOCIDO se marca con el signo de pregunta, no con un veredicto inventado', () => {
  const m = formatearMensaje({ ...BASE, vercel: { estado: 'DESCONOCIDO', detalle: 'gh api falló: 404' } })
  assert.match(m, /？ DESCONOCIDO — gh api falló: 404/)
})

test('CF Mensual sin dato: DESCONOCIDO con el motivo, nunca un número inventado', () => {
  const m = formatearMensaje({ ...BASE, cf: { encontrado: false, motivo: 'no encontré la columna «dic 26»' } })
  assert.match(m, /Saldo final dic 26: DESCONOCIDO \(no encontré la columna «dic 26»\)/)
  assert.doesNotMatch(m, /\$\d/)
})

test('auditor con resultado encontrado en el journal se cita, con su fecha', () => {
  const m = formatearMensaje({ ...BASE, auditor: { encontrado: true, fecha: '2026-09-20T08:00:00-0300', linea: '✓ las dos vistas muestran exactamente lo que dice el libro' } })
  assert.match(m, /Auditor cash-flow↔libro \(2026-09-20T08:00:00-0300\): ✓ las dos vistas/)
})

test('IMPORTAR el script no lo ejecuta: la guarda del punto de entrada aguanta', async () => {
  const m = await import('./estado-del-dia.mjs')
  assert.equal(typeof m.formatearMensaje, 'function')
  assert.equal(typeof m.commitsDeHoy, 'function')
})
