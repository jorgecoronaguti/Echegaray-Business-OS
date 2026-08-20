// LA MARCA POR FILA DE COBRANZAS — que el cobro que el dueño ya revisó deje de gritar, y sólo ése.
//
// Este archivo también prueba algo que no es de este control y se pagó hoy: que importar el script
// NO corra la pestaña. Sin la guarda `import.meta.url`, este mismo test escribiría el Sheet real cada
// vez que alguien lo corra — que es exactamente lo que pasó al probar `marcaPorFila` desde el nodo.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { marcaPorFila, bloque, MARCA_ALERTA_RESPALDO, MARCAS_FILA, ANCHOS_CONTROL } from './cobranzas-control.mjs'
import { textoDeRespaldo, LARGO_MAXIMO_VEREDICTO } from '../lib/cobranzas-respaldo-banco.mjs'
import { ALERTA } from '../lib/glifos.mjs'
import { CONTROLES, decisionesDe } from '../lib/decisiones-hallazgos.mjs'
import { esCobroYaRevisado } from '../lib/cobranzas-duplicado.mjs'

const LA_ESTRELLA = {
  control: CONTROLES.cobroDuplicado,
  clave: 'fila 39',
  forma: { fila: 39, cliente: 'LA ESTRELLA /ALIMENTOS DEL SUR SAS', importe: 10000000 },
  decision: 'no es duplicado',
  quien: 'dueño',
  cuando: '2026-08-13',
}

const balanceada = (f) => (f.match(/\(/g) || []).length === (f.match(/\)/g) || []).length

test('sin decisiones, la marca es la de siempre: el ▲ del indistinguible sigue primero', () => {
  const f = marcaPorFila([])
  assert.ok(balanceada(f), f)
  assert.ok(f.includes(MARCAS_FILA.indistinguible))
  assert.ok(!f.includes('lo revisó el'), 'sin decisión no hay nada que liberar')
})

test('con la decisión del dueño, la fila 39 deja de llevar ▲ y dice quién la revisó', () => {
  const f = marcaPorFila([LA_ESTRELLA])
  assert.ok(balanceada(f), f)
  // La condición liberadora va ANTES que la del indistinguible: si fuera después, nunca ganaría.
  const iLibera = f.indexOf('lo revisó el dueño')
  const iAviso = f.indexOf(MARCAS_FILA.indistinguible)
  assert.ok(iLibera > 0 && iLibera < iAviso, 'la liberación tiene que ganarle al aviso')
  assert.match(f, /13\/08\/2026/)
  assert.match(f, /""no es duplicado""/, 'el texto textual del dueño, con las comillas escapadas para el Sheet')
})

test('la liberación exige fila Y cliente Y importe: la posición sola es una trampa conocida', () => {
  const f = marcaPorFila([LA_ESTRELLA])
  assert.ok(f.includes('(ROW(Cobranzas!$G$5:$G$200)=39)'), f.slice(0, 300))
  assert.ok(f.includes('(Cobranzas!$G$5:$G$200="LA ESTRELLA /ALIMENTOS DEL SUR SAS")'))
  assert.ok(f.includes('(Cobranzas!$M$5:$M$200=10000000)'))
})

test('si el importe de esa fila cambia, la condición ya no se cumple y la marca vuelve sola', () => {
  const c = esCobroYaRevisado(LA_ESTRELLA.forma, 'Cobranzas', 5, 200)
  // La condición es una multiplicación de tres igualdades: cambiar cualquiera la lleva a 0.
  assert.equal(c.split('*').length, 3)
  const otro = esCobroYaRevisado({ ...LA_ESTRELLA.forma, importe: 12000000 }, 'Cobranzas', 5, 200)
  assert.notEqual(c, otro)
})

test('el texto liberador nunca lleva ▲, ni siquiera si el dueño lo escribiera con comillas', () => {
  const f = marcaPorFila([{ ...LA_ESTRELLA, decision: 'es el "adelanto", no un duplicado' }])
  assert.ok(balanceada(f), f)
  assert.match(f, /es el ""adelanto"", no un duplicado/)
  const liberador = f.slice(f.indexOf('lo revisó el dueño') - 40, f.indexOf('lo revisó el dueño') + 80)
  assert.ok(!liberador.includes('▲'))
})

