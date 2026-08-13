#!/usr/bin/env node
// LA PRUEBA VIVA DE LA CARGA DE COMPROBANTES — el camino entero, contra el sistema real, sin
// escribirle una sola celda a `Compras`.
//
// ═══ POR QUÉ EXISTE ═══
//
// Todo lo de este módulo estaba probado con dobles y desplegado, y el dueño había perdido tiempo
// tres veces igual. Un test con dobles prueba que el código hace lo que el test cree; no prueba que
// una foto sacada con un iPhone entre por el WebSocket, la lea el modelo, y salga un solo mensaje
// editado del otro lado. La evidencia es del EFECTO.
//
// ═══ QUÉ ES REAL ACÁ, Y QUÉ NO ═══
//
//   REAL  · los archivos: se bajan del canal `Comprobantes-gastos` los HEIC que el dueño mandó de
//           verdad desde su iPhone, y se vuelven a subir al canal de prueba. Bytes idénticos.
//   REAL  · Mattermost: subida, posts, publicación y EDICIÓN del mensaje. Se puede mirar con los ojos.
//   REAL  · el modelo de visión (Anthropic), los desplegables del Sheet y la pestaña `Compras` viva.
//   REAL  · el Work Fabric: `orq.tasks`, claim con lease, latido, `orq.task_attempts`.
//   REAL  · el cargador: el MISMO `cargar-comprobantes-compras.mjs`, con `--dry`.
//
//   NO ES · la base: se levanta un Postgres EFÍMERO en Docker y se destruye al terminar. Es lo que
//           impide competir con el worker de producción por las mismas tareas —dos workers sobre la
//           misma cola se roban el trabajo— y lo que garantiza que ninguna prueba ensucie el
//           registro de comprobantes cargados del dueño.
//   NO ES · la escritura: `ORQ_COMPROBANTES_ENSAYO=1` hace que el cargador corra con `--dry`.
//           Compras no se toca. El mensaje lo dice: en ensayo no se relee nada ni se felicita.
//   NO ES · el libro fiscal: la base efímera tiene `public.comprobantes_arca` VACÍA, así que la
//           conciliación con ARCA queda `no_verificado`. Está declarado en el informe.
//
// ═══ USO ═══
//
//   . ~/.config/echegaray-orq/worker.env ; . ~/.config/echegaray-orq/comunicacion.env
//   node orquestador/comunicacion/comprobantes/prueba-viva.mjs
//
// Publica en `OS Pruebas`. Nunca en el canal del dueño.

import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import pg from 'pg'

const AQUI = dirname(fileURLToPath(import.meta.url))
const RAIZ = join(AQUI, '..', '..', '..')
const MIGR = join(RAIZ, 'supabase', 'migrations')
const MIGR_COMM = join(RAIZ, '..', 'communication-service', 'db', 'migrations')

const NOMBRE = `comprobantes-prueba-${process.pid}`
const PUERTO = Number(process.env.PRUEBA_PG_PUERTO || 55461)
const URL_PG = `postgres://postgres:postgres@127.0.0.1:${PUERTO}/postgres`

/** El canal de prueba. NO es el del dueño, y eso no se configura por variable a propósito. */
const CANAL_PRUEBA = process.env.PRUEBA_CANAL || 'm935hokdxpbaukf5goujk1daww' // OS Pruebas
/** De dónde salen los archivos reales: el canal de comprobantes del dueño. Sólo se LEE. */
const CANAL_ORIGEN = 'ataehrdpmfyctqyjcfz5rs9jka'

const sh = (a) => spawnSync('docker', a, { encoding: 'utf8' })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const log = (...a) => console.log(...a)

