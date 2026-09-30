#!/usr/bin/env node
// CONTROL DE FALLAS DE LA APP — lee `public.app_registro` (el registro general, 30/09/2026).
//
//   node orquestador/scripts/control-de-fallas.mjs                 fallas de las últimas 24 h, agrupadas
//   node orquestador/scripts/control-de-fallas.mjs --desde 72h
//   node orquestador/scripts/control-de-fallas.mjs --usuario hys@ecsas.com.ar [--desde 8h]
//                                                                  la línea de tiempo de una persona
//   node orquestador/scripts/control-de-fallas.mjs --digest 3902547586
//   node orquestador/scripts/control-de-fallas.mjs --avisar        (timer horario) DM al dueño SÓLO si
//                                                                  aparece una falla que no avisó antes
//
// Qué cuenta como falla: error de servidor (`onRequestError`), error que vio el navegador (la pantalla
// de error) y respuestas 5xx de la puerta (base caída). Los rechazos 403 se listan aparte: no son fallas
// de código, pero un 403 a alguien que antes entraba es un permiso roto (caso Maldonado, 30/09).
//
// Por qué existe: el 30/09 reconstruir qué vio Maldonado llevó una hora con los logs de Vercel, que no
// tienen identidad y duran minutos. Con `--usuario` es una consulta.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'

const ESTADO = join(homedir(), '.local/state/echegaray/control-de-fallas.json')
const ZONA = 'America/Argentina/San_Juan'

/** `8h`, `3d`, `90m` → intervalo de Postgres. */
export function intervalo(s) {
  const m = /^(\d+)\s*([mhd])$/.exec(String(s ?? '').trim())
  if (!m) throw new Error(`--desde no se entiende: «${s}» (usar 90m, 8h, 3d)`)
  return `${m[1]} ${{ m: 'minutes', h: 'hours', d: 'days' }[m[2]]}`
}

export function leerArgs(argv) {
  const a = { desde: null, usuario: null, digest: null, avisar: false }
  for (let i = 0; i < argv.length; i++) {
    const x = argv[i]
    if (x === '--avisar') a.avisar = true
    else if (x === '--desde') a.desde = argv[++i]
    else if (x === '--usuario') a.usuario = argv[++i]
    else if (x === '--digest') a.digest = argv[++i]
    else throw new Error(`argumento desconocido: ${x}`)
  }
  return a
}

// La firma de un grupo: el digest cuando lo hay (Next lo deriva del error), si no el mensaje sin números
// (ids, montos y líneas cambian de una vez a otra y partirían el mismo error en cien grupos).
const SQL_FIRMA = `coalesce(r.digest, left(regexp_replace(coalesce(r.mensaje, 'estado ' || r.estado), '[0-9a-f]{8}-[0-9a-f-]{27}|\\d+', '#', 'g'), 160))`
const SQL_QUIEN = `coalesce(pe.nombre_completo, p.nombre, u.email, 'sin sesión')`
const JOIN_QUIEN = `left join public.perfiles p on p.id = r.perfil_id
  left join public.personas pe on pe.id = p.persona_id
  left join auth.users u on u.id = r.perfil_id`

export async function grupos(pool, desde) {
  // `primera_vez` mira TODO lo retenido (90 días de errores): «nueva» es una firma que antes no existía,
  // no una que no apareció en la ventana.
  const { rows } = await pool.query(
    `with t as (
       select r.*, ${SQL_FIRMA} as firma, ${SQL_QUIEN} as quien
         from public.app_registro r ${JOIN_QUIEN}
        where r.tipo in ('error_servidor','error_cliente') or r.estado >= 500),
     g as (select firma, tipo, min(en) as primera_vez from t group by 1, 2)
     select t.firma, t.tipo, min(t.en) as primera, max(t.en) as ultima, count(*)::int as veces,
            array_agg(distinct t.quien) as quienes, array_agg(distinct t.ruta) as rutas,
            array_agg(distinct t.despliegue) filter (where t.despliegue is not null) as despliegues,
            (array_agg(t.mensaje order by t.en desc))[1] as mensaje,
            (array_agg(t.digest order by t.en desc))[1] as digest,
            g.primera_vez as vista_por_primera_vez
       from t join g using (firma, tipo)
      where t.en > now() - $1::interval
      group by t.firma, t.tipo, g.primera_vez order by max(t.en) desc`,
    [desde],
  )
  return rows
}

