// NINGÚN MÓDULO USA UN SÍMBOLO QUE NO IMPORTÓ.
//
// ═══ EL DEFECTO QUE ESTE TEST EXISTE PARA VER ═══
//
// El 31/08/2026 (commit e7e6160c) se descubrió que `cotizador/orquestador.mjs` usaba
// `indirectoCalculado`, `indirectoAplicado` y `proyectarACascada` en la etapa COMMERCIAL sin
// importarlos. En ESM eso no es un error de parseo: es un `ReferenceError` en tiempo de ejecución
// que sólo se alcanza cuando la corrida trae `estructuraIndirecta` o
// `politicaEfectivaDeLaCotizacion` — los dos con default `null`. Ninguna corrida se los pasaba.
//
// El motor de indirectos y el de política versionada NUNCA corrieron, y la suite estuvo verde todo
// ese tiempo. No porque los tests fueran malos: porque **ningún test podía verlo**. Un test prueba
// el camino que ejercita, y ese camino no lo ejercitaba nadie. La corrección de e7e6160c agregó
// `capacidades-ejercitadas.test.mjs`, que ejercita ESAS dos ramas — y deja al siguiente `if`
// opcional que alguien escriba mañana exactamente igual de ciego.
//
// Este test mira otra cosa: no el comportamiento, la ESTRUCTURA. Un símbolo libre es un defecto
// ESTÁTICO —está ahí lo ejercite alguien o no— y se detecta sin correr una sola línea del módulo.
// Es la única forma de que la clase entera de defecto no dependa de que a alguien se le ocurra
// pasarle el argumento que despierta la rama.
//
// ═══ POR QUÉ NO ES UNA REGLA DE ESLINT Y ES UN TEST ═══
//
// `eslint.config.mjs` extiende `eslint-config-next`, que no enciende `no-undef` para los `.mjs` del
// orquestador — y por eso el lint estuvo verde junto con la suite. Encenderlo en la config general
// haría que `npx eslint .` tuviera que resolver los globals de Node para 2.010 archivos, incluidos
// los de la web. Acá se usa el mismo analizador de scope de ESLint (`Linter`, sin plugins ni
// resolución de config) sobre el núcleo del orquestador, y el resultado sale por donde sale la
// evidencia de cierre de este repo: `node --test`.
//
// LO QUE ESTE TEST NO VE: un símbolo que SÍ existe pero está mal (un import que apunta a otro
// módulo, una función con la firma cambiada). Eso lo ve el typecheck en TS y ningún control estático
// en `.mjs` — es un límite conocido, no un descuido.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Linter } from 'eslint'
import globals from 'globals'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const LIB = path.dirname(fileURLToPath(import.meta.url))
const ORQ = path.dirname(LIB)

/** Las carpetas que son el núcleo: lo que corre en producción. `scripts/` queda afuera a propósito
 *  —son 200 corridas manuales cuyo fallo es inmediato y visible—, y los `.test.mjs` también: un
 *  símbolo libre en un test lo delata el propio test al correr. */
const CARPETAS = ['lib', 'handlers', 'comunicacion', 'engines']

/**
 * LA ÚNICA EXCEPCIÓN, Y POR QUÉ.
 *
 * `balanz-navegador.mjs` arma funciones que NO corren en Node: se serializan y las evalúa Chromium
 * adentro de la página (`page.evaluate`). Ahí `document`, `window` y `location` existen de verdad.
 * La excepción es POR ARCHIVO y no por símbolo global: agregar `globals.browser` a la config
 * apagaría el control para los 880 módulos, incluidos los que nunca ven un navegador.
 */
const CON_CODIGO_DE_NAVEGADOR = Object.freeze(['lib/tesoreria/balanz-navegador.mjs'])

