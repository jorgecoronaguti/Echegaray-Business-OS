// Modos de falla del camino de escritura. Ninguno se reporta como éxito y ninguno
// escribe a medias: el núcleo ya resuelve el todo-o-nada, acá se verifica que la pantalla
// lo traduzca a una frase entendible en vez de tragárselo.

import test from 'node:test'
import assert from 'node:assert/strict'
import { fakeGoogleJornales, construirGrid, fecha, txt } from '../jornales-fixture.mjs'
import { BASE, FECHA_HOY, levantarServidor } from './dobles-de-prueba.mjs'

/** Columna del 30/07/2026 en el bloque de julio del fixture (F..S ⇒ índice 17). */
const COL_HOY = 17

/** Pisa la celda del día de un trabajador, como si alguien tocara la planilla a mano. */
function pisarCelda(grid, nombre, celda) {
  for (let i = grid.filas.length - 1; i >= 0; i--) {
    const f = grid.filas[i] || []
    if (f[1]?.valor === nombre) { f[COL_HOY] = celda; return true }
  }
  return false
}

async function conObra(opciones) {
  const s = await levantarServidor(opciones)
  await s.entrar()
  const ctx = (await s.json(`${BASE}/api/contexto?fecha=${FECHA_HOY}`)).cuerpo
  const obra = ctx.obras.find((o) => o.nombre.toLowerCase().includes('revoque'))?.clave ?? null
  const cua = obra ? (await s.json(`${BASE}/api/cuadrilla?fecha=${FECHA_HOY}&obra=${encodeURIComponent(obra)}`)).cuerpo : null
  return { s, ctx, obra, cua }
}

const items = (personal) => personal.map((p) => (p.bloqueado || p.sin_cambio
  ? { ref: p.ref, nombre: p.nombre, sin_cambio: true }
  : { ref: p.ref, nombre: p.nombre, presente: p.presente, horas: p.horas, motivo: p.motivo }))

test('un día sin obras cargadas se muestra vacío, sin inventar una cuadrilla', async (t) => {
  const JUL = ['2026-07-28', '2026-07-29', '2026-07-30', '2026-07-31']
  const grid = construirGrid([{
    A: 'n', B: 'Obrero', D: 'Categoria', AB: 'CLIENTE', AC: 'OBRA',
    ...Object.fromEntries(JUL.map((iso, i) => [String.fromCharCode(70 + i), fecha(iso, { comoFormula: i > 0 })])),
  }])
  const google = {
    async listTabs() { return ['Obreros 26'] },
    async readSheetGrid() { return grid },
    async batchUpdateValues() { throw new Error('no se debe escribir') },
  }
  const { s, ctx } = await conObra({ google })
  t.after(s.cerrar)
  assert.deepEqual(ctx.obras, [])
  assert.equal(ctx.jornada.horas, 9)
  assert.equal(ctx.jornada.origen, 'piso', 'sin evidencia se declara que se usó el piso')
})

test('una celda con texto escrito a mano no se toca y se avisa por qué', async (t) => {
  const google = fakeGoogleJornales()
  assert.ok(pisarCelda(google.grid, 'Emanuel Alaniz', txt('NO TOCAR - VER JEFE')))
  const { s, obra, cua } = await conObra({ google })
  t.after(s.cerrar)
  const bloqueado = cua.personal.find((p) => p.nombre.includes('Emanuel'))
  assert.match(bloqueado.bloqueado, /texto escrito a mano/)
  assert.equal(bloqueado.sin_cambio, true)
  // El resto de la cuadrilla se carga igual: una celda protegida no frena la jornada.
  const r = await s.postear({ fecha: FECHA_HOY, obra, idempotency_key: 'kt', items: items(cua.personal) })
  assert.equal(r.status, 200)
  assert.equal(r.cuerpo.celdas.length, 2)
  assert.ok(!r.cuerpo.celdas.some((c) => c.nombre.includes('Emanuel')))
})

test('si alguien cambia la planilla mientras se carga, no se escribe nada', async (t) => {
  // La 4ª lectura es la relectura previa a la escritura: ahí aparece el cambio de mano ajena.
  const google = fakeGoogleJornales({
    alLeer: (grid, n) => {
      if (n === 4) pisarCelda(grid, 'Aguero Cristian', { valor: '4', numero: 4, formula: null, derivada: false })
    },
  })
  const { s, obra, cua } = await conObra({ google })
  t.after(s.cerrar)
  const r = await s.postear({ fecha: FECHA_HOY, obra, idempotency_key: 'kc', items: items(cua.personal) })
  assert.equal(r.status, 409)
  assert.match(r.cuerpo.error, /Alguien cambió la planilla/)
  assert.equal(google.escrituras.length, 0, 'ni una celda escrita')
  assert.ok(s.eventos.some((e) => e.evento.endsWith('conflict')), 'quedó auditado como conflicto')
})

test('una pestaña candada por el dueño se respeta y se dice', async (t) => {
  const google = fakeGoogleJornales({ protegido: true })
  const { s, obra, cua } = await conObra({ google })
  t.after(s.cerrar)
  const r = await s.postear({ fecha: FECHA_HOY, obra, idempotency_key: 'kp', items: items(cua.personal) })
  assert.equal(r.status, 409)
  assert.match(r.cuerpo.error, /está tomada/)
  assert.ok(s.eventos.some((e) => e.evento.endsWith('failed')))
})

test('si la API de Google revienta al escribir, se informa el fallo (no un éxito con 0 celdas)', async (t) => {
  const google = fakeGoogleJornales({
    alEscribir: () => { throw new Error('Bearer sk-SECRETO 503 desde /home/jorge/orquestador/lib/google.mjs') },
  })
  const { s, obra, cua } = await conObra({ google })
  t.after(s.cerrar)
  const r = await s.postear({ fecha: FECHA_HOY, obra, idempotency_key: 'kg', items: items(cua.personal) })
  assert.equal(r.status, 409)
  const crudo = JSON.stringify(r.cuerpo)
  assert.ok(!crudo.includes('SECRETO') && !crudo.includes('/home/jorge'), 'no filtra secretos ni rutas')
  assert.ok(!/ok"\s*:\s*true/.test(crudo), 'no se reporta como éxito')
})