export async function rechazos(pool, desde) {
  const { rows } = await pool.query(
    `select ${SQL_QUIEN} as quien, r.rol, r.ruta, count(*)::int as veces, max(r.en) as ultima
       from public.app_registro r ${JOIN_QUIEN}
      where r.en > now() - $1::interval and r.tipo = 'rechazo'
      group by 1, 2, 3 order by 4 desc limit 20`,
    [desde],
  )
  return rows
}

export async function lineaDeTiempo(pool, quien, desde) {
  const { rows: gente } = await pool.query(
    `select p.id, ${SQL_QUIEN.replaceAll('r.', 'p.')} as quien, p.rol from public.perfiles p
       left join public.personas pe on pe.id = p.persona_id left join auth.users u on u.id = p.id
      where u.email ilike $1 or pe.nombre_completo ilike $2 or p.nombre ilike $2 limit 5`,
    [quien, `%${quien}%`],
  )
  if (gente.length !== 1) return { gente, filas: [] }
  const { rows: filas } = await pool.query(
    `select to_char(r.en at time zone '${ZONA}', 'DD/MM HH24:MI:SS') as hora, r.tipo, r.metodo, r.ruta, r.consulta,
            r.estado, r.destino, r.dispositivo, r.prestada, r.rol, r.digest, r.mensaje, r.despliegue, r.detalle
       from public.app_registro r where r.perfil_id = $1 and r.en > now() - $2::interval order by r.en limit 500`,
    [gente[0].id, desde],
  )
  return { gente, filas }
}

