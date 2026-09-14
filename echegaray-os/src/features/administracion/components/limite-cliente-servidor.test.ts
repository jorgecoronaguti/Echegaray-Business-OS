import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

// ═══ UN SERVER COMPONENT SÓLO LE PIDE COMPONENTES A UN ARCHIVO 'use client' ═══
//
// EL DEFECTO (QA, 14/09/2026): `ComprobantesDelProveedor` (servidor) importaba `COLS_COMPROBANTES`
// de `FilaComprobanteProveedor` ('use client'). Al cruzar el límite, lo que llega al servidor no es
// el string sino una referencia de cliente, y el encabezado quedó con un className basura y sin grid.
// Ni el typecheck ni eslint lo ven: el tipo dice `string`.
//
// La regla: desde un módulo SIN 'use client', lo importado de un módulo CON 'use client' tiene que
// ser un componente (PascalCase) o sólo un tipo. Constantes, funciones y objetos van a un módulo
// neutro. Se miran la feature y sus páginas.

const SRC = new URL('../../..', import.meta.url).pathname
const RAICES = [join(SRC, 'features/administracion'), join(SRC, 'app/(main)/administracion')]

function archivos(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n)
    if (statSync(p).isDirectory()) return archivos(p)
    return /\.tsx?$/.test(n) && !/\.test\.tsx?$/.test(n) ? [p] : []
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

/** Lo importado por VALOR: se descartan `import type` y los `type X` sueltos dentro de las llaves. */
function importadosPorValor(texto: string): { nombres: string[]; spec: string }[] {
  const salida: { nombres: string[]; spec: string }[] = []
  for (const m of texto.matchAll(/^import\s+(?!type\s)([\s\S]*?)\s+from\s+['"]([^'"]+)['"]/gm)) {
    const llaves = m[1].match(/\{([\s\S]*)\}/)?.[1] ?? ''
    const nombres = llaves.split(',').map((s) => s.trim()).filter((s) => s && !s.startsWith('type '))
      .map((s) => s.split(/\s+as\s+/).pop() as string)
    const porDefecto = m[1].replace(/\{[\s\S]*\}/, '').replace(/,/g, '').trim()
    if (porDefecto && !porDefecto.startsWith('*')) nombres.push(porDefecto)
    salida.push({ nombres, spec: m[2] })
  }
  return salida
}

export function violaciones(): string[] {
  const malas: string[] = []
  for (const archivo of RAICES.flatMap(archivos)) {
    const texto = readFileSync(archivo, 'utf8')
    if (esCliente(texto)) continue
    for (const { nombres, spec } of importadosPorValor(texto)) {
      const destino = resolver(archivo, spec)
      if (!destino || !esCliente(readFileSync(destino, 'utf8'))) continue
      // PascalCase = componente. `COLS_X` empieza en mayúscula pero no es PascalCase.
      for (const n of nombres) if (!/^[A-Z][a-z0-9]/.test(n)) malas.push(`${archivo.slice(SRC.length)} importa «${n}» de ${spec}`)
    }
  }
  return malas
}

test('ningún módulo de servidor importa un valor que no es componente desde un archivo use client', () => {
  assert.deepEqual(violaciones(), [])
})

test('el detector reconoce el defecto que motivó la regla', () => {
  const texto = "import { COLS_COMPROBANTES, FilaComprobanteProveedor } from './FilaComprobanteProveedor'"
  const [imp] = importadosPorValor(texto)
  assert.deepEqual(imp.nombres.filter((n) => !/^[A-Z][a-z0-9]/.test(n)), ['COLS_COMPROBANTES'])
  assert.equal(esCliente("// comentario\n'use client'\n"), true)
  assert.equal(esCliente("export const X = 'use client'"), false)
})
