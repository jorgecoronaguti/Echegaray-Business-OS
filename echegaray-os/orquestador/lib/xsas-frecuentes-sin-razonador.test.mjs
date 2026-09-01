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

// ── EL REGISTRO COMPLETO (01/09/2026) ─────────────────────────────────────────────────────────

test('EL DEFECTO: 33 fábricas de tools existían y la puerta no las conocía', async () => {
  const { mapa, fallaron } = await toolsDelNucleo({ google: {}, refrescar: true })
  assert.deepEqual(fallaron, [], 'una fábrica registrada que no importa deja la capacidad muda')
  // Medido el 01/09/2026: 125 tools con cliente de Google. El piso protege contra el defecto que
  // esto arregla —volver a dejar fábricas afuera—, no contra agregar tools nuevas.
  assert.ok(mapa.size >= 120, `el registro cayó a ${mapa.size} tools`)
  for (const clave of ['drive.list', 'drive.read', 'os.buscar_comprobante', 'gmail.search']) {
    assert.ok(mapa.has(clave), `${clave} existe en el OS y la puerta no la alcanza`)
  }
})

test('dos fábricas no pueden reclamar la misma clave: la segunda pisaría a la primera en silencio', async () => {
  const { porArchivo } = await toolsDelNucleo({ google: {}, refrescar: true })
  const visto = new Map()
  const duplicadas = []
  for (const [archivo, claves] of porArchivo) {
    for (const c of claves) {
      if (visto.has(c)) duplicadas.push(`${c}: ${visto.get(c)} y ${archivo}`)
      visto.set(c, archivo)
    }
  }
  assert.deepEqual(duplicadas, [])
})

test('«¿qué podés hacer?» sale del registro filtrado por permisos, sin tocar un modelo', async () => {
  const { atender: _ } = await import('./xsas-gateway.mjs')
  const { permisosDeRol } = await import('./xsas-permisos.mjs')
  const r = await _(
    { actor: { id: 'u', rol: 'direccion', permisos: permisosDeRol('direccion') }, canal: 'app', mensaje: 'que podes hacer' },
    { ia: razonadorMuerto(), google: {} },
  )
  assert.equal(r.ok, true)
  assert.equal(r.llm ?? null, null, 'preguntarle a un modelo qué sabe hacer el OS es la respuesta que no sirve')
  assert.equal(r.capacidades.via, 'capacidades')
  assert.ok(r.datos.disponibles > 0 && r.datos.disponibles < r.datos.registradas,
    'si no filtra por permisos, ofrece capacidades que el actor no puede correr')
})
