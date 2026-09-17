// LA PUERTA DE LAS NOTAS «QUÉ HACER», PROBADA CON SESIONES DE VERDAD — en una transacción que se deshace.
//
// Lo que se afirma es lo que 20260917T1400 y T1410 prometen y ningún doble puede probar: que dirección
// lee las notas y un usuario de campo no; que nadie las escribe por PostgREST; y que la RPC rechaza el
// pedido cuando la base ya no dice lo que la pantalla mostraba (gana el Sheet), no encola dos a la vez,
// no acepta una fórmula y NO toca `proveedor_notas` al encolar.
//
// ═══ CORRE ANTES Y DESPUÉS DE APLICAR ═══
//
// Si la RPC no existe en la base, las dos migraciones se corren ADENTRO de la transacción (un ensayo
// con aserciones) y se deshacen con todo lo demás. Aplicadas, se prueban los objetos vivos. La nota de
// prueba se inserta en la misma transacción: no se depende de ninguna nota real del dueño.
// Sin base se salta: no se inventa un verde.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { getPool, closePool } from './db.mjs'

const hayBase = await getPool().query('select 1').then(() => true).catch(() => false)
const MIG = (f) => readFileSync(new URL(`../../supabase/migrations/${f}`, import.meta.url), 'utf8')
const CLAVE = 'zz ensayo nota os'

async function comoUsuario(c, rol) {
  const { rows } = await c.query('select id from public.perfiles where rol = $1 limit 1', [rol])
  assert.ok(rows[0], `no hay un perfil ${rol} para probar`)
  const claims = JSON.stringify({ sub: rows[0].id, role: 'authenticated' })
  await c.query("select set_config('request.jwt.claims', $1, true), set_config('request.jwt.claim.sub', $2, true)", [claims, rows[0].id])
  await c.query('set local role authenticated')
}

/** Una sentencia que puede fallar sin abortar la transacción entera. */
async function intentar(c, sql, params) {
  await c.query('savepoint intento')
  try { const r = await c.query(sql, params); await c.query('release savepoint intento'); return { r } } catch (e) { await c.query('rollback to savepoint intento'); return { e } }
}

const pedir = (c, nota, anterior) => c.query('select public.proveedor_nota_pedir($1, $2, $3, $4) as r', ['ZZ Ensayo Nota OS', CLAVE, nota, anterior]).then((x) => x.rows[0].r)

test('notas «Qué hacer»: lectura por rol, sin escritura directa, y la RPC respeta al Sheet', { skip: !hayBase && 'sin base' }, async () => {
  const c = await getPool().connect()
  try {
    await c.query('begin')
    await c.query("set local lock_timeout = '2s'")
    const { rows: [{ hay }] } = await c.query("select to_regprocedure('public.proveedor_nota_pedir(text,text,text,text)') is not null as hay")
    if (!hay) { await c.query(MIG('20260917T1400_proveedor_notas_rls_y_aviso.sql')); await c.query(MIG('20260917T1410_proveedor_nota_cambio.sql')) }
    await c.query("insert into public.proveedor_notas (file_id, proveedor, clave, nota) values ('ensayo', 'ZZ Ensayo Nota OS', $1, 'pagar con cheque a 15')", [CLAVE])
    const { rows: [{ n: total }] } = await c.query('select count(*)::int n from public.proveedor_notas')

    await comoUsuario(c, 'campo')
    assert.equal((await c.query('select count(*)::int n from public.proveedor_notas')).rows[0].n, 0, 'campo no ve notas de pago')
    assert.equal((await pedir(c, 'otra', 'pagar con cheque a 15')).ok, false, 'campo no pide cambios')
    await c.query('reset role')

    await comoUsuario(c, 'direccion')
    assert.equal((await c.query('select count(*)::int n from public.proveedor_notas')).rows[0].n, total, 'dirección ve todas')
    const directo = await intentar(c, "update public.proveedor_notas set nota = 'x' where clave = $1", [CLAVE])
    assert.match(String(directo.e?.message), /permission denied/, 'nadie escribe la nota por PostgREST')

    const conflicto = await pedir(c, 'no es prioridad', 'lo que la pantalla creía')
    assert.equal(conflicto.ok, false)
    assert.equal(conflicto.conflicto, true)
    assert.equal(conflicto.actual, 'pagar con cheque a 15')

    assert.equal((await pedir(c, '=SUM(1)', 'pagar con cheque a 15')).ok, false, 'una fórmula no entra')
    const ok = await pedir(c, 'no es prioridad', 'pagar con cheque a 15')
    assert.equal(ok.ok, true, JSON.stringify(ok))
    const segundo = await pedir(c, 'otra cosa', 'pagar con cheque a 15')
    assert.match(String(segundo.error), /esperando/, 'un solo pedido vivo por proveedor')
    await c.query('reset role')

    const { rows: [base] } = await c.query('select nota from public.proveedor_notas where clave = $1', [CLAVE])
    assert.equal(base.nota, 'pagar con cheque a 15', 'encolar NO cambia la nota: la cambia el worker tras escribir el Sheet')
    const { rows: [cola] } = await c.query('select proveedor, nota_anterior, nota_nueva, estado from public.proveedor_nota_cambio where id = $1', [ok.cambio_id])
    assert.deepEqual(cola, { proveedor: 'ZZ Ensayo Nota OS', nota_anterior: 'pagar con cheque a 15', nota_nueva: 'no es prioridad', estado: 'pendiente' })
  } finally {
    await c.query('rollback').catch(() => {})
    c.release()
  }
})

test.after(async () => { await closePool().catch(() => {}) })
