// EL AVISO EN VIVO DE UN ESPEJO QUE SE REESCRIBE ENTERO — sólo cuando el contenido cambió de verdad.
//
// ═══ POR QUÉ `compra_sheet` NO TENÍA AVISO ═══
//
// 20260915T2100 puso triggers FOR EACH STATEMENT en las tablas con pantalla y dejó afuera, a
// propósito, las que su sincronizador borra y reinserta: `sync-compras` hace `delete` + `insert` de
// las ~970 filas cada diez minutos, y un trigger ve filas borradas e insertadas aunque el Sheet no
// haya cambiado ni una celda. Avisaría siempre, y cada pestaña abierta en Compras o Proveedores se
// refrescaría cada diez minutos por nada.
//
// El dueño (17/09/2026): «lo que indica el Sheet Flujo de Fondos en Proveedores tiene que
// actualizarse en tiempo real a Supabase y en app.ecsas.com.ar». Sin aviso, la app se entera de un
// cambio del Sheet sólo cuando alguien recarga.
//
// ═══ LA COMPARACIÓN LA HACE POSTGRES, NO JAVASCRIPT ═══
//
// Lo descartado: un hash por fila calculado en JS. Del lado del Sheet los valores son números y
// seriales; del lado de la base `pg` devuelve `numeric` como texto y `date` como `Date` local. Dos
// normalizaciones distintas del mismo dato es el camino por el que un «nada cambió» termina avisando
// siempre —o, peor, callando un cambio—. Acá se fotografía la tabla en una tabla temporal DENTRO de
// la transacción del sync, y después de reescribirla se compara fila contra fila en SQL: mismos
// tipos, mismas columnas, incluidas las que el sync proyecta (obra, pagos superpuestos).
//
// Se ignoran los sellos, igual que la función de los triggers: `sincronizado_en` se reescribe en
// cada corrida y no es un cambio.
//
// ═══ EL AVISO NUNCA ROMPE EL SYNC ═══
//
// `realtime.send` va en un SAVEPOINT: si Realtime no está o cambió de firma, se vuelve al savepoint y
// el espejo se commitea igual. Un espejo al día sin aviso es una comodidad perdida; un espejo que no
// se escribe porque falló la comodidad es un incidente. El mensaje viaja al COMMIT (Realtime lo lee
// de la replicación): si la transacción aborta, el aviso se va con ella.

/** Las columnas que se reescriben solas: no cuentan como cambio. La misma lista que 20260915T2100. */
export const SELLOS = Object.freeze([
  'updated_at', 'actualizado_en', 'actualizado_at', 'actualizado_por', 'calculado_en', 'sincronizado_en', 'ms',
])

/** El tópico y el evento que escucha el navegador (`src/shared/tiempo-real`). */
export const TOPICO = 'os:cambios'
export const EVENTO = 'cambio'

const IDENT = /^[a-z_][a-z0-9_]*(\.[a-z_][a-z0-9_]*)?$/

function ident(nombre) {
  if (!IDENT.test(String(nombre))) throw new Error(`espejo-aviso: «${nombre}» no es un nombre de tabla válido`)
  return nombre
}

/** La tabla temporal donde queda la foto previa. `on commit drop`: no sobrevive a la transacción. */
export const tablaDeFoto = (tabla) => `pg_temp.${ident(tabla).split('.').pop()}_antes`

/**
 * El SQL que cuenta altas, bajas y cambios entre la foto y la tabla ya reescrita.
 * `clave` es la columna que identifica la fila (en `compra_sheet`, el renglón).
 */
export function sqlDelConteo({ antes, despues, clave }) {
  const [a, d, k] = [ident(antes), ident(despues), ident(clave)]
  const sellos = `array[${SELLOS.map((s) => `'${s}'`).join(',')}]::text[]`
  return `with a as (select ${k} as k, to_jsonb(t) - ${sellos} as j from ${a} t),
     d as (select ${k} as k, to_jsonb(t) - ${sellos} as j from ${d} t)
select (select count(*) from d where not exists (select 1 from a where a.k = d.k))::int as altas,
       (select count(*) from a where not exists (select 1 from d where d.k = a.k))::int as bajas,
       (select count(*) from d join a using (k) where d.j is distinct from a.j)::int as cambios`
}

/** La decisión, sin base: hay aviso sólo si algo entró, salió o cambió. */
export function planDeAviso(conteo, tabla) {
  const altas = Number(conteo?.altas ?? 0)
  const bajas = Number(conteo?.bajas ?? 0)
  const cambios = Number(conteo?.cambios ?? 0)
  if (![altas, bajas, cambios].every(Number.isFinite)) throw new Error('espejo-aviso: conteo ilegible, no decido a ciegas')
  const hay = altas + bajas + cambios > 0
  return { avisar: hay, altas, bajas, cambios, payload: hay ? { tabla, op: 'SYNC' } : null }
}

/** Fotografía la tabla ANTES de reescribirla. Va dentro de la transacción del sync. */
export async function fotografiar(db, tabla) {
  await db.query(`create temp table ${tablaDeFoto(tabla).split('.').pop()} on commit drop as select * from ${ident(tabla)}`)
}

/**
 * Compara la foto con la tabla reescrita y, si cambió algo, manda el aviso. Nunca tira por el aviso.
 * @returns {Promise<{avisar:boolean, altas:number, bajas:number, cambios:number, enviado:boolean, error?:string}>}
 */
export async function avisarSiCambio(db, { tabla, clave }) {
  const { rows } = await db.query(sqlDelConteo({ antes: tablaDeFoto(tabla), despues: tabla, clave }))
  const nombre = tabla.split('.').pop()
  const plan = planDeAviso(rows?.[0], nombre)
  if (!plan.avisar) return { ...plan, enviado: false }
  await db.query('savepoint espejo_aviso')
  try {
    await db.query('select realtime.send($1::jsonb, $2, $3, true)', [JSON.stringify(plan.payload), EVENTO, TOPICO])
    await db.query('release savepoint espejo_aviso')
    return { ...plan, enviado: true }
  } catch (e) {
    await db.query('rollback to savepoint espejo_aviso')
    return { ...plan, enviado: false, error: e.message }
  }
}

/** Una línea de log. El cero también se dice: un aviso que calla es indistinguible de uno roto. */
export function lineaDeAviso(r) {
  if (!r.avisar) return 'aviso en vivo: el contenido no cambió — no aviso'
  const que = `${r.altas} alta(s) · ${r.bajas} baja(s) · ${r.cambios} cambio(s)`
  return r.enviado ? `aviso en vivo: ${que} — enviado a ${TOPICO}` : `aviso en vivo: ${que} — NO se pudo enviar (${r.error})`
}
