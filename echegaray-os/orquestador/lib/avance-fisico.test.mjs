#!/usr/bin/env node
// Test del parser de avance físico (lib/avance-fisico.mjs). Hermético: sin red, sin DB,
// sin credencial — un cliente Google FAKE devuelve filas fixture. exit 0 = OK, 1 = falla.
// Cubre la heterogeneidad real del archivo "Avances de Obra": tracker con % en distinta
// columna, checklist sin estado, divisores de sección, y % como fracción.
import { avanceHoja } from './avance-fisico.mjs'

let ok = 0, fail = 0
function check(n, c) { if (c) ok++; else { fail++; console.error(`FALLA: ${n}`) } }
const fakeG = (rows) => ({ readSheetValues: async () => rows })

async function main() {
  // 1) Tracker estilo MS-Project (San Francisco): % Done en col 8, con divisores de sección.
  const sanFran = [
    [], ['', '', 'Project Start', '22-jun-26'], [],
    ['', '#', 'Activity', 'Comment', 'Start', 'End', 'Days', 'Status', '% Done'],
    ['', '', 'GALPON 1', '', '', '', '', '', '0%'],        // divisor de sección (sin #) → excluir
    ['', '1,01', 'Muro G 1/2', '', '', '', '', 'Completado', '100%'],
    ['', '1,02', 'Muro G 1/2', '', '', '', '', 'Completado', '100%'],
    ['', '2', 'Corte panel', '', '', '', '', '', '0%'],
  ]
  const a1 = await avanceHoja(fakeG(sanFran), 'San Francisco')
  check('MS-Project: estructurado', a1.estructurado === true)
  check('MS-Project: 3 actividades (excluye divisor)', a1.actividades === 3)
  check('MS-Project: 2 completas', a1.completadas === 2)
  check('MS-Project: promedio 67%', a1.avancePromedio === 67)

  // 2) % Done en OTRA columna (LE-Comedor tiene "Days R" antes de "% Done" → col 9).
  const leComedor = [
    [], ['', '', 'Project Name', 'La Estrella'], [],
    ['', '#', 'Activity', 'Comment', 'Start', 'End', 'Days', 'Status', 'Days R', '% Done'],
    ['', '2.01', 'Compra', '', '', '', '', '', '0.00', '0%'],
    ['', '2.02', 'Colocacion', '', '', '', '', '', '0.00', '0%'],
  ]
  const a2 = await avanceHoja(fakeG(leComedor), 'LE - Comedor')
  check('col %Done desplazada: estructurado', a2.estructurado === true)
  check('col %Done desplazada: 0% real', a2.avancePromedio === 0 && a2.actividades === 2)

  // 3) Checklist sin columna de estado (Estrella) → no estructurado, NO inventa.
  const estrella = [
    ['', '', 'Compra de Materiales', 'Estado'],
    ['', 'Chapa debajo de la'], ['', 'Escalera - Fabricar'],
  ]
  const a3 = await avanceHoja(fakeG(estrella), 'Estrella')
  check('checklist: no estructurado', a3.estructurado === false)

  // 4) % como fracción (0.5) → 50%.
  const frac = [
    ['', '#', 'Actividad', '% Done'],
    ['', '1', 'Tarea A', '0.5'],
    ['', '2', 'Tarea B', '1'],
  ]
  const a4 = await avanceHoja(fakeG(frac), 'Frac')
  check('fracción 0.5 → 50%, promedio (50+1)/2', a4.estructurado === true && a4.avancePromedio === Math.round((50 + 1) / 2))

  console.log(`\navance-fisico.test: ${ok} OK, ${fail} FALLA`)
  process.exit(fail ? 1 : 0)
}
main().catch((e) => { console.error(e); process.exit(1) })
