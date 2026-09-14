import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

// ═══ LA GRILLA DE HORAS USA EL ANCHO DE LA PANTALLA ═══
//
// Dueño, 13/09/2026: «no entiendo por qué tiene tanto aire a la derecha». Liquidación → Horas
// terminaba en x = 1.140 a 1440 px: el contenedor llevaba `maxWidth: 1120` y los días eran columnas
// fijas de 30 px. Son dos mitades del mismo defecto: sacar sólo el techo corre el aire ADENTRO de la
// tabla (la columna del nombre, único `fr`, se lleva todo el sobrante). El test lee la fuente porque
// `node --test` no dibuja; la medición en el navegador quedó en las capturas del commit.

const DIR = dirname(fileURLToPath(import.meta.url))
const fuente = readFileSync(join(DIR, 'GrillaHorasQuincena.tsx'), 'utf8')

test('el contenedor raíz de la grilla no tiene techo de ancho', () => {
  const raiz = fuente.match(/<div data-testid="grilla-horas-quincena" style=\{\{([^}]*)\}\}>/)
  assert.ok(raiz, 'no se encontró el contenedor raíz `grilla-horas-quincena`')
  assert.doesNotMatch(raiz[1], /maxWidth/, 'un maxWidth en la raíz vuelve a dejar aire a la derecha')
})

test('las trece columnas de día se estiran: el sobrante no queda sólo para el nombre', () => {
  const m = fuente.match(/const COLUMNAS = '([^']+)'/)
  assert.ok(m, 'no se encontró COLUMNAS')
  assert.match(m[1], /repeat\(13,\s*minmax\(30px,\s*1fr\)\)/,
    `los días tienen que ser minmax(30px,1fr), no un ancho fijo: ${m[1]}`)
})