function modulos(raiz) {
  const salida = []
  const rec = (d) => {
    for (const n of readdirSync(d)) {
      const f = path.join(d, n)
      if (statSync(f).isDirectory()) rec(f)
      else if (n.endsWith('.mjs') && !n.endsWith('.test.mjs')) salida.push(f)
    }
  }
  for (const c of raiz) rec(path.join(ORQ, c))
  return salida
}

const CONFIG = {
  languageOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
    globals: { ...globals.node, ...globals.es2024 },
  },
  rules: { 'no-undef': 'error' },
}

/** Los símbolos libres de un archivo, como `ruta:línea 'x' is not defined`. Exportada para que el
 *  test de la MUTACIÓN de abajo use exactamente la misma función que el control. */
export function simbolosLibres(archivo, fuente) {
  return new Linter()
    .verify(fuente, CONFIG, archivo)
    .map((m) => `${path.relative(ORQ, archivo)}:${m.line} ${m.message}`)
}

test('ningún módulo del núcleo usa un símbolo que no declaró ni importó', () => {
  const archivos = modulos(CARPETAS)
  assert.ok(archivos.length > 500, `esperaba el núcleo entero y encontré ${archivos.length} módulos: el barrido no está mirando donde cree`)

  const hallazgos = []
  for (const f of archivos) {
    if (CON_CODIGO_DE_NAVEGADOR.includes(path.relative(ORQ, f))) continue
    hallazgos.push(...simbolosLibres(f, readFileSync(f, 'utf8')))
  }
  assert.deepEqual(hallazgos, [],
    `${hallazgos.length} símbolo(s) usados sin importar. Cada uno es un ReferenceError esperando la primera corrida que llegue a esa rama:\n  ${hallazgos.join('\n  ')}`)
})

test('EL CONTROL PUEDE DAR ROJO: se le saca el import a la etapa COMMERCIAL y lo caza', () => {
  // La mutación es el defecto REAL de e7e6160c, reproducido sobre el archivo real: se borra la línea
  // de import y se comprueba que los tres símbolos aparecen. Sin esto, «0 hallazgos» sería
  // indistinguible de un control que no mira nada — que es cómo `supuestosOcultos` publicaba un cero
  // constante durante semanas.
  const f = path.join(ORQ, 'lib/cotizador/orquestador.mjs')
  const original = readFileSync(f, 'utf8')
  assert.deepEqual(simbolosLibres(f, original), [], 'el archivo real tiene que estar limpio antes de mutarlo')

  const mutado = original
    .replace("import { indirectoCalculado, indirectoAplicado } from './indirectos.mjs'\n", '')
    .replace("import { proyectarACascada } from './politica-version.mjs'\n", '')
  assert.notEqual(mutado, original, 'la mutación no encontró los imports: si se renombraron, este test hay que actualizarlo')

  const hallazgos = simbolosLibres(f, mutado).join('\n')
  for (const s of ['indirectoCalculado', 'indirectoAplicado', 'proyectarACascada']) {
    assert.match(hallazgos, new RegExp(`'${s}' is not defined`), `el control no vio '${s}' — no puede dar rojo, y entonces su verde no vale`)
  }
})

test('la excepción de navegador está justificada: sin ella ese archivo daría rojo', () => {
  // Una lista de excepciones que no se prueba se convierte en el lugar donde se esconden los
  // defectos. Si mañana `balanz-navegador.mjs` deja de tener código de navegador, este test cae y
  // obliga a sacarlo de la lista en vez de dejarlo exento para siempre.
  for (const rel of CON_CODIGO_DE_NAVEGADOR) {
    const f = path.join(ORQ, rel)
    const hallazgos = simbolosLibres(f, readFileSync(f, 'utf8'))
    assert.ok(hallazgos.length > 0, `${rel} ya no necesita la excepción: sacalo de CON_CODIGO_DE_NAVEGADOR`)
    for (const h of hallazgos) {
      assert.match(h, /'(document|window|location|navigator)' is not defined/,
        `${rel} está exento por su código de navegador, y esto NO lo es: ${h}`)
    }
  }
})
