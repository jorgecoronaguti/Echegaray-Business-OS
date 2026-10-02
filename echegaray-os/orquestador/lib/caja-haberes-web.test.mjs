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
  assert.deepEqual([HAB.fecha, HAB.quincena, HAB.grupo, HAB.medio, HAB.importe, HAB.desde],
    [COL.fecha, COL.desde, COL.grupo, COL.medio, COL.importe, FILA0])
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
  // La ventana del conteo, inclusiva y con techo en hoy — la misma de todas las salidas del cajón.
  assert.ok(f.includes(`(${RAW('A')}>=INT($F$9))*(${RAW('A')}>0)*(${RAW('A')}<=TODAY())`))
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
