// Andamiaje común de los tests pg del módulo Efectivo con roles: la migración 2200 aplicada DENTRO de la
// transacción (no tiene begin/commit a propósito), un usuario por rol y cada llamada medida como ese usuario.
// Todo termina en ROLLBACK: nada de esto queda en la base viva.
import { getPool } from './db.mjs'

export const hayBase = await getPool().query('select 1').then(() => true).catch(() => false)
export const MIGRACION = new URL('../../supabase/migrations/20260930T2200_efectivo_admin_rinde_por_otro.sql', import.meta.url)

/** Ejecuta `sql` asumiendo el rol de `sub`; un error no rompe la transacción de la prueba (savepoint). */
export async function como(c, sub, sql, params = []) {
  await c.query('savepoint p')
  try {
    await c.query("select set_config('request.jwt.claims', json_build_object('sub',$1::text)::text, true)", [sub])
    await c.query('set local role authenticated')
    const r = await c.query(sql, params)
    await c.query('reset role')
    await c.query('release savepoint p')
    return { ok: true, n: r.rows[0]?.n, filas: r.rowCount }
  } catch (e) {
    await c.query('rollback to savepoint p')
    await c.query('reset role')
    return { ok: false, error: e.message.split('\n')[0] }
  }
}

/** Cuatro perfiles con un rol cada uno; el de campo con su persona. Todo se deshace con el rollback. */
export async function armar(c) {
  const ps = (await c.query('select id::text from public.perfiles order by id limit 4')).rows.map((r) => r.id)
  const personas = (await c.query('select id::text from public.personas order by id limit 2')).rows.map((r) => r.id)
  if (ps.length < 4 || personas.length < 2) return null
  const roles = ['direccion', 'administracion', 'jefe_obra', 'campo']
  for (let i = 0; i < 4; i++) {
    await c.query('update public.perfiles set rol = $2, persona_id = $3 where id = $1',
      [ps[i], roles[i], roles[i] === 'campo' ? personas[0] : null])
  }
  const [direccion, administracion, jefe, campo] = ps
  // Una entrega de la persona del campo y otra de la otra persona (ajena a él).
  const ent = async (n, persona) => (await c.query(
    `insert into public.efectivo_entrega (numero, persona_id, estructura, monto, entregada_por)
     overriding system value values ($1, $2, true, 100000, $3) returning id::text`, [n, persona, direccion])).rows[0].id
  return { direccion, administracion, jefe, campo, personas, propia: await ent(900001, personas[0]), ajena: await ent(900002, personas[1]) }
}
