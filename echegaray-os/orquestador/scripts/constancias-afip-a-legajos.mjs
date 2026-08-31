#!/usr/bin/env node
// LAS CONSTANCIAS DE ALTA DE ARCA, UNA A CADA LEGAJO — y el cruce contra la nómina.
//
// ═══ EL PEDIDO (31/08/2026), TEXTUAL ═══
//
//   «descarga el pdf adjunto unicamente por esta via de las constancias de inscripcion de afip como
//    empleados, colocalas en legajo de cada uno segun corresponde en caso de no tenerlas y hacer
//    cruce con todo lo relativo a nomina»
//
// ARCA emite un solo PDF con todo el plantel declarado: dos páginas por persona (el talón del
// empleador y el del empleado). Este script lo parte, le deja a cada uno su alta en su carpeta del
// data room —**sólo a quien no la tenga**— y después cruza esas altas contra todo lo que hoy dice
// la nómina.
//
// ═══ TRES REGLAS, LAS MISMAS QUE recibos-a-legajos.mjs ═══
//
// 1. **POR CUIL, NUNCA POR NOMBRE.** Hay cuatro González, dos Quiroga y dos Emiliano. Además
//    `personas` guarda el CUIL de dos formas («20509455474» y «20-38218815-3»), así que se compara
//    en dígitos o no se compara.
// 2. **IDEMPOTENTE Y NO PISA NADA.** Antes de subir se lee la carpeta: si ya hay un alta, se
//    informa y no se toca. Nunca se reemplaza un archivo existente.
// 3. **LO QUE NO SE PUDO IDENTIFICAR SE INFORMA.** Una página sin CUIL legible no se le cuelga a
//    nadie.
//
// ═══ EL CRUCE NO ES DECORACIÓN ═══
//
// La constancia dice tres cosas que la nómina también dice, y por caminos distintos: quién está
// declarado, desde cuándo, y a cuánto la hora. Cuando dos fuentes independientes dicen lo mismo, el
// dato se sostiene; cuando difieren, hay trabajo. Por eso el cruce se imprime siempre, aun sin
// escribir nada.
//
//   node orquestador/scripts/constancias-afip-a-legajos.mjs <archivo.pdf>            → qué haría
//   node orquestador/scripts/constancias-afip-a-legajos.mjs <archivo.pdf> --aplicar  → sube

import fs from 'node:fs'
import { PDFDocument } from 'pdf-lib'
import { PDFParse } from 'pdf-parse'
import { getTokenFor } from '../lib/google-oauth.mjs'
import { query, closePool } from '../lib/db.mjs'
import { agruparPorPersona, nombreDeArchivo, yaTieneConstancia, tipoDeDocumento, cuilPlano } from '../lib/constancia-afip.mjs'
import { CUIL_POR_PERSONA_DE_PLANILLA, SIN_RECIBO_EN_LA_QUINCENA, SUBCONTRATISTAS_CON_LIQUIDACION } from '../lib/nomina-banco-recibo.mjs'

const APLICAR = process.argv.includes('--aplicar')
const PERIODO = 'Q2-08/2026'
const ARCHIVO = process.argv.slice(2).find((a) => a.endsWith('.pdf'))
if (!ARCHIVO || !fs.existsSync(ARCHIVO)) {
  console.error('falta el PDF de las constancias: node orquestador/scripts/constancias-afip-a-legajos.mjs <archivo.pdf> [--aplicar]')
  process.exit(1)
}

const getTok = getTokenFor('rodrigo@ecsas.com.ar')
let tok = await getTok()

async function api(u, opt = {}) {
  for (let i = 0; i < 5; i++) {
    const r = await fetch(u, { ...opt, headers: { Authorization: `Bearer ${tok}`, ...(opt.headers || {}) } })
    if (r.ok) return r.json()
    if (r.status === 401) { tok = await getTok(); continue }
    if (r.status === 429 || r.status >= 500) { await new Promise((s) => setTimeout(s, 1500 * (i + 1))); continue }
    throw new Error(`${r.status} ${(await r.text()).slice(0, 200)}`)
  }
  throw new Error('reintentos agotados')
}

const listar = (padre) => api(
  `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(`'${padre}' in parents and trashed=false`)}&fields=files(id,name,mimeType)&pageSize=200`,
).then((r) => r.files ?? [])

