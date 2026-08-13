// EL GUARDIÁN, PROBADO COMO SE PRUEBA UN GUARDIÁN: intentando entrar.
//
// El defecto que estos tests fijan no es que la guardia decida mal — es que NO ESTÉ. `generadores-
// atrasados.mjs` funcionaba perfecto desde el 03/08 y no lo llamaba nadie: un control escrito y nunca
// puesto en la puerta es un control que no existe. Por eso el último test de este archivo mira el
// pipeline, no la librería.
//
// NINGÚN TEST DE ACÁ CORRE EL PIPELINE NI UN GENERADOR. Está prohibido por regla permanente: correr
// un generador del Sheet real "para probar" ya borró trabajo del dueño tres veces. El control se
// inyecta mockeado; el cableado se verifica leyendo el fuente. Ese límite está declarado abajo.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  guardiaDeGeneradores, veredictoDeLaGuardia, motivoDelEscape, lineasQueFrenan, VAR_ESCAPE, RUTA_CONTROL,
} from './guardia-generadores.mjs'

/** La salida real del control cuando frena: el veredicto, el archivo y las ramas debajo. */
const SALIDA_QUE_FRENA = [
  'base: main · generadores de Sheets revisados: 67 · ramas sin mergear: 24',
  '',
  '✖ SIN REVISAR  orquestador/scripts/jornales-pestana.mjs',
  '   ramas: feat/jornales-direccion, audit/caja-audit',
  '',
  '📝 descartado  orquestador/lib/guarda-escritura.mjs  — no frena: decisión escrita',
  '   ramas: audit/cf-audit',
  '   main resolvió lo mismo después y mejor; traerla revierte el arreglo.',
  '',
  '  NO corras el pipeline contra el Sheet real hasta resolverlo',
].join('\n')

const MOTIVO_REAL = 'el dueño pidió regenerar CAJA a mano el 13/08 con la rama de jornales ya revisada por él'

const control = ({ codigo, salida = '' }) => () => ({ codigo, salida })

// ── El veredicto: qué aborta y qué no ──────────────────────────────────────────────────────────

test('la guardia ABORTA cuando el control frena', async () => {
  const v = await guardiaDeGeneradores({ correr: control({ codigo: 1, salida: SALIDA_QUE_FRENA }), env: {} })
  assert.equal(v.abortar, true)
  assert.equal(v.bloquea, true)
})

test('el aviso NOMBRA el generador y la rama que frenan — un "algo falló" no se puede resolver', async () => {
  const v = await guardiaDeGeneradores({ correr: control({ codigo: 1, salida: SALIDA_QUE_FRENA }), env: {} })
  const texto = v.lineas.join('\n')
  assert.match(texto, /jornales-pestana\.mjs/)
  assert.match(texto, /feat\/jornales-direccion/)
  // Lo DESCARTADO no frena: arrastrarlo al aviso convertiría el mensaje en ruido y el ruido se ignora.
  assert.doesNotMatch(texto, /guarda-escritura\.mjs/)
})

test('la guardia NO aborta cuando el control está verde', async () => {
  const v = await guardiaDeGeneradores({ correr: control({ codigo: 0, salida: '✔ ninguna rama difiere' }), env: {} })
  assert.equal(v.abortar, false)
  assert.equal(v.bloquea, false)
})

// ── Fail-closed: no saber si es seguro no es lo mismo que ser seguro ────────────────────────────

test('la guardia ABORTA si el control tira una excepción', async () => {
  const v = await guardiaDeGeneradores({ correr: () => { throw new Error('spawn ENOENT') }, env: {} })
  assert.equal(v.abortar, true)
  assert.match(v.lineas.join('\n'), /NO se pudo correr.*ENOENT/s)
})

test('la guardia ABORTA si el control fue matado por el techo de tiempo (código nulo)', async () => {
  // Cuando el timeout lo mata, `status` viene en null. Un `null !== 0` tiene que abortar igual que un
  // 1: si esto se leyera como "no dio código, seguí", un git colgado dejaría pasar el pipeline entero.
  const v = await guardiaDeGeneradores({ correr: () => ({ codigo: null, salida: '' }), env: {} })
  assert.equal(v.abortar, true)
})

test('la guardia ABORTA si el control devuelve cualquier cosa que no sea un código', async () => {
  for (const r of [undefined, null, {}, { codigo: undefined }]) {
    const v = await guardiaDeGeneradores({ correr: () => r, env: {} })
    assert.equal(v.abortar, true, `devolvió ${JSON.stringify(r)} y no abortó`)
  }
})

test('sólo un 0 explícito deja pasar: ni "0", ni true, ni un objeto vacío', () => {
  for (const codigo of ['0', true, {}, NaN]) {
    assert.equal(veredictoDeLaGuardia({ codigo }).abortar, true, `${String(codigo)} dejó pasar`)
  }
})

// ── El escape: sin motivo con sustancia no hay escape ───────────────────────────────────────────

test('el escape SIN motivo válido no libera nada', async () => {
  for (const m of ['1', 'ok', 'si', '', '   ', 'x']) {
    const v = await guardiaDeGeneradores({
      correr: control({ codigo: 1, salida: SALIDA_QUE_FRENA }), env: { [VAR_ESCAPE]: m },
    })
    assert.equal(v.abortar, true, `"${m}" saltó la guardia`)
    assert.match(v.lineas.join('\n'), /escape RECHAZADO/)
  }
})

