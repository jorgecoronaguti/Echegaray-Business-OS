import test from 'node:test'
import assert from 'node:assert/strict'
import { escribirYVerificar } from './cargar-comprobantes-compras.mjs'
import { colIndice } from '../lib/carga-comprobantes.mjs'

// ═══ EL LOG NO PUEDE FELICITAR SIN HABER ESCRITO (03/08) ═══
//
// LO MEDIDO. Corrida real contra el Sheet: el cargador imprimió
//
//   🔒 "Compras": la firma difiere de mi última escritura: la editaste — la tomo como tuya, no la piso.
//   ✔ Escritas 7 fila(s). Sin #ERROR.
//
// y las filas 800..806 quedaron VACÍAS. Los dos mensajes son ciertos por separado y juntos mienten: la
// guarda descartó los rangos y el chequeo de "#ERROR" no podía detectarlo, porque un rango vacío no tiene
// errores. Lo caro no es el mensaje: es que el paso siguiente (sync a Supabase, conciliación con ARCA) da
// por cargado un comprobante que no está, y el gasto desaparece sin que nadie lo busque.
//
// Estos tests fijan la regla: lo que prueba una escritura es el dato leído EN SU DESTINO. Si se revierte
// la verificación, el primero se pone rojo.

/** Cliente de Google falso: responde lo que responda la escritura, y devuelve el grid que se le indique. */
function googleFalso({ respuesta = {}, grid = [], fallaLectura = false } = {}) {
  const escrituras = []
  return {
    escrituras,
    async batchUpdateValues(_fileId, data, opciones) { escrituras.push({ data, opciones }); return respuesta },
    async readSheetGrid() { if (fallaLectura) throw new Error('sin red'); return { filas: grid } },
  }
}

/** Una fila del grid tal como la devuelve readSheetGrid: por índice de columna, con {valor}. */
function filaLeida(porLetra) {
  const f = []
  for (const [L, valor] of Object.entries(porLetra)) f[colIndice(L)] = { valor }
  return f
}

const PLAN = [
  { valores: { E: 'Combustibles Barcelo', H: '0001-00012345', M: 28479.3, N: 5981 } },
  { valores: { E: 'Ferretería Cobos', H: '0002-00000777', M: 5000, N: 1050 } },
]
const BLOQUE = { desde: 800, hasta: 801, plan: PLAN, fileId: 'SHEET-FALSO' }

test('el cargador FALLA si la guarda descartó los rangos: el destino quedó vacío', async () => {
  // Exactamente la corrida del 03/08: la guarda devuelve protegido y el destino no tiene nada.
  const google = googleFalso({
    respuesta: { protegido: true, bloqueadas: ['Compras'], porQue: { Compras: 'firma-editada' } },
    grid: [],
  })
  const r = await escribirYVerificar(google, BLOQUE)
  assert.equal(r.ok, false, 'no puede decir que escribió: las filas están vacías')
  assert.equal(r.vacias.length, 8, 'nombra cada celda que pidió escribir y no está')
  assert.match(r.motivo, /Compras/)
  assert.match(r.motivo, /firma-editada|candado/, 'y dice POR QUÉ no entró, no sólo que no entró')
})

test('el cargador FALLA también cuando la pestaña está candada a mano', async () => {
  const google = googleFalso({
    respuesta: { protegido: true, bloqueadas: ['Compras'], porQue: { Compras: 'candado-dueño' } },
    grid: [],
  })
  const r = await escribirYVerificar(google, BLOQUE)
  assert.equal(r.ok, false)
  assert.match(r.motivo, /candado-dueño/)
})

test('el cargador FALLA si el Sheet está congelado (freno de mano), y lo dice con ese nombre', async () => {
  // El freno devuelve la misma forma que la guarda ({protegido:true}); si no se distinguiera, el
  // diagnóstico mandaría al dueño a revisar un candado que no existe.
  const google = googleFalso({
    respuesta: { protegido: true, congelado: true, motivo: 'escritura de Sheets congelada por pedido del dueño\nsegunda línea' },
    grid: [],
  })
  const r = await escribirYVerificar(google, BLOQUE)
  assert.equal(r.ok, false)
  assert.match(r.motivo, /CONGELADA/)
})

