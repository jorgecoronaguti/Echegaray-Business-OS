// EL RECOLECTOR TAMBIÉN TIENE QUE PODER DECIR QUE NO.
//
// `dod.test.mjs` prueba el dictaminador, que es puro y recibe evidencia ya juntada. Pero las ocho
// mediciones que costaron cuatro pasadas de auditoría no viven ahí: viven en `desdeLosCasos`, que
// hasta hoy **no tenía un solo test**. Dos veces en esta rama un cambio silencioso rompió algo del
// recolector —una vez borrando un bloque entero, otra dejando dos correcciones sin aplicar— y las
// dos veces lo encontró un auditor humano leyendo el diff, no una prueba.
//
// Cada test de acá abajo fija un comportamiento que ya estuvo mal una vez.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { desdeLosCasos } from '../../scripts/xsas-dod.mjs'

/** Una corrida mínima con la forma que el recolector espera. */
const corrida = (extra = {}) => ({
  nombre: 'QUATTROPANI (falso)',
  corrida: {
    partidas: [{ codigo: 'T1', cantidad: 10, alcance: 'INCLUIDO' }],
    costoDirecto: { total: 1000, hh: 50 },
    metricas: { incertidumbre_no_declarada: 0, llamadas_llm: 0 },
    cascada: { coeficienteSinIva: 1.68 },
    reconciliacion: { cuadra: true },
    explosion: { nRecursos: 5 },
    etapas: [
      { etapa: 'MAP', result: { mapeos: 3, mapeadas: 2, sinSalida: 1 } },
      { etapa: 'COMPOSE', result: { conComposicion: 1, incompletas: 0 } },
      { etapa: 'COST', result: { aprendizajesDisponibles: 0, reutilizanAprendizaje: 0 } },
    ],
    ...extra,
  },
  corpus: { documentos: [{ formato: 'PLANILLA' }] },
})

test('recolector · una partida SIN evidencia, fuente ni nota no cuenta como genealogía', () => {
  // El defecto P3-F1: contaba cantidades y las llamaba genealogía. 26 partidas con `evidencia: null`
  // y `fuente: null` daban CUMPLE en «computa CON EVIDENCIA».
  const e = desdeLosCasos([corrida()])
  assert.equal(e.computo, null)
  assert.match(e.computo__porque, /ninguna trae evidencia, fuente ni nota/)
})

test('recolector · con rastro PARCIAL el criterio puede decir que no', () => {
  // La prueba de que el control puede dar rojo: dos partidas, una con rastro y otra sin él.
  const c = corrida({
    partidas: [
      { codigo: 'T1', cantidad: 10, evidencia: { lamina: 'A1' } },
      { codigo: 'T2', cantidad: 20 },
    ],
  })
  const e = desdeLosCasos([c])
  assert.deepEqual(e.computo, { cantidades: 2, conGenealogiaCompleta: 1 })
})

test('recolector · con rastro COMPLETO el criterio puede decir que sí', () => {
  const c = corrida({ partidas: [{ codigo: 'T1', cantidad: 10, fuente: 'plano de estructura' }] })
  assert.deepEqual(desdeLosCasos([c]).computo, { cantidades: 1, conGenealogiaCompleta: 1 })
  assert.equal(desdeLosCasos([c]).computo__porque, undefined)
})

test('recolector · el cero de llamadas al modelo NO se publica como medición', () => {
  // P3-F2: `correr()` cablea `llamadasLLM: []`, así que el término era estructuralmente 0.
  const e = desdeLosCasos([corrida()])
  assert.equal(e.claudeZero, null)
  assert.match(e.claudeZero__porque, /ESTRUCTURAL/)
  assert.match(e.claudeZero__porque, /sin-llm/)
})

test('recolector · `cuadra: null` NO es «reconcilia»', () => {
  // P2-F4 de la primera pasada: `cuadra !== false` publicaba el «no hay contra qué reconciliar»
  // —que es lo que devuelve cuando el costo no se pudo afirmar— como que reconciliaba.
  assert.equal(desdeLosCasos([corrida({ reconciliacion: { cuadra: null } })]).explosion, null)
  assert.deepEqual(desdeLosCasos([corrida()]).explosion, { recursos: 5, reconcilia: true })
  assert.deepEqual(desdeLosCasos([corrida({ reconciliacion: { cuadra: false } })]).explosion, { recursos: 5, reconcilia: false })
})

test('recolector · un costo `undefined` no cuenta como costo afirmado', () => {
  // P2-F9: `undefined !== null` es true, así que una corrida rota antes de COST contaba como éxito.
  assert.equal(desdeLosCasos([corrida({ costoDirecto: {} })]).costoDirecto.afirmadoEnCasos, 0)
  assert.equal(desdeLosCasos([corrida({ costoDirecto: { total: null } })]).costoDirecto.afirmadoEnCasos, 0)
  assert.equal(desdeLosCasos([corrida()]).costoDirecto.afirmadoEnCasos, 1)
})

test('recolector · sin mapeos declarados, el selector no se juzga', () => {
  // P2-F3: `mapeadas` sumaba `partidas.length`, o sea que el criterio era «hay partidas».
  const sinMapeos = corrida({ etapas: [{ etapa: 'MAP', result: { mapeos: 0, mapeadas: 0 } }] })
  assert.equal(desdeLosCasos([sinMapeos]).mapeo, null)
  assert.deepEqual(desdeLosCasos([corrida()]).mapeo, { mapeadas: 2, porParecidoTextualSinAtributos: 1 })
})

test('recolector · la generalización NUNCA se mide sola', () => {
  // P2-F7: «nadie aflojó un umbral» no lo puede contestar una consulta, y una limitación declarada
  // BLOQUEA el criterio que toca en vez de acompañarlo.
  const e = desdeLosCasos([corrida()])
  assert.equal(e.generalizacion, null)
  assert.match(e.generalizacion__porque, /no lo puede contestar una consulta/)
})

test('recolector · sin la corrida de Quattropani, nada se inventa', () => {
  // Todo bloque va en su propio `try` y una corrida ausente deja NO_VERIFICABLE, no ceros.
  const e = desdeLosCasos([])
  for (const k of ['alcance', 'computo', 'mapeo', 'composiciones', 'explosion', 'hh', 'precio', 'reuso']) {
    assert.equal(e[k], null, `«${k}» inventó evidencia sobre una corrida que no existe`)
  }
})
