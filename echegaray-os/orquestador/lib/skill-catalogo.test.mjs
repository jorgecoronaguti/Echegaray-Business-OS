// EL CATÁLOGO DE CAPACIDADES TIENE QUE COINCIDIR CON EL DISCO — Y EL GUARDRAIL TIENE QUE MORDER.
//
// El defecto que estos tests atrapan es el que ya pasó: `seed-inteligencia-organizacional.mjs`
// registraba las skills que su mapa de áreas nombraba y las demás quedaban FUERA sin que nada
// avisara. Una skill escrita que nadie puede activar es trabajo tirado, y el sistema se veía sano.
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import {
  parseFrontmatter, partirTools, clasificar, nivelIa, leerCatalogoDeDisco,
  skillsSinDeclarar, invalidarCache, SKILLS_AJENAS, SKILL_AREA,
} from './skill-catalogo.mjs'

test('parseFrontmatter lee nombre, descripción, tools y type', () => {
  const md = `---
name: finanzas-tesoreria-construccion
description: "Criterio experto de tesorería: caja, cobranzas."
allowed-tools: Read, Bash, WebSearch
metadata:
  author: echegaray-os
  type: expert-domain
---

# Título`
  const fm = parseFrontmatter(md)
  assert.equal(fm.nombre, 'finanzas-tesoreria-construccion')
  assert.equal(fm.descripcion, 'Criterio experto de tesorería: caja, cobranzas.')
  assert.deepEqual(fm.tools, ['Read', 'Bash', 'WebSearch'])
  assert.equal(fm.tipo, 'expert-domain')
})

test('parseFrontmatter arma la descripción de bloque `|` en una sola línea', () => {
  // `supabase` y `image-generation` declaran la descripción como bloque multilínea. Si el parser
  // se queda con la primera línea, el catálogo publica media descripción y el ruteo pierde
  // justamente las palabras de activación, que están en las líneas de abajo.
  const md = `---
name: supabase
description: |
  Todo lo relacionado con Supabase: crear tablas, migraciones, RLS.
  Activar cuando el usuario dice: necesito una tabla, crear tabla.
allowed-tools: Bash(curl *) Bash(export *) Read, Write
metadata:
  type: technical
---
`
  const fm = parseFrontmatter(md)
  assert.match(fm.descripcion, /Activar cuando el usuario dice/)
  assert.match(fm.descripcion, /^Todo lo relacionado/)
  assert.deepEqual(fm.tools, ['Bash', 'Read', 'Write'])
  assert.equal(fm.tipo, 'technical')
})

test('parseFrontmatter devuelve {} si no hay frontmatter', () => {
  assert.deepEqual(parseFrontmatter('# Una skill sin frontmatter'), {})
  assert.deepEqual(parseFrontmatter(''), {})
})

test('partirTools colapsa las restricciones del engine al nombre de la tool', () => {
  assert.deepEqual(partirTools('Bash(curl *) Bash(export *) Read'), ['Bash', 'Read'])
})

test('clasificar usa evidencia, no opinión', () => {
  assert.equal(clasificar({ clave: 'x', tipo: 'expert-domain', capacidades: ['advise.finance'], modulos: [] }), 'operativa')
  // El caso que motivó todo esto: existe el motor en el OS y NINGUNA capacidad la rutea.
  assert.equal(clasificar({ clave: 'financial-engineering', tipo: 'expert-domain', capacidades: [], modulos: ['orquestador/lib/ingenieria-financiera.mjs'] }), 'parcial')
  assert.equal(clasificar({ clave: 'prp', tipo: 'methodology', capacidades: [], modulos: [] }), 'herramienta_cli')
  assert.equal(clasificar({ clave: 'x', tipo: 'expert-domain', capacidades: [], modulos: [] }), 'huerfana')
  assert.equal(clasificar({ clave: 'ai', tipo: 'technical', capacidades: [], modulos: [] }), 'legacy')
})

