// LOS CUATRO DEFECTOS QUE ESTE LECTOR EXISTE PARA NO TENER.
//
// Cada bloque de abajo declara la MUTACIÓN que lo pone en rojo, y esa mutación se corrió de verdad:
// un test que no se probó contra el defecto sólo prueba que el código no tira excepciones.
//
// El libro de prueba se ESCRIBE con el mismo SheetJS que después lo lee, y eso es deliberado: no es
// un fixture inventado a mano con la forma que al lector le conviene, es un OOXML real con sus
// fórmulas adentro del ZIP. Lo que NO prueba es el archivo del cliente — eso lo prueba
// `xsas-desde-documentos.mjs` sobre el COMPUTO.xlsx de Drive, y por eso las dos evidencias existen.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import {
  leerPlanilla, hojaDe, filaDe, filasDe, valorDe, refsDeFormula,
  porQueNoAbre, partirDireccion, columnaDeLetra, letraDeColumna, CELDA,
} from './planilla.mjs'

const require = createRequire(import.meta.url)
const XLSX = require('xlsx')

/** Un libro con DOS hojas donde la primera NO es la que vale, una fórmula con inputs, una celda
 *  vacía en el medio y un 0 escrito a mano al lado. Es la forma exacta del COMPUTO.xlsx real. */
function libroDePrueba() {
  const real = XLSX.utils.aoa_to_sheet([
    ['Bases', 'Cantidad', 'X', 'Vol Total'],
    ['B1', 99, 9, null],
  ])
  const presu = XLSX.utils.aoa_to_sheet([
    ['Bases', 'Cantidad', 'X', 'Vol Total', 'Unidad'],
    ['B1', 11, 1.2, null, 'm3'],
    ['B0', 0, null, null, 'm3'],
  ])
  presu.D2 = { t: 'n', v: 13.2, f: 'B2*C2' }
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, real, 'Real')
  XLSX.utils.book_append_sheet(wb, presu, 'Presupuestado')
  return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }))
}

test('planilla · direcciones A1 ida y vuelta', () => {
  assert.equal(columnaDeLetra('A'), 1)
  assert.equal(columnaDeLetra('AA'), 27)
  assert.equal(letraDeColumna(27), 'AA')
  assert.deepEqual(partirDireccion('H3'), { columna: 8, letra: 'H', fila: 3 })
  assert.equal(partirDireccion('SUMA'), null)
})

test('planilla · POSITIVO: se leen TODAS las hojas, no la primera', () => {
  const p = leerPlanilla(libroDePrueba(), { nombre: 'computo.xlsx' })
  assert.equal(p.ok, true)
  assert.deepEqual(p.hojas.map((h) => h.nombre), ['Real', 'Presupuestado'])
  // ═══ MUTACIÓN QUE LO PONE ROJO ═══
  // En `leerPlanilla`, cambiar el recorrido a `(wb.SheetNames ?? []).slice(0, 1).entries()`.
  // Es LITERALMENTE lo que hace `google.readExcel` (`sheets[0]`), y por eso el circuito venía
  // leyendo «Real» —lo ejecutado— cuando la cotización salió de «Presupuestado».
  assert.ok(hojaDe(p, 'Presupuestado'), 'la segunda hoja tiene que existir')
})

test('planilla · POSITIVO: la fórmula y sus inputs sobreviven a la lectura', () => {
  const p = leerPlanilla(libroDePrueba(), { nombre: 'computo.xlsx' })
  const h = hojaDe(p, 'Presupuestado')
  const d2 = filaDe(h, 2).get('D')
  assert.equal(d2.valor, 13.2)
  assert.equal(d2.formula, 'B2*C2')
  // ═══ MUTACIÓN QUE LO PONE ROJO ═══
  // En `normalizarCelda`, `const formula = null`. Sin esto la cantidad es una constante sin origen:
  // exactamente el estado en que `sheet_to_json` la entrega hoy.
  assert.deepEqual(d2.inputs.map((r) => r.desde), ['B2', 'C2'])
})

