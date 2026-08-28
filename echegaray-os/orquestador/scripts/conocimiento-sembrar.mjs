#!/usr/bin/env node
// SIEMBRA LA BIBLIOTECA TÉCNICA: el padrón de fuentes y lo que ya se estudió.
//
// Es IDEMPOTENTE: correrlo dos veces no duplica nada. Y no toca la red salvo que se le pida
// `--bajar`, porque el conocimiento ya está extraído — lo que se guarda es el conocimiento, no el
// PDF. Sin `--bajar`, el hash del documento se toma del archivo local si está, y si no queda
// declarado como pendiente, que es distinto de inventarlo.
//
//   node orquestador/scripts/conocimiento-sembrar.mjs
//   node orquestador/scripts/conocimiento-sembrar.mjs --pdf /ruta/mano.pdf
import fs from 'node:fs'
import crypto from 'node:crypto'
import * as F from '../lib/conocimiento/fuentes.mjs'
import * as B from '../lib/conocimiento/biblioteca.mjs'
import { CONOCIMIENTOS, INCONSISTENCIAS, documentoDelPaper, URL as URL_PAPER } from '../lib/conocimiento/estudiado-navas-2012.mjs'

const args = process.argv.slice(2)
const rutaPdf = args[args.indexOf('--pdf') + 1]

const hashDelPdf = () => {
  if (!rutaPdf || args.indexOf('--pdf') === -1 || !fs.existsSync(rutaPdf)) return null
  return `sha256:${crypto.createHash('sha256').update(fs.readFileSync(rutaPdf)).digest('hex')}`
}

const hash = hashDelPdf() ?? `url:${crypto.createHash('sha256').update(URL_PAPER).digest('hex').slice(0, 32)}`
if (!hashDelPdf()) console.log('⚠ sin --pdf: el documento se identifica por su URL, no por su contenido. Con el archivo local el hash detecta si la fuente cambió.')

const fuentes = F.cargar()
const vFuentes = F.guardar(fuentes)

let bib = B.cargar()
bib = B.incorporar(bib, {
  documentos: [documentoDelPaper(hash)],
  conocimientos: [...CONOCIMIENTOS, ...INCONSISTENCIAS],
})
const vBib = B.guardar(bib)

const inv = B.inventario({ ...bib, version: vBib })
console.log(`padrón de fuentes    v${vFuentes} · ${fuentes.length} fuentes (${fuentes.filter((f) => f.estado === F.ESTADO.CURADA).length} curadas)`)
console.log(`biblioteca técnica   v${vBib} · ${inv.documentos} documento(s) · ${inv.conocimientos} conocimiento(s)`)
console.log(`  por etapa          ${JSON.stringify(inv.porEtapa)}`)
console.log(`  por estado         ${JSON.stringify(inv.porEstado)}`)
console.log(`  por procedencia    ${JSON.stringify(inv.porProcedencia)}`)
const s = B.saber({ ...bib }, 'cuadrilla.jornada_efectiva_h')
console.log(`\nprueba de lectura (0 red, 0 modelo): «cuadrilla.jornada_efectiva_h» → ${s.encontrados[0]?.valor} ${s.encontrados[0]?.unidad}`)
console.log(`  lo dice: «${String(s.encontrados[0]?.evidencia?.textoLiteral).slice(0, 90)}…» (p. ${s.encontrados[0]?.evidencia?.pagina})`)