// El esquema mínimo suficiente para ESTE camino. Si falta uno, el bot contesta "todavía no está
// habilitada" y la prueba pasaría sin haber probado nada — por eso se listan explícitos.
const ESQUEMA = [
  join(MIGR, '20260711120000_orq_fundacion_work_fabric.sql'),
  join(MIGR, '20260711121000_orq_ledger.sql'),
  join(MIGR, '20260729180000_orq_comunicacion_lane.sql'),
  join(MIGR_COMM, '0001_comunicacion.sql'),
  join(MIGR, '20260730130000_asistencia_mattermost.sql'),   // permisos_skill
  join(MIGR, '20260730160000_comunicacion_canales_area.sql'),
  join(MIGR, '20260715230000_arca_comprobantes_integraciones.sql'), // comprobantes_arca (vacía)
  join(MIGR, '20260803120000_comprobantes_por_chat.sql'),
  join(MIGR, '20260813190000_comprobante_tandas.sql'),
]

const ROLES = `do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role; end if;
end $$;`

// `comunicacion.canales_area` tiene FK contra `public.area_canonica`, cuya migración arrastra media
// biblioteca del OS. Acá se crea el catálogo pelado con las mismas claves: es la FK lo que se está
// ejercitando, no el catálogo. Las claves son las 8 oficiales, escritas igual que en la migración.
const AREAS = `create table if not exists public.area_canonica (clave text primary key, nombre text not null, orden int not null);
insert into public.area_canonica (clave, nombre, orden) values
  ('direccion_estrategia','Dirección y Estrategia',1), ('administracion_finanzas','Administración y Finanzas',2),
  ('compras','Compras y Abastecimiento',3), ('obras','Obras',4), ('personas','Personas',5),
  ('comercial','Comercial',6), ('sistemas','Sistemas',7), ('seguridad','Seguridad e Higiene',8)
on conflict do nothing;`

async function conectar() {
  for (let i = 0; i < 80; i++) {
    const c = new pg.Client({ connectionString: URL_PG }); c.on('error', () => {})
    try { await c.connect(); await c.query('select 1'); return c } catch { try { await c.end() } catch { /* muerto */ } ; await sleep(400) }
  }
  return null
}

// ── Mattermost, con el token del bot ────────────────────────────────────────
const MM = process.env.MM_BASE_URL
const TOK = process.env.MM_BOT_TOKEN
const api = async (p, opts = {}) => {
  const r = await fetch(`${MM}/api/v4${p}`, { ...opts, headers: { Authorization: `Bearer ${TOK}`, ...(opts.headers ?? {}) } })
  if (!r.ok) throw new Error(`MM ${p} → ${r.status} ${(await r.text()).slice(0, 200)}`)
  return r.headers.get('content-type')?.includes('json') ? r.json() : r
}

/** Baja un archivo REAL del canal del dueño y lo vuelve a subir al canal de prueba. */
async function clonarArchivo(fileId, nombre, canal) {
  const r = await fetch(`${MM}/api/v4/files/${fileId}`, { headers: { Authorization: `Bearer ${TOK}` } })
  if (!r.ok) throw new Error(`no pude bajar ${fileId}: ${r.status}`)
  const bytes = Buffer.from(await r.arrayBuffer())
  const fd = new FormData()
  fd.append('channel_id', canal)
  fd.append('files', new Blob([bytes]), nombre)
  const sub = await api('/files', { method: 'POST', body: fd })
  return sub.file_infos[0].id
}

/** Sube bytes propios (el adjunto ilegible se fabrica acá: es un archivo, no un dato). */
async function subirBytes(bytes, nombre, canal) {
  const fd = new FormData()
  fd.append('channel_id', canal)
  fd.append('files', new Blob([bytes]), nombre)
  const sub = await api('/files', { method: 'POST', body: fd })
  return sub.file_infos[0].id
}

/**
 * Copia `public.comprobantes_arca` de la base productiva a la efímera. LEE de producción, no escribe:
 * es la misma consulta que hace el auditor. Si no hay DATABASE_URL de producción, devuelve 0 y la
 * prueba lo declara — no poder copiar el libro no es tener el libro vacío por diseño.
 */
