import test from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  SIN_GENERADOR, constantesDeModulo, escribeEnElSheet, esPestanaAuxiliar,
  importaciones, pestanasAuxiliaresDe, MANTENIDAS_POR_DINAMICA, coberturaDeDinamica, MARGEN_DINAMICA,
} from './pestanas-auxiliares.mjs'
import { PASOS } from './flujo-caja-pasos.mjs'

const AQUI = dirname(fileURLToPath(import.meta.url))
const DIR_SCRIPTS = join(AQUI, '..', 'scripts')

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// EL DETECTOR, CONTRA FUENTES SINTÉTICAS
// ══════════════════════════════════════════════════════════════════════════════════════════════════

test('esPestanaAuxiliar: sólo las réplicas del OS, no una pestaña visible', () => {
  assert.equal(esPestanaAuxiliar('_CRUCE_ARCA'), true)
  assert.equal(esPestanaAuxiliar('_BANCO_RAW'), true)
  assert.equal(esPestanaAuxiliar('Proveedores'), false)
  assert.equal(esPestanaAuxiliar('Cash Flow Mensual'), false)
  assert.equal(esPestanaAuxiliar(null), false)
})

test('constantesDeModulo lee el estilo real del repo: con y sin export, con Ñ', () => {
  const c = constantesDeModulo("export const PESTAÑA = '_CRUCE_ARCA'\nconst OTRA = '_MOVIMIENTOS'\n")
  assert.equal(c.get('PESTAÑA'), '_CRUCE_ARCA')
  assert.equal(c.get('OTRA'), '_MOVIMIENTOS')
})

test('constantesDeModulo NO toma un nombre escrito adentro de una fórmula', () => {
  // `tarjeta-pestana.mjs` hace exactamente esto: LEE `_BANCO_RAW`, no es su dueña.
  const c = constantesDeModulo(`  const RF = "'_BANCO_RAW'!$A$4:$A$1000"\n`)
  assert.equal([...c.values()].some(esPestanaAuxiliar), false)
})

test('importaciones resuelve el alias y el import multilínea', () => {
  const imp = importaciones("import {\n  A,\n  B as C,\n} from '../lib/x.mjs'\n")
  assert.deepEqual(imp.map((i) => [i.modulo, i.nombre, i.local]),
    [['../lib/x.mjs', 'A', 'A'], ['../lib/x.mjs', 'B', 'C']])
})

test('pestanasAuxiliaresDe encuentra la que llega POR IMPORT, no sólo la literal', () => {
  // `cash-flow-vistas.mjs` e `impuestos-pestana.mjs` nombran su réplica así: la constante vive en
  // lib/. Un detector que sólo mirara literales del propio archivo los daría por no-escritores.
  const fuente = "import { PESTANA_PRESUPUESTO } from '../lib/cash-flow-presupuesto.mjs'\n"
  const encontradas = pestanasAuxiliaresDe(fuente, (mod, nombre) =>
    (mod.endsWith('cash-flow-presupuesto.mjs') && nombre === 'PESTANA_PRESUPUESTO' ? '_PRESUPUESTO_MENSUAL' : null))
  assert.deepEqual(encontradas, ['_PRESUPUESTO_MENSUAL'])
})

test('escribeEnElSheet distingue un generador de un auditor de sólo lectura', () => {
  assert.equal(escribeEnElSheet("import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'"), true)
  assert.equal(escribeEnElSheet("import { makeGoogleClient } from '../lib/google.mjs'"), false)
})

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// EL DEFECTO QUE ESTE ARCHIVO EXISTE PARA ATRAPAR
// ══════════════════════════════════════════════════════════════════════════════════════════════════
//
// `_CRUCE_ARCA` se escribió por última vez el 04/08 y `Materiales` la seguía leyendo el 14/08 con 290
// celdas. Nadie lo vio porque el único control que lo detecta —`auditar-duenos-pestanas.mjs`—
// necesita el archivo vivo y tampoco corre en el pipeline. Éste corre con `node --test`, sin red.
//
// La regla es sobre la PESTAÑA, no sobre el script: lo que importa es que alguien la refresque. Por
// eso un conciliador que importa el nombre de `_CHEQUES_RAW` para leerla no exige nada — la pestaña
// ya tiene dueño— y un generador cuya réplica no aparece en ningún paso sí.

