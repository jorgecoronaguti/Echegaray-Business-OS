// RETIRAR UNA PESTAÑA ES IRREVERSIBLE: LO QUE SE PRUEBA ACÁ ES QUE SE NIEGUE.
//
// Un script que borra sólo tiene dos formas de fallar y las dos son caras: borrar algo que alguien
// estaba mirando, y borrar sin haber guardado el respaldo. Cada test de abajo es una de esas dos.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  citaLaPestana, sheetIdsDe, referenciasAPestana, rangoDeLaHoja, nombreDelRespaldo, retirar,
} from './pestana-retirar.mjs'

const HOJAS = [
  { sheetId: 10, title: 'Plantel', rows: 140, cols: 17 },
  { sheetId: 20, title: 'Nómina', rows: 200, cols: 15 },
  { sheetId: 30, title: 'Cash Flow Mensual', rows: 90, cols: 20 },
]

/**
 * UN CLIENTE DE GOOGLE FALSO — devuelve lo que se le pone y ANOTA lo que le piden.
 *
 * Anota en `escrituras` porque el test que importa no es «¿devolvió retirada?» sino «¿escribió?»:
 * un script que se niega pero igual manda el `deleteSheet` pasaría el primero y fallaría el único
 * que protege el archivo.
 */
function clienteFalso({ hojas = HOJAS, nombres = [], protegidos = [], charts = [], formulas = {} } = {}) {
  const escrituras = []
  let borrada = null
  return {
    escrituras,
    async getSheetMeta() { return hojas.filter((h) => h.title !== borrada) },
    async getNamedRanges() { return nombres },
    async getProtectedRanges() { return protegidos },
    async getGridData() { return { sheets: charts } },
    async readSheetValues(id, rango) {
      const titulo = String(rango).replace(/^'?([^'!]+)'?!.*$/, '$1')
      return formulas[titulo] ?? []
    },
    async spreadsheetBatchUpdate(id, requests, opciones) {
      escrituras.push({ requests, opciones })
      const sid = requests?.[0]?.deleteSheet?.sheetId
      const h = hojas.find((x) => x.sheetId === sid)
      if (h) borrada = h.title
      return {}
    },
  }
}

const silencio = () => {}

test('una fórmula CITA la pestaña sólo cuando es una referencia de hoja, no cuando la nombra', () => {
  assert.equal(citaLaPestana("=SUM(Plantel!B4:B20)", 'Plantel'), true)
  assert.equal(citaLaPestana("=SUM('Cargas Sociales'!B4:B20)", 'Cargas Sociales'), true)
  assert.equal(citaLaPestana('=INDIRECT("Plantel!A1")', 'Plantel'), true, 'un INDIRECT también se rompe, y nadie lo reporta')
  // Un rótulo NO es una referencia: con esto, «Nómina» sería imposible de retirar para siempre.
  assert.equal(citaLaPestana('="Plantel del año"', 'Plantel'), false)
  assert.equal(citaLaPestana('=SUM(Plantel2!A1:A2)', 'Plantel'), false, 'otra pestaña que EMPIEZA igual no cuenta')
  assert.equal(citaLaPestana(1234, 'Plantel'), false)
})

test('sheetIdsDe encuentra el sheetId adentro de la spec anidada de un gráfico', () => {
  const spec = { title: 'Caja', basicChart: { domains: [{ domain: { sourceRange: { sources: [{ sheetId: 10, startRowIndex: 3 }] } } }] } }
  assert.deepEqual([...sheetIdsDe(spec)], [10])
})

test('SE NIEGA: un rango con nombre apuntado a la pestaña la vuelve irretirable', async () => {
  const g = clienteFalso({ nombres: [{ name: 'PLANTEL_TOTAL', range: { sheetId: 10 } }] })
  const r = await retirar(g, 'Plantel', { aplicar: true, log: silencio, exportar: () => { throw new Error('no debería exportar') } })
  assert.equal(r.estado, 'referenciada')
  assert.equal(r.referencias[0].tipo, 'rango con nombre')
  assert.deepEqual(g.escrituras, [], 'se negó pero igual escribió: el archivo no está protegido por el veredicto sino por esto')
})

test('SE NIEGA: una fórmula de otra pestaña que la cita', async () => {
  const g = clienteFalso({ formulas: { 'Cash Flow Mensual': [['=SUM(Plantel!H4:H20)']] } })
  const r = await retirar(g, 'Plantel', { aplicar: true, log: silencio, exportar: () => { throw new Error('no debería exportar') } })
  assert.equal(r.estado, 'referenciada')
  assert.equal(r.referencias[0].que, 'Cash Flow Mensual!A1')
  assert.deepEqual(g.escrituras, [])
})

test('SE NIEGA: un gráfico de OTRA hoja que se alimenta de la pestaña', async () => {
  // Es el caso peor: el gráfico no se va con la pestaña, queda vivo y vacío diciendo algo falso.
  const g = clienteFalso({
    charts: [{ properties: { sheetId: 30, title: 'Cash Flow Mensual' }, charts: [{ chartId: 7, spec: { title: 'Costo laboral', basicChart: { series: [{ series: { sourceRange: { sources: [{ sheetId: 10 }] } } }] } } }] }],
  })
  const r = await retirar(g, 'Plantel', { aplicar: true, log: silencio, exportar: () => { throw new Error('no debería exportar') } })
  assert.equal(r.estado, 'referenciada')
  assert.match(r.referencias[0].detalle, /se alimenta de «Plantel»/)
  assert.deepEqual(g.escrituras, [])
})

