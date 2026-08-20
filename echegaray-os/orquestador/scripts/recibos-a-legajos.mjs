#!/usr/bin/env node
// CADA RECIBO A SU LEGAJO — parte los PDF de quincena del estudio y le deja a cada persona el suyo.
//
// El estudio manda UN PDF por quincena con TODOS los recibos adentro, una página por persona. Este
// script los parte, identifica de quién es cada página por su CUIL, sube la hoja suelta a la carpeta
// de esa persona en el data room y la registra en su legajo.
//
// ═══ TRES REGLAS ═══
//
// 1. POR CUIL, NUNCA POR NOMBRE. «AVALOS» y «ÁVALOS» son la misma persona en dos papeles del mismo
//    día; el CUIL no se escribe de dos maneras. Un recibo colgado del legajo equivocado es peor que
//    uno sin colgar.
// 2. IDEMPOTENTE. Antes de subir mira lo que ya está en la carpeta de la persona; el índice único
//    `(persona_id, drive_file_id)` es la última palabra. Correrlo dos veces no duplica nada.
// 3. LO QUE NO SE PUDO IDENTIFICAR SE INFORMA, NO SE ADIVINA. Una página sin capa de texto —el 39%
//    del data room son escaneos— o sin CUIL queda en el informe como no identificada, y el PDF
//    entero sigue estando en `3. RECIBOS DE SUELDO`.
//
// Uso:  node orquestador/scripts/recibos-a-legajos.mjs [--aplicar] [--limite N]

import fs from 'node:fs'
import { PDFDocument } from 'pdf-lib'
import { PDFParse } from 'pdf-parse'
import { getTokenFor } from '../lib/google-oauth.mjs'
import { query, closePool } from '../lib/db.mjs'
import { nombreDelRecibo, personaDelRecibo, personaQueCorresponde } from '../lib/recibo-sueldo.mjs'

const APLICAR = process.argv.includes('--aplicar')
const LIMITE = Number(process.argv[process.argv.indexOf('--limite') + 1]) || Infinity
const ORIGEN = process.env.CARPETA_RECIBOS || '1kfdJqw9fk4DfVH6tbjc5dSrte5owty1L'
const SUBCARPETA = 'RECIBOS DE SUELDO'

const getTok = getTokenFor('rodrigo@ecsas.com.ar')
let tok = await getTok()

async function api(u, opt = {}, binario = false) {
  for (let i = 0; i < 5; i++) {
    const r = await fetch(u, { ...opt, headers: { Authorization: `Bearer ${tok}`, ...(opt.headers || {}) } })
    if (r.ok) return binario ? Buffer.from(await r.arrayBuffer()) : r.json()
    if (r.status === 401) { tok = await getTok(); continue }
    if (r.status === 429 || r.status >= 500) { await new Promise((s) => setTimeout(s, 1500 * (i + 1))); continue }
    throw new Error(`${r.status} ${(await r.text()).slice(0, 200)}`)
  }
  throw new Error('reintentos agotados')
}

const listar = async (q, campos = 'id,name') => {
  const out = []; let page = ''
  do {
    const r = await api(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=nextPageToken,files(${campos})&pageSize=1000${page ? `&pageToken=${page}` : ''}`)
    out.push(...(r.files ?? [])); page = r.nextPageToken ?? ''
  } while (page)
  return out
}

async function carpetaDe(padre, nombre) {
  const ya = await listar(`'${padre}' in parents and name='${nombre}' and mimeType='application/vnd.google-apps.folder' and trashed=false`)
  if (ya[0]) return ya[0].id
  if (!APLICAR) return null
  const c = await api('https://www.googleapis.com/drive/v3/files?fields=id', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: nombre, mimeType: 'application/vnd.google-apps.folder', parents: [padre] }),
  })
  return c.id
}

async function subir(carpeta, nombre, bytes) {
  const linde = '=-=recibo' + Math.abs(nombre.length * 7919).toString(36)
  const cuerpo = Buffer.concat([
    Buffer.from(`--${linde}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name: nombre, parents: [carpeta] })}\r\n--${linde}\r\nContent-Type: application/pdf\r\n\r\n`),
    bytes, Buffer.from(`\r\n--${linde}--\r\n`),
  ])
  return api('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name', {
    method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${linde}` }, body: cuerpo,
  })
}

// ── EL PLANTEL, CON SU CUIL Y SU CARPETA ─────────────────────────────────────
const { rows: plantel } = await query(
  `select id, nombre_completo, cuil, legajo, drive_folder_id, en_la_empresa
     from public.personas where cuil is not null`)
console.log(`plantel con CUIL: ${plantel.length}`)

const archivos = await listar(`'${ORIGEN}' in parents and trashed=false and mimeType='application/pdf'`, 'id,name,size')
archivos.sort((a, b) => a.name.localeCompare(b.name))
console.log(`PDF en la carpeta: ${archivos.length}`)

const informe = { paginas: 0, sinTexto: 0, sinCuil: 0, sinPersona: new Map(), subidos: 0, yaEstaban: 0, fallidos: 0, porPersona: new Map() }
const carpetaCache = new Map()
const yaEnCarpeta = new Map()

