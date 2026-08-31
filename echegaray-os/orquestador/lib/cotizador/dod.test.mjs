// LA DoD TIENE QUE PODER DECIR QUE NO.
//
// Un control de cierre que siempre da verde es peor que no tenerlo: da permiso para mergear. Estos
// tests existen para probar las tres formas en que este control puede negarse —NO_CUMPLE, sin medir,
// y la excepción— y para fijar que lo que no se midió NUNCA cuenta como cumplido.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { CRITERIOS, VEREDICTO, MOTIVO, GLOBAL, evaluar, veredictoGlobal, correrDod, sinPoderMedir, noAplica, medicionRota } from './dod.mjs'

/** La evidencia de un sistema perfecto: los veinticuatro criterios medidos y en verde. */
const TODO_BIEN = {
  proyectosEntendidos: { distintos: 3, formatos: 5 },
  alcance: { partidasConEstado: 26, sinDecidir: 0 },
  computo: { cantidades: 26, conGenealogiaCompleta: 26 },
  mapeo: { mapeadas: 24, porParecidoTextualSinAtributos: 0 },
  composiciones: { resueltas: 26, incompletasQueCostaronCero: 0 },
  explosion: { recursos: 110, reconcilia: true },
  hh: { horas: 3697.7 },
  precios: { resueltosAutonomamente: 80, sinPrecioValorizadoEnCero: 0 },
  subcontratos: { total: 3, conAlcanceYVigencia: 3 },
  costoDirecto: { afirmadoEnCasos: 3 },
  indirectos: { conceptos: 7, separaCalculadoDeAplicado: true },
  comercial: { versionCitada: 'v3', congeladaNoCambiaConLaPolitica: true },
  precio: { coeficienteDerivado: true, coeficienteEscribible: false },
  incertidumbre: { noDeclarada: 0 },
  versionado: { congeladaEsInmutable: true, ofertaDerivaDeCongelada: true },
  aObra: { obrasConGenealogia: 2 },
  ejecucionReal: { relacionesEstablecidas: 140 },
  planVsReal: { comparaciones: 26, causasInventadas: 0 },
  candidatos: { generados: 9 },
  governance: { promovidos: 2, rechazadosPorGobernanza: 7 },
  reuso: { reutilizados: 2 },
  claudeZero: { llamadasLlm: 0, llegoAlFinal: true },
  generalizacion: { casosPass: 4, reglasTocadasParaQueCierren: 0 },
  auditoria: { veredicto: 'PASS', loFirmoQuienNoLoConstruyo: true },
}

test('DoD · con todo medido y en verde da PASS y 24/24', () => {
  const r = correrDod(TODO_BIEN)
  assert.equal(r.estado, GLOBAL.PASS)
  assert.equal(r.completas, '24/24')
  assert.equal(r.fail, 0)
  assert.equal(r.sinEjercitar, 0)
})

// ══════════════════════════════════════════════════════════════════════════════════════════════
// LAS TRES NEGACIONES
// ══════════════════════════════════════════════════════════════════════════════════════════════

test('DoD · UN solo criterio en rojo es FAIL — no se promedia', () => {
  // 23 de 24 en verde: 95,8%. No alcanza, y ése es el punto.
  const r = correrDod({ ...TODO_BIEN, costoDirecto: { afirmadoEnCasos: 0 } })
  assert.equal(r.estado, GLOBAL.FAIL)
  assert.equal(r.pass, 23)
  assert.deepEqual(r.bloquean, ['#10 calcula costo directo'])
})

