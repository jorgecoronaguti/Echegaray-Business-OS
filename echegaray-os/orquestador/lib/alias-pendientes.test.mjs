import assert from 'node:assert/strict'
import { detectarPendientes, formatPendientes } from './alias-pendientes.mjs'

const mapa = new Map([
  ['san francisco', { obra_id: 'sf', clasificacion: 'obra' }],
  ['javier sanchez', { obra_id: 'sf', clasificacion: 'obra' }],
  ['estrella', { obra_id: 'le', clasificacion: 'obra' }],
])

// El caso real que motivó la capacidad: la grafía del archivo JORNALES.
{
  const r = detectarPendientes([{ fuente: 'JORNALES', texto: 'JAVIER SANCHEZ', monto: '$53.448.688' }], mapa)
  assert.equal(r.pendientes.length, 0, 'con el alias cargado, JAVIER SANCHEZ resuelve')
  assert.equal(r.reconocidos[0].monto, 53448688)
}

// Sin el alias, tiene que APARECER — con la plata en juego, no en silencio.
{
  const sinAlias = new Map([['san francisco', { obra_id: 'sf', clasificacion: 'obra' }]])
  const r = detectarPendientes([{ fuente: 'JORNALES', texto: 'JAVIER SANCHEZ', monto: '$53.448.688' }], sinAlias)
  assert.equal(r.pendientes.length, 1)
  assert.equal(r.monto_pendiente, 53448688)
  assert.match(formatPendientes(r), /53\.448\.688/)
}

// Un match aproximado (contención) NO cuenta como reconocido: acierta por casualidad.
{
  const r = detectarPendientes([{ fuente: 'X', texto: 'san francisco solano', monto: 100 }], mapa)
  assert.equal(r.pendientes.length, 1, 'la contención no alcanza para dar por bueno un cliente')
}

// Ruido de planilla: encabezados repetidos, importes derramados, celdas de total.
{
  const r = detectarPendientes([
    { fuente: 'X', texto: 'CLIENTE' }, { fuente: 'X', texto: '$8.161.000' },
    { fuente: 'X', texto: 'Total MESSINAS' }, { fuente: 'X', texto: '   ' }, { fuente: 'X', texto: '16 y 17' },
  ], mapa)
  assert.equal(r.pendientes.filter((p) => /^(CLIENTE|\$8)/.test(p.texto)).length, 0, 'encabezado e importe no son clientes')
  assert.equal(r.pendientes.filter((p) => /^Total /i.test(p.texto)).length, 0, '"Total MESSINAS" es la misma grafía, no una nueva')
  assert.ok(r.pendientes.some((p) => p.texto === '16 y 17'), 'un texto raro real SÍ se reporta')
}

// Sin pendientes, el mensaje no inventa alarma.
{
  const r = detectarPendientes([{ fuente: 'X', texto: 'LA ESTRELLA', monto: 5 }], mapa)
  assert.equal(r.pendientes.length, 0)
  assert.match(formatPendientes(r), /Ninguno/)
}

console.log('alias-pendientes.test.mjs OK')

// ═══ «OBRA» INSERTADA EN COMPRAS L (14/09/2026): cliente y Total por rótulo ═══
{
  const { rangosDeFuente, FUENTES } = await import('./alias-pendientes.mjs')
  const { COMPRAS_2508, COMPRAS_CON_OBRA } = await import('./encabezados-referencia.mjs')
  const compras = FUENTES.find((f) => f.pestana === 'Compras')
  const conCab = (cab) => ({ readSheetValues: async () => [cab] })
  assert.deepEqual(await rangosDeFuente(conCab(COMPRAS_2508), 'X', compras), { texto: 'Compras!J4:J1000', monto: 'Compras!O4:O1000' })
  assert.deepEqual(await rangosDeFuente(conCab(COMPRAS_CON_OBRA), 'X', compras), { texto: 'Compras!J4:J1000', monto: 'Compras!P4:P1000' })
  const jornales = FUENTES.find((f) => f.pestana === '_J_OBREROS')
  assert.deepEqual(await rangosDeFuente(conCab([]), 'X', jornales), { texto: '_J_OBREROS!AB1:AB990', monto: '_J_OBREROS!AA1:AA990' })
  await assert.rejects(rangosDeFuente(conCab(['ID']), 'X', compras), /falta la columna/)
}
