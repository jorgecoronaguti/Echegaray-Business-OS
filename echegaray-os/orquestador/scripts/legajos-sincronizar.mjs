#!/usr/bin/env node
// EL DATA ROOM DE PERSONAL → EL MÓDULO PERSONAL DE LA WEB.
//
//   node orquestador/scripts/legajos-sincronizar.mjs            # en seco: dice qué haría
//   node orquestador/scripts/legajos-sincronizar.mjs --aplicar   # escribe
//
// Lee la carpeta real de Drive —ya ordenada en `1. ACTIVOS` / `2. INACTIVOS` / `3. A REVISAR` /
// `9. ADMINISTRACIÓN`— y deja el módulo reflejándola: cada legajo vinculado a su carpeta, cada papel
// registrado con su enlace, y el estado de cada persona según el bucket en el que quedó su legajo.
//
// ═══ QUÉ NO HACE, A PROPÓSITO ═══
//
// NO BORRA NADA. Ni en Drive ni en la base. Una persona que está en el módulo y no tiene carpeta en
// el data room se declara y se deja como está: la ausencia de carpeta no prueba que la persona no
// exista, prueba que no hay carpeta.
//
// NO PISA LO QUE ESCRIBIÓ ALGUIEN. Los campos del legajo cargados a mano —categoría, ingreso,
// teléfono, notas— no se tocan nunca. De lo que este script maneja, lo único que sobreescribe es
// `drive_folder_id` cuando apunta a otra carpeta, y lo declara fila por fila.
//
// NO REGISTRA UN DOCUMENTO DOS VECES. La clave es el archivo de Drive: si el vínculo ya existe se
// deja como está, incluso si alguien lo re-categorizó a mano. La corrección humana gana.
//
// NO INVENTA UNA FECHA DE EGRESO. Que una persona ya no esté sale de la nómina; cuándo se fue sale
// de un papel con fecha, y cuando no hay papel la fecha queda en null. `en_la_empresa` es lo que la
// saca del plantel, así que nadie que se fue queda ofreciéndose para asignar a una obra.

