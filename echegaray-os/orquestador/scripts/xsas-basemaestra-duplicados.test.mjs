// LO QUE TIENE QUE PASAR, Y —SOBRE TODO— LO QUE NO.
//
// Un clasificador de duplicados que siempre contesta «NO_DUPLICADO» pasa cualquier corrida sobre la
// Base Maestra real de hoy, porque hoy no hay ningún duplicado confirmado. Sería una CONSTANTE
// disfrazada de control. Por eso la mitad de este archivo prueba que SÍ puede decir que sí, y la
// otra mitad que se niega cuando falta el hecho que lo sostiene.
import test from 'node:test'
import assert from 'node:assert/strict'
import { veredicto, paresCandidatos, auditarDuplicados, planDeFusion, huellaComposicion, solapamiento } from './xsas-basemaestra-duplicados.mjs'

const mo = [{ recurso: 'R1', tipo: 'mano_obra', cantidad: 0.5 }, { recurso: 'R2', tipo: 'mano_obra', cantidad: 2.9 }]

const ficha = (o) => ({ unidad: 'M2', composicion: mo, costoUnitario: 100, hsUnitarias: 3.4, descripcion: null, activo: true, usos: {}, ...o })

// ═══════════════ QUE PUEDE DECIR QUE SÍ ═══════════════

test('POSITIVO: mismo nombre, misma unidad y la misma receta → DUPLICADO_CONFIRMADO y fusionable', () => {
  const v = veredicto(ficha({ codigo: 'ZZ-A', nombre: 'TABIQUE DE PLACA' }), ficha({ codigo: 'ZZ-B', nombre: 'Tabique de Placa' }))
  assert.equal(v.veredicto, 'DUPLICADO_CONFIRMADO')
  assert.equal(v.regla, 'NOMBRE_Y_RECETA')
  assert.equal(v.fusionable, true)
})

test('POSITIVO: el plan de fusión deja sobrevivir al MÁS usado y trae su propia reversa', () => {
  const a = ficha({ codigo: 'ZZ-A', nombre: 'TABIQUE', usos: { cotizaciones: 7 } })
  const b = ficha({ codigo: 'ZZ-B', nombre: 'TABIQUE', usos: { cotizaciones: 1 } })
  const plan = planDeFusion(veredicto(a, b), a, b)
  assert.equal(plan.ok, true)
  assert.equal(plan.sobrevive, 'ZZ-A')
  assert.equal(plan.absorbido, 'ZZ-B')
  // Nada se borra: se desactiva. Y el paso inverso está escrito, no se deduce después.
  assert.deepEqual(plan.aplicar.map((p) => p.set), [{ activo: false }, { vigente: false }])
  assert.deepEqual(plan.deshacer.map((p) => p.set), [{ activo: true }, { vigente: true }])
})

test('POSITIVO: a igual uso desempata el código, para que la corrida sea repetible', () => {
  const a = ficha({ codigo: 'ZZ-B', nombre: 'TABIQUE' })
  const b = ficha({ codigo: 'ZZ-A', nombre: 'TABIQUE' })
  assert.equal(planDeFusion(veredicto(a, b), a, b).sobrevive, 'ZZ-A')
})

// ═══════════════ QUE SE NIEGA CUANDO FALTA EL HECHO ═══════════════

test('NEGATIVO OBLIGATORIO: nombre casi idéntico pero UNIDAD distinta → NO se fusiona', () => {
  const a = ficha({ codigo: 'ZZ-A', nombre: 'PUENTE DE HORMIGON', unidad: 'M2' })
  const b = ficha({ codigo: 'ZZ-B', nombre: 'PUENTE DE HORMIGON', unidad: 'ML' })
  const v = veredicto(a, b)
  assert.equal(v.veredicto, 'NO_DUPLICADO')
  assert.equal(v.regla, 'UNIDAD')
  assert.equal(v.fusionable, false)
  const plan = planDeFusion(v, a, b)
  assert.equal(plan.ok, false)
  assert.match(plan.porQue, /sólo se fusiona DUPLICADO_CONFIRMADO/)
})

test('NEGATIVO OBLIGATORIO: nombre idéntico y SISTEMA distinto (otra receta) → NO se fusiona', () => {
  // Mismo nombre, misma unidad, mismo costo: lo único que los separa es CON QUÉ se hacen. Alcanza.
  const a = ficha({ codigo: 'ZZ-A', nombre: 'TECHO METALICO', composicion: [{ recurso: 'CHAPA', cantidad: 1 }, { recurso: 'CORREA', cantidad: 0.08 }] })
  const b = ficha({ codigo: 'ZZ-B', nombre: 'TECHO METALICO', composicion: [{ recurso: 'PANEL', cantidad: 1 }, { recurso: 'PERFIL', cantidad: 0.04 }] })
  const v = veredicto(a, b)
  assert.equal(v.fusionable, false)
  assert.equal(v.regla, 'NOMBRE_IGUAL_RECETA_DISTINTA')
  assert.equal(v.veredicto, 'NO_DUPLICADO', 'sin recursos en común no son ni de la misma familia')
  assert.equal(planDeFusion(v, a, b).ok, false)
})

