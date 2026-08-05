#!/usr/bin/env node
// ¿ESTÁ CABLEADO DE VERDAD? — el auditor de las piezas que no son código.
//
// ═══ POR QUÉ EXISTE ═══
//
// La carga de comprobantes y la recepción de archivos son código probado, con 900 tests en verde, y
// durante días no procesaron un solo archivo del dueño. No porque el código estuviera mal: porque
// entre el mensaje y la respuesta hay SEIS piezas que no son código —una migración, una fila de
// binding, un grant, un secreto de entorno, una ruta en Caddy y un servicio corriendo el commit que
// tiene la feature— y cada una falla EN SILENCIO. El canal `comprobantes-gastos` de la configuración
// no existía en Mattermost: los mensajes se caían en el prefiltro y nadie tenía a qué echarle la
// culpa.
//
// "Los tests pasan" no es evidencia de que ande en producción. Esto sí lo es, porque mira el
// sistema vivo: la base real, el entorno real, la API real de Mattermost y la URL pública real.
//
// ═══ QUÉ NO HACE ═══
//
// **NUNCA IMPRIME UN SECRETO**, ni truncado. De un secreto sólo se dice si está o no está.
// No despliega, no reinicia servicios y no toca Caddy: eso lo decide quien tiene la vista del
// conjunto. `--reparar` toca SÓLO datos de configuración en Postgres (el binding del canal y el
// grant), que es lo que se cambia sin desplegar, y es idempotente.
//
// Uso:
//   node orquestador/scripts/auditar-cableado-chat.mjs
//   node orquestador/scripts/auditar-cableado-chat.mjs --reparar
//   node orquestador/scripts/auditar-cableado-chat.mjs --json
//
// Necesita el entorno de comunicación:
//   set -a; . ~/.config/echegaray-orq/comunicacion.env; set +a

import { query, closePool } from '../lib/db.mjs'

const ARGS = new Set(process.argv.slice(2))
const REPARAR = ARGS.has('--reparar')
const JSON_OUT = ARGS.has('--json')

const OK = 'ok'
const FALTA = 'falta'
const NO_VERIFICABLE = 'no_verificable'

const hallazgos = []
const anotar = (pieza, estado, detalle, arreglo = null) => {
  hallazgos.push({ pieza, estado, detalle, arreglo })
  return estado
}

const port = { query }

// ── 1. Las migraciones ───────────────────────────────────────────────────────

async function verTablas() {
  const esperadas = [
    ['comunicacion', 'comprobante_fajos', 'carga de comprobantes por chat'],
    ['comunicacion', 'comprobantes_cargados', 'barrera de duplicados de comprobantes'],
    ['comunicacion', 'archivos_recibidos', 'recepción de archivos por chat'],
    ['comunicacion', 'canales_area', 'binding canal → área'],
    ['comunicacion', 'permisos_skill', 'grants de permiso'],
  ]
  const { rows } = await query(
    `select table_schema, table_name from information_schema.tables where table_schema = 'comunicacion'`)
  const hay = new Set(rows.map((r) => `${r.table_schema}.${r.table_name}`))
  for (const [esq, tab, para] of esperadas) {
    const existe = hay.has(`${esq}.${tab}`)
    anotar(`migración · ${esq}.${tab}`, existe ? OK : FALTA, `${para}${existe ? '' : ' — la tabla NO existe'}`,
      existe ? null : 'aplicar la migración correspondiente de supabase/migrations/')
  }
}

/**
 * LA TABLA VACÍA ES UN HALLAZGO, NO UN DATO NEUTRO. `archivos_recibidos` con 0 filas después de
 * días de estar aplicada significa que el camino NUNCA se ejecutó: o no llega el evento, o el
 * código desplegado no tiene la feature. Es el síntoma más barato de los dos.
 */
async function verUso() {
  for (const [tabla, que] of [['archivos_recibidos', 'archivos recibidos por chat'], ['comprobante_fajos', 'fajos de comprobantes']]) {
    try {
      const { rows } = await query(`select count(*)::int as n, max(creado_at) as ultimo from comunicacion.${tabla}`)
      const n = rows[0]?.n ?? 0
      anotar(`uso · ${tabla}`, n > 0 ? OK : FALTA,
        n > 0 ? `${n} ${que}; el último ${new Date(rows[0].ultimo).toISOString().slice(0, 16).replace('T', ' ')}`
          : `0 filas: este camino NUNCA se ejecutó en producción`,
        n > 0 ? null : 'probar en vivo con orquestador/scripts/probar-archivo-en-vivo.mjs')
    } catch (e) {
      anotar(`uso · ${tabla}`, NO_VERIFICABLE, String(e?.message ?? e).slice(0, 120))
    }
  }
}

// ── 2. El binding de canales ─────────────────────────────────────────────────

