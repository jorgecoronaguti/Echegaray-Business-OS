// EL TRABAJO DE LECTURA — los defectos que este módulo tiene que atrapar.
//
// 1. UN IMPORTE SIN PRECIO SE VUELVE CERO. `pieDePaso` y `certezaMonetaria` tienen que decir
//    "sin cotizar"/"sin importe", nunca sumar `0` como si fuera un dato.
// 2. EL PASO EN CONFLICTO SE CUENTA COMO FIRME. Un ítem con precio que vive en un paso `conflicto`
//    tiene que caer en DISPUTA, no en FIRME — aunque el ítem en sí no tenga ninguna marca propia.
// 3. EL FILTRO POR PASO NO FILTRA (bug clásico de comparar por índice en vez de por id).

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  certezaMonetaria, filtrarComputo, formatoMillones, formatoNumero, formatoPesos,
  pctSobreCostoDirecto, pieDePaso, progresoDeLectura,
  type Computo, type PasoTrabajo,
} from './trabajoLectura.ts'

function paso(over: Partial<PasoTrabajo> = {}): PasoTrabajo {
  return {
    id: 'p2', etiqueta: '2', titulo: 'Bases', pregunta: '¿cuántas bases?', estado: 'firme',
    resumen: '18 bases', columnas: { a: 'A', b: 'B', c: 'C', d: 'D' }, filas: [],
    evidencia: 'B-01', supuesto: null, faltan: [],
    deriva: { partidas: 3, importe: 1_200_000, sinCotizar: 0 },
    ...over,
  }
}

test('formatoNumero/Pesos/Millones: null nunca es cero', () => {
  assert.equal(formatoNumero(null), null)
  assert.equal(formatoPesos(null), null)
  assert.equal(formatoMillones(null), null)
  assert.equal(formatoNumero(1284), '1.284')
  assert.equal(formatoPesos(392000), '$392.000')
  assert.equal(formatoMillones(1_200_000), '$1,2M')
})

test('pieDePaso: sin partidas dice "no genera partida", nunca $0', () => {
  assert.equal(pieDePaso(paso({ deriva: { partidas: 0, importe: null, sinCotizar: 0 } })), 'no genera partida')
})

test('pieDePaso: partidas sin precio dicen "sin importe", no inventan una cifra', () => {
  const texto = pieDePaso(paso({ deriva: { partidas: 2, importe: null, sinCotizar: 2 } }))
  assert.equal(texto, '→ 2 partidas · sin importe')
})

test('pieDePaso: una sola partida usa singular', () => {
  assert.equal(pieDePaso(paso({ deriva: { partidas: 1, importe: 500_000, sinCotizar: 0 } })), '→ 1 partida · $0,5M')
})

test('certezaMonetaria: un ítem sin precio no suma nada a firme ni a disputa — cuenta aparte', () => {
  const computo: Computo = {
    grupos: [{
      pasoId: 'p2', rotulo: 'PASO 2', titulo: 'Bases', subtotal: null,
      items: [{ d: 'Muertos de anclaje', c: null, u: 'un', p: null, imp: null }],
    }],
  }
  const c = certezaMonetaria([paso({ estado: 'sin dato' })], computo)
  assert.equal(c.firme, null)
  assert.equal(c.disputa, null)
  assert.equal(c.sinCotizar, 1)
})

test('DEFECTO 2 — un ítem con precio en un paso EN CONFLICTO cae en disputa, no en firme', () => {
  const computo: Computo = {
    grupos: [{
      pasoId: 'p4', rotulo: 'PASO 3', titulo: 'Arriostramiento', subtotal: 468_000,
      items: [{ d: 'Hormigón en arriostramiento', c: 4.8, u: 'm³', p: 468_000 / 4.8, imp: 468_000 }],
    }],
  }
  const c = certezaMonetaria([paso({ id: 'p4', estado: 'conflicto' })], computo)
  // Cero real (no hay ítem firme) ≠ sin dato (no hay ítems). El único `null` legítimo es cuando
  // no hay NADA computado — acá sí hay computado, y lo firme de eso es genuinamente cero.
  assert.equal(c.firme, 0)
  assert.equal(c.disputa, 468_000)
  assert.equal(c.pctDisputa, 100)
})

