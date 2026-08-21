import test from 'node:test'
import assert from 'node:assert/strict'
import { calcular, simularMovimiento, ordenTopologico, conflictosDeCuadrilla } from './cronograma.mjs'
import { CalendarioObra, isodow } from './calendario-obra.mjs'

// Una cadena de hormigón: replanteo → armadura → encofrado → hormigonado → curado.
const CADENA = [
  { id: 'rep', nombre: 'Replanteo', duracion: 1 },
  { id: 'arm', nombre: 'Armadura', duracion: 3 },
  { id: 'enc', nombre: 'Encofrado', duracion: 2 },
  { id: 'hor', nombre: 'Hormigonado', duracion: 1 },
  { id: 'cur', nombre: 'Curado', duracion: 0, diasTecnicos: 7 },
]
const SECUENCIA = [
  { origen: 'rep', destino: 'arm', tipo: 'FS', lag: 0 },
  { origen: 'arm', destino: 'enc', tipo: 'FS', lag: 0 },
  { origen: 'enc', destino: 'hor', tipo: 'FS', lag: 0 },
  { origen: 'hor', destino: 'cur', tipo: 'FS', lag: 0 },
]

test('la cadena se encadena: cada una arranca cuando termina la anterior', () => {
  const r = calcular(CADENA, SECUENCIA)
  const a = (id) => r.actividades.get(id)
  assert.deepEqual([a('rep').inicio, a('rep').fin], [0, 0])
  assert.deepEqual([a('arm').inicio, a('arm').fin], [1, 3])
  assert.deepEqual([a('enc').inicio, a('enc').fin], [4, 5])
  assert.deepEqual([a('hor').inicio, a('hor').fin], [6, 6])
  // el curado son 7 días técnicos: dura 7 aunque su duración de trabajo sea 0
  assert.equal(a('cur').duracion, 7)
  assert.deepEqual([a('cur').inicio, a('cur').fin], [7, 13])
  assert.equal(r.finObra, 13)
})

test('en una cadena sin ramas TODAS son críticas: no hay dónde perder tiempo', () => {
  const r = calcular(CADENA, SECUENCIA)
  assert.deepEqual(r.criticas.sort(), ['arm', 'cur', 'enc', 'hor', 'rep'])
  for (const id of r.criticas) assert.equal(r.actividades.get(id).holgura, 0)
})

test('una rama corta al lado de una larga tiene holgura, y no es crítica', () => {
  const acts = [
    { id: 'a', duracion: 1 },
    { id: 'largo', duracion: 10 },
    { id: 'corto', duracion: 2 },
    { id: 'fin', duracion: 1 },
  ]
  const deps = [
    { origen: 'a', destino: 'largo', tipo: 'FS' },
    { origen: 'a', destino: 'corto', tipo: 'FS' },
    { origen: 'largo', destino: 'fin', tipo: 'FS' },
    { origen: 'corto', destino: 'fin', tipo: 'FS' },
  ]
  const r = calcular(acts, deps)
  assert.equal(r.actividades.get('largo').holgura, 0, 'la rama larga marca el camino')
  assert.equal(r.actividades.get('corto').holgura, 8, 'la corta puede atrasarse 8 días sin mover nada')
  assert.ok(!r.criticas.includes('corto'))
  assert.deepEqual(r.criticas.sort(), ['a', 'fin', 'largo'])
})

test('la demora positiva empuja y la negativa adelanta', () => {
  const acts = [{ id: 'a', duracion: 2 }, { id: 'b', duracion: 2 }]
  const conEspera = calcular(acts, [{ origen: 'a', destino: 'b', tipo: 'FS', lag: 3 }])
  assert.equal(conEspera.actividades.get('b').inicio, 5, 'termina en 1, más 3 de espera, arranca en 5')
  const solapada = calcular(acts, [{ origen: 'a', destino: 'b', tipo: 'FS', lag: -1 }])
  assert.equal(solapada.actividades.get('b').inicio, 1, 'arranca un día antes de que la otra termine')
})

