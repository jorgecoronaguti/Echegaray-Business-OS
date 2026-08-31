// LOS INDIRECTOS POR CONCEPTOS — y la prueba de que el calculado y el aplicado no son el mismo campo.
//
// Cada test que afirma un OK trae abajo la MUTACIÓN que lo pone rojo, y esa mutación se corrió de
// verdad antes de escribirla acá. Un comentario «esto lo pondría rojo» sin correrlo no es evidencia.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ESTADO, TIPO_ISSUE } from './contrato.mjs'
import {
  BASE_INDIRECTO, BLOQUE_INDIRECTO, conceptoIndirecto, estructuraIndirecta,
  indirectoCalculado, indirectoAplicado, overrideDeIndirecto, CAMPOS_OVERRIDE,
} from './indirectos.mjs'

/** La estructura del bloque EMPRESA de la hoja GG, con los rótulos y las celdas reales medidas sobre
 *  64 cotizaciones (`datos/conocimiento/hallazgos-cotizaciones.json`). Los porcentajes son los que
 *  PROMETE cada rótulo — que es justo lo que la planilla después no aplica. */
const CONCEPTOS_GG = [
  ['Gastos administrativos (4 % de CD)', 0.04, 'hoja GG · B54'],
  ['Costos financieros y mantenimiento de bancos (0.2 % de CD)', 0.002, 'hoja GG · B55'],
  ['Gastos contables (0.6 % de CD)', 0.006, 'hoja GG · B57'],
  ['Manten. y amortización de vehículos (1 % de CD)', 0.01, 'hoja GG · B59'],
  ['Alquiler oficina y servicios (1.2 % de CD)', 0.012, 'hoja GG · B60'],
  ['Librería (0.15 % de CD)', 0.0015, 'hoja GG · B61'],
]

const estructuraReal = (extra = []) => estructuraIndirecta({
  version: 1, fuente: 'Planilla para Cotizar (2).xlsm · hoja GG · bloque «Gastos Generales de la Empresa»',
  conceptos: [
    ...CONCEPTOS_GG.map(([concepto, pct, fuente]) => conceptoIndirecto({
      concepto, pct, fuente, bloque: BLOQUE_INDIRECTO.EMPRESA, base: BASE_INDIRECTO.PCT_COSTO_DIRECTO,
    })),
    ...extra,
  ],
})

// ══════════════════════════════════════════════════════════════════════════════════════════════
// EL CÁLCULO
// ══════════════════════════════════════════════════════════════════════════════════════════════

test('el indirecto se CALCULA sumando los conceptos, no se tipea', () => {
  const r = indirectoCalculado({ estructura: estructuraReal(), costoDirectoObra: 100_000_000 })
  assert.equal(r.estado, ESTADO.CALCULADO)
  // 4 + 0,2 + 0,6 + 1 + 1,2 + 0,15 = 7,15 % — es lo que la estructura declarada explica, y NO el
  // 27 % que la empresa aplica: la diferencia es exactamente el override que nadie registró.
  assert.equal(r.pct, 0.0715)
  assert.equal(r.monto, 7_150_000)
  assert.equal(r.nConceptos, 6)
  assert.equal(r.nHuecos, 0)
  // MUTACIÓN CORRIDA: sacar «Librería» de CONCEPTOS_GG → pct 0,07 y monto 7.000.000. FALLA con
  //   AssertionError 0.07 !== 0.0715. El total DEPENDE de cada concepto: no es una constante.
})

test('un concepto SIN monto envenena el total: no se calcula sobre los que sí lo tienen', () => {
  const conHueco = estructuraReal([conceptoIndirecto({
    concepto: 'Seguros de obra', pct: null, fuente: 'declarado por el dueño, monto pendiente',
    base: BASE_INDIRECTO.PCT_COSTO_DIRECTO,
  })])
  const r = indirectoCalculado({ estructura: conHueco, costoDirectoObra: 100_000_000 })
  assert.equal(r.estado, ESTADO.FALTA_DATO)
  assert.equal(r.pct, null, 'NO puede salir 0,0715 ignorando el hueco: sería el mismo `sum() ignora NULL` de la vista')
  assert.equal(r.monto, null)
  assert.equal(r.nHuecos, 1)
  assert.match(r.porQue, /Seguros de obra/)
  assert.equal(r.issues.length, 1)
  assert.equal(r.issues[0].type, TIPO_ISSUE.FALTA_DATO)
  // MUTACIÓN CORRIDA: en `indirectoCalculado`, cambiar el `if (huecos.length)` por `if (false)` →
  //   devuelve pct con un concepto sin medir adentro. ROJO en TRES tests de este archivo.
})