test('el cargador FALLA si la API dijo que sí pero el destino no tiene el dato', async () => {
  // El caso más traicionero: nadie bloqueó nada, la respuesta es un 200 normal, y el dato no está.
  const google = googleFalso({ respuesta: { spreadsheetId: 'SHEET-FALSO', totalUpdatedCells: 8 }, grid: [] })
  const r = await escribirYVerificar(google, BLOQUE)
  assert.equal(r.ok, false, 'la respuesta de la API no es evidencia del efecto')
  assert.match(r.motivo, /destino/)
})

test('el cargador FALLA si no puede releer las filas — no afirma lo que no pudo verificar', async () => {
  const google = googleFalso({ respuesta: { totalUpdatedCells: 8 }, fallaLectura: true })
  const r = await escribirYVerificar(google, BLOQUE)
  assert.equal(r.ok, false)
  assert.match(r.motivo, /releer/)
})

test('el cargador da OK cuando las dos filas están de verdad en su destino', async () => {
  // El contrapeso: si esto fallara, la verificación sería un "siempre rojo" y no probaría nada. Los
  // valores vuelven formateados en es-AR, que es como los devuelve el Sheet real.
  const google = googleFalso({
    respuesta: { totalUpdatedCells: 8 },
    grid: [
      filaLeida({ E: 'Combustibles Barcelo', H: '0001-00012345', M: '$ 28.479,30', N: '$ 5.981,00' }),
      filaLeida({ E: 'Ferretería Cobos', H: '0002-00000777', M: '$ 5.000,00', N: '$ 1.050,00' }),
    ],
  })
  const r = await escribirYVerificar(google, BLOQUE)
  assert.equal(r.ok, true, r.motivo)
  assert.deepEqual(r.vacias, [])
  assert.deepEqual(r.distintas, [])
})

test('el cargador FALLA si entró una fila y la otra no (escritura partida al medio)', async () => {
  // Un 429 entre dos rangos ya partió una pestaña en este repo. "Escritas 2 filas" lo taparía.
  const google = googleFalso({
    respuesta: { totalUpdatedCells: 4 },
    grid: [filaLeida({ E: 'Combustibles Barcelo', H: '0001-00012345', M: '$ 28.479,30', N: '$ 5.981,00' })],
  })
  const r = await escribirYVerificar(google, BLOQUE)
  assert.equal(r.ok, false)
  assert.deepEqual(r.vacias.map((v) => v.fila), [801, 801, 801, 801], 'la fila que no entró es la 801')
})

test('la escritura del cargador pide soloFilasVacias: es un APPEND, no una reescritura', async () => {
  // Sin esta bandera el fajo se descarta entero cada vez que el dueño toca "Compras" — que es siempre.
  // Con ella, la guarda relee el destino y sólo escribe si lo confirma vacío (ver guarda-escritura.mjs).
  const google = googleFalso({
    respuesta: { totalUpdatedCells: 8 },
    grid: [
      filaLeida({ E: 'Combustibles Barcelo', H: '0001-00012345', M: '$ 28.479,30', N: '$ 5.981,00' }),
      filaLeida({ E: 'Ferretería Cobos', H: '0002-00000777', M: '$ 5.000,00', N: '$ 1.050,00' }),
    ],
  })
  await escribirYVerificar(google, BLOQUE)
  assert.equal(google.escrituras.length, 1)
  assert.equal(google.escrituras[0].opciones.soloFilasVacias, true)
  // Y escribe una columna por vez, en el bloque exacto que declaró (filas 800..801).
  assert.deepEqual(google.escrituras[0].data.map((d) => d.range).sort(),
    ['Compras!E800:E801', 'Compras!H800:H801', 'Compras!M800:M801', 'Compras!N800:N801'])
})
