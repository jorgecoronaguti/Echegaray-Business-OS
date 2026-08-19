#!/usr/bin/env node
// ORDENA EL DATA ROOM DE PERSONAL — activos, inactivos, y cada papel en el legajo de su dueño.
//
// El dueño: *"reorganizá de la mejor manera posible y conforme a las mejores prácticas de data room
// y legislación de construcción argentina el contenido de esta carpeta, que cuenta con el personal
// activo e inactivo"*, tomando como referencia JORNALES y NUEVA ASISTENCIA.
//
// ═══ LO QUE ESTE SCRIPT NO HACE, Y ES LO MÁS IMPORTANTE ═══
//
//   · NO BORRA NADA. Nunca. No hay una sola llamada de borrado en este archivo.
//   · NO ADIVINA. Un archivo que empata entre dos carpetas —«Baja - Peralta Alexander» contra las
//     dos carpetas Peralta, que son dos personas distintas— se queda donde está y se declara. Meter
//     la baja de uno en el legajo del otro es el error caro de esta tarea, no dejar un archivo suelto.
//   · NO RENOMBRA UNA PERSONA. Sólo le saca al nombre de la carpeta la fecha pegada
//     («AGUIRRE LEANDRO 7:2:26» → «AGUIRRE LEANDRO»), que no identifica a nadie y rompe el orden.
//   · NO TOCA `public.personas`. Los 30 `drive_folder_id` cargados siguen valiendo: mover una
//     carpeta NO le cambia el id, así que la ficha de Personal del OS sigue apuntando a lo mismo.
//
// ═══ EL ESTADO SALE DE LA NÓMINA, NO DE SI HAY UN PAPEL DE BAJA ═══
//
// La tentación es clasificar por lo que hay en la carpeta. Medido: ocho carpetas de gente que ya no
// está en la nómina 2026 no tienen ningún archivo de baja —nadie lo cargó—, y `NAVARRO MATIAS
// JESUS` figura «Inactivo» en NUEVA ASISTENCIA con la carpeta sin baja. El Drive se atrasa; la
// nómina es la que paga. Manda la nómina.
//
// ═══ POR QUÉ CUATRO CARPETAS Y NO UN ÁRBOL POR TIPO DE DOCUMENTO ═══
//
// Un legajo se audita PERSONA POR PERSONA: un inspector pide «el legajo de Fulano», no «todos los
// exámenes médicos». La carpeta por persona es la unidad que exige la ley; ACTIVOS/INACTIVOS
// contesta de un vistazo la pregunta que hoy exige abrir una herramienta. Dentro de cada legajo el
// orden lo da el prefijo del nombre del archivo, no una subcarpeta más por tipo: con seis papeles
// por persona, seis subcarpetas es más clics para ver menos.
//
//   node orquestador/scripts/legajos-reorganizar.mjs            # en seco: dice qué haría
//   node orquestador/scripts/legajos-reorganizar.mjs --ejecutar

import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import {
  esLegajoDeAlguien, estadoSegunNomina, gruposSinLegajo, personaDeArchivo, sinFechaPegada,
  tipoDeDocumento, ubicar,
} from '../lib/legajos-orden.mjs'

const RAIZ = process.env.ORQ_LEGAJOS_ID || '1-ErhNuik6XI72Ku3SwBDrdFYUIcTsz-7'
const NOMINA_ID = process.env.ORQ_ASISTENCIA_ID || '18essEcZKxw1YARU4o6uNjapKCB1U1uKF-p7zWQ0YwJ0'
const EJECUTAR = process.argv.includes('--ejecutar')
const CARPETA = 'application/vnd.google-apps.folder'

