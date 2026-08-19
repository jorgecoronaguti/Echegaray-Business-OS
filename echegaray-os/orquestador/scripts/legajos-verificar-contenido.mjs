#!/usr/bin/env node
// ABRE CADA PAPEL DEL LEGAJO Y VERIFICA QUE SEA LO QUE SU NOMBRE DICE, Y DE QUIEN DICE.
//
//   node orquestador/scripts/legajos-verificar-contenido.mjs             # informa
//   node orquestador/scripts/legajos-verificar-contenido.mjs --aplicar   # corrige tipo y carga CUIL
//
// El módulo dedujo el tipo de cada documento del NOMBRE del archivo, y ya se encontraron dos que
// mienten. Esto lo mide en serio: baja los 196 papeles, les saca el texto y compara.
//
// TRES COSAS SALEN DE ACÁ:
//   1. El TIPO real del documento, cuando el papel lo declara.
//   2. Si está en el legajo CORRECTO — el nombre impreso contra el dueño de la carpeta.
//   3. El CUIL, que hoy falta en casi todos los legajos y está impreso en cada alta.
//
// LO QUE NO SE PUEDE LEER SE DECLARA. Buena parte del data room son fotos sin capa de texto. Para
// ésas el nombre del archivo sigue siendo lo único que hay, y el informe dice cuántas son. Un
// porcentaje de verificación que no cuenta lo no verificable no verifica nada.
//
// NO MUEVE NI BORRA NADA EN DRIVE. Si un papel está en el legajo equivocado lo DICE, con el nombre
// que leyó adentro: mover un documento entre legajos por una lectura automática de un escaneo es
// exactamente el error que se está tratando de evitar.