const hora = (d) => new Date(d).toLocaleString('es-AR', { timeZone: ZONA, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

export function textoDeGrupo(g) {
  const nueva = g.vista_por_primera_vez && new Date(g.vista_por_primera_vez) >= new Date(g.primera)
  return [
    `${nueva ? '🆕 ' : ''}${g.tipo === 'error_cliente' ? 'navegador' : g.tipo === 'error_servidor' ? 'servidor' : 'puerta'} · ${g.veces}× · ${hora(g.primera)} → ${hora(g.ultima)}`,
    `   ${String(g.mensaje ?? '(sin mensaje)').slice(0, 220)}`,
    `   pantallas: ${g.rutas.slice(0, 4).join(', ')}${g.rutas.length > 4 ? ` (+${g.rutas.length - 4})` : ''}`,
    `   a quién: ${g.quienes.join(', ')}${g.digest ? ` · digest ${g.digest}` : ''}${g.despliegues?.length ? ` · deploy ${g.despliegues.join(', ')}` : ''}`,
  ].join('\n')
}

export function textoDeFila(f) {
  const que = f.tipo === 'redireccion' ? `→ ${f.destino ?? '?'} (${f.estado})`
    : f.tipo.startsWith('error') ? `✖ ${String(f.mensaje ?? '').slice(0, 160)}${f.digest ? ` [${f.digest}]` : ''}`
    : f.estado ? `${f.estado}` : ''
  const marcas = [f.dispositivo, f.prestada ? 'PRESTADA' : null, f.detalle?.ver_como ? 'ver-como' : null, f.detalle?.accion ? 'acción' : null].filter(Boolean).join(' ')
  return `${f.hora}  ${f.tipo.padEnd(14)} ${(f.metodo ?? '').padEnd(4)} ${f.ruta}${f.consulta ?? ''}  ${que}  (${marcas})`
}

/** Las firmas que ya se avisaron. Se guardan las últimas 500: un error viejo que vuelve se avisa de nuevo. */
function leerAvisadas() {
  try { return JSON.parse(readFileSync(ESTADO, 'utf8')) } catch { return [] }
}
function guardarAvisadas(lista) {
  mkdirSync(dirname(ESTADO), { recursive: true })
  writeFileSync(ESTADO, JSON.stringify(lista.slice(-500)))
}

/** Qué grupos merecen DM: los que no se avisaron antes. Pura. */
export function paraAvisar(gs, avisadas) {
  const ya = new Set(avisadas)
  return gs.filter((g) => !ya.has(`${g.tipo}|${g.firma}`))
}

async function main() {
  const a = leerArgs(process.argv.slice(2))
  await import('../lib/config.mjs')
  const { getPool } = await import('../lib/db.mjs')
  const pool = getPool()
  try {
    if (a.usuario) {
      const { gente, filas } = await lineaDeTiempo(pool, a.usuario, intervalo(a.desde ?? '8h'))
      if (gente.length !== 1) {
        console.log(gente.length ? `«${a.usuario}» coincide con varios:\n${gente.map((g) => `  ${g.quien} (${g.rol})`).join('\n')}` : `nadie coincide con «${a.usuario}»`)
        process.exitCode = 2
        return
      }
      console.log(`${gente[0].quien} · ${gente[0].rol} · ${filas.length} pedidos en ${a.desde ?? '8h'}${filas.length === 500 ? ' (tope 500)' : ''}`)
      for (const f of filas) console.log(textoDeFila(f))
      return
    }
    if (a.digest) {
      const { rows } = await pool.query(
        `select to_char(r.en at time zone '${ZONA}', 'DD/MM HH24:MI:SS') as hora, r.tipo, r.ruta, r.mensaje, r.despliegue, r.detalle, ${SQL_QUIEN} as quien
           from public.app_registro r ${JOIN_QUIEN} where r.digest = $1 order by r.en desc limit 20`, [a.digest])
      for (const f of rows) console.log(`${f.hora} ${f.quien} ${f.tipo} ${f.ruta} · deploy ${f.despliegue ?? '?'}\n  ${f.mensaje}\n  ${JSON.stringify(f.detalle)}`)
      if (!rows.length) { console.log(`sin filas con digest ${a.digest}`); process.exitCode = 2 }
      return
    }
    const desde = intervalo(a.desde ?? (a.avisar ? '2h' : '24h'))
    const gs = await grupos(pool, desde)
    if (a.avisar) {
      const avisadas = leerAvisadas()
      const nuevas = paraAvisar(gs, avisadas)
      if (!nuevas.length) { console.log(`sin fallas nuevas (${gs.length} grupos ya avisados en ${desde})`); return }
      const { avisar } = await import('./avisar-al-dueno.mjs')
      const texto = `**Fallas nuevas en la app** (${nuevas.length})\n\`\`\`\n${nuevas.slice(0, 8).map(textoDeGrupo).join('\n\n')}\n\`\`\`\nDetalle: \`node orquestador/scripts/control-de-fallas.mjs --desde 24h\``
      const r = await avisar(texto)
      guardarAvisadas([...avisadas, ...nuevas.map((g) => `${g.tipo}|${g.firma}`)])
      console.log(r.silenciado ? `NO avisado (avisos apagados): ${nuevas.length} grupos` : `avisado: ${nuevas.length} grupos · post ${r.postId}`)
      return
    }
    const rs = await rechazos(pool, desde)
    const { rows: [vol] } = await pool.query(
      `select count(*)::int as pedidos, count(distinct perfil_id)::int as personas from public.app_registro where en > now() - $1::interval`, [desde])
    console.log(`Registro de la app · ${desde} · ${vol.pedidos} pedidos de ${vol.personas} personas`)
    console.log(gs.length ? `\n${gs.length} fallas agrupadas:\n\n${gs.map(textoDeGrupo).join('\n\n')}` : '\nsin fallas')
    if (rs.length) console.log(`\nRechazos (403/401):\n${rs.map((x) => `  ${x.quien} (${x.rol ?? '?'}) ${x.ruta} ${x.veces}× · ${hora(x.ultima)}`).join('\n')}`)
  } finally {
    await pool.end().catch(() => {})
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((e) => { console.error(`error: ${e.message}`); process.exit(4) })
}
