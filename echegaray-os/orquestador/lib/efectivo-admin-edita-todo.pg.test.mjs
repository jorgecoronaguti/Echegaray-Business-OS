// EFECTIVO: EL ADMINISTRADOR EDITA Y ANULA TODO (dueño 30/09/2026: «tengo que poder editar por completo las
// rendiciones o el módulo efectivo en general si soy admin») — medido asumiendo cada rol, en una transacción
// que termina en ROLLBACK. Tres cosas que la ronda 1 no cubría:
//   1. la FOTO de una rendición ajena se ve (política de storage propia, acotada a la carpeta `rendicion`);
//   2. fecha y concepto de una rendición se editan y viajan a la cola de Compras como `detalle`;
//   3. devolución por otro y anulaciones: quién y cuándo quedan escritos, y la cancelación llega a la cola.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { getPool } from './db.mjs'
import { MIGRACION, armar, como, hayBase } from './efectivo-pg-helpers.mjs'

const FILA = 9999991
const CLAVE = 'c:30712345678|F A|0003-00012345'

async function sesion(t, fn) {
  const c = await getPool().connect()
  try {
    await c.query('begin')
    await c.query(readFileSync(MIGRACION, 'utf8'))
    const m = await armar(c)
    if (!m) { t.skip('la base no tiene 4 perfiles y 2 personas para armar los roles'); return }
    await fn(c, m)
  } finally {
    await c.query('rollback')
    c.release()
  }
}

/** Una fila de Compras en el espejo y la rendición que la imputa a la entrega ajena. */
async function rendicion(c, m, { anulada = false } = {}) {
  await c.query(
    `insert into public.compra_sheet (fila, sheet_id, clave, fecha, concepto, estado, anulada, sincronizado_en)
     values ($1, 990001, $2, '2026-09-10', 'Cemento', 'Pagado', $3, now())`, [FILA, CLAVE, anulada])
  return (await c.query(
    `insert into public.efectivo_rendicion (entrega_id, compra_clave, monto, imputada_por)
     values ($1, $2, 5000, $3) returning id::text`, [m.ajena, CLAVE, m.direccion])).rows[0].id
}

const encolados = (c, tipo) => c.query(
  `select tipo, celdas, previo, pedido_por::text, estado from public.compra_obra_cambio where fila = $1 and tipo = $2`, [FILA, tipo])
const editar = (c, quien, id, extra) => como(c, quien,
  `select public.editar_rendicion_efectivo(p_rendicion => $1::uuid, p_monto => 5000, p_entrega => null, ${extra})`, [id])

test('foto ajena: Dirección y Administración ven la carpeta rendicion de otro; Jefe y Campo no', { skip: !hayBase }, (t) => sesion(t, async (c, m) => {
  // Se quita la política general de 0926T0001 DENTRO de la transacción: así lo que se mide es la política
  // propia de las rendiciones y no que otra migración haya cubierto el mismo caso.
  await c.query('drop policy if exists comprobantes_lee_administracion on storage.objects')
  const ajeno = `${m.campo}/rendicion/ajena.jpg`
  const otra = `${m.campo}/ticket/otra-carpeta.jpg`
  await c.query(`insert into storage.objects (bucket_id, name) values ('comprobantes', $1), ('comprobantes', $2)`, [ajeno, otra])
  const ve = async (quien, nombre) => (await como(c, quien,
    `select count(*)::int as n from storage.objects where bucket_id = 'comprobantes' and name = $1`, [nombre])).n
  // Quien ve la foto de OTRA persona: sólo la gestión económica. El Jefe de obra es es_administracion() pero no ve_economia().
  const administracion = `${m.personas[1]}/rendicion/ajena.jpg`
  await c.query(`insert into storage.objects (bucket_id, name) values ('comprobantes', $1)`, [administracion])
  assert.equal(await ve(m.direccion, administracion), 1, 'Dirección ve la foto de otra persona')
  assert.equal(await ve(m.administracion, administracion), 1, 'Administración ve la foto de otra persona')
  assert.equal(await ve(m.jefe, administracion), 0, 'el Jefe de obra no ve la foto de otra persona')
  assert.equal(await ve(m.campo, administracion), 0, 'Campo no ve la foto de otra persona')
  assert.equal(await ve(m.campo, ajeno), 1, 'Campo sigue viendo su propia carpeta')
  // Acotada: no abre el resto del bucket (otras carpetas siguen sin ser visibles para Administración por esta política).
  assert.equal(await ve(m.administracion, otra), 0, 'la política es de la carpeta rendicion, no del bucket entero')
}))

