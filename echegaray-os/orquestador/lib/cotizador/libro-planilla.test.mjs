// EL MODELO DEL LIBRO, CLAVADO. Si alguien mueve un coeficiente o cambia una base, esto se pone
// rojo antes de que salga una oferta con el número equivocado.
//
// ═══ EL CASO ES MEDIDO, NO INVENTADO ═══
//
// Todos los números de `LIBRO` salieron de leer el `.xlsm` real con `xlsx`, celda por celda:
//   archivo  Planilla para Cotizar.xlsm
//   Drive    1GBgblLgp_ns7C5nm9alSMvigCZkWdtH9 — administracion/PRESUPUESTOS - CLIENTES/ (la MADRE:
//            las otras 8 copias viven dentro de una carpeta de obra y son instancias derivadas)
//   hoja     Presupuesto · B62:H89 · cotización ORICA cacheada en el libro
//   medido   03/09/2026 con orquestador/scripts/verificar-planilla-cotizar.mjs
//
// Un test que se escribiera contra `cascada()` en vez de contra estos valores no probaría nada:
// afirmaría que el código hace lo que el código hace.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cascadaDelLibro, roundUp } from './libro-planilla.mjs'
import { cascada, politicaComercial, coeficienteDe, PARAMETROS } from './comercial.mjs'

/** Los ocho porcentajes tipeados en la hoja Presupuesto (E64, E68, E71, F71, E73, E75, E79, E83). */
const PORCENTAJES = Object.freeze({
  pctGastosGenerales: 0.27, pctBeneficio: 0.22, pctFinanciero: 0.07, factorFinanciero: 0.5,
  pctIibb: 0.024, pctGanancias: 0.02, pctCheque: 0.012, pctIva: 0.21,
})

/** Los valores CACHEADOS en el libro para esa cotización. */
const LIBRO = Object.freeze({
  H62: 92087947.11, H64: 24863745.72, H66: 116951692.83, H68: 25729372.50,
  H71: 4093309.25, H73: 3424345.57, H75: 2853621.40, H77: 153052341.60,
  H79: 1836628.10, H81: 154888969.70, H83: 32526683.70, H86: 187415653.40,
  H89: 2.03518114239348,
})

const pol = () => politicaComercial({ fuente: 'hoja Presupuesto del libro · medido 03/09/2026', ...PORCENTAJES })

test('la réplica del libro reproduce la cotización ORICA celda por celda, al centavo', () => {
  const c = cascadaDelLibro({ costoDirecto: LIBRO.H62, politica: pol() })
  const pares = [
    ['gastosGenerales', 'H64'], ['costoIndustrial', 'H66'], ['beneficio', 'H68'],
    ['financiero', 'H71'], ['iibb', 'H73'], ['ganancias', 'H75'], ['subtotal', 'H77'],
    ['impuestoCheque', 'H79'], ['ventaSinIva', 'H81'], ['iva', 'H83'], ['ventaFinal', 'H86'],
  ]
  for (const [k, celda] of pares) {
    assert.ok(Math.abs(c[k] - LIBRO[celda]) < 0.005, `${celda}: libro ${LIBRO[celda]} vs réplica ${c[k]}`)
  }
  assert.ok(Math.abs(c.coeficienteConIva - LIBRO.H89) < 1e-9, `H89: ${LIBRO.H89} vs ${c.coeficienteConIva}`)
})

test('el modelo PRODUCTIVO no se aleja del libro más de un peso en toda la cotización', () => {
  // $0,34 el día que se midió, y son los cinco ROUNDUP(x;1) del libro que el código no hace. Un
  // peso de tolerancia deja pasar el redondeo y NO deja pasar ningún cambio de coeficiente: mover
  // el beneficio del 22 % al 22,1 % vale $117.000 en esta misma cotización.
  const c = cascada({ costoDirecto: LIBRO.H62, politica: pol() })
  assert.ok(Math.abs(c.ventaFinal - LIBRO.H86) < 1, `venta final: libro ${LIBRO.H86} vs código ${c.ventaFinal}`)
  assert.ok(Math.abs(c.subtotal - LIBRO.H77) < 1, `subtotal: libro ${LIBRO.H77} vs código ${c.subtotal}`)
  assert.ok(Math.abs(c.beneficio - LIBRO.H68) < 1, `beneficio: libro ${LIBRO.H68} vs código ${c.beneficio}`)
  assert.ok(Math.abs(c.costoIndustrial - LIBRO.H66) < 1, `costo industrial: libro ${LIBRO.H66} vs código ${c.costoIndustrial}`)
})

test('las TRES bases se respetan: GG sobre el directo, beneficio sobre el industrial, financiero sobre el industrial', () => {
  const c = cascada({ costoDirecto: LIBRO.H62, politica: pol() })
  // Si alguien "simplificara" aplicando todo sobre el costo directo, o el financiero sobre el
  // industrial+beneficio, estas tres igualdades se rompen antes que el total.
  assert.ok(Math.abs(c.gastosGenerales - LIBRO.H62 * 0.27) < 0.01)
  assert.ok(Math.abs(c.beneficio - LIBRO.H66 * 0.22) < 0.1, 'el beneficio va sobre el COSTO INDUSTRIAL')
  assert.ok(Math.abs(c.financiero - LIBRO.H66 * 0.07 * 0.5) < 0.01, 'el financiero va sobre el INDUSTRIAL × factor, sin el beneficio')
  assert.ok(Math.abs(c.iibb - (LIBRO.H66 + LIBRO.H68) * 0.024) < 0.1, 'IIBB va sobre INDUSTRIAL+BENEFICIO, sin el financiero')
})

test('el coeficiente sin IVA es 1,681968 y el con IVA 2,035181 — el del libro es el CON IVA', () => {
  const c = cascada({ costoDirecto: LIBRO.H62, politica: pol() })
  assert.equal(c.coeficienteSinIva, 1.681968)
  assert.equal(c.coeficienteConIva, 2.035181)
  // `coeficienteDe()` devuelve el SIN IVA. El «COEFICIENTE RESUMEN» H89 del libro es el CON IVA y
  // es el que multiplica cada renglón. Confundirlos regala el 21 %.
  assert.equal(coeficienteDe(pol()), 1.681968)
  assert.ok(Math.abs(LIBRO.H89 - c.coeficienteConIva) < 1e-6)
})

test('la cascada NO tiene escalón de riesgo ni de contingencia', () => {
  // Medido en la hoja Presupuesto: entre H62 (costo directo) y H89 (coeficiente) no existe ninguna
  // fila que los nombre. La migración 20260830T2130 los deja en `valor = null` por eso mismo, y
  // este test impide que alguien los "complete" con un cero, que diría otra cosa muy distinta.
  for (const p of PARAMETROS) assert.ok(!/riesg|conting/i.test(p), `apareció un escalón ${p} que el libro no tiene`)
  assert.equal(PARAMETROS.length, 8)
})

test('ROUNDUP es hacia arriba y no lo arruina el binario', () => {
  assert.equal(roundUp(1.01), 1.1)
  assert.equal(roundUp(1.0), 1.0)         // exacto no sube: 0.1*3 no debe empujarlo a 1.1
  assert.equal(roundUp(2853621.31), 2853621.4)
  assert.equal(roundUp(-1.01), -1.0)
})
