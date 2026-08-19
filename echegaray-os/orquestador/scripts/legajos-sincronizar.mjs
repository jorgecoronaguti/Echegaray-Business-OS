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
import { PREFIJO_ADMIN, planDeNomina, planDeSincronizacion } from '../lib/legajos-sincro.mjs'

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

/** La foto de la carpeta: carpetas de persona (nivel 1) y sus archivos (nivel 2). */
export async function fotoDeDrive(google, raiz = RAIZ_LEGAJOS_DRIVE) {
  const carpetas = []
  const archivos = []
  const buckets = await google.listarCarpeta(raiz, { tope: 3000 })
  for (const b of buckets) {
    if (b.mimeType !== 'application/vnd.google-apps.folder') continue
    if (b.name.startsWith(PREFIJO_ADMIN)) continue
    for (const c of await google.listarCarpeta(b.id, { tope: 3000 })) {
      if (c.mimeType !== 'application/vnd.google-apps.folder') continue
      carpetas.push({ id: c.id, name: c.name, ruta: b.name })
      for (const f of await google.listarCarpeta(c.id, { tope: 3000 })) {
        if (f.mimeType === 'application/vnd.google-apps.folder') continue
        archivos.push({ id: f.id, name: f.name, ruta: `${b.name}/${c.name}` })
      }
    }
  }
  return { carpetas, archivos }
}

const enSeco = !process.argv.includes('--aplicar')
const linea = (s) => console.log(s)

async function main() {
  const google = makeGoogleClient({ config: await loadConfig(), scopes: WORKSPACE_SCOPES })
  const { carpetas, archivos } = await fotoDeDrive(google)
  const nomina = await leerNomina(google)
  const leerPersonas = async () => (await query(
    'select id, nombre_completo, legajo, puesto, drive_folder_id, en_la_empresa from personas')).rows

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
        'insert into personas (nombre_completo, legajo, puesto, en_la_empresa) values ($1,$2,$3,$4)',
        [a.nombre, a.legajo, a.puesto, a.en_la_empresa])
    }
    for (const c of nom.cambios) {
      await query(
        `update personas set legajo = coalesce($1, legajo), puesto = coalesce($2, puesto),
                             en_la_empresa = coalesce($3, en_la_empresa),
                             fecha_egreso = case when $3 is true then null else fecha_egreso end
          where id = $4`,
        [c.legajo ?? null, c.puesto ?? null, c.en_la_empresa ?? null, c.persona.id])
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
  linea(`\nDRIVE  ${carpetas.length} legajos · ${archivos.length} papeles`)
  linea(`BASE   ${personas.length} personas`)
  linea(`\nALTAS         ${plan.altas.length}`)
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
  let nuevos = 0
  let yaEstaban = 0
  for (const d of plan.documentos) {
    const personaId = d.persona_id ?? idPorCarpeta.get(d.carpeta_id)
    if (!personaId) continue
    const { rowCount } = await query(
      `insert into documentacion_legajo
         (persona_id, tipo_documento, nombre, drive_file_id, fecha_documento, presente)
       values ($1, $2, $3, $4, $5, true)
       on conflict (persona_id, drive_file_id) where drive_file_id is not null do nothing`,
      [personaId, d.tipo_documento, d.nombre, d.drive_file_id, d.fecha_documento])
    if (rowCount === 1) nuevos++
    else yaEstaban++
  }
  linea(`✓ ${nuevos} papeles registrados · ${yaEstaban} ya estaban\n`)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
}
