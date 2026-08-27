#!/usr/bin/env node
// IMPORTAR UNA PUBLICACIÓN DEL CIRCOT A UN DATASET VERSIONADO.
//
// El CIRCOT publica todos los meses. Este script es el ÚNICO camino por el que esa publicación
// entra al OS, y deja el resultado en `orquestador/datos/circot/<archivo>.json` para que quede en
// git: la referencia con la que se cotizó en agosto tiene que seguir siendo legible en diciembre,
// y un PDF en el escritorio de alguien no cumple eso.
//
// No toca la Base Maestra, no escribe en Postgres y no pisa ningún precio. Produce un archivo.
//
//   node orquestador/scripts/circot-importar.mjs --pdf <ruta> --periodo 2026-07 [--salida <ruta>]

import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { leerPdf, renglones } from '../lib/ingesta/pdf.mjs'
import { parsearManoDeObra } from '../lib/circot/parser-mo.mjs'

const arg = (n, def = null) => {
  const i = process.argv.indexOf(`--${n}`)
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : def
}

const pdf = arg('pdf')
const periodo = arg('periodo')
if (!pdf || !periodo) {
  console.error('uso: circot-importar.mjs --pdf <ruta> --periodo AAAA-MM [--salida <ruta>]')
  process.exit(2)
}
if (!/^\d{4}-\d{2}$/.test(periodo)) {
  console.error(`el período tiene que ser AAAA-MM y vino «${periodo}» — sin período no se sabe con qué valores se cotizó`)
  process.exit(2)
}

const bytes = fs.readFileSync(pdf)
const hash = crypto.createHash('sha256').update(bytes).digest('hex').slice(0, 16)
const doc = await leerPdf(bytes, { conGeometria: false })
const paginas = doc.leidas.map((p) => renglones(p.textos))

const r = parsearManoDeObra(paginas, {
  periodo,
  fuente: 'CIRCOT · Centro de Investigación para la Racionalización de la Construcción Tradicional, FI-UNSJ',
  archivo: path.basename(pdf),
})

const salida = arg('salida', path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'datos', 'circot', `mano-de-obra-${periodo}.json`))
fs.mkdirSync(path.dirname(salida), { recursive: true })
fs.writeFileSync(salida, `${JSON.stringify({ ...r, hashArchivo: hash, importado: new Date().toISOString().slice(0, 10) }, null, 2)}\n`)

console.log(`${r.total} ítems · ${r.rubros.length} rubros · ${r.noLeidos.length} renglones no leídos`)
console.log(`rubros: ${r.rubros.join(' | ')}`)
for (const x of r.noLeidos) console.log(`  NO LEÍDO p.${x.pagina}: ${x.texto} → ${x.porQue}`)
console.log(`→ ${salida}`)
