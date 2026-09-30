import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

// ═══ UN MÓDULO QUE RENDERIZA EN EL SERVIDOR NO ESCRIBE HANDLERS ═══
//
// EL DEFECTO (Maldonado, jefe de obra, 30/09/2026): `/obras/hoy` en la PC mostró «No se pudo cargar la
// ficha de la obra · Minified React error #441» (digest 3902547586). Vercel: «Event handlers cannot be
// passed to Client Component props … onClick: function onClick». `RotuloObra` (29/09) le puso
// `onClick={(ev) => ev.stopPropagation()}` al <Link> sin ser 'use client': dentro de la Cartera (cliente)
// andaba; desde la página del jefe (servidor) tiraba la pantalla. En el teléfono el jefe va a /obra/hoy,
// por eso la prueba con iPhone salió verde. Ni tsc ni eslint lo ven.
//
// La regla: desde cada page/layout/template de `src/app` se recorre el grafo de imports por módulos SIN
// 'use client' (el grafo de servidor; un archivo 'use client' corta el recorrido). Ninguno de esos
// módulos puede escribir un handler inline (`onX={(…) => …}` / `onX={function …}`).

const SRC = new URL('../..', import.meta.url).pathname
const APP = join(SRC, 'app')

function archivos(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n)
    if (statSync(p).isDirectory()) return archivos(p)
    return /^(page|layout|template|not-found|loading|default)\.tsx$/.test(n) ? [p] : []
  })
}

const esCliente = (texto: string) => /^\s*(?:\/\/[^\n]*\n\s*|\/\*[\s\S]*?\*\/\s*)*['"]use client['"]/.test(texto)

function resolver(desde: string, spec: string): string | null {
  const base = spec.startsWith('@/') ? join(SRC, spec.slice(2)) : spec.startsWith('.') ? resolve(dirname(desde), spec) : null
  if (!base) return null
  for (const c of [base, `${base}.tsx`, `${base}.ts`, join(base, 'index.tsx'), join(base, 'index.ts')]) {
    if (existsSync(c) && statSync(c).isFile()) return c
  }
  return null
}

const importsPorValor = (texto: string) =>
  [...texto.matchAll(/^(?:import|export)\s+(?!type\s)[\s\S]*?\s+from\s+['"]([^'"]+)['"]/gm)].map((m) => m[1])

export const HANDLER_INLINE = /\bon[A-Z]\w*=\{\s*(?:async\s*)?(?:\([^)]*\)\s*=>|\w+\s*=>|function\b)/

export function violaciones(): string[] {
  const visto = new Set<string>()
  const pila = archivos(APP)
  const malas: string[] = []
  while (pila.length) {
    const archivo = pila.pop() as string
    if (visto.has(archivo)) continue
    visto.add(archivo)
    const texto = readFileSync(archivo, 'utf8')
    if (esCliente(texto)) continue
    if (archivo.endsWith('.tsx') && HANDLER_INLINE.test(texto)) malas.push(archivo.slice(SRC.length))
    for (const spec of importsPorValor(texto)) {
      const destino = resolver(archivo, spec)
      if (destino && !/\.test\.tsx?$/.test(destino)) pila.push(destino)
    }
  }
  return malas.sort()
}

test('ningún módulo del grafo de servidor escribe un handler inline', () => {
  assert.deepEqual(violaciones(), [])
})

test('el detector reconoce el defecto de RotuloObra y no confunde una server action', () => {
  assert.equal(HANDLER_INLINE.test('<Link href={h} onClick={(ev) => ev.stopPropagation()}>'), true)
  assert.equal(HANDLER_INLINE.test('<form onSubmit={async (e) => x(e)}>'), true)
  assert.equal(HANDLER_INLINE.test('<Boton onClick={function f() {}}>'), true)
  assert.equal(HANDLER_INLINE.test('<Editor onGuardar={guardarAction} />'), false)
  assert.equal(esCliente("// nota\n'use client'\n"), true)
})
