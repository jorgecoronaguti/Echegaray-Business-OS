import test from 'node:test'
import assert from 'node:assert/strict'
import { estadoDelEsquema, filaDeCobranzas, normalizarNombre, yaMigrada } from './migrar-portal-al-crm.mjs'

// LAS TRES DECISIONES DEL SCRIPT QUE PUEDEN ARRUINAR DATOS, PROBADAS SIN TOCAR LA BASE.

test('el nombre de obra se empareja sin importar mayúsculas ni acentos', () => {
  assert.equal(normalizarNombre('PISOS INDUSTRIALES'), normalizarNombre('Pisos Industriales'))
  assert.equal(normalizarNombre('Galpón 9'), normalizarNombre('Galpon 9'))
  assert.equal(normalizarNombre('  ENTREPISO   Y ESCALERA '), 'entrepiso y escalera')
})

test('dos obras distintas NO se emparejan', () => {
  // El defecto que esto impide: dar por buena una coincidencia parcial y mandar el cronograma de
  // «MAMPOSTERÍA» a «Galpones, Mampostería, Cancha de Padel», que es otra obra.
  assert.notEqual(normalizarNombre('MAMPOSTERÍA'), normalizarNombre('Galpones, Mampostería, Cancha de Padel'))
  assert.notEqual(normalizarNombre('Pisos'), normalizarNombre('Pisos Industriales'))
})

test('una fila del esquema que junta dos de Cobranzas no reclama ninguna', () => {
  assert.equal(filaDeCobranzas('Cobranzas fila 53 · Cambio de pisos RRHH'), 53)
  // `cobranza_fila` tiene índice único: es una identidad. «filas 80+82» no ES la 80.
  assert.equal(filaDeCobranzas('Cobranzas filas 80+82 · Playon Azufre - Certificación 1/2'), null)
  assert.equal(filaDeCobranzas(null), null)
  assert.equal(filaDeCobranzas('sin referencia'), null)
})

test('el estado migrado nunca es «vencido»: eso lo deriva la fecha', () => {
  // Congelar «vencido» dejaría en rojo un pago cuya fecha después se mueve al futuro.
  assert.equal(estadoDelEsquema({ fecha_pago: '2026-08-21', fecha_prevista: '2026-08-21', tipo: 'otro' }), 'cobrado')
  assert.equal(estadoDelEsquema({ fecha_pago: null, fecha_prevista: '2026-01-01', tipo: 'otro' }), 'a_vencer')
  assert.equal(estadoDelEsquema({ fecha_pago: null, fecha_prevista: null, tipo: 'otro' }), 'previsto')
})

test('el fondo de reparo entra como «retenido», que es lo que la columna significa', () => {
  assert.equal(estadoDelEsquema({ fecha_pago: null, fecha_prevista: '2027-01-01', tipo: 'fondo_reparo' }), 'retenido')
  // Cobrado gana: un fondo de reparo ya devuelto no sigue retenido.
  assert.equal(estadoDelEsquema({ fecha_pago: '2027-01-01', fecha_prevista: null, tipo: 'fondo_reparo' }), 'cobrado')
})

// ── LA IDEMPOTENCIA CONTRA LO QUE YA ESCRIBIÓ OTRO ───────────────────────────────────────────

test('no vuelve a migrar una fila que otro proceso ya puso, aunque no lleve la marca propia', () => {
  const p = {
    id: 'uuid-1', cliente_id: 'c1', rotulo: 'Anticipo (1 de 2)', monto: '12100000.00',
    nota: 'Cobranzas fila 67 · Instalaciones Eléctricas — anticipo 1ª cuota',
  }
  // Así quedó en el destino el 26/08/2026 a las 16:01: con la nota original y sin `pago_programado:`.
  const ajena = [{ cliente_id: 'c1', concepto: 'Anticipo (1 de 2)', monto: '12100000.00', nota_interna: p.nota }]
  assert.equal(yaMigrada(p, ajena), true)

  // Y tampoco vuelve a migrar la que puso este mismo script.
  const propia = [{ cliente_id: 'c1', concepto: 'x', monto: '0', nota_interna: `pago_programado:uuid-1 · ${p.nota}` }]
  assert.equal(yaMigrada(p, propia), true)
})

test('lo que todavía no está en el destino SÍ se migra', () => {
  const p = { id: 'uuid-2', cliente_id: 'c1', rotulo: 'Cobro (1 de 4)', monto: '10000000', nota: 'Cobranzas fila 33 · Galpon 9' }
  assert.equal(yaMigrada(p, []), false)
  // Mismo concepto y monto pero de OTRO cliente: no es la misma fila.
  assert.equal(yaMigrada(p, [{ cliente_id: 'c2', concepto: 'Cobro (1 de 4)', monto: '10000000', nota_interna: null }]), false)
})
