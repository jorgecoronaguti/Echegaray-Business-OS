import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PASOS, REPORTES, esReporte } from './flujo-caja-pasos.mjs'
import { DUENOS_DE_PROVEEDORES } from './proveedores-frontera.mjs'

const AQUI = dirname(fileURLToPath(import.meta.url))

test('esReporte: los auditores/formateadores son reportes de presentación, no fallos de datos', () => {
  assert.equal(esReporte('auditar-pantalla.mjs'), true)
  assert.equal(esReporte('censo-numeros-pegados.mjs'), true)
  assert.equal(esReporte('formato-condicional.mjs'), true)
  assert.equal(esReporte('formato-pestanas.mjs'), true)
})

test('esReporte: un GENERADOR de datos NO es un reporte (su fallo sí bloquea la frescura)', () => {
  assert.equal(esReporte('rubro-caja-sheet.mjs'), false)
  assert.equal(esReporte('caja-pestana.mjs'), false)
  assert.equal(esReporte('sync-compras.mjs'), false)
  assert.equal(esReporte('sync-calendario-financiero.mjs'), false)
})

test('todo script en REPORTES existe como paso real del pipeline', () => {
  const scripts = new Set(PASOS.map(([s]) => s))
  for (const r of REPORTES) assert.ok(scripts.has(r), `${r} está en REPORTES pero no es un paso de PASOS`)
})

// ═══ EL DEFECTO SIMÉTRICO: UN PASO DECLARADO CUYO ARCHIVO NO EXISTE (06/08) ═══
//
// `cheques-recibidos-tablero.mjs` figuraba acá como dueño de "Cheques Recibidos" desde el 01/08 y no
// estaba en el repo. El runner lo lanzaba con `process.execPath`, el hijo moría con ENOENT y el paso
// contaba como uno más de los que fallan: la pestaña se quedó cinco días sin actualizarse y ningún
// control lo dijo. Un nombre mal escrito acá cuesta lo mismo.

test('todo paso declarado existe como archivo: un nombre que apunta al vacío no corre nunca', () => {
  const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'scripts')
  for (const [script] of PASOS) {
    assert.ok(existsSync(join(dir, script)), `PASOS declara ${script} y no existe en orquestador/scripts`)
  }
})

// ═══ EL DEFECTO: UN GENERADOR QUE EXISTE, TIENE DUEÑO Y NADIE EJECUTA (05/08) ═══
//
// De los seis generadores de la pestaña "Proveedores", cinco no estaban en PASOS: sólo corrían si
// alguien los tipeaba. Así fue como `ANCHOS_PROVEEDORES` —declarado fuente única el 04/08— nunca
// llegó al archivo, y el auditor siguió reportando 107 textos cortados contra los anchos viejos.
// No hay control que vea esto: la pestaña no da error, envejece.

test('todos los dueños de un bloque de Proveedores corren en el pipeline', () => {
  const scripts = PASOS.map(([s]) => s)
  for (const d of DUENOS_DE_PROVEEDORES) {
    assert.ok(scripts.includes(d.script),
      `"${d.bloque}" lo escribe ${d.script} y NO está en PASOS: sólo se actualiza si alguien lo corre a mano`)
  }
})

test('los dueños corren EN ORDEN: cada uno necesita lo que dejó el anterior', () => {
  // El generador de texto va antes que las dinámicas porque es quien escribe el título "3 · …", y la
  // sección 2 se ubica por "la sección que sigue". El encabezado va último: su guarda aborta si la
  // sección 1 no está donde va, y es el único que aplica los anchos.
  const posiciones = DUENOS_DE_PROVEEDORES.map((d) => PASOS.findIndex(([s]) => s === d.script))
  for (let i = 1; i < posiciones.length; i++) {
    assert.ok(posiciones[i] > posiciones[i - 1],
      `${DUENOS_DE_PROVEEDORES[i].script} corre antes que ${DUENOS_DE_PROVEEDORES[i - 1].script}, y lo necesita`)
  }
})

test('un bloque, un dueño: ningún script escribe dos bloques ni un bloque tiene dos scripts', () => {
  const scripts = DUENOS_DE_PROVEEDORES.map((d) => d.script)
  const bloques = DUENOS_DE_PROVEEDORES.map((d) => d.bloque)
  assert.equal(new Set(scripts).size, scripts.length, 'un script aparece dos veces')
  assert.equal(new Set(bloques).size, bloques.length, 'un bloque tiene dos dueños — es el defecto de la sección 2')
  const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'scripts')
  for (const s of scripts) assert.ok(existsSync(join(dir, s)), `${s} no existe en orquestador/scripts`)
})