test('certezaMonetaria: firme y disputa conviven — el % de la barra suma sobre el total real', () => {
  const computo: Computo = {
    grupos: [
      { pasoId: 'p2', rotulo: 'PASO 2', titulo: 'Bases', subtotal: 300, items: [{ d: 'a', c: 1, u: 'm³', p: 300, imp: 300 }] },
      { pasoId: 'p4', rotulo: 'PASO 3', titulo: 'Vigas', subtotal: 100, items: [{ d: 'b', c: 1, u: 'm³', p: 100, imp: 100 }] },
    ],
  }
  const c = certezaMonetaria([paso({ id: 'p2', estado: 'firme' }), paso({ id: 'p4', estado: 'conflicto' })], computo)
  assert.equal(c.firme, 300)
  assert.equal(c.disputa, 100)
  assert.equal(c.pctFirme, 75)
  assert.equal(c.pctDisputa, 25)
})

test('DEFECTO 3 — filtrarComputo por pasoId, no por posición', () => {
  const computo: Computo = {
    grupos: [
      { pasoId: 'p1', rotulo: 'PASO 1', titulo: 'Superficies', subtotal: 10, items: [] },
      { pasoId: 'p2', rotulo: 'PASO 2', titulo: 'Bases', subtotal: 20, items: [] },
    ],
  }
  assert.equal(filtrarComputo(computo, null).length, 2)
  const filtrado = filtrarComputo(computo, 'p2')
  assert.equal(filtrado.length, 1)
  assert.equal(filtrado[0].pasoId, 'p2')
  assert.deepEqual(filtrarComputo(computo, 'x-inexistente'), [])
})

test('pctSobreCostoDirecto se deriva de dos números reales, nunca una tasa fija', () => {
  assert.equal(pctSobreCostoDirecto(1_000_000, 270_000), '27 %')
  assert.equal(pctSobreCostoDirecto(0, 100), null)
})

// ═══ EL PROGRESO SALE DE LOS DATOS, NUNCA DE UN RELOJ ═══
//
// El defecto que estos controles atrapan: la pantalla del presupuesto animaba los siete pasos con
// un `setTimeout` de 620 ms y escribía «Leyendo el plano · paso 3 de 7» sin estar leyendo nada. Y
// la corrección a medias —contar cuántos pasos llegaron— también miente desde que el backend manda
// los siete desde el arranque: diría «7 de 7 · lectura cerrada» a los dos segundos de empezar.

const pasoDe = (id: string, estado: PasoTrabajo['estado'], titulo = 'Bases y muertos de anclaje'): PasoTrabajo => ({
  id, etiqueta: id.slice(1), titulo, pregunta: '¿cuántas?', estado, resumen: '',
  columnas: { a: 'A', b: 'B', c: 'C', d: 'D' }, filas: [], evidencia: null, supuesto: null,
  faltan: [], deriva: { partidas: 0, importe: null, sinCotizar: 0 },
})

const siete = (contestados: number): PasoTrabajo[] =>
  Array.from({ length: 7 }, (_, i) => pasoDe(`p${i + 1}`, i < contestados ? 'firme' : 'pendiente'))

test('progresoDeLectura: los siete pasos publicados con tres contestados son "paso 3 de 7"', () => {
  const pr = progresoDeLectura(siete(3), null, 'LEYENDO')
  assert.equal(pr.texto, 'paso 3 de 7', 'contar la longitud de la lista daría 7 de 7 sin haber leído nada')
  assert.equal(pr.hechos, 3)
  assert.equal(pr.pctAncho, 43)
  assert.equal(pr.completo, false)
  assert.equal(pr.sello, 'Leyendo el plano · paso 3 de 7')
  assert.equal(pr.midiendo, 'Midiendo · bases y muertos de anclaje', 'el título del PRÓXIMO paso sin contestar, en minúscula')
})