test('DoD · lo que no se midió es NO_VERIFICABLE, jamás CUMPLE', () => {
  const sinPrecios = Object.fromEntries(Object.entries(TODO_BIEN).filter(([k]) => k !== 'precios'))
  const r = correrDod(sinPrecios)
  const fila = r.filas.find((f) => f.id === 8)
  assert.equal(fila.veredicto, VEREDICTO.NO_EJERCITADA)
  assert.notEqual(fila.veredicto, VEREDICTO.PASS)
  // Y no suma al numerador: 23 de 24, no 24 de 24.
  assert.equal(r.completas, '23/24')
  assert.equal(r.estado, GLOBAL.PASS_CON_LIMITACIONES)
  assert.match(r.limitaciones[0], /#8 gestiona precios/)
})

test('DoD · una medición que se rompe es NO_VERIFICABLE, no un «no»', () => {
  const criterio = { id: 99, dice: 'el que explota', mide: 'x', exige: () => { throw new Error('se rompió el medidor') } }
  const fila = evaluar(criterio, { x: { algo: 1 } })
  assert.equal(fila.veredicto, VEREDICTO.NO_EJERCITADA)
  assert.match(fila.porque, /se rompió el medidor/)
})

test('DoD · una evidencia presente pero vacía SÍ se evalúa y puede dar NO_CUMPLE', () => {
  // La diferencia con el test anterior: `{}` es una medición que dio cero, no una ausencia de
  // medición. Cero medido es un «no»; no medido es un «no sé». Confundirlos es el agujero.
  const fila = evaluar(CRITERIOS.find((c) => c.id === 17), { ejecucionReal: {} })
  assert.equal(fila.veredicto, VEREDICTO.FAIL)
})

test('DoD · un criterio que devuelve algo verdadero-ish pero no true no cumple', () => {
  // `exige` debe devolver true. Un 1, un 'sí' o un objeto NO alcanzan: la comparación es estricta
  // justamente para que nadie cierre un criterio con un valor casual.
  const criterio = { id: 98, dice: 'el mentiroso', mide: 'x', exige: () => 1 }
  assert.equal(evaluar(criterio, { x: {} }).veredicto, VEREDICTO.FAIL)
})

test('DoD · los veinticuatro criterios están y ninguno se repite', () => {
  assert.equal(CRITERIOS.length, 24)
  assert.equal(new Set(CRITERIOS.map((c) => c.id)).size, 24)
  assert.equal(new Set(CRITERIOS.map((c) => c.mide)).size, 24)
})

test('DoD · sin evidencia de nada, el veredicto es PASS_CON_LIMITACIONES con 0/24 — y eso NO es aprobar', () => {
  // El caso que más importa: correr la DoD sin haber medido nada no puede parecerse a un cierre.
  const r = correrDod({})
  assert.equal(r.completas, '0/24')
  assert.equal(r.sinEjercitar, 24)
  assert.equal(r.limitaciones.length, 24)
})

test('veredictoGlobal · FAIL gana sobre PASS_CON_LIMITACIONES cuando hay de los dos', () => {
  const r = veredictoGlobal([
    { id: 1, dice: 'a', veredicto: VEREDICTO.PASS },
    { id: 2, dice: 'b', veredicto: VEREDICTO.NO_EJERCITADA, porque: 'x' },
    { id: 3, dice: 'c', veredicto: VEREDICTO.FAIL },
  ])
  assert.equal(r.estado, GLOBAL.FAIL)
})

// ══════════════════════════════════════════════════════════════════════════════════════════════
// EL CRITERIO 24 TIENE QUE TENER QUIÉN LO LEA
// ══════════════════════════════════════════════════════════════════════════════════════════════
//
// Este test existe por un defecto de proceso, no de lógica: el bloque que lee la firma del auditor
// se commiteó con evidencia de corrida y **el commit siguiente lo borró**. Nada lo detectó — el
// `readFileSync` quedó importado y sin usar, y un import muerto no rompe el lint. Una capacidad
// desapareció en silencio y el criterio #24 habría quedado NO_VERIFICABLE aunque alguien firmara.

test('el recolector nombra la ruta de la firma, y la lee de verdad', async () => {
  // MUTACIÓN CORRIDA: borrar el bloque `medir('auditoria', …)` → este test en rojo.
  const mod = await import('../../scripts/xsas-dod.mjs')
  assert.equal(mod.RUTA_FIRMA, 'docs/engineering/xsas-auditoria.json')
  const fuente = readFileSync(new URL('../../scripts/xsas-dod.mjs', import.meta.url), 'utf8')
  assert.match(fuente, /medir\('auditoria'/, 'nadie mide el criterio 24: el bloque que lee la firma no está')
  assert.match(fuente, /readFileSync\(RUTA_FIRMA/, 'la ruta de la firma está declarada pero no se lee')
  assert.match(fuente, /firma\.auditor === firma\.construyo/, 'no se rechaza la firma de quien lo construyó')
})

test('un criterio sin su medición no puede quedar CUMPLE por descuido', () => {
  // La contracara: si mañana alguien borra otro bloque, el criterio cae a NO_VERIFICABLE y baja el
  // numerador. Nunca sube. Es lo que hace que perder una medición se note en el número.
  const r = correrDod({})
  assert.equal(r.pass, 0)
  assert.equal(r.estado, GLOBAL.PASS_CON_LIMITACIONES)
})

// ═══ LOS CUATRO ESTADOS (§J del segundo pedido) ═══
//
// El cajón único NO_VERIFICABLE mezclaba «ninguna corrida llegó hasta acá» —que es trabajo
// pendiente— con «este término no lo puede contestar ninguna consulta» —que es un límite del
// instrumento—. Son dos cosas distintas y el cuadro tiene que poder decir cuál es.

test('DoD · sin evidencia el motivo es NO_HUBO_CORRIDA, no un límite del instrumento', () => {
  const f = evaluar(CRITERIOS[0], {})
  assert.equal(f.veredicto, VEREDICTO.NO_EJERCITADA)
  assert.equal(f.motivo, MOTIVO.NO_HUBO_CORRIDA)
})

test('DoD · sinPoderMedir() distingue el límite del instrumento de la falta de corrida', () => {
  const f = evaluar(CRITERIOS[21], { claudeZero: sinPoderMedir('el cero es estructural') })
  assert.equal(f.veredicto, VEREDICTO.NO_EJERCITADA)
  assert.equal(f.motivo, MOTIVO.TERMINO_NO_MEDIBLE)
  assert.equal(f.porque, 'el cero es estructural')
})

test('DoD · un predicado que se rompe es MEDICION_ROTA, nunca un «no»', () => {
  const revienta = { id: 99, dice: 'x', mide: 'x', exige: () => { throw new Error('la consulta murió') } }
  const f = evaluar(revienta, { x: { algo: 1 } })
  assert.equal(f.veredicto, VEREDICTO.NO_EJERCITADA)
  assert.equal(f.motivo, MOTIVO.MEDICION_ROTA)
  assert.match(f.porque, /la consulta murió/)
})

test('DoD · una medición del recolector que REVENTÓ no se publica como «nadie la corrió»', () => {
  // EL DEFECTO: el recolector envuelve cada bloque en un `try` y en el `catch` guarda `null`. El
  // dictaminador lee ese `null` y dicta NO_HUBO_CORRIDA — «ninguna corrida dejó evidencia» —, que es
  // falso: la corrida existió y la consulta se rompió. Las dos cosas se ven idénticas en el cuadro y
  // llevan a trabajos opuestos: una espera datos, la otra espera que alguien arregle el código.
  // Es el invariante ERROR=0 con otra ropa: el error se archiva como un estado benigno.
  const f = evaluar(CRITERIOS[8], { subcontratos: medicionRota('column s.vigencia_hasta does not exist') })
  assert.equal(f.veredicto, VEREDICTO.NO_EJERCITADA, 'una medición rota tampoco es un «no»')
  assert.equal(f.motivo, MOTIVO.MEDICION_ROTA)
  assert.match(f.porque, /vigencia_hasta/, 'el error tiene que llegar al cuadro, no quedarse en el log')
  assert.throws(() => medicionRota(''), /exige una razón escrita/)
})

test('DoD · NO_APLICA sale del denominador — y por eso EXIGE una razón escrita', () => {
  // Es la puerta trasera obvia: marcar los doce que no cierran como «no aplican» y publicar 12/12.
  // Se cierra de dos maneras. Primera: la razón es obligatoria en el constructor.
  assert.throws(() => noAplica(''), /exige una razón escrita/)
  assert.throws(() => noAplica('   '), /exige una razón escrita/)
  assert.throws(() => noAplica(undefined), /exige una razón escrita/)
  assert.throws(() => sinPoderMedir(null), /exige una razón escrita/)
  // Segunda: la razón viaja al informe, en su propia sección, donde el dueño la lee.
  const r = correrDod({ ...TODO_BIEN, subcontratos: noAplica('esta obra no tiene un solo subcontrato') })
  assert.equal(r.noAplica, 1)
  assert.equal(r.completas, '23/23')
  assert.deepEqual(r.excluidas, ['#9 maneja subcontratos — esta obra no tiene un solo subcontrato'])
})

test('DoD · NO_APLICA no puede tapar un criterio que la medición pone en rojo', () => {
  // Un NO_APLICA es una declaración del recolector sobre el contexto, no un veredicto: si además
  // hay un FAIL medido en otro criterio, el global sigue siendo FAIL. Excluir no es absolver.
  const r = correrDod({
    ...TODO_BIEN,
    subcontratos: noAplica('no hay subcontratos en esta obra'),
    precios: { resueltosAutonomamente: 0, sinPrecioValorizadoEnCero: 0 },
  })
  assert.equal(r.estado, GLOBAL.FAIL)
  assert.equal(r.noAplica, 1)
  assert.deepEqual(r.bloquean, ['#8 gestiona precios autónomamente'])
})

test('DoD · sin ejercitar nunca suma al numerador, aunque sean veintitrés de veinticuatro', () => {
  const r = correrDod({ proyectosEntendidos: { distintos: 3, formatos: 5 } })
  assert.equal(r.pass, 1)
  assert.equal(r.sinEjercitar, 23)
  assert.equal(r.completas, '1/24')
  assert.equal(r.estado, GLOBAL.PASS_CON_LIMITACIONES)
})