// ═══ OBRAS: EL PASO QUE NO ESTABA, Y EL FLAG SIN EL CUAL NO ESCRIBE (13/08) ═══
//
// La pestaña existe desde el 07/08 y su generador sólo corría a mano. El segundo test es el que
// importa: `obras-pestana.mjs` sin `--escribir` hace un ENSAYO —lee, resuelve columnas, no toca el
// archivo— y termina con código 0. O sea que el paso figuraría como ✓ en cada corrida mientras la
// pestaña envejece. Un éxito que no publica una celda es la peor forma de fallar que hay acá.

test('OBRAS corre en el pipeline y declara su pestaña', () => {
  const paso = PASOS.find(([s]) => s === 'obras-pestana.mjs')
  assert.ok(paso, 'obras-pestana.mjs no está en PASOS: la pestaña sólo se actualiza si alguien la corre a mano')
  assert.deepEqual(paso[2], ['OBRAS'], 'OBRAS sin declarar: el censo de dueños la va a dar por huérfana')
})

test('OBRAS corre con --escribir: sin el flag el paso da ✓ sin publicar una celda', () => {
  const paso = PASOS.find(([s]) => s === 'obras-pestana.mjs')
  assert.ok((paso?.[3] ?? []).includes('--escribir'),
    'obras-pestana.mjs corre sin --escribir: hace un ensayo, sale 0 y la pestaña queda vieja en silencio')
})

test('OBRAS corre DESPUÉS de lo que lee: el rubro de Compras y la pestaña Materiales', () => {
  // La Sección 1 es fórmula viva sobre Cobranzas y sobre la fila "TOTAL POR OBRA" de Materiales, y
  // cita Compras por columna. Antes de sus fuentes, ubicaría por rótulo una grilla de la corrida
  // anterior — y eso no da error, da un número viejo.
  const pos = (s) => PASOS.findIndex(([x]) => x === s)
  assert.ok(pos('obras-pestana.mjs') > pos('rubro-caja-sheet.mjs'), 'OBRAS corre antes del rubro de caja')
  assert.ok(pos('obras-pestana.mjs') > pos('proveedores-materiales-pestana.mjs'), 'OBRAS corre antes de Materiales')
})

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// EL LIBRO — LA FUENTE DE LOS TRES CUADROS QUE MÁS SE MIRAN
// ══════════════════════════════════════════════════════════════════════════════════════════════════
//
// El 13/08/2026 `_MOVIMIENTOS` era la única pestaña generada del archivo SIN dueño en el pipeline:
// CAJA y los dos cash flow se recalculaban cada 2 horas sobre un libro que nadie refrescaba desde el
// 07/08. Medido en el archivo vivo: cero filas con origen "Obras" (los $18.880.836 de egresos
// proyectados de las 7 obras no llegaban a ningún cuadro) y $8.758.810 de cobros de menos.
//
// Estos tres tests son el defecto, no el arreglo: si alguien saca el paso, o lo mueve antes de sus
// fuentes, o después de sus consumidores, se ponen rojos.

test('el LIBRO (_MOVIMIENTOS) tiene dueño en el pipeline: es la fuente de CAJA y de los dos cash flow', () => {
  const dueños = PASOS.filter(([, , t = []]) => t.includes('_MOVIMIENTOS')).map(([s]) => s)
  assert.deepEqual(dueños, ['libro-movimientos-pestana.mjs'],
    'sin dueño, _MOVIMIENTOS sólo se refresca si alguien lo tipea a mano y los tres cuadros calculan sobre una foto vieja')
})

