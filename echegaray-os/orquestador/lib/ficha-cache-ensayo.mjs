// ENSAYO DE 20260928T2330 CONTRA UNA BASE CON LA MIGRACIÓN APLICADA — nunca la de producción.
//
// El test DDL viejo aplicaba la migración dentro de BEGIN … ROLLBACK. Con el cron convertido en
// PROCEDURE que hace COMMIT por fila eso ya no sirve: `call` con COMMIT adentro sólo corre en
// autocommit, y lo que hay que probar —que el cron y una escritura de la app no se esperan— necesita
// dos transacciones de verdad. Por eso esto corre contra una rama de Supabase con la migración ya
// aplicada, y escribe en ella. Contra producción se niega: el 28/09 a las 19:08 un test de DDL contra
// la viva trabó las tablas y tiró el login 25 minutos.
//
// No importa `pg`: recibe `abrir()`, que devuelve un cliente ya conectado. Así la guarda se prueba
// sin base, y el script y el .pg.test corren exactamente los mismos ensayos.

/**
 * El ref del proyecto de Supabase de una URL postgres:// o https://, o null si no es de Supabase.
 * Por expresión sobre el texto y no con `new URL`: una contraseña con «/» o «#» (la de producción
 * los tiene) hace que `URL` lea el usuario como host y el ref se pierda.
 */
export function refDeUrl(url) {
  const s = String(url ?? '')
  const porUsuario = /\/\/postgres\.([a-z0-9]{20})[:@]/.exec(s)
  if (porUsuario) return porUsuario[1]
  const porHost = /(?:^|[/@.])(?:db\.)?([a-z0-9]{20})\.supabase\.(?:co|in)\b/.exec(s)
  return porHost ? porHost[1] : null
}

function hostDe(url) {
  try {
    const u = new URL(String(url))
    return `${u.hostname}:${u.port || '5432'}${u.pathname}`
  } catch { return null }
}

/**
 * POR QUÉ ME NIEGO, o null si la URL no es producción. Falla cerrado: sin saber cuál es producción
 * (ninguna de DATABASE_URL / SUPABASE_URL / NEXT_PUBLIC_SUPABASE_URL en el entorno) se niega igual,
 * y una URL de Supabase cuyo ref no se puede leer tampoco pasa: la rama tiene ref propio.
 */
export function motivoParaNegarse(url, env = process.env) {
  if (!url) return 'falta la URL de la base de ensayo'
  const prod = [env.DATABASE_URL, env.SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_URL].filter(Boolean)
  if (prod.length === 0) return 'no sé cuál es la base de producción (falta DATABASE_URL): no ensayo a ciegas'
  const refsProd = new Set(prod.map(refDeUrl).filter(Boolean))
  const ref = refDeUrl(url)
  if (ref && refsProd.has(ref)) return `la URL es del proyecto de producción (${ref})`
  // Con ref distinto se decide por el ref y no por el host: la rama por pooler comparte host, puerto y
  // base con producción (aws-…pooler.supabase.com:6543/postgres) y sólo el usuario postgres.<ref> la
  // distingue. Pero si de producción no se leyó ningún ref, no hay contra qué comparar: me niego.
  if (ref) return refsProd.size ? null : 'no pude leer el ref de producción: no sé si esta URL lo es'
  if (!ref && /supabase\.(co|in|com)/.test(String(url))) return 'URL de Supabase sin ref legible: no sé si es producción'
  const host = hostDe(url)
  if (host && prod.some((p) => hostDe(p) === host)) return 'la URL apunta al mismo host y base que DATABASE_URL'
  return null
}

/** Falta algo en la base para poder ensayar: no es un fallo del diseño, es un ensayo que no se hizo. */
export class PreCondicion extends Error {}

const dormir = (ms) => new Promise((r) => setTimeout(r, ms))
const CALL = 'call public.refrescar_ficha_cliente_cache()'

/** Lo que el ensayo necesita encontrar en la base: sin esto no hay nada que probar. */
export async function precondiciones(c) {
  const { rows: [p] } = await c.query(
    `select prokind from pg_proc where oid = to_regprocedure('public.refrescar_ficha_cliente_cache()')`)
  if (p?.prokind !== 'p') throw new PreCondicion('la migración 20260928T2330 no está aplicada en esta base')
  const uno = async (sql, falta) => {
    const { rows } = await c.query(sql)
    if (!rows[0]) throw new PreCondicion(falta)
    return rows[0]
  }
  const perfil = await uno(`select id from public.perfiles where rol = 'direccion' and es_prueba = false
                             order by created_at, id limit 1`, 'no hay un perfil de Dirección que no sea de prueba')
  const obra = await uno(`select o.id from public.obra_canonica o join public.clientes k on k.id = o.cliente_id
                           order by o.id limit 1`, 'no hay una obra con cliente')
  const linea = await uno('select id from public.liquidacion_linea order by id limit 1', 'no hay filas en liquidacion_linea')
  return { uid: perfil.id, obra: String(obra.id), linea: linea.id }
}

/** 1a · `call` en autocommit, sin error y sin dejar tomado el candado de sesión. */
export async function ensayarCall(c) {
  const t0 = Date.now()
  await c.query(CALL)
  const { rows: [r] } = await c.query(
    `select count(*)::int n from pg_locks where locktype = 'advisory' and pid = pg_backend_pid()`)
  return { ms: Date.now() - t0, candadosQueQuedan: r.n }
}

