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
import { CRITERIOS, evaluar, VEREDICTO } from './dod.mjs'

/**
 * Lo que estos tests fijan no es la FORMA del objeto de evidencia sino el VEREDICTO que produce.
 * Antes afirmaban `=== null`; cuando el recolector pasó a declarar el motivo dentro de la fila, la
 * forma cambió y los tests se pusieron rojos sin que hubiera un defecto. Preguntar por el veredicto
 * sobrevive a eso y prueba lo que importa: que el criterio NO queda demostrado.
 */
function veredictoDe(evidencia, mide) {
  const c = CRITERIOS.find((x) => x.mide === mide)
  assert.ok(c, `no existe criterio que mida «${mide}»`)
  return evaluar(c, evidencia)
}
const noDemostrado = (evidencia, mide, rastro) => {
  const f = veredictoDe(evidencia, mide)
  assert.equal(f.veredicto, VEREDICTO.NO_EJERCITADA, `«${mide}» quedó ${f.veredicto} sin corrida que lo sostenga`)
  if (rastro) assert.match(f.porque, rastro)
  return f
}

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
  noDemostrado(desdeLosCasos([corrida()]), 'computo', /ninguna trae evidencia, fuente ni nota/)
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
  // Y con rastro completo el criterio SÍ se demuestra: sin este término el test de arriba lo
  // pasaría un recolector que devuelva «sin ejercitar» para todo.
  assert.equal(veredictoDe(desdeLosCasos([c]), 'computo').veredicto, VEREDICTO.PASS)
})

test('recolector · el cero de llamadas al modelo NO se publica como medición', () => {
  // P3-F2: `correr()` cablea `llamadasLLM: []`, así que el término era estructuralmente 0.
  const f = noDemostrado(desdeLosCasos([corrida()]), 'claudeZero', /ESTRUCTURAL/)
  assert.match(f.porque, /sin-llm/)
  // Y el motivo distingue «nadie lo corrió» de «el término no lo contesta ninguna consulta».
  assert.equal(f.motivo, 'TERMINO_NO_MEDIBLE')
})

test('recolector · `cuadra: null` NO es «reconcilia»', () => {
  // P2-F4 de la primera pasada: `cuadra !== false` publicaba el «no hay contra qué reconciliar»
  // —que es lo que devuelve cuando el costo no se pudo afirmar— como que reconciliaba.
  noDemostrado(desdeLosCasos([corrida({ reconciliacion: { cuadra: null } })]), 'explosion')
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
  noDemostrado(desdeLosCasos([sinMapeos]), 'mapeo')
  // `casos` viaja en la evidencia desde que el criterio pasó a leer el universo: sin él, un
  // `{mapeadas: 5}` no dice si salió de cinco casos o de uno, que es el defecto que se acaba de
  // cerrar. Va a la columna «evidencia» del cuadro para que se lea al lado del número.
  assert.deepEqual(desdeLosCasos([corrida()]).mapeo, { mapeadas: 2, porParecidoTextualSinAtributos: 1, casos: 1 })
})

/** Un caso cualquiera del universo con su etapa MAP dictada a mano. */
const casoConMapa = (nombre, result) => ({
  nombre,
  corrida: { partidas: [{ codigo: 'X', cantidad: 1 }], etapas: [{ etapa: 'MAP', result }] },
  corpus: { documentos: [{ formato: 'PLANILLA' }] },
})

test('recolector · el selector se juzga sobre el UNIVERSO de casos, no sólo sobre Quattropani', () => {
  // EL DEFECTO: `mapeo` leía la etapa MAP de la corrida de QUATTROPANI y de ninguna otra. Un segundo
  // caso que eligió partidas por parecido textual sin atributos quedaba entero fuera del cuadro, y
  // el criterio #4 —«selecciona partidas defendiblemente»— salía en VERDE sobre un universo que
  // contenía exactamente lo que el criterio prohíbe. Medir un caso y titular «el universo» es la
  // misma familia que `mapeadas = partidas.length`: la etiqueta del criterio, no su medición.
  const quattropani = corrida({ etapas: [{ etapa: 'MAP', result: { mapeos: 3, mapeadas: 3, sinSalida: 0 } }] })
  const otro = casoConMapa('ARCOR galpón', { mapeos: 4, mapeadas: 1, sinSalida: 3 })

  const e = desdeLosCasos([quattropani, otro])
  assert.equal(e.mapeo.mapeadas, 4, 'las mapeadas del universo son las 3 de Quattropani más la 1 del otro caso')
  assert.equal(e.mapeo.porParecidoTextualSinAtributos, 3,
    'las 3 sin salida del segundo caso eran invisibles: el criterio se leía sólo sobre Quattropani')
  assert.equal(veredictoDe(e, 'mapeo').veredicto, VEREDICTO.FAIL,
    'un universo con selección sin atributos no puede dar PASS')
})

test('recolector · el universo mapeado limpio SÍ puede dar PASS', () => {
  // Sin este término el test de arriba lo pasaría un recolector que devuelva FAIL para todo.
  const e = desdeLosCasos([
    corrida({ etapas: [{ etapa: 'MAP', result: { mapeos: 3, mapeadas: 3, sinSalida: 0 } }] }),
    casoConMapa('ARCOR galpón', { mapeos: 2, mapeadas: 2, sinSalida: 0 }),
  ])
  assert.deepEqual(e.mapeo, { mapeadas: 5, porParecidoTextualSinAtributos: 0, casos: 2 })
  assert.equal(veredictoDe(e, 'mapeo').veredicto, VEREDICTO.PASS)
})

test('recolector · una cobertura de mapeo que nadie midió NO suma cero al universo', () => {
  // `sinSalida` sale `null` cuando la etapa MAP no pudo calcular la cobertura. Sumarlo como 0 es el
  // invariante prohibido NULL=0 con otra ropa: el criterio quedaría en verde porque uno de los casos
  // no se pudo mirar, que es justo lo contrario de lo que su ausencia significa.
  const e = desdeLosCasos([
    corrida({ etapas: [{ etapa: 'MAP', result: { mapeos: 3, mapeadas: 3, sinSalida: 0 } }] }),
    casoConMapa('CIEGO', { mapeos: 5, mapeadas: 2, sinSalida: null }),
  ])
  noDemostrado(e, 'mapeo', /no publicó su cobertura/)
})

test('recolector · la generalización NUNCA se mide sola', () => {
  // P2-F7: «nadie aflojó un umbral» no lo puede contestar una consulta, y una limitación declarada
  // BLOQUEA el criterio que toca en vez de acompañarlo.
  noDemostrado(desdeLosCasos([corrida()]), 'generalizacion', /no lo puede contestar una consulta/)
})

test('recolector · sin la corrida de Quattropani, nada se inventa', () => {
  // Todo bloque va en su propio `try` y una corrida ausente deja NO_EJERCITADA, no ceros.
  const e = desdeLosCasos([])
  for (const k of ['alcance', 'computo', 'mapeo', 'composiciones', 'explosion', 'hh', 'precio', 'reuso']) {
    noDemostrado(e, k)
  }
})