/** Resuelve el valor de una constante importada. Con caída a "buscarla por nombre en todo `lib/`":
 *  varias se re-exportan desde otro módulo (`caja-anexo.mjs` re-exporta `PESTANA_ANEXO`) y seguir la
 *  cadena de re-exports a mano dejaría agujeros justo en los archivos más ramificados. */
function hacerResolver() {
  const cache = new Map()
  const leer = (p) => {
    if (!cache.has(p)) cache.set(p, existsSync(p) ? readFileSync(p, 'utf8') : '')
    return cache.get(p)
  }
  // El índice de `lib/` se arma UNA vez. Buscando archivo por archivo en cada import sin resolver,
  // este test tardaba 20 s él solo — un test lento se termina salteando, y un test salteado no existe.
  const porNombre = new Map()
  for (const f of readdirSync(AQUI).filter((x) => x.endsWith('.mjs') && !x.endsWith('.test.mjs'))) {
    for (const [k, v] of constantesDeModulo(leer(join(AQUI, f)))) if (!porNombre.has(k)) porNombre.set(k, v)
  }
  return (modulo, nombre) => {
    if (!modulo.startsWith('.')) return null
    const directo = constantesDeModulo(leer(resolve(DIR_SCRIPTS, modulo))).get(nombre)
    return directo !== undefined ? directo : (porNombre.get(nombre) ?? null)
  }
}

/** Cada script de `orquestador/scripts` con las pestañas auxiliares que declara como suyas. */
function censar() {
  const resolver = hacerResolver()
  return readdirSync(DIR_SCRIPTS)
    .filter((f) => f.endsWith('.mjs') && !f.endsWith('.test.mjs'))
    .map((script) => {
      const fuente = readFileSync(join(DIR_SCRIPTS, script), 'utf8')
      return { script, escribe: escribeEnElSheet(fuente), auxiliares: pestanasAuxiliaresDe(fuente, resolver) }
    })
    .filter((x) => x.auxiliares.length)
}

const CENSO = censar()
const censoEstatico = () => CENSO

test('toda pestaña auxiliar que un generador declara suya tiene dueño en PASOS', () => {
  const conDueno = new Set(PASOS.flatMap(([, , pestanas = []]) => pestanas))
  const huerfanas = new Map()
  for (const { script, escribe, auxiliares } of censoEstatico()) {
    if (!escribe) continue
    for (const p of auxiliares) {
      if (conDueno.has(p) || SIN_GENERADOR[p]) continue
      if (!huerfanas.has(p)) huerfanas.set(p, [])
      huerfanas.get(p).push(script)
    }
  }
  assert.deepEqual([...huerfanas.entries()], [],
    'una réplica sin dueño en PASOS no se refresca nunca: envejece sin dar error y las pestañas que la '
    + 'leen calculan sobre una foto vieja. O se agrega su generador a PASOS, o se declara el motivo en SIN_GENERADOR.')
})

test('_CRUCE_ARCA la refresca el pipeline, y su generador es el único dueño', () => {
  const duenos = PASOS.filter(([, , p = []]) => p.includes('_CRUCE_ARCA')).map(([s]) => s)
  assert.deepEqual(duenos, ['cruce-arca-pestana.mjs'],
    'sin este paso, el bloque "RESPALDO FISCAL" de Materiales/Estructura/Recurrentes mide contra una foto vieja')
})

test('_CRUCE_ARCA se escribe DESPUÉS del rubro de Compras y ANTES de las pestañas que la suman', () => {
  const pos = (s) => PASOS.findIndex(([x]) => x === s)
  assert.ok(pos('cruce-arca-pestana.mjs') > pos('rubro-caja-sheet.mjs'),
    'el cruce clasifica cada discrepancia por el rubro de caja de Compras: antes de escribirlo, reparte por la columna vieja')
  for (const lector of ['recurrentes-pestana.mjs', 'proveedores-materiales-pestana.mjs', 'estructura-pestana.mjs']) {
    assert.ok(pos(lector) > pos('cruce-arca-pestana.mjs'),
      `${lector} suma _CRUCE_ARCA con SUMIFS y corre ANTES del cruce: leería la corrida anterior`)
  }
})

