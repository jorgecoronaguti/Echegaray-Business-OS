import test from 'node:test'
import assert from 'node:assert/strict'
import {
  cadenaDeRendimiento, calendarioLegible, conservaLaCantidad, frentesDelTexto, motivoNoDividir,
  repartirCantidad, repartirOpcional, restriccionesDe,
  type CandidataADividir, type InsumosRendimiento, type InsumosRestricciones,
} from './panelTarea.ts'

// ── EL REPARTO CONSERVA LA CANTIDAD ──────────────────────────────────────────
//
// Es la regla de `convertir_partida_a_plan`: los frentes suman la partida o no se genera nada. Si
// alguien cambia el reparto por un `total / n` redondeado a dos decimales, estos tres se ponen
// rojos — que es exactamente el defecto: 1,08 m³ en 3 frentes daría 1,07 y la obra perdería 0,01.

const restriccion = (extra: Partial<InsumosRestricciones> = {}): InsumosRestricciones => ({
  topeFrente: null, tiempoTecnico: false, diasPlan: null, jornadaHoras: null,
  diasHabiles: null, capacidadCuadrilla: null, cuadrilla: null, ...extra,
})

const rend = (extra: Partial<InsumosRendimiento> = {}): InsumosRendimiento => ({
  hsAnalisis: null, tieneTareaTipo: false, hsPresupuestada: null, vieneDeUnaPartida: false,
  puedeVerPartida: true, hhPlan: null, cantidadObjetivo: null, hhReal: null,
  cantidadEjecutada: null, historico: null, ...extra,
})

test('repartir conserva el total aunque no divida exacto', () => {
  const partes = repartirCantidad(10, 3)
  assert.equal(partes.length, 3)
  assert.ok(conservaLaCantidad(partes, 10))
  assert.equal(partes.reduce((a, b) => a + b, 0).toFixed(4), '10.0000')
})

test('repartir 1,08 m³ en 3 frentes no pierde el centésimo', () => {
  const partes = repartirCantidad(1.08, 3)
  assert.deepEqual(partes, [0.36, 0.36, 0.36])
  assert.ok(conservaLaCantidad(partes, 1.08))
})

test('repartir 2,84 en 2 y 96 en 4 da partes iguales y suma exacta', () => {
  assert.deepEqual(repartirCantidad(2.84, 2), [1.42, 1.42])
  assert.ok(conservaLaCantidad(repartirCantidad(96, 4), 96))
})

test('un total con más decimales que el reparto NO conserva, y se detecta', () => {
  // 0,00005 no entra en cuatro decimales: la comparación redondea los dos lados con la misma regla
  // que Postgres, así que esto pasa; lo que no puede pasar es que una diferencia real se cuele.
  const partes = repartirCantidad(1, 3)
  assert.ok(conservaLaCantidad(partes, 1))
  assert.ok(!conservaLaCantidad([0.3333, 0.3333, 0.3333], 1))
})

test('sin cantidad objetivo los frentes nacen sin cantidad, no en cero', () => {
  assert.deepEqual(repartirOpcional(null, 3), [null, null, null])
  assert.deepEqual(repartirOpcional(0, 2), [0, 0])
})

test('los nombres de los frentes se leen por coma o por renglón, sin vacíos', () => {
  assert.deepEqual(frentesDelTexto('Eje 1–4, Eje 5–8'), ['Eje 1–4', 'Eje 5–8'])
  assert.deepEqual(frentesDelTexto(' Norte \n Sur \n\n'), ['Norte', 'Sur'])
  assert.deepEqual(frentesDelTexto('   '), [])
})

// ── LAS RESTRICCIONES: SÓLO LO QUE ESTÁ EN EL MODELO ─────────────────────────

test('sin ningún dato cargado no se dibuja ninguna restricción', () => {
  assert.deepEqual(restriccionesDe(restriccion()), [])
})

test('el tiempo técnico dice los días fijos y no se confunde con la duración', () => {
  const filas = restriccionesDe(restriccion({ tiempoTecnico: true, diasPlan: 2 }))
  assert.equal(filas.length, 1)
  assert.match(filas[0].valor, /2 d fijos/)
  // Con la marca puesta y sin días cargados NO se asume cero: cero los borraría del plazo.
  const sinDias = restriccionesDe(restriccion({ tiempoTecnico: true, diasPlan: null }))
  assert.match(sinDias[0].valor, /sin días cargados/)
})

test('unos días de plan sin la marca de tiempo técnico no son una restricción', () => {
  assert.deepEqual(restriccionesDe(restriccion({ tiempoTecnico: false, diasPlan: 7 })), [])
})

test('cada restricción viaja con su fuente', () => {
  const filas = restriccionesDe(restriccion({ topeFrente: 4, jornadaHoras: 8 }))
  assert.equal(filas.length, 2)
  assert.ok(filas.every((f) => f.fuente.length > 0))
  assert.equal(filas[0].valor, '4 personas')
})

test('el calendario no inventa un rango que la obra no declaró', () => {
  assert.equal(calendarioLegible([1, 2, 3, 4, 5]), 'lun a vie')
  assert.equal(calendarioLegible([1, 3, 5]), 'lun · mié · vie')
  assert.equal(calendarioLegible([6]), 'sáb')
  assert.equal(calendarioLegible([]), null)
  assert.equal(calendarioLegible(null), null)
})

