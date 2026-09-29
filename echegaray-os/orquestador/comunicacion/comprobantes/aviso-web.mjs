// EL COMPROBANTE DE LA WEB QUE ESPERA A LA PERSONA, AVISADO POR DIRECTO (29/09/2026).
//
// El defecto: cinco tickets de Nievas subidos por la app quedaron `en_espera` sin cargar y nadie se lo
// dijo. La compuerta M05 de la rendición LEE el ticket pero no escribe en Compras hasta que la persona
// confirma lo leído; el vigía de fajos mudos sólo mira Mattermost (un fajo web guarda un UUID como
// `root_post_id`: no hay hilo donde avisar y publicar daba 403), así que el hueco quedó abierto. Un
// ticket que espera y no avisa a quien espera no es una compuerta: es un silencio.
//
// Acá se cierra: un DIRECTO por persona con todo lo que tiene esperando, el enlace para confirmar, y el
// fajo se sella en `aviso_post_id` (sin cambio de esquema; el sello es el id del post del DM). Si la
// persona no tiene Mattermost el aviso va al dueño, diciéndolo. Si nada se pudo enviar, NO se sella y el
// tick siguiente lo reintenta.
//
// CERO MODELO: sólo SQL, texto fijo y Mattermost.

import { URL_APP } from '../../scripts/efectivo-avisos.mjs'

/** Minutos que espera un fajo web antes de avisar: el tiempo de que el timer lo procese y cierre solo. */
export const ESPERA_MIN = 10

const pesos = (n) => (Number.isFinite(Number(n)) ? `$${Number(n).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : 's/importe')

/** PURA. Agrupa los fajos por la persona que los subió. */
export function agruparPorPersona(fajos = []) {
  const g = new Map()
  for (const f of fajos) {
    const k = f.plataforma_user_id ?? f.plataforma_username ?? 'sin-persona'
    if (!g.has(k)) g.set(k, [])
    g.get(k).push(f)
  }
  return g
}

/** PURA. El texto: qué espera, de quién, y qué hacer. Nunca «quedó sin cargar». */
export function textoDelAvisoWeb({ fajos, paraDueno = false }) {
  const lineas = fajos.flatMap((f) => (f.leidos?.length ? f.leidos : [{}]).map((l) =>
    `- ${l.proveedor ?? 'comprobante'}${l.numero ? ` ${l.numero}` : l.clave ? ` ${l.clave}` : ''} · ${pesos(l.total)}`))
  const quien = fajos[0]?.plataforma_username ?? 'la persona'
  const enlace = `${URL_APP}/mi-informacion/efectivo/rendir/confirmar`
  if (paraDueno) {
    return [`**${quien}** subió ${fajos.length === 1 ? 'un comprobante' : `${fajos.length} comprobantes`} por la app y quedan esperando que confirme lo que se leyó. No tiene Mattermost vinculado: no pude avisarle a él.`,
      ...lineas, `Se confirma en: ${enlace}`].join('\n')
  }
  return [`Leí tus comprobantes subidos por la app y esperan tu confirmación (no se cargan hasta que confirmes que lo leído es correcto):`,
    ...lineas, `Confirmalos o corregilos acá: ${enlace}`].join('\n')
}

/**
 * EL BORDE, con todo inyectado: `listar()` los fajos esperando sin aviso, `destinoDe(userId)` →
 * `{ canal, quien: 'persona'|'dueno' }` o null, `enviar(canal, texto)` → id del post, `sellar(ids, sello)`.
 */
export async function avisarFajosWeb({ listar, destinoDe, enviar, sellar, log = console } = {}) {
  const r = { avisados: 0, fallidos: 0, mensajes: 0 }
  for (const fajos of agruparPorPersona(await listar()).values()) {
    const ids = fajos.map((f) => f.id)
    try {
      const destino = await destinoDe(fajos[0].plataforma_user_id)
      if (!destino?.canal) throw new Error('sin destino de Mattermost')
      const post = await enviar(destino.canal, textoDelAvisoWeb({ fajos, paraDueno: destino.quien === 'dueno' }))
      if (!post) throw new Error('el aviso no se pudo releer')
      await sellar(ids, `${destino.quien}:${post}`)
      r.avisados += ids.length; r.mensajes += 1
    } catch (e) {
      r.fallidos += ids.length
      log.warn?.('avisoWeb: no se pudo avisar', { fajos: ids, error: String(e?.message ?? e) })
    }
  }
  return r
}

/** Los fajos web abiertos con una entrada esperando, sin aviso, con lo leído. */
export async function fajosWebSinAviso(port, { minutos = ESPERA_MIN, limite = 50 } = {}) {
  const { rows } = await port.query(
    `select f.id, f.plataforma_user_id, f.plataforma_username,
            coalesce((select e.resultado->'leidos' from public.comprobante_entrada e
                       where e.fajo_id = f.id and e.resultado ? 'leidos' limit 1), '[]'::jsonb) as leidos
       from comunicacion.comprobante_fajos f
      where f.plataforma = 'web' and f.estado = 'abierto' and f.aviso_post_id is null
        and f.ultimo_at < now() - ($1 || ' minutes')::interval
        and exists (select 1 from public.comprobante_entrada e where e.fajo_id = f.id and e.estado = 'en_espera')
      order by f.ultimo_at limit $2`, [String(minutos), limite])
  return rows
}

/** Sella el aviso sólo donde todavía no había uno (dos ticks a la vez no duplican). */
export async function sellarFajosWeb(port, ids, sello) {
  await port.query(
    'update comunicacion.comprobante_fajos set aviso_post_id = $2 where id = any($1::uuid[]) and aviso_post_id is null', [ids, sello])
}

/** El destino real: la persona por identidades/email; si no, el dueño. */
export async function destinoReal(port, userId, { directo, porEmail, usernameDueno = process.env.ORQ_DUENO_MM ?? 'jorge' } = {}) {
  const { rows } = await port.query(
    `select u.email, (select i.plataforma_user_id from comunicacion.identidades i
                       where lower(i.email) = lower(u.email) and i.plataforma = 'mattermost' and i.activo limit 1) mm
       from auth.users u where u.id = $1::uuid`, [userId])
  let mm = rows[0]?.mm ?? null
  if (!mm && rows[0]?.email) mm = (await porEmail(rows[0].email))?.id ?? null
  const canal = mm ? await directo(mm) : null
  if (canal) return { canal, quien: 'persona' }
  const d = await port.query(
    `select plataforma_user_id from comunicacion.identidades
      where plataforma = 'mattermost' and lower(plataforma_username) = lower($1) and activo limit 1`, [usernameDueno])
  const canalD = d.rows[0]?.plataforma_user_id ? await directo(d.rows[0].plataforma_user_id) : null
  return canalD ? { canal: canalD, quien: 'dueno' } : null
}

/** Lo que llama el tick del timer. */
export async function cicloAvisoWeb(port, { log = console } = {}) {
  const ef = await import('../../scripts/efectivo-avisos.mjs')
  return avisarFajosWeb({
    log,
    listar: () => fajosWebSinAviso(port),
    destinoDe: (uid) => destinoReal(port, uid, { directo: ef.canalDirectoCon, porEmail: ef.usuarioMattermostPorEmail }),
    enviar: (canal, texto) => ef.publicarYReleer(canal, texto),
    sellar: (ids, sello) => sellarFajosWeb(port, ids.map(String), sello),
  })
}
