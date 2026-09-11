// A UNA OBRA SE LE CARGAN LAS HORAS TRABAJADAS, NO LAS DECLARADAS.
//
// ═══ EL DEFECTO, MEDIDO EN LA PANTALLA REAL (11/09/2026, 1ª quincena de septiembre) ═══
//
// La solapa «Costo a la obra» publicaba, una debajo de la otra y en la misma pantalla:
//
//   La quincena cargada a la obra  →  1.385,4 HH
//   Productividad · HH contra avance →  1.227,0 h
//
// Los dos números cuentan las horas de la MISMA ventana. La diferencia, 158,4 h, eran las ausencias
// y las licencias: `getHorasPorObra` leía `registros_hh` sin mirar el `tipo_hora`, así que un día
// que nadie trabajó le sumaba horas —y por lo tanto plata— a una obra. Productividad ya filtraba
// con `esTrabajada`; esta lectura, no.
//
// Es el número contra el que se compara la mano de obra presupuestada de cada obra, así que el
// error no es de presentación: infla el consumo del presupuesto de todas.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { repartirHorasPorObra, type FilaDeObra } from './costoLecturas.ts'

const fila = (o: Partial<FilaDeObra>): FilaDeObra => ({
  obra_id: null, obra_canonica_id: 'quattropani', persona_id: 'p1', horas: '9', tipo_hora: 'normal',
  ...o,
})
const ROTULO = (f: FilaDeObra) => (f.obra_canonica_id == null ? 'Sin obra imputada' : String(f.obra_canonica_id))
const TARIFAS = new Map([['p1', 1000], ['p2', 2000]])

test('UNA AUSENCIA NO LE CARGA HORAS A NINGUNA OBRA', () => {
  const obras = repartirHorasPorObra([
    fila({ horas: '9' }),
    // EL DEFECTO QUE ATRAPA: estas dos sumaban 17,8 h más, y `Sin obra imputada` se llevaba la mayor
    // parte porque una ausencia por definición no tiene obra.
    fila({ horas: '9', tipo_hora: 'ausencia', obra_canonica_id: null }),
    fila({ horas: '8.8', tipo_hora: 'licencia', obra_canonica_id: null }),
  ], TARIFAS, ROTULO)
  assert.deepEqual(obras.map((o) => [o.rotulo, o.horas]), [['quattropani', 9]])
  assert.equal(obras[0].bolsillo, 9000)
})

test('LO TRABAJADO SÍ SUMA ENTRE OBRAS: el control puede decir sí', () => {
  // El día repartido entre dos obras es una hora de cada una — el reparto que esta tabla publica.
  // Sin este caso, «no sumes nada» pasaría el test de arriba siendo una constante.
  const obras = repartirHorasPorObra([
    fila({ obra_canonica_id: 'a', horas: '5' }),
    fila({ obra_canonica_id: 'b', horas: '3.8' }),
    fila({ obra_canonica_id: 'a', horas: '2', tipo_hora: 'extra_50' }),
  ], TARIFAS, ROTULO)
  assert.deepEqual(obras.map((o) => [o.rotulo, o.horas]), [['a', 7], ['b', 3.8]])
})

test('UNA OBRA CON ALGUIEN SIN TARIFA NO PUBLICA UN BOLSILLO PARCIAL (R1)', () => {
  // Sumar sólo a los que tienen tarifa daría un costo que parece completo y le falta gente.
  const obras = repartirHorasPorObra([
    fila({ obra_canonica_id: 'a', persona_id: 'p1', horas: '9' }),
    fila({ obra_canonica_id: 'a', persona_id: 'sin-tarifa', horas: '9' }),
  ], TARIFAS, ROTULO)
  assert.equal(obras[0].bolsillo, null)
  assert.equal(obras[0].sinTarifa, 1)
  assert.equal(obras[0].gente, 2)
  assert.equal(obras[0].horas, 18)
})

test('LAS HORAS SIN OBRA SE PUBLICAN APARTE, no se reparten entre las demás', () => {
  const obras = repartirHorasPorObra([
    fila({ obra_canonica_id: 'a', horas: '9' }),
    fila({ obra_canonica_id: null, horas: '4' }),
  ], TARIFAS, ROTULO)
  assert.deepEqual(obras.map((o) => [o.obraId, o.horas]), [['a', 9], [null, 4]])
})