test('editar fecha y concepto: Administración encola un detalle con lo de antes; Campo y Jefe no', { skip: !hayBase }, (t) => sesion(t, async (c, m) => {
  const id = await rendicion(c, m)
  for (const quien of [m.campo, m.jefe]) {
    const r = await editar(c, quien, id, `p_fecha => '2026-09-12'::date, p_concepto => 'Cemento Loma Negra'`)
    assert.equal(r.ok, false, 'sin ve_economia la base lo rechaza')
  }
  assert.equal((await encolados(c, 'detalle')).rowCount, 0, 'nada se encoló')

  const r = await editar(c, m.administracion, id, `p_fecha => '2026-09-12'::date, p_concepto => 'Cemento Loma Negra'`)
  assert.equal(r.ok, true, r.error)
  const q = await encolados(c, 'detalle')
  assert.equal(q.rowCount, 1)
  assert.deepEqual(q.rows[0].celdas, { fecha: '2026-09-12', concepto: 'Cemento Loma Negra' })
  assert.deepEqual(q.rows[0].previo, { fecha: '2026-09-10', concepto: 'Cemento' })
  assert.equal(q.rows[0].pedido_por, m.administracion, 'queda quién lo pidió')
  // El proveedor y el importe de la fila NO viajan: el espejo sigue como estaba hasta que el worker aplique.
  const espejo = (await c.query('select proveedor, concepto from public.compra_sheet where fila = $1', [FILA])).rows[0]
  assert.equal(espejo.concepto, 'Cemento')
}))

test('editar detalle: sin cambios no encola, con uno pendiente rechaza, y una fila cancelada no se corrige', { skip: !hayBase }, (t) => sesion(t, async (c, m) => {
  const id = await rendicion(c, m)
  assert.equal((await editar(c, m.administracion, id, `p_fecha => '2026-09-10'::date, p_concepto => 'Cemento'`)).ok, true)
  assert.equal((await encolados(c, 'detalle')).rowCount, 0, 'lo que ya dice no se encola')

  assert.equal((await editar(c, m.administracion, id, `p_fecha => '2026-09-12'::date, p_concepto => null`)).ok, true)
  const dup = await editar(c, m.administracion, id, `p_fecha => '2026-09-13'::date, p_concepto => null`)
  assert.equal(dup.ok, false)
  assert.match(dup.error, /esperando al Sheet/)
  assert.equal((await encolados(c, 'detalle')).rowCount, 1)

  await c.query('update public.compra_sheet set anulada = true where fila = $1', [FILA])
  await c.query(`update public.compra_obra_cambio set estado = 'aplicado' where fila = $1`, [FILA])
  const cancelada = await editar(c, m.administracion, id, `p_fecha => '2026-09-14'::date, p_concepto => null`)
  assert.match(cancelada.error, /cancelada/)
}))

