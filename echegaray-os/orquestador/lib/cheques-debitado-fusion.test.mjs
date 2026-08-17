import { test } from 'node:test'
import assert from 'node:assert/strict'
import { conciliarDebitosDeCheques } from './cheques-debito-banco.mjs'
import { planSync } from './cheques-emitidos-sync.mjs'
import {
  loQueAfirmaLaBase, marcasDelBanco, fusionarDebitado,
  huerfanosDeDebito, tituloHuerfano, anotarHuerfanos,
} from './cheques-debitado-fusion.mjs'

// ── LOS DATOS REALES DEL 14/08 ───────────────────────────────────────────────────────────────────
// Tres físicos que la pestaña daba por vivos y el banco ya había debitado: $1.590.000 contados como
// comprometidos que ya no estaban. Más el 317: un débito de $510.000 sin ninguna fila que lo respalde.
const REGISTRO = [
  { instrumento: 'FISICO', numero: '316', importe: 500000, beneficiario: 'Diesel Rodriguez', debitado: false, fila: 101 },
  { instrumento: 'FISICO', numero: '318', importe: 750000, beneficiario: 'Corralon Progreso', debitado: false, fila: 108 },
  { instrumento: 'FISICO', numero: '325', importe: 340000, beneficiario: 'Diesel Rodriguez', debitado: false, fila: 114 },
]
const MOVS = [
  { fecha: '2026-08-13', concepto: 'Cheque debitado', importe: -500000, referencia: '000000316' },
  { fecha: '2026-08-11', concepto: 'Cheque debitado', importe: -750000, referencia: '000000318' },
  { fecha: '2026-08-10', concepto: 'Canje interno recibido 24 hs', importe: -340000, referencia: '000000325' },
  { fecha: '2026-08-13', concepto: 'Cheque debitado', importe: -510000, referencia: '000000317' },
]

const conciliar = (movs = MOVS, reg = REGISTRO) => conciliarDebitosDeCheques(movs, reg).resultados

test('un FISICO que el banco debitó se marca: los $1.590.000 dejan de figurar comprometidos', () => {
  const { updates } = fusionarDebitado({ base: [], planBase: { updates: [] }, conciliacion: conciliar() })
  assert.deepEqual(updates.map((u) => u.fila), [101, 108, 114])
  for (const u of updates) {
    assert.equal(u.a, 'SI', `fila ${u.fila}`)
    assert.equal(u.instrumento, 'FISICO')
    assert.deepEqual(u.fuentes, ['banco'])
  }
  assert.equal(updates.reduce((s, u) => s + u.monto, 0), 1590000)
  assert.match(updates[0].evidencia, /2026-08-13.*Cheque debitado/)
})

// CONTRATO CAMBIADO EL 17/08: este test decía "no se inventa: ninguna fila nueva". El dueño mandó lo
// contrario —"el registro es tuyo, así q si detectas eso lo tenés q agregar"— y el alta se hace, en
// `cheques-alta-desde-banco.mjs`. Lo que ESTE núcleo sigue sin poder hacer es tocar una fila existente:
// el 317 no puede colarse como CORRECCIÓN sobre la fila de otro cheque.
test('el 317 se DECLARA como huérfano y nunca como corrección de una fila ajena', () => {
  const c = conciliar()
  const { updates } = fusionarDebitado({ conciliacion: c })
  assert.equal(updates.some((u) => u.numero === '317'), false)

  const h = huerfanosDeDebito(c)
  assert.equal(h.length, 1)
  assert.deepEqual(
    { numero: h[0].numero, importe: h[0].importe, fecha: h[0].fecha },
    { numero: '317', importe: 510000, fecha: '2026-08-13' })
  assert.match(h[0].motivo, /ningún cheque del registro lleva el número 317/)
})

test('el título del hallazgo es estable: correrlo dos veces no anota el 317 dos veces', () => {
  const [h] = huerfanosDeDebito(conciliar())
  assert.equal(tituloHuerfano(h), tituloHuerfano(huerfanosDeDebito(conciliar())[0]))
  assert.match(tituloHuerfano(h), /N° 317 por \$510\.000,00 del 2026-08-13/)
})