test('la fórmula que va al Sheet sale del registro REAL: hoy libera la fila 39 y ninguna otra', () => {
  const ds = decisionesDe(CONTROLES.cobroDuplicado)
  assert.deepEqual(ds.map((d) => d.clave), ['fila 39'])
  const f = marcaPorFila(ds)
  assert.ok(balanceada(f), f)
  assert.equal((f.match(/lo revisó el dueño/g) || []).length, 1)
  // La 40 es la gemela de la 39 y el dueño nombró sólo la 39: sigue marcada a propósito.
  assert.ok(!f.includes('=40)'), 'nadie liberó la fila 40')
})

test('importar este script NO corre la pestaña: la guarda de comando está puesta', () => {
  const src = readFileSync(new URL('./cobranzas-control.mjs', import.meta.url), 'utf8')
  assert.match(src, /if \(import\.meta\.url === `file:\/\/\$\{process\.argv\[1\]\}`\) \{/)
})

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// EL AVISO DE DEVENGADO DISFRAZADO DE PERCIBIDO, EN LA PESTAÑA
// ══════════════════════════════════════════════════════════════════════════════════════════════════

test('el contador del bloque compara contra el MISMO texto que escribe la columna BB', () => {
  // Si el rótulo de la marca y la fórmula que la cuenta se escriben por separado, el día que se mejore
  // la redacción el contador pasa a dar $0 — sin un solo error, con el aviso igual de visible en las
  // filas. Es el mismo defecto que hizo que los conteos se mostraran como "$4": un texto leído a mano.
  const escrito = textoDeRespaldo({ estado: 'sinRespaldo' }, { alerta: ALERTA, fechaCorte: '2026-08-14' })
  assert.ok(escrito.startsWith(MARCA_ALERTA_RESPALDO), 'la marca es el prefijo real de lo que se escribe')
  const linea = bloque().find(([rot]) => rot.includes('Cobrado que el extracto NO confirma'))
  assert.ok(linea, 'el bloque de control tiene la línea')
  assert.ok(linea[1].includes(MARCA_ALERTA_RESPALDO), 'y su fórmula compara contra esa misma marca')
  assert.ok(linea[1].includes(`LEFT($BB$5:$BB$200;${MARCA_ALERTA_RESPALDO.length})`),
    'contando los caracteres de la marca, no un número tipeado')
  // La fórmula sale de la columna BB, no de un número calculado por el script: se recalcula sola.
  assert.ok(!/\d{4,}/.test(linea[1].replace(/\$?[A-Z]+\$?\d+/g, '')), 'ningún importe pegado adentro de la fórmula')
})

test('el aviso NO se escribe para lo que el extracto no puede juzgar', () => {
  for (const estado of ['fueraDeCorte', 'anteriorAlExtracto', 'noPasaPorLaCuenta', 'noComparable']) {
    const t = textoDeRespaldo({ estado }, { alerta: ALERTA, fechaCorte: '2026-08-14' })
    assert.ok(!t.startsWith(MARCA_ALERTA_RESPALDO), `"${estado}" no puede llevar la marca de sin respaldo`)
    assert.ok(t.length > 0, `"${estado}" igual dice algo: una celda vacía no explica nada`)
  }
})

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// TODO LO QUE ESTE CONTROL PUBLICA ENTRA EN SU COLUMNA
// ══════════════════════════════════════════════════════════════════════════════════════════════════
//
// QUÉ DEFECTO ATRAPA (15/08). `auditar-pantalla` medía 21 textos cortados en el bloque de control de
// "Cobranzas": la marca de duplicado (170 caracteres en una columna de 64), los veredictos del banco
// (hasta 222 en una de 50) y cuatro notas de hasta 227 en una de 102. Ninguno daba error y todos se
// dibujaban partidos justo antes de la parte que dice qué hacer.
//
// Y ATRAPA LAS DOS FORMAS DE QUE VUELVA, porque son dos decisiones que tienen que viajar juntas: que
// alguien alargue una redacción, y que alguien angoste una columna. Si sólo se probara el texto, el
// día que la columna se achique el defecto vuelve entero y en silencio.
//
// EL FACTOR 0,57 px POR PUNTO Y POR CARÁCTER ES EL DEL DETECTOR, a propósito: probar contra una
// medida propia daría verde mientras el auditor sigue en rojo, que es tener dos verdades sobre lo
// mismo. Si el detector cambia de fórmula, este test tiene que cambiar con él.

const CUERPO = 9   // el cuerpo con el que se publican la marca, el veredicto y la nota
const entran = (px, tam = CUERPO) => Math.floor(px / (tam * 0.57))

/** El ancho REAL de lectura de la nota: su columna más las vacías sobre las que derrama. */
const ANCHO_NOTA_LEIBLE = 528

test('la MARCA POR FILA entra en la columna BA — 170 caracteres no los arregla ningún ancho', () => {
  const tope = entran(ANCHOS_CONTROL[52])
  for (const [k, m] of Object.entries(MARCAS_FILA)) {
    assert.ok(m.length <= tope, `MARCAS_FILA.${k} mide ${m.length} y en ${ANCHOS_CONTROL[52]}px entran ${tope}`)
  }
  // Y siguen estando EN la fórmula: acortarlas no puede haberlas dejado fuera del ARRAYFORMULA.
  const f = marcaPorFila([])
  for (const m of Object.values(MARCAS_FILA)) assert.ok(f.includes(m), `la fórmula ya no publica "${m}"`)
})

test('los VEREDICTOS DEL BANCO entran en la columna BB, incluido el que medía 222', () => {
  const tope = entran(ANCHOS_CONTROL[53])
  assert.ok(LARGO_MAXIMO_VEREDICTO <= tope, 'el largo declarado no puede exceder la columna declarada')
  const estados = ['confirma', 'ambiguo', 'fueraDeCorte', 'anteriorAlExtracto', 'noPasaPorLaCuenta',
    'noComparable', 'extractoIlegible', 'sinRespaldo']
  for (const estado of estados) {
    const v = { estado, cuantos: 3, mov: { fechaISO: '2026-08-05', importe: 103000000 } }
    const t = textoDeRespaldo(v, { alerta: ALERTA, fechaCorte: '2026-08-14' })
    assert.ok(t.length <= tope, `el veredicto "${estado}" mide ${t.length} y entran ${tope}: ${t}`)
  }
})

test('el veredicto sin respaldo SIGUE empezando con la marca que suma la línea del cuadro', () => {
  // Acortar el texto no puede haberle movido el arranque: la línea "Cobrado que el extracto NO
  // confirma" compara con LEFT(BB;n) contra esa marca exacta. Si no coincide no da error: da $0.
  const t = textoDeRespaldo({ estado: 'sinRespaldo' }, { alerta: ALERTA, fechaCorte: '2026-08-14' })
  assert.ok(t.startsWith(MARCA_ALERTA_RESPALDO), `"${t}" ya no arranca con "${MARCA_ALERTA_RESPALDO}"`)
})

test('los RÓTULOS y las NOTAS del cuadro entran en sus columnas BC y BE', () => {
  const topeRotulo = entran(ANCHOS_CONTROL[54], 11)
  const topeNota = entran(ANCHO_NOTA_LEIBLE)
  for (const [rotulo, , nota] of bloque()) {
    // La firma y el subtítulo de la fila 1/2 derraman sobre la BD vacía: no se miden acá.
    if (rotulo && rotulo !== 'CONTROL DE COBRANZAS' && !rotulo.startsWith('Se recalcula')) {
      assert.ok(rotulo.length <= topeRotulo, `el rótulo "${rotulo}" mide ${rotulo.length} y entran ${topeRotulo}`)
    }
    if (nota) assert.ok(nota.length <= topeNota, `la nota "${nota.slice(0, 50)}…" mide ${nota.length} y entran ${topeNota}`)
  }
})

test('la nota del duplicado apunta a la columna donde la marca ESTÁ, no a una que quedó vieja', () => {
  // Decía "ver la marca en la columna X" y la marca vive en la BA desde que el bloque se mudó. Un
  // puntero a la columna equivocada no da error: manda a mirar una celda vacía.
  const nota = bloque().find(([r]) => String(r).startsWith('Cobros indistinguibles'))?.[2] ?? ''
  assert.match(nota, /BA\./, `la nota no cita la columna de la marca: "${nota}"`)
})

test('los CINCO anchos del bloque están declarados: los dos que faltaban eran los peores', () => {
  // BB y BE —las columnas con las frases más largas— no tenían ancho propio, así que se quedaban con
  // el que dejara el layout anterior o `reparar-textos.mjs`. Un ancho sin dueño lo fija el último que
  // corre, y ahí es donde volvían los 17 textos cortados.
  assert.deepEqual(Object.keys(ANCHOS_CONTROL).map(Number).sort((a, b) => a - b), [52, 53, 54, 55, 56])
  for (const px of Object.values(ANCHOS_CONTROL)) assert.ok(px >= 140, 'ningún ancho del bloque baja de 140px')
})