test('devolución por otra persona: Administración sí; Jefe de obra y Campo no', { skip: !hayBase }, (t) => sesion(t, async (c, m) => {
  const dev = (quien) => como(c, quien,
    `select public.registrar_devolucion_efectivo($1::uuid, 1000, null, false, 'devuelve en mano', null, null)::text as n`, [m.ajena])
  for (const quien of [m.campo, m.jefe]) assert.equal((await dev(quien)).ok, false, 'no registra la devolución de otro')
  const r = await dev(m.administracion)
  assert.equal(r.ok, true, r.error)
  const fila = (await c.query('select monto::float8 as monto, registrada_por::text as por, registrada_en from public.efectivo_devolucion where entrega_id = $1', [m.ajena])).rows
  assert.equal(fila.length, 1)
  assert.equal(fila[0].por, m.administracion, 'queda quién la registró, no la persona a la que se le registró')
  assert.ok(fila[0].registrada_en, 'y cuándo')
}))

test('anular: entrega con rendición deja traza y encola Cancelado; borrar rendición y devolución dejan autor', { skip: !hayBase }, (t) => sesion(t, async (c, m) => {
  await rendicion(c, m)
  assert.equal((await como(c, m.campo, `select public.anular_entrega_efectivo($1::uuid, 'prueba')`, [m.ajena])).ok, false, 'Campo no anula')
  assert.equal((await como(c, m.jefe, `select public.anular_entrega_efectivo($1::uuid, 'prueba')`, [m.ajena])).ok, false, 'el Jefe de obra no anula')
  const r = await como(c, m.administracion, `select public.anular_entrega_efectivo($1::uuid, 'se cargó mal')`, [m.ajena])
  assert.equal(r.ok, true, r.error)

  const e = (await c.query('select anulada_por::text as por, anulada_en, anulada_motivo from public.efectivo_entrega where id = $1', [m.ajena])).rows[0]
  assert.equal(e.por, m.administracion, 'quién anuló')
  assert.ok(e.anulada_en, 'cuándo')
  assert.equal(e.anulada_motivo, 'se cargó mal')
  const q = await encolados(c, 'anular')
  assert.equal(q.rowCount, 1, 'la fila de Compras que escribió la rendición se cancela por la cola')
  assert.equal(q.rows[0].pedido_por, m.administracion)
  assert.equal((await c.query('select 1 from public.efectivo_rendicion where entrega_id = $1', [m.ajena])).rowCount, 0)
}))

test('borrar una rendición y una devolución: encolan Cancelado y dejan el autor en la bitácora', { skip: !hayBase }, (t) => sesion(t, async (c, m) => {
  const id = await rendicion(c, m)
  const dev = await como(c, m.administracion,
    `select public.registrar_devolucion_efectivo($1::uuid, 500, null, false, null, null, null)::text as n`, [m.ajena])
  assert.equal(dev.ok, true, dev.error)
  const did = (await c.query('select id::text from public.efectivo_devolucion where entrega_id = $1', [m.ajena])).rows[0].id

  assert.equal((await como(c, m.campo, 'select public.borrar_rendicion_efectivo($1::uuid, null)', [id])).ok, false)
  assert.equal((await como(c, m.administracion, 'select public.borrar_rendicion_efectivo($1::uuid, $2)', [id, 'mal cargada'])).ok, true)
  assert.equal((await como(c, m.campo, 'select public.borrar_devolucion_efectivo($1::uuid)', [did])).ok, false)
  assert.equal((await como(c, m.administracion, 'select public.borrar_devolucion_efectivo($1::uuid)', [did])).ok, true)

  assert.equal((await encolados(c, 'anular')).rowCount, 1, 'Cancelado encolado para la fila de Compras')
  const bit = (await c.query(
    `select campo, autor::text as autor from public.entidad_cambio
      where entidad = 'efectivo' and entidad_id = $1 and campo in ('rendicion.borrada', 'devolucion.borrada')`, [m.ajena])).rows
  assert.deepEqual(bit.map((b) => b.campo).sort(), ['devolucion.borrada', 'rendicion.borrada'])
  for (const b of bit) assert.equal(b.autor, m.administracion, `${b.campo}: queda quién lo borró`)
}))