// Los nombres llevan número para que el orden alfabético de Drive sea el orden que se quiere leer.
//
// «SIN NÓMINA» NO ES UN TERCER ESTADO: es no estar en la nómina vigente, o sea inactivo. Tenerlo
// aparte dejaba 33 legajos en un limbo con nombre de pendiente, cuando lo que son es gente que ya
// no trabaja acá. El rótulo dice de dónde sale el criterio —la nómina— para que nadie lo lea como
// una afirmación sobre la situación legal de nadie.
const BUCKETS = {
  ACTIVOS: '1. ACTIVOS',
  INACTIVOS: '2. INACTIVOS (fuera de la nomina vigente)',
  'SIN NOMINA': '2. INACTIVOS (fuera de la nomina vigente)',
  'A REVISAR': '3. A REVISAR - dos personas posibles',
}
const ADMINISTRACION = '9. ADMINISTRACION (no es legajo)'
// Estas tres NO son de una persona: son procesos administrativos que estaban mezclados con legajos.
const NO_SON_LEGAJO = new Set(['FONDO DE CESE', 'TELEGRAMAS', 'COMPROBANTES DE TRANSFERENCIAS'])

async function nominaDe(google) {
  const filas = await google.readSheetValues(NOMINA_ID, "'PERSONAL'!A2:D100")
  return (filas || [])
    .filter((f) => (f[0] || '').trim())
    .map((f) => ({
      nombre: String(f[0]).trim(),
      legajo: (f[1] || '').toString().trim(),
      cargo: (f[2] || '').trim(),
      activo: /^activo$/i.test((f[3] || '').trim()),
    }))
}

