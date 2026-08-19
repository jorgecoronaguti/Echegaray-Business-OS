#!/usr/bin/env node
// LOS CUATRO PAPELES SUELTOS, RESUELTOS LEYENDO EL PAPEL.
//
//   node orquestador/scripts/legajos-sueltos-resueltos.mjs            # en seco
//   node orquestador/scripts/legajos-sueltos-resueltos.mjs --aplicar
//
// ═══ POR QUÉ HABÍAN QUEDADO SUELTOS Y POR QUÉ YA NO ═══
//
// `legajos-reorganizar.mjs` atribuye por NOMBRE de archivo, y con el nombre solo estos cuatro eran
// indecidibles: hay cinco Quiroga en el data room y tres Ferreyra, así que «Quiroga S.» y
// «Ferreyra A» daban para más de una persona. La regla —no mover lo que no se puede probar— estuvo
// bien: meter el alta de uno en el legajo de otro es el error caro de todo esto.
//
// Lo que faltaba no era una regla mejor: era ABRIR EL PAPEL. Los cuatro se leyeron, y adentro está
// el nombre completo con su CUIL o su DNI. Ya no hay nada que adivinar:
//
//   · `Alta - Quiroga S.pdf`      → constancia de alta de QUIROGA SEBASTIAN ADOLFO, CUIL
//                                   20-30501290-5, inicio 26/06/2023. Dice el nombre entero.
//   · `HM - QUIROGA S..pdf`       → MISMO CUIL 20-30501290-5. Y NO ES UN EXAMEN MÉDICO: es la
//                                   Libreta de Fondo de Cese Laboral del IERIC (Ley 22.250),
//                                   original N° 000004977978. El nombre del archivo miente.
//   · `EPP - FERREYRA A.pdf`      → planilla Res. 299/11 de ALEJANDRO FERREYRA, DNI 22.322.045,
//                                   entrega del 28/05/2025.
//   · `EPP - FERREYRA R.pdf`      → la misma planilla de RODOLFO FERREYRA, DNI 26.704.503.
//
// ═══ Y EL LEGAJO QUE ESTABA «A REVISAR» TAMBIÉN SE RESUELVE ═══
//
// La carpeta `QUIROGA SEBASTIAN` estaba apartada porque en la nómina hay dos Sebastián Quiroga
// —ALEXANDER SEBASTIAN (legajo 32) y SEBASTIAN ADOLFO (legajo 15)—. Su libreta lleva el original
// N° 000004977978 y el CUIL 20-30501290-5: es SEBASTIAN ADOLFO, y está ACTIVO.
//
// La carpeta se renombra con el nombre completo. No es cosmético: con «QUIROGA SEBASTIAN» a secas,
// el emparejamiento con la base empata contra los dos y queda sin vincular. Con el nombre entero,
// gana el que corresponde.
//
// NO BORRA NI RENOMBRA NINGÚN ARCHIVO. `HM - QUIROGA S..pdf` va al legajo con su nombre equivocado
// —renombrar el papel de alguien es una decisión suya—; lo que se corrige es la CATEGORÍA con la que
// entra al módulo, que es donde el dato decide.

import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'

const RAIZ = '1-ErhNuik6XI72Ku3SwBDrdFYUIcTsz-7'
const ACTIVOS = '1. ACTIVOS'
const INACTIVOS = '2. INACTIVOS (fuera de la nomina vigente)'

/** Cada mudanza lleva adjunta la evidencia que la habilita. Sin evidencia no hay mudanza. */
export const RESUELTOS = [
  { archivo: '1gfPH8pXpxdQIB4zjlaZd431Tld4xHyB5', nombre: 'Alta - Quiroga S.pdf',
    bucket: ACTIVOS, carpeta: 'QUIROGA SEBASTIAN ADOLFO',
    evidencia: 'la constancia dice QUIROGA SEBASTIAN ADOLFO, CUIL 20-30501290-5' },
  { archivo: '1KWC5eoeWnVcDayBclpeO6I5RT7Q4q-1k', nombre: 'HM - QUIROGA S..pdf',
    bucket: ACTIVOS, carpeta: 'QUIROGA SEBASTIAN ADOLFO',
    evidencia: 'libreta IERIC N° 000004977978, CUIL 20-30501290-5 (no es un examen médico)' },
  { archivo: '18s9dk5ZOQOvgGm1sKgAjTBBnDG1WRzR_', nombre: 'EPP - FERREYRA A.pdf',
    bucket: INACTIVOS, carpeta: 'FERREYRA ALEJANDRO',
    evidencia: 'planilla Res. 299/11 a nombre de Alejandro Ferreyra, DNI 22.322.045' },
  { archivo: '19IzKXfw0C413QGlqpjVnF5BvpmR92Ea4', nombre: 'EPP - FERREYRA R.pdf',
    bucket: INACTIVOS, carpeta: 'FERREYRA RODOLFO',
    evidencia: 'planilla Res. 299/11 a nombre de Rodolfo Ferreyra, DNI 26.704.503' },
]