import { createRequire } from 'node:module'
import { makeGoogleClient, WORKSPACE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { query } from '../lib/db.mjs'
import {
  coberturaDeLaConstancia, cuilDelTexto, fechasDeLaConstancia, mismaPersona, nombreDelTexto,
  tipoSegunContenido,
} from '../lib/legajos-contenido.mjs'

const { PDFParse } = createRequire(import.meta.url)('pdf-parse')
const enSeco = !process.argv.includes('--aplicar')

async function textoDe(bytes) {
  const p = new PDFParse({ data: new Uint8Array(bytes) })
  try { return String((await p.getText()).text ?? '') } finally { await p.destroy() }
}

async function main() {
  const google = makeGoogleClient({ config: await loadConfig(), scopes: WORKSPACE_SCOPES })
  const { rows: docs } = await query(
    `select d.id, d.drive_file_id, d.nombre, d.tipo_documento, p.id as persona_id,
            p.nombre_completo, p.cuil, p.fecha_ingreso, p.fecha_egreso, p.obra_social, p.art,
            p.en_la_empresa
       from documentacion_legajo d join personas p on p.id = d.persona_id
      order by p.nombre_completo, d.nombre`)

  const sinTexto = []
  const sinDeclarar = []
  const tipoCorregido = []
  const enOtroLegajo = []
  const cuiles = new Map()
  // Lo que la constancia del fisco DECLARA de cada persona. Se junta por persona y gana la fecha más
  // reciente: quien entró, salió y volvió a entrar tiene varias constancias.
  const declarado = new Map()
  const mayor = (a, b) => (!a ? b : !b ? a : (a > b ? a : b))
  let leidos = 0

  for (const d of docs) {
    let texto = ''
    try { texto = await textoDe(await google.descargarBytes(d.drive_file_id)) }
    catch { sinTexto.push({ ...d, motivo: 'no se pudo abrir' }); continue }

    const tipo = tipoSegunContenido(texto)
    if (!tipo) {
      (texto.replace(/\s+/g, ' ').trim().length < 200 ? sinTexto : sinDeclarar).push(d)
      continue
    }
    leidos++
    if (tipo !== d.tipo_documento) tipoCorregido.push({ ...d, tipo })

    const nombre = nombreDelTexto(texto)
    if (nombre && !mismaPersona(nombre, d.nombre_completo)) enOtroLegajo.push({ ...d, dice: nombre })
    // NADA SE TOMA DE UN PAPEL QUE NO NOMBRE A LA PERSONA DE LA CARPETA. Es la única defensa contra
    // leerle los datos de uno al legajo de otro, que es peor que no tenerlos.
    const esDeEsaPersona = nombre && mismaPersona(nombre, d.nombre_completo)
    if (!esDeEsaPersona) continue

    const cuil = cuilDelTexto(texto)
    if (cuil && !d.cuil) cuiles.set(d.persona_id, { cuil, fuente: d.nombre })

    if (tipo === 'alta_temprana' || tipo === 'baja') {
      const { inicio, cese } = fechasDeLaConstancia(texto)
      const { obraSocial, art } = coberturaDeLaConstancia(texto)
      const previo = declarado.get(d.persona_id) ?? { persona: d }
      declarado.set(d.persona_id, {
        ...previo,
        inicio: mayor(previo.inicio, inicio),
        cese: mayor(previo.cese, cese),
        obraSocial: previo.obraSocial ?? obraSocial,
        art: previo.art ?? art,
        fuente: d.nombre,
      })
    }
  }

  const pct = (n) => `${Math.round((n / docs.length) * 100)}%`
  console.log(`\nPAPELES            ${docs.length}`)
  console.log(`LEÍDOS POR DENTRO  ${leidos} (${pct(leidos)})`)
  console.log(`SIN CAPA DE TEXTO  ${sinTexto.length} (${pct(sinTexto.length)}) — escaneos y fotos: el nombre es lo único que hay`)
  console.log(`NO SE DECLARAN     ${sinDeclarar.length} — tienen texto pero no dicen qué formulario son`)

  console.log(`\nTIPO DISTINTO AL QUE DICE EL NOMBRE (${tipoCorregido.length}):`)
  for (const t of tipoCorregido) console.log(`  · ${t.nombre_completo} · ${t.nombre}: ${t.tipo_documento} → ${t.tipo}`)

  console.log(`\nEN EL LEGAJO DE OTRA PERSONA (${enOtroLegajo.length}) — NO se mueven, los mira alguien:`)
  for (const e of enOtroLegajo) console.log(`  · ${e.nombre} está en ${e.nombre_completo} y adentro dice «${e.dice}»`)

  console.log(`\nCUIL LEÍDO DEL PAPEL (${cuiles.size}):`)
  for (const [id, c] of cuiles) {
    console.log(`  · ${docs.find((x) => x.persona_id === id).nombre_completo}: ${c.cuil} (de ${c.fuente})`)
  }

  // LA FECHA DE CESE SÓLO SE CARGA A QUIEN LA NÓMINA YA DIO POR IDO. Hay gente que se fue, volvió y
  // hoy trabaja: su constancia de baja vieja no la vuelve a dar de baja.
  const conFechas = [...declarado.entries()]
    .map(([id, x]) => ({ id, ...x, cese: x.persona.en_la_empresa ? null : x.cese }))
    .filter((x) => (x.inicio && !x.persona.fecha_ingreso) || (x.cese && !x.persona.fecha_egreso)
      || (x.obraSocial && !x.persona.obra_social) || (x.art && !x.persona.art))
  console.log(`\nLO QUE DECLARA LA CONSTANCIA DEL FISCO (${conFechas.length}):`)
  for (const x of conFechas) {
    const partes = []
    if (x.inicio && !x.persona.fecha_ingreso) partes.push(`ingreso ${x.inicio}`)
    if (x.cese && !x.persona.fecha_egreso) partes.push(`egreso ${x.cese}`)
    if (x.obraSocial && !x.persona.obra_social) partes.push(`OS ${x.obraSocial}`)
    if (x.art && !x.persona.art) partes.push('ART')
    console.log(`  · ${x.persona.nombre_completo}: ${partes.join(' · ')}`)
  }

  if (enSeco) { console.log('\nEN SECO. Nada se escribió. Para aplicar: --aplicar\n'); return }

  for (const t of tipoCorregido) {
    await query('update documentacion_legajo set tipo_documento = $1 where id = $2', [t.tipo, t.id])
  }
  for (const [id, c] of cuiles) {
    await query('update personas set cuil = $1 where id = $2 and cuil is null', [c.cuil, id])
  }
  for (const x of conFechas) {
    await query(
      `update personas set fecha_ingreso = coalesce(fecha_ingreso, $1::date),
                           fecha_egreso  = coalesce(fecha_egreso,  $2::date),
                           obra_social   = coalesce(obra_social,   $3),
                           art           = coalesce(art,           $4)
        where id = $5`,
      [x.inicio, x.cese, x.obraSocial, x.art, x.id])
  }
  console.log(
    `\n✓ ${tipoCorregido.length} tipos corregidos · ${cuiles.size} CUIL cargados · ` +
    `${conFechas.length} legajos completados con lo que declara el fisco\n`)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
}
