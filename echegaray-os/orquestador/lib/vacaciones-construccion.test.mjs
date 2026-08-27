// LAS VACACIONES NO ESTABAN EN NINGUNA PESTAÑA, Y LO QUE FALTABA NO ERA EL DATO (27/08/2026).
//
// La antigüedad está desde siempre en la columna C de `_J_OBREROS`. Lo que faltaba —y sigue
// faltando— son los DÍAS por tramo, que son normativos. Este archivo prueba las dos mitades:
//
//   · que el mecanismo funciona y calcula contra las fechas de ingreso REALES;
//   · que SIN la escala cargada no publica un número, ni siquiera un 0. Un 0 se suma sin ruido y el
//     cuadro económico queda afirmando que la empresa no debe vacaciones.

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  antiguedadEnAnios, tramoDeAntiguedad, provisionVacaciones, lineaProvision, RANGOS_VACACIONES,
  formulaProvisionVacaciones, formulaSinFechaDeIngreso,
} from './vacaciones-construccion.mjs'

const d = (iso) => new Date(`${iso}T03:00:00.000Z`)
const CIERRE = d('2026-12-31')

// El plantel de obra al 27/08, con la fecha de ingreso leída de la columna C de `_J_OBREROS`.
// Rosales Diego (12/8/24) estaba declarado como faltante y NO lo era: el dato estaba en el Sheet.
const PLANTEL = [
  { nombre: 'Quiroga Sebastian', ingreso: d('2023-06-26') },
  { nombre: 'Rosales Diego', ingreso: d('2024-08-12') },
  { nombre: 'Aguero Cristian', ingreso: d('2025-05-26') },
  { nombre: 'Gonzalez Carlos', ingreso: d('2026-04-20') },
  { nombre: 'Castillo Carlos', ingreso: null },
]

test('la antigüedad son años COMPLETOS, y sin fecha NO es cero', () => {
  assert.equal(antiguedadEnAnios(d('2023-06-26'), CIERRE), 3)
  assert.equal(antiguedadEnAnios(d('2026-04-20'), CIERRE), 0)
  // El día anterior al aniversario todavía no cumplió: redondear para arriba lo mueve de tramo antes.
  assert.equal(antiguedadEnAnios(d('2021-12-31'), d('2026-12-30')), 4)
  assert.equal(antiguedadEnAnios(d('2021-12-31'), d('2026-12-31')), 5)
  // Y "no sé" no es "recién entró": si lo fuera, un faltante se pagaría al tramo más barato.
  assert.equal(antiguedadEnAnios(null, CIERRE), null)
  assert.equal(tramoDeAntiguedad(null), null)
})

test('EL DEFECTO QUE ESTE MÓDULO NO PUEDE COMETER: sin escala NO publica un número', () => {
  const r = provisionVacaciones({
    personas: PLANTEL, escala: {}, valorDiaDe: () => 48000, alCierre: CIERRE,
  })
  assert.equal(r.escalaCargada, false)
  // Ni el total ni una sola fila: un 0 acá se lee como "no se debe nada".
  assert.equal(r.total, null)
  assert.ok(r.filas.every((f) => f.provision === null))
  // Y la celda dice qué falta y quién lo confirma, no que esté todo bien.
  assert.match(lineaProvision(r), /normativos/)
  assert.match(lineaProvision(r), /contador/)
})

test('con la escala cargada la provisión sale de las fechas de ingreso reales — y las cuatro se abren por tramo', () => {
  const escala = {
    [RANGOS_VACACIONES[0]]: 14, [RANGOS_VACACIONES[1]]: 21,
    [RANGOS_VACACIONES[2]]: 28, [RANGOS_VACACIONES[3]]: 35,
  }
  const r = provisionVacaciones({ personas: PLANTEL, escala, valorDiaDe: () => 50000, alCierre: CIERRE })
  assert.equal(r.escalaCargada, true)
  // Los cuatro con fecha caen en el primer tramo (ninguno llega a 5 años) → 14 días × $50.000.
  assert.equal(r.filas[0].anios, 3)
  assert.equal(r.filas[0].dias, 14)
  assert.equal(r.filas[0].provision, 700000)
  // 4 medidos × $700.000. El quinto NO entra al total, y por eso la línea lo nombra.
  assert.equal(r.total, 2800000)
  assert.deepEqual(r.sinFecha, ['Castillo Carlos'])
  assert.match(lineaProvision(r), /Castillo Carlos/)
  assert.match(lineaProvision(r), /NO las incluye/)
})