test('el LIBRO corre DESPUÉS de todas las pestañas que lee', () => {
  // Las fuentes NO se listan a mano: se leen del propio script. Una fuente nueva que alguien agregue
  // al libro y no ubique en el pipeline hace fallar este test sola.
  const fuente = readFileSync(join(AQUI, '../scripts/libro-movimientos-pestana.mjs'), 'utf8')
  const leidas = new Set([...fuente.matchAll(/leer\(\s*[`'"]'?([^'"`!]+?)'?!/g)].map((m) => m[1]))
  assert.ok(leidas.size >= 7, `esperaba varias pestañas leídas por el libro y encontré ${leidas.size}`)

  const pos = (s) => PASOS.findIndex(([x]) => x === s)
  const posLibro = pos('libro-movimientos-pestana.mjs')
  for (const pestaña of leidas) {
    const dueño = PASOS.find(([, , t = []]) => t.includes(pestaña))
    if (!dueño) continue // Compras y Cobranzas las carga una persona: no tienen generador
    assert.ok(pos(dueño[0]) < posLibro,
      `el libro lee "${pestaña}" pero ${dueño[0]} la reescribe DESPUÉS: el libro leería la corrida anterior`)
  }
})

test('el LIBRO corre ANTES de CAJA y de los dos cash flow, que son sus consumidores', () => {
  const pos = (s) => PASOS.findIndex(([x]) => x === s)
  const posLibro = pos('libro-movimientos-pestana.mjs')
  for (const consumidor of ['caja-anexo-pestana.mjs', 'caja-pestana.mjs', 'cash-flow-vistas.mjs']) {
    assert.ok(pos(consumidor) > posLibro,
      `${consumidor} lee _MOVIMIENTOS y corre ANTES del libro: muestra el libro de la corrida anterior`)
  }
})

test('las dos vistas de cash flow corren DESPUÉS de CAJA: el saldo inicial sale de sus rangos con nombre', () => {
  // El ancla del saldo (CAJA_TOTAL_DISPONIBLE / CAJA_FECHA_SALDO) la publica caja-pestana. Antes de
  // ella, las 53 columnas del semanal se encadenan desde el saldo de la corrida anterior — sin error.
  const pos = (s) => PASOS.findIndex(([x]) => x === s)
  assert.ok(pos('cash-flow-vistas.mjs') > pos('caja-pestana.mjs'),
    'las vistas se calculan antes de que CAJA publique el saldo: el ancla queda un ciclo atrasada')
})

test('sólo el generador de texto declara "Proveedores" como pestaña suya', () => {
  // El registro de PASOS es de PESTAÑAS: el que declara una figura como su dueño en el censo. Los
  // dueños de un BLOQUE declaran [] — mismo criterio que cheques-emitidos-sync-banco.mjs.
  const dueñosDeLaPestaña = PASOS.filter(([, , t = []]) => t.includes('Proveedores')).map(([s]) => s)
  assert.deepEqual(dueñosDeLaPestaña, ['proveedores-materiales-pestana.mjs'],
    'dos pasos declaran "Proveedores": el censo va a reportar dos dueños de la misma pestaña')
})

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// EL CONTROL QUE NADIE CORRÍA (14/08/2026)
//
// `_CRUCE_ARCA` estuvo diez días sin refrescarse con `Materiales` leyendo $88.078.801 de ahí. El censo
// de dueños lo habría dicho la primera mañana — existía desde el 23/07 y no estaba en PASOS. Un
// control que hay que acordarse de tipear tiene la misma disponibilidad que el defecto que persigue.
// ══════════════════════════════════════════════════════════════════════════════════════════════════

test('el censo de dueños CORRE en el pipeline: es el único que ve una pestaña sin dueño', () => {
  assert.ok(PASOS.some(([s]) => s === 'auditar-duenos-pestanas.mjs'),
    'sin este paso, una pestaña huérfana nueva sólo se descubre si alguien tipea el comando')
})

test('el censo es un REPORTE: su ≠0 no puede contar como fallo de datos ni bloquear la frescura', () => {
  // La frescura del Cash Flow SÓLO se registra si `fallaron.length === 0`. Contado como fallo, el
  // censo la apagaría todos los días que encuentre una huérfana — que son justo los días que importa.
  assert.equal(esReporte('auditar-duenos-pestanas.mjs'), true)
})

test('el censo corre AL FINAL: corriendo primero reportaría como FANTASMA la pestaña que la corrida crea', () => {
  const pos = (s) => PASOS.findIndex(([x]) => x === s)
  const censo = pos('auditar-duenos-pestanas.mjs')
  // Cualquier paso que DECLARE una pestaña propia tiene que haber corrido antes: si no, esa pestaña
  // puede no existir todavía en el archivo y el censo la contaría como "declarada y NO EXISTE".
  for (const [script, , pestanas] of PASOS) {
    if (!(pestanas || []).length) continue
    assert.ok(pos(script) < censo,
      `${script} declara ${pestanas.join(', ')} y corre DESPUÉS del censo: un falso fantasma por corrida vuelve ruido al control`)
  }
})