test('anotarHuerfanos es idempotente: si el ítem ya está abierto no inserta otro', async () => {
  const [h] = huerfanosDeDebito(conciliar())
  const sql = []
  const port = {
    query: async (q) => {
      sql.push(q.trim().slice(0, 6))
      return { rows: q.includes('select') ? [{ id: 'ya-existe' }] : [] }
    },
  }
  assert.deepEqual(await anotarHuerfanos(port, [h]), { anotados: 0, yaEstaban: 1 })
  assert.deepEqual(sql, ['select'])

  const vacio = { query: async (q) => ({ rows: q.includes('select') ? [] : [] }) }
  assert.deepEqual(await anotarHuerfanos(vacio, [h]), { anotados: 1, yaEstaban: 0 })
})

test('la recomendación la fija quien detecta: al huérfano ya dado de alta no se le pide cargarlo otra vez', async () => {
  const [h] = huerfanosDeDebito(conciliar())
  const insertados = []
  const port = { query: async (q, p) => { if (q.includes('insert')) insertados.push(p); return { rows: [] } } }

  await anotarHuerfanos(port, [{ ...h, recomendacion: 'El OS ya agregó la fila: completá el resto.' }])
  assert.equal(insertados[0][3], 'El OS ya agregó la fila: completá el resto.')

  // Sin override sigue valiendo el texto de siempre: el que no se dio de alta hay que ir a buscarlo.
  await anotarHuerfanos(port, [h])
  assert.match(insertados[1][3], /Buscar el cheque N° 317 en la chequera física/)
})

test('sin base no se puede anotar, y eso NO rompe el sync', async () => {
  const r = await anotarHuerfanos(null, huerfanosDeDebito(conciliar()))
  assert.equal(r.anotados, null)
  assert.match(r.motivo, /sin acceso a la base/)
})

test('un ECHEQ y un FISICO con el mismo número no se confunden', () => {
  // El registro real tiene el 313 dos veces. El banco declara el instrumento sólo cuando escribe
  // "Echeq"; en "Cheque debitado" no lo dice, y ahí lo resuelve el importe.
  const reg = [
    { instrumento: 'FISICO', numero: '313', importe: 470945, beneficiario: 'Corralon Progreso', debitado: false, fila: 90 },
    { instrumento: 'ECHEQ', numero: '313', importe: 383175, beneficiario: 'Maderas Lliteras', debitado: false, fila: 91 },
  ]
  const movs = [
    { fecha: '2026-08-06', concepto: 'Cheque debitado', importe: -470945, referencia: '000000313' },
    { fecha: '2026-08-07', concepto: 'Echeq clearing recibido 48hs', importe: -383175, referencia: '000000313' },
  ]
  const { updates } = fusionarDebitado({ conciliacion: conciliarDebitosDeCheques(movs, reg).resultados })
  assert.deepEqual(updates.map((u) => [u.fila, u.instrumento]), [[90, 'FISICO'], [91, 'ECHEQ']])
})

test('un cheque ya marcado "SI" no produce ninguna corrección: el sync es idempotente', () => {
  const yaMarcados = REGISTRO.map((c) => ({ ...c, debitado: true }))
  const { updates } = fusionarDebitado({ conciliacion: conciliar(MOVS, yaMarcados) })
  assert.deepEqual(updates, [])
})