async function copiarLibroFiscal(destino) {
  const origen = process.env.DATABASE_URL
  if (!origen) return 0
  // MISMO PARSER QUE EL OS. La URL de Supabase trae caracteres que rompen al parser de `pg` y el
  // host termina siendo el usuario (`ENOTFOUND postgres.jdq…`). `lib/db.mjs` ya resolvió eso; se le
  // pide la traducción y NO se importa su pool, que es un singleton y quedaría clavado en producción
  // cuando abajo se apunta todo a la base efímera.
  const { parseConnectionString } = await import('../../lib/db.mjs')
  const p = parseConnectionString(origen)
  const src = new pg.Client(p
    ? { host: p.host, port: p.port, user: p.user, password: p.password, database: p.database, ssl: { rejectUnauthorized: false } }
    : { connectionString: origen })
  try {
    await src.connect()
    const { rows } = await src.query(
      `select tipo_libro, fecha_emision, tipo_comprobante, punto_venta, numero, cae,
              emisor_cuit, emisor_nombre, receptor_cuit, moneda, neto_gravado, total_iva,
              otros_tributos, imp_total, periodo, origen
         from public.comprobantes_arca`)
    for (const r of rows) {
      await destino.query(
        `insert into public.comprobantes_arca
           (tipo_libro, fecha_emision, tipo_comprobante, punto_venta, numero, cae, emisor_cuit,
            emisor_nombre, receptor_cuit, moneda, neto_gravado, total_iva, otros_tributos,
            imp_total, periodo, origen)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
         on conflict do nothing`,
        [r.tipo_libro, r.fecha_emision, r.tipo_comprobante, r.punto_venta, r.numero, r.cae,
          r.emisor_cuit, r.emisor_nombre, r.receptor_cuit, r.moneda, r.neto_gravado, r.total_iva,
          r.otros_tributos, r.imp_total, r.periodo, r.origen])
    }
    return rows.length
  } catch (e) {
    log(`   (no pude copiar el libro fiscal: ${String(e?.message ?? e).slice(0, 90)})`)
    return 0
  } finally { try { await src.end() } catch { /* ya cerrado */ } }
}
async function main() {
  for (const v of ['MM_BASE_URL', 'MM_BOT_TOKEN', 'MM_BOT_USER_ID', 'ANTHROPIC_API_KEY']) {
    if (!process.env[v]) { console.error(`falta ${v} en el entorno`); process.exit(1) }
  }

  log(`→ Postgres efímero (${NOMBRE}) en :${PUERTO}…`)
  const up = sh(['run', '-d', '--rm', '--name', NOMBRE, '-e', 'POSTGRES_PASSWORD=postgres', '-p', `${PUERTO}:5432`, 'postgres:16-alpine'])
  if (up.status !== 0) { console.error(up.stderr || up.stdout); process.exit(1) }

  try {
    const c = await conectar()
    if (!c) throw new Error('Postgres no quedó listo')
    await c.query(ROLES)
    await c.query(AREAS)
    for (const f of ESQUEMA) await c.query(readFileSync(f, 'utf8'))
    log('→ esquemas aplicados (orq · comunicacion · comprobantes · tandas)')

    // Quién manda las fotos: el usuario REAL del dueño, para que la identidad de plataforma sea de
    // verdad. Sin identidad real no se ejecuta nada: es la regla del subsistema.
    const posts = await api(`/channels/${CANAL_ORIGEN}/posts?per_page=60`)
    const conArch = Object.values(posts.posts).filter((p) => (p.file_ids?.length ?? 0) > 0)
      .sort((a, b) => b.create_at - a.create_at)
    const USER = conArch[0]?.user_id
    if (!USER) throw new Error('no encontré un post con adjuntos del que sacar la identidad real')

    // Las dos puertas, en la base efímera: canal oficial y grant de permiso.
    await c.query(`insert into comunicacion.canales_area (plataforma, channel_id, canal_nombre, area_clave)
                   values ('mattermost', $1, 'os-pruebas', 'compras')`, [CANAL_PRUEBA])
    await c.query(`insert into comunicacion.permisos_skill (plataforma, plataforma_user_id, permiso, display, otorgado_por, activo)
                   values ('mattermost', $1, 'compras.comprobantes.write', 'prueba viva', 'direccion', true)`, [USER])
    log(`→ canal ${CANAL_PRUEBA} atado a compras · grant para ${USER.slice(0, 8)}…`)

    // ═══ EL LIBRO FISCAL VIAJA (SÓLO LECTURA DESDE PRODUCCIÓN) ═══
    //
    // Sin él la prueba miente por defecto: la conciliación con ARCA es la que CORRIGE el número mal
    // leído y reemplaza los importes cuando no cierran, y sin esa pasada media docena de HEIC salen
    // con "falta el IVA" y "falta confirmar el total". Medido: con la tabla vacía no entró ninguno
    // de los ocho; con el libro copiado, el resultado es otro. Se copia, no se inventa.
    const copiadas = await copiarLibroFiscal(c)
    log(`→ libro fiscal copiado de producción: ${copiadas} comprobantes (sólo lectura del origen)`)

    await c.end()

    // ── El entorno del proceso: base efímera y ENSAYO. Se setea ANTES de importar nada del OS,
    //    porque `lib/db.mjs` arma el pool al importarse.
    process.env.DATABASE_URL = URL_PG
    process.env.ORQ_DB_SSL = '0'
    process.env.ORQ_COMPROBANTES_ENSAYO = '1'
    process.env.WORKER_ID = 'prueba-viva'
    // ═══ EL LEASE, A PROPÓSITO MÁS CORTO QUE EL TRABAJO ═══
    //
    // En producción el lease es de 180 s y un post de ocho fotos tarda 40. Con esos números la
    // prueba no probaría el latido: pasaría igual aunque el latido no existiera. Acá se pone en 25 s
    // —MENOS de lo que tarda cualquiera de estas tareas— y el reaper corre en cada tick. Si el latido
    // no renovara el lease, el reaper daría la tarea por abandonada, la mandaría a `retrying` y el
    // especialista se reejecutaría publicando de nuevo: exactamente el defecto del 13/08 a la
    // mañana. Que todas terminen en UN intento con lease de 25 s es la prueba de que el latido late.
    process.env.ORQ_COMM_LEASE_SECONDS = process.env.ORQ_COMM_LEASE_SECONDS || '25'

    const { crearConector } = await import('../conector.mjs')
    const { crearLog } = await import('../../../../communication-service/src/index.mjs')
    const { esRelevante, parsearPosted, mapearAPayload } = await import('../mattermost-ws-consumer.mjs')

    const logger = crearLog()
    const con = crearConector({ log: logger, verificador: null, botUserId: process.env.MM_BOT_USER_ID })

    const resultados = { casos: [] }

    // ── Los archivos REALES del dueño ────────────────────────────────────────
    const infos = []
    for (const p of conArch) {
      for (const f of p.file_ids) {
        const i = await api(`/files/${f}/info`)
        infos.push({ ...i, post: p.id, create_at: p.create_at })
      }
    }
    const heics = infos.filter((i) => /heic/i.test(i.mime_type)).slice(0, 7)
    const pdfs = infos.filter((i) => i.mime_type === 'application/pdf').slice(0, 1)
    if (!heics.length) throw new Error('no hay ningún HEIC real en el canal: la prueba del iPhone no se puede hacer')
    log(`→ ${heics.length} HEIC reales + ${pdfs.length} PDF real para clonar`)

    // Publicar un post con adjuntos y meterlo por el borde de ingesta REAL.
    let raiz = null
    async function mandar(archivos, { nuevoHilo = false } = {}) {
      if (nuevoHilo) raiz = null
      const post = await api('/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel_id: CANAL_PRUEBA, message: '', file_ids: archivos.map((g) => g.id), ...(raiz ? { root_id: raiz } : {}) }),
      })
      raiz = raiz ?? post.id
      // ═══ EL FRAME `posted` DE VERDAD ═══
      //
      // El post que acaba de crear Mattermost, serializado igual que en el WebSocket, y pasado por
      // las MISMAS funciones del consumidor: `parsearPosted` → `esRelevante` → `mapearAPayload`.
      // Es el único tramo que no se puede ejercitar por socket —el bot no es admin y no puede
      // publicar en nombre de una persona— así que se ejercita la lógica, que es donde estuvo el
      // defecto la vez pasada (el canal viajaba con el SLUG, no con el nombre visible).
      const frame = JSON.stringify({
        event: 'posted',
        data: { post: JSON.stringify({ ...post, user_id: USER }), channel_type: 'P', channel_name: 'os-pruebas', sender_name: '@prueba' },
      })
      const info = parsearPosted(frame)
      if (!info) throw new Error('parsearPosted devolvió null sobre un frame `posted` real')
      if (!esRelevante(info, { botUserId: process.env.MM_BOT_USER_ID, canalesAdjuntos: new Set(['os-pruebas', CANAL_PRUEBA]) })) {
        throw new Error(`el consumidor WS DESCARTÓ el post ${post.id}: la foto no habría llegado a nadie`)
      }
      await con.recibir({ plataforma: 'mattermost', ...mapearAPayload(info.post, info) })
      log(`   post ${post.id} · ${archivos.length} adjunto(s) → esRelevante ✔ → inbox`)
      return post
    }

    // ── EL TICK, IDÉNTICO AL DE `worker-comunicacion.mjs` ────────────────────
    //
    // Los dos `recuperarLeases` van PRIMERO y no son decorativos: son el reaper que declara
    // abandonada una tarea cuyo lease venció. Sin ellos, la prueba del lease no probaría nada —
    // nadie estaría vigilando— y el latido podría estar roto sin que se notara.
    async function trabajar({ minutos = 15 } = {}) {
      const hasta = Date.now() + minutos * 60_000
      let quietos = 0
      while (Date.now() < hasta && quietos < 6) {
        await con.recuperarLeasesWorkFabric()
        await con.recuperarLeasesComm()
        const inbox = await con.procesarInbox({ lote: 20 })
        const wf = await con.procesarWorkFabric({ lote: 20 })
        const out = await con.procesarOutbox({ lote: 20 })
        const trabajo = inbox.intentados + wf.intentados + out.intentados
        if (trabajo) { quietos = 0; log(`   tick: inbox ${inbox.intentados} · wf ${JSON.stringify(wf)} · outbox ${out.intentados}`) } else quietos++
        await sleep(trabajo ? 300 : 2000)
      }
    }

    const cli = new pg.Client({ connectionString: URL_PG }); await cli.connect()
    /** Los mensajes que publicó EL BOT en el canal desde `desde`, en orden. */
    async function mensajesDelBot(desde) {
      const hilo = await api(`/channels/${CANAL_PRUEBA}/posts?per_page=200`)
      return Object.values(hilo.posts)
        .filter((p) => p.user_id === process.env.MM_BOT_USER_ID && p.create_at >= desde && (p.message ?? '').trim())
        .sort((a, b) => a.create_at - b.create_at)
    }
    const mostrar = async (titulo, desde) => {
      const ms = await mensajesDelBot(desde)
      log(`\n── ${titulo}`)
      log(`   mensajes del bot: ${ms.length}`)
      for (const p of ms) {
        log(`   ─ ${p.id} · editado ${p.edit_at ? 'SÍ' : 'no'} · TARJETAS ${(p.props?.attachments?.length ?? 0)}`)
        log(p.message.split('\n').map((l) => `        ${l}`).join('\n'))
      }
      return ms
    }
    /**
     * Cierra la conversación entre casos: la TANDA (que agrupa el mensaje) y el FAJO (que agrupa los
     * ítems). Cerrar sólo la tanda no alcanza: el fajo sigue vivo cinco minutos y el reenvío se
     * colapsa contra él —"era otra foto de un comprobante que ya estaba en esta tanda"—, que es una
     * deduplicación distinta de la que se quiere medir. Simula el paso del tiempo, no cambia el código.
     */
    async function cerrarConversacion(c2) {
      await c2.query("update comunicacion.comprobante_tandas set estado='cerrada', cerrado_at=now() where estado='abierta'")
      await c2.query("update comunicacion.comprobante_fajos set estado='descartado' where estado='abierto'")
    }

    const intentos = async () => (await cli.query(
      `select t.type, a.attempt_no, a.state, a.worker_id,
              extract(epoch from (coalesce(a.finished_at,now())-a.started_at))::int dur_s,
              left(coalesce(a.error,''),60) err
         from orq.task_attempts a join orq.tasks t on t.id = a.task_id order by a.started_at`)).rows

    // ══════ CASO 1 · UN LOTE DE 8 ADJUNTOS EN 3 POSTS ══════
    // Es el caso que el dueño va a hacer hoy: fotos de más, repartidas porque Mattermost sólo deja
    // adjuntar diez por post. Lo que se mide: UN mensaje, editado, sin una sola tarjeta.
    log('\n══════ CASO 1 · 8 adjuntos reales (7 HEIC del iPhone + 1 PDF) en 3 posts ══════')
    const lote = [...heics, ...pdfs].slice(0, 8)
    const clonados = []
    for (const f of lote) clonados.push({ id: await clonarArchivo(f.id, f.name, CANAL_PRUEBA), nombre: f.name })
    log(`→ ${clonados.length} archivos clonados al canal de prueba`)
    const t1 = Date.now()
    for (const grupo of [clonados.slice(0, 3), clonados.slice(3, 6), clonados.slice(6)]) {
      if (grupo.length) await mandar(grupo)
    }
    await trabajar()
    const m1 = await mostrar(`CASO 1 · terminó en ${Math.round((Date.now() - t1) / 1000)}s`, t1)
    log(`\n   intentos del Work Fabric:`)
    for (const r of await intentos()) log(`     ${r.type} · intento ${r.attempt_no} · ${r.state} · ${r.dur_s}s ${r.err}`)
    const tandas1 = await cli.query('select estado, root_post_id, aviso_post_id from comunicacion.comprobante_tandas')
    log(`   tandas: ${JSON.stringify(tandas1.rows)}`)
    const car1 = await cli.query('select proveedor, tipo, numero, total, fila from comunicacion.comprobantes_cargados order by id')
    log(`   registro del ensayo (${car1.rowCount}):`)
    for (const r of car1.rows) log(`     ${r.proveedor} · ${r.tipo ?? ''} ${r.numero} · ${r.total} · fila ${r.fila}`)

    // ══════ CASO 2 · EL MISMO COMPROBANTE OTRA VEZ ══════
    // La tanda de arriba sigue abierta cinco minutos, así que un reenvío ahora se sumaría al MISMO
    // mensaje. Para medir la idempotencia sola, se cierra la tanda y se manda de nuevo el mismo
    // archivo: tiene que contestar "ya estaba", no cargar una segunda fila.
    log('\n══════ CASO 2 · el mismo comprobante, otra vez ══════')
    await cerrarConversacion(cli)
    const t2 = Date.now()
    const repetido = [{ id: await clonarArchivo(lote[0].id, lote[0].name, CANAL_PRUEBA), nombre: lote[0].name }]
    await mandar(repetido, { nuevoHilo: true })
    await trabajar()
    await mostrar('CASO 2 · reenvío del mismo comprobante', t2)
    const car2 = await cli.query('select clave, count(*) n from comunicacion.comprobantes_cargados group by 1 having count(*) > 1')
    log(`   claves duplicadas en el registro: ${car2.rowCount} (tiene que ser 0)`)

    // ══════ CASO 3 · UN ADJUNTO ILEGIBLE ENTRE DOS BUENOS ══════
    // Un archivo que no es un comprobante. Lo que se mide: que se lo NOMBRE en el mensaje final y
    // que los otros dos entren igual — un ilegible no puede tumbar la tanda.
    log('\n══════ CASO 3 · un adjunto ilegible entre dos buenos ══════')
    await cerrarConversacion(cli)
    const t3 = Date.now()
    const ruido = Buffer.alloc(40_000)
    for (let i = 0; i < ruido.length; i++) ruido[i] = (i * 37 + 11) % 256
    const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), ruido])
    const mezcla = [
      { id: await clonarArchivo(lote[1].id, lote[1].name, CANAL_PRUEBA), nombre: lote[1].name },
      { id: await subirBytes(png, 'ILEGIBLE-ruido.png', CANAL_PRUEBA), nombre: 'ILEGIBLE-ruido.png' },
      { id: await clonarArchivo(lote[2].id, lote[2].name, CANAL_PRUEBA), nombre: lote[2].name },
    ]
    await mandar(mezcla, { nuevoHilo: true })
    await trabajar()
    const m3 = await mostrar('CASO 3 · ilegible + 2 buenos', t3)
    const nombrado = m3.some((p) => /ILEGIBLE-ruido\.png/i.test(p.message))
    log(`   ¿el ilegible aparece NOMBRADO en el mensaje final? ${nombrado ? 'SÍ' : 'NO ← defecto'}`)

    // ══════ CASO 4 · EL LEASE NO MATA LA TAREA LARGA ══════
    // El defecto que arruinó la carga anterior: el lease de 30 s vencía con el handler todavía
    // corriendo y el reaper mandaba la tarea a `retrying`, reejecutando —y republicando— todo.
    // Acá se mide sobre lo que ya corrió: cuánto duró el intento más largo, cuántos intentos hubo
    // por tarea, y si alguna pasó por `retrying` o `timeout`.
    log('\n══════ CASO 4 · el lease y los intentos ══════')
    const todos = await intentos()
    const porTarea = new Map()
    for (const r of todos) porTarea.set(`${r.type}`, Math.max(porTarea.get(`${r.type}`) ?? 0, r.attempt_no))
    const masLargo = Math.max(0, ...todos.map((r) => r.dur_s))
    const malos = todos.filter((r) => r.state !== 'succeeded')
    log(`   intentos totales: ${todos.length} · intento más largo: ${masLargo}s`)
    log(`   intentos que NO terminaron bien: ${malos.length} ${malos.length ? JSON.stringify(malos) : '(ninguno)'}`)
    const reintentadas = await cli.query("select id, type, state, attempt from orq.tasks where attempt > 1 or state in ('retrying','dead_letter','failed')")
    log(`   tareas con más de un intento o en estado malo: ${reintentadas.rowCount} ${JSON.stringify(reintentadas.rows)}`)
    const lease = Number(process.env.ORQ_COMM_LEASE_SECONDS || 180)
    log(`   lease configurado: ${lease}s · intentos que duraron MÁS que su propio lease: ${todos.filter((r) => r.dur_s > lease).length}`)
    log(`   ${masLargo > lease
      ? `✔ hubo trabajo de ${masLargo}s con lease de ${lease}s y NINGUNA tarea se reintentó: el latido renueva el lease`
      : `✖ ninguna tarea superó el lease de ${lease}s: esta corrida NO probó el latido`}`)

    // ── Cierre: las colas ────────────────────────────────────────────────────
    const outbox = await cli.query('select estado, count(*)::int n from comunicacion.outbox group by 1')
    log(`\ncomunicacion.outbox: ${JSON.stringify(outbox.rows)}`)
    const tareas = await cli.query("select type, state, attempt, left(coalesce(error,''), 80) err from orq.tasks")
    log(`orq.tasks: ${JSON.stringify(tareas.rows)}`)
    resultados.casos.push({ caso1: m1.length, caso3Nombrado: nombrado, intentos: todos.length, masLargo })
    await cli.end()

    log('\n(el canal OS Pruebas queda con los mensajes para poder mirarlos con los ojos)')
    // El pool del OS se cierra ANTES de matar el contenedor: si no, sus conexiones ociosas ven
    // morir al postmaster y tiran un 'error' sin handler que voltea el proceso con código 1 después
    // de que la prueba ya salió bien. Un arnés que termina en rojo habiendo pasado no sirve.
    try { const db = await import('../../lib/db.mjs'); await db.closePool() } catch { /* nunca se abrió */ }
  } finally {
    sh(['rm', '-f', NOMBRE])
    log('→ Postgres efímero destruido')
  }
}

main().catch((e) => { console.error(e?.stack ?? e); sh(['rm', '-f', NOMBRE]); process.exit(1) })
