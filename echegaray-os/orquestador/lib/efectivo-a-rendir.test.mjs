// EFECTIVO A RENDIR, etapa 1 (22/09/2026): el mismo billete sale del cajón UNA vez.
//
// La entrega descarga la caja física (desde `_EFECTIVO_RAW`); el gasto que la persona rinde entra a
// Compras como «A rendir» y no vuelve a restar. Estos tests fijan las dos mitades de esa regla.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { instrumentoDePago, estadoDeEgreso, canalDeMovimiento, CANAL } from './caja-canales.mjs'
import {
  formulaEntregasARendirPosteriores, formulaDevolucionesARendirPosteriores, formulaComprasEfectivoPosteriores,
} from './caja-posterior-al-corte.mjs'
import { tipoPagoValido, TIPOS_PAGO } from './carga-comprobantes.mjs'
import { perfilesDePago } from './comprobantes/imputacion-historial.mjs'
import { fila, grilla, COL } from '../scripts/efectivo-raw-pestana.mjs'
import { RENDIR } from './caja-fuentes-banco.mjs'

test('«A rendir» es su propio instrumento, y «Efectivo a rendir» NO cae en efectivo', () => {
  assert.equal(instrumentoDePago('A rendir'), 'a_rendir')
  assert.equal(instrumentoDePago('Efectivo a rendir'), 'a_rendir', 'si cayera en efectivo, el billete saldría dos veces')
  assert.equal(instrumentoDePago('Efectivo'), 'efectivo')
})

test('una compra «A rendir» pagada es REAL (no diferida ni desconocida) y la cubre la entrega', () => {
  const corte = 100
  assert.equal(estadoDeEgreso({ instrumento: 'a_rendir', pagado: true, fecha: 105, corte }), 'REAL',
    'no espera un débito del banco: la plata ya salió con la entrega')
  const c = canalDeMovimiento({ estado: 'REAL', instrumento: 'a_rendir', fecha: 105 }, { corte })
  assert.deepEqual(c, { canal: CANAL.aRendir, cubierto: true })
})

test('el cajón resta sólo «Efectivo»: la fila «A rendir» de Compras no lo toca', () => {
  const cmp = { hoja: 'Compras', desde: 4, tipoPago: 'Q', rubro: 'AF', montoPagado: 'U', estado: 'X', fechaCaja: 'AD', fechaCarga: 'B' }
  const f = formulaComprasEfectivoPosteriores('$F$1', cmp)
  assert.match(f, /="Efectivo"\)/)
  assert.doesNotMatch(f, /rendir/i)
})

test('la entrega SALE con ventana inclusiva; la devolución ENTRA desde el día siguiente', () => {
  const e = formulaEntregasARendirPosteriores('$F$9')
  const d = formulaDevolucionesARendirPosteriores('$F$9')
  assert.match(e, /_EFECTIVO_RAW!\$E\$4:\$E="Entrega"/)
  assert.match(e, />=INT\(\$F\$9\)/, 'sale del cajón: el mismo día del conteo entra (lado conservador)')
  assert.match(e, /-_EFECTIVO_RAW!\$F\$4:\$F/, 'la réplica trae la entrega negativa: la fórmula devuelve el monto positivo')
  assert.match(d, /_EFECTIVO_RAW!\$E\$4:\$E="Devolución"/)
  assert.match(d, />INT\(\$F\$9\)/, 'entra al cajón: desde el día siguiente al conteo')
  assert.doesNotMatch(d, />=INT/)
  for (const x of [e, d]) assert.ok(!x.includes(','), 'es-AR: separador ;')
})

test('la réplica y las fórmulas hablan de las mismas columnas', () => {
  assert.equal(COL.fecha, RENDIR.fecha)
  assert.equal(COL.movimiento, RENDIR.movimiento)
  assert.equal(COL.importe, RENDIR.importe)
  assert.deepEqual(fila({ fecha: new Date('2026-09-22T00:00:00Z'), codigo: 'ER-0001', persona: 'X', destino: 'Galpón 8', movimiento: 'Entrega', importe: '-800000.00' }),
    ['2026-09-22', 'ER-0001', 'X', 'Galpón 8', 'Entrega', -800000])
  const g = grilla([{ fecha: '2026-09-22', codigo: 'ER-0001', movimiento: 'Entrega', importe: -800000 },
    { fecha: '2026-09-23', codigo: 'ER-0001', movimiento: 'Devolución', importe: 300000 }], '2026-09-22 10:00')
  assert.equal(g.length, 3 + 2, 'título, nota, encabezados y una fila por movimiento')
  assert.match(g[1][0], /neto para la caja física -500\.000/)
})