test('el valor del día lo decide el llamador: la provisión sigue la base con que se valúa el plantel', () => {
  const escala = { [RANGOS_VACACIONES[0]]: 14 }
  // Al piso del convenio un Oficial vale $6.348/h × 8 h = $50.784 el día; al pactado, menos.
  const alConvenio = provisionVacaciones({
    personas: [PLANTEL[0]], escala, valorDiaDe: () => 6348 * 8, alCierre: CIERRE,
  })
  const alPactado = provisionVacaciones({
    personas: [PLANTEL[0]], escala, valorDiaDe: () => 6500 * 8, alCierre: CIERRE,
  })
  assert.equal(alConvenio.total, 14 * 6348 * 8)
  assert.ok(alPactado.total > alConvenio.total, 'Quiroga Sebastián cobra POR ENCIMA del piso: su día vale más')
  // La provisión no puede quedar por debajo del piso del convenio para quien cobra menos que él.
  const bajoPiso = provisionVacaciones({
    personas: [PLANTEL[3]], escala, valorDiaDe: () => 4500 * 8, alCierre: CIERRE,
  })
  assert.ok(bajoPiso.total < 14 * 5399 * 8, 'valuada al jornal pactado la provisión ya nace corta contra la escala')
})

test('la escala vacía en CERO no cuenta como escala cargada', () => {
  const cero = Object.fromEntries(RANGOS_VACACIONES.map((r) => [r, 0]))
  const r = provisionVacaciones({ personas: PLANTEL, escala: cero, valorDiaDe: () => 1, alCierre: CIERRE })
  assert.equal(r.escalaCargada, false, 'cuatro ceros son la pestaña recién creada, no una decisión del contador')
  assert.equal(r.total, null)
})

test('la FÓRMULA dice lo mismo que el JS: una sola regla, dos caminos', () => {
  const f = formulaProvisionVacaciones({ hoja: '_J_OBREROS', bloque: { inicio: 527, fin: 543 }, jornada: 8 })
  // Los cuatro tramos entran por su rango con nombre: el contador escribe una celda, no una fórmula.
  for (const r of RANGOS_VACACIONES) assert.ok(f.includes(r), `falta el tramo ${r}`)
  // El guard de la escala: en cero rinde vacío, NUNCA cero.
  assert.ok(f.startsWith(`=IF(SUM(${RANGOS_VACACIONES.join(';')})=0;"";`))
  // Y el guard de la fecha: una fila sin ingreso no puede romper el SUMPRODUCT ni entrar como 0 años.
  assert.ok(f.includes("(N('_J_OBREROS'!$C$527:$C$543)>0)*"))
  assert.ok(f.includes('DATEDIF(IF(N('), 'el DATEDIF tiene que estar protegido, no crudo')
  // El $/hora sale de la columna W del espejo, que es donde vive — no de un número pegado.
  assert.ok(f.includes("N('_J_OBREROS'!$W$527:$W$543)"))
  assert.ok(f.endsWith('*8;""))'), 'la jornada multiplica el día entero de vacaciones')
})

test('las personas sin fecha de ingreso se CUENTAN, no se esconden', () => {
  const f = formulaSinFechaDeIngreso({ hoja: '_J_OBREROS', bloque: { inicio: 527, fin: 543 } })
  // Nombre presente y fecha ausente: son las filas que la provisión no pudo medir.
  assert.equal(f, "=SUMPRODUCT(('_J_OBREROS'!$B$527:$B$543<>\"\")*(N('_J_OBREROS'!$C$527:$C$543)=0))")
  // Sin bloque no se inventa un rango: se devuelve vacío.
  assert.equal(formulaSinFechaDeIngreso({ hoja: '_J_OBREROS', bloque: null }), '=""')
})
