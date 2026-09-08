// LO QUE PASÓ EL 07/09/2026 EN #comprobantes-gastos, Y LO QUE NO PUEDE VOLVER A PASAR.
//
// El dueño mandó dos PDF a las 10:10. Los dos YA estaban en la pestaña Compras (filas 951 y 952,
// cargados por otra puerta esa misma mañana). El bot contestó:
//
//   «⚠ No pude cargarlos: el cargador falló. No se escribió nada.»
//
// Nada había fallado: el cargador emitió `{ok:false, motivo:'ya_cargados'}`, que es la idempotencia
// haciendo su trabajo. Pero `motivo` no se leía en ningún lado —el texto se arma con
// `r.error ?? r.datos?.detalle`— y `ok:false` tenía un solo camino: reabrir el fajo y decir que
// falló. El comprobante quedó pendiente, se arrastró al fajo siguiente y disparó el aviso de «fajo
// mudo» 19 minutos después. Al día siguiente el dueño reclamó comprobantes «no replicados» que
// estaban cargados desde el día anterior.
//
// El otro defecto del mismo día: el que no se escribe porque ya estaba quedaba anotado en
// `comprobantes_cargados` con `fila: null` — el registro afirmando «cargado» sin poder decir dónde.

import test from 'node:test'
import assert from 'node:assert/strict'
import { escribirFajo, porQueNoCargo } from './escritura.mjs'
import { repoMemoria } from './dobles.mjs'

function item(over = {}) {
  return {
    comprobante: {
      proveedor: 'MASS CONSULTORA', cuit: '27326890397', tipo: 'C', numero: '0001-00000067',
      fecha: '04/09/2026', concepto: 'honorarios', iva: 0, total: 250000, obra: 'Administracion',
      unidad: 'Estructura', detalleObra: 'Honorarios', categoria: 'B', condicion: 'Cuenta Corriente',
      ...over,
    },
  }
}

/** El fajo de esa mañana: un comprobante que el cargador va a declarar duplicado. */
async function cargar(datos, extra = {}) {
  const repo = repoMemoria()
  const fajo = await repo.abrirFajo(null, { userId: 'u1', channelId: 'c1', items: [item()] })
  const r = await escribirFajo({
    port: null, repo, congelado: () => null,
    correr: async () => ({ ok: false, datos }),
    leerCompras: async () => [],
    auditar: async () => ({ conciliado: [] }),
    ...extra,
  }, fajo)
  return { r, repo, fajo }
}

const YA_CARGADOS = Object.freeze({
  ok: false, motivo: 'ya_cargados', escritas: 0,
  duplicados: [{ i: 0, fila: 952, proveedor: 'MASS CONSULTORA', numero: '0001-00000067' }],
  rechazos: [],
})

test('EL DEFECTO 07/09: «ya estaban cargados» se le decía al dueño como «el cargador falló»', async () => {
  const { r } = await cargar(YA_CARGADOS)
  assert.doesNotMatch(r.texto, /falló/i, 'sigue anunciando un fallo que no existió')
  assert.match(r.texto, /ya estaban cargados/i, 'no dice lo único que importa: que el gasto YA está')
  assert.match(r.texto, /952/, 'no dice en qué fila de Compras está, que es lo que se va a mirar')
})

test('un fajo cuyos comprobantes ya estaban NO se reabre: si se reabre, se arrastra y avisa «mudo»', async () => {
  const { r, repo, fajo } = await cargar(YA_CARGADOS)
  assert.equal(r.estado, 'cargado', 'quedó en error: el fajo vuelve a la cola y el vigía lo grita')
  const vivo = await repo.fajoPorId(null, fajo.id)
  assert.equal(vivo?.estado, 'cargado', `el fajo quedó en «${vivo?.estado}» y va a mudarse al fajo siguiente`)
})

test('los que ya estaban se CUENTAN como ya estaban, no como cargados', async () => {
  const { r } = await cargar(YA_CARGADOS)
  assert.equal(r.yaEstaban, 1)
  assert.ok(!(r.filas ?? []).length, 'no puede declarar filas propias: no escribió ninguna')
})