// ═══ EL DEFECTO QUE COSTÓ EL PRIMER CIERRE (auditoría 03/09/2026) ═══
//
// `completo` se deducía de `hechos >= total`. Una sola lámina de fundaciones —grilla, base, muerto,
// viga de fundación, columna, excavación, viga de carga— ya da `hechos: 7`. Con 19 láminas todavía
// por leer, la pantalla mostraba la barra al 100 %, «7 de 7 · lectura cerrada» y el sello del
// cómputo derivado, AL LADO del botón «Cancelar la lectura» —que sólo se dibuja si el trabajo sigue
// vivo—. Es la misma mentira que el temporizador de 620 ms, derivada en vez de cronometrada.

test('LEYENDO con los siete contestados NO es una lectura cerrada — sólo LISTO lo es', () => {
  const certeza = { estado: 'sin dato' as const, porEstado: {}, firmes: 5, pendientes: 0, hechos: 7, total: 7 }
  const pr = progresoDeLectura(siete(7), certeza, 'LEYENDO')
  assert.equal(pr.hechos, 7, 'los siete contestaron algo: eso es cierto y se muestra')
  assert.equal(pr.completo, false, 'pero la lectura sigue: quedan láminas por leer y el trabajo se puede cancelar')
  assert.notEqual(pr.texto, '7 de 7 · lectura cerrada')
  assert.equal(pr.texto, 'paso 7 de 7')
  assert.equal(pr.sello, 'Leyendo el plano · paso 7 de 7', 'el sello del cómputo derivado afirma que terminó')
})

test('progresoDeLectura: la lectura cerrada la declara el estado LISTO, no la cuenta de pasos', () => {
  const pr = progresoDeLectura(siete(7), null, 'LISTO')
  assert.equal(pr.texto, '7 de 7 · lectura cerrada')
  assert.equal(pr.sello, 'Cómputo derivado del plano · borrador')
  assert.equal(pr.midiendo, null)
  assert.equal(pr.completo, true)
})

test('progresoDeLectura: un final que no es LISTO no dice ni que cerró ni que sigue leyendo', () => {
  for (const estado of ['ERROR', 'CANCELADO'] as const) {
    const pr = progresoDeLectura(siete(7), null, estado)
    assert.equal(pr.completo, false, `${estado} no produjo una lectura cerrada`)
    assert.equal(pr.sello, 'Lectura interrumpida · paso 7 de 7')
  }
})

test('progresoDeLectura: manda `certeza.hechos` del backend por sobre lo que la lista aparente', () => {
  // Una fila publicada a mitad de escritura: los pasos ya se ven contestados pero el backend
  // todavía cuenta 2. Gana el backend — el número lo deriva quien leyó el plano.
  const pr = progresoDeLectura(siete(5), { estado: 'pendiente', porEstado: {}, firmes: 5, pendientes: 5, hechos: 2, total: 7 }, 'LEYENDO')
  assert.equal(pr.hechos, 2)
  assert.equal(pr.texto, 'paso 2 de 7')
})

test('progresoDeLectura: sin ningún paso publicado todavía es "paso 0 de 7", no un progreso vacío', () => {
  assert.equal(progresoDeLectura([], null, 'ENCOLADO').texto, 'paso 0 de 7')
  assert.equal(progresoDeLectura([], null, 'ENCOLADO').pctAncho, 0)
})

test('pieDePaso: ni pendiente ni en curso afirman que el paso no genera partida', () => {
  assert.equal(pieDePaso(pasoDe('p4', 'pendiente')), 'todavía sin medir')
  assert.equal(pieDePaso(pasoDe('p4', 'en curso')), 'midiendo', 'la partida puede aparecer en la lámina que falta')
  assert.equal(pieDePaso(pasoDe('p4', 'firme')), 'no genera partida')
})
