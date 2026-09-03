import test from 'node:test'
import assert from 'node:assert/strict'
import { AVISO_OTRO, desvioDe, soloEnLaPrimera, validarCausa } from './causa.ts'
import { plazoDe, rendimientoDe } from './tarea.ts'

// EL DEFECTO QUE ATRAPAN ESTOS TESTS: una pantalla que pregunta la causa cuando no hay nada que
// explicar (y entrena al jefe a tocar cualquier chip para sacársela de encima), o que NO pregunta
// cuando el azulejo está en rojo (y deja la obra sin causa, que es el estado del que venimos: una
// fila en dieciocho obras).

const EN_PLAN = {
  hh_real: 100, hh_plan: 200, avance_pct: 50,
  fin_plan: '2026-09-30', forecast_fin: '2026-09-30',
}

test('sin desvío no se pregunta nada', () => {
  const d = desvioDe(EN_PLAN)
  assert.equal(d.pedir, false)
  assert.equal(d.motivo, null)
})

test('consumir más horas de las que el plan da a lo hecho pide la causa, y dice cuánto', () => {
  // 132 h sobre las 100 que el plan asigna al 50 % hecho de 200: 1,32× → 32 % arriba.
  const d = desvioDe({ ...EN_PLAN, hh_real: 132 })
  assert.equal(d.pedir, true)
  assert.match(d.motivo ?? '', /32 % más horas/)
})

test('proyectar el fin después del plan pide la causa, con los días en castellano', () => {
  const d = desvioDe({ ...EN_PLAN, forecast_fin: '2026-10-02' })
  assert.equal(d.pedir, true)
  assert.match(d.motivo ?? '', /2 días después/)
  // Un solo día no se escribe «1 días».
  assert.match(desvioDe({ ...EN_PLAN, forecast_fin: '2026-10-01' }).motivo ?? '', /1 día después/)
})

test('los dos desvíos juntos se declaran los dos: uno no tapa al otro', () => {
  const d = desvioDe({ ...EN_PLAN, hh_real: 132, forecast_fin: '2026-10-02' })
  assert.match(d.motivo ?? '', /más horas/)
  assert.match(d.motivo ?? '', /después de lo previsto/)
})

test('SIN LAS DOS PUNTAS NO SE PREGUNTA — un desvío que nadie midió no tiene causa que dar', () => {
  // Es la trampa de un umbral escrito a mano: `hh_real / hh_plan` con `hh_plan` en null da NaN o
  // Infinity, y cualquiera de los dos «es mayor que 1». La pantalla pediría la causa de un número
  // que no existe.
  assert.equal(desvioDe({ ...EN_PLAN, hh_plan: null }).pedir, false)
  assert.equal(desvioDe({ ...EN_PLAN, hh_real: null }).pedir, false)
  assert.equal(desvioDe({ ...EN_PLAN, avance_pct: 0, hh_real: 500 }).pedir, false)
  assert.equal(desvioDe({ ...EN_PLAN, forecast_fin: null }).pedir, false)
  assert.equal(desvioDe({ ...EN_PLAN, fin_plan: null }).pedir, false)
})

test('LA PREGUNTA SIGUE AL AZULEJO: el mismo umbral que pinta el rojo decide si se pregunta', () => {
  // Si alguien mete un umbral propio en `causa.ts` («preguntar sólo arriba de 1,15×»), este test se
  // pone rojo: quedaría una pantalla con el rendimiento en alerta y ninguna pregunta al lado.
  const casos = [
    EN_PLAN,
    { ...EN_PLAN, hh_real: 101 },
    { ...EN_PLAN, hh_real: 99 },
    { ...EN_PLAN, hh_real: 300 },
    { ...EN_PLAN, forecast_fin: '2026-10-01' },
    { ...EN_PLAN, forecast_fin: '2026-09-29' },
  ]
  for (const c of casos) {
    const alerta = rendimientoDe(c).alerta || plazoDe(c).alerta
    assert.equal(desvioDe(c).pedir, alerta, JSON.stringify(c))
  }
})

test('«otra causa» sin escribir cuál no entra: es texto libre disfrazado de clave', () => {
  assert.equal(validarCausa({ causa: 'otro', nota: '' }), AVISO_OTRO)
  assert.equal(validarCausa({ causa: 'otro', nota: '   ' }), AVISO_OTRO)
  assert.equal(validarCausa({ causa: 'otro', nota: 'esperando la grúa del vecino' }), null)
})

test('las demás causas NO exigen nota — obligarla convierte un toque en un teclado', () => {
  assert.equal(validarCausa({ causa: 'falta_material' }), null)
  assert.equal(validarCausa({ causa: 'clima', nota: '' }), null)
  // Y no declarar causa tampoco bloquea: el parte del día vale más que su clasificación.
  assert.equal(validarCausa({}), null)
  assert.equal(validarCausa({ causa: null, nota: null }), null)
})

test('medir por pasos escribe UNA incidencia, no una por paso', () => {
  // El defecto: copiar la causa en las cinco filas hace que `obra_causa_desvio.n_incidencias`
  // publique cinco incidencias donde hubo una, inflada por el método de medición.
  const filas = soloEnLaPrimera(
    [{ paso_id: 'a' }, { paso_id: 'b' }, { paso_id: 'c' }],
    { causa_desvio: 'espera_equipo', comentario: 'sin hormigón hasta las 11' },
  )
  assert.equal(filas.filter((f) => f.causa_desvio != null).length, 1)
  assert.equal(filas[0].causa_desvio, 'espera_equipo')
  assert.equal(filas[0].comentario, 'sin hormigón hasta las 11')
  assert.deepEqual(filas.slice(1).map((f) => f.causa_desvio), [null, null])
  // Y no pierde lo que ya traía cada fila.
  assert.deepEqual(filas.map((f) => f.paso_id), ['a', 'b', 'c'])
})
