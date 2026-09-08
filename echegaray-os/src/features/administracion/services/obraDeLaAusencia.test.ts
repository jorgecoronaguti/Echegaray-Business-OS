import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  SIN_OBRA_DEDUCIBLE, avisoDeObraDeducida, resolverObraDeLaAusencia,
} from './obraDeLaAusencia.ts'

// EL DEFECTO QUE ATRAPAN ESTOS TESTS (dueño, 08/09): «si la persona está ausente o de licencia no
// me puede pedir que le asigne obra». En la captura, GONZALEZ TOBARES tenía las 9 hs del día en LA
// ESTRELLA —cerrada, y por eso fuera del selector— y sin obra vigente: marcar «No vino · accidente
// de trabajo» terminaba en «Elegí la obra» y no había ninguna que elegir sin mentir.

test('UNA AUSENCIA SIN OBRA ELEGIDA CAE EN LA OBRA DE LAS HORAS DE ESE DÍA, aunque esté cerrada', () => {
  // El caso exacto de la captura: el día YA está cargado en La Estrella y ahí es donde se corrige.
  const r = resolverObraDeLaAusencia({ elegida: null, delDia: ['la-estrella'] })
  assert.deepEqual(r, { obra: 'la-estrella', porque: 'registros-del-dia' })
})

test('EL DÍA CARGADO LE GANA A LA ASIGNACIÓN VIGENTE: nadie pidió mover el día de obra', () => {
  // El defecto que atrapa: resolver la obra por la asignación cuando el día ya tiene horas en otra
  // convierte la corrección en un MOVIMIENTO —inserta en la nueva, BORRA la vieja— que nadie pidió.
  const r = resolverObraDeLaAusencia({
    elegida: null, delDia: ['la-estrella'], asignadasVigentes: ['pisos-industriales'],
  })
  assert.equal(r.obra, 'la-estrella')
})

test('CON EL DÍA VACÍO MANDA LA ASIGNACIÓN VIGENTE: es donde se la espera', () => {
  const r = resolverObraDeLaAusencia({
    elegida: null, delDia: [], asignadasVigentes: ['pisos-industriales'], ultimas: ['messina'],
  })
  assert.deepEqual(r, { obra: 'pisos-industriales', porque: 'asignacion-vigente' })
})

test('SIN DÍA NI ASIGNACIÓN, LA OBRA DE SUS ÚLTIMOS REGISTROS — nunca una obra activa inventada', () => {
  const r = resolverObraDeLaAusencia({ elegida: null, ultimas: ['messina', 'la-estrella'] })
  assert.deepEqual(r, { obra: 'messina', porque: 'ultimos-registros' })
})

test('LO QUE ELIGIÓ UNA PERSONA NO SE DEDUCE: la elección gana siempre', () => {
  // El defecto que atrapa: que una deducción pise la obra que alguien eligió a mano y el día
  // termine imputado a otra obra sin que nadie lo haya pedido.
  const r = resolverObraDeLaAusencia({
    elegida: 'messina', delDia: ['la-estrella'], asignadasVigentes: ['pisos-industriales'],
  })
  assert.deepEqual(r, { obra: 'messina', porque: 'elegida' })
})

test('CUANDO NO HAY NINGUNA PISTA, LA OBRA QUEDA EN NULL Y SE PIDE ELEGIR', () => {
  // NUNCA `null` a la base: `hh_insert_por_obra` (migración 20260819T2900) exige
  // `obra_canonica_id is not null`, y `select`/`delete` también — una fila sin obra entraría sólo
  // para volverse invisible e imborrable. El defecto que atrapa es que alguien devuelva acá la
  // primera obra activa de la lista para «que no falle».
  const r = resolverObraDeLaAusencia({ elegida: null, delDia: [], asignadasVigentes: [], ultimas: [] })
  assert.deepEqual(r, { obra: null, porque: 'ninguna' })
  assert.match(SIN_OBRA_DEDUCIBLE, /Elegí una obra/)
})

test('LA OBRA QUE DECIDIÓ EL SISTEMA SE NOMBRA EN EL ACUSE; la que eligió una persona, no', () => {
  // El defecto que atrapa: imputar la ausencia a una obra que quien corrigió nunca vio en pantalla
  // y no decirlo. Una escritura silenciosa sobre una obra distinta es exactamente lo que este repo
  // prohíbe: lo que no se tocó —y lo que se decidió solo— se nombra.
  assert.match(avisoDeObraDeducida('registros-del-dia', 'LA ESTRELLA') ?? '', /LA ESTRELLA/)
  assert.match(avisoDeObraDeducida('asignacion-vigente', 'MESSINA') ?? '', /asignada/)
  assert.match(avisoDeObraDeducida('ultimos-registros', 'MESSINA') ?? '', /últimos registros/)
  assert.equal(avisoDeObraDeducida('elegida', 'MESSINA'), null)
  assert.equal(avisoDeObraDeducida('ninguna', 'MESSINA'), null)
})
