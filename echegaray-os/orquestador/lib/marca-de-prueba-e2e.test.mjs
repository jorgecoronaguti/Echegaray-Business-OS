// LA REGLA DE LA MARCA, MEDIDA SOBRE LOS SPECS DE VERDAD.
//
// El último test de este archivo es el que importa: barre `tests/**` y falla si un spec escribe en
// un maestro con un nombre que no arranca con la marca. Los de arriba prueban el resolvedor con los
// casos que ya pasaron —los dos nombres que de verdad llegaron a producción— para que un cambio en
// el regex no se lleve la regla puesta sin que nadie se entere.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  auditarFuente, declaracionesDe, escriturasAMaestros, importacionesDe, llevaLaMarca, MARCA,
  raizLiteral,
} from './marca-de-prueba-e2e.mjs'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const TESTS = join(RAIZ, 'tests')

// ── LOS DOS QUE DE VERDAD LLEGARON A PRODUCCIÓN ────────────────────────────────────────────────

test('«QA NO DEBE ENTRAR ${Date.now()}» no lleva la marca — así entraron cuatro proveedores', () => {
  const fuente = `
    const r = await fetch(\`\${URL}/rest/v1/proveedores\`, {
      method: 'POST',
      body: JSON.stringify({ nombre: \`QA NO DEBE ENTRAR \${Date.now()}\` }),
    })`
  const fallas = auditarFuente(fuente, 'viejo.spec.ts')
  assert.equal(fallas.length, 1)
  assert.equal(fallas[0].tabla, 'proveedores')
  assert.match(fallas[0].queja, /no arranca con «ZZ»/)
})

test('«e2e-hh-${Date.now()}» tampoco — así quedaron dos personas en el plantel', () => {
  const fuente = `
    const MARCA = \`e2e-hh-\${Date.now()}\`
    await db.from('personas').insert({ nombre_completo: MARCA })`
  assert.equal(auditarFuente(fuente).length, 1)
})

test('con la marca puesta, los mismos dos casos pasan', () => {
  const bien = `
    const MARCA = \`ZZ-E2E hh \${Date.now()}\`
    await db.from('personas').insert({ nombre_completo: MARCA })
    const r = await fetch(\`\${URL}/rest/v1/proveedores\`, {
      method: 'POST',
      body: JSON.stringify({ nombre: \`ZZ-E2E NO DEBE ENTRAR \${Date.now()}\` }),
    })`
  assert.deepEqual(auditarFuente(bien), [])
})

// ── EL RESOLVEDOR ──────────────────────────────────────────────────────────────────────────────

test('el nombre se sigue a través de las variables, que es como lo escriben los specs', () => {
  const decl = declaracionesDe("const MARCA = 'ZZ-E2E'\nconst OTRA = `${MARCA} Peón Segundo`")
  assert.equal(raizLiteral('${OTRA} y algo', decl), 'ZZ-E2E')
  assert.equal(llevaLaMarca('${OTRA}', decl), true)
})

test('el alias se sigue, pero una llamada a función no se confunde con un alias', () => {
  const decl = declaracionesDe(
    "const MARCA_PRUEBA = 'ZZ-E2E'\nconst MARCA = MARCA_PRUEBA\nconst otro = calcular()\nconst c = obj.x")
  assert.equal(decl.get('MARCA'), 'MARCA_PRUEBA')
  assert.equal(raizLiteral('${MARCA} algo', decl), 'ZZ-E2E')
  assert.equal(decl.has('otro'), false, '`= calcular()` se tomó por un alias')
  assert.equal(decl.has('c'), false, '`= obj.x` se tomó por un alias')
})

test('una cadena que no llega a ningún literal devuelve null, no un falso verde', () => {
  const decl = declaracionesDe("const X = `${SIN_DECLARAR} cosa`")
  assert.equal(raizLiteral('${X}', decl), null)
  assert.equal(llevaLaMarca('${X}', decl), false, 'un nombre que no se pudo resolver pasó igual')
})

test('la marca se mide en la RAÍZ, no en cualquier parte del texto', () => {
  const decl = declaracionesDe("const M = 'proveedor ZZ-E2E'")
  assert.equal(llevaLaMarca('${M}', decl), false,
    'un nombre que sólo CONTIENE la marca no lo barre un `like \'ZZ%\'` anclado al principio')
})

test('sólo se miran los maestros: una fila de ejecución no la ve nadie en una pantalla', () => {
  const fuente = `await sb.from('obra_ejecucion').insert({ nombre: 'cualquier cosa' })`
  assert.deepEqual(auditarFuente(fuente), [])
})

test('un POST que no es POST no cuenta: leer `rest/v1/proveedores` es leer', () => {
  const fuente = `const r = await fetch(\`\${URL}/rest/v1/proveedores?select=id\`, { headers })`
  assert.deepEqual(auditarFuente(fuente), [])
})

test('se detecta el insert aunque el `.from()` y el `.insert()` estén en renglones distintos', () => {
  const fuente = "await sb.from('clientes')\n  .insert({ nombre: 'Cliente Nuevo' })"
  assert.equal(escriturasAMaestros(fuente).length, 1)
})

// ── EL BARRIDO DE VERDAD ───────────────────────────────────────────────────────────────────────

function archivosTs(dir) {
  const salida = []
  for (const nombre of readdirSync(dir)) {
    const ruta = join(dir, nombre)
    if (statSync(ruta).isDirectory()) salida.push(...archivosTs(ruta))
    else if (nombre.endsWith('.ts')) salida.push(ruta)
  }
  return salida
}

/**
 * Las declaraciones de los `./util/…` que este archivo importa: ahí vive casi toda `MARCA`.
 *
 * Y de los que ESOS importan: `spec → obras-e2e → rastro`. La marca canónica vive en `rastro.ts` y
 * `obras-e2e.ts` la reexporta, así que con un solo salto la cadena se corta a mitad de camino.
 */
function heredadasDe(ruta, fuente, saltos = 2) {
  const mapa = new Map()
  if (saltos <= 0) return mapa
  for (const rel of importacionesDe(fuente)) {
    for (const ext of ['.ts', '.mjs', '/index.ts']) {
      const destino = join(dirname(ruta), rel + ext)
      let texto
      try { texto = readFileSync(destino, 'utf8') } catch { continue }
      for (const [k, v] of heredadasDe(destino, texto, saltos - 1)) mapa.set(k, v)
      for (const [k, v] of declaracionesDe(texto)) mapa.set(k, v)
      break
    }
  }
  return mapa
}

test(`ningún spec escribe en un maestro con un nombre que no arranque con «${MARCA}»`, () => {
  const archivos = archivosTs(TESTS)
  assert.ok(archivos.length > 20, `se leyeron ${archivos.length} archivos: el barrido no encontró los specs`)
  const fallas = archivos.flatMap((ruta) => {
    const fuente = readFileSync(ruta, 'utf8')
    return auditarFuente(fuente, ruta.slice(RAIZ.length + 1), heredadasDe(ruta, fuente))
  })
  assert.deepEqual(fallas.map((f) => f.queja), [],
    `\n${fallas.map((f) => `  · ${f.queja}`).join('\n')}\n`)
})

test('y el barrido encuentra escrituras: si dejara de encontrarlas, pasaría por vacío', () => {
  const total = archivosTs(TESTS)
    .reduce((n, r) => n + escriturasAMaestros(readFileSync(r, 'utf8')).length, 0)
  assert.ok(total >= 6, `sólo encontré ${total} escrituras a maestros en tests/: el regex dejó de ver`)
})