async function main() {
  // MOVER Y CREAR CARPETAS ES ESCRITURA: sin los scopes de escritura, el plan se imprime bien y
  // la primera operación real muere con 403.
  const google = makeGoogleClient({ config: await loadConfig(), scopes: WRITE_SCOPES })
  const nomina = await nominaDe(google)
  console.log(`nómina: ${nomina.length} personas · ${nomina.filter((p) => p.activo).length} activas\n`)

  const hijos = await google.listarCarpeta(RAIZ, { tope: 3000 })
  const carpetas = hijos.filter((f) => f.mimeType === CARPETA)
  const sueltos = hijos.filter((f) => f.mimeType !== CARPETA)
  const personas = carpetas.filter((c) => !NO_SON_LEGAJO.has(c.name) && !/^\d\. /.test(c.name))
  console.log(`en la raíz: ${personas.length} carpetas de persona, ${sueltos.length} archivos sueltos\n`)

  // ── 1 · A QUÉ BUCKET VA CADA PERSONA ──────────────────────────────────────
  const plan = { mover: [], renombrar: [], quietos: [] }
  const porBucket = new Map()
  for (const c of personas) {
    const { estado, persona, motivo } = estadoSegunNomina(c.name, nomina)
    const bucket = BUCKETS[estado]
    porBucket.set(bucket, [...(porBucket.get(bucket) ?? []), c.name])
    plan.mover.push({ tipo: 'carpeta', id: c.id, nombre: c.name, a: bucket, quien: persona?.nombre ?? motivo ?? null })
    const limpio = sinFechaPegada(c.name)
    if (limpio !== c.name) plan.renombrar.push({ id: c.id, de: c.name, a: limpio })
  }

  // ── 2 · CADA PAPEL SUELTO, AL LEGAJO DE SU DUEÑO ──────────────────────────
  // El universo de personas conocidas: las carpetas que existen MÁS los nombres que aparecen en los
  // archivos sueltos. Es lo que hace que «FERREYRA» deje de parecer único.
  const universo = [...personas.map((c) => c.name), ...sueltos.map((f) => personaDeArchivo(f.name)).filter(Boolean)]
  for (const f of sueltos) {
    const r = ubicar(f, personas, universo)
    if (r.destino) plan.mover.push({ tipo: 'archivo', id: f.id, nombre: f.name, a: `legajo de ${r.destino.name}`, destinoId: r.destino.id, doc: r.tipo })
    else plan.quietos.push({ archivo: f, nombre: f.name, motivo: r.motivo, doc: tipoDeDocumento(f.name) })
  }

  // ── 3 · LA GENTE QUE TIENE PAPELES Y NO TIENE LEGAJO ──────────────────────
  //
  // Se le crea la carpeta. Dejar los papeles sueltos «porque no hay dónde ponerlos» es el desorden
  // que se vino a arreglar, y entre esos sueltos hay gente ACTIVA hoy —Agüero, Maldonado, los dos
  // Quiroga— cuyo legajo simplemente no existía.
  const huerfanos = plan.quietos.filter((q) => q.motivo === 'no tiene carpeta').map((q) => q.archivo)
  const nuevos = gruposSinLegajo(huerfanos)
  plan.quietos = plan.quietos.filter((q) => q.motivo !== 'no tiene carpeta')
  const noSonDeNadie = []
  for (const g of nuevos) {
    if (!esLegajoDeAlguien(g.archivos)) { g.bucket = ADMINISTRACION; noSonDeNadie.push(g); continue }
    const { estado, persona } = estadoSegunNomina(g.nombre, nomina)
    g.bucket = BUCKETS[estado]
    g.quien = persona?.nombre ?? null
  }

  // ── 4 · LO QUE NO ES UN LEGAJO ────────────────────────────────────────────
  for (const c of carpetas.filter((c) => NO_SON_LEGAJO.has(c.name))) {
    plan.mover.push({ tipo: 'carpeta', id: c.id, nombre: c.name, a: ADMINISTRACION, quien: null })
  }

  // ── EL PLAN, A LA VISTA ───────────────────────────────────────────────────
  for (const [bucket, gente] of [...porBucket.entries()].sort()) {
    console.log(`${bucket} (${gente.length})`)
    for (const g of gente.sort()) console.log(`   ${g}`)
    console.log()
  }
  const aLegajo = plan.mover.filter((m) => m.tipo === 'archivo')
  console.log(`archivos sueltos que se guardan en su legajo: ${aLegajo.length}`)
  for (const m of aLegajo) console.log(`   ${m.nombre}  →  ${m.a}`)
  console.log(`\nlegajos NUEVOS, para gente que tenía papeles y no tenía carpeta (${nuevos.length}):`)
  for (const g of nuevos.sort((a, b) => a.nombre.localeCompare(b.nombre))) {
    console.log(`   ${g.nombre}  (${g.archivos.length} papel/es)  →  ${g.bucket}`)
  }
  console.log(`\nSE QUEDAN DONDE ESTÁN (${plan.quietos.length}) — no se adivina de quién son:`)
  for (const q of plan.quietos) console.log(`   ${q.nombre}  ·  ${q.motivo}`)
  if (plan.renombrar.length) {
    console.log(`\nnombres a los que se les saca la fecha pegada (${plan.renombrar.length}):`)
    for (const r of plan.renombrar) console.log(`   ${r.de}  →  ${r.a}`)
  }

  if (!EJECUTAR) {
    console.log('\nEsto fue EN SECO: no se movió ni se renombró nada.')
    console.log('Para hacerlo:  node orquestador/scripts/legajos-reorganizar.mjs --ejecutar')
    return
  }

  // ── EJECUCIÓN ─────────────────────────────────────────────────────────────
  console.log('\n── EJECUTANDO ──')
  const existentes = new Map(carpetas.map((c) => [c.name, c.id]))
  const idDe = async (nombre) => {
    if (existentes.has(nombre)) return existentes.get(nombre)
    const f = await google.createFile({ name: nombre, mimeType: CARPETA, parents: [RAIZ] })
    existentes.set(nombre, f.id)
    console.log(`   + carpeta ${nombre}`)
    return f.id
  }

  let movidos = 0
  for (const m of plan.mover.filter((x) => x.tipo === 'carpeta')) {
    await google.moveFile(m.id, await idDe(m.a))
    movidos++
  }
  for (const m of aLegajo) {
    await google.moveFile(m.id, m.destinoId)
    movidos++
  }
  // Los legajos nuevos se crean DENTRO de su bucket, no en la raíz: nacer suelto y después moverse
  // deja una ventana en la que la carpeta está en el lugar equivocado.
  for (const g of nuevos) {
    const bucketId = await idDe(g.bucket)
    const carpeta = await google.createFile({ name: g.nombre, mimeType: CARPETA, parents: [bucketId] })
    console.log(`   + legajo ${g.nombre} (${g.archivos.length})`)
    for (const f of g.archivos) { await google.moveFile(f.id, carpeta.id); movidos++ }
  }
  for (const r of plan.renombrar) await google.renameFile(r.id, r.a)
  console.log(`\nmovidos: ${movidos} · renombrados: ${plan.renombrar.length} · borrados: 0`)
}

main().catch((e) => { console.error('ERROR:', e.message); process.exit(1) })