/** El legajo que estaba apartado, con el nombre que lo vuelve inequívoco. */
export const DESAPARTAR = {
  carpetaActual: 'QUIROGA SEBASTIAN',
  desde: '3. A REVISAR - dos personas posibles',
  hacia: ACTIVOS,
  nombreNuevo: 'QUIROGA SEBASTIAN ADOLFO',
  evidencia: 'su libreta IERIC lleva el CUIL 20-30501290-5, el mismo del alta: es el legajo 15',
}

/**
 * LOS CINCO LEGAJOS QUE SE LLAMABAN CON UN APELLIDO Y NADA MÁS.
 *
 * Un apellido solo no identifica a nadie —hay cuatro González y cinco Quiroga— y además rompía el
 * emparejamiento: cualquier papel de esas personas parecía estar en el legajo de otra. El nombre
 * completo estaba impreso en la Libreta de Fondo de Cese que cada uno tiene en su propia carpeta.
 *
 * Se conservan tal como los escribe el formulario, con la inicial cortada incluida: el campo de la
 * libreta tiene ancho fijo y trunca. Completarla a ojo sería la única parte inventada de todo esto.
 */
export const NOMBRES_COMPLETOS = [
  { bucket: INACTIVOS, de: 'BALMACEDA', a: 'BALMACEDA GONZALEZ MAXIMILIANO A' },
  { bucket: INACTIVOS, de: 'ISAGUIRRE', a: 'ISAGUIRRE PABLO MARCOS' },
  { bucket: INACTIVOS, de: 'NARBAEZ', a: 'NARBAEZ FACUNDO S' },
  { bucket: INACTIVOS, de: 'SAAVEDRA', a: 'SAAVEDRA MAURICIO MIGUEL' },
  { bucket: INACTIVOS, de: 'SANCHEZ', a: 'SANCHEZ ACOSTA LEONARDO G' },
]

const enSeco = !process.argv.includes('--aplicar')

async function carpetasDe(google, padreId) {
  const hijos = await google.listarCarpeta(padreId, { tope: 3000 })
  return new Map(hijos
    .filter((h) => h.mimeType === 'application/vnd.google-apps.folder')
    .map((h) => [h.name, h.id]))
}

async function main() {
  const google = makeGoogleClient({ config: await loadConfig(), scopes: WRITE_SCOPES })
  const buckets = await carpetasDe(google, RAIZ)

  // ─── 1 · EL LEGAJO SALE DE «A REVISAR» ───────────────────────────────────────────────────────
  const enRevision = await carpetasDe(google, buckets.get(DESAPARTAR.desde))
  const carpetaId = enRevision.get(DESAPARTAR.carpetaActual)
  console.log(`\n${DESAPARTAR.carpetaActual} → ${DESAPARTAR.hacia}/${DESAPARTAR.nombreNuevo}`)
  console.log(`  porque ${DESAPARTAR.evidencia}`)
  if (!enSeco && carpetaId) {
    await google.renameFile(carpetaId, DESAPARTAR.nombreNuevo)
    await google.moveFile(carpetaId, buckets.get(DESAPARTAR.hacia))
  }

  // ─── 2 · LOS CUATRO PAPELES A SU LEGAJO ──────────────────────────────────────────────────────
  const destinos = new Map()
  for (const b of [ACTIVOS, INACTIVOS]) destinos.set(b, await carpetasDe(google, buckets.get(b)))
  if (!enSeco && carpetaId) destinos.get(ACTIVOS).set(DESAPARTAR.nombreNuevo, carpetaId)

  console.log('')
  for (const r of RESUELTOS) {
    const destino = destinos.get(r.bucket)?.get(r.carpeta)
    console.log(`${r.nombre} → ${r.bucket}/${r.carpeta}`)
    console.log(`  porque ${r.evidencia}`)
    if (!destino) { console.log('  ⚠ no existe esa carpeta: NO se mueve'); continue }
    if (!enSeco) await google.moveFile(r.archivo, destino)
  }

  // ─── 3 · LOS CINCO LEGAJOS DE UN SOLO APELLIDO ───────────────────────────────────────────────
  console.log('')
  for (const n of NOMBRES_COMPLETOS) {
    const id = destinos.get(n.bucket)?.get(n.de)
    console.log(`${n.de} → ${n.a}${id ? '' : '  (ya renombrada)'}`)
    if (!enSeco && id) await google.renameFile(id, n.a)
  }

  console.log(enSeco ? '\nEN SECO. Nada se movió. Para aplicar: --aplicar\n' : '\n✓ aplicado\n')
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
}
