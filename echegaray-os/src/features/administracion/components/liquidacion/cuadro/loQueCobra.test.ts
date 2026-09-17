// CUÁNTO COBRA CADA UNO, VISIBLE SIN DESPLAZARSE (dueño, 17/09/2026: «liq de hs, no está claro cuánto cobra cada uno»).
//
// ═══ EL DEFECTO QUE ATRAPA ═══
//
// Total · Pagado · Saldo son las tres últimas columnas de un cuadro de ~2.900 px: para saber cuánto cobra alguien
// había que desplazarse hasta el final, donde el nombre ya no se ve. El arreglo pone esas mismas tres cifras en la
// columna Persona, que es pegajosa. Lo que se prueba es que sigan siendo LAS MISMAS —el mismo campo de la línea y el
// MISMO pago que dibujan las columnas—, no una segunda cuenta que mañana diga otra cosa que la columna Total.
//
// Cada afirmación tiene su mutación: sacar `{cobro}` de la celda fija, hacer que el mensual no pase su `pagoDelMensual`,
// o restar acá en vez de leer `pago.saldoTotal`, ponen rojo.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { motivoSinCobra } from './estadoDelPago.ts'

const AQUI = new URL('.', import.meta.url)
const fuente = (n: string): string => readFileSync(new URL(n, AQUI), 'utf8')

const COBRA = fuente('./LoQueCobra.tsx')
const PERSONA = fuente('./CeldaPersona.tsx')
const JORNALEROS = fuente('./FilasJornaleros.tsx')
const MENSUALES = fuente('./FilasMensuales.tsx')

/** El cuerpo sin comentarios: un `//` que nombra una cuenta no es una cuenta. */
const sinComentarios = (s: string): string => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

test('EL COBRO VA EN LA COLUMNA PEGAJOSA, ARRIBA DEL DETALLE: se ve sin desplazarse', () => {
  assert.match(PERSONA, /cobro: ReactNode/, 'la celda fija recibe el cobro')
  assert.match(PERSONA, /\{cobro\}/, 'y lo dibuja')
  // ADENTRO DE LA CELDA FIJA Y ANTES DEL DETALLE: si quedara afuera se iría con el scroll, y si quedara debajo de la
  // categoría el número que decide leería después del que sólo explica.
  const celda = PERSONA.slice(PERSONA.indexOf('...COLUMNA_FIJA, ...PERSONA_ESTIRADA'))
  assert.ok(celda.indexOf('{cobro}') > 0, 'el cobro está dentro de la celda fija')
  assert.ok(celda.indexOf('{cobro}') < celda.indexOf('{detalle}'), 'el cobro se lee antes que el detalle')
  // EL DETALLE ES SEGUNDO PLANO: si volviera a `V.apagado` competiría con el número que decide.
  assert.match(celda, /fontSize: '11px', lineHeight: '13px', color: V\.tenue/, 'el detalle queda tenue')
})

test('LOS DOS TIPOS DE EMPLEADO MUESTRAN SU COBRO, Y EL MENSUAL CON SU PROPIO PAGO', () => {
  assert.match(JORNALEROS, /cobro=\{<LoQueCobra fila=\{fila\} \/>\}/, 'el jornalero, con el pago de la línea')
  // EL MENSUAL COBRA POR MES: `pagoDelMensual` es lo que dibujan su Pagado y su Saldo. Sin pasarlo, la celda fija
  // diría un saldo y la columna otro para la misma persona.
  assert.match(MENSUALES, /const p = pagoDelMensual\(l\)/)
  assert.match(MENSUALES, /cobro=\{<LoQueCobra fila=\{fila\} pago=\{p\} \/>\}/, 'el mensual, con pagoDelMensual')
  assert.match(MENSUALES, /<CeldaPagadoTotal fila=\{fila\} pago=\{p\} \/>/, 'el mismo pago que la columna Pagado')
  assert.match(MENSUALES, /<CeldaSaldo fila=\{fila\} lado="total" pago=\{p\}/, 'el mismo pago que la columna Saldo')
})

test('NO CALCULA NADA: las tres cifras son las de las columnas', () => {
  const cuerpo = sinComentarios(COBRA)
  assert.match(cuerpo, /l\.cobra/, 'lo que cobra sale de linea.cobra, igual que CeldaTotal')
  assert.match(cuerpo, /pesos\(p\.pagado\)/, 'lo pagado sale de pago.pagado, igual que CeldaPagadoTotal')
  assert.match(cuerpo, /const saldo = p\.saldoTotal/, 'el saldo sale de pago.saldoTotal, igual que CeldaSaldo')
  assert.match(cuerpo, /const p = pago \?\? l\.pago/, 'el pago lo decide quien arma la fila, como en las columnas')
  // MUTACIÓN: escribir `l.cobra - p.pagado` acá pone rojo. Una resta propia se desengancharía de la columna Saldo.
  assert.doesNotMatch(cuerpo, /(cobra|pagado|saldoTotal)\s*[-+*/]\s*/, 'ninguna cuenta propia')
  assert.doesNotMatch(cuerpo, /#[0-9A-Fa-f]{3,6}\b/, 'ningún color fuera de los tokens')
})

test('EL SALDO SE PINTA ÁMBAR EN NEGATIVO, COMO LA COLUMNA: ahí se pagó de más', () => {
  assert.match(COBRA, /saldo < 0 \? V\.warn/)
  // SIN SALDO NO SE AFIRMA UN 0: un mensual sin sueldo cargado no tiene saldo que decir.
  assert.match(COBRA, /saldo != null &&/)
})

test('POR QUÉ NO HAY TOTAL: una sola definición, la que también usa la columna Total', () => {
  assert.equal(motivoSinCobra({ modalidad: 'mensual' }), 'importe no cargado')
  assert.equal(motivoSinCobra({ modalidad: 'jornalero', sinNeto: true }), 'sin neto')
  assert.equal(motivoSinCobra({ modalidad: 'jornalero' }), 'sin tarifa')
  // MUTACIÓN: volver a escribir la frase a mano en cualquiera de los dos lados pone rojo.
  const blancoNegro = fuente('./CeldasBlancoNegro.tsx')
  assert.match(blancoNegro, /const porque = motivoSinCobra\(l\)/, 'la columna Total la usa')
  assert.match(COBRA, /motivoSinCobra\(l\)/, 'el cobro de la celda fija la usa')
  assert.equal(blancoNegro.match(/'importe no cargado'/g), null, 'la frase ya no está escrita a mano en la columna')
})
