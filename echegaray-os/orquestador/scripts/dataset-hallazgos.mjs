// NORMALIZA LOS HALLAZGOS YA ESTUDIADOS A UN DATASET AUDITABLE. 0 API, 0 red.
//
//   entrada: datos/conocimiento/hallazgos-cotizaciones.json   (lo que produjo el estudio)
//            datos/conocimiento/biblioteca.json               (sólo para poner nombre a los id)
//   salida:  datos/conocimiento/dataset-hallazgos.json
//
// ═══ POR QUÉ NO VUELVE A ESTUDIAR NADA ═══
//
// Rehacer el estudio significa salir a Drive, bajar 114 planillas y reescribir la biblioteca. Este
// comando no toca ninguna de las dos cosas: lee el artefacto que ya existe y lo normaliza. Correr
// el pipeline para producir una vista ya costó trabajo perdido tres veces.
//
// ═══ NO ES UNA SEGUNDA BASE ═══
//
// Es una VISTA de `hallazgos-cotizaciones.json`, derivada y regenerable: se puede borrar y volver a
// producir sin perder nada. Lo que sí es conocimiento —las prácticas— vive en la biblioteca y no
// se duplica acá.
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { cargar } from '../lib/conocimiento/biblioteca.mjs'
import { dataset, indiceDesdeBiblioteca } from '../lib/conocimiento/dataset-hallazgos.mjs'
import { aprendizajes, patrones, resumenDeAprendizaje } from '../lib/conocimiento/aprendizaje-cotizacion.mjs'
import { RUTA_HALLAZGOS, leerHallazgos } from './estudiar-cotizaciones-drive.mjs'

export const RUTA_DATASET = path.join(path.dirname(RUTA_HALLAZGOS), 'dataset-hallazgos.json')

const bandera = (n) => process.argv.includes(`--${n}`)

function main() {
  const hallazgos = leerHallazgos()
  if (!hallazgos.length) {
    console.error(`no hay hallazgos en ${RUTA_HALLAZGOS}: corré primero el estudio, este comando no estudia nada`)
    process.exit(1)
  }
  const indice = indiceDesdeBiblioteca(cargar())
  const d = dataset(hallazgos, { indice })

  console.log(`\n═══ DATASET DE HALLAZGOS ═══\n${d.total} filas · ${d.huecos.length} huecos declarados`)
  console.log('\ncobertura por campo:')
  for (const [campo, { llenos, vacios }] of Object.entries(d.cobertura)) {
    const pct = d.total ? Math.round((llenos / d.total) * 100) : 0
    console.log(`  ${campo.padEnd(28)} ${String(llenos).padStart(4)} llenos · ${String(vacios).padStart(4)} vacíos  (${pct}%)`)
  }
  const porSeveridad = d.filas.reduce((a, f) => { a[f.severidad] = (a[f.severidad] ?? 0) + 1; return a }, {})
  console.log(`\nseveridad: ${Object.entries(porSeveridad).map(([k, v]) => `${k} ${v}`).join(' · ')}`)
  const sinControl = d.filas.filter((f) => !f.control_que_lo_detecto)
  if (sinControl.length) console.log(`⚠ ${sinControl.length} fila(s) sin control asociado: ${[...new Set(sinControl.map((f) => f.tipo_anomalia))].join(', ')}`)

  // ═══ EL APRENDIZAJE SE INFORMA, NO SE GUARDA ACÁ ═══
  //
  // Los candidatos que salen de estos hallazgos viven en la biblioteca, y a la biblioteca la
  // escribe el estudio. Este comando los calcula para poder decir cuántos son y de qué forma, y no
  // los persiste: si los escribiera en su propio archivo habría dos bases del mismo conocimiento y
  // una de las dos quedaría vieja.
  const ps = patrones(hallazgos)
  const r = resumenDeAprendizaje(aprendizajes(hallazgos))
  console.log(`\naprendizaje (entra a la biblioteca en la próxima corrida del estudio):`)
  console.log(`  candidatos ${r.generados} · validados ${r.validados} · rechazados ${r.rechazados} · pendientes ${r.pendientes}`)
  for (const p of ps.slice(0, 5)) {
    console.log(`  ${String(p.casos).padStart(4)} casos · ${p.tipo}${p.concepto ? ` · «${String(p.concepto).slice(0, 60)}»` : ''} → control ${p.controlSugerido}`)
  }

  if (bandera('dry')) { console.log('\n--dry: no se escribió nada'); return }
  fs.writeFileSync(RUTA_DATASET, `${JSON.stringify({ generado: new Date().toISOString(), origen: path.basename(RUTA_HALLAZGOS), ...d }, null, 1)}\n`)
  console.log(`\n✓ dataset en ${RUTA_DATASET}`)
}

// Un módulo se importa; un comando se ejecuta.
//
// `pathToFileURL` y no la plantilla `file://${...}`: la plantilla no escapa la ruta, así que un
// espacio o un acento en el path la vuelve distinta de `import.meta.url` y el comando NO ARRANCA —
// sale con código 0 sin hacer nada y sin imprimir un error. Un fallo silencioso en un generador es
// peor que un fallo ruidoso: parece que corrió.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
