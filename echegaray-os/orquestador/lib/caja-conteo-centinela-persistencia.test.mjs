// EL CENTINELA CONTRA LA BASE DE VERDAD — lo que el núcleo puro no puede probar.
//
// El núcleo decide bien con datos en memoria; lo que se rompe en producción es otra cosa: que la racha
// vigente sea la que se relee, que confirmar el mismo valor doce veces por día no cree doce filas, y
// que el ancla sobreviva a la corrida siguiente. Eso vive en el SQL y sólo se prueba corriéndolo.
//
// SE AUTOLIMPIA: `file_id` sintético y borrado al final. Sin base, se salta — no se inventa un verde.
import test from 'node:test'
import assert from 'node:assert/strict'
import { anclaDelConteo, observar, observarMuchas, ultimaObservacion } from './caja-conteo-centinela.mjs'
import { instanteDelSello } from './caja-ancla-por-instante.mjs'
import { query } from './db.mjs'
import { declararEscrituraEnPrueba } from './guarda-base-de-prueba.mjs'

// ESTE ARCHIVO ESCRIBE COMMITEADO SOBRE LA BASE PRODUCTIVA, Y NO ES UN DESCUIDO: lo que prueba es
// que la racha SOBREVIVE a la corrida siguiente. Dentro de una transacción con rollback no habría
// corrida siguiente que mirar. Se declara para que quede en una lista enumerable en vez de ser un
// hábito invisible — el resto de la suite no puede escribir sin decirlo.
declararEscrituraEnPrueba('la racha del centinela se prueba contra la tabla real porque la '
  + 'propiedad ES que sobreviva a la corrida siguiente; file_id sintético y borrado al final')

const FILE = `TEST_CENTINELA_${process.pid}`
const hayBase = await query('select 1').then(() => true).catch(() => false)
const limpiar = () => query('delete from public.caja_conteo_observado where file_id = $1', [FILE]).catch(() => {})
const T = (h, m = 0) => new Date(2026, 7, 15, h, m, 0)

test('una racha por VALOR, no una fila por corrida — y el ancla se relee igual', { skip: !hayBase && 'sin base' }, async (t) => {
  t.after(limpiar)
  await limpiar()
  await observar(FILE, 'CAJA_ARQUEO_ARS', 4320000, { ahora: T(9) })
  await observar(FILE, 'CAJA_ARQUEO_ARS', 4320000, { ahora: T(11) })
  await observar(FILE, 'CAJA_ARQUEO_ARS', 4320000, { ahora: T(13) })
  const filas = await query(
    'select count(*)::int n from public.caja_conteo_observado where file_id = $1', [FILE])
  assert.equal(filas.rows[0].n, 1, 'tres corridas con el mismo conteo son UNA racha')

  const viva = await ultimaObservacion(FILE, 'CAJA_ARQUEO_ARS')
  assert.equal(viva.valor, 4320000)
  assert.equal(viva.corridas, 3)
  assert.equal(viva.vistoDesde.getTime(), T(9).getTime(), 'el ancla releída es la PRIMERA vista')
})

test('el cambio abre racha nueva y deja el intervalo real escrito', { skip: !hayBase && 'sin base' }, async (t) => {
  t.after(limpiar)
  await limpiar()
  await observar(FILE, 'CAJA_ARQUEO_ARS', 4320000, { ahora: T(15, 1) })
  await observar(FILE, 'CAJA_ARQUEO_ARS', 4320000, { ahora: T(15, 9) })
  const r = await observar(FILE, 'CAJA_ARQUEO_ARS', 12000000, { ahora: T(17) })
  assert.equal(r.accion, 'cambio')

  const viva = await ultimaObservacion(FILE, 'CAJA_ARQUEO_ARS')
  assert.equal(viva.valor, 12000000)
  assert.equal(viva.vistoDesde.getTime(), T(17).getTime())
  assert.equal(viva.valorPrevio, 4320000)
  assert.equal(viva.previoVistoEn.getTime(), T(15, 9).getTime(), 'el borde izquierdo quedó persistido')
  // La racha vieja NO se pisa: es la historia de los conteos.
  const n = await query('select count(*)::int n from public.caja_conteo_observado where file_id = $1', [FILE])
  assert.equal(n.rows[0].n, 2)
})