test('nivelIa: sin código detrás no hay forma de responder sin modelo', () => {
  assert.equal(nivelIa({ tipo: 'expert-domain', modulos: [] }), 'razonamiento')
  assert.equal(nivelIa({ tipo: 'expert-domain', modulos: ['orquestador/lib/libro-iva.mjs'] }), 'asistido')
  assert.equal(nivelIa({ tipo: 'methodology', modulos: ['orquestador/lib/obras.mjs'] }), 'ninguno')
})

test('el catálogo real trae las 44 skills del disco, cada una con estado', async () => {
  const fichas = await leerCatalogoDeDisco({ refrescar: true })
  assert.ok(fichas.length >= 44, `esperaba al menos 44 skills, hay ${fichas.length}`)
  for (const f of fichas) {
    assert.ok(f.clave && f.nombre, `skill sin clave/nombre: ${JSON.stringify(f)}`)
    assert.ok(f.estadoOperativo, `${f.clave} sin estado operativo`)
    assert.ok(['ninguno', 'asistido', 'razonamiento'].includes(f.nivelIa), `${f.clave} nivelIa raro: ${f.nivelIa}`)
  }
  // La skill de finanzas es el caso de referencia: la rutea advise.finance y tiene módulos vivos.
  const finanzas = fichas.find((f) => f.clave === 'finanzas-tesoreria-construccion')
  assert.ok(finanzas.capacidades.includes('advise.finance'))
  assert.equal(finanzas.estadoOperativo, 'operativa')
})

test('los módulos del OS que cita una skill EXISTEN (una cita a un archivo borrado no cuenta)', async () => {
  const fichas = await leerCatalogoDeDisco({ refrescar: true })
  const fe = fichas.find((f) => f.clave === 'financial-engineering')
  assert.ok(fe.modulos.includes('orquestador/lib/ingenieria-financiera.mjs'))
  assert.equal(fe.estadoOperativo, 'parcial', 'tiene motor y ninguna capacidad la rutea')
})

test('GUARDRAIL: una skill nueva sin declarar NO pasa desapercibida', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'skills-'))
  try {
    await mkdir(path.join(dir, 'skill-nueva-sin-dueno'))
    await writeFile(path.join(dir, 'skill-nueva-sin-dueno', 'SKILL.md'),
      '---\nname: skill-nueva-sin-dueno\ndescription: "Algo nuevo."\nmetadata:\n  type: expert-domain\n---\n\n# Nueva\n')
    invalidarCache()
    const fichas = await leerCatalogoDeDisco({ dir, refrescar: true })
    assert.deepEqual(skillsSinDeclarar(fichas), ['skill-nueva-sin-dueno'])
  } finally {
    await rm(dir, { recursive: true, force: true })
    invalidarCache()
  }
})

test('GUARDRAIL: hoy TODAS las skills del repo están declaradas', async () => {
  const fichas = await leerCatalogoDeDisco({ refrescar: true })
  assert.deepEqual(skillsSinDeclarar(fichas), [],
    'una skill sin área, sin capacidad que la rutee y sin `metadata.type` no la puede activar nadie: declarala en skill-catalogo.mjs o ponele el frontmatter')
})

test('las claves declaradas en los mapas existen de verdad en disco', async () => {
  // Un mapa que nombra una skill borrada es una regla muerta que nadie ve morir.
  const fichas = await leerCatalogoDeDisco({ refrescar: true })
  const enDisco = new Set(fichas.map((f) => f.clave))
  for (const clave of [...Object.keys(SKILL_AREA), ...Object.keys(SKILLS_AJENAS)]) {
    assert.ok(enDisco.has(clave), `${clave} está declarada y no existe en .claude/skills/`)
  }
})

test('la metadata se cachea: la segunda lectura no vuelve a tocar el disco', async () => {
  invalidarCache()
  const a = await leerCatalogoDeDisco({})
  const b = await leerCatalogoDeDisco({})
  assert.equal(a, b, 'debe devolver la MISMA referencia; releer 44 archivos por consulta es el gasto que se quiere evitar')
  const c = await leerCatalogoDeDisco({ refrescar: true })
  assert.notEqual(a, c, 'con refrescar=true tiene que releer')
})
