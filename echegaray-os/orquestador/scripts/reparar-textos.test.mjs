// EL REPARADOR NO PUEDE SER EL OCTAVO ESCRITOR DE UNA PROPIEDAD QUE TIENE DUEÑO.
//
// ═══ EL DEFECTO QUE ESTO ATRAPA (05/08) ═══
//
// "Proveedores" declara sus ocho anchos en `lib/proveedores-frontera.mjs` y los aplica UN generador,
// porque tres escritores peleando por la misma propiedad dejaron la columna D en 80px o en 300px
// según quién corriera último. Este script corre DESPUÉS de todos ellos en `PASOS` y ensanchaba por
// su cuenta cualquier columna con un texto cortado: era el que ganaba siempre. El defecto de
// propiedad volvía en silencio y con la firma de un reparador.
//
// Lo que hace en cambio es lo mismo que ya hace con las notas: REPORTAR, y que lo resuelva el
// generador dueño — el único que puede elegir entre acortar el rótulo y mover la tabla.

import test from 'node:test'
import assert from 'node:assert/strict'
import { CON_ANCHO_GOBERNADO, planDeReparacion } from './reparar-textos.mjs'
import { ANCHOS_PROVEEDORES, DUENOS_DE_PROVEEDORES } from '../lib/proveedores-frontera.mjs'
import { ANCHOS_DECLARADOS, anchosDe, anchoDeclarado } from '../lib/anchos-declarados.mjs'
import { ANCHOS_CONTROL } from './cobranzas-control.mjs'

/** Un texto cortado, en la forma que lo emite `detectar`. */
const cortado = (col, fila, valor) => ({ tipo: 'texto_cortado', col, fila, valor })
const grilla = (valor, fontSize = 10) => [[null, null, { valor, formato: { textFormat: { fontSize } } }]]

test('EL DEFECTO: en una pestaña con anchos de fuente única, ensanchar los pisa', () => {
  const d = [cortado('C', 1, 'Fecha prevista de pago')]
  // Sin la guarda, el reparador decide ensanchar la C — y con eso pisa ANCHOS_PROVEEDORES.
  const libre = planDeReparacion(d, [...ANCHOS_PROVEEDORES], grilla('Fecha prevista de pago'))
  assert.equal(libre.ensanchar.size, 1)
  assert.ok(libre.ensanchar.get(2) > ANCHOS_PROVEEDORES[2], 'ensancharía la C por encima de lo declarado')

  // Con la guarda: ni una columna se toca, y el texto se reporta para que lo acorte el dueño.
  const gobernado = planDeReparacion(d, [...ANCHOS_PROVEEDORES], grilla('Fecha prevista de pago'), { anchoGobernado: true })
  assert.equal(gobernado.ensanchar.size, 0, 'no puede ensanchar una columna que tiene dueño declarado')
  assert.deepEqual(gobernado.aNota.map((n) => n.col), [2], 'pero el defecto NO se pierde: se reporta')
})

test('"Proveedores" está en la lista, y es la que tiene fuente única de anchos', () => {
  assert.ok(CON_ANCHO_GOBERNADO.has('Proveedores'))
  // La coherencia que importa: la pestaña que declara sus anchos es la que tiene dueños de bloque.
  assert.ok(DUENOS_DE_PROVEEDORES.length > 0 && ANCHOS_PROVEEDORES.length === 8)
})

test('en una pestaña sin dueño de anchos, el reparador sigue haciendo su trabajo', () => {
  const d = [cortado('C', 1, 'Intereses del acuerdo')]
  const r = planDeReparacion(d, [100, 100, 60], grilla('Intereses del acuerdo'))
  assert.equal(r.ensanchar.size, 1, 'sin fuente única, ensanchar es la respuesta correcta')
  assert.equal(r.aNota.length, 0)
})

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// EL SEGUNDO DEFECTO DE PROPIEDAD: UNA COLUMNA DE CARGA QUE NADIE PODÍA ARREGLAR (15/08)
// ══════════════════════════════════════════════════════════════════════════════════════════════════
//
// `Cobranzas!H` —la orden de compra que tipea el dueño— tenía 25 textos cortados y ningún camino:
// la pestaña es `carga: true`, así que no hay generador a quien derivarle el arreglo, y los dos topes
// globales de este script (`ANCHO_MAX = 344`, `ES_PARRAFO = 64`) la dejaban afuera. El resultado era
// que una columna sin generador terminaba siendo una columna sin dueño de su ancho.

/** La H real de Cobranzas: el peor texto, 74 caracteres a cuerpo 11 ⇒ 480px. Ancho de hoy: 336px. */
const H_LARGA = 'Anticipo inicio de obra 50% Blanco $65.000.000 Playon de Azufre. Cargar OC'
/** Y la que más se repite: 62 caracteres ⇒ 405px. Tampoco entra en 344. */
const H_MEDIA = 'Resto 50% s/ contrato 97.650.000 — certificación quincenal 1/9'
const enH = (valor) => [Array(7).fill(null).concat([{ valor, formato: { textFormat: { fontSize: 11 } } }])]

test('EL DEFECTO: sin ancho declarado, los dos topes globales dejan `Cobranzas!H` sin arreglo', () => {
  for (const texto of [H_LARGA, H_MEDIA]) {
    const r = planDeReparacion([cortado('H', 69, texto)], [336], enH(texto))
    assert.equal(r.ensanchar.size, 0, `${texto.length} caracteres: ningún tope global la ensancha`)
    assert.equal(r.aNota.length, 1, 'y se deriva a un generador que en una pestaña de carga NO EXISTE')
  }
})

