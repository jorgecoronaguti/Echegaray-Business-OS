import test from 'node:test'
import assert from 'node:assert/strict'
import {
  normalizarNumero,
  detectarDuplicados,
  segmentarEnRachas,
  auditarRango,
  inferirRango,
  auditarChequera,
  auditarPadron,
} from './chequeras.mjs'

test('normaliza número venga como texto con ceros o como número', () => {
  assert.equal(normalizarNumero('00000327'), 327)
  assert.equal(normalizarNumero(327), 327)
  assert.equal(normalizarNumero(' 062 '), 62)
  // lo que NO es un número de cheque -> null (no se compara)
  assert.equal(normalizarNumero(''), null)
  assert.equal(normalizarNumero('VARIAS'), null)
  assert.equal(normalizarNumero('3617 y 3650'), null)
  assert.equal(normalizarNumero(null), null)
})

test('detecta duplicados: un número no puede ser dos cheques', () => {
  // El caso real: FISICO 316 aparece dos veces con importes distintos.
  const dup = detectarDuplicados(['314', '315', '316', '316', '318', 327, 328])
  assert.deepEqual(dup, [{ numero: 316, veces: 2 }])
  assert.deepEqual(detectarDuplicados([1, 2, 3]), [])
})

test('segmenta en rachas: separa chequeras distintas por el salto grande, no por el hueco chico', () => {
  // 193..195 y 310..312 son dos chequeras (salto 195->310 enorme); adentro, 311 faltante es un hueco.
  const rachas = segmentarEnRachas([193, 194, 195, 310, 312], 5)
  assert.equal(rachas.length, 2)
  assert.deepEqual(rachas[0], { desde: 193, hasta: 195, presentes: [193, 194, 195] })
  assert.deepEqual(rachas[1], { desde: 310, hasta: 312, presentes: [310, 312] }) // 311 es hueco interno
})

test('auditarRango: encuentra huecos y fuera de rango', () => {
  // Chequera 301..305; usados 301,302,304,305 y un 999 de otra serie.
  const r = auditarRango(['301', 302, '00000304', 305, 999], 301, 305)
  assert.deepEqual(r.huecos, [303]) // el 303 del rango que nadie registró
  assert.deepEqual(r.fuera_de_rango, [999]) // registrado pero fuera de esta chequera
  assert.deepEqual(r.usados_en_rango, [301, 302, 304, 305])
  assert.equal(r.total_rango, 5)
  assert.equal(r.cobertura, 4 / 5)
})

test('inferirRango: toma la racha contigua que contiene las anclas, sin inventar bordes', () => {
  // Anclas 327,328; serie física con la racha 310..328 y una racha vieja 193..195.
  const serie = [193, 194, 195, 310, 311, 312, 313, 314, 315, 320, 324, 325, 326, 327, 328]
  const inf = inferirRango([327, 328], serie, 5)
  assert.deepEqual(inf, { desde: 310, hasta: 328 }) // excluye la racha vieja 193..195
  // ancla que no cae en ninguna racha -> se suma a la serie y forma su propia racha de 1
  assert.deepEqual(inferirRango([500], serie, 5), { desde: 500, hasta: 500 })
  // sin anclas no hay de dónde inferir
  assert.equal(inferirRango([], serie, 5), null)
})

test('auditarChequera con rango DESCONOCIDO infiere de la serie y etiqueta INFERIDO', () => {
  // Reproduce H17: se ven 327/328, la serie física reciente es 310..328 con huecos en 317 y 323.
  const serie = [310, 311, 312, 313, 314, 315, 316, 318, 319, 320, 321, 322, 324, 325, 326, 327, 328]
  const v = auditarChequera(
    { identificador: 'H17 C-VI/26', tipo: 'CPD', numero_desde: null, numero_hasta: null, rango_confianza: 'DESCONOCIDO', numeros_conocidos: [327, 328] },
    serie,
    5,
  )
  assert.equal(v.veredicto, 'hallazgo')
  assert.equal(v.rango_confianza, 'INFERIDO')
  assert.equal(v.numero_desde, 310)
  assert.equal(v.numero_hasta, 328)
  assert.deepEqual(v.huecos, [317, 323])
})

