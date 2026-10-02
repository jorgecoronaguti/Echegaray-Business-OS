// Tests del enganche de `_HABERES_PAGADOS_RAW` con CAJA (lib/caja-haberes-web.mjs). Herméticos: arman fórmulas.
// Lo que prueban: una quincena se lee de la planilla O de la web (el MISMO corte, con `<` de un lado y `>=` del
// otro), cada medio y grupo cae en su renglón, y la ventana del efectivo es la del conteo.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { HAB, corteQuincena, antesDelCorte, formulaHaberesWebEfectivo, formulaHaberesWebBanco } from './caja-haberes-web.mjs'
import {
  formulaJornalesEfectivoPosteriores, formulaJornalesBancoPosteriores, formulaOficinaEfectivoPosteriores,
  formulaOficinaBancoPosteriores, formulaOficinaSinCanal, formulaFechaUltimoEfectivo, celdaJornalesEfectivo,
  formulaNetaEfectivoPosterior,
} from './caja-posterior-al-corte.mjs'
import { MAPAS_HOY } from './columnas-caja.fixture.mjs'
import { CORTE_QUINCENA } from './haberes-pagados.mjs'
import { COL, FILA0 } from '../scripts/haberes-pagados-raw-pestana.mjs'

const CORTE = corteQuincena()
const RAW = (x) => `'_HABERES_PAGADOS_RAW'!$${x}$4:$${x}`
const cuenta = (s, sub) => s.split(sub).length - 1

test('el contrato de columnas es el de la réplica: si el generador mueve una columna, esto se pone rojo', () => {
  assert.deepEqual([HAB.fecha, HAB.quincena, HAB.grupo, HAB.medio, HAB.importe, HAB.anotado, HAB.desde],
    [COL.fecha, COL.desde, COL.grupo, COL.medio, COL.importe, COL.instante, FILA0])
  assert.equal(HAB.corte, '$B$2')
})

test('sin corte publicado (réplica vieja) la web no suma y la planilla suma todo: nunca las dos', () => {
  assert.equal(CORTE, "IF(ISNUMBER('_HABERES_PAGADOS_RAW'!$B$2);'_HABERES_PAGADOS_RAW'!$B$2;DATE(9999;12;31))")
  assert.equal(antesDelCorte('JORNALES_REAL_DESDE'), `(JORNALES_REAL_DESDE<${CORTE})`)
})

test('jornales en efectivo: planilla con quincena < corte + web (obreros, efectivo) con quincena ≥ corte', () => {
  const f = formulaJornalesEfectivoPosteriores('$F$9')
  assert.ok(f.includes(`(JORNALES_REAL_DESDE<${CORTE})`), 'la planilla deja de leer las quincenas ≥ corte')
  assert.ok(f.includes(`(${RAW('C')}>=${CORTE})`), 'la web lee exactamente las quincenas ≥ corte')
  assert.ok(f.includes(`(${RAW('G')}="efectivo")`) && f.includes(`(${RAW('E')}<>"oficina")`))
  // De conteo a conteo (02/10/2026): «Anotado el» contra el instante del sello; sin hora, sólo días POSTERIORES.
  assert.ok(f.includes(`(${RAW('K')}>$F$9)`) && f.includes(`(${RAW('A')}>INT($F$9))`) && f.includes(`(${RAW('A')}<=TODAY())`))
  assert.ok(!f.includes(`${RAW('A')}>=INT(`), 'la ventana inclusiva por día restaba lo que el conteo ya tenía adentro')
  assert.ok(!f.includes('"caja"'), 'no filtra «Sale de»: el adelanto desde una entrega ya vuelve por _EFECTIVO_RAW')
  assert.equal(cuenta(f, '_HABERES_PAGADOS_RAW'), cuenta(formulaHaberesWebEfectivo('$F$9', 'obreros'), '_HABERES_PAGADOS_RAW')
    + cuenta(antesDelCorte('X'), '_HABERES_PAGADOS_RAW'), 'la web entra UNA vez')
  assert.match(celdaJornalesEfectivo('$F$9'), /_HABERES_PAGADOS_RAW/, 'el renglón del desglose ve lo mismo')
})

test('jornales por banco: web (obreros, banco) con fecha ESTRICTAMENTE posterior al corte del extracto', () => {
  const f = formulaJornalesBancoPosteriores('CAJA_BANCO_CORTE')
  assert.ok(f.includes(`(JORNALES_REAL_DESDE<${CORTE})`))
  assert.ok(f.includes(`(${RAW('G')}="banco")*(${RAW('E')}<>"oficina")`))
  assert.ok(f.includes(`(${RAW('A')}>CAJA_BANCO_CORTE)`), 'lo del día del corte ya está en el saldo del extracto')
  assert.equal(formulaHaberesWebBanco('X', 'obreros').includes('"efectivo"'), false)
})

test('oficina: el mes se identifica por «Se paga el» y la web aporta el grupo oficina, en los dos medios', () => {
  const ef = formulaOficinaEfectivoPosteriores('$F$9')
  const bco = formulaOficinaBancoPosteriores('CAJA_BANCO_CORTE')
  for (const f of [ef, bco, formulaOficinaSinCanal('CAJA_BANCO_CORTE')]) assert.ok(f.includes(`(OFICINA_PAGO<${CORTE})`))
  assert.ok(ef.includes(`(${RAW('G')}="efectivo")*(${RAW('E')}="oficina")`))
  assert.ok(bco.includes(`(${RAW('G')}="banco")*(${RAW('E')}="oficina")`))
  assert.ok(!formulaOficinaSinCanal('X').includes(RAW('G')), 'la web siempre declara el canal: no va a «sin canal»')
})