test('el censo estático ve de verdad los generadores auxiliares que ya existían', () => {
  // Si el detector dejara de encontrarlos —un cambio de estilo, un regex roto— el test de arriba
  // pasaría vacío y felicitaría sin haber mirado nada. Esta es su prueba de vida.
  const vistas = new Set(censoEstatico().flatMap((x) => x.auxiliares))
  for (const p of ['_ARCA_RAW', '_BANCO_RAW', '_CHEQUES_RAW', '_CRUCE_ARCA', '_MOVIMIENTOS', '_F931_RAW']) {
    assert.ok(vistas.has(p), `el detector ya no encuentra a nadie declarando ${p}: está mirando mal`)
  }
})

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// "Deuda viva (OS)": LA HUÉRFANA QUE NO LO ERA, Y LA EXCEPCIÓN QUE SÍ SE PUEDE VERIFICAR (14/08/2026)
//
// El censo la reportaba sin dueño. Medido contra el archivo vivo: son dos tablas dinámicas NATIVAS
// sobre Compras — Sheets las recalcula sola, no necesita generador — y no la lee NADIE (0 fórmulas,
// 0 rangos con nombre, 0 código). Lo que sí puede pasar es que el rango de origen se quede corto: iba
// hasta la fila 932 con Compras en la 846. Ahí el cuadro BAJA sin un solo error a la vista.
// ══════════════════════════════════════════════════════════════════════════════════════════════════

test('toda excepción de SIN_GENERADOR trae su motivo escrito: una excepción muda es una huérfana disfrazada', () => {
  for (const [pestana, motivo] of Object.entries(SIN_GENERADOR)) {
    assert.ok(String(motivo || '').trim().length > 20, `la excepción de "${pestana}" no explica por qué`)
  }
})

test('"Deuda viva (OS)" está eximida Y declarada como mantenida por una dinámica: la exención se verifica', () => {
  assert.ok(SIN_GENERADOR['Deuda viva (OS)'], 'sin la excepción, el censo la reporta huérfana en cada corrida')
  assert.equal(MANTENIDAS_POR_DINAMICA['Deuda viva (OS)'], 'Compras',
    'una exención que nadie comprueba es el escondite perfecto: tiene que declarar contra qué se verifica')
})

test('toda pestaña mantenida por una dinámica está eximida del censo, y no al revés', () => {
  for (const p of Object.keys(MANTENIDAS_POR_DINAMICA)) {
    assert.ok(SIN_GENERADOR[p], `${p} se declara mantenida por una dinámica y el censo la daría por huérfana igual`)
  }
})

test('coberturaDeDinamica: el rango que YA se quedó corto se distingue del que está por quedarse', () => {
  // El caso real medido el 14/08: origen hasta la 932, Compras en la 846 → 86 filas de aire.
  assert.deepEqual(coberturaDeDinamica({ finOrigen: 932, filasFuente: 846 }), { aire: 86, cubre: true, avisa: false })
  // Ya se quedó corto: 4 compras dejaron de contarse y el cuadro no da un solo error.
  assert.deepEqual(coberturaDeDinamica({ finOrigen: 932, filasFuente: 936 }), { aire: -4, cubre: false, avisa: true })
  // Falta poco: avisa ANTES, porque cuando se acabe el cuadro ya habrá mentido una carga entera.
  const justo = coberturaDeDinamica({ finOrigen: 932, filasFuente: 932 - MARGEN_DINAMICA + 1 })
  assert.equal(justo.cubre, true)
  assert.equal(justo.avisa, true)
})

test('coberturaDeDinamica sin datos no felicita: un rango en 0 no puede dar por cubierta la fuente', () => {
  assert.equal(coberturaDeDinamica({ finOrigen: 0, filasFuente: 846 }).cubre, false)
})