test('las cuatro relaciones imponen lo que dicen', () => {
  const acts = [{ id: 'a', duracion: 5 }, { id: 'b', duracion: 3 }]
  const ini = (tipo, lag = 0) => calcular(acts, [{ origen: 'a', destino: 'b', tipo, lag }]).actividades.get('b')
  assert.equal(ini('FS').inicio, 5, 'FS: empieza después de que la otra termina')
  assert.equal(ini('SS').inicio, 0, 'SS: empiezan juntas')
  assert.equal(ini('FF').fin, 4, 'FF: termina cuando termina la otra')
  // SF con demora 0 NO ata: la sucesora ya termina en 2 y la restricción sólo pide fin >= 0.
  // Que no ate es correcto — una relación que empuja cuando no tiene por qué es peor que ninguna.
  assert.equal(ini('SF').fin, 2, 'SF con demora 0 no empuja: la restricción ya está satisfecha')
  assert.equal(ini('SF', 5).fin, 5, 'SF con demora 5: no puede terminar antes del día 5')
  assert.equal(ini('SF', 5).inicio, 3, 'y para eso arranca en 3, porque dura 3 días')
})

test('una actividad sin duración no se planifica NI arrastra: no se le inventa un día', () => {
  const acts = [
    { id: 'a', duracion: 2 },
    { id: 'sin', duracion: null, nombre: 'Carpintería sin análisis' },
    { id: 'b', duracion: 2 },
  ]
  const r = calcular(acts, [
    { origen: 'a', destino: 'sin', tipo: 'FS' },
    { origen: 'sin', destino: 'b', tipo: 'FS' },
  ])
  assert.deepEqual(r.sinPlan, ['sin'])
  assert.equal(r.actividades.get('sin').inicio, null)
  assert.equal(r.actividades.get('b').inicio, 0, 'b no hereda un fin inventado de su predecesora sin plan')
})

test('un inicio impuesto a mano manda sobre el cálculo', () => {
  const acts = [{ id: 'a', duracion: 2 }, { id: 'b', duracion: 2, inicioFijo: 10 }]
  const r = calcular(acts, [{ origen: 'a', destino: 'b', tipo: 'FS' }])
  assert.equal(r.actividades.get('b').inicio, 10, 'la restricción del que planifica no se pisa')
})

test('un ciclo se dice con nombre y no se cuelga', () => {
  const acts = [{ id: 'a', nombre: 'Armadura', duracion: 1 }, { id: 'b', nombre: 'Encofrado', duracion: 1 }]
  const deps = [{ origen: 'a', destino: 'b', tipo: 'FS' }, { origen: 'b', destino: 'a', tipo: 'FS' }]
  assert.throws(() => ordenTopologico(acts, deps), /ciclo.*Armadura.*Encofrado/s)
  assert.throws(() => calcular(acts, deps), /ciclo/)
})

test('mover una actividad dice QUÉ arrastra y cuánto corre el fin de obra', () => {
  const r = simularMovimiento(CADENA, SECUENCIA, 'arm', 2)
  assert.equal(r.finObraAntes, 13)
  assert.equal(r.finObraDespues, 15)
  assert.equal(r.corrimientoFinObra, 2)
  assert.deepEqual(r.arrastradas.map((x) => x.id).sort(), ['cur', 'enc', 'hor'])
  assert.ok(r.arrastradas.every((x) => x.dias === 2))
})