test('con el ancho declarado, la columna se ensancha aunque el texto pase los dos topes', () => {
  const declarados = anchosDe('Cobranzas')
  for (const texto of [H_LARGA, H_MEDIA]) {
    const r = planDeReparacion([cortado('H', 69, texto)], [336], enH(texto), { declarados })
    assert.deepEqual([...r.ensanchar], [[7, 480]], 'la H queda en el ancho DECLARADO, no en el que pide el texto')
    assert.deepEqual(r.aNota, [], 'y no queda nada derivado a nadie')
  }
})

test('el ancho declarado se aplica ENTERO: no depende del texto que haya cargado hoy', () => {
  // Si dependiera del dato, cada carga nueva movería la columna y volvería la disputa de propiedad.
  const corto = planDeReparacion([cortado('H', 1, H_MEDIA)], [336], enH(H_MEDIA), { declarados: anchosDe('Cobranzas') })
  const largo = planDeReparacion([cortado('H', 1, H_LARGA)], [336], enH(H_LARGA), { declarados: anchosDe('Cobranzas') })
  assert.deepEqual([...corto.ensanchar], [...largo.ensanchar])
})

test('un texto que TAMPOCO entra en el ancho declarado se sigue reportando', () => {
  // El ancho declarado no es una amnistía: pasado ese punto el problema es la redacción, y el
  // control tiene que seguir diciéndolo o la columna se llena de texto cortado en silencio.
  const monstruo = 'x'.repeat(90)
  const r = planDeReparacion([cortado('H', 9, monstruo)], [336], enH(monstruo), { declarados: anchosDe('Cobranzas') })
  assert.equal(r.ensanchar.size, 0)
  assert.deepEqual(r.aNota.map((n) => n.fila), [9])
})

test('el registro no le declara un ancho a una columna que YA tiene dueño', () => {
  // El defecto que esto atrapa: dos escritores con su propio número para la misma columna. El ancho
  // es de la COLUMNA ENTERA, así que gana el último que corre y el defecto vuelve en silencio.
  const letra = (i) => { let s = ''; for (let n = i; n >= 0; n = Math.floor(n / 26) - 1) s = String.fromCharCode(65 + (n % 26)) + s; return s }
  const delControl = new Set(Object.keys(ANCHOS_CONTROL).map((j) => letra(Number(j))))
  for (const col of Object.keys(anchosDe('Cobranzas'))) {
    assert.equal(delControl.has(col), false, `${col} ya la declara ANCHOS_CONTROL en cobranzas-control.mjs`)
  }
  // Y a la inversa: una pestaña con anchos gobernados por su propio generador no declara acá nada.
  for (const titulo of Object.keys(ANCHOS_DECLARADOS)) {
    assert.equal(CON_ANCHO_GOBERNADO.has(titulo), false, `${titulo} ya tiene su generador dueño de los anchos`)
  }
})

test('una columna sin declarar sigue con el criterio de siempre', () => {
  assert.equal(anchoDeclarado('Cobranzas', 'A'), null)
  assert.equal(anchoDeclarado('Compras', 'H'), null, 'la declaración es por PESTAÑA, no por letra suelta')
  assert.deepEqual(anchosDe('Compras'), {})
})

test('un párrafo nunca se arregla ensanchando, tenga o no dueño la pestaña', () => {
  const parrafo = 'x'.repeat(200)
  for (const anchoGobernado of [false, true]) {
    const r = planDeReparacion([cortado('C', 1, parrafo)], [100, 100, 60], grilla(parrafo), { anchoGobernado })
    assert.equal(r.ensanchar.size, 0)
    assert.equal(r.aNota.length, 1, 'se reporta para que el generador lo acorte')
  }
})

// ═══ EL TECHO MUDO: "✓ TODO ENTRA" SOBRE UNA VENTANA PARCIAL (15/08) ═══
//
// La lectura se cortaba en `Math.min(hoja.rows, 400)` y el veredicto no decía hasta dónde había
// mirado. En "Compras" —más de mil filas— eso publicaba `✓ todo el texto entra en su celda` con dos
// textos cortados en la columna E, uno en la fila 743, que `auditar-pantalla.mjs` sí veía. Dos
// herramientas del mismo repo contestando distinto sobre la misma pestaña, y la que tranquilizaba
// era la equivocada.
//
// Este test mira el FUENTE porque el defecto no está en un núcleo puro: está en el rango que se le
// pide a la API y en lo que se imprime al lado del ✓. Es el único lugar donde se puede fijar.
test('la lectura no se corta en un techo fijo y el veredicto dice cuántas filas miró', async () => {
  const fs = await import('node:fs')
  const src = fs.readFileSync(new URL('./reparar-textos.mjs', import.meta.url), 'utf8')
  // El comentario CITA la expresión vieja a propósito —es la evidencia de por qué se fue— así que la
  // aserción mira el código, no la prosa. Un test que se pone rojo por su propia documentación
  // enseña a borrar la documentación.
  const codigo = src.split(/\r?\n/).filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n")
  assert.doesNotMatch(codigo, /Math\.min\(hoja\.rows[^)]*,\s*\d+\)/,
    'un techo fijo sobre el alto de la grilla deja filas sin mirar y el ✓ no las distingue')
  assert.match(src, /const alto = hoja\.rows \?\? p\.hastaFila/,
    'la ventana arranca en el alto real de la pestaña')
  // Y el ✓ tiene que declarar su alcance: sin eso, un techo nuevo vuelve a ser invisible.
  assert.match(src, /✓ \(leí \$\{alto\} fila\(s\)\)/,
    'el veredicto limpio declara cuántas filas leyó')
})