test('un fallo de verdad SIGUE siendo un fallo, y ahora dice cuál', async () => {
  const { r, repo, fajo } = await cargar({ ok: false, motivo: 'sin_fila_modelo', escritas: 0, duplicados: [], rechazos: [] })
  assert.equal(r.estado, 'error', 'un fallo real se tragó y se dio por cargado')
  assert.match(r.texto, /fórmulas completas/, 'sigue diciendo «el cargador falló» sin decir qué pasó')
  const vivo = await repo.fajoPorId(null, fajo.id)
  assert.equal(vivo?.estado, 'abierto', 'un fallo real tiene que dejar el fajo reintentable')
})

test('el motivo se traduce, y lo que no se conoce no se inventa', () => {
  assert.equal(porQueNoCargo('ya_cargados'), 'ya estaban todos cargados en Compras')
  assert.equal(porQueNoCargo('nada_cargable'), 'ninguno tenía lo mínimo para cargarse')
  assert.equal(porQueNoCargo('marciano'), 'el cargador falló')
  assert.equal(porQueNoCargo(undefined), 'el cargador falló')
})

test('EL OTRO DEFECTO: el duplicado se anotaba en el registro sin fila («cargado», sin decir dónde)', async () => {
  const repo = repoMemoria()
  const fajo = await repo.abrirFajo(null, { userId: 'u1', channelId: 'c1', items: [item(), item({ numero: '0004-00003784', proveedor: 'Corralon Progreso', cuit: '23369111574' })] })
  await escribirFajo({
    port: null, repo, congelado: () => null,
    leerCompras: async () => [],
    auditar: async () => ({ conciliado: [] }),
    // El cargador escribe uno y saltea el otro por duplicado: sólo devuelve fila del que escribió.
    correr: async () => ({ ok: true, datos: { ok: true, escritas: 1, filas: [{ i: 1, fila: 953 }], duplicados: [{ i: 0, fila: 952 }] } }),
  }, fajo)
  const registro = (await repo.fajoPorId(null, fajo.id))?.filas ?? []
  const mass = registro.find((f) => String(f.numero ?? '').includes('0001-00000067'))
  assert.ok(mass, 'el comprobante ya cargado desapareció del registro')
  assert.equal(mass.fila, 952, 'quedó con fila null: el registro dice «cargado» y no puede decir dónde')
})

// ── EL CIRCUITO CORRÍA CIEGO ────────────────────────────────────────────────
//
// `especialistas/comprobantes.mjs` declara `log` en su firma desde siempre, y el handler nunca se lo
// pasaba: todos los `log?.error?.()` del circuito —incluido «comprobantes: la carga falló»— eran
// no-ops. El 07/09 la carga falló, el chat lo dijo, y el journal del worker no tuvo UNA línea entre
// las 13:10:38 y las 13:11:14. La prueba es estructural a propósito: lo que se rompió no es un
// comportamiento del handler, es un cable que nadie ata en ninguna prueba de comportamiento.

test('el handler le pasa el logger al especialista: sin eso el circuito no deja rastro', async () => {
  const { readFileSync } = await import('node:fs')
  const src = readFileSync(new URL('../../handlers/comunicacion.mjs', import.meta.url), 'utf8')
  const i = src.indexOf('e.atender({')
  assert.ok(i > 0, 'cambió la forma de llamar al especialista: revisá que el logger siga viajando')
  const llamada = src.slice(i, src.indexOf('\n    })', i))
  assert.match(llamada, /^\s*log:/m, 'el especialista corre sin logger: un fallo suyo no va a existir en el journal')
})

test('el especialista de comprobantes sigue recibiendo `log` en su firma', async () => {
  const { readFileSync } = await import('node:fs')
  const src = readFileSync(new URL('../especialistas/comprobantes.mjs', import.meta.url), 'utf8')
  assert.match(src, /async atender\(\{[^}]*\blog\b/, 'el especialista dejó de aceptar el logger')
})
