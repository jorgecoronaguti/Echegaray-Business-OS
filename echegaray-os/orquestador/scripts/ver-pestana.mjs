#!/usr/bin/env node
// VER LA PESTAÑA. No leer sus celdas: VERLA, como la ve el dueño.
//
// POR QUÉ EXISTE (23/07). El dueño, sobre pestañas que yo había dado por buenas: "me resultan
// difíciles de entender", "las líneas se cortan", "la info no queda bien representada". Y tenía
// razón las tres veces, porque yo estaba diseñando A CIEGAS: leía valores por API y deducía cómo se
// veían. Una planilla no se ve como su grilla de valores — el ancho de una columna, una línea que
// arranca donde no hay dato, un texto que rebalsa sobre el número de al lado, un bloque que queda
// partido a mitad de pantalla: nada de eso aparece leyendo celdas.
//
// exportar-pestana-pdf.mjs ya traía el PDF, pero en esta máquina no había con qué RENDERIZARLO, así
// que el PDF se guardaba y nadie lo miraba. Esto lo convierte en imágenes que se pueden abrir.
//
// El ciclo correcto de trabajo sobre una pestaña es: escribir → VER → corregir. Nunca escribir →
// dar por buena.
//
//   node orquestador/scripts/ver-pestana.mjs "Impuestos y Financieros" [A1:O54] [salida.png]

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

const TITULO = process.argv[2]
const RANGO = process.argv[3] || 'A1:Z60'
const SALIDA = process.argv[4] || '/tmp/pestana.png'

if (!TITULO) {
  console.error('Uso: ver-pestana.mjs "Titulo" [A1:O54] [salida.png]')
  process.exit(1)
}

const pdf = SALIDA.replace(/\.png$/i, '') + '.pdf'
mkdirSync(dirname(SALIDA), { recursive: true })

execFileSync('node', [new URL('./exportar-pestana-pdf.mjs', import.meta.url).pathname, TITULO, RANGO, pdf], { stdio: 'inherit' })
if (!existsSync(pdf)) { console.error('no se generó el PDF'); process.exit(1) }

// PyMuPDF: rasteriza a 150 dpi, que es donde se ve si un texto se corta o una línea queda colgada.
const py = `
import fitz, sys
doc = fitz.open(${JSON.stringify(pdf)})
salidas = []
for i, page in enumerate(doc):
    pix = page.get_pixmap(dpi=150)
    out = ${JSON.stringify(SALIDA)}.replace('.png', f'-{i+1}.png') if len(doc) > 1 else ${JSON.stringify(SALIDA)}
    pix.save(out)
    salidas.append(out)
print('\\n'.join(salidas))
`
const imgs = execFileSync('python3', ['-c', py], { encoding: 'utf8' }).trim()
console.log(`✔ ${TITULO} → ${imgs.split('\n').length} imagen(es)`)
console.log(imgs)
