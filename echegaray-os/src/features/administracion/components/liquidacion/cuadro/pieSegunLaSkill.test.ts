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
  for (const nota of ['pie-descuento-', 'pie-sobrepasado-']) assert.match(ajustes, new RegExp(nota))
  // El importe del ajuste cae en la cuarta columna (Saldo): el texto ocupa las tres primeras de la misma grilla.
  assert.match(cuerpo(PIE, 'const Ajuste '), /col-span-3/)
})

// Dueño, 01/10/2026, con la captura de «Ajustes del saldo / Saldo redondeado $7.877.000»: «esas palabras y números
// tirados en el medio de la pantalla de liq de hs no recibió skill de ux ui, arreglar». El saldo redondeado no es
// un ajuste: es el saldo con el efectivo en billetes. Colgado bajo un título propio, en otro cuerpo de letra y
// tenue, quedaba suelto debajo del cuadro. Es un renglón más del cuadro, con la letra y la raya de los demás.
test('«Saldo redondeado» es un renglón del cuadro, no un ajuste suelto bajo un título propio', () => {
  assert.doesNotMatch(cuerpo(PIE, 'function AjustesDelSaldo'), /pie-saldo-redondeado|Saldo redondeado/)
  const renglon = cuerpo(PIE, 'function SaldoRedondeado')
  assert.match(renglon, /<Celda valor=\{t\.saldoRedondeado\} testid="pie-saldo-redondeado"/, 'la cifra es una celda como las de Banco, Efectivo y Total')
  assert.match(renglon, /\$\{GRILLA\} border-t border-line py-2/, 'la misma grilla, raya y alto que los renglones del cuadro')
  assert.match(renglon, /col-span-3/, 'el rótulo ocupa hasta la columna Saldo: la cifra cae debajo de los saldos')
  assert.doesNotMatch(renglon, /text-\[11/, 'ni letra más chica que la del cuadro')
  // Sin ajustes de verdad no hay título «Ajustes del saldo»: un título sin líneas era la mitad de lo «tirado».
  assert.match(cuerpo(PIE, 'function AjustesDelSaldo'), /if \(lineas\.length === 0\) return null/)
  assert.match(cuerpo(PIE, 'function DetalleDePlata'), /<AjustesDelSaldo c=\{c\} \/>\s*<SaldoRedondeado t=\{t\} \/>/)
})

test('el resumen va debajo del título y la cantidad de personas es metadato, no parte del título', () => {
  assert.match(TABLA, /className="flex flex-col gap-3[^"]*"[^>]*>\s*<h3/, 'título y resumen apilados')
  assert.doesNotMatch(GRILLA, /titulo=\{`Quincenales · por hora/, 'la cantidad volvió a pegarse al título')
  assert.match(GRILLA, /titulo="Quincenales" meta=/)
})

test('«Ir a» es navegación secundaria de texto, como los filtros: sin píldoras con borde', () => {
  const saltos = cuerpo(TABLA, 'function Saltos')
  assert.doesNotMatch(saltos, /rounded-full/)
  assert.doesNotMatch(saltos, /border-line-strong|border-ink/)
  assert.match(saltos, /bg-line-hairline font-semibold text-ink/, 'el activo se marca como en `FiltrosDelEspejo`')
  assert.match(saltos, /max-md:min-h-\[40px\]/, 'en el teléfono el blanco táctil mide 40 px')
})

// EL TOTAL GENERAL ES LA CABECERA (dueño, 30/09/2026: «esto es importante y está abajo de todo, mal puesto»).
test('el Total general va ARRIBA: después del sello y antes de los dos cuadros', () => {
  const sello = GRILLA.indexOf('{sello}')
  const total = GRILLA.indexOf('<PieTotalGeneral')
  const primerCuadro = GRILLA.indexOf('<TablaDeBloques')
  assert.ok(sello !== -1 && total !== -1 && primerCuadro !== -1, 'faltan piezas en la grilla')
  assert.ok(sello < total, 'el Total general va después del sello')
  assert.ok(total < primerCuadro, 'el Total general volvió a quedar debajo de los cuadros')
  assert.equal(GRILLA.split('<PieTotalGeneral').length - 1, 1, 'una sola vez')
})

test('el Total general: el Saldo es la cifra grande, el resto es contexto y cabe apilado a 390 px', () => {
  const total = cuerpo(PIE, 'export function PieTotalGeneral')
  assert.doesNotMatch(total, /style=\{\{/)
  assert.match(total, /data-testid="pie-general-saldo"[\s\S]*text-2xl/, 'el Saldo es lo que decide: la cifra principal')
  assert.doesNotMatch(total, /pie-general-(total|pagado)[^\n]*text-2xl/, 'Total y Pagado no compiten con el Saldo')
  assert.match(total, /grid-cols-2[^"]*sm:flex/, 'teléfono: dos columnas; PC: una fila')
  assert.match(total, /col-span-2/, 'el Saldo ocupa el ancho en el teléfono')
  assert.doesNotMatch(total, /border-t/, 'el borde va debajo de la cabecera, no arriba')
  for (const id of ['pie-total-general', 'pie-general-total', 'pie-general-pagado', 'pie-general-saldo', 'pie-general-redondeo', 'pie-general-saldo-redondeado', 'pie-general-no-cierra'])
    assert.match(total, new RegExp(id), `se perdió el testid ${id}`)
})
