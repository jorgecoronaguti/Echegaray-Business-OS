import test from 'node:test'
import assert from 'node:assert/strict'
import { marcarInstrumentos } from './cheques-cobertura-sheet.mjs'
import { accionDeMarcado, avisoDeCandado, frescuraDelRotulo } from '../lib/marcado-columna.mjs'
import { INSTRUMENTOS } from '../lib/cash-flow-lineas.mjs'

// EL DEFECTO QUE ATRAPA (auditoría del 10/09/2026).
//
// «Cheques Emitidos» quedó candada el 10/09 13:23 («el dueño edita»). El paso miraba la columna de
// marcas IGUAL, encontraba ahí las ediciones del dueño, y `planDeMarcado` abortaba con un throw: el
// paso salía con código 1 y el TIMER ENTERO del Flujo de Caja fallaba en cada corrida (verificado en
// el journal de las 16:57 y de las 14:50). El candado no puede romper el pipeline.

/** Un cliente de Google falso que ANOTA todo lo que se le pide y no habla con nadie. */
function googleFalso({ zona = [] } = {}) {
  const llamadas = { lecturas: [], escrituras: [], batch: [] }
  return {
    llamadas,
    async getSheetMeta() {
      return [
        { title: 'Cheques Emitidos', sheetId: 1, rows: 400, cols: 20 },
        { title: 'Tarjeta de Credito', sheetId: 2, rows: 60, cols: 20 },
      ]
    },
    async readSheetValues(_id, rango) {
      llamadas.lecturas.push(rango)
      if (!rango.includes(':')) return [['Estado en el OS · al 30/08/2026']]
      return rango.startsWith('Cheques Emitidos') ? zona : []
    },
    async batchUpdateValues(_id, data) { llamadas.escrituras.push(data); return {} },
    async spreadsheetBatchUpdate(_id, reqs) { llamadas.batch.push(reqs); return {} },
  }
}

/** La columna M como la dejó el dueño: siete filas con SUS anotaciones. Sin candado esto aborta. */
const columnaEditadaPorElDueno = () => {
  const col = []
  for (let i = 0; i < 40; i++) col.push([''])
  for (let f = 28; f <= 34; f++) col[f - 1] = [`ya lo hablé con el proveedor (${f})`]
  return col
}

const datos = () => ({
  pestanaCheques: 'Cheques Emitidos',
  enCompras: new Set(),
  cheques: [
    { fila: 28, comprobante: '0001-00000123', monto: 5000000, proveedor: 'DUBOS' },
    { fila: 29, comprobante: '0001-00000124', monto: 3000000, proveedor: 'DUBOS' },
  ],
  filasCh: 40,
  tarjeta: [],
  filasTj: INSTRUMENTOS.tarjeta.filaCab,
})
const resp = () => ({ cheques: { inferidos: new Set() }, tarjeta: { inferidos: new Set() } })

test('con candado y sin --forzar: NO escribe, NO aborta, y el pipeline sigue', async () => {
  const g = googleFalso({ zona: columnaEditadaPorElDueno() })
  const dicho = []
  const log = console.log
  console.log = (...a) => dicho.push(a.join(' '))
  try {
    await marcarInstrumentos(g, datos(), resp(), { forzar: false, esBloqueada: async (p) => p === 'Cheques Emitidos' })
  } finally { console.log = log }
  assert.equal(g.llamadas.escrituras.length, 0, 'no escribió una sola celda de la pestaña candada')
  assert.equal(g.llamadas.batch.length, 0, 'ni formato ni columnas nuevas')
  const aviso = dicho.join('\n')
  assert.match(aviso, /⏸ "Cheques Emitidos" está bajo tu control/)
  assert.match(aviso, /30\/08\/2026/, 'declara la frescura del diagnóstico que queda a la vista')
  assert.match(aviso, /8\.000\.000/, 'dice cuánta plata queda con el diagnóstico viejo')
  // Y NO leyó la columna entera: una pestaña que no se va a tocar no se escanea.
  assert.ok(!g.llamadas.lecturas.some((r) => /Cheques Emitidos!M1:M/.test(r)), 'no escaneó la columna')
})

test('SIN candado, la misma columna editada por el dueño SÍ aborta — el control puede dar rojo', async () => {
  const g = googleFalso({ zona: columnaEditadaPorElDueno() })
  await assert.rejects(
    () => marcarInstrumentos(g, datos(), resp(), { forzar: false, esBloqueada: async () => false }),
    /me niego a escribir/,
    'sin candado el aborto sigue siendo el comportamiento correcto: la columna cambió de dueño',
  )
})

test('la acción depende de quién es la pestaña, y de nada más', () => {
  assert.equal(accionDeMarcado({ candada: false, forzar: false }), 'escribir')
  assert.equal(accionDeMarcado({ candada: false, forzar: true }), 'escribir')
  assert.equal(accionDeMarcado({ candada: true, forzar: false }), 'saltar')
  assert.equal(accionDeMarcado({ candada: true, forzar: true }), 'forzar')
})

test('sin fecha en el rótulo NO se inventa una frescura', () => {
  assert.equal(frescuraDelRotulo('Estado en el OS · al 30/08/2026'), '30/08/2026')
  assert.equal(frescuraDelRotulo(''), null)
  const aviso = avisoDeCandado({ pestana: 'X', columna: 'M', rotulo: '', congeladas: 3, monto: 1 }).join(' ')
  assert.match(aviso, /NO puedo declarar su frescura/)
  assert.ok(!/al \d/.test(aviso), 'no aparece ninguna fecha inventada')
})