import { makeGoogleClient, WORKSPACE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { query } from '../lib/db.mjs'
import { documentosAusentes, esBucketDeLegajos, planDeNomina, planDeSincronizacion } from '../lib/legajos-sincro.mjs'

export const RAIZ_LEGAJOS_DRIVE = '1-ErhNuik6XI72Ku3SwBDrdFYUIcTsz-7'
/** La nómina vigente: pestaña `PERSONAL` de NUEVA ASISTENCIA. Es quién cobra hoy, y por eso es quien
 *  decide el estado — no la carpeta, que sólo conoce a quien tiene papeles. */
export const NOMINA_ID = process.env.ORQ_ASISTENCIA_ID || '18essEcZKxw1YARU4o6uNjapKCB1U1uKF-p7zWQ0YwJ0'

export async function leerNomina(google) {
  const filas = await google.readSheetValues(NOMINA_ID, "'PERSONAL'!A2:D100")
  return (filas || []).filter((f) => (f[0] || '').trim()).map((f) => ({
    nombre: String(f[0]).trim(),
    legajo: String(f[1] ?? '').trim() || null,
    cargo: String(f[2] ?? '').trim() || null,
    activo: /^activo$/i.test(String(f[3] ?? '').trim()),
  }))
}

const FOLDER = 'application/vnd.google-apps.folder'
const CAMPOS = 'id,name,mimeType,modifiedTime,size'

/** Todos los archivos DEBAJO de una carpeta de persona, a cualquier profundidad. `subcarpeta` es la
 *  ruta interna («RECIBOS DE SUELDO», «Embargo cuota alimentaria/2025»); vacía en la raíz. */
async function archivosDebajoDe(google, carpetaId, ruta, subcarpeta = '') {
  const salida = []
  for (const f of await google.listarCarpeta(carpetaId, { tope: 3000, campos: CAMPOS })) {
    if (f.mimeType === FOLDER) {
      salida.push(...await archivosDebajoDe(google, f.id, ruta, subcarpeta ? `${subcarpeta}/${f.name}` : f.name))
      continue
    }
    salida.push({ id: f.id, name: f.name, ruta, subcarpeta, mimeType: f.mimeType, size: f.size, modifiedTime: f.modifiedTime })
  }
  return salida
}

/**
 * La foto de la carpeta: carpetas de persona (nivel 1 de `1. ACTIVOS` / `2. INACTIVOS`) y TODOS sus
 * archivos, recorriendo subcarpetas.
 *
 * Hasta el 08/09 se leía un solo nivel adentro de la persona: 29 recibos de Aguero estaban en
 * `RECIBOS DE SUELDO/` y los cuatro papeles de Zogbe en `Embargo cuota alimentaria/`, invisibles.
 *
 * Una carpeta que no se pudo listar queda en `carpetasConError` y NO entra al plan: sus papeles no se
 * dan por ausentes porque nadie los miró. Los buckets que no son de legajos se declaran en `ignorados`.
 */
export async function fotoDeDrive(google, raiz = RAIZ_LEGAJOS_DRIVE, { vinculadas = [] } = {}) {
  const carpetas = []
  const archivos = []
  const ignorados = []
  const carpetasConError = []
  const buckets = await google.listarCarpeta(raiz, { tope: 3000 })
  for (const b of buckets) {
    if (b.mimeType !== FOLDER) continue
    if (!esBucketDeLegajos(b.name)) { ignorados.push(b.name); continue }
    for (const c of await google.listarCarpeta(b.id, { tope: 3000 })) {
      if (c.mimeType !== FOLDER) continue
      try {
        const propios = await archivosDebajoDe(google, c.id, `${b.name}/${c.name}`)
        carpetas.push({ id: c.id, name: c.name, ruta: b.name })
        archivos.push(...propios)
      } catch (e) {
        carpetasConError.push({ id: c.id, name: c.name, ruta: b.name, error: e.message })
      }
    }
  }
  // CARPETAS YA VINCULADAS QUE SE MUDARON FUERA DE LOS DOS BUCKETS. El 08/09 había 7 personas de la
  // base cuya carpeta está hoy en `4. SUBCONTRATISTAS`. El vínculo ya existe —lo hizo una corrida
  // anterior o una persona— y sus 29 papeles siguen siendo suyos: se leen igual, con la ruta declarada
  // como «vinculada» para que nadie las confunda con el plantel.
  const yaVistas = new Set(carpetas.map((c) => c.id))
  for (const v of vinculadas) {
    if (!v.drive_folder_id || yaVistas.has(v.drive_folder_id)) continue
    try {
      const nombre = v.nombre_completo
      const propios = await archivosDebajoDe(google, v.drive_folder_id, `vinculada/${nombre}`)
      carpetas.push({ id: v.drive_folder_id, name: nombre, ruta: 'vinculada' })
      archivos.push(...propios)
    } catch (e) {
      carpetasConError.push({ id: v.drive_folder_id, name: v.nombre_completo, ruta: 'vinculada', error: e.message })
    }
  }
  return { carpetas, archivos, ignorados, carpetasConError }
}

const enSeco = !process.argv.includes('--aplicar')
const linea = (s) => console.log(s)

async function main() {
  const google = makeGoogleClient({ config: await loadConfig(), scopes: WORKSPACE_SCOPES })
  const inicio = Date.now()
  const leerPersonas = async () => (await query(
    'select id, nombre_completo, legajo, puesto, categoria, drive_folder_id, en_la_empresa from personas')).rows
  const { carpetas, archivos, ignorados, carpetasConError } = await fotoDeDrive(google, RAIZ_LEGAJOS_DRIVE, { vinculadas: await leerPersonas() })
  const nomina = await leerNomina(google)

  // ═══ PASO 1 · LA NÓMINA ═══
  let personas = await leerPersonas()
  const nom = planDeNomina({ nomina, personas })
  linea(`\nNÓMINA ${nomina.length} personas · ${nomina.filter((n) => n.activo).length} activas`)
  linea(`  altas ${nom.altas.length} · cambios ${nom.cambios.length}`)
  for (const c of nom.cambios) {
    const q = Object.keys(c).filter((k) => k !== 'persona').join(', ')
    linea(`  · ${c.persona.nombre_completo}: ${q}`)
  }
  for (const a of nom.ambiguas) linea(`  ⚠ ${a.nomina}: ${a.motivo}`)

  if (!enSeco) {
    for (const a of nom.altas) {
      await query(
        `insert into personas (nombre_completo, legajo, categoria, puesto, en_la_empresa)
         values ($1, $2, $3, $4, $5)`,
        [a.nombre, a.legajo, a.categoria, a.puesto, a.en_la_empresa])
    }
    for (const c of nom.cambios) {
      await query(
        `update personas set legajo = coalesce($1, legajo), puesto = coalesce($2, puesto),
                             categoria = coalesce($3, categoria),
                             en_la_empresa = coalesce($4, en_la_empresa),
                             fecha_egreso = case when $4 is true then null else fecha_egreso end
          where id = $5`,
        [c.legajo ?? null, c.puesto ?? null, c.categoria ?? null, c.en_la_empresa ?? null, c.persona.id])
    }
    personas = await leerPersonas()
  }

  // ═══ PASO 2 · EL DATA ROOM ═══
  const idsNomina = new Set()
  for (const fila of nomina) {
    const p = personas.find((x) => x.legajo && x.legajo === fila.legajo)
    if (p) idsNomina.add(p.id)
  }
  const plan = planDeSincronizacion({
    carpetas, archivos, personas: personas.map((p) => ({ ...p, en_nomina: idsNomina.has(p.id) })),
  })
  linea(`\nDRIVE  ${carpetas.length} legajos · ${archivos.length} papeles (${archivos.filter((a) => a.subcarpeta).length} en subcarpetas)`)
  if (ignorados.length) linea(`       carpetas de la raíz que no son legajos, ignoradas: ${ignorados.join(' · ')}`)
  for (const c of carpetasConError) linea(`  ✖ ${c.ruta}/${c.name}: no se pudo leer — ${c.error}`)
  linea(`BASE   ${personas.length} personas`)
  linea(`\nALTAS         ${plan.altas.length}`)
  for (const a of plan.altas) linea(`  + ${a.carpeta.ruta}/${a.carpeta.name}${a.motivo ? ' — ' + a.motivo : ''}`)
  linea(`VÍNCULOS      ${plan.vinculos.length}`)
  linea(`EGRESOS       ${plan.egresos.length}`)
  linea(`REINGRESOS    ${plan.reingresos.length}`)
  linea(`DOCUMENTOS    ${plan.documentos.length}`)
  if (plan.ambiguas.length) {
    linea(`\nSIN EMPAREJAR (${plan.ambiguas.length}) — las mira una persona:`)
    for (const a of plan.ambiguas) linea(`  · ${a.carpeta}: ${a.motivo}`)
  }
  if (plan.pendientes.length) {
    linea(`\nEN REVISIÓN (${plan.pendientes.length}) — no entran al módulo:`)
    for (const p of plan.pendientes) linea(`  · ${p.carpeta}: ${p.motivo}`)
  }
  if (plan.sinCarpeta.length) {
    linea(`\nEN EL MÓDULO SIN CARPETA EN EL DATA ROOM (${plan.sinCarpeta.length}) — no se tocan:`)
    for (const p of plan.sinCarpeta) linea(`  · ${p.nombre}`)
  }

  if (enSeco) {
    linea('\nEN SECO. Nada se escribió. Para aplicar: --aplicar\n')
    return
  }

  // ─── ALTAS ───────────────────────────────────────────────────────────────────────────────────
  const idPorCarpeta = new Map(personas.filter((p) => p.drive_folder_id).map((p) => [p.drive_folder_id, p.id]))
  for (const a of plan.altas) {
    const { rows } = await query(
      `insert into personas (nombre_completo, drive_folder_id, en_la_empresa)
       values ($1, $2, $3) returning id`,
      [a.nombre, a.carpeta.id, a.en_la_empresa])
    idPorCarpeta.set(a.carpeta.id, rows[0].id)
  }
  linea(`\n✓ ${plan.altas.length} legajos creados`)

  // ─── VÍNCULOS Y ESTADO ───────────────────────────────────────────────────────────────────────
  for (const v of plan.vinculos) {
    await query('update personas set drive_folder_id = $1 where id = $2', [v.carpeta.id, v.persona.id])
    idPorCarpeta.set(v.carpeta.id, v.persona.id)
    if (v.anterior) linea(`  ↻ ${v.persona.nombre_completo}: carpeta ${v.anterior} → ${v.carpeta.id}`)
  }
  linea(`✓ ${plan.vinculos.length} carpetas vinculadas`)

  for (const e of plan.egresos) {
    await query('update personas set en_la_empresa = false where id = $1', [e.persona.id])
  }
  for (const r of plan.reingresos) {
    await query('update personas set en_la_empresa = true, fecha_egreso = null where id = $1', [r.persona.id])
  }
  linea(`✓ ${plan.egresos.length} salieron del plantel · ${plan.reingresos.length} volvieron`)

  // ─── DOCUMENTOS ──────────────────────────────────────────────────────────────────────────────
  //
  // UPSERT POR ARCHIVO DE DRIVE. Lo que Drive sabe del archivo —nombre, mime, tamaño, modificación,
  // subcarpeta— se refresca en cada corrida. Lo que NO se pisa: `tipo_documento` y `fecha_documento`,
  // porque pueden venir corregidos a mano o por contenido (`legajos-verificar-contenido.mjs`): el
  // nombre del archivo es una pista, y la corrección le gana a la pista.
  let nuevos = 0
  let actualizados = 0
  const vistos = []
  for (const d of plan.documentos) {
    const personaId = d.persona_id ?? idPorCarpeta.get(d.carpeta_id)
    if (!personaId) continue
    vistos.push(d.drive_file_id)
    const { rows } = await query(
      `insert into documentacion_legajo
         (persona_id, tipo_documento, nombre, drive_file_id, fecha_documento, presente,
          subcarpeta, mime, bytes, modificado_drive, ausente_en_drive, sincronizado_en)
       values ($1, $2, $3, $4, $5, true, $6, $7, $8, $9, false, now())
       on conflict (persona_id, drive_file_id) where drive_file_id is not null do update set
         nombre = excluded.nombre, subcarpeta = excluded.subcarpeta, mime = excluded.mime,
         bytes = excluded.bytes, modificado_drive = excluded.modificado_drive,
         ausente_en_drive = false, sincronizado_en = now(), updated_at = now()
       returning (xmax = 0) as insertado`,
      [personaId, d.tipo_documento, d.nombre, d.drive_file_id, d.fecha_documento,
       d.subcarpeta, d.mime, d.bytes, d.modificado_drive])
    if (rows[0]?.insertado) nuevos++
    else actualizados++
  }
  linea(`✓ ${nuevos} papeles registrados · ${actualizados} ya estaban (metadatos refrescados)`)

  // ─── LO QUE YA NO ESTÁ EN DRIVE ──────────────────────────────────────────────────────────────
  // Sólo de las personas cuya carpeta se leyó ENTERA en esta corrida. No se borra: se marca.
  const carpetasLeidas = carpetas.map((c) => idPorCarpeta.get(c.id)).filter(Boolean)
  const { rows: previos } = await query(
    `select id, persona_id, drive_file_id from documentacion_legajo
      where drive_file_id is not null and not ausente_en_drive`)
  const ausentes = documentosAusentes({ previos, actuales: vistos, carpetasLeidas })
  if (ausentes.length) {
    await query(
      `update documentacion_legajo set ausente_en_drive = true, updated_at = now() where id = any($1::uuid[])`,
      [ausentes])
  }
  linea(`✓ ${ausentes.length} papeles marcados ausentes en Drive (no se borra ninguno)`)

  // ─── CONSTANCIA DE LA CORRIDA ────────────────────────────────────────────────────────────────
  const error = carpetasConError.length
    ? `${carpetasConError.length} carpetas sin leer: ${carpetasConError.map((c) => c.name).join(', ')}`
    : null
  await query(
    `insert into documento_espejo_corrida (ambito, carpeta_drive, corrida_at, documentos, publicados, error)
     values ('legajos', $1, now(), $2, $3, $4)
     on conflict (ambito) do update set carpeta_drive = excluded.carpeta_drive, corrida_at = now(),
       documentos = excluded.documentos, publicados = excluded.publicados, error = excluded.error`,
    [RAIZ_LEGAJOS_DRIVE, vistos.length, nuevos + actualizados, error])
  linea(`✓ corrida registrada en documento_espejo_corrida (ambito 'legajos') · ${Math.round((Date.now() - inicio) / 1000)} s\n`)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
}
