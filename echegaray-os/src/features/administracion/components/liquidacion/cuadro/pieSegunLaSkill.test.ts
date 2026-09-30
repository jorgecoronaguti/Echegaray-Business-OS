// EL PIE DE LA QUINCENA RESPETA LA SKILL DE DISEÑO (dueño, 30/09/2026: «esto claramente no respetó ningún
// lineamiento de ux ui, rehacer»).
//
// Lo rechazado: paleta propia en estilos en línea, «A pagar hoy» de tamaños dispares al lado del título, una línea
// roja suelta para «cobraron de más», notas pegadas debajo de cada cifra y los saltos «Ir a» como píldoras con borde.
// Cada test de acá se pone rojo si una de esas piezas vuelve. Las cifras no se prueban acá: son de
// `conciliacionDePlata.test.ts` y `solapaQuincena.test.ts`.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const fuente = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8')
const PIE = fuente('./PieDeLaQuincena.tsx')
const TABLA = fuente('./TablaDeBloques.tsx')
const GRILLA = fuente('../GrillaEspejoQuincena.tsx')

/** El cuerpo de una función o componente del archivo, hasta la próxima declaración de primer nivel. */
const cuerpo = (src: string, inicio: string) => {
  const i = src.indexOf(inicio)
  assert.notEqual(i, -1, `no está ${inicio}`)
  const resto = src.slice(i + inicio.length)
  const fin = resto.search(/\n(?:export )?(?:function|const) /)
  return fin === -1 ? resto : resto.slice(0, fin)
}

test('el pie usa los tokens del sistema: ni estilos en línea ni hex ni la paleta `V`', () => {
  assert.doesNotMatch(PIE, /style=\{\{/, 'un style={{…}} en el pie es una paleta paralela a los tokens')
  assert.doesNotMatch(PIE, /#[0-9A-Fa-f]{3,8}\b/, 'un hex suelto en el pie')
  assert.doesNotMatch(PIE, /from '@\/shared\/components\/v2\/patron'/, 'el pie no lee colores de `V`')
})

test('lo que acompaña a cada «A pagar hoy» cuelga del mismo componente: no queda una línea suelta de otro tamaño', () => {
  // Antes el arrastre y el redondeo eran `<div style={ROT}>` hermanos del importe, con su propio tamaño y color.
  assert.match(PIE, /<APagar rotulo="A pagar hoy · banco"[^/]*?>[\s\S]*?<Acompana testid="pie-arrastre"[\s\S]*?<\/APagar>/)
  assert.match(PIE, /<APagar rotulo="A pagar hoy · efectivo"[^/]*?>[\s\S]*?<Acompana testid="pie-redondeo"[\s\S]*?<\/APagar>/)
  assert.doesNotMatch(PIE, /<div data-testid="pie-(arrastre|redondeo)"/)
})

test('«cobraron de más» es un aviso del sistema, no una línea de color suelta', () => {
  assert.match(PIE, /<Callout tono="warn"[^>]*>\s*<span data-testid="pie-cobraron-de-mas">/)
})

test('las filas de cifras no llevan notas pegadas: los ajustes del saldo van aparte, alineados en Saldo', () => {
  const detalle = cuerpo(PIE, 'function DetalleDePlata')
  for (const nota of ['pie-descuento-', 'pie-sobrepasado-', 'pie-saldo-redondeado']) {
    assert.doesNotMatch(detalle, new RegExp(nota), `${nota} volvió a colgar dentro de las filas Banco/Efectivo/Total`)
  }
  const ajustes = cuerpo(PIE, 'function AjustesDelSaldo')
  for (const nota of ['pie-descuento-', 'pie-sobrepasado-', 'pie-saldo-redondeado']) assert.match(ajustes, new RegExp(nota))
  // El importe del ajuste cae en la cuarta columna (Saldo): el texto ocupa las tres primeras de la misma grilla.
  assert.match(cuerpo(PIE, 'const Ajuste '), /col-span-3/)
})

test('el resumen va debajo del título y la cantidad de personas es metadato, no parte del título', () => {
  assert.match(TABLA, /className="flex flex-col gap-3[^"]*"[^>]*>\s*<h3/, 'título y resumen apilados')
  assert.doesNotMatch(GRILLA, /titulo=\{`Jornaleros · por hora/, 'la cantidad volvió a pegarse al título')
  assert.match(GRILLA, /titulo="Jornaleros" meta=/)
})

test('«Ir a» es navegación secundaria de texto, como los filtros: sin píldoras con borde', () => {
  const saltos = cuerpo(TABLA, 'function Saltos')
  assert.doesNotMatch(saltos, /rounded-full/)
  assert.doesNotMatch(saltos, /border-line-strong|border-ink/)
  assert.match(saltos, /bg-line-hairline font-semibold text-ink/, 'el activo se marca como en `FiltrosDelEspejo`')
  assert.match(saltos, /max-md:min-h-\[40px\]/, 'en el teléfono el blanco táctil mide 40 px')
})
