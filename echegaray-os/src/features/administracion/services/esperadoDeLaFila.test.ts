// CONTRATO: «CONTRA QUÉ CIERRA UNA FILA» SE ESCRIBE UNA VEZ (dueño, 02/10/2026).
//
// El defecto: la regla de la resta cambió en `cierreDeLaFila` y quedó vieja en `totalGeneral` y `delJornalero`. El pie
// dijo «no cierra por $372.254,72» y el cierre de la Q2-09 fue rechazado. Dos defensas:
//   1. LECTURA DEL CÓDIGO: las tres funciones llaman a `esperadoDeLaFila` y ninguna vuelve a escribir a mano la resta
//      (`estado === 'aplicado' ? … : 0`, `arrastre?.importe`). Una cuarta copia de la cuenta no pasa este test.
//   2. CONDUCTA: sobre la misma fila, las tres dicen lo mismo — con resta, sin resta, y con la resta comida del efectivo.
//
// MUTACIONES que ponen esto en rojo (corridas el 03/10): volver a escribir `j.cobra + (j.arrastre?.importe ?? 0)` en
// `totalGeneral` (lectura); quitar la resta de `esperadoDeLaFila` (las tres filas con resta dejan de cerrar en conducta).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { esperadoDeLaFila, restaAplicada } from './esperadoDeLaFila.ts'
import { cierreDeLaFila, SIN_HORAS } from './cuadroDeJornales.ts'
import { fotoDeLaLinea } from './fotoDelCierre.ts'
import { totalesDeJornaleros, totalesDeMensuales, totalGeneral } from './liquidacionPorTipo.ts'
import { liquidarLinea } from './liquidacionQuincena.ts'
import { aplicarOverrides, type LineaConOverrides } from './liquidacionOverrides.ts'
import { conArrastre } from './liquidacionArrastre.ts'
import { pagoDeLaLinea } from './pagoDeLaQuincena.ts'
import type { FilaDelEspejo } from './espejoDeJornales.ts'
import type { EntradaDeBlanco } from './sueldoBlancoNegro.ts'

const fuente = (archivo: string): string => readFileSync(new URL(`./${archivo}`, import.meta.url), 'utf8')

/** El cuerpo de `function nombre(…) {…}`, por llaves balanceadas. */
function cuerpo(src: string, nombre: string): string {
  const i = src.search(new RegExp(`function ${nombre}\\b`))
  assert.ok(i >= 0, `no encontré function ${nombre}`)
  const desde = src.indexOf('{', src.indexOf(')', i))
  let prof = 0
  for (let k = desde; k < src.length; k++) {
    if (src[k] === '{') prof++
    else if (src[k] === '}' && --prof === 0) return src.slice(desde, k + 1)
  }
  throw new Error(`function ${nombre} sin cierre`)
}

const LOS_TRES = [
  { archivo: 'cuadroDeJornales.ts', funcion: 'cierreDeLaFila' },
  { archivo: 'liquidacionPorTipo.ts', funcion: 'totalGeneral' },
  { archivo: 'fotoDelCierre.ts', funcion: 'delJornalero' },
] as const

for (const { archivo, funcion } of LOS_TRES) {
  test(`${funcion} (${archivo}) usa esperadoDeLaFila y no escribe la resta a mano`, () => {
    const src = fuente(archivo)
    assert.match(src, /import \{[^}]*\besperadoDeLaFila\b[^}]*\} from '\.\/esperadoDeLaFila\.ts'/)
    const c = cuerpo(src, funcion)
    assert.match(c, /esperadoDeLaFila\(/, `${funcion} tiene que pedir la cuenta a esperadoDeLaFila`)
    assert.doesNotMatch(c, /estado\s*===\s*'aplicado'/, `${funcion} vuelve a decidir a mano qué resta cuenta`)
    assert.doesNotMatch(c, /arrastre\??\.importe/, `${funcion} vuelve a sumar la resta a mano`)
  })
}

test('esperadoDeLaFila: cobra − adelanto − ya transferido + la resta APLICADA', () => {
  assert.equal(esperadoDeLaFila({ cobra: 327074.7 }), 327074.7)
  assert.equal(esperadoDeLaFila({ cobra: 669801.32, arrastre: { importe: 54580.48, estado: 'aplicado' } }), 724381.8)
  assert.equal(esperadoDeLaFila({ cobra: 100, adelanto: 30, yaTransferido: 20, arrastre: { importe: 5, estado: 'aplicado' } }), 55)
  assert.equal(esperadoDeLaFila({ cobra: 100, arrastre: { importe: 5, estado: 'pendiente' } }), 100, 'sólo la aplicada')
  assert.equal(restaAplicada(null), 0)
})

// ═══ CONDUCTA: LAS TRES DICEN LO MISMO SOBRE LA MISMA FILA ═══
// Fila real de Aguero, Q2-09/2026: 68,5 h en negro × $6.348, recibo $234.963,32, resta Q1-09 $54.580,48.

const BLANCO: EntradaDeBlanco = {
  recibo: { personaId: 'p', cuil: '20111111112', periodo: 'Q2-09/2026', categoria: 'OFICIAL', valorHora: 6348,
    horasBlanco: 40, bruto: 300000, neto: 234963.32, driveFileId: null },
  netoDeNomina: null, pisoCategoria: 6348, proporcion: null,
}
const RESTA = { importe: 54580.48, motivo: 'Resta recibo Q1-09', periodoOrigen: 'Q1-09/2026' }
const linea = (): LineaConOverrides => aplicarOverrides(liquidarLinea({
  personaId: 'p', nombre: 'Aguero Cristian', nombreOrden: 'Aguero', horas: 108.5,
  tarifa: { valorHora: 6348, netoMensual: null, desde: '2026-09-01', origen: 'x' },
  adelanto: 0, yaTransferido: 0, reciboNeto: 234963.32, giroEnElLote: false,
}, 'obreros', null), {}, 'obreros', null, BLANCO, null)

const fila = (l: LineaConOverrides): FilaDelEspejo =>
  ({ personaId: l.personaId, nombre: l.nombre, grupo: 'obreros', celdas: [], cotejo: { estado: 'coincide' }, horasPorTipo: SIN_HORAS, linea: l, cerrada: false }) as unknown as FilaDelEspejo

const tres = (l: LineaConOverrides): [boolean | undefined, boolean, boolean] => [
  cierreDeLaFila(l)?.cierra,
  fotoDeLaLinea(l, 'obreros').ok,
  totalGeneral(totalesDeJornaleros([fila(l)]), totalesDeMensuales([])).cierra,
]

test('las tres cuentas cierran sin resta y con la resta sumada al banco', () => {
  const sin = linea()
  assert.equal(sin.pago.negro, 434838, 'precondición: 68,5 h × 6.348')
  assert.deepEqual(tres(sin), [true, true, true])
  assert.deepEqual(tres(conArrastre(sin, RESTA)), [true, true, true])
})

test('con la resta comida del efectivo (el conArrastre viejo) las tres dicen «no cierra», juntas', () => {
  const l = conArrastre(linea(), RESTA)
  const r2 = (n: number) => Math.round(n * 100) / 100
  const viejo: LineaConOverrides = {
    ...l, enEfectivo: r2((l.enEfectivo ?? 0) - RESTA.importe), total: r2((l.total ?? 0) - RESTA.importe),
    pago: pagoDeLaLinea({ banco: l.pago.banco, negro: r2((l.pago.negro ?? 0) - RESTA.importe), pagadoBanco: 0, pagadoEfectivo: 0 }),
  }
  assert.deepEqual(tres(viejo), [false, false, false])
})
