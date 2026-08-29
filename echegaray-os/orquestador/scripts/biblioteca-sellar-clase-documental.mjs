#!/usr/bin/env node
// SELLAR LA CLASE DOCUMENTAL EN LOS CONOCIMIENTOS QUE YA ESTÁN EN LA BIBLIOTECA.
//
// ═══ POR QUÉ EXISTE ESTE SCRIPT Y NO SE REHACE LA CORRIDA ═══
//
// `aConocimientos()` no grababa la clase del documento del que salía cada frase. Resultado: las
// frases de «Charlar de diagrama de GANT.docx» —una nota de trabajo— quedaron en la biblioteca con
// procedencia DOCUMENTO_PROYECTO y confianza MEDIA, con la MISMA cara que las del contrato firmado.
// El código ya está arreglado, pero lo grabado sigue grabado.
//
// Rehacerlo saldría a Drive, y en este repo eso ya borró trabajo tres veces. No hace falta: la clase
// se DEDUCE de un dato que la biblioteca ya tiene —`evidencia.archivo`— con la misma función pura
// que usa la ingesta. No se inventa nada y no se lee ninguna fuente externa.
//
// Es IDEMPOTENTE: correrlo dos veces no cambia nada la segunda. Con `--dry` no escribe.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { claseDocumental } from '../lib/plano/documental.mjs'

const RUTA = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'datos', 'conocimiento', 'biblioteca.json')

/** La clase y la confianza que le corresponden a un conocimiento ya grabado. PURA. */
export function selloDe(k) {
  const archivo = k?.evidencia?.archivo
  if (!String(k?.clave ?? '').startsWith('documento-proyecto.') || !archivo) return null
  const clase = claseDocumental(archivo).id
  const confianza = clase === 'NOTA_INTERNA' ? 'BAJA' : (k.confianza ?? 'MEDIA')
  if (k.evidencia.clase === clase && k.confianza === confianza) return null
  return { clase, confianza }
}

function main() {
  const dry = process.argv.includes('--dry')
  const bib = JSON.parse(fs.readFileSync(RUTA, 'utf8'))
  const cambios = []
  for (const k of bib.conocimientos ?? []) {
    const s = selloDe(k)
    if (!s) continue
    cambios.push({ clave: k.clave, archivo: k.evidencia.archivo, de: k.confianza, a: s.confianza, clase: s.clase })
    k.evidencia = { ...k.evidencia, clase: s.clase }
    k.confianza = s.confianza
  }
  const porClase = cambios.reduce((a, c) => { a[c.clase] = (a[c.clase] ?? 0) + 1; return a }, {})
  console.log(`${cambios.length} conocimiento(s) sellados · ${JSON.stringify(porClase)}`)
  for (const c of cambios.filter((x) => x.clase === 'NOTA_INTERNA')) console.log(`  ${c.clase} ${c.de}→${c.a}  ${c.clave}  (${c.archivo})`)
  if (dry) { console.log('--dry: no se escribió nada'); return }
  if (!cambios.length) { console.log('nada que sellar'); return }
  bib.version = (bib.version ?? 0) + 1
  fs.writeFileSync(RUTA, `${JSON.stringify(bib, null, 1)}\n`)
  console.log(`biblioteca.json → v${bib.version}`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main()