test('la fecha del último movimiento de efectivo (CAJA!D7) y el neto del cajón ven los pagos de la web', () => {
  const f = formulaFechaUltimoEfectivo('$F$9', MAPAS_HOY)
  assert.ok(f.includes(`(${RAW('G')}="efectivo")*(${RAW('E')}<>"oficina")`))
  assert.ok(f.includes(`(${RAW('E')}="oficina")`), 'también el mes de oficina pagado desde la web')
  const neto = formulaNetaEfectivoPosterior('$F$9', MAPAS_HOY)
  assert.equal(cuenta(neto, `(${RAW('G')}="efectivo")`), 2, 'obreros y oficina, una vez cada uno')
})

test('el corte del código es el aprobado por el dueño', () => {
  assert.equal(CORTE_QUINCENA, '2026-09-16')
})

// ═══ DE CONTEO A CONTEO, EVALUADO (02/10/2026) ═══
//
// El dueño marcó $6.080.000 de haberes en efectivo a la mañana y contó el cajón a las ~15:15 con esos billetes
// ya afuera: el anexo restó otra vez y publicó $20.866.000 contra un conteo de $26.946.000. Acá la fórmula se
// EVALÚA fila por fila (un intérprete mínimo de lo que la fórmula usa), no se mira su texto: si vuelve la
// ventana inclusiva por día, el pago anotado antes del sello vuelve a restar y estos tests se ponen rojos.
const HOY = 46297 // 02/10/2026
function evaluar(formula, filas, corte = 46281) {
  const js = formula
    .replace(/'_HABERES_PAGADOS_RAW'!\$B\$2/g, 'CORTE')
    .replace(/'_HABERES_PAGADOS_RAW'!\$([A-Z])\$4:\$[A-Z]/g, 'r.$1')
    .replace(/;/g, ',').replace(/<>/g, '!=').replace(/([^<>!=])=([^=])/g, '$1==$2')
  const fn = new Function('r', 'CORTE', 'SUMPRODUCT', 'IF', 'ISNUMBER', 'INT', 'NOT', 'TODAY', 'DATE', `return ${js}`)
  const lib = [(x) => Number(x), (c, a, b) => (c ? a : b), (x) => typeof x === 'number', Math.floor, (x) => !x, () => HOY, () => 2958465]
  return filas.reduce((t, r) => t + fn(r, corte, ...lib), 0)
}
const pago = (A, K, I = 1_000_000, G = 'efectivo', E = 'obreros') => ({ A, C: 46281, E, G, I, K })
const SELLO_1515 = 46297 + 15.25 / 24

test('pago ANOTADO antes del sello, el mismo día: ya está adentro del conteo, no resta', () => {
  const f = formulaHaberesWebEfectivo(`${SELLO_1515}`, 'obreros')
  assert.equal(evaluar(f, [pago(46297, 46297 + 11 / 24)]), 0)
})

test('pago anotado DESPUÉS del sello, el mismo día: resta', () => {
  const f = formulaHaberesWebEfectivo(`${SELLO_1515}`, 'obreros')
  assert.equal(evaluar(f, [pago(46297, 46297 + 16 / 24)]), 1_000_000)
})

test('sin «Anotado el» (réplica vieja) el pago del día del conteo NO resta; el del día siguiente sí', () => {
  const f = formulaHaberesWebEfectivo(`${SELLO_1515}`, 'obreros')
  assert.equal(evaluar(f, [pago(46297, '')]), 0)
  const ayer = formulaHaberesWebEfectivo(`${46296 + 15.25 / 24}`, 'obreros')
  assert.equal(evaluar(ayer, [pago(46297, '')]), 1_000_000, 'conteo de ayer, pago de hoy: resta')
})

test('sello SIN hora: aunque el pago traiga hora, lo del día del conteo no resta (criterio de Postgres)', () => {
  const f = formulaHaberesWebEfectivo('46297', 'oficina')
  assert.equal(evaluar(f, [pago(46297, 46297 + 16 / 24, 500_000, 'efectivo', 'oficina')]), 0)
})

test('el anexo le pasa a la web el ancla CRUDA, no el día de gracia de las demás salidas', () => {
  const f = formulaJornalesEfectivoPosteriores('IF(INT($F$9)=$F$9;$F$9-1;$F$9)', undefined, '$F$9')
  assert.ok(f.includes(`(${RAW('K')}>$F$9)`) && !f.includes(`(${RAW('K')}>IF(`))
})

test('hoy: los $6.080.000 marcados antes del conteo de las 15:15 dejan el cajón en el conteo ($26.946.000)', () => {
  const filas = [pago(46297, 46297 + 10 / 24, 6_080_000), pago(46296, 46296 + 9 / 24, 253_000), pago(46281, '', 1_460_200)]
  const f = formulaHaberesWebEfectivo(`${SELLO_1515}`, 'obreros')
  assert.equal(26_946_000 - evaluar(f, filas), 26_946_000)
})
