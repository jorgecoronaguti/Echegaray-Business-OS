// UN VALOR NO CRUZA LA FRONTERA DE SERVER COMPONENTS.
//
// ═══ EL DEFECTO QUE ESTE TEST HABRÍA CAZADO ═══
//
// La página de la obra —Server Component— importaba `SUBVISTAS`, un array, desde `TabCronograma.tsx`,
// que empieza con `'use client'`. Eso COMPILA, pasa el typecheck y pasa el build. En producción la
// pantalla entera devolvía «A server error occurred» con:
//
//     TypeError: {imported module …/TabCronograma.tsx}.SUBVISTAS.some is not a function
//
// Lo que cruza esa frontera desde un módulo cliente no es el valor: es una REFERENCIA al módulo. Los
// componentes se proxean —por eso `<TabCronograma />` anda—; un array o una constante, no.
//
// La regla: lo que necesitan las dos orillas vive en un módulo NEUTRAL, sin `'use client'`.
//
// ═══ CÓMO SE MIDE ═══
//
// Un import con nombre en minúscula desde un archivo cliente es un valor. Los componentes van en
// mayúscula por convención de React y los tipos viajan con `type`, que se borra al compilar.

import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '../../src')

function archivos(dir, ext = /\.tsx?$/) {
  const salida = []
  for (const n of readdirSync(dir)) {
    const p = join(dir, n)
    if (statSync(p).isDirectory()) salida.push(...archivos(p, ext))
    else if (ext.test(n)) salida.push(p)
  }
  return salida
}

const esCliente = (src) => /^\s*['"]use client['"]/.test(src)

/** `import { A, type B, c } from '…'` → los nombres importados que NO son `type`. */
function importados(linea) {
  const m = linea.match(/import\s*\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/)
  if (!m) return null
  const nombres = m[1].split(',').map((x) => x.trim()).filter(Boolean)
    .filter((x) => !x.startsWith('type '))
    .map((x) => x.split(/\s+as\s+/)[0].trim())
  return { nombres, desde: m[2] }
}

test('ningún Server Component importa un VALOR de un módulo `use client`', () => {
  const todos = archivos(RAIZ)
  const clientes = new Set(todos.filter((f) => esCliente(readFileSync(f, 'utf8'))))
  const rutaDe = (desde, archivo) => {
    const base = desde.startsWith('@/') ? join(RAIZ, desde.slice(2)) : resolve(dirname(archivo), desde)
    return todos.find((f) => f === `${base}.tsx` || f === `${base}.ts` || f === join(base, 'index.tsx') || f === join(base, 'index.ts'))
  }

  const malos = []
  for (const archivo of todos) {
    const src = readFileSync(archivo, 'utf8')
    if (esCliente(src)) continue
    for (const linea of src.split('\n')) {
      const imp = importados(linea)
      if (!imp || (!imp.desde.startsWith('.') && !imp.desde.startsWith('@/'))) continue
      const destino = rutaDe(imp.desde, archivo)
      if (!destino || !clientes.has(destino)) continue
      // Mayúscula = componente de React, y ésos SÍ cruzan: el runtime los proxea.
      const valores = imp.nombres.filter((n) => /^[a-z]/.test(n) || /^[A-Z_]+$/.test(n))
      for (const v of valores) {
        malos.push(`${archivo.replace(RAIZ, 'src')} importa \`${v}\` de ${imp.desde} (que es 'use client')`)
      }
    }
  }
  assert.deepEqual(malos, [], `\n${malos.join('\n')}\n\nMovelo a un módulo sin 'use client'.`)
})
