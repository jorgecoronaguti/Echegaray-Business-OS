#!/usr/bin/env node
// COMPLETA CADA LEGAJO CON LO QUE DICEN SUS PROPIOS ADJUNTOS DE DRIVE.
//
//   node orquestador/scripts/legajos-completar.mjs             # informa
//   node orquestador/scripts/legajos-completar.mjs --aplicar
//
// La ficha mostraba «sin cargar» en casi todo mientras el dato estaba impreso en un papel que ya
// está vinculado al legajo. La Libreta de Fondo de Cese del IERIC —60 de los 196 documentos— trae en
// una sola hoja: documento, nacionalidad, fecha de nacimiento, domicilio completo, categoría de
// convenio, especialidad, ART y fecha de ingreso. La constancia del fisco aporta las fechas de alta
// y cese, la obra social y la ART.
//
// ═══ TRES REGLAS ═══
//
// 1. SÓLO SE COMPLETA LO VACÍO. Lo que alguien cargó a mano no se toca nunca. La única excepción son
//    tres categorías que no son categorías —'004212', '6E60', '1591'—: entraron por un import mal
//    hecho, están declaradas como tales en el código, y ahora hay evidencia de cuál es la buena.
// 2. NADA SE TOMA DE UN PAPEL QUE NO NOMBRE A LA PERSONA DEL LEGAJO.
// 3. EL DNI SALE DEL CUIL CUANDO NO HAY LIBRETA, y no es una inferencia: los ocho dígitos del medio
//    del CUIL SON el número de documento. Es la misma cifra escrita de otra forma.
//
// LO QUE NO TIENE FUENTE SE QUEDA VACÍO: teléfono, email y contacto de emergencia no están en ningún
// papel del data room. El teléfono que trae la libreta es el de la empresa, no el de la persona.

import { createRequire } from 'node:module'
import { makeGoogleClient, WORKSPACE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { query } from '../lib/db.mjs'
import { dniDelCuil, libretaDelIeric, mismaPersona } from '../lib/legajos-contenido.mjs'

const { PDFParse } = createRequire(import.meta.url)('pdf-parse')
const enSeco = !process.argv.includes('--aplicar')

/** Categorías que no son categorías: códigos de un import viejo. Sobre éstas SÍ se escribe. */
export const CATEGORIAS_BASURA = new Set(['004212', '6E60', '1591'])

/** El convenio no se deduce del oficio: lo declara el papel. La libreta ES el instrumento de la Ley
 *  22.250 y la constancia del fisco dice «024 - Personal de la construcción Ley N°22250». */
export const CONVENIO = 'UOCRA — Ley 22.250 (construcción)'

async function textoDe(google, fileId) {
  const p = new PDFParse({ data: new Uint8Array(await google.descargarBytes(fileId)) })
  try { return String((await p.getText()).text ?? '') } finally { await p.destroy() }
}

async function main() {
  const google = makeGoogleClient({ config: await loadConfig(), scopes: WORKSPACE_SCOPES })
  const { rows: personas } = await query(
    `select id, nombre_completo, dni, cuil, fecha_nacimiento, nacionalidad, domicilio, categoria,
            especialidad, art, fecha_ingreso, convenio_colectivo
       from personas order by nombre_completo`)
  const { rows: docs } = await query(
    `select persona_id, drive_file_id, nombre, tipo_documento from documentacion_legajo
      where tipo_documento in ('libreta_fondo_cese', 'alta_temprana', 'baja')`)

  const cambios = []
  const sinLibreta = []
  for (const p of personas) {
    const suyos = docs.filter((d) => d.persona_id === p.id)
    let libreta = null
    for (const d of suyos.filter((x) => x.tipo_documento === 'libreta_fondo_cese')) {
      const l = libretaDelIeric(await textoDe(google, d.drive_file_id))
      // La libreta más completa gana: hay quien tiene dos y una está a medio llenar.
      if (l && l.nombre && mismaPersona(l.nombre, p.nombre_completo)) {
        const utiles = (x) => Object.values(x).filter(Boolean).length
        if (!libreta || utiles(l) > utiles(libreta)) libreta = l
      }
    }
    if (!libreta) sinLibreta.push(p)

    const nuevo = {}
    const poner = (campo, valor) => {
      if (valor && !p[campo]) nuevo[campo] = valor
    }
    poner('dni', libreta?.documento ?? dniDelCuil(p.cuil))
    poner('cuil', libreta?.cuil)
    poner('fecha_nacimiento', libreta?.nacimiento)
    poner('nacionalidad', libreta?.nacionalidad)
    poner('domicilio', libreta?.domicilio)
    poner('especialidad', libreta?.especialidad)
    poner('art', libreta?.art)
    poner('fecha_ingreso', libreta?.ingreso)
    // Un código de import no es una categoría: sobre eso sí se escribe.
    if (libreta?.categoria && (!p.categoria || CATEGORIAS_BASURA.has(p.categoria))) {
      nuevo.categoria = libreta.categoria
    }
    if (!p.convenio_colectivo && suyos.length > 0) nuevo.convenio_colectivo = CONVENIO

    if (Object.keys(nuevo).length > 0) cambios.push({ persona: p, nuevo })
  }

  console.log(`\nLEGAJOS            ${personas.length}`)
  console.log(`CON LIBRETA LEÍDA  ${personas.length - sinLibreta.length}`)
  console.log(`SE COMPLETAN       ${cambios.length}\n`)
  for (const c of cambios) {
    const q = Object.entries(c.nuevo).map(([k, v]) => `${k}=${v}`).join(' · ')
    console.log(`  · ${c.persona.nombre_completo}: ${q}`)
  }
  console.log(`\nSIN LIBRETA (${sinLibreta.length}) — su ficha se completa con lo que haya, o queda faltando:`)
  console.log('  ' + sinLibreta.map((p) => p.nombre_completo).join(' | '))

  if (enSeco) { console.log('\nEN SECO. Nada se escribió. Para aplicar: --aplicar\n'); return }
  for (const c of cambios) {
    const campos = Object.keys(c.nuevo)
    await query(
      `update personas set ${campos.map((k, i) => `${k} = $${i + 1}`).join(', ')} where id = $${campos.length + 1}`,
      [...campos.map((k) => c.nuevo[k]), c.persona.id])
  }
  console.log(`\n✓ ${cambios.length} legajos completados\n`)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
}