test('auditarChequera con rango REAL audita contra ese rango exacto', () => {
  const v = auditarChequera(
    { identificador: 'X', tipo: 'CPD', numero_desde: 300, numero_hasta: 310, rango_confianza: 'REAL', numeros_conocidos: [] },
    [300, 301, 302, 305, 310],
    5,
  )
  assert.equal(v.veredicto, 'hallazgo')
  assert.equal(v.rango_confianza, 'REAL')
  assert.deepEqual(v.huecos, [303, 304, 306, 307, 308, 309])
})

test('auditarChequera común sin cheques cerca de la ancla: no_verificable, no inventa huecos', () => {
  // H14: sólo se vio el 62 (en blanco), la serie física arranca en 193. El 62 forma su propia racha
  // [62,62] pero NINGÚN cheque registrado cae ahí -> no hay secuencia usada -> no_verificable, y el
  // 62 NO se reporta como faltante (sería un hallazgo falso sobre un cheque en blanco).
  const serie = [193, 194, 195, 327, 328]
  const v = auditarChequera(
    { identificador: 'H14-III/19', tipo: 'COMUN', numero_desde: null, numero_hasta: null, rango_confianza: 'DESCONOCIDO', numeros_conocidos: [62] },
    serie,
    5,
  )
  assert.equal(v.veredicto, 'no_verificable')
  assert.deepEqual(v.huecos, [])
})

test('auditarPadron: separa físicos de echeqs, reporta duplicados y bloques sin chequera', () => {
  const cluster = [315, 316, 318, 319, 320, 321, 322, 324, 325, 326] // 317 y 323 faltan (huecos)
  const registro = [
    // chequera H17 (inferible 315..328), cluster reciente contiguo + los dos CPD confirmados
    ...cluster.map((n) => ({ tipo: 'FISICO', numero: n })),
    { tipo: 'FISICO', numero: '316' }, // duplicado del 316
    { tipo: 'FISICO', numero: '00000327' }, { tipo: 'FISICO', numero: 328 },
    // chequera vieja sin identificar
    { tipo: 'FISICO', numero: 193 }, { tipo: 'FISICO', numero: 194 }, { tipo: 'FISICO', numero: 195 },
    // echeqs: OTRO universo, NO entran al padrón aunque su número solape
    { tipo: 'ECHEQ', numero: 316 }, { tipo: 'ECHEQ', numero: 360 },
  ]
  const chequeras = [
    { identificador: 'H17 C-VI/26', tipo: 'CPD', numero_desde: null, numero_hasta: null, rango_confianza: 'DESCONOCIDO', numeros_conocidos: [327, 328] },
    { identificador: 'H14-III/19', tipo: 'COMUN', numero_desde: null, numero_hasta: null, rango_confianza: 'DESCONOCIDO', numeros_conocidos: [62] },
  ]
  const inf = auditarPadron(chequeras, registro, 5)
  // 16 físicos (cluster 10 + 316 dup + 327 + 328 + 193/194/195); los 2 echeqs no cuentan
  assert.equal(inf.total_fisicos, 16)
  assert.equal(inf.fisicos_distintos, 15)
  assert.deepEqual(inf.duplicados, [{ numero: 316, veces: 2 }])
  const h17 = inf.por_chequera.find((c) => c.identificador === 'H17 C-VI/26')
  assert.equal(h17.rango_confianza, 'INFERIDO')
  assert.equal(h17.numero_desde, 315)
  assert.equal(h17.numero_hasta, 328)
  assert.deepEqual(h17.huecos, [317, 323]) // dentro de 315..328 inferido faltan el 317 y el 323
  // 193..195 no cae en ninguna chequera -> bloque sin asignar, sin huecos internos
  assert.equal(inf.sin_chequera_asignada.length, 1)
  assert.deepEqual(inf.sin_chequera_asignada[0], { desde: 193, hasta: 195, cantidad: 3, huecos_internos: [] })
})
