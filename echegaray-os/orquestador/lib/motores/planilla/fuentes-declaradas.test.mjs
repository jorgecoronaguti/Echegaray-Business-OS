// LA LISTA DE FUENTES NO SE MANTIENE A MANO: SE DEDUCE DEL CÓDIGO.
//
// ═══ POR QUÉ EXISTE (01/09/2026, auditoría) ═══
//
// `PROHIBIDOS_ESCRIBIR` tenía UN solo id. El P&L, el Avance de obras y el espejo de JORNALES —los
// otros Sheets de producción del repo— quedaban escribibles por este motor. Es la trampa de la red
// de seguridad que se alimenta de una lista, que este repo ya pagó: **su modo de falla es el
// silencio**. Olvidarse de agregar un archivo no da error; da una escritura sobre una fuente.
//
// La defensa principal se invirtió (se escribe sólo donde el llamador DECLARÓ que quiere escribir),
// pero el piso sigue existiendo, y un piso desactualizado es peor que ninguno porque da confianza.
//
// Este test deduce los Sheets de producción DEL CÓDIGO —los `export const *_FILE_ID` /
// `*_SHEET_ID` que el repo declara— y exige que cada uno esté CLASIFICADO: o es fuente y está en el
// piso, o alguien decidió a propósito que el motor pueda escribirlo. Un Sheet nuevo sin clasificar
// pone esto en rojo el día que se agrega, no el día que se pisa.
//
// Es el mismo criterio que `conexion-fuentes.mjs`: la tabla tipeada envejece, el código no.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

import { PROHIBIDOS_ESCRIBIR } from './motor.mjs'

const LIB = path.join(path.dirname(new URL(import.meta.url).pathname), '..', '..')

/**
 * LOS SHEETS QUE EL REPO DECLARA COMO SUYOS: `export const <ALGO>_FILE_ID = '<id>'`.
 *
 * Se leen con `fs` y NO con `grep`: este repo tiene al menos un archivo con bytes NUL
 * (`lib/preservar-anotaciones.mjs`) que `grep` trata como binario y SALTEA en silencio. Una
 * auditoría por grep devolvería una lista corta sin avisar que no miró todo.
 */
function idsDeclarados(dir) {
  const RE = /export const ([A-Z0-9_]*(?:FILE_ID|SHEET_ID))\s*=\s*'([A-Za-z0-9_-]{25,})'/g
  const out = []
  const recorrer = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const f = path.join(d, e.name)
      if (e.isDirectory()) { if (e.name !== 'node_modules') recorrer(f); continue }
      if (!e.name.endsWith('.mjs') || e.name.endsWith('.test.mjs')) continue
      for (const m of fs.readFileSync(f, 'utf8').matchAll(RE)) {
        out.push({ constante: m[1], id: m[2], archivo: path.relative(LIB, f) })
      }
    }
  }
  recorrer(dir)
  return out
}

/**
 * LO QUE EL MOTOR SÍ PUEDE ESCRIBIR AUNQUE SEA UN SHEET DECLARADO.
 *
 * Vacío hoy, y con nombre propio a propósito: agregar un id acá es una DECISIÓN que se ve en el
 * diff y que alguien firma. Meterlo "porque el test molesta" es exactamente lo que este test
 * intenta hacer visible.
 */
const ESCRIBIBLES_A_PROPOSITO = Object.freeze(new Set([]))

test('FUENTES · todo Sheet de producción declarado en el código está clasificado', () => {
  const declarados = idsDeclarados(LIB)
  // El piso protege contra el caso en que el regex deje de matchear y la auditoría mire una lista
  // vacía: cero sin clasificar sobre cero archivos no es una garantía, es un descuido.
  assert.ok(declarados.length >= 3,
    `sólo encontré ${declarados.length} Sheets declarados: ¿cambió la forma de declararlos?`)

  const sinClasificar = declarados.filter((d) => !PROHIBIDOS_ESCRIBIR.has(d.id) && !ESCRIBIBLES_A_PROPOSITO.has(d.id))
  assert.deepEqual(sinClasificar.map((d) => `${d.constante} (${d.archivo})`), [],
    'Estos Sheets de producción no están clasificados. O son FUENTE —y van a PROHIBIDOS_ESCRIBIR de '
    + 'motor.mjs— o alguien decide que el motor puede escribirlos y los pone en ESCRIBIBLES_A_PROPOSITO. '
    + 'Dejarlos afuera significa que este motor los puede pisar.')
})

test('FUENTES · el piso no tiene ids muertos: cada uno corresponde a algo que el repo declara', () => {
  const vivos = new Set(idsDeclarados(LIB).map((d) => d.id))
  const CASH_FLOW = '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
  // El Cash Flow no se declara con un `*_FILE_ID` exportado (vive embebido en varios módulos), así
  // que se lo exceptúa NOMBRÁNDOLO. Cualquier otro id del piso que no exista en el código es basura
  // que da una sensación de protección sobre un archivo que ya nadie usa.
  const muertos = [...PROHIBIDOS_ESCRIBIR].filter((id) => id !== CASH_FLOW && !vivos.has(id))
  assert.deepEqual(muertos, [], 'ids en PROHIBIDOS_ESCRIBIR que el código ya no declara en ninguna parte')
})

test('FUENTES · el Cash Flow sigue en el piso', () => {
  assert.ok(PROHIBIDOS_ESCRIBIR.has('1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'))
})