test('CERO es una decisión y NULL es un hueco: no se confunden', () => {
  const conCero = estructuraReal([conceptoIndirecto({
    concepto: 'Agua de construcción', monto: 0, base: BASE_INDIRECTO.MONTO_POR_OBRA,
    bloque: BLOQUE_INDIRECTO.OBRA, fuente: 'hoja GG · H16 · $0 en 64 de 64 cotizaciones: esta obra no lleva',
  })])
  const r = indirectoCalculado({ estructura: conCero, costoDirectoObra: 100_000_000 })
  assert.equal(r.estado, ESTADO.CALCULADO, 'un cero declarado NO bloquea: es una medición')
  assert.equal(r.pct, 0.0715)
  assert.equal(r.nHuecos, 0)
  // Y el mismo concepto sin monto SÍ bloquea, con la misma forma de llamada.
  const sinDato = estructuraReal([conceptoIndirecto({
    concepto: 'Agua de construcción', monto: null, base: BASE_INDIRECTO.MONTO_POR_OBRA,
    bloque: BLOQUE_INDIRECTO.OBRA, fuente: 'hoja GG · H16 · nadie cargó cuánto sale',
  })])
  assert.equal(indirectoCalculado({ estructura: sinDato, costoDirectoObra: 100_000_000 }).pct, null)
  // MUTACIÓN CORRIDA: en `conceptoIndirecto`, usar `Number(valores[campo]) || null` para `valor`
  //   → el 0 declarado se vuelve hueco. FALLA: «CALCULADO !== FALTA_DATO» en la primera aserción.
})

test('un gasto anual de estructura SIN costo directo anual no se puede prorratear', () => {
  const e = estructuraIndirecta({
    fuente: 'P&L · Gastos de Estructura (Administración/Taller)',
    conceptos: [conceptoIndirecto({ concepto: 'Sueldos de administración', montoAnual: 96_000_000, fuente: 'P&L 2026 · Administración' })],
    costoDirectoAnual: null,
  })
  const r = indirectoCalculado({ estructura: e, costoDirectoObra: 100_000_000 })
  assert.equal(r.pct, null)
  assert.match(r.porQue, /costo directo anual/)
  // Con el denominador declarado, sí: 96M ÷ 1.200M = 8 %.
  const conBase = estructuraIndirecta({ ...e, costoDirectoAnual: 1_200_000_000, fuente: e.fuente, conceptos: [...e.conceptos] })
  assert.equal(indirectoCalculado({ estructura: conBase, costoDirectoObra: 100_000_000 }).pct, 0.08)
  // MUTACIÓN CORRIDA: en `aporteDeConcepto`, reemplazar la guarda del denominador por
  //   `if (false)` → el prorrateo se hace igual sin denominador y pct sale 0.
  //   FALLA: «Expected values to be strictly equal: 0 !== null».
})

test('la estructura NO puede repetir un concepto: lo sumaría dos veces', () => {
  assert.throws(() => estructuraIndirecta({
    fuente: 'x',
    conceptos: [
      conceptoIndirecto({ concepto: 'Librería', pct: 0.0015, base: BASE_INDIRECTO.PCT_COSTO_DIRECTO, fuente: 'GG B61' }),
      conceptoIndirecto({ concepto: 'Librería', pct: 0.002, base: BASE_INDIRECTO.PCT_COSTO_DIRECTO, fuente: 'otra hoja' }),
    ],
  }), /repite conceptos/)
})

test('un concepto sin fuente no se construye', () => {
  assert.throws(() => conceptoIndirecto({ concepto: 'Obrador', monto: 500_000, base: BASE_INDIRECTO.MONTO_POR_OBRA }), /fuente/)
})

test('el valor tiene que ir en el campo de SU base', () => {
  assert.throws(() => conceptoIndirecto({ concepto: 'Obrador', base: BASE_INDIRECTO.MONTO_POR_OBRA, pct: 0.02, fuente: 'x' }), /tiene que ir en monto/)
})

// ══════════════════════════════════════════════════════════════════════════════════════════════
// CALCULADO ≠ APLICADO — la invariante del §10
// ══════════════════════════════════════════════════════════════════════════════════════════════

const OVERRIDE_COMPLETO = {
  valor: 0.27, actor: 'Jorge Corona (Dirección)', fecha: '2026-08-30',
  motivo: 'la estructura declarada explica 7,15 % y la empresa cotiza 27 % desde el libro',
  evidencia: 'parametro_comercial v1 · Planilla para Cotizar (2).xlsm hoja Presupuesto B62:H89',
}

