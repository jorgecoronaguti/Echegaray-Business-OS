// IMPORTAR EL ESTUDIADOR NO PUEDE DISPARAR EL ESTUDIO.
//
// POR QUÉ EXISTE (28/08/2026). `lib/conocimiento/cotizaciones.test.mjs` importa `fusionarHallazgos`
// de este script —una función pura— y el script llamaba `main()` en el cuerpo del módulo. Resultado
// medido: una corrida de `npm run orq:test` recorrió los 2.653 archivos de Drive y REESCRIBIÓ
// `biblioteca.json` y `hallazgos-cotizaciones.json`. La prueba no fue un razonamiento: los dos
// archivos quedaron con fecha de modificación 12:46:43, la hora exacta de la corrida.
//
// Esa vez no se perdió nada porque la biblioteca hace de memoria de idempotencia y volvió a escribir
// lo mismo. Con `--refrescar`, un archivo movido en Drive o un corte de red a mitad de camino, el
// test dejaba la base de conocimiento pisada — y nadie se enteraba, porque el test daba verde.
//
// ESTE TEST NO MIRA EL CÓDIGO, MIRA EL EFECTO. Comprobar que el archivo contiene la palabra
// `pathToFileURL` sería un test sobre la forma: seguiría en verde si alguien deja la guarda escrita
// y abajo una llamada suelta. Acá se importa el módulo en un proceso aparte y se verifica que los
// artefactos NO cambiaron — que es exactamente lo que falló.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync, statSync } from 'node:fs'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const aca = path.dirname(fileURLToPath(import.meta.url))
const script = path.join(aca, 'estudiar-cotizaciones-drive.mjs')
const datos = path.join(aca, '..', 'datos', 'conocimiento')
const ARTEFACTOS = ['biblioteca.json', 'hallazgos-cotizaciones.json']

/** Huella de un artefacto: contenido y fecha. `null` si todavía no existe — que no es un fallo. */
const huella = (nombre) => {
  const p = path.join(datos, nombre)
  try {
    return { sha: createHash('sha256').update(readFileSync(p)).digest('hex'), mtime: statSync(p).mtimeMs }
  } catch { return null }
}

test('importar el estudiador no corre el estudio ni toca la base de conocimiento', () => {
  const antes = Object.fromEntries(ARTEFACTOS.map((n) => [n, huella(n)]))

  // Proceso aparte y a propósito: `import()` dentro de este mismo proceso deja el módulo cacheado y
  // el segundo test no volvería a ejercitar la guarda. Además, si `main()` arrancara, el timeout
  // corta acá y no cuelga la suite entera.
  const salida = execFileSync(process.execPath, ['-e', `import(${JSON.stringify(script)}).then(() => console.log('IMPORTADO'))`], {
    encoding: 'utf8', timeout: 60_000, stdio: ['ignore', 'pipe', 'pipe'],
  })

  assert.match(salida, /IMPORTADO/, 'el módulo tiene que poder importarse')
  // El estudio imprime su progreso al importar si la guarda no está. Que no haya nada de eso es
  // parte de la prueba: no alcanza con que los archivos no cambien si el proceso salió a Drive.
  assert.doesNotMatch(salida, /inventari|estudiando|biblioteca v\d/i, 'importar no puede arrancar el estudio')

  for (const n of ARTEFACTOS) {
    const despues = huella(n)
    if (antes[n] == null) { assert.equal(despues, null, `importar creó ${n}, que no existía`); continue }
    assert.equal(despues?.sha, antes[n].sha, `importar reescribió ${n}`)
    assert.equal(despues?.mtime, antes[n].mtime, `importar tocó la fecha de ${n}`)
  }
})

// EL TEST NEGATIVO. Sin esto, el de arriba podría estar en verde por un motivo equivocado —por
// ejemplo, que el módulo ni siquiera se cargue— y nadie lo notaría. Acá se construye el caso que la
// guarda TIENE que dejar pasar: correr el script directo SÍ debe intentar el estudio. Se lo corre
// con `--ayuda`, que existe justamente para no salir a Drive, y se verifica que el punto de entrada
// llegó a ejecutarse. Si alguien "arregla" la guarda dejándola siempre en falso, esto se pone rojo.
test('correrlo directo SÍ ejecuta el punto de entrada', () => {
  let salida = ''
  try {
    salida = execFileSync(process.execPath, [script, '--ayuda'], { encoding: 'utf8', timeout: 60_000, stdio: ['ignore', 'pipe', 'pipe'] })
  } catch (e) {
    // Un script que aborta por falta de credenciales también probó que su main() arrancó.
    salida = `${e.stdout ?? ''}${e.stderr ?? ''}`
  }
  assert.notEqual(salida.trim(), '', 'ejecutado directo, el script tiene que dar señales de vida')
})