const AREAS = [
  { area: 'compras', para: 'la foto del comprobante entra sin mencionar a @os y habilita la carga' },
  { area: 'administracion_finanzas', para: 'el CSV/Excel del banco entra sin mencionar a @os y habilita la importación' },
  { area: 'personas', para: 'la asistencia se registra desde su canal oficial' },
]

async function verBinding() {
  const { rows } = await query(
    `select channel_id, canal_nombre, area_clave, activo from comunicacion.canales_area where plataforma = 'mattermost'`)
  const porArea = new Map()
  for (const r of rows) {
    if (!r.activo) continue
    if (!porArea.has(r.area_clave)) porArea.set(r.area_clave, [])
    porArea.get(r.area_clave).push(r)
  }
  for (const { area, para } of AREAS) {
    const c = porArea.get(area) ?? []
    anotar(`binding · ${area}`, c.length ? OK : FALTA,
      c.length ? c.map((x) => `${x.canal_nombre ?? '?'} (${x.channel_id})`).join(', ') : `sin canal atado — ${para}`,
      c.length ? null : `insert en comunicacion.canales_area para el área ${area} (--reparar lo hace)`)
  }
  return porArea
}

// ── 3. Los grants ────────────────────────────────────────────────────────────

const PERMISOS = [
  { permiso: 'compras.comprobantes.write', para: 'escribir la fila del gasto en la pestaña Compras' },
  { permiso: 'finanzas.banco.import', para: 'importar movimientos del banco (cambia el saldo de CAJA)' },
  { permiso: 'personal.asistencia.write', para: 'registrar asistencia' },
]

async function verPermisos() {
  const { rows } = await query(
    `select permiso, count(*) filter (where activo)::int as n from comunicacion.permisos_skill
      where plataforma = 'mattermost' group by permiso`)
  const n = new Map(rows.map((r) => [r.permiso, r.n]))
  for (const { permiso, para } of PERMISOS) {
    const c = n.get(permiso) ?? 0
    anotar(`grant · ${permiso}`, c > 0 ? OK : FALTA,
      c > 0 ? `${c} persona${c > 1 ? 's' : ''} habilitada${c > 1 ? 's' : ''}` : `nadie lo tiene — ${para}`,
      c > 0 ? null : `insert en comunicacion.permisos_skill (--reparar lo otorga a quienes ya tienen compras.comprobantes.write)`)
  }
}

// ── 4. El entorno ────────────────────────────────────────────────────────────

const SECRETOS = [
  { v: 'MM_BOT_TOKEN', para: 'hablar con Mattermost (fail-closed: sin esto no hay cliente)' },
  { v: 'COMPROBANTES_ACCION_SECRETO', para: 'los botones Confirmar / Corregir / Descartar' },
  { v: 'ARCHIVOS_ACCION_SECRETO', para: 'los botones Importar / Descartar de un extracto bancario' },
]

function verEntorno() {
  for (const { v, para } of SECRETOS) {
    const hay = typeof process.env[v] === 'string' && process.env[v].trim().length > 0
    // Se dice SI ESTÁ, nunca cuánto mide ni cómo empieza. Un secreto truncado en un log sigue siendo
    // un secreto en un log.
    anotar(`entorno · ${v}`, hay ? OK : FALTA, hay ? 'presente' : `ausente — ${para}`,
      hay ? null : `agregar ${v} a ~/.config/echegaray-orq/comunicacion.env Y a asistencia-http.env, y reiniciar los servicios`)
  }
  const canales = (process.env.MM_CANALES_ADJUNTOS ?? '').trim()
  anotar('entorno · MM_CANALES_ADJUNTOS', canales ? OK : FALTA,
    canales || 'sin configurar: sólo entra el binding de la base')
}

// ── 5. Los canales configurados, contra Mattermost de verdad ────────────────
//
// EL DEFECTO QUE ESTO ENCUENTRA: `MM_CANALES_ADJUNTOS=comprobantes-gastos,compras` apuntaba a un
// canal que NO EXISTE. Un canal inexistente en el prefiltro no da error: se traga los mensajes y
// nadie se entera. Se verifica contra la API, que es la única que sabe qué canales hay.

async function mmFetch(ruta) {
  const base = String(process.env.MM_BASE_URL ?? '').replace(/\/+$/, '')
  const tok = process.env.MM_BOT_TOKEN
  if (!base || !tok) return { ok: false, motivo: 'sin MM_BASE_URL o MM_BOT_TOKEN' }
  const r = await fetch(base + ruta, { headers: { Authorization: `Bearer ${tok}` } })
  if (!r.ok) return { ok: false, motivo: `${r.status}` }
  return { ok: true, datos: await r.json() }
}

