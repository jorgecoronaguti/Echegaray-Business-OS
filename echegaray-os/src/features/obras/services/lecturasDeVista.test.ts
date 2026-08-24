import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { lecturasDeVista, type SubTareas } from './lecturasDeVista.ts'

// ═══ QUÉ DEFECTO ATRAPA ═══
//
// El workspace pedía `obra_plan_vs_real` y `obra_restriccion` en las SEIS solapas, y las usaba en
// tres. Medido contra PostgREST el 24/08/2026 con sesión de Dirección (mediana de 5 vueltas):
// `obra_plan_vs_real` de una obra son 864 ms —más que leer las diecisiete juntas, 488 ms, porque el
// filtro no baja a las CTEs agregadas de la vista—. Cronograma, Operación y Documentos pagaban esos
// 864 ms por un objeto que nunca llegaba a una prop.
//
// Si alguien vuelve a poner `plan: true` para todas las vistas, o saca el ternario del `Promise.all`
// y la lectura vuelve a salir siempre, este archivo se pone rojo por los dos lados: la matriz de
// abajo y la regla que lee el `page.tsx`.

const RAIZ = new URL('../../../..', import.meta.url).pathname
const PAGE = RAIZ + 'src/app/(main)/obras/[obra]/page.tsx'

/** Las ocho combinaciones vista/sub que el workspace sabe dibujar. */
const SOLAPAS: Array<[string, SubTareas]> = [
  ['resumen', null], ['tareas', 'arbol'], ['tareas', 'gantt'], ['tareas', 'parte'],
  ['personal', null], ['operacion', null], ['economia', null], ['documentos', null],
]

test('el plan sólo lo leen las tres solapas que lo dibujan', () => {
  // La lista es la de las props `plan={plan}` del `page.tsx`: Resumen, Personal y Economía.
  const conPlan = SOLAPAS.filter(([v, s]) => lecturasDeVista(v, s).plan).map(([v]) => v)
  assert.deepEqual(conPlan.sort(), ['economia', 'personal', 'resumen'])
})

test('las restricciones sólo las leen Resumen, Cronograma y Operación', () => {
  const con = SOLAPAS.filter(([v, s]) => lecturasDeVista(v, s).restricciones).map(([v, s]) => s ? `${v}/${s}` : v)
  assert.deepEqual(con.sort(), ['operacion', 'resumen', 'tareas/gantt'])
})

test('ninguna solapa lee las cinco cosas: la matriz cobra por vista, no de fábrica', () => {
  for (const [v, s] of SOLAPAS) {
    const l = lecturasDeVista(v, s)
    const n = Object.values(l).filter(Boolean).length
    assert.ok(n < 5, `${v}/${s} pide las cinco lecturas — si eso es correcto, hay que medirlo y decirlo acá`)
  }
})

test('la matriz no cambia según cómo se escribió la URL, sino según la vista ya resuelta', () => {
  // `resolverVistaObra` traduce los alias viejos ANTES de llegar acá. Una sub-vista que no existe no
  // puede activar lecturas: `?vista=tareas&sub=cualquiera` no es el Gantt.
  assert.equal(lecturasDeVista('tareas', null).plan, false)
  assert.equal(lecturasDeVista('tareas', null).restricciones, false)
  assert.equal(lecturasDeVista('gantt', null).restricciones, false)
})

test('el page.tsx pide plan y restricciones DETRÁS de la matriz, no siempre', () => {
  const fuente = readFileSync(PAGE, 'utf8')
  // El defecto original era literalmente estas dos líneas sin ternario adelante.
  assert.match(fuente, /necesita\.plan \? getPlanVsReal\(/, 'getPlanVsReal volvió a ser incondicional')
  assert.match(fuente, /necesita\.restricciones \? getRestricciones\(/, 'getRestricciones volvió a ser incondicional')
  assert.match(fuente, /lecturasDeVista\(vista,/, 'el page.tsx dejó de usar la matriz')
})