test('cuando la base dice "sigue vivo" y el extracto lo pagó, GANA el extracto y el conflicto se declara', () => {
  // El caso 307: public.cheques con la foto vieja ("Aceptado") y el banco con el débito asentado.
  const base = [{ numero: '00000307', estado: 'Aceptado', origen: 'pantalla de echeq emitidos del Santander' }]
  const reg = [{ instrumento: 'ECHEQ', numero: '307', importe: 317000, beneficiario: 'NEUMAGOM SAS', debitado: false, fila: 77 }]
  const movs = [{ fecha: '2026-08-04', concepto: 'Echeq clearing recibido 48hs', importe: -317000, referencia: '000000307' }]

  const conciliacion = conciliarDebitosDeCheques(movs, reg).resultados
  const planBase = planSync(base, [{ fila: 77, tipo: 'ECHEQ', numero: '307', debitado: 'No' }])
  // La base no pide ningún cambio —dice "No" y la pestaña dice "No"—: sin mirar el extracto, nadie
  // se entera de que la plata ya salió.
  assert.deepEqual(planBase.updates, [])

  const { updates, conflictos } = fusionarDebitado({ base, planBase, conciliacion })
  assert.deepEqual(updates.map((u) => [u.fila, u.a]), [[77, 'SI']])
  assert.equal(conflictos.length, 1)
  assert.equal(conflictos[0].clave, 'ECHEQ|307')
  assert.match(conflictos[0].dice, /public\.cheques lo da por NO debitado/)
})

test('dos fuentes sobre la misma fila escriben UNA sola vez, no dos', () => {
  const base = [{ numero: '00000364', estado: 'Pagado', origen: 'pantalla de echeq emitidos del Santander' }]
  const reg = [{ instrumento: 'ECHEQ', numero: '364', importe: 429048.5, beneficiario: 'ALVARADO', debitado: false, fila: 120 }]
  const movs = [{ fecha: '2026-08-11', concepto: 'Echeq clearing recibido 48hs', importe: -429048.5, referencia: '000000364' }]
  const planBase = planSync(base, [{ fila: 120, tipo: 'ECHEQ', numero: '364', debitado: 'No' }])
  assert.equal(planBase.updates.length, 1)

  const { updates, conflictos } = fusionarDebitado({
    base, planBase, conciliacion: conciliarDebitosDeCheques(movs, reg).resultados,
  })
  assert.equal(updates.length, 1)
  assert.deepEqual(updates[0].fuentes, ['base', 'banco'])
  assert.equal(conflictos.length, 0)
})

test('loQueAfirmaLaBase indexa por (instrumento, número), nunca por número solo', () => {
  const m = loQueAfirmaLaBase([
    { numero: '00000307', estado: 'Pagado', origen: 'echeq emitidos' },
    { numero: '313', estado: 'Aceptado', origen: 'echeq emitidos' },
    { numero: '999', estado: 'Anulado', origen: 'echeq emitidos' },     // muerto: no afirma nada
    { numero: '888', estado: 'Pagado', origen: 'sin procedencia clara' }, // sin instrumento: no entra
  ])
  assert.equal(m.get('ECHEQ|307'), 'SI')
  assert.equal(m.get('ECHEQ|313'), 'No')
  assert.equal(m.has('FISICO|313'), false)
  assert.equal(m.has('ECHEQ|999'), false)
  assert.equal(m.size, 2)
})

test('un débito sin referencia no es un huérfano del registro: es un límite del extracto', () => {
  const movs = [{ fecha: '2026-06-25', concepto: 'Cheque debitado', importe: -200000, referencia: null }]
  const c = conciliarDebitosDeCheques(movs, REGISTRO).resultados
  assert.equal(c[0].estado, 'sin_referencia')
  assert.deepEqual(huerfanosDeDebito(c), [])
  assert.deepEqual(marcasDelBanco(c), [])
})

test('un débito cuyo número existe pero con otro importe tampoco marca nada: se declara', () => {
  const movs = [{ fecha: '2026-08-13', concepto: 'Cheque debitado', importe: -999999, referencia: '000000316' }]
  const c = conciliarDebitosDeCheques(movs, REGISTRO).resultados
  assert.deepEqual(fusionarDebitado({ conciliacion: c }).updates, [])
  const [h] = huerfanosDeDebito(c)
  assert.equal(h.numero, '316')
  assert.match(h.motivo, /ningún importe coincide/)
})
