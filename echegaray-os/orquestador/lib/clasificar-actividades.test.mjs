import test from 'node:test'
import assert from 'node:assert/strict'
import { veredictoDe, decisionDelModelo, unidadCompatible, normalizar, UMBRAL } from './clasificar-actividades.mjs'

const c = (nombre, similitud, unidad = null, tareaTipoId = nombre) => ({ tareaTipoId, nombre, unidad, similitud })

test('nombre idéntico: se asigna sola', () => {
  const v = veredictoDe({ nombre: 'Retiro de Escombros' }, [c('RETIRO DE ESCOMBROS', 1)])
  assert.equal(v.veredicto, 'EXACTO')
  assert.equal(v.origen, 'nombre-exacto')
})

test('dos tipos con el mismo nombre: nadie decide por adivinanza', () => {
  const v = veredictoDe({ nombre: 'PISO' }, [c('PISO', 1, null, 'a'), c('PISO', 1, null, 'b')])
  assert.equal(v.veredicto, 'AMBIGUO')
})

test('una sola candidata fuerte y sin competencia: se asigna', () => {
  const v = veredictoDe({ nombre: 'EXCAVACION' }, [c('EXCAVACIONES', 0.9), c('EXCAVACION MANUAL', 0.6)])
  assert.equal(v.veredicto, 'ALTA')
  assert.equal(v.confianza, 'ALTA')
})

test('dos candidatas casi iguales: AMBIGUO, no la primera', () => {
  const v = veredictoDe({ nombre: 'HORMIGONADO' }, [c('HORMIGONADO A MANO', 0.9), c('HORMIGONADO CON BOMBA', 0.85)])
  assert.equal(v.veredicto, 'AMBIGUO')
  assert.match(v.porQue, /casi igual/)
})

test('la unidad manda sobre el parecido del nombre', () => {
  // Un trabajo medido en m² no puede ser una tarea que se cobra por hora, por más que se llamen igual.
  const v = veredictoDe({ nombre: 'BOBCAT', unidad: 'm2' }, [c('ALQUILER BOBCAT', 0.9, 'HR')])
  assert.equal(v.veredicto, 'AMBIGUO')
  assert.match(v.porQue, /se mide en/)
  // Y si la actividad no declara unidad, no bloquea: no se puede contradecir lo que no se dijo.
  assert.equal(unidadCompatible(null, 'HR'), true)
  assert.equal(unidadCompatible('M2', 'm2'), true, 'la unidad se compara normalizada')
})

test('sin ninguna candidata por encima del piso: SIN MATCH', () => {
  assert.equal(veredictoDe({ nombre: 'Calcomania de carteles' }, []).veredicto, 'SIN MATCH')
  assert.equal(veredictoDe({ nombre: 'x' }, [c('y', UMBRAL.MIRAR - 0.01)]).veredicto, 'SIN MATCH')
})

test('la zona gris no decide: junta candidatas para que las mire otro', () => {
  const v = veredictoDe({ nombre: 'Compactación' }, [c('RELLENO Y COMPACTACIÓN', 0.57)])
  assert.equal(v.veredicto, 'ZONA GRIS')
  assert.equal(v.candidatas.length, 1)
  assert.equal(v.tareaTipoId, undefined, 'la zona gris no asigna nada por sí sola')
})

// ── EL MODELO PROPONE, NO DECIDE ─────────────────────────────────────────────────────────────

test('«se parece» no alcanza: sólo «es la misma tarea» clasifica', () => {
  // «Compactación» dentro de «RELLENO Y COMPACTACIÓN» es media tarea. Aprenderla como la tarea
  // entera deja el rendimiento de esa tarea contaminado para siempre.
  const cands = [c('RELLENO Y COMPACTACIÓN', 0.57, null, 't1')]
  const v = decisionDelModelo({ tarea_tipo_id: 't1', certeza: 'parecida', motivo: 'es parte de' }, cands)
  assert.equal(v.veredicto, 'AMBIGUO')
})

test('el modelo no puede elegir un tipo que no estaba entre las candidatas', () => {
  const v = decisionDelModelo({ tarea_tipo_id: 'inventado', certeza: 'misma_tarea' }, [c('X', 0.6, null, 't1')])
  assert.equal(v.veredicto, 'SIN MATCH')
})

test('«ninguna» es una respuesta válida y esperada', () => {
  const v = decisionDelModelo({ tarea_tipo_id: 'ninguna', motivo: 'no hay equivalencia' }, [c('X', 0.6)])
  assert.equal(v.veredicto, 'SIN MATCH')
})

test('cuando el modelo sí decide, queda marcado como CANDIDATO y con su evidencia', () => {
  const cands = [c('EXCAVACIONES', 0.7, null, 't1')]
  const v = decisionDelModelo({ tarea_tipo_id: 't1', certeza: 'misma_tarea', motivo: 'es la misma' }, cands)
  assert.equal(v.veredicto, 'CANDIDATO')
  assert.equal(v.origen, 'modelo')
  assert.equal(v.evidencia.candidata, 'EXCAVACIONES')
  assert.deepEqual(v.evidencia.candidatas, ['EXCAVACIONES'])
})

test('normalizar saca acentos y colapsa espacios', () => {
  assert.equal(normalizar('  Compactación   y   nivelación '), 'COMPACTACION Y NIVELACION')
})
