import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PASOS, REPORTES, esReporte } from './flujo-caja-pasos.mjs'
import { DUENOS_DE_PROVEEDORES } from './proveedores-frontera.mjs'

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

test('sólo el generador de texto declara "Proveedores" como pestaña suya', () => {
  // El registro de PASOS es de PESTAÑAS: el que declara una figura como su dueño en el censo. Los
  // dueños de un BLOQUE declaran [] — mismo criterio que cheques-emitidos-sync-banco.mjs.
  const dueñosDeLaPestaña = PASOS.filter(([, , t = []]) => t.includes('Proveedores')).map(([s]) => s)
  assert.deepEqual(dueñosDeLaPestaña, ['proveedores-materiales-pestana.mjs'],
    'dos pasos declaran "Proveedores": el censo va a reportar dos dueños de la misma pestaña')
})