async function subir(carpeta, nombre, bytes) {
  const linde = '=-=alta' + Math.abs(nombre.length * 7919).toString(36)
  const cuerpo = Buffer.concat([
    Buffer.from(`--${linde}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name: nombre, parents: [carpeta] })}\r\n--${linde}\r\nContent-Type: application/pdf\r\n\r\n`),
    bytes, Buffer.from(`\r\n--${linde}--\r\n`),
  ])
  return api('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name', {
    method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${linde}` }, body: cuerpo,
  })
}

/** DD/MM/YYYY → YYYY-MM-DD. La constancia escribe en es-AR y la base guarda ISO. */
const aISO = (ddmmyyyy) => {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(ddmmyyyy ?? ''))
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null
}

// ── 1 · EL PDF ───────────────────────────────────────────────────────────────
const bytes = fs.readFileSync(ARCHIVO)
const lector = new PDFParse({ data: new Uint8Array(bytes) })
const texto = await lector.getText()
await lector.destroy()
const doc = await PDFDocument.load(bytes, { ignoreEncryption: true })

const { personas: constancias, descartadas } = agruparPorPersona((texto.pages ?? []).map((p) => p.text ?? ''))
console.log(`${ARCHIVO.split('/').pop()} · ${doc.getPageCount()} página(s) · ${constancias.length} persona(s)`)
if (descartadas.length) console.log(`   ⚠ ${descartadas.length} página(s) sin CUIL legible: ${descartadas.map((i) => i + 1).join(', ')}`)
for (const c of constancias) for (const x of c.conflictos) console.log(`   ⚠ ${c.nombre}: ${x}`)

// ── 2 · CONTRA QUIÉN SE CRUZA ────────────────────────────────────────────────
const { rows: plantel } = await query(
  `select id, nombre_completo, cuil, legajo, drive_folder_id, en_la_empresa
     from public.personas where cuil is not null`)
const porCuil = new Map(plantel.map((p) => [cuilPlano(p.cuil), p]).filter(([c]) => c))

const { rows: recibos } = await query(
  `select distinct on (cuil) cuil, neto, nombre_recibo from public.nomina_recibo_neto
    where periodo = $1 order by cuil, cargado_en desc`, [PERIODO])
const reciboDe = new Map(recibos.map((r) => [r.cuil, r]))
// LA LIQUIDACIÓN FINAL VIVE EN OTRO PERÍODO. Preguntar por la quincena si a alguien se le liquidó
// el cierre lo daba por «sin encuadre» — pasó con Jofre y Sosa, que tienen su liquidación cargada
// desde el 31/08. Un falso positivo acá manda a buscar un problema que no existe.
const { rows: finales } = await query(
  "select cuil, neto, nombre_recibo from public.nomina_recibo_neto where periodo = 'FINAL'")
const liquidacionDe = new Map(finales.map((r) => [r.cuil, r]))

const { rows: papelesEnBase } = await query(
  `select persona_id, tipo_documento, drive_file_id, presente from public.documentacion_legajo
    where tipo_documento in ('alta_temprana', 'baja')`)
const papelEnBase = new Map(papelesEnBase.map((a) => [`${a.persona_id}·${a.tipo_documento}`, a]))


// ── 3 · UNA POR UNA ──────────────────────────────────────────────────────────
const subidos = []
const yaEstaban = []
const sinCarpeta = []
const sinPersona = []

for (const c of constancias.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))) {
  const p = porCuil.get(c.cuil)
  if (!p) { sinPersona.push(c); continue }
  if (!p.drive_folder_id) { sinCarpeta.push({ c, p }); continue }

  const enCarpeta = await listar(p.drive_folder_id)
  const nombres = enCarpeta.filter((f) => !f.mimeType.includes('folder')).map((f) => f.name)
  if (yaTieneConstancia(nombres, c.tipo)) {
    const cual = enCarpeta.find((f) => !f.mimeType.includes('folder') && yaTieneConstancia([f.name], c.tipo))
    yaEstaban.push({ c, p, comoSeLlama: cual?.name })
    // EL ARCHIVO ESTÁ Y EL LEGAJO PUEDE NO SABERLO. Tener el papel en la carpeta y no tenerlo
    // vinculado hace que el OS lo reporte como faltante: un falso «no está» sobre un papel que sí
    // está es exactamente el control que este repo ya pagó (seis falsos faltantes en julio).
    if (APLICAR && cual) {
      await query(
        `insert into public.documentacion_legajo (persona_id, tipo_documento, presente, drive_file_id, fecha_documento, nombre)
         values ($1, $2, true, $3, $4, $5)
         on conflict (persona_id, drive_file_id) where drive_file_id is not null
         do update set presente = true, fecha_documento = excluded.fecha_documento`,
        [p.id, tipoDeDocumento(c.tipo), cual.id, aISO(c.fechaCese ?? c.fechaInicio), cual.name])
    }
    continue
  }

  const nombreArchivo = nombreDeArchivo(c.nombre, c.tipo)
  if (!APLICAR) { subidos.push({ c, p, nombreArchivo, id: null }); continue }

  // Las dos páginas de esa persona, en un PDF propio. Es la constancia completa tal como la emite
  // ARCA: el talón del empleador y el del empleado.
  const hoja = await PDFDocument.create()
  for (const pagina of await hoja.copyPages(doc, c.paginas)) hoja.addPage(pagina)
  const salida = Buffer.from(await hoja.save())
  const subido = await subir(p.drive_folder_id, nombreArchivo, salida)

  // El vínculo en el legajo. El índice único es PARCIAL: el `where` del ON CONFLICT tiene que
  // repetir el predicado o Postgres contesta 42P10.
  //
  // LA FECHA DEL DOCUMENTO ES LA DEL HECHO QUE CERTIFICA: el alta certifica el ingreso, la baja el
  // cese. Poner la de inicio en las dos haría que la baja de Sosa quedara fechada en mayo, cuando
  // lo que ese papel prueba es que el vínculo terminó el 25/08.
  await query(
    `insert into public.documentacion_legajo (persona_id, tipo_documento, presente, drive_file_id, fecha_documento, nombre)
     values ($1, $2, true, $3, $4, $5)
     on conflict (persona_id, drive_file_id) where drive_file_id is not null
     do update set nombre = excluded.nombre, fecha_documento = excluded.fecha_documento, presente = true`,
    [p.id, tipoDeDocumento(c.tipo), subido.id, aISO(c.fechaCese ?? c.fechaInicio), nombreArchivo])
  subidos.push({ c, p, nombreArchivo, id: subido.id })
}

// ── 4 · LO QUE PASÓ ──────────────────────────────────────────────────────────
console.log(`\n═══ LEGAJOS ═══`)
console.log(`${APLICAR ? 'subidas' : 'a subir'}: ${subidos.length} · ya tenían: ${yaEstaban.length} · sin carpeta: ${sinCarpeta.length} · sin fila en personas: ${sinPersona.length}`)
for (const s of subidos) console.log(`   ${APLICAR ? '✓' : '·'} ${s.p.nombre_completo.padEnd(34)} ← ${s.nombreArchivo}`)
for (const y of yaEstaban) console.log(`   = ${y.p.nombre_completo.padEnd(34)} ya tiene «${y.comoSeLlama}»`)
for (const s of sinCarpeta) console.log(`   ⚠ ${s.p.nombre_completo}: está en personas pero no tiene carpeta de legajo`)
for (const s of sinPersona) console.log(`   ⚠ ${s.nombre} (CUIL ${s.cuil}): declarado en ARCA y sin fila en personas`)

// La prueba de la escritura es el dato leído en su destino, no la respuesta que dijo que sí.
if (APLICAR && subidos.length) {
  console.log(`\n─── releído del Drive ───`)
  for (const s of subidos) {
    const hay = (await listar(s.p.drive_folder_id)).map((f) => f.name)
    console.log(`   ${hay.includes(s.nombreArchivo) ? '✓' : '✗ NO ESTÁ'} ${s.p.nombre_completo}`)
  }
}

// ── 5 · EL CRUCE CON LA NÓMINA ───────────────────────────────────────────────
//
// ═══ LA RETRIBUCIÓN PACTADA CONTRA LA QUE SE PAGA ═══
//
// La constancia declara ante ARCA un valor hora y una categoría. La Nómina publica el valor hora
// que sale de la planilla del dueño. Son dos números del mismo hecho por dos caminos que no se
// hablan, así que compararlos dice algo.
//
// **La constancia congela el valor del DÍA DEL ALTA**: no se actualiza con cada paritaria. Que
// Quiroga Sebastián figure en $759 no significa nada — es su alta de 2023. Lo que sí significa es
// el caso contrario: **ARCA declara MÁS de lo que la planilla paga**, porque ahí el papel dice una
// cosa y la caja hace otra. Por eso sólo esos casos se marcan, y con su antigüedad al lado: en un
// alta reciente no hay paritaria que lo explique.
const nominaPorNombre = new Map()
try {
  const { makeGoogleClient, WRITE_SCOPES } = await import('../lib/google.mjs')
  const { loadConfig } = await import('../lib/config.mjs')
  const g = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })
  const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
  const v = await g.readSheetValues(ID, "'Nómina'!A1:L46")
  const cab = v.findIndex((r) => String(r?.[0] ?? '').trim() === 'Persona')
  const col = cab >= 0 ? v[cab].findIndex((c) => String(c ?? '').trim() === '$/h hoy') : -1
  if (cab >= 0 && col > 0) {
    for (let i = cab + 1; i < v.length && String(v[i]?.[0] ?? '').trim(); i++) {
      const n = String(v[i][0]).replace(/\s+▲.*$/, '').trim()
      if (/^⇒/.test(n)) break
      nominaPorNombre.set(n, Number(String(v[i][col] ?? '').replace(/[^\d,-]/g, '').replace(',', '.')) || null)
    }
  }
} catch (e) {
  // Un cruce que no se pudo hacer se declara; nunca se publica como «coinciden».
  console.log(`   ⚠ no pude leer la Nómina para cruzar el valor hora: ${e.message.slice(0, 90)}`)
}

console.log(`\n═══ CRUCE CON LA NÓMINA (${PERIODO}) ═══`)
// La tabla se adapta al papel: un lote de bajas no tiene nada que decir sobre el valor hora que se
// paga hoy —esa gente ya no cobra— y sí sobre cuándo terminó cada vínculo y por qué causal.
const HAY_BAJAS = constancias.some((c) => /baja/i.test(c.tipo))
console.log(HAY_BAJAS
  ? `${'PERSONA'.padEnd(34)} ${'DESDE'.padEnd(11)} ${'HASTA'.padEnd(11)} ${'CATEGORÍA'.padEnd(10)} ${'$/h ARCA'.padStart(8)}  CAUSAL`
  : `${'PERSONA'.padEnd(34)} ${'ALTA DESDE'.padEnd(12)} ${'CATEGORÍA'.padEnd(20)} ${'$/h ARCA'.padStart(9)} ${'$/h NÓMINA'.padStart(10)}  RECIBO`)
const pagaMenos = []
for (const c of constancias.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))) {
  const r = reciboDe.get(c.cuil)
  const hora = nominaPorNombre.get(c.nombre) ?? null
  // Sólo tiene sentido comparar contra lo que se paga HOY a quien sigue trabajando.
  if (!/baja/i.test(c.tipo) && hora != null && c.retribucion != null && hora < c.retribucion) pagaMenos.push({ c, hora })
  console.log(HAY_BAJAS
    ? `${c.nombre.slice(0, 33).padEnd(34)} ${(c.fechaInicio ?? '—').padEnd(11)} ${(c.fechaCese ?? '—').padEnd(11)} ` +
      `${(c.categoria ?? '—').slice(0, 9).padEnd(10)} ${(c.retribucion ?? 0).toLocaleString('es-AR').padStart(8)}  ${c.situacionBaja ?? '—'}`
    : `${c.nombre.slice(0, 33).padEnd(34)} ${(c.fechaInicio ?? '—').padEnd(12)} ${(c.categoria ?? '—').padEnd(20)} ` +
      `${(c.retribucion ?? 0).toLocaleString('es-AR').padStart(9)} ` +
      `${(hora == null ? (nominaPorNombre.size ? 'no está' : 'no medido') : hora.toLocaleString('es-AR')).padStart(10)}  ` +
      `${r ? Number(r.neto).toLocaleString('es-AR', { minimumFractionDigits: 2 }) : 'SIN RECIBO'}`)
}

// Las cuatro direcciones en las que las fuentes pueden no coincidir. Ninguna se resuelve sola.
const cuilConstancia = new Set(constancias.map((c) => c.cuil))
const huecos = []
// Un lote de BAJAS no dice nada sobre quién cobra hoy: son papeles de gente que se fue. Cruzarlo
// contra la quincena marcaría a los quince que trabajan como «no están en las constancias», que es
// ruido y además falso. Esos cruces valen para un lote de altas.
if (!HAY_BAJAS) {
  for (const r of recibos) {
    if (!cuilConstancia.has(r.cuil)) huecos.push(`cobra recibo y NO está en las constancias de ARCA: ${r.nombre_recibo} (CUIL ${r.cuil})`)
  }
  for (const [nombre, cuil] of Object.entries(CUIL_POR_PERSONA_DE_PLANILLA)) {
    if (!cuilConstancia.has(cuil)) huecos.push(`está en la planilla de jornales y NO en las constancias: ${nombre} (CUIL ${cuil})`)
  }
  for (const [nombre, porQue] of Object.entries(SIN_RECIBO_EN_LA_QUINCENA)) {
    huecos.push(`en la planilla sin recibo de la quincena: ${nombre} — ${porQue}`)
  }
}
const subcontratistas = new Set(Object.keys(SUBCONTRATISTAS_CON_LIQUIDACION))
for (const c of constancias) {
  const p = porCuil.get(c.cuil)
  const esBaja = /baja/i.test(c.tipo)
  if (p && !esBaja && !p.en_la_empresa) huecos.push(`ARCA lo declara ACTIVO y personas lo tiene de BAJA: ${c.nombre}`)
  // ═══ EL CIERRE QUE IMPORTA EN UN LOTE DE BAJAS ═══
  //
  // ARCA dice que el vínculo terminó. Si el OS sigue teniendo a esa persona en el plantel, la
  // pantalla la cuenta, la proyección la paga y nadie ve la diferencia — es el mismo desfase que
  // hizo que Jofre y Sosa aparecieran en el cuadro de la quincena Y en el de liquidaciones finales.
  if (p && esBaja && p.en_la_empresa) {
    huecos.push(`ARCA lo dio de BAJA el ${c.fechaCese} y en personas sigue activo: ${c.nombre} (legajo ${p.legajo ?? '?'})`)
  }
  // Alguien de baja que no es ni subcontratista declarado ni tiene liquidación final cargada: se le
  // dio de alta y de baja y nadie sabe qué se le pagó.
  if (esBaja && !subcontratistas.has(c.nombre) && !liquidacionDe.get(c.cuil) && !reciboDe.get(c.cuil)) {
    huecos.push(`baja sin encuadre en el OS —no es subcontratista declarado ni tiene liquidación cargada—: `
      + `${c.nombre}, ${c.fechaInicio} a ${c.fechaCese}, ${c.categoria} $${(c.retribucion ?? 0).toLocaleString('es-AR')}/h`)
  }
  // ═══ CÓMO SE ESCRIBE EL NOMBRE: MANDA EL REGISTRO ═══
  //
  // El recibo dice «SOSA NESTROR RAUL» y ARCA dice «SOSA NESTOR RAUL». El del recibo lo tipeó
  // alguien; el de ARCA es el del registro. La Nómina muestra el del recibo —es su fuente— así que
  // el typo llega hasta el papel que firma una persona, y encima fue la razón por la que el
  // emparejamiento por nombre falló en su momento. Se marca; no se corrige solo, porque cambiar un
  // nombre de recibo sin decirlo es peor que el typo.
  const r = liquidacionDe.get(c.cuil) ?? reciboDe.get(c.cuil)
  if (r && String(r.nombre_recibo).trim().toUpperCase() !== c.nombre.trim().toUpperCase()) {
    huecos.push(`el recibo lo escribe «${r.nombre_recibo}» y ARCA «${c.nombre}» (mismo CUIL ${c.cuil}): manda el registro`)
  }
  const enBase = p ? papelEnBase.get(`${p.id}·${tipoDeDocumento(c.tipo)}`) : null
  if (enBase && enBase.presente === false) huecos.push(`el legajo pedía ${esBaja ? 'la baja' : 'el alta'} y no tenía archivo: ${c.nombre}`)
}
// El papel declara más de lo que la caja paga. No es un desfasaje de paritaria —eso va al revés—:
// es la empresa pagando por debajo de lo que ella misma declaró ante ARCA.
for (const { c, hora } of pagaMenos) {
  const meses = c.fechaInicio
    ? Math.round((Date.now() - new Date(aISO(c.fechaInicio)).getTime()) / 2629800000) : null
  huecos.push(`ARCA declara $${c.retribucion.toLocaleString('es-AR')}/h y la Nómina paga `
    + `$${hora.toLocaleString('es-AR')}/h (${Math.round((1 - hora / c.retribucion) * 100)}% menos): `
    + `${c.nombre}, ${c.categoria}, alta ${c.fechaInicio}${meses != null ? ` (${meses} mes(es))` : ''}`)
}
if (!nominaPorNombre.size && !HAY_BAJAS) huecos.push('NO_MEDIDO: no se pudo leer el valor hora de la Nómina, así que el cruce contra la retribución pactada no se hizo')

console.log(`\n─── lo que no cierra (${huecos.length}) ───`)
for (const h of [...new Set(huecos)]) console.log(`   · ${h}`)
if (!APLICAR) console.log(`\n(sin --aplicar: no subí nada · ${subidos.length} archivo(s) quedarían subidos)`)

await closePool()
