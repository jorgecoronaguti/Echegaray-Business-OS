// LAS OPERACIONES COTIDIANAS TIENEN QUE ANDAR CON EL RAZONADOR MUERTO.
//
// La lista NO es inventada: son las intenciones con más ejecuciones REALES medidas en
// `orq.xsas_requests` (167 pedidos del 27–28/08/2026), leídas con
// `node orquestador/scripts/xsas-claude-zero.mjs`. Medir contra un set sintético mediría el set.
//
// QUÉ PRUEBA Y QUÉ NO. Prueba que cada una de esas intenciones EXISTE por su nombre en el registro
// real de tools y que la puerta la resuelve sin tocar un modelo, con un doble de `ia` que TIRA si
// alguien lo llama — que es la forma de que «razonador indisponible» sea real y no un flag.
// NO ejecuta las tools contra Drive, el Sheet ni Postgres: eso escribiría afuera desde un test.
// El límite queda declarado: esto certifica el RUTEO claude-zero, no el resultado de cada tool.
import test from 'node:test'
import assert from 'node:assert/strict'

import { atender } from './xsas-gateway.mjs'
import { toolsDelNucleo } from './xsas-resolutores.mjs'
import { NIVEL } from './elegir-capacidad.mjs'

/** Las 12 intenciones más ejecutadas por la puerta, con la capability que exige cada una. */
const FRECUENTES = [
  'imagen.generar', 'slides.crear', 'plano.cotizar', 'os.salud_obra', 'tesoreria.analisis_inversion',
  'os.estado_empresa', 'os.costos_obras', 'cotizacion.registrar', 'briefing.caja', 'web.read',
  'caja.vencido', 'legajos.estado',
]

/** El razonador MUERTO: cualquier llamada es una falla del test, no una degradación aceptable. */
const razonadorMuerto = () => ({
  pedirTexto: async () => { throw new Error('el test llamó al razonador para una operación cotidiana') },
  pedirTextoONull: async () => { throw new Error('el test llamó al razonador para una operación cotidiana') },
})

test('las 12 intenciones más usadas existen por su NOMBRE en el registro real de tools', async () => {
  // `google: {}` sólo instancia las fábricas que necesitan credenciales; no llama a Google.
  const { mapa } = await toolsDelNucleo({ google: {}, refrescar: true })
  const faltan = FRECUENTES.filter((c) => !mapa.has(c))
  assert.deepEqual(faltan, [], `sin tool por nombre, estas caerían al modelo: ${faltan.join(', ')}`)
})

test('EL DEFECTO QUE SE EVITA: resolver una intención obvia llamando primero al modelo', async () => {
  const corridas = []
  const registro = {
    mapa: new Map(FRECUENTES.map((clave) => [clave, {
      capability: 'drive.read',
      schema: { name: clave.replace('.', '_'), input_schema: { type: 'object', properties: {} } },
      async run() { corridas.push(clave); return { resumen_texto: `${clave} resolvió sin modelo` } },
    }])),
    porArchivo: new Map(),
    fallaron: [],
  }
  const actor = { id: 'u-test', rol: 'direccion', permisos: ['drive.read'] }

  for (const intencion of FRECUENTES) {
    const r = await atender(
      { actor, canal: 'app', intencion },
      { registro, catalogo: [], ia: razonadorMuerto() },
    )
    assert.equal(r.ok, true, `${intencion} no resolvió`)
    assert.equal(r.capacidades?.nivel, NIVEL.DETERMINISTICO, `${intencion} no se resolvió en N0`)
    assert.equal(r.llm ?? null, null, `${intencion} pagó una llamada a un modelo`)
  }
  assert.deepEqual(corridas, FRECUENTES)
})
