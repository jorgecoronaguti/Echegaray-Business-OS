import { test } from 'node:test'
import assert from 'node:assert/strict'
import { llamadasA, primerArgumento, textoDeCelda, textosDeColumnaA } from './literales-de-generador.mjs'

// ═══ LO QUE ESTOS TESTS PRUEBAN ═══
//
// El extractor existe para que el contrato de diseño se pueda medir SIN el Sheet vivo. Si mide mal,
// el control que se apoya en él da verde sobre prosa publicada — que es peor que no tenerlo. Cada
// test de acá es un caso REAL tomado de los generadores del archivo, no un ejemplo inventado.

test('la concatenación se junta: un párrafo partido en tres literales mide lo que se ve', () => {
  // El caso exacto de «Nómina» que el regex del test de Plantel medía como 38 caracteres.
  const src = `fila('Neto acordado de 1.800.000 para CADA UNO. '
    + 'Por banco va lo que dice su recibo y el efectivo COMPLETA hasta ese neto: '
    + 'si el recibo sube, baja el efectivo.')`
  const [t] = textosDeColumnaA(src)
  assert.ok(t.length > 130, `midió ${t.length}: se quedó con el primer literal en vez de juntar los tres`)
  assert.ok(t.startsWith('Neto acordado') && t.endsWith('baja el efectivo.'))
})

test('un comentario en castellano con comillas no desfasa al escáner', () => {
  // Los comentarios de este repositorio citan al dueño: «te dije q no borraras mi ediciones». Un
  // regex que corta por comilla sin saber si está adentro de un comentario se desincroniza acá.
  const src = `
    // el dueño: 'no borres mis ediciones' — y tenía razón (dos veces)
    fila('Persona')`
  assert.deepEqual(textosDeColumnaA(src), ['Persona'])
})

test('las interpolaciones no se borran: se reemplazan, para no pegar las palabras de los lados', () => {
  // Borrarlas daría «al06/09» y, peor, puede fabricar un conector que nadie escribió.
  const t = textoDeCelda('`Jornadas completadas: ${n} · ${h} h`')
  assert.equal(t, 'Jornadas completadas: 0 · 0 h')
})

test('un template anidado adentro de ${…} no corta la expresión al medio', () => {
  // Real, de «Nómina»: `${bajas.map((p) => `${p.nombre} (${p.dia})`).join(' · ')}`.
  const t = textoDeCelda('`sin horas: ${xs.map((p) => `${p.nombre} (${p.dia})`).join(\' · \')} — fin`')
  assert.equal(t, 'sin horas: 0 — fin')
})

test('el helper se aplica: seccion() devuelve el título con su número y en versalita', () => {
  // Sin esto, `esProsa` juzga el texto pelado y deja de reconocerlo como TÍTULO, así que nunca parte
  // nombre y glosa — y el contrato mide otra cosa que la que se publica.
  assert.equal(textosDeColumnaA("fila(seccion(3, 'lo que terminó · liquidaciones finales'))")[0],
    '1 · LO QUE TERMINÓ · LIQUIDACIONES FINALES')
  assert.equal(textosDeColumnaA("fila(sub('sin recibo'))")[0], '   · sin recibo')
  assert.equal(textosDeColumnaA("fila(rotuloTotal('2 persona(s)'))")[0], '⇒ 2 persona(s)')
})

test('sólo se lee la PRIMERA columna: lo que va en B o en C no es la celda de concepto', () => {
  assert.deepEqual(textosDeColumnaA("fila('Persona', 'Categoría', 'COBRA')"), ['Persona'])
})

test('el tramo se recorta por marcadores: un generador que escribe dos pestañas no las mezcla', () => {
  const src = `fila('uno')
    // ─── DESDE ACÁ, TODO VA A «Plantel» ───
    fila('dos')`
  assert.deepEqual(textosDeColumnaA(src, { hasta: 'DESDE ACÁ' }), ['uno'])
})

test('los paréntesis balancean: una llamada anidada no cierra la de afuera', () => {
  const [c] = llamadasA("fila(sub(`a (b) c`), 'x')", 'fila')
  assert.equal(primerArgumento(c), 'sub(`a (b) c`)')
})

test('una llamada a OTRA función que termina en el mismo nombre no cuenta como fila()', () => {
  // `subfila(` y `x.fila(` no son la función del generador. Sin el lookbehind, el extractor recogía
  // texto que nunca llega a la columna A.
  assert.deepEqual(textosDeColumnaA("subfila('no'); tabla.fila('tampoco'); fila('sí')"), ['sí'])
})
