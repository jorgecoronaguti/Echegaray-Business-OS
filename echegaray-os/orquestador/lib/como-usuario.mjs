// ESCRIBIR COMO LA PERSONA, NO COMO EL ROBOT.
//
// El bot se conecta a Postgres con la llave de servicio, que pasa por encima de la RLS. Para todo lo que
// LEE está bien. Para lo que ESCRIBE plata, no: `entregar_efectivo` guarda `entregada_por = auth.uid()` y
// exige `es_administracion()`, y con la llave de servicio `auth.uid()` es null — la función ni siquiera
// corre («hace falta un usuario logueado»).
//
// Acá se abre una transacción, se dice quién es (el perfil detrás del usuario de Mattermost) y se baja el
// rol a `authenticated`. Desde ahí manda la RLS, igual que si esa persona lo hubiera hecho desde la web:
// si no es de Administración, la base lo rechaza. El bot no decide permisos; los aplica la base.
//
// Todo dentro de UNA transacción: `set_config(..., true)` y `set local role` son locales a ella, así que
// al terminar la conexión vuelve al pool como estaba, pase lo que pase.
import { getPool } from './db.mjs'

/**
 * @param {string} perfilId     el `perfiles.id` (= `auth.users.id`) de quien pide la escritura
 * @param {(c: import('pg').PoolClient) => Promise<any>} trabajo
 */
export async function comoUsuario(perfilId, trabajo) {
  if (!perfilId) throw new Error('comoUsuario: sin perfil no se escribe')
  const cliente = await getPool().connect()
  try {
    await cliente.query('begin')
    await cliente.query("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify({ sub: String(perfilId), role: 'authenticated' }),
    ])
    await cliente.query('set local role authenticated')
    const r = await trabajo(cliente)
    await cliente.query('commit')
    return r
  } catch (e) {
    await cliente.query('rollback').catch(() => {})
    throw e
  } finally {
    cliente.release()
  }
}
