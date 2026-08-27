// EL CICLO AUTÓNOMO NO PUEDE DEPENDER DEL PROVEEDOR — y no alcanza con prometerlo en un comentario.
//
// El ciclo corre cuatro veces por día por timer y es lo que mantiene vivo el aprendizaje de obra. Si
// alguna de sus dependencias importara la puerta al modelo, el día que se caiga el proveedor —o se
// acabe el crédito— el OS dejaría de aprender sin avisar: por fuera se ve igual que uno sano.
//
// Esta prueba recorre el grafo de imports REAL del script, no una lista escrita a mano.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const AQUI = dirname(fileURLToPath(import.meta.url))

/** Todos los módulos del repo que un archivo alcanza, directa o indirectamente. */
function grafoDeImports(entrada, vistos = new Set()) {
  if (vistos.has(entrada) || !existsSync(entrada)) return vistos
  vistos.add(entrada)
  const src = readFileSync(entrada, 'utf-8')
  for (const m of src.matchAll(/^\s*import\s[^'"]*from\s+['"](\.[^'"]+)['"]/gm)) {
    grafoDeImports(resolve(dirname(entrada), m[1]), vistos)
  }
  // El `import()` dinámico cuenta igual: cargar la puerta al modelo a mitad de camino la carga.
  for (const m of src.matchAll(/import\(\s*['"](\.[^'"]+)['"]\s*\)/g)) {
    grafoDeImports(resolve(dirname(entrada), m[1]), vistos)
  }
  return vistos
}

test('el ciclo de XSAS no alcanza la puerta al modelo por ningún camino', () => {
  const grafo = grafoDeImports(resolve(AQUI, 'xsas-ciclo.mjs'))
  const puerta = [...grafo].filter((f) => /\/lib\/ia\//.test(f))
  assert.deepEqual(puerta, [], `el ciclo llega a la puerta del modelo por: ${puerta.join(', ')}`)
})

test('el estado de XSAS tampoco: describir la inteligencia no puede necesitar la inteligencia', () => {
  // Si describir el estado necesitara el modelo, no habría forma de saber que está caído.
  const grafo = grafoDeImports(resolve(AQUI, 'xsas-estado.mjs'))
  // `capacidad.mjs` sí entra: es la tabla de qué modelo se usaría para cada cosa, no una llamada.
  const llamadas = [...grafo].filter((f) => /\/lib\/ia\/cliente\.mjs$/.test(f))
  assert.deepEqual(llamadas, [])
})

test('el script de a mano SÍ la alcanza — es el único que escala al modelo', () => {
  // La contracara: si esto dejara de ser cierto, la zona gris no tendría quién la mire y el test de
  // arriba pasaría por el motivo equivocado.
  const grafo = grafoDeImports(resolve(AQUI, 'xsas-clasificar-actividades.mjs'))
  assert.ok([...grafo].some((f) => /\/lib\/ia\/cliente\.mjs$/.test(f)))
})