async function canalesReales() {
  const eq = await mmFetch('/api/v4/users/me/teams')
  if (!eq.ok) return { ok: false, motivo: eq.motivo }
  const bot = process.env.MM_BOT_USER_ID
  const todos = []
  for (const t of eq.datos) {
    const mios = bot ? await mmFetch(`/api/v4/users/${bot}/teams/${t.id}/channels`) : { ok: false }
    if (mios.ok) for (const c of mios.datos) todos.push({ name: c.name, display: c.display_name, id: c.id, type: c.type, bot: true })
  }
  return { ok: true, canales: todos }
}

async function verCanalesConfigurados(porArea) {
  const reales = await canalesReales()
  if (!reales.ok) {
    anotar('canales · existen en Mattermost', NO_VERIFICABLE, `no pude consultar la API: ${reales.motivo}`)
    return null
  }
  const porId = new Map(reales.canales.map((c) => [c.id.toLowerCase(), c]))
  const porNombre = new Map(reales.canales.map((c) => [c.name.toLowerCase(), c]))

  // 5a. Cada entrada de MM_CANALES_ADJUNTOS tiene que existir Y el bot tiene que ser miembro.
  const cfg = String(process.env.MM_CANALES_ADJUNTOS ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
  for (const e of cfg) {
    const c = porId.get(e) ?? porNombre.get(e)
    anotar(`canal de ingesta · ${e}`, c ? OK : FALTA,
      c ? `${c.display} (${c.name} · ${c.id})` : 'NO EXISTE en Mattermost, o el bot no es miembro: los mensajes se pierden en silencio',
      c ? null : 'corregir MM_CANALES_ADJUNTOS, o invitar al bot al canal')
  }

  // 5b. Cada canal atado a un área tiene que existir de verdad.
  for (const [area, filas] of porArea ?? []) {
    for (const f of filas) {
      const c = porId.get(String(f.channel_id).toLowerCase())
      anotar(`binding vivo · ${area}/${f.canal_nombre ?? f.channel_id}`, c ? OK : FALTA,
        c ? `${c.display} (${c.name})` : 'el canal atado no existe o el bot no es miembro',
        c ? null : 'corregir la fila de comunicacion.canales_area, o invitar al bot al canal')
    }
  }
  return reales.canales
}

// ── 6. Las rutas públicas de los botones ────────────────────────────────────
//
// Un botón que no llega a ninguna parte es el peor modo de falla: Mattermost muestra "no encontramos
// la página" y el pedido NUNCA llega al OS, así que tampoco deja rastro en nuestros logs. Se prueba
// con un POST vacío: la respuesta correcta es el 200 del servicio diciendo que no puede verificar el
// origen. Un 404 significa que Caddy no publica la ruta o que el proceso desplegado no la monta.

async function verRutas() {
  const rutas = [
    { url: process.env.COMPROBANTES_ACCION_URL || 'https://chat.ecsas.com.ar/comprobantes/accion', que: 'botones de comprobantes' },
    { url: process.env.ARCHIVOS_ACCION_URL || 'https://chat.ecsas.com.ar/archivos/accion', que: 'botones de archivos' },
  ]
  for (const { url, que } of rutas) {
    // La URL puede traer el secreto en `?t=`: se recorta antes de imprimir NADA.
    const limpia = url.split('?')[0]
    try {
      const r = await fetch(limpia, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
      const cuerpo = (await r.text()).slice(0, 120)
      const viva = r.status !== 404
      anotar(`ruta pública · ${limpia}`, viva ? OK : FALTA,
        viva ? `${r.status} — la atiende el OS (${que})` : '404: Caddy no publica la ruta, o el proceso desplegado no la monta',
        viva ? null : 'agregar el bloque a infra/mattermost/caddy/Caddyfile del checkout que Caddy montea, recargar Caddy, y desplegar el commit que monta la ruta')
      if (!viva && cuerpo) hallazgos[hallazgos.length - 1].detalle += ` · cuerpo: ${cuerpo}`
    } catch (e) {
      anotar(`ruta pública · ${limpia}`, NO_VERIFICABLE, String(e?.message ?? e).slice(0, 120))
    }
  }
}

// ── Reparación: SÓLO datos de configuración en Postgres ─────────────────────

/**
 * Ata un canal a un área. El channel_id se RESUELVE contra la API por nombre: escribir un id a mano
 * en un script es exactamente cómo se llegó al canal que no existía.
 */
async function repararBinding(canales) {
  const quiero = [
    { area: 'administracion_finanzas', nombre: 'administracion' },
  ]
  for (const { area, nombre } of quiero) {
    const ya = await query('select 1 from comunicacion.canales_area where plataforma = $1 and area_clave = $2 and activo', ['mattermost', area])
    if (ya.rows.length) { console.log(`  · ${area}: ya tenía canal atado, no toco nada`); continue }
    const c = (canales ?? []).find((x) => x.name.toLowerCase() === nombre)
    if (!c) { console.log(`  ✗ ${area}: no encontré el canal "${nombre}" en Mattermost (o el bot no es miembro); NO invento un id`); continue }
    await query(
      `insert into comunicacion.canales_area (plataforma, channel_id, canal_nombre, area_clave, activo)
       values ('mattermost', $1, $2, $3, true)
       on conflict (plataforma, channel_id) do update set area_clave = excluded.area_clave, activo = true`,
      [c.id, c.display ?? c.name, area])
    console.log(`  ✓ ${area} → ${c.display} (${c.name} · ${c.id})`)
  }
}

/**
 * Otorga `finanzas.banco.import` SÓLO al dueño.
 *
 * ═══ POR QUÉ NO SE COPIA LA LISTA DE COMPROBANTES ═══
 *
 * Es la tentación obvia —ya hay cuatro personas habilitadas para cargar gastos— y es un error de
 * escala. Cargar un comprobante agrega una fila de gasto; importar movimientos del banco REESCRIBE
 * EL SALDO, y de ahí cuelgan por fórmula CAJA, el impuesto al cheque, los costos bancarios y el
 * cruce de Cheques. Un jefe de obra que puede sacarle la foto a una factura no tiene por qué poder
 * mover la posición de caja de la empresa. Dos permisos distintos son dos permisos distintos.
 *
 * El user_id se RESUELVE por username contra la API: escribir un id de Mattermost adentro de un
 * script es la misma clase de error que el canal que no existía.
 *
 * Se puede ampliar en cualquier momento con `ORQ_BANCO_IMPORT_USUARIOS=jorge,otro`, que es una
 * decisión del dueño y no de este script.
 */
async function repararGrants() {
  const quienes = String(process.env.ORQ_BANCO_IMPORT_USUARIOS ?? 'jorge')
    .split(',').map((s) => s.trim()).filter(Boolean)
  for (const username of quienes) {
    const u = await mmFetch(`/api/v4/users/username/${encodeURIComponent(username)}`)
    if (!u.ok) { console.log(`  ✗ finanzas.banco.import: no pude resolver @${username} (${u.motivo}); NO invento un user_id`); continue }
    await query(
      `insert into comunicacion.permisos_skill (plataforma, plataforma_user_id, permiso, display, activo, otorgado_por)
       values ('mattermost', $1, 'finanzas.banco.import', $2, true, 'auditar-cableado-chat')
       on conflict (plataforma, plataforma_user_id, permiso) do update set activo = true`,
      [u.datos.id, u.datos.username])
    console.log(`  ✓ finanzas.banco.import → @${u.datos.username}`)
  }
  console.log('  ℹ los jefes de obra NO lo reciben: cargar un gasto y reescribir el saldo del banco no son el mismo permiso')
}

// ── Salida ───────────────────────────────────────────────────────────────────

const ICONO = { [OK]: '✓', [FALTA]: '✗', [NO_VERIFICABLE]: '?' }

function imprimir() {
  if (JSON_OUT) { console.log(JSON.stringify({ hallazgos }, null, 2)); return }
  console.log('\n═══ CABLEADO DEL CHAT — lo que no es código ═══\n')
  for (const h of hallazgos) {
    console.log(`  ${ICONO[h.estado]} ${h.pieza}`)
    console.log(`      ${h.detalle}`)
    if (h.arreglo) console.log(`      → ${h.arreglo}`)
  }
  const faltan = hallazgos.filter((h) => h.estado === FALTA)
  const dudosos = hallazgos.filter((h) => h.estado === NO_VERIFICABLE)
  console.log(`\n  ${hallazgos.length - faltan.length - dudosos.length} en pie · ${faltan.length} FALTAN · ${dudosos.length} no verificables\n`)
  if (faltan.length) {
    console.log('  MIENTRAS FALTE ALGUNA DE ESTAS, EL CAMINO NO ESTÁ CERRADO EN PRODUCCIÓN:')
    for (const h of faltan) console.log(`    ✗ ${h.pieza}`)
    console.log('')
  }
}

async function main() {
  await verTablas()
  await verUso()
  const porArea = await verBinding()
  await verPermisos()
  verEntorno()
  const canales = await verCanalesConfigurados(porArea)
  await verRutas()

  if (REPARAR) {
    console.log('\n═══ REPARANDO (sólo datos de configuración en Postgres) ═══\n')
    await repararBinding(canales)
    await repararGrants()
    console.log('\n  Volvé a correr sin --reparar para ver el estado final.')
  }
  imprimir()
  process.exitCode = hallazgos.some((h) => h.estado === FALTA) ? 1 : 0
}

main()
  .catch((e) => { console.error('auditar-cableado-chat: ', e?.message ?? e); process.exitCode = 2 })
  .finally(() => closePool().catch(() => {}))