test('«A rendir» está en el desplegable de respaldo y se acepta tal cual', () => {
  assert.ok(TIPOS_PAGO.includes('A rendir'))
  assert.equal(tipoPagoValido('a rendir'), 'A rendir')
})

test('la historia del proveedor NUNCA sugiere «A rendir»: lo decide quién pagó, no a quién', () => {
  const h = Array.from({ length: 5 }, () => ({ proveedor: 'Corralón El Nogal', tipo_pago: 'A rendir' }))
  const p = Object.values(perfilesDePago(h))[0]
  assert.equal(p.sugerido, null)
  assert.equal(p.ultimas.length, 5, 'lo que había se sigue mostrando, sin afirmarlo')
})

test('Comprobantes-gastos NO cambia: el consumo en efectivo de la caja sigue entrando como sale del papel', async () => {
  // Pedido del dueño (22/09/2026): «en el canal comprobantes gastos tb se van a subir comprobantes de
  // consumos en efectivo q actualmente esta todo armado». Ese canal NO fuerza «A rendir»: sólo la
  // rendición (canal Rendiciones y la cola web con origen «rendicion») lo hace.
  const { readFileSync } = await import('node:fs')
  const canal = readFileSync(new URL('../comunicacion/especialistas/comprobantes.mjs', import.meta.url), 'utf8')
  assert.doesNotMatch(canal, /forzar|A rendir/)
  const { especialista } = await import('../comunicacion/especialistas/rendiciones.mjs')
  assert.equal(await especialista.reconoce('', { area: 'compras', fileIds: ['x'] }), null,
    'una foto en Comprobantes-gastos no la reclama Rendiciones')
})

test('CAJA no cuenta dos veces el ticket rendido: «Ya salió» del día y lo pagado del mes', async () => {
  const { repartirSalidas } = await import('./caja-necesidad-baldes.mjs')
  const RUBRO = 'Efectivo a rendir (fondos en manos de la gente)'
  // Día del ticket: el gasto sale REAL en Materiales y el espejo vuelve REAL en la línea de fondos.
  const dia = [
    { signo: -1, importe: 96400, estado: 'REAL', rubro: 'Materiales', instrumento: 'a_rendir' },
    { signo: 1, importe: 96400, estado: 'REAL', rubro: RUBRO, instrumento: 'a_rendir' },
  ]
  assert.equal(repartirSalidas(dia).yaSalio, 0, 'ese día no salió plata: salió con la entrega')
  // Día de la entrega: sale de verdad.
  assert.equal(repartirSalidas([{ signo: -1, importe: 800000, estado: 'REAL', rubro: RUBRO, instrumento: 'efectivo' }]).yaSalio, 800000)
})

test('el aviso de una entrega: menciona, lleva el enlace a la firma y NO publica el monto', async () => {
  const { textoDelAviso, avisarEntregas } = await import('../scripts/efectivo-avisos.mjs')
  const t = textoDelAviso({ username: 'rsosa', codigo: 'ER-0001', destino: 'Galpón 8', entregaId: 'abc' })
  assert.match(t, /^@rsosa /)
  assert.match(t, /\/mi-informacion\/efectivo\/firmar\/abc/)
  assert.doesNotMatch(t, /\$|\d{3}\.\d{3}/)
  // Sin canal de Rendiciones no se inventa otro lugar ni se marca como avisada.
  const q = []
  const port = { async query(sql) { q.push(sql); return { rows: /efectivo_entrega e/.test(sql) ? [{ id: 'abc', codigo: 'ER-0001', destino: 'X', username: 'r' }] : [] } } }
  const r = await avisarEntregas(port, { log: { warn() {} }, publicar: async () => 'post1' })
  assert.equal(r.sinCanal, 1)
  assert.ok(!q.some((s) => /update public\.efectivo_entrega/.test(s)))
  // Con canal: publica y marca UNA vez, sólo si el post se pudo releer.
  const q2 = []
  const port2 = { async query(sql) { q2.push(sql); if (/efectivo_entrega e/.test(sql)) return { rows: [{ id: 'abc', codigo: 'ER-0001', destino: 'X', username: 'r' }] }; if (/canales_area/.test(sql)) return { rows: [{ channel_id: 'ch' }] }; return { rows: [] } } }
  assert.equal((await avisarEntregas(port2, { log: {}, publicar: async () => null })).avisadas, 0, 'post no releído: no cuenta')
  assert.equal((await avisarEntregas(port2, { log: {}, publicar: async () => 'post1' })).avisadas, 1)
})
