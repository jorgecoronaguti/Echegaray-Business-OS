import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

// ═══ QUÉ PROTEGE ESTE TEST ═══
//
// Se verifica el FUENTE, no el render: lo que se protege es de dónde sale cada decisión visual y
// cada número. Un tipo bien puesto no ve un hex suelto ni un segundo cálculo.
//
//  · UN COLOR INVENTADO. La identidad del OS se mide del logo y vive en tokens (`V`, las clases del
//    design system). Un `#10233a` escrito a mano en un componente es exactamente cómo el acento del
//    OS pasó meses siendo un navy que no tenía nada que ver con la empresa.
//  · UN SEGUNDO CÁLCULO DE LA DEUDA. La tabla y el panel reciben números ya armados por
//    `deudaProveedores.ts`, que se prueba sin navegador. Una suma en el JSX sería una segunda
//    definición de cuánto se le debe a alguien, y las dos se separarían en silencio.
//  · UN PANEL PROPIO. El detalle se abre con el `Drawer` del design system, el mismo del CRM: otro
//    componente sería un tercer comportamiento para el mismo gesto (✕, Escape, 390px).
//  · UNA LECTURA DESDE EL COMPONENTE. Ni Supabase ni acciones: la pantalla lee en la página.
//  · EL ENLACE A COMPRAS. Cada línea tiene que poder llevar a la fila donde se corrige.

const DIR = dirname(fileURLToPath(import.meta.url))
const sinComentarios = (t: string) => t
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n').filter((l) => !/^\s*(\/\/|\*)/.test(l)).join('\n')

const tabla = () => sinComentarios(readFileSync(join(DIR, 'TablaDeuda.tsx'), 'utf8'))
const panel = () => sinComentarios(readFileSync(join(DIR, 'PanelDeudaProveedor.tsx'), 'utf8'))
const PIEZAS = () => [['TablaDeuda', tabla()], ['PanelDeudaProveedor', panel()]] as const

test('ninguna pieza escribe un color a mano: todo sale de un token', () => {
  for (const [nombre, src] of PIEZAS()) {
    const hex = src.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []
    assert.deepEqual(hex, [], `${nombre} tiene hex sueltos: ${hex.join(', ')}`)
    // Tampoco por la puerta de atrás: un rgb()/hsl() literal es el mismo defecto con otra sintaxis.
    assert.doesNotMatch(src, /\b(rgb|rgba|hsl|hsla)\(/, `${nombre} escribe un color literal`)
  }
})

test('el ámbar y el filo de problema se usan sólo para lo vencido o lo que falta', () => {
  const src = tabla()
  // `V.warn` aparece en: vencido, «sin fecha», «sin ficha», el próximo cuando ya venció, y el pie.
  // Lo que NO puede pasar es que la columna «por vencer» lo use: un compromiso no es un problema.
  assert.match(src, /testid="deuda-por-vencer"[\s\S]{0,200}?color: V\.tintaSuave|color=\{V\.tintaSuave\}[\s\S]{0,200}?testid="deuda-por-vencer"/)
  assert.match(src, /FILO_BLOQUEA/)
  assert.match(src, /vencida \? FILO_BLOQUEA : undefined/)
})

test('ninguna pieza vuelve a calcular la deuda: recibe los números ya armados', () => {
  for (const [nombre, src] of PIEZAS()) {
    assert.doesNotMatch(src, /\.reduce\(/, `${nombre} suma por su cuenta`)
    assert.doesNotMatch(src, /saldo_pendiente|monto_parcial|fecha_prevista/, `${nombre} lee la réplica cruda`)
    assert.doesNotMatch(src, /new Date\(\)/, `${nombre} decide por su cuenta qué día es hoy`)
  }
  // El corte del vencimiento llega como dato y se DECLARA en pantalla, no se recalcula.
  assert.match(tabla(), /hoy: string/)
  assert.match(panel(), /hoy: string/)
})

test('el detalle se abre con el Drawer del design system, no con un panel propio', () => {
  const src = panel()
  assert.match(src, /import \{ Drawer \} from '@\/shared\/components\/ds'/)
  assert.match(src, /<Drawer\b/)
  assert.match(src, /onCerrar=\{\(\) => router\.push\(cerrarHref\)\}/)
  // Escape y ✕ los pone el Drawer: si alguien los reimplementara acá habría dos maneras de cerrar.
  assert.doesNotMatch(src, /addEventListener|'Escape'/)
})

test('cada línea del panel lleva a su fila de la pestaña Compras', () => {
  const src = panel()
  assert.match(src, /href=\{`\$\{base\}\$\{l\.fila\}`\}/)
  assert.match(src, /hrefComprasBase: string/)
  // Y la tabla lleva al panel por la URL: se comparte por chat y se cierra con el botón de atrás.
  assert.match(tabla(), /hrefDe: \(clave: string\) => string/)
})

test('ninguna pieza lee de la base ni escribe nada', () => {
  for (const [nombre, src] of PIEZAS()) {
    assert.doesNotMatch(src, /supabase|createClient|\.from\(|'use server'/, `${nombre} toca la base`)
    assert.doesNotMatch(src, /\.update\(|\.insert\(|\.upsert\(|\.delete\(/, `${nombre} escribe`)
  }
})

test('la tabla no dibuja una tarjeta por dato ni una sombra propia', () => {
  const src = tabla()
  assert.doesNotMatch(src, /boxShadow: '0|shadow-card|borderRadius/)
  // El único boxShadow admitido es el filo de «esto bloquea», que es un filo y no una sombra.
  const sombras = src.match(/boxShadow:[^,\n]*/g) ?? []
  assert.ok(sombras.every((s) => s.includes('FILO_BLOQUEA')), `sombras ajenas: ${sombras.join(' | ')}`)
})

test('los importes van en números tabulares y alineados a la derecha', () => {
  const src = tabla()
  assert.match(src, /const MONO = 'font-mono tabular-nums'/)
  assert.match(src, /plataCentavos/)
  // Formato $ es-AR: sale de `plataCentavos`, nunca de un `toLocaleString` escrito acá.
  assert.doesNotMatch(src, /toLocaleString/)
  assert.doesNotMatch(panel(), /toLocaleString/)
})

test('a 390px la tabla suelta columnas en vez de empujar la página a un scroll lateral', () => {
  const src = tabla()
  assert.match(src, /max-\[1199px\]:grid-cols-\[/)
  assert.match(src, /const SOLO_ANCHO = 'max-\[1199px\]:hidden'/)
  // El display de esas celdas va POR CLASE: un `style` inline le gana a la media query y el rótulo
  // se queda dibujado sobre una columna que ya no existe.
  assert.doesNotMatch(src, /SOLO_ANCHO[\s\S]{0,80}style=\{\{ display:/)
})

test('lo que no se sabe se dice: sin fecha, sin ficha y el descuadre tienen su lugar', () => {
  assert.match(tabla(), /testid="deuda-sin-fecha"/)
  assert.match(tabla(), /testid="deuda-sin-ficha"/)
  assert.match(tabla(), /testid="deuda-vacia"/)
  assert.match(panel(), /testid="deuda-no-cierra"/)
  assert.match(panel(), /testid="deuda-sin-ficha-panel"/)
})