test('el escape CON motivo válido libera, y el motivo queda en el log', async () => {
  const v = await guardiaDeGeneradores({
    correr: control({ codigo: 1, salida: SALIDA_QUE_FRENA }), env: { [VAR_ESCAPE]: MOTIVO_REAL },
  })
  assert.equal(v.abortar, false)
  // Liberar no es callar: el bloqueo sigue reportado y el motivo queda escrito en ESA corrida.
  assert.equal(v.bloquea, true)
  const texto = v.lineas.join('\n')
  assert.match(texto, /guardia SALTEADA/)
  assert.ok(texto.includes(MOTIVO_REAL), 'el motivo del escape no quedó impreso: no se puede auditar después')
  assert.match(texto, /jornales-pestana\.mjs/, 'se salteó el control sin decir qué se salteó')
})

test('el escape no inventa permiso cuando el control está verde: no hay nada que saltear', async () => {
  const v = await guardiaDeGeneradores({ correr: control({ codigo: 0 }), env: { [VAR_ESCAPE]: MOTIVO_REAL } })
  assert.equal(v.abortar, false)
  assert.equal(v.bloquea, false)
})

test('motivoDelEscape: null si nadie lo pidió, el texto si sirve, y tira si no alcanza', () => {
  assert.equal(motivoDelEscape({}), null)
  assert.equal(motivoDelEscape({ [VAR_ESCAPE]: `  ${MOTIVO_REAL}  ` }), MOTIVO_REAL)
  assert.throws(() => motivoDelEscape({ [VAR_ESCAPE]: '1' }), /MOTIVO/)
})

// ── El ensayo informa, no aborta ────────────────────────────────────────────────────────────────

test('--dry no aborta pero SÍ informa: un ensayo no ejecuta un generador, y callarse sería peor', () => {
  const v = veredictoDeLaGuardia({ codigo: 1, salida: SALIDA_QUE_FRENA, dry: true })
  assert.equal(v.abortar, false)
  assert.equal(v.bloquea, true)
  assert.match(v.lineas.join('\n'), /jornales-pestana\.mjs/)
})

// ── El rescate del "qué frena" ──────────────────────────────────────────────────────────────────

test('lineasQueFrenan: rescata veredicto y ramas, ignora lo descartado y tolera basura', () => {
  const l = lineasQueFrenan(SALIDA_QUE_FRENA)
  assert.equal(l.length, 2)
  assert.match(l[0], /SIN REVISAR/)
  assert.match(l[1], /^\s+ramas:/)
  assert.deepEqual(lineasQueFrenan(''), [])
  assert.deepEqual(lineasQueFrenan(null), [])
  assert.deepEqual(lineasQueFrenan(undefined), [])
})

test('sin líneas reconocibles la guardia aborta IGUAL: no poder explicar no es poder pasar', () => {
  const v = veredictoDeLaGuardia({ codigo: 1, salida: 'salida en un formato que nadie reconoce' })
  assert.equal(v.abortar, true)
})

// ── EL DEFECTO ORIGINAL: EL GUARDIÁN QUE NO ESTÁ EN LA PUERTA ───────────────────────────────────
//
// LÍMITE DECLARADO: esto se verifica LEYENDO el fuente del pipeline, no ejecutándolo. Ejecutarlo —aun
// con `--dry`— abre cliente de Google y pasa por la firma de cada pestaña, y un test que sobre una
// regresión escribiría el Sheet real es peor que el defecto que persigue. Lo que este test SÍ prueba:
// que la llamada exista y esté antes de todo lo que toca el archivo. Lo que NO prueba: que el proceso
// termine de verdad con código ≠0 — eso lo prueba `veredictoDeLaGuardia` y lo firma quien lo opere.

test('el pipeline LLAMA a la guardia, y antes de tocar el archivo', () => {
  const ruta = join(dirname(fileURLToPath(import.meta.url)), '..', 'scripts', 'flujo-caja-rehacer-todo.mjs')
  const src = readFileSync(ruta, 'utf8')
  assert.match(src, /if \(guardia\.abortar\)[\s\S]{0,200}process\.exit\(/, 'la guardia se llama pero no aborta nada')
  // Se mide DENTRO de main(): el orden del archivo no es el orden de ejecución —`verificarPresentacion`
  // está declarada arriba y corre al final—, así que comparar posiciones en el fuente entero mentiría.
  const cuerpo = src.slice(src.indexOf('async function main()'))
  assert.ok(cuerpo.length > 0, 'no encontré main() en el pipeline')
  const iGuardia = cuerpo.indexOf('await guardiaDeGeneradores(')
  assert.ok(iGuardia > 0, 'flujo-caja-rehacer-todo.mjs no llama a la guardia: el control vuelve a no correr nunca')
  // Antes del candado, del snapshot, de la firma y del bucle que lanza los generadores: todo eso lee
  // o escribe el archivo. Una guardia que llega tarde ya dejó que se tocara la pestaña.
  for (const marca of ['pestana-bloqueada.mjs', 'sheet-snapshot.mjs', 'firma-tab.mjs', 'for (const [script,']) {
    const i = cuerpo.indexOf(marca)
    assert.ok(i > 0 && iGuardia < i, `la guardia corre DESPUÉS de "${marca}": el archivo ya se tocó`)
  }
})

test('el control que la guardia invoca existe de verdad', () => {
  // Un nombre mal escrito acá no falla: el spawn tira ENOENT, la guardia aborta siempre y alguien
  // termina desactivándola por molesta. La ruta se verifica en frío.
  assert.ok(readFileSync(RUTA_CONTROL, 'utf8').includes('frenaElPipeline'))
})