test('ADOPTA el ancla que la pestaña ya tenía estampada, y sólo si es del mismo conteo', { skip: !hayBase && 'sin base' }, async (t) => {
  t.after(limpiar)
  await limpiar()
  // La pestaña viene con el sello del conteo vigente: se adopta ese instante, no el de ahora. Si esto
  // se rompiera, la puesta en marcha movería el ancla hacia adelante y se tragaría adentro del conteo
  // todo lo que se movió desde que se contó de verdad.
  const r = await anclaDelConteo(FILE, 'CAJA_ARQUEO_ARS', 12000000, {
    ahora: T(17), sello: { serial: instanteDelSello(T(10, 30)), valorSellado: 12000000 },
  })
  assert.equal(Math.round(r.fila.vistoDesde.getTime() / 1000), Math.round(T(10, 30).getTime() / 1000))
  assert.ok(Math.abs(r.serial - instanteDelSello(T(10, 30))) < 1e-6, 'el serial que va al Sheet es el adoptado')

  await limpiar()
  // Un sello que pertenece a OTRO conteo no es evidencia de éste: es un número parecido.
  const otro = await anclaDelConteo(FILE, 'CAJA_ARQUEO_ARS', 12000000, {
    ahora: T(17), sello: { serial: instanteDelSello(T(10, 30)), valorSellado: 4320000 },
  })
  assert.equal(otro.fila.vistoDesde.getTime(), T(17).getTime())
})

test('el conteo en dólares es OTRO concepto: uno no pisa al otro', { skip: !hayBase && 'sin base' }, async (t) => {
  t.after(limpiar)
  await limpiar()
  await observar(FILE, 'CAJA_ARQUEO_ARS', 12000000, { ahora: T(9) })
  await observar(FILE, 'CAJA_ARQUEO_USD', 3500, { ahora: T(9) })
  await observar(FILE, 'CAJA_ARQUEO_USD', 4000, { ahora: T(11) })
  assert.equal((await ultimaObservacion(FILE, 'CAJA_ARQUEO_ARS')).vistoDesde.getTime(), T(9).getTime(),
    'cambiar el conteo en dólares no mueve el ancla de los pesos')
  assert.equal((await ultimaObservacion(FILE, 'CAJA_ARQUEO_USD')).valor, 4000)
})

test('observarMuchas: 500 celdas en una lectura, y sólo las que cambiaron abren racha', { skip: !hayBase && 'sin base' }, async (t) => {
  t.after(limpiar)
  await limpiar()
  const lote = (n, extra = 0) => Array.from({ length: n }, (_, i) => ({ concepto: `Compras!T${i + 4}`, valor: 1000 + i + extra }))
  await observarMuchas(FILE, lote(500), { ahora: T(9), prefijo: 'Compras!T' })
  const r = await observarMuchas(FILE, [...lote(499), { concepto: 'Compras!T503', valor: 999999 }],
    { ahora: T(11), prefijo: 'Compras!T' })
  assert.equal(r.get('Compras!T4').accion, 'sigue')
  assert.equal(r.get('Compras!T503').accion, 'cambio')
  assert.equal(r.get('Compras!T503').fila.vistoDesde.getTime(), T(11).getTime(),
    'la celda que creció tiene por ancla la corrida que la vio crecer')
  const n = await query('select count(*)::int n from public.caja_conteo_observado where file_id = $1', [FILE])
  assert.equal(n.rows[0].n, 501, '500 rachas vivas + la nueva de la celda que cambió')
})

test('la tabla tiene RLS y su policy: sin policy devolvería cero filas y parecería un cero real', { skip: !hayBase && 'sin base' }, async () => {
  const rls = await query(`select relrowsecurity from pg_class where oid = 'public.caja_conteo_observado'::regclass`)
  assert.equal(rls.rows[0].relrowsecurity, true)
  const pol = await query(`select count(*)::int n from pg_policies
    where schemaname = 'public' and tablename = 'caja_conteo_observado'`)
  assert.ok(pol.rows[0].n >= 1, 'una tabla con RLS y sin policy no da error: devuelve cero filas')
})
