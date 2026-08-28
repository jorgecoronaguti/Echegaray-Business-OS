// RETIRA LAS 190 PRÁCTICAS QUE QUEDARON MARCADAS `EXPERIENCIA_ECSAS`. 0 API, 0 red, 0 Drive.
//
//   node orquestador/scripts/migrar-practicas-historicas.mjs --dry   ← muestra qué haría
//   node orquestador/scripts/migrar-practicas-historicas.mjs
//
// ═══ QUÉ PROBLEMA RESUELVE ═══
//
// `EXPERIENCIA_ECSAS` significa «lo medimos nosotros EJECUTANDO». Un coeficiente tipeado en una
// planilla de 2021 no se midió ejecutando: se tipeó. El circuito ya estampa la procedencia correcta
// —`PRACTICA_HISTORICA_ECSAS`—, pero las 190 entradas viejas siguen en el disco, y como la
// procedencia entra en el `id`, la próxima corrida del estudio NO las pisa: agrega 190 al lado y
// `saber()` devuelve las dos versiones de la misma clave.
//
// ═══ QUÉ HACE, Y QUÉ NO ═══
//
// NO reescribe `procedencia`: ninguna función de `biblioteca.mjs` escribe ese campo, y esa es la
// invariante que impide que un dato mejore de categoría por edición. Lo que hace es RETIRARLAS con
// `reemplazar()`: quedan en el archivo con estado REEMPLAZADO —sin ellas no se puede explicar una
// cotización hecha con el criterio anterior— y fuera de `saber()`, apuntando al id donde vive (o va
// a vivir) su reemplazo.
//
// ═══ EL EFECTO QUE HAY QUE MIRAR DESPUÉS ═══
//
// Mientras el estudio no vuelva a correr, esas 190 claves quedan SIN práctica viva. Es a propósito:
// una práctica con la procedencia equivocada afirma más de lo que puede sostener, y un hueco
// declarado vale más que un dato sobrevendido. La corrida siguiente de
// `estudiar-cotizaciones-drive.mjs` las repone con la procedencia correcta y con los ocho campos.
import { pathToFileURL } from 'node:url'
import { cargar, guardar, inventario } from '../lib/conocimiento/biblioteca.mjs'
import { retirarPracticasSuperadas } from '../lib/conocimiento/practica-historica.mjs'

function main() {
  const dry = process.argv.includes('--dry')
  const bib = cargar()
  const { biblioteca, retirados } = retirarPracticasSuperadas(bib, { cuando: new Date().toISOString().slice(0, 10) })

  console.log(`\n═══ PRÁCTICAS SUPERADAS ═══\nantes: ${JSON.stringify(inventario(bib).porProcedencia)}`)
  console.log(`a retirar: ${retirados.length} · con reemplazo ya presente: ${retirados.filter((r) => r.yaEsta).length}`)
  for (const r of retirados.slice(0, 5)) console.log(`  ${r.clave}\n    ${r.de} → ${r.a}${r.yaEsta ? '' : ' (todavía no existe: lo produce la próxima corrida del estudio)'}`)
  if (retirados.length > 5) console.log(`  … y ${retirados.length - 5} más`)

  if (!retirados.length) { console.log('\nno hay nada que retirar: la base ya está migrada'); return }
  if (dry) { console.log('\n--dry: no se escribió nada'); return }
  const version = guardar(biblioteca)
  console.log(`\n✓ biblioteca v${version}: ${JSON.stringify(inventario(biblioteca).porEstado)}`)
}

// `pathToFileURL` y no `file://${...}`: con un espacio en la ruta la plantilla no coincide, el
// comando no arranca y sale con código 0 sin decir nada.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
