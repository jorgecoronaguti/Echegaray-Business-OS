// EL AUDITOR NO PUEDE ESCRIBIR NI UNA CELDA — y eso se prueba, no se promete.
//
// Un worktree que corrió un generador contra el Sheet real ya borró la pestaña Proveedores entera.
// Por eso `auditar()` recibe el cliente de Google en vez de construirlo: acá se le pasa un doble que
// EXPLOTA ante cualquier método que no sea de lectura. Si mañana alguien agrega un
// `batchUpdateValues`, este test se pone rojo antes de que la escritura llegue al archivo.
import test from 'node:test'
import assert from 'node:assert/strict'
import { auditar, analizarPestana, hallazgos } from './auditar-conexion-flujo.mjs'

/** Los ÚNICOS métodos que el auditor tiene permitido tocar. */
const LECTURA = ['getSheetMeta', 'getNamedRanges', 'apiGetSheets']

/**
 * Un archivo de mentira con dos pestañas: CAJA (viva, cita al libro) y SAC (isla con importes
 * pegados y una referencia a una pestaña que ya no existe).
 */
const HOJAS = [
  { title: 'CAJA', rows: 4, cols: 2, sheetId: 0 },
  { title: '_MOVIMIENTOS', rows: 2, cols: 2 },
  { title: 'SAC', rows: 5, cols: 2 },
  { title: '_BANCO_RAW', rows: 4, cols: 2 },
  { title: 'Deuda viva (OS)', rows: 3, cols: 2, sheetId: 77 },
  // EL CASO REAL (15/08/2026): cita a CAJA sin `'CAJA'!` adelante — por RANGO CON NOMBRE.
  { title: 'Cash Flow Semanal', rows: 2, cols: 1, sheetId: 5 },
]
/** La dinámica de "Deuda viva (OS)" se arma sobre CAJA (sheetId 0 en este archivo de mentira). */
const PIVOTS = { 'Deuda viva (OS)': { sheetId: 0, startRowIndex: 2, endRowIndex: 900, startColumnIndex: 0, endColumnIndex: 38 } }
const CELDAS = {
  CAJA: {
    FORMULA: [['Total', "=SUM(_MOVIMIENTOS!B:B)"], ['Anexo', '=ANEXO_DESCUBIERTO'], ['Viejo', "='RESUMEN'!A1"]],
    FORMATTED_VALUE: [['Total', '1.000'], ['Anexo', '5'], ['Viejo', '#REF!']],
  },
  _MOVIMIENTOS: { FORMULA: [['Fecha', 'Importe'], ['', '']], FORMATTED_VALUE: [['Fecha', 'Importe'], ['1/1/26', '1.000']] },
  // La réplica del extracto: ni una fórmula y todo transcripto. Es lo correcto para una réplica.
  _BANCO_RAW: {
    FORMULA: [['Fecha', 'Importe'], ['1/1/26', 500000], ['2/1/26', 600000], ['3/1/26', 700000]],
    FORMATTED_VALUE: [['Fecha', 'Importe'], ['1/1/26', '500.000'], ['2/1/26', '600.000'], ['3/1/26', '700.000']],
  },
  // SAC es una pestaña CALCULADA (tiene su total con fórmula) a la que le pegaron el cuerpo: el
  // hueco que este auditor tiene que ver. Si no tuviera ni una fórmula sería una réplica y estaría
  // bien que sus números estén pegados.
  SAC: {
    FORMULA: [['Concepto', 'Monto'], ['a', 1000000], ['b', 2000000], ['c', 3000000], ['Total', '=SUM(B2:B4)']],
    FORMATTED_VALUE: [['Concepto', 'Monto'], ['a', '$ 1.000.000'], ['b', '$ 2.000.000'], ['c', '$ 3.000.000'], ['Total', '$ 6.000.000']],
  },
  // Una dinámica NATIVA: vacía con render FORMULA, llena con FORMATTED_VALUE, sin una sola fórmula.
  'Deuda viva (OS)': {
    FORMULA: [['', ''], ['', ''], ['', '']],
    FORMATTED_VALUE: [['Proveedor', 'Saldo'], ['FEMENIA', '$ 3.000.000'], ['Alumetal', '$ 1.000.000']],
  },
  // CITA A CAJA POR NOMBRE, sin prefijo de pestaña — la fórmula real de "CAJA HOY".
  'Cash Flow Semanal': {
    FORMULA: [['=N(CAJA_TOTAL_DISPONIBLE)']],
    FORMATTED_VALUE: [['18.270.071']],
  },
}