test('mover algo con holgura no corre el fin de obra', () => {
  const acts = [
    { id: 'a', duracion: 1 }, { id: 'largo', duracion: 10 },
    { id: 'corto', duracion: 2 }, { id: 'fin', duracion: 1 },
  ]
  const deps = [
    { origen: 'a', destino: 'largo', tipo: 'FS' }, { origen: 'a', destino: 'corto', tipo: 'FS' },
    { origen: 'largo', destino: 'fin', tipo: 'FS' }, { origen: 'corto', destino: 'fin', tipo: 'FS' },
  ]
  const r = simularMovimiento(acts, deps, 'corto', 3)
  assert.equal(r.corrimientoFinObra, 0, 'se gastó holgura, no plazo')
  assert.deepEqual(r.arrastradas, [])
})

test('dos actividades con la misma cuadrilla que se pisan salen como conflicto', () => {
  const acts = [
    { id: 'a', duracion: 5, cuadrillaId: 'c1' },
    { id: 'b', duracion: 5, cuadrillaId: 'c1' },
    { id: 'c', duracion: 5, cuadrillaId: 'c2' },
  ]
  const r = calcular(acts, [])
  const ch = conflictosDeCuadrilla(acts, r)
  assert.equal(ch.length, 1)
  assert.deepEqual(ch[0].actividades, ['a', 'b'])
  assert.deepEqual([ch[0].desde, ch[0].hasta], [0, 4])
})

// ── el calendario ──────────────────────────────────────────────────────────────────────────────

test('cinco días hábiles desde un jueves terminan el miércoles siguiente, no el lunes', () => {
  const cal = new CalendarioObra()            // lunes a viernes
  assert.equal(isodow('2026-08-20'), 4, 'el 20/08/2026 es jueves')
  assert.equal(cal.sumarHabiles('2026-08-20', 4), '2026-08-26', 'jueves + 4 hábiles = miércoles')
  assert.equal(cal.habilesEntre('2026-08-20', '2026-08-26'), 5)
})

test('un feriado en el medio corre el fin un día más', () => {
  const cal = new CalendarioObra([1, 2, 3, 4, 5], ['2026-08-24'])   // lunes 24 feriado
  assert.equal(cal.sumarHabiles('2026-08-20', 4), '2026-08-27', 'el feriado empuja al jueves')
  assert.equal(cal.esHabil('2026-08-24'), false)
})

test('una obra que trabaja sábados termina antes', () => {
  const lunViernes = new CalendarioObra()
  const conSabado = new CalendarioObra([1, 2, 3, 4, 5, 6])
  assert.equal(lunViernes.sumarHabiles('2026-08-20', 4), '2026-08-26')
  assert.equal(conSabado.sumarHabiles('2026-08-20', 4), '2026-08-25', 'el sábado cuenta y adelanta un día')
})

test('una tarea que caería en domingo arranca el lunes, no el domingo', () => {
  const cal = new CalendarioObra()
  assert.equal(isodow('2026-08-23'), 7, 'el 23/08/2026 es domingo')
  assert.equal(cal.proximoHabil('2026-08-23'), '2026-08-24')
})

test('índice y fecha son la ida y la vuelta del mismo camino', () => {
  const cal = new CalendarioObra([1, 2, 3, 4, 5], ['2026-08-24'])
  const origen = '2026-08-20'
  for (let i = 0; i < 12; i++) {
    assert.equal(cal.indice(origen, cal.fecha(origen, i)), i, `el día hábil ${i} no vuelve a su índice`)
  }
})

test('el cronograma en índices se traduce a fechas reales con el calendario de la obra', () => {
  const cal = new CalendarioObra([1, 2, 3, 4, 5], ['2026-08-24'])
  const r = calcular(CADENA, SECUENCIA)
  const inicioObra = '2026-08-20'   // jueves
  const fin = cal.fecha(inicioObra, r.actividades.get('cur').fin)
  assert.equal(fin, '2026-09-09')
  assert.equal(cal.habilesEntre(inicioObra, fin), 14, '14 días hábiles = los índices 0 a 13')
})

test('una obra sin ningún día hábil no se planifica en silencio', () => {
  assert.throws(() => new CalendarioObra([]), /sin ningún día hábil/)
})