// ── LA CADENA DE RENDIMIENTO ─────────────────────────────────────────────────

test('la cadena tiene los cinco eslabones, y ninguno se rellena con otro', () => {
  const c = cadenaDeRendimiento(rend({ hsAnalisis: 31, hhPlan: 36.72, cantidadObjetivo: 1.08 }))
  assert.equal(c.length, 5)
  assert.equal(c[0].valor, 31)
  // Presupuestado sigue vacío aunque el teórico tenga número: son dos hechos distintos.
  assert.equal(c[1].valor, null)
  assert.equal(c[2].valor, 34)
})

test('«sin análisis vigente» y «sin tarea tipo» son dos ausencias distintas', () => {
  assert.equal(cadenaDeRendimiento(rend({ tieneTareaTipo: true }))[0].falta, 'sin análisis vigente')
  assert.equal(cadenaDeRendimiento(rend({ tieneTareaTipo: false }))[0].falta, 'sin tarea tipo vinculada')
})

test('presupuesto en borrador no es «no viene de un presupuesto»', () => {
  const conPartida = cadenaDeRendimiento(rend({ vieneDeUnaPartida: true }))[1]
  assert.equal(conPartida.falta, 'el presupuesto no está congelado')
  const sinPermiso = cadenaDeRendimiento(rend({ vieneDeUnaPartida: true, puedeVerPartida: false }))[1]
  assert.equal(sinPermiso.falta, 'la partida es dato económico')
  assert.equal(cadenaDeRendimiento(rend())[1].falta, 'no viene de un presupuesto')
})

test('el real observado necesita las dos puntas y se destaca', () => {
  const solaUna = cadenaDeRendimiento(rend({ hhReal: 48 }))[3]
  assert.equal(solaUna.valor, null)
  assert.equal(solaUna.falta, 'sin producción cargada')
  assert.ok(solaUna.destacado)
  const completo = cadenaDeRendimiento(rend({ hhReal: 48, cantidadEjecutada: 1.2 }))[3]
  assert.equal(completo.valor, 40)
})

// ── QUIÉN SE PUEDE PARTIR EN FRENTES ─────────────────────────────────────────
//
// La misma función la usan la pantalla (para no ofrecer el gesto) y la acción del servidor (para
// rechazar la escritura). Si alguien relaja uno de estos portazos, el defecto que vuelve es concreto:
// una actividad con avances cargados convertida en contenedor deja ese trabajo fuera de TODO total
// — es el mismo caso que la 03 sale a denunciar en la franja de «avances mal imputados».

const candidata = (extra: Partial<CandidataADividir> = {}): CandidataADividir => ({
  esContenedor: false, tieneHijas: false, tipo: 'tarea', cotizacionPartidaId: null,
  nAvances: 0, nPasos: 0, tipoPadre: 'resumen', ...extra,
})

test('una tarea limpia se puede dividir', () => {
  assert.equal(motivoNoDividir(candidata()), null)
  assert.equal(motivoNoDividir(candidata({ tipoPadre: null })), null)
})

test('un contenedor, un hito y una subtarea no se dividen', () => {
  assert.match(motivoNoDividir(candidata({ esContenedor: true })) ?? '', /ya es un contenedor/)
  assert.match(motivoNoDividir(candidata({ tieneHijas: true })) ?? '', /ya es un contenedor/)
  assert.match(motivoNoDividir(candidata({ tipo: 'hito' })) ?? '', /hito/)
  assert.match(motivoNoDividir(candidata({ tipoPadre: 'tarea' })) ?? '', /subtarea/)
})

test('con avance registrado NO se divide: quedaría colgado de un contenedor', () => {
  const m = motivoNoDividir(candidata({ nAvances: 3 }))
  assert.match(m ?? '', /3 avance/)
  assert.match(m ?? '', /reimputarlos/)
})

test('los pasos también bloquean, y la partida de origen manda a la conversión', () => {
  assert.match(motivoNoDividir(candidata({ nPasos: 5 })) ?? '', /pasos/)
  assert.match(motivoNoDividir(candidata({ cotizacionPartidaId: 'abc' })) ?? '', /conversión/)
})

test('el motivo más de fondo gana: contenedor antes que avances', () => {
  assert.match(motivoNoDividir(candidata({ esContenedor: true, nAvances: 9 })) ?? '', /contenedor/)
})

test('el histórico dice de cuántas obras sale, y con una sola no recomienda', () => {
  const c = cadenaDeRendimiento(rend({
    historico: { mediana: 37.1, muestra: 21, obras: 3, lectura: 'con evidencia de 3 obras' },
  }))
  assert.match(c[4].clave, /3 obras/)
  assert.match(c[4].clave, /21 registros/)
  assert.equal(c[4].valor, 37.1)
  const chica = cadenaDeRendimiento(rend({
    historico: { mediana: null, muestra: 2, obras: 1, lectura: 'muestra chica: es un dato, no una recomendación' },
  }))
  assert.equal(chica[4].valor, null)
  assert.match(chica[4].falta, /muestra chica/)
})