function clienteSoloLectura(registro = []) {
  const permitido = {
    async getSheetMeta() { registro.push('getSheetMeta'); return HOJAS },
    async getNamedRanges() { return [
        { name: 'ANEXO_DESCUBIERTO' },
        { name: 'CAJA_TOTAL_DISPONIBLE', range: { sheetId: 0 } },
      ] },
    async apiGetSheets(url) {
      const u = new URL(url)
      // La lectura de dinámicas: una sola llamada con máscara de campos, sin rangos.
      if (u.searchParams.get('includeGridData')) {
        return {
          sheets: HOJAS.map((h) => ({
            properties: { title: h.title },
            data: PIVOTS[h.title] ? [{ rowData: [{ values: [{ pivotTable: { source: PIVOTS[h.title] } }] }] }] : [],
          })),
        }
      }
      const render = u.searchParams.get('valueRenderOption')
      const rangos = u.searchParams.getAll('ranges')
      return {
        valueRanges: rangos.map((r) => {
          const t = r.replace(/^'/, '').split("'!")[0]
          return { range: r, values: CELDAS[t]?.[render] ?? [] }
        }),
      }
    },
  }
  return new Proxy(permitido, {
    get(t, prop) {
      if (prop in t) return t[prop]
      if (typeof prop === 'symbol' || prop === 'then') return undefined
      throw new Error(`ESCRITURA PROHIBIDA: el auditor intentó usar "${String(prop)}"`)
    },
  })
}

test('el auditor sólo usa métodos de lectura del cliente de Google', async () => {
  const usados = []
  const g = clienteSoloLectura(usados)
  // El doble explota ante cualquier método fuera de LECTURA: si esto no tira, no escribió.
  await auditar(g, { cargar: () => null })
  assert.ok(usados.includes('getSheetMeta'))
  for (const m of ['batchUpdateValues', 'updateValues', 'clearValues', 'batchUpdate', 'appendValues']) {
    assert.throws(() => clienteSoloLectura()[m], /ESCRITURA PROHIBIDA/, `${m} tiene que estar prohibido`)
  }
  assert.deepEqual(LECTURA.filter((m) => typeof clienteSoloLectura()[m] !== 'function'), [])
})

test('el mapa contesta las cuatro preguntas por pestaña', async () => {
  const r = await auditar(clienteSoloLectura(), { cargar: () => null })
  const caja = r.filas.find((f) => f.titulo === 'CAJA')
  assert.deepEqual(caja.apunta, ['_MOVIMIENTOS'])          // hacia dónde apunta
  assert.equal(caja.vitalidad.formula, 3)                   // cuán viva está
  const libro = r.filas.find((f) => f.titulo === '_MOVIMIENTOS')
  assert.deepEqual(libro.citadaPor, [['CAJA', 1]])          // quién la lee
})

test('un rango con nombre resuelve a su pestaña de origen: CAJA aparece citada por Cash Flow Semanal', async () => {
  // EL HALLAZGO QUE MOTIVÓ ESTE FIX (15/08/2026): `=N(CAJA_TOTAL_DISPONIBLE)` es la fórmula real de
  // "CAJA HOY" en Cash Flow Semanal — sin `'CAJA'!` adelante. Antes de esto, `auditar()` devolvía
  // `CAJA citadaPor: []` con esta misma fórmula en el archivo: el peor tipo de falla en un auditor,
  // que dice "nadie depende de esto" sobre la celda de la que depende el año entero.
  const r = await auditar(clienteSoloLectura(), { cargar: () => null })
  const caja = r.filas.find((f) => f.titulo === 'CAJA')
  assert.ok(caja.citadaPor.some(([pestana]) => pestana === 'Cash Flow Semanal'),
    'CAJA_TOTAL_DISPONIBLE vive en CAJA: quien lo cita por nombre tiene que citar a CAJA')
  // Y CAJA ya no puede salir como huérfana ni como "sin dueño y leída" a la vez: algo la cita.
  assert.ok(!r.hallazgos.some((h) => h.pestana === 'CAJA' && h.tipo === 'HUÉRFANA'))
})

test('la pestaña con importes pegados y sin conexión sale como hallazgo, con su plata', async () => {
  const r = await auditar(clienteSoloLectura(), { cargar: () => null })
  const pegados = r.hallazgos.find((h) => h.tipo === 'IMPORTES PEGADOS')
  assert.equal(pegados.pestana, 'SAC')
  assert.match(pegados.detalle, /SAC!B2:B4/)
  assert.match(pegados.detalle, /\$6\.000\.000/)
  assert.ok(r.hallazgos.some((h) => h.tipo === 'HUÉRFANA' && h.pestana === 'SAC'))
})

test('la réplica materializada NO se reporta como importes pegados', async () => {
  // EL DEFECTO QUE ESTE TEST FIJA, medido contra el archivo real: las réplicas (_BANCO_RAW,
  // _ARCA_RAW, _J_OBREROS, _MOVIMIENTOS) generaban ~80 hallazgos de "importes pegados" y ahogaban
  // los 6 huecos reales de las pestañas calculadas. Una réplica está pegada POR DISEÑO: trae el
  // insumo, no el resultado. Su riesgo es la frescura, y eso lo mide la columna "escribe".
  const r = await auditar(clienteSoloLectura(), { cargar: () => null })
  assert.ok(!r.hallazgos.some((h) => h.tipo === 'IMPORTES PEGADOS' && h.pestana === '_BANCO_RAW'))
  assert.ok(r.hallazgos.some((h) => h.tipo === 'IMPORTES PEGADOS' && h.pestana === 'SAC'),
    'la pestaña calculada con un bloque pegado SÍ tiene que salir')
})

test('citar una pestaña borrada es el hallazgo más grave, y va primero', async () => {
  const r = await auditar(clienteSoloLectura(), { cargar: () => null })
  assert.equal(r.hallazgos[0].tipo, 'REFERENCIA ROTA')
  assert.match(r.hallazgos[0].detalle, /RESUMEN/)
  // Y el rango con nombre que SÍ existe no se reporta.
  assert.ok(!r.hallazgos.some((h) => /ANEXO_DESCUBIERTO/.test(h.detalle)))
})

test('el código de salida se decide por los hallazgos graves', async () => {
  const r = await auditar(clienteSoloLectura(), { cargar: () => null })
  assert.ok(r.hallazgos.some((h) => h.nivel <= 3), 'este archivo de mentira tiene que salir en rojo')
})

test('analizarPestana no cuenta la celda vacía como dato', () => {
  const a = analizarPestana('X', [['', '=A1'], ['', '']], [['', '5'], ['', '']])
  assert.equal(a.vitalidad.conDato, 1)
  assert.equal(a.vitalidad.pctViva, 100)
})

test('la pestaña que es una tabla dinámica NO es huérfana ni sin fuente', async () => {
  // EL DEFECTO: una dinámica nativa no tiene fórmula —sus celdas vuelven vacías con render FORMULA—
  // así que "Deuda viva (OS)" salía como isla sin fuente cuando en realidad lee Compras entera.
  const r = await auditar(clienteSoloLectura(), { cargar: () => null })
  const f = r.filas.find((x) => x.titulo === 'Deuda viva (OS)')
  assert.deepEqual(f.dinamicas, [{ origen: 'CAJA', rango: 'A3:AL900' }])
  assert.deepEqual(f.apunta, ['CAJA'])
  assert.ok(!r.hallazgos.some((h) => h.pestana === 'Deuda viva (OS)' && h.tipo === 'HUÉRFANA'))
  assert.ok(!r.hallazgos.some((h) => h.pestana === 'Deuda viva (OS)' && h.tipo === 'FUENTE NO DETERMINABLE'))
})

test('el orden de gravedad es 1 roto, 2 fósil leído, 3 pegado, 4 isla, 5 sin fuente', () => {
  const viva = { formula: 3, derramada: 0, pegado: 8 }
  const filas = [
    { titulo: 'A', duenos: [], excepcion: null, esCarga: false, vitalidad: viva, bloques: [], citadaPor: [['B', 7]], apunta: [], fuentes: [], externas: [] },
    { titulo: 'B', duenos: ['g.mjs'], excepcion: null, esCarga: false, vitalidad: viva, bloques: [{ rango: 'C2:C9', filas: 8, suma: 9000 }], citadaPor: [], apunta: ['A'], fuentes: [], externas: [] },
  ]
  const grafo = { rotas: [{ pestana: 'B', tipo: 'pestaña', destino: 'X', celdas: 1 }], huerfanas: [] }
  // "A" aparece dos veces y está bien: no tiene dueño Y no se le pudo determinar la fuente. Son dos
  // hechos distintos sobre la misma pestaña y arreglar uno no arregla el otro.
  const r = hallazgos(filas, grafo)
  assert.deepEqual(r.map((h) => h.nivel), [1, 2, 3, 5])
  assert.deepEqual(r.map((h) => h.nivel), [...r.map((h) => h.nivel)].sort())
})