test('INDIRECTO_CALCULADO ≠ INDIRECTO_APLICADO: son dos campos y el calculado nunca se pierde', () => {
  const calc = indirectoCalculado({ estructura: estructuraReal(), costoDirectoObra: 100_000_000 })
  const r = indirectoAplicado({ calculado: calc, intento: overrideDeIndirecto(OVERRIDE_COMPLETO) })
  assert.equal(r.calculado, 0.0715)
  assert.equal(r.aplicado, 0.27)
  assert.notEqual(r.calculado, r.aplicado, 'si fueran el mismo campo, el override borraría la estructura que lo explica')
  assert.equal(r.override.actor, 'Jorge Corona (Dirección)')
  assert.equal(r.estado, ESTADO.CONFIRMADO)
  // La brecha es POSITIVA: la obra absorbe MÁS estructura de la que la hoja explica. No hay issue.
  assert.equal(r.brechaDeAbsorcion, 19_850_000)
  assert.equal(r.issues.length, 0)
  // MUTACIÓN CORRIDA: en `indirectoAplicado`, devolver `calculado: o.valor` → los dos campos dan
  //   0,27. FALLA en `assert.notEqual` con «Expected "actual" to be strictly unequal to: 0.27».
})

test('un aplicado MENOR que el calculado deja plata de estructura sin absorber, y lo dice con su monto', () => {
  const calc = indirectoCalculado({ estructura: estructuraReal(), costoDirectoObra: 100_000_000 })
  const r = indirectoAplicado({
    calculado: calc,
    intento: overrideDeIndirecto({ ...OVERRIDE_COMPLETO, valor: 0.05, motivo: 'obra corta, se recorta el indirecto para entrar en precio' }),
  })
  assert.equal(r.aplicado, 0.05)
  assert.equal(r.brechaDeAbsorcion, -2_150_000, '(0,05 − 0,0715) × 100M')
  assert.equal(r.issues.length, 1)
  assert.equal(r.issues[0].type, TIPO_ISSUE.COMMERCIAL_DECISION)
  assert.equal(r.issues[0].impact, 2_150_000, 'el impacto es PLATA, para que la cola lo ordene por materialidad')
  assert.match(r.issues[0].detalle, /deja de absorber/)
  // MUTACIÓN CORRIDA: cambiar la condición del issue a `brecha !== null && brecha > 0` → una obra
  //   que recorta el indirecto sale limpia y la que lo sube grita. FALLA: «0 !== 1» en issues.length.
})

test('un override sin los CUATRO datos NO se aplica, y queda a la vista lo que le faltó', () => {
  const calc = indirectoCalculado({ estructura: estructuraReal(), costoDirectoObra: 100_000_000 })
  for (const falta of CAMPOS_OVERRIDE) {
    const intento = overrideDeIndirecto({ ...OVERRIDE_COMPLETO, [falta]: null })
    assert.equal(intento.ok, false, `sin ${falta} el override no puede darse por bueno`)
    assert.deepEqual(intento.faltan, [falta])
    const r = indirectoAplicado({ calculado: calc, intento })
    assert.equal(r.aplicado, 0.0715, `sin ${falta} el aplicado tiene que seguir siendo el CALCULADO`)
    assert.equal(r.override, null)
    assert.ok(r.issues.some((i) => i.type === TIPO_ISSUE.COMMERCIAL_DECISION && new RegExp(falta).test(i.detalle)))
  }
  // MUTACIÓN CORRIDA: en `overrideDeIndirecto`, cambiar `CAMPOS_OVERRIDE.filter(...)` por `[]` →
  //   el override entra con los cuatro campos vacíos. FALLA en la primera vuelta:
  //   «Expected values to be strictly equal: true !== false».
})

test('sin estructura declarada el indirecto NO es cero, y un override sí puede decidirlo', () => {
  const vacio = indirectoCalculado({ estructura: null, costoDirectoObra: 100_000_000 })
  assert.equal(vacio.pct, null)
  assert.equal(vacio.estado, ESTADO.FALTA_DATO)
  assert.match(vacio.porQue, /NO es cero/)
  const r = indirectoAplicado({ calculado: vacio, intento: overrideDeIndirecto(OVERRIDE_COMPLETO) })
  assert.equal(r.calculado, null, 'no se inventa un calculado para que el override tenga contra qué compararse')
  assert.equal(r.aplicado, 0.27)
  assert.equal(r.brechaDeAbsorcion, null, 'sin calculado no hay brecha: no se puede medir contra nada')
  assert.match(r.porQue, /es una DECISIÓN/)
})

test('sin override el aplicado ES el calculado, y siguen siendo dos campos', () => {
  const calc = indirectoCalculado({ estructura: estructuraReal(), costoDirectoObra: 100_000_000 })
  const r = indirectoAplicado({ calculado: calc })
  assert.equal(r.calculado, 0.0715)
  assert.equal(r.aplicado, 0.0715)
  assert.equal(r.override, null)
  assert.equal(r.brechaDeAbsorcion, null)
  assert.equal(r.estado, ESTADO.CALCULADO)
})
