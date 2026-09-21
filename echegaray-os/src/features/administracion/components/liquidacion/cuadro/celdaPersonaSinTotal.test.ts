// LA COLUMNA PERSONA NO REPITE EL TOTAL (dueño, 21/09/2026).
//
// Textual, sobre la captura de esa celda —«Cobra $192.887,47 · pagado $0 · saldo $192…» encima de «Recibo:
// Ayudante · $5.399/h» y «Plataforma: Ayudante · $5.399/h»—: *«quites el total de lo que cobra de ahí y sólo dejes
// los valores hs»*. El bloque lo había puesto el 17/09 («no está claro cuánto cobra cada uno») copiando en la
// columna pegajosa las tres cifras que ya estaban al final de la fila.
//
// ═══ QUÉ SE PRUEBA, Y POR QUÉ ASÍ ═══
//
// Que la copia se fue Y que el dato no: Total, Pagado y Saldo siguen en sus columnas —con el pago que corresponde a
// cada tipo— y el panel de la persona sigue diciendo «Cobra total». Quitar la celda es fácil; quitar el número de
// la pantalla sería el defecto siguiente.
//
// Mutaciones que ponen rojo: devolver `{cobro}` a la celda fija, volver a importar un componente que dibuje el
// total ahí, o llevarse de paso los dos renglones de $/h que el dueño pidió dejar.

import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { motivoSinCobra } from './estadoDelPago.ts'

const AQUI = new URL('.', import.meta.url)
const fuente = (n: string): string => readFileSync(new URL(n, AQUI), 'utf8')

const PERSONA = fuente('./CeldaPersona.tsx')
const JORNALEROS = fuente('./FilasJornaleros.tsx')
const MENSUALES = fuente('./FilasMensuales.tsx')
const PANEL = fuente('./PanelDeLaPersona.tsx')

/** El cuerpo sin comentarios: un `//` que nombra el total no lo dibuja. */
const sinComentarios = (s: string): string => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

test('LA CELDA FIJA NO RECIBE NI DIBUJA EL COBRO', () => {
  const celda = sinComentarios(PERSONA)
  assert.doesNotMatch(celda, /cobro/, 'la celda fija ya no tiene la prop del cobro')
  assert.doesNotMatch(celda, /LoQueCobra/, 'ni el componente que lo dibujaba')
  assert.equal(existsSync(new URL('./LoQueCobra.tsx', AQUI)), false, 'el componente se borró: sin dueño no queda código muerto')
  for (const [nombre, src] of [['jornaleros', JORNALEROS], ['mensuales', MENSUALES]] as const) {
    assert.doesNotMatch(sinComentarios(src), /cobro=\{/, `el cuadro de ${nombre} no le pasa un cobro a la celda`)
    assert.doesNotMatch(sinComentarios(src), /LoQueCobra/, `el cuadro de ${nombre} no importa el componente`)
  }
})

test('LOS DOS RENGLONES DE $/H QUEDAN: es lo que el dueño pidió dejar', () => {
  assert.match(PERSONA, /\{detalle\}/, 'la celda sigue dibujando el detalle')
  assert.match(JORNALEROS, /categoriasDeLaFila\(/, 'el jornalero arma Recibo y Plataforma')
  assert.match(JORNALEROS, /<RenglonDelDetalle>\{c\.recibo\}<\/RenglonDelDetalle>/, 'el renglón del recibo')
  assert.match(JORNALEROS, /\{c\.plataforma\}/, 'y el de plataforma, con su $/h')
})

test('EL NÚMERO NO DESAPARECIÓ DE LA PANTALLA: sigue en sus columnas y en el panel', () => {
  for (const [nombre, src] of [['jornaleros', JORNALEROS], ['mensuales', MENSUALES]] as const) {
    assert.match(src, /<CeldaTotal fila=\{fila\}/, `${nombre}: la columna Total`)
    assert.match(src, /<CeldaPagadoTotal fila=\{fila\}/, `${nombre}: la columna Pagado`)
    assert.match(src, /<CeldaSaldo fila=\{fila\} lado="total"/, `${nombre}: la columna Saldo`)
  }
  // EL MENSUAL COBRA POR MES: sus columnas usan `pagoDelMensual`, no el pago de la quincena.
  assert.match(MENSUALES, /const p = pagoDelMensual\(l\)/)
  assert.match(MENSUALES, /<CeldaPagadoTotal fila=\{fila\} pago=\{p\} \/>/, 'el mensual paga por mes también en Pagado')
  assert.match(MENSUALES, /<CeldaSaldo fila=\{fila\} lado="total" pago=\{p\}/, 'y en Saldo')
  // EL PANEL SIGUE DICIENDO CUÁNTO COBRA: es donde el dueño lo mira persona por persona.
  assert.match(PANEL, /rotulo="Cobra total"/, 'el panel conserva el total')
})

test('POR QUÉ NO HAY TOTAL: una sola definición, la de la columna Total', () => {
  assert.equal(motivoSinCobra({ modalidad: 'mensual' }), 'importe no cargado')
  assert.equal(motivoSinCobra({ modalidad: 'jornalero', sinNeto: true }), 'sin neto')
  assert.equal(motivoSinCobra({ modalidad: 'jornalero' }), 'sin tarifa')
  const blancoNegro = fuente('./CeldasBlancoNegro.tsx')
  assert.match(blancoNegro, /const porque = motivoSinCobra\(l\)/, 'la columna Total la usa')
  assert.equal(blancoNegro.match(/'importe no cargado'/g), null, 'la frase no está escrita a mano en la columna')
})