/** Mira pg_locks cada `cadaMs` mientras `promesa` no termina: cuántas veces miró y qué esperas vio. */
async function mirarMientras(mirador, pids, promesa, cadaMs = 50) {
  let listo = false
  const fin = promesa.finally(() => { listo = true })
  fin.catch(() => {})
  const esperas = []
  let muestras = 0
  while (!listo) {
    const { rows } = await mirador.query(
      `select l.pid, l.locktype, l.mode, l.relation::regclass::text relacion
         from pg_locks l where not l.granted and l.pid = any($1::int[])`, [pids])
    esperas.push(...rows)
    muestras += 1
    await dormir(cadaMs)
  }
  await fin
  return { muestras, esperas }
}

const pidDe = async (k) => (await k.query('select pg_backend_pid() p')).rows[0].p

/**
 * 1b · UNA TRANSACCIÓN ABIERTA QUE ESCRIBE `liquidacion_linea` MIENTRAS CORRE EL CALL: nadie espera.
 * Antes se deja una «*» confirmada, para que el call haga la corrida más larga (consume, borra el
 * caché entero y recalcula todo) y para que la «*» que deja el escritor choque de clave con ella: con
 * la clave sin `txid` ése era el lugar de la espera. `lock_timeout` de 5 s en los dos: una espera que
 * el muestreo no llegue a ver igual se convierte en error, no en un cuelgue.
 */
export async function ensayarSinEspera(abrir, { linea }) {
  const [escritor, cron, mirador] = [await abrir(), await abrir(), await abrir()]
  try {
    await mirador.query(`select public.ficha_cliente_cache_marcar(array['*'])`)
    const pids = [await pidDe(escritor), await pidDe(cron)]
    await cron.query(`set lock_timeout = '5s'`)
    await escritor.query('begin')
    await escritor.query(`set local lock_timeout = '5s'`)
    const cambiar = () => escritor.query(
      'update public.liquidacion_linea set horas = coalesce(horas, 0) + 0.01 where id = $1', [linea])
    const antes = await cambiar()
    const t0 = Date.now()
    const llamada = cron.query(CALL)
    const durante = dormir(20).then(cambiar)
    const { muestras, esperas } = await mirarMientras(mirador, pids, Promise.all([llamada, durante]))
    const ms = Date.now() - t0
    const { rows: [m] } = await escritor.query(
      'select count(*)::int n from public.ficha_cliente_cache_pendiente where txid = txid_current()')
    return { ms, muestras, esperas, filas: antes.rowCount + (await durante).rowCount, marcasDelEscritor: m.n }
  } finally {
    await escritor.query('rollback').catch(() => {})
    for (const k of [escritor, cron, mirador]) await k.end().catch(() => {})
  }
}

/** Lee el desglose de horas de la obra como la web: `authenticated` con el perfil de Dirección. */
async function leerComoDireccion(c, uid, obra) {
  await c.query('begin')
  try {
    await c.query(`select set_config('request.jwt.claims', $1, true)`,
      [JSON.stringify({ sub: uid, role: 'authenticated' })])
    await c.query('set local role authenticated')
    const { rows: [r] } = await c.query(
      `select public.ficha_cliente_cache_leer('hh_de_obra', $1, '') is not null sirve`, [obra])
    return r.sirve
  } finally {
    await c.query('rollback')
  }
}

/** 1c · con la marca, la lectura no sirve la fila (null); consumida por el call, la vuelve a servir. */
export async function ensayarLectura(c, { uid, obra }) {
  await c.query(CALL)
  const { rows: [k] } = await c.query(
    `select public.ficha_cliente_cache_calcular($1, 'hh_de_obra', $2, '') ok`, [uid, obra])
  if (!k.ok) throw new PreCondicion(`hh_de_obra_en_vivo no pudo calcular la obra ${obra}`)
  const antes = await leerComoDireccion(c, uid, obra)
  await c.query(`select public.ficha_cliente_cache_marcar(array['obra:' || $1::text])`, [obra])
  const conMarca = await leerComoDireccion(c, uid, obra)
  // El corte de 12 s puede dejar la fila para la corrida siguiente: hasta tres, como haría el cron.
  let despues = false
  for (let i = 0; i < 3 && !despues; i++) {
    await c.query(CALL)
    despues = await leerComoDireccion(c, uid, obra)
  }
  const { rows: [q] } = await c.query(
    `select count(*)::int n from public.ficha_cliente_cache_pendiente where clave = 'obra:' || $1::text`, [obra])
  return { antes, conMarca, despues, marcasQueQuedan: q.n }
}

/** Qué resultado cuenta como verde en cada ensayo. Devuelve la lista de fallas (vacía = verde). */
export function fallasDe({ call, sinEspera, lectura }) {
  const f = []
  if (call.candadosQueQuedan !== 0) f.push(`1a: el call dejó ${call.candadosQueQuedan} candado(s) de sesión tomados`)
  if (sinEspera.esperas.length) f.push(`1b: hubo esperas en pg_locks: ${JSON.stringify(sinEspera.esperas)}`)
  if (sinEspera.muestras < 2) f.push(`1b: el call duró ${sinEspera.ms} ms y se miró ${sinEspera.muestras} vez: no prueba concurrencia`)
  if (sinEspera.filas !== 2) f.push(`1b: el escritor cambió ${sinEspera.filas} filas, se esperaban 2`)
  if (sinEspera.marcasDelEscritor !== 1) f.push(`1b: la marca «*» del escritor abierto no está (${sinEspera.marcasDelEscritor})`)
  if (!lectura.antes) f.push('1c: recién calculada, la lectura no sirvió la fila')
  if (lectura.conMarca) f.push('1c: con la marca puesta, la lectura sirvió la fila vieja')
  if (!lectura.despues) f.push('1c: consumida la marca, la lectura sigue sin servir la fila')
  if (lectura.marcasQueQuedan !== 0) f.push(`1c: el call no consumió la marca (${lectura.marcasQueQuedan})`)
  return f
}