test('NEGATIVO: misma familia con distinto alcance → RELACIONADO, tampoco se fusiona', () => {
  const base = [{ recurso: 'OF', cantidad: 1 }, { recurso: 'AY', cantidad: 1 }, { recurso: 'CHAPA', cantidad: 1 }]
  const a = ficha({ codigo: 'ZZ-A', nombre: 'TECHO METALICO', composicion: [...base, { recurso: 'CORDON', cantidad: 0.12 }] })
  const b = ficha({ codigo: 'ZZ-B', nombre: 'TECHO METALICO', composicion: base })
  const v = veredicto(a, b)
  assert.equal(v.veredicto, 'RELACIONADO')
  assert.ok(v.ejes.solapamientoRecursos >= 0.5, `solapamiento ${v.ejes.solapamientoRecursos}`)
  assert.equal(v.fusionable, false)
})

test('NEGATIVO: receta idéntica y alcance no declarado → FALTA_DATO con pregunta, nunca duplicado', () => {
  const v = veredicto(
    ficha({ codigo: 'ZZ-A', nombre: 'EXCAVACIONES DE BASES Y ZANJAS PARA FUNDACIONES', unidad: 'M3' }),
    ficha({ codigo: 'ZZ-B', nombre: 'EXCAVACIONES', unidad: 'M3' }),
  )
  assert.equal(v.veredicto, 'FALTA_DATO')
  assert.equal(v.regla, 'RECETA_IGUAL_ALCANCE_NO_DECLARADO')
  assert.equal(v.preguntaPara, 'el dueño')
  assert.match(v.pregunta, /EXCAVACIONES/)
})

test('NEGATIVO: dos tareas sin nada que ver que comparten receta → se denuncia la copia, no se fusiona', () => {
  const v = veredicto(
    ficha({ codigo: 'ZZ-A', nombre: 'CAMION REGADOR', unidad: 'UN', composicion: [{ recurso: 'CAMION', cantidad: 1 }] }),
    ficha({ codigo: 'ZZ-B', nombre: 'COMPACTACION DE SUELO', unidad: 'UN', composicion: [{ recurso: 'CAMION', cantidad: 1 }] }),
  )
  assert.equal(v.veredicto, 'NO_DUPLICADO')
  assert.equal(v.regla, 'RECETA_COPIADA')
  assert.match(v.hallazgo, /el costo que publica no es el suyo/)
})

test('NEGATIVO: composición vacía no es composición igual', () => {
  const v = veredicto(ficha({ codigo: 'ZZ-A', nombre: 'X', composicion: [] }), ficha({ codigo: 'ZZ-B', nombre: 'X', composicion: [] }))
  assert.equal(v.veredicto, 'FALTA_DATO')
  assert.equal(v.ejes.composicion, 'SIN_DATO')
})

test('NEGATIVO: la MISMA cantidad distinta rompe la huella — el criterio exige las cantidades', () => {
  assert.notEqual(huellaComposicion([{ recurso: 'R1', cantidad: 1 }]), huellaComposicion([{ recurso: 'R1', cantidad: 2 }]))
  assert.equal(solapamiento([{ recurso: 'R1', cantidad: 1 }], [{ recurso: 'R1', cantidad: 2 }]), 1,
    'el SET de recursos no las distingue: por eso el set solo no puede decidir un duplicado')
})

// ═══════════════ EL ARMADO DE CANDIDATOS ═══════════════

test('los candidatos salen de los dos criterios duros y cada par aparece UNA vez', () => {
  const fichas = [
    ficha({ codigo: 'T1', nombre: 'IGUAL NOMBRE', composicion: [{ recurso: 'A', cantidad: 1 }] }),
    ficha({ codigo: 'T2', nombre: 'Igual  Nombre!', composicion: [{ recurso: 'B', cantidad: 1 }] }),
    ficha({ codigo: 'T3', nombre: 'OTRA COSA', composicion: [{ recurso: 'A', cantidad: 1 }] }),
    ficha({ codigo: 'T4', nombre: 'SOLITARIA', composicion: [{ recurso: 'Z', cantidad: 9 }] }),
  ]
  const pares = paresCandidatos(fichas)
  assert.deepEqual(pares.map((p) => [p.a.codigo, p.b.codigo, p.criterios]), [
    ['T1', 'T2', ['NOMBRE']],
    ['T1', 'T3', ['COMPOSICION']],
  ])
  assert.ok(!pares.some((p) => p.a.codigo === 'T4' || p.b.codigo === 'T4'), 'una tarea sin par no genera par')
})

test('auditarDuplicados devuelve un veredicto por candidato y ninguno se queda sin argumento', () => {
  const filas = auditarDuplicados([
    ficha({ codigo: 'T1', nombre: 'A', unidad: 'M2' }),
    ficha({ codigo: 'T2', nombre: 'A', unidad: 'ML' }),
  ])
  assert.equal(filas.length, 1)
  assert.ok(filas[0].porQue.length > 20)
  assert.deepEqual(filas[0].criterios, ['NOMBRE', 'COMPOSICION'])
})