test('planilla · NEGATIVO: una celda vacía NO es un cero (NULL≠0)', () => {
  const p = leerPlanilla(libroDePrueba(), { nombre: 'computo.xlsx' })
  const h = hojaDe(p, 'Presupuestado')
  // C3 está vacía; B3 tiene un 0 escrito a mano. Son cosas distintas y tienen que verse distintas.
  assert.equal(valorDe(h, 'C3'), undefined, 'una celda ausente devuelve undefined, nunca 0')
  assert.equal(valorDe(h, 'B3'), 0, 'un 0 escrito a mano vale 0')
  assert.ok(!filaDe(h, 3).has('C'), 'la celda vacía no entra al modelo')
  // ═══ MUTACIÓN QUE LO PONE ROJO ═══
  // En `normalizarCelda`, `valor: tipo === CELDA.ERROR || tipo === CELDA.VACIA ? 0 : c.v`.
  // Es el `filter(Boolean)` de `google.readExcel` visto del otro lado: colapsa hueco y cero.
  assert.equal(filaDe(h, 3).get('B').tipo, CELDA.NUMERO)
})

test('planilla · NEGATIVO: un ERROR de celda no vale 0', () => {
  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.aoa_to_sheet([['x']])
  ws.B1 = { t: 'e', v: 0x17, w: '#REF!', f: 'A99*2' }
  ws['!ref'] = 'A1:B1'
  XLSX.utils.book_append_sheet(wb, ws, 'h')
  const p = leerPlanilla(Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })), { nombre: 'e.xlsx' })
  const c = filaDe(hojaDe(p, 'h'), 1).get('B')
  assert.equal(c.tipo, CELDA.ERROR)
  assert.equal(c.valor, null, 'ERROR≠0: no puede entrar al cómputo como cero')
  // ═══ MUTACIÓN QUE LO PONE ROJO ═══ en `tipoDeCelda`, borrar la línea `if (c.t === 'e')`.
})

test('planilla · NEGATIVO: un .xls OLE2 se rechaza CON NOMBRE, no devuelve cero hojas', () => {
  const ole2 = Buffer.concat([Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), Buffer.alloc(64)])
  const r = leerPlanilla(ole2, { nombre: 'viejo.xls' })
  assert.equal(r.ok, false)
  // La aserción NO puede ser `/OLE2/`: el mensaje de descarte genérico —«no empieza con la firma PK
  // ni con la de OLE2»— también contiene esa palabra, así que el test daba verde con la rama OLE2
  // borrada. Se pide la frase que SÓLO produce esa rama, que además es la que le dice al humano qué
  // hacer con el archivo.
  assert.match(r.porQue, /Office 97-2003/)
  assert.match(r.porQue, /BIFF/)
  // ═══ MUTACIÓN QUE LO PONE ROJO ═══
  // En `porQueNoAbre`, borrar la rama OLE2. El archivo pasa a SheetJS, que devuelve un libro
  // vacío o tira, y el proyecto se declara «sin cantidades» por una limitación del lector.
  assert.equal(porQueNoAbre(Buffer.from('PKxx'), 'a.xlsx'), null)
  assert.match(String(porQueNoAbre(Buffer.from('hola'), 'a.xlsx')), /PK/)
})

test('planilla · refs: los literales de texto no aportan referencias falsas', () => {
  assert.deepEqual(refsDeFormula('SI(Q3="B2";1;0)').map((r) => r.desde), ['Q3'])
  const r = refsDeFormula('SUMA(Presupuestado!P3:P10)')
  assert.equal(r[0].hoja, 'Presupuestado')
  assert.equal(r[0].rango, true)
  assert.equal(r[0].hasta, 'P10')
  // ═══ MUTACIÓN QUE LO PONE ROJO ═══ en `refsDeFormula`, borrar el `.replace` de literales:
  // «B2» escrito adentro de una etiqueta pasa a contarse como input de la fórmula.
  assert.deepEqual(filasDe({ celdas: [{ fila: 5 }, { fila: 2 }, { fila: 5 }] }), [2, 5])
})