let n = 0
for (const f of archivos) {
  if (++n > LIMITE) break
  let doc, texto
  try {
    const bytes = await api(`https://www.googleapis.com/drive/v3/files/${f.id}?alt=media`, {}, true)
    const p = new PDFParse({ data: new Uint8Array(bytes) })
    texto = await p.getText()
    await p.destroy()
    doc = await PDFDocument.load(bytes, { ignoreEncryption: true })
  } catch (e) {
    informe.fallidos++
    console.log(`  ✗ ${f.name}: ${e.message.slice(0, 90)}`)
    continue
  }

  const paginas = texto.pages ?? []
  for (let i = 0; i < doc.getPageCount(); i++) {
    informe.paginas++
    const t = paginas[i]?.text ?? ''
    if (!t.trim()) { informe.sinTexto++; continue }
    const datos = personaDelRecibo(t)
    if (!datos) { informe.sinCuil++; continue }
    const persona = personaQueCorresponde(datos, plantel)
    if (!persona) {
      const k = `${datos.cuil} · ${datos.nombre ?? 'sin nombre'}`
      informe.sinPersona.set(k, (informe.sinPersona.get(k) ?? 0) + 1)
      continue
    }
    if (!persona.drive_folder_id) {
      informe.sinPersona.set(`${persona.nombre_completo} · SIN CARPETA`, 1)
      continue
    }

    const nombre = nombreDelRecibo(datos)
    // La carpeta de recibos de esa persona, creada una sola vez.
    let carpeta = carpetaCache.get(persona.id)
    if (carpeta === undefined) {
      carpeta = await carpetaDe(persona.drive_folder_id, SUBCARPETA)
      carpetaCache.set(persona.id, carpeta)
      if (carpeta) {
        const hay = await listar(`'${carpeta}' in parents and trashed=false`, 'id,name')
        yaEnCarpeta.set(persona.id, new Map(hay.map((x) => [x.name, x.id])))
      } else yaEnCarpeta.set(persona.id, new Map())
    }
    const previos = yaEnCarpeta.get(persona.id)
    if (previos.has(nombre)) {
      informe.yaEstaban++
      if (APLICAR) await registrar(persona.id, previos.get(nombre), nombre, datos)
      continue
    }
    if (!APLICAR) {
      informe.subidos++
      informe.porPersona.set(persona.nombre_completo, (informe.porPersona.get(persona.nombre_completo) ?? 0) + 1)
      previos.set(nombre, 'DRY')
      continue
    }

    try {
      const hoja = await PDFDocument.create()
      const [pagina] = await hoja.copyPages(doc, [i])
      hoja.addPage(pagina)
      const bytes = Buffer.from(await hoja.save())
      const subido = await subir(carpeta, nombre, bytes)
      previos.set(nombre, subido.id)
      await registrar(persona.id, subido.id, nombre, datos)
      informe.subidos++
      informe.porPersona.set(persona.nombre_completo, (informe.porPersona.get(persona.nombre_completo) ?? 0) + 1)
    } catch (e) {
      informe.fallidos++
      console.log(`  ✗ ${f.name} p${i + 1} (${persona.nombre_completo}): ${e.message.slice(0, 90)}`)
    }
  }
  if (n % 10 === 0) console.log(`… ${n}/${archivos.length} · ${informe.subidos} hojas`)
}

/** El vínculo en el legajo. El índice único es PARCIAL —(persona_id, drive_file_id) WHERE drive_file_id
 *  IS NOT NULL—, y `on conflict` sólo lo reconoce si se repite el mismo predicado: sin él Postgres
 *  contesta 42P10 «no unique or exclusion constraint matching the ON CONFLICT specification». */
async function registrar(personaId, driveFileId, nombre, datos) {
  const fecha = datos.periodo ? `${datos.periodo}-01` : null
  await query(
    `insert into public.documentacion_legajo (persona_id, tipo_documento, presente, drive_file_id, fecha_documento, nombre)
     values ($1, 'recibo_sueldo', true, $2, $3, $4)
     on conflict (persona_id, drive_file_id) where drive_file_id is not null do update set nombre = excluded.nombre, fecha_documento = excluded.fecha_documento`,
    [personaId, driveFileId, fecha, nombre])
}

console.log('\n═══ RESULTADO ═══')
console.log(`páginas leídas       ${informe.paginas}`)
console.log(`sin capa de texto    ${informe.sinTexto}`)
console.log(`con texto sin CUIL   ${informe.sinCuil}`)
console.log(`hojas ${APLICAR ? 'subidas' : 'a subir'}        ${informe.subidos}`)
console.log(`ya estaban           ${informe.yaEstaban}`)
console.log(`fallidas             ${informe.fallidos}`)
console.log(`personas alcanzadas  ${informe.porPersona.size}`)
if (informe.sinPersona.size) {
  console.log('\nCUIL que no está en la nómina (no se cuelga a nadie):')
  for (const [k, v] of [...informe.sinPersona].sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(3)} · ${k}`)
}
if (process.env.INFORME) {
  fs.writeFileSync(process.env.INFORME, JSON.stringify({
    ...informe,
    sinPersona: [...informe.sinPersona], porPersona: [...informe.porPersona],
  }, null, 1))
}
await closePool()