test('SE NIEGA: un rango protegido sobre la pestaña', async () => {
  const g = clienteFalso({ protegidos: [{ sheetId: 10, protectedRangeId: 3, description: 'candado del dueño' }] })
  const r = await retirar(g, 'Plantel', { aplicar: true, log: silencio, exportar: () => { throw new Error('no debería exportar') } })
  assert.equal(r.estado, 'referenciada')
  assert.deepEqual(g.escrituras, [])
})

test('la pestaña que se retira NO cuenta sus propias fórmulas: se citaría a sí misma para siempre', async () => {
  const g = clienteFalso({ formulas: { Plantel: [['=SUM(Plantel!A1:A2)']] } })
  const r = await retirar(g, 'Plantel', { log: silencio })
  assert.equal(r.estado, 'dry')
})

test('EL DEFAULT NO ESCRIBE: sin --aplicar no hay respaldo ni borrado', async () => {
  const g = clienteFalso()
  let exportos = 0
  const r = await retirar(g, 'Plantel', { log: silencio, exportar: () => { exportos += 1; return { bytes: 1 } } })
  assert.equal(r.estado, 'dry')
  assert.equal(exportos, 0, 'el dry exportó: un dry que toca el disco ya no es un dry')
  assert.deepEqual(g.escrituras, [])
})

test('CON --aplicar: el PDF PRIMERO y el borrado DESPUÉS', async () => {
  const g = clienteFalso()
  const orden = []
  const r = await retirar(g, 'Plantel', {
    aplicar: true, log: silencio, dir: '/tmp/respaldos-test', hoy: new Date('2026-09-09T12:00:00Z'),
    crearCarpeta: (d) => orden.push(`mkdir ${d}`),
    exportar: async (o) => { orden.push(`pdf ${o.salida} ${o.rango}`); return { bytes: 4096 } },
  })
  assert.equal(r.estado, 'retirada')
  assert.deepEqual(orden, ['mkdir /tmp/respaldos-test', 'pdf /tmp/respaldos-test/2026-09-09-Plantel.pdf A1:Q140'])
  assert.equal(g.escrituras.length, 1)
  assert.deepEqual(g.escrituras[0].requests, [{ deleteSheet: { sheetId: 10 } }])
  // Sin el permiso explícito, la guarda central descarta el deleteSheet y la corrida diría que borró.
  assert.deepEqual(g.escrituras[0].opciones, { borrarPestanas: ['Plantel'] })
})

test('SI EL RESPALDO FALLA, NO SE BORRA NADA', async () => {
  // El error se propaga a propósito: un catch acá convierte «no pude guardar el PDF» en un borrado
  // sin respaldo, que es el único final del que no se vuelve.
  const g = clienteFalso()
  await assert.rejects(
    () => retirar(g, 'Plantel', { aplicar: true, log: silencio, crearCarpeta: () => {}, exportar: () => { throw new Error('403 del export') } }),
    /403 del export/,
  )
  assert.deepEqual(g.escrituras, [], 'borró la pestaña con el respaldo fallado')
})

test('el borrado se verifica RELEYENDO el archivo, no con el 200 de la API', async () => {
  const g = clienteFalso()
  // Un cliente que dice que sí y no borra nada: es el modo de falla de una guarda que descarta el
  // request en silencio. La corrida tiene que reportarlo, no cantar victoria.
  g.spreadsheetBatchUpdate = async (id, requests, opciones) => { g.escrituras.push({ requests, opciones }); return {} }
  const r = await retirar(g, 'Plantel', { aplicar: true, log: silencio, crearCarpeta: () => {}, exportar: async () => ({ bytes: 1 }) })
  assert.equal(r.estado, 'no-borro')
})

test('una pestaña que no existe no es un error: no hay nada que retirar', async () => {
  const r = await retirar(clienteFalso(), 'Pestaña Fantasma', { aplicar: true, log: silencio })
  assert.equal(r.estado, 'no-existe')
})

test('el rango del respaldo cubre la hoja entera y el nombre lleva la fecha', () => {
  assert.equal(rangoDeLaHoja({ rows: 140, cols: 17 }), 'A1:Q140')
  assert.equal(rangoDeLaHoja({ rows: 1000, cols: 26 }), 'A1:Z1000')
  assert.equal(nombreDelRespaldo('Plantel', new Date('2026-09-09T03:00:00Z')), '2026-09-09-Plantel.pdf')
  assert.equal(nombreDelRespaldo('Cash Flow/Mensual', new Date('2026-09-09T03:00:00Z')), '2026-09-09-Cash Flow_Mensual.pdf')
})

// ═══ EL RETIRO NO TERMINA EN EL ARCHIVO: TERMINA EN EL CÓDIGO QUE LA RECLAMA ═══
//
// Una pestaña borrada del Sheet y viva en las listas del OS es peor que no haberla borrado: el
// auditor la busca en cada corrida, no la encuentra y la declara faltante o desactualizada — un
// rojo permanente que nadie puede arreglar. Estos dos son los lugares donde «Plantel» estaba.
test('«Plantel» no quedó reclamada por ninguna lista del OS', async () => {
  const { TITULOS_DE_PANTALLA } = await import('../lib/pestanas-del-contrato.mjs')
  const { PASOS_RETIRADOS } = await import('../lib/flujo-caja-pasos.mjs')
  assert.equal(TITULOS_DE_PANTALLA.includes('Plantel'), false, 'el contrato de pantalla la sigue exigiendo')
  const cuesta = PASOS_RETIRADOS.flatMap((p) => p.cuesta ?? [])
  assert.equal(cuesta.includes('Plantel'), false, 'un freno no le puede costar nada a una pestaña que no existe')
})
