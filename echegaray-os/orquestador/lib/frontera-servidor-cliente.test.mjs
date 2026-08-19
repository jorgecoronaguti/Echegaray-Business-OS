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

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// UNA ARROW ESCRITA EN UN SERVER COMPONENT NO ES UNA SERVER ACTION
// ═══════════════════════════════════════════════════════════════════════════════════════════════
//
// ═══ EL DEFECTO QUE ESTE TEST CAZA ═══
//
// La página de la obra —Server Component— pasaba esto a un componente cliente:
//
//     soltarDocumento: (driveFileId: string) => asignarActividadADocumento(obraId, driveFileId, '')
//
// Eso COMPILA, pasa el typecheck y pasa el build. En producción la obra entera devolvía
// «A server error occurred» con:
//
//     Functions cannot be passed directly to Client Components unless you explicitly expose it
//     by marking it with "use server".
//
// La arrow es una función NUEVA creada en el servidor, no la acción importada. React sólo sabe
// serializar las que vienen de un módulo `'use server'` —directamente o por `.bind`—.
//
// Ya había pasado el 20/08 con `crearImpedimento`, y el comentario que lo explica está escrito en
// esa misma página tres líneas más abajo del error. Un comentario no es una guarda.
//
// LA REGLA: lo que cruza a un componente cliente se ata con `.bind`. Si la forma no coincide, se
// escribe la acción que falta en el archivo `'use server'`.
//
// ═══ CÓMO SE MIDE ═══
//
// En los archivos de `src/app` que NO son `'use client'`, ninguna prop de JSX puede valer una
// función. Se buscan las dos formas: `prop={(args) => …}` y `prop={function …}`.

test('ningún Server Component pasa una función CREADA ahí a un componente cliente', () => {
  const todos = archivos(RAIZ)
  const clientes = new Set(todos.filter((f) => esCliente(readFileSync(f, 'utf8'))))
  const paginas = archivos(join(RAIZ, 'app')).filter((f) => !clientes.has(f))
  // Las DOS formas en que una función se cuela: como prop directa —`prop={(x) => …}`— y como campo
  // de un objeto que viaja de prop —`acciones={{ soltar: (x) => … }}`—. La segunda es la que se
  // escapó el 20/08 y dejó la obra en «A server error occurred».
  //
  // Se deja pasar `prop={accion.bind(null, id)}`, que es la forma correcta, y `prop={<jsx/>}`, que
  // no es una función. Y NO matchea `{LISTA.map((x) => …)}`, que no arranca con un nombre de prop.
  const PROP_FUNCION = /^\s*([a-zA-Z_$][\w$]*)\s*(=\{|:)\s*(\([^)]*\)|[a-zA-Z_$][\w$]*)\s*(:[^=]+)?=>/
  // `[\s>]|$`: una etiqueta larga se abre sola en su línea —`<TabCronograma`— y el nombre termina en
  // fin de línea, no en un espacio. Sin el `$` el rastreo se quedaba con la etiqueta anterior y el
  // defecto que este test existe para cazar pasaba por al lado.
  const ABRE = /<([A-Z][\w$]*)(?=[\s>]|$)/

  const malos = []
  for (const archivo of paginas) {
    const src = readFileSync(archivo, 'utf8')
    const lineas = src.split('\n')
    // Qué archivo es cada componente importado por nombre. Sin esto no se puede distinguir una prop
    // que va a un componente CLIENTE —donde la arrow explota— de una que va a uno del servidor,
    // donde es perfectamente válida y hay varias en el repo.
    const deDonde = new Map()
    for (const linea of lineas) {
      const imp = importados(linea)
      if (!imp) continue
      const base = imp.desde.startsWith('@/') ? join(RAIZ, imp.desde.slice(2)) : resolve(dirname(archivo), imp.desde)
      const f = todos.find((x) => x === `${base}.tsx` || x === `${base}.ts`
        || x === join(base, 'index.tsx') || x === join(base, 'index.ts'))
      if (f) for (const n of imp.nombres) deDonde.set(n, f)
    }

    // El componente al que pertenece cada línea: la última etiqueta abierta más arriba.
    let actual = null
    lineas.forEach((linea, i) => {
      const abre = ABRE.exec(linea)
      if (abre) actual = abre[1]
      const m = PROP_FUNCION.exec(linea)
      if (!m || !actual) return
      const destino = deDonde.get(actual)
      if (!destino || !clientes.has(destino)) return
      malos.push(`${archivo.slice(RAIZ.length + 1)}:${i + 1} → <${actual}> ${m[1]}`)
    })
  }
  assert.deepEqual(malos, [],
    `una arrow escrita en un Server Component NO es una server action; se ata con .bind:\n${malos.join('\n')}`)
})
