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
import fs from 'node:fs'
import os from 'node:os'
import { readFileSync, statSync } from 'node:fs'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { bloqueDeCorrida } from './estudiar-cotizaciones-drive.mjs'

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
// guarda TIENE que dejar pasar: correr el script directo SÍ debe ejecutar el punto de entrada.
//
// SE LO CORRE CON `--ayuda`, Y ESA BANDERA TIENE QUE EXISTIR DE VERDAD. Antes no existía: era una
// bandera desconocida, así que `main()` corría entero —2.656 archivos del data room y 237 planillas
// bajándose— durante 60 segundos, en CADA `npm run orq:test`. Por eso este test no se conforma con
// «hubo salida»: exige LA salida de la ayuda y un tiempo de ejecución que sólo es posible sin red.
// Si alguien borra `--ayuda`, el script vuelve a salir a Drive y estas dos afirmaciones se caen.
test('correrlo directo SÍ ejecuta el punto de entrada, y --ayuda corta antes de la red', () => {
  const t0 = Date.now()
  let salida = ''
  try {
    salida = execFileSync(process.execPath, [script, '--ayuda'], { encoding: 'utf8', timeout: 20_000, stdio: ['ignore', 'pipe', 'pipe'] })
  } catch (e) {
    // Un script que aborta por falta de credenciales también probó que su main() arrancó.
    salida = `${e.stdout ?? ''}${e.stderr ?? ''}`
  }
  const ms = Date.now() - t0
  assert.notEqual(salida.trim(), '', 'ejecutado directo, el script tiene que dar señales de vida')
  assert.match(salida, /--ayuda/, '`--ayuda` tiene que imprimir la ayuda: si imprime otra cosa, arrancó el estudio real')
  assert.ok(ms < 10_000, `--ayuda tardó ${ms} ms: eso no es imprimir un texto, es haber salido a la red`)
})

// ═══════════════════ LOS OTROS DOS COMANDOS DE LA MISMA FAMILIA ═══════════════════
//
// `dataset-hallazgos.mjs` y `migrar-practicas-historicas.mjs` leen y ESCRIBEN los mismos artefactos.
// Su guarda no estaba cubierta por nada: si mañana alguien vuelve a `file://${process.argv[1]}`,
// nada se ponía rojo. Y ese cambio no rompe ruidosamente — el comando deja de arrancar y sale con
// código 0 sin imprimir una línea, que es la peor forma de fallar que tiene un generador.

const HERMANOS = ['dataset-hallazgos.mjs', 'migrar-practicas-historicas.mjs']

for (const nombre of HERMANOS) {
  test(`importar ${nombre} no lo ejecuta ni toca los artefactos`, () => {
    const antes = Object.fromEntries(ARTEFACTOS.map((n) => [n, huella(n)]))
    const salida = execFileSync(process.execPath, ['-e', `import(${JSON.stringify(path.join(aca, nombre))}).then(() => console.log('IMPORTADO'))`], {
      encoding: 'utf8', timeout: 30_000, stdio: ['ignore', 'pipe', 'pipe'],
    })
    assert.match(salida, /IMPORTADO/)
    assert.doesNotMatch(salida, /═══|✓/, 'importar arrancó el comando')
    for (const n of ARTEFACTOS) assert.equal(huella(n)?.sha, antes[n]?.sha, `importar ${nombre} reescribió ${n}`)
  })

  test(`${nombre} arranca DESDE UNA RUTA CON ESPACIOS`, () => {
    // El caso que la plantilla `file://${process.argv[1]}` no aguanta: con un espacio en la ruta,
    // `import.meta.url` viene percent-encoded, la comparación da falso y el comando no arranca —
    // sin error y con código 0. Se lo invoca por un enlace dentro de un directorio con espacio, que
    // es exactamente lo que pasa en «.../mis documentos/...».
    const carpeta = fs.mkdtempSync(path.join(os.tmpdir(), 'con espacio '))
    try {
      // Copia y no enlace: node resuelve los symlinks antes de armar `import.meta.url`, así que el
      // enlace probaría otra cosa. Las importaciones relativas se apuntan al directorio original,
      // que es lo único que la copia no se lleva; lo que se ejercita es la guarda.
      const copia = path.join(carpeta, nombre)
      fs.writeFileSync(copia, readFileSync(path.join(aca, nombre), 'utf8')
        .replace(/from '\.\.\//g, `from '${pathToFileURL(path.join(aca, '..')).href}/`)
        .replace(/from '\.\//g, `from '${pathToFileURL(aca).href}/`))
      let salida = ''
      try {
        salida = execFileSync(process.execPath, [copia, '--dry'], { encoding: 'utf8', timeout: 30_000, stdio: ['ignore', 'pipe', 'pipe'] })
      } catch (e) { salida = `${e.stdout ?? ''}${e.stderr ?? ''}` }
      assert.notEqual(salida.trim(), '', `${nombre} no arrancó desde una ruta con espacios y salió sin decir nada`)
      assert.match(salida, /═══/, `${nombre} arrancó pero no llegó a su salida: ${salida.slice(0, 200)}`)
    } finally { fs.rmSync(carpeta, { recursive: true, force: true }) }
  })
}

test('los conteos de la corrida quedan EN EL DISCO, no sólo en la pantalla', () => {
  // «114 candidatas · 64 internas · 38 del cliente · 12 no leídas» era todo el respaldo de lo que
  // la rama afirmaba y vivía sólo en stdout. Un número que no está en ningún archivo no lo puede
  // verificar un tercero. Y las NO LEÍDAS viajan con su motivo: sin eso, «64 + 38» se lee como
  // «leí todo», que es la afirmación que la lista de no leídas existe para impedir.
  const r = {
    cotizaciones: [{}, {}], cliente: [{ clase: 'COTIZACION' }, { clase: 'COMPUTO' }],
    salteados: [{}], noLeidos: [{ nombre: 'Computos.xlsx', porQue: 'ninguna pestaña tiene encabezado de cotización' }],
    practicas: [1, 2, 3], practicasCliente: { practicas: [1, 2], sinCoeficiente: [1] },
  }
  const b = bloqueDeCorrida(r, { candidatas: 114 })
  assert.equal(b.candidatas, 114)
  assert.equal(b.plantillaInterna, 2)
  assert.equal(b.formatoDelCliente, 2)
  assert.deepEqual(b.formatoDelClientePorClase, { COTIZACION: 1, COMPUTO: 1 })
  assert.equal(b.noLeidas, 1)
  assert.equal(b.porQueNoSeLeyeron[0].archivo, 'Computos.xlsx')
  assert.match(b.porQueNoSeLeyeron[0].porQue, /encabezado de cotización/)
  assert.equal(b.practicasFormatoDelCliente, 2)
  assert.equal(b.cierresSinCoeficiente, 1)
})
