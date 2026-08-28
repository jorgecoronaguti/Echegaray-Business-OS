// LA PUERTA DE XSAS. Cada test acá prueba un DEFECTO concreto, no que el código exista:
// revertir el arreglo tiene que poner uno rojo.
import test from 'node:test'
import assert from 'node:assert/strict'

import { atender } from './xsas-gateway.mjs'
import { normalizarPedido, PedidoInvalido } from './xsas-pedido.mjs'
import { filaDeTraza } from './xsas-traza.mjs'
import { toolsDelNucleo, ATAJOS, ATAJOS_EN_OBRA, argumentosPara } from './xsas-resolutores.mjs'
import { NIVEL } from './elegir-capacidad.mjs'

// ── DOBLES ────────────────────────────────────────────────────────────────────────────────────
function registroDoble(corridas) {
  const mapa = new Map([
    ['os.estado_empresa', {
      capability: 'drive.read',
      schema: { name: 'estado_empresa', input_schema: { type: 'object', properties: {} } },
      async run(a) { corridas.push(['os.estado_empresa', a]); return { resumen_texto: 'venimos así', semaforo: 'ambar' } },
    }],
    ['os.salud_obra', {
      capability: 'drive.read',
      schema: { name: 'salud_obra', input_schema: { type: 'object', properties: { obra: { type: 'string' } }, required: ['obra'] } },
      async run(a) { corridas.push(['os.salud_obra', a]); return { resumen_texto: `salud de ${a.obra}` } },
    }],
  ])
  return { mapa, porArchivo: new Map([['orquestador/lib/tools/os-data.mjs', ['os.estado_empresa', 'os.salud_obra']]]), fallaron: [] }
}

const iaEspia = (respuesta) => {
  const llamadas = []
  return {
    llamadas,
    pedirTexto: async (o) => {
      llamadas.push(o)
      if (respuesta instanceof Error) throw respuesta
      return { texto: 'respondió el modelo', modelo: 'modelo-x', proveedor: 'proveedor-x', tokens: { in: 10, out: 5 }, usd: 0.001, ms: 12, intentos: 1, fallbackDe: null, ...respuesta }
    },
  }
}

const ACTOR = { id: 'u-jorge', rol: 'direccion', permisos: ['drive.read'] }

// ── EL PEDIDO ─────────────────────────────────────────────────────────────────────────────────

test('un mensaje vacío no es un pedido, y el gateway NO lanza: devuelve el error como dato', async () => {
  const r = await atender({ actor: ACTOR, canal: 'app', mensaje: '   ' })
  assert.equal(r.ok, false)
  assert.equal(r.error.tipo, 'pedido_invalido')
  assert.match(r.error.mensaje, /mensaje vacío/)
})

test('sin actor el pedido se rechaza — un pedido anónimo no puede correr una tool', () => {
  assert.throws(() => normalizarPedido({ canal: 'app', mensaje: 'hola' }), PedidoInvalido)
})

test('EL DEFECTO: el navegador manda obra_id de otro. Sin firma del servidor se descarta y se DICE', async () => {
  const corridas = []
  const ia = iaEspia()
  const r = await atender(
    { actor: ACTOR, canal: 'app', intencion: 'os.estado_empresa', entidad: { obra_id: 'obra-ajena' } },
    { registro: registroDoble(corridas), catalogo: [], ia },
  )
  assert.equal(r.ok, true)
  assert.equal(r.estado, 'degradado')
  assert.match(r.degradacion, /contexto no verificado, ignorado: obra_id/)
})

test('con la firma del servidor, el contexto viaja y llega a la tool', async () => {
  const corridas = []
  const r = await atender(
    {
      actor: ACTOR, canal: 'app', intencion: 'os.salud_obra',
      contexto: { obra: 'San Francisco' }, entidad: { obra_id: 'o-1' }, verificado_por: 'app-server',
    },
    { registro: registroDoble(corridas), catalogo: [], ia: iaEspia() },
  )
  assert.equal(r.ok, true)
  assert.equal(r.estado, 'ok')
  assert.deepEqual(corridas[0], ['os.salud_obra', { obra: 'San Francisco' }])
})

// ── N0 · DETERMINÍSTICO, SIN UN TOKEN ─────────────────────────────────────────────────────────

test('(A) app.ecsas → XSAS → tool → respuesta SIN LLM', async () => {
  const corridas = []
  const ia = iaEspia()
  const r = await atender(
    { actor: ACTOR, canal: 'app', origen: '/dashboard', intencion: 'os.estado_empresa' },
    { registro: registroDoble(corridas), catalogo: [], ia },
  )
  assert.equal(r.ok, true)
  assert.equal(r.llm, null, 'una intención por su nombre NO puede pagar un modelo')
  assert.equal(ia.llamadas.length, 0)
  assert.equal(r.capacidades.nivel, NIVEL.DETERMINISTICO)
  assert.deepEqual(r.capacidades.tools, ['os.estado_empresa'])
  assert.equal(r.respuesta, 'venimos así')
  assert.deepEqual(r.datos, { resumen_texto: 'venimos así', semaforo: 'ambar' })
})

test('la frase exacta que ya sabemos qué significa tampoco paga un modelo', async () => {
  const corridas = []
  const ia = iaEspia()
  const r = await atender(
    { actor: ACTOR, canal: 'mattermost', mensaje: '¿Cómo venimos?' },
    { registro: registroDoble(corridas), catalogo: [], ia },
  )
  assert.equal(ia.llamadas.length, 0)
  assert.equal(r.capacidades.via, 'atajo_exacto')
  assert.equal(r.capacidades.nivel, NIVEL.DETERMINISTICO)
})

test('FALLA CERRADO: sin la capability en permisos la tool no corre', async () => {
  const corridas = []
  const r = await atender(
    { actor: { id: 'u-campo', rol: 'campo', permisos: [] }, canal: 'app', intencion: 'os.estado_empresa' },
    { registro: registroDoble(corridas), catalogo: [], ia: iaEspia() },
  )
  assert.equal(r.ok, false)
  assert.equal(r.error.tipo, 'sin_permiso')
  assert.equal(corridas.length, 0, 'la tool no se ejecutó')
})

test('una capacidad que no existe se dice, no se adivina con un modelo', async () => {
  const ia = iaEspia()
  const r = await atender(
    { actor: ACTOR, canal: 'timer', intencion: 'os.no_existe' },
    { registro: registroDoble([]), catalogo: [], ia },
  )
  assert.equal(r.error.tipo, 'capacidad_desconocida')
  assert.equal(ia.llamadas.length, 0)
})

// ── N1 · LA SKILL CON MOTOR ───────────────────────────────────────────────────────────────────

test('(H) una skill existente invocada desde el Gateway ejecuta SU tool, sin modelo', async () => {
  const corridas = []
  const ia = iaEspia()
  const catalogo = [{ clave: 'contabilidad-constructoras', modulos: ['orquestador/lib/tools/os-data.mjs'], tools: [] }]
  const elegir = () => ({ resolucion: 'determinista', skills: ['contabilidad-constructoras'], capacidades: ['advise.finance'], confianza: 'alta', motivo: 'doble' })
  const r = await atender(
    { actor: ACTOR, canal: 'app', mensaje: 'algo de plata', contexto: { obra: 'ARCOR' }, verificado_por: 'app-server' },
    { registro: registroDoble(corridas), catalogo, elegir, ia },
  )
  assert.equal(ia.llamadas.length, 0)
  assert.equal(r.capacidades.nivel, NIVEL.CAPACIDAD)
  assert.equal(r.capacidades.via, 'skill_con_motor')
  assert.deepEqual(r.capacidades.skills, ['contabilidad-constructoras'])
})

test('(27/08) el argumento que vino en la FRASE hace correr la tool que el contexto no podia llenar', async () => {
  // Antes: «analiza los planos de Quattropani» ruteaba bien, `argumentosPara` decia «falta
  // proyecto» y el gateway contestaba con un parrafo del modelo. Toda tool con parametros era
  // inalcanzable desde el chat.
  const corridas = []
  const catalogo = [{ clave: 'costos-presupuestacion', modulos: ['orquestador/lib/tools/plano.mjs'], tools: [] }]
  const elegir = () => ({ resolucion: 'determinista', skills: ['costos-presupuestacion'], capacidades: ['advise.estimating'], confianza: 'alta', motivo: 'doble' })
  // La extraccion usa `pedirTextoONull`, que devuelve el TEXTO pelado y no un objeto con `.texto`.
  const ia = { ...iaEspia(), pedirTextoONull: async () => '{"proyecto":"Quattropani"}' }
  const registro = registroDoble(corridas)
  registro.mapa.set('plano.cotizar', {
    capability: 'drive.read',
    schema: { name: 'analizar_planos_y_cotizar', input_schema: { type: 'object', properties: { proyecto: { type: 'string', description: 'cliente u obra' } }, required: ['proyecto'] } },
    async run(a) { corridas.push(['plano.cotizar', a]); return { resumen_texto: 'cotizacion de ' + a.proyecto } },
  })
  registro.porArchivo.set('orquestador/lib/tools/plano.mjs', ['plano.cotizar'])

  const r = await atender(
    { actor: ACTOR, canal: 'mattermost', mensaje: 'analiza los planos de Quattropani y armame una cotizacion', verificado_por: 'canal-mattermost' },
    { registro, catalogo, elegir, ia },
  )
  assert.equal(r.capacidades.via, 'skill_con_motor_argumento_de_la_frase')
  assert.deepEqual(corridas.at(-1), ['plano.cotizar', { proyecto: 'Quattropani' }])
  assert.match(r.respuesta, /cotizacion de Quattropani/)
})

test('(27/08) si el argumento NO esta en la frase, se escala como siempre: no se inventa', async () => {
  const corridas = []
  const catalogo = [{ clave: 'costos-presupuestacion', modulos: ['orquestador/lib/tools/plano.mjs'], tools: [] }]
  const elegir = () => ({ resolucion: 'determinista', skills: ['costos-presupuestacion'], capacidades: ['advise.estimating'], confianza: 'alta', motivo: 'doble' })
  const espia = iaEspia()
  const ia = { ...espia, pedirTextoONull: async () => '{"proyecto":null}' }
  const registro = registroDoble(corridas)
  registro.mapa.set('plano.cotizar', {
    capability: 'drive.read',
    schema: { name: 'analizar_planos_y_cotizar', input_schema: { type: 'object', properties: { proyecto: { type: 'string' } }, required: ['proyecto'] } },
    async run(a) { corridas.push(['plano.cotizar', a]); return { resumen_texto: 'no deberia correr' } },
  })
  registro.porArchivo.set('orquestador/lib/tools/plano.mjs', ['plano.cotizar'])

  const r = await atender(
    { actor: ACTOR, canal: 'mattermost', mensaje: 'armame una cotizacion', verificado_por: 'canal-mattermost' },
    { registro, catalogo, elegir, ia },
  )
  assert.ok(!corridas.some(([c]) => c === 'plano.cotizar'), 'la tool NO corre sin su argumento')
  assert.equal(espia.llamadas.length, 1, 'se contesta con el modelo, como antes')
  assert.ok(r.ok)
})

// ── N2 / N3 · EL MODELO, Y QUÉ PASA CUANDO NO ESTÁ ────────────────────────────────────────────

test('lo ambiguo escala al modelo y se registra QUIÉN respondió, no quién se pidió', async () => {
  const ia = iaEspia()
  const elegir = () => ({ resolucion: 'ambiguo', skills: [], capacidades: [], candidatas: ['a', 'b'], confianza: null, motivo: 'dos débiles' })
  const r = await atender(
    { actor: ACTOR, canal: 'app', mensaje: 'no se entiende qué quiere' },
    { registro: registroDoble([]), catalogo: [], elegir, ia },
  )
  assert.equal(ia.llamadas.length, 1)
  assert.equal(ia.llamadas[0].capacidad, 'complex', 'lo ambiguo va al modelo potente, no al barato')
  assert.equal(r.llm.proveedor, 'proveedor-x')
  assert.equal(r.llm.modelo, 'modelo-x')
  assert.equal(r.capacidades.nivel, NIVEL.RAZONAMIENTO)
})

test('(E) el primario falla y contesta el fallback: la respuesta dice de quién venía', async () => {
  const ia = iaEspia({ proveedor: 'openai-compatible', modelo: 'alt-1', fallbackDe: 'anthropic' })
  const elegir = () => ({ resolucion: 'ambiguo', skills: [], capacidades: [], candidatas: ['a', 'b'], confianza: null, motivo: 'dos débiles' })
  const r = await atender(
    { actor: ACTOR, canal: 'app', mensaje: 'algo ambiguo' },
    { registro: registroDoble([]), catalogo: [], elegir, ia },
  )
  assert.equal(r.ok, true)
  assert.equal(r.llm.proveedor, 'openai-compatible')
  assert.equal(r.llm.fallbackDe, 'anthropic')
  assert.equal(filaDeTraza(normalizarPedido({ actor: ACTOR, canal: 'app', mensaje: 'x' }), r).fallback_de, 'anthropic')
})

test('(F) TODOS los proveedores caídos: no rompe, degrada y dice qué sigue andando', async () => {
  const err = Object.assign(new Error('402 sin saldo'), { clasificacion: { kind: 'credit', hard: true } })
  const ia = iaEspia(err)
  const elegir = () => ({ resolucion: 'ambiguo', skills: [], capacidades: [], candidatas: ['a', 'b'], confianza: null, motivo: 'dos débiles' })
  const r = await atender(
    { actor: ACTOR, canal: 'mattermost', mensaje: 'algo ambiguo' },
    { registro: registroDoble([]), catalogo: [], elegir, ia },
  )
  assert.equal(r.ok, true, 'el OS no se cae porque se cayó el proveedor')
  assert.equal(r.estado, 'degradado')
  assert.match(r.degradacion, /sin razonador \(credit\)/)
  assert.match(r.respuesta, /los cálculos, el SQL y las reglas de negocio/)
})

test('(F) con TODOS los LLM caídos, lo determinístico sigue contestando igual', async () => {
  const corridas = []
  const err = Object.assign(new Error('502'), { clasificacion: { kind: 'server' } })
  const r = await atender(
    { actor: ACTOR, canal: 'worker', intencion: 'os.estado_empresa' },
    { registro: registroDoble(corridas), catalogo: [], ia: iaEspia(err) },
  )
  assert.equal(r.ok, true)
  assert.equal(r.estado, 'ok')
  assert.equal(r.respuesta, 'venimos así')
})

// ── (B)(P) LAS DOS CARAS, EL MISMO CORE ───────────────────────────────────────────────────────

test('(B)(P) app.ecsas y Mattermost comparten Core: mismo pedido, misma capacidad, misma respuesta', async () => {
  const corridas = []
  const comun = { registro: registroDoble(corridas), catalogo: [], ia: iaEspia() }
  const app = await atender({ actor: ACTOR, canal: 'app', origen: '/obras/1', mensaje: '¿cómo venimos?' }, comun)
  const mm = await atender({ actor: ACTOR, canal: 'mattermost', origen: 'direccion', mensaje: '¿cómo venimos?' }, comun)
  assert.deepEqual(app.capacidades.tools, mm.capacidades.tools)
  assert.equal(app.capacidades.nivel, mm.capacidades.nivel)
  assert.equal(app.respuesta, mm.respuesta)
  assert.notEqual(app.correlationId, mm.correlationId, 'cada pedido tiene su propio hilo de seguimiento')
  assert.equal(app.canal, 'app')
  assert.equal(mm.canal, 'mattermost')
})

// ── TRAZABILIDAD ──────────────────────────────────────────────────────────────────────────────

test('la traza distingue el pedido que pagó modelo del que no — es toda la medida', async () => {
  const corridas = []
  const p = normalizarPedido({ actor: ACTOR, canal: 'app', intencion: 'os.estado_empresa' })
  const sinModelo = await atender({ ...p, actor: ACTOR, canal: 'app', intencion: 'os.estado_empresa' }, { registro: registroDoble(corridas), catalogo: [], ia: iaEspia() })
  const fila = filaDeTraza(p, sinModelo)
  assert.equal(fila.llm, false)
  assert.equal(fila.modelo, null)
  assert.equal(fila.nivel, NIVEL.DETERMINISTICO)
  assert.deepEqual(fila.tools, ['os.estado_empresa'])
  assert.equal(fila.canal, 'app')
  assert.equal(fila.actor_rol, 'direccion')
})

// ── EL REGISTRO REAL ──────────────────────────────────────────────────────────────────────────

test('los atajos apuntan a tools que EXISTEN en el registro real (un atajo huérfano no rutea nada)', async () => {
  const { mapa, fallaron } = await toolsDelNucleo({ refrescar: true })
  assert.deepEqual(fallaron, [], 'ninguna fábrica de tools del núcleo puede fallar al importarse')
  for (const [frase, clave] of Object.entries({ ...ATAJOS, ...ATAJOS_EN_OBRA })) {
    assert.ok(mapa.has(clave), `el atajo "${frase}" apunta a ${clave}, que no está en el registro`)
  }
})

test('el contexto no puede inyectar un parámetro que la tool no declaró', () => {
  const tool = { schema: { input_schema: { type: 'object', properties: { obra: { type: 'string' } }, required: ['obra'] } } }
  // Con firma: `obra` entra porque la tool la declara; `borrar_todo` no, porque no la declara.
  const { args, falta } = argumentosPara(tool, { contexto: { obra: 'ARCOR', borrar_todo: true }, entidad: {}, verificadoPor: 'app-server' })
  assert.deepEqual(args, { obra: 'ARCOR' })
  assert.deepEqual(falta, [])
  // Y SIN firma no entra ninguno (27/08/2026, auditoría round 3): que la tool declare el parámetro
  // dice que lo acepta, no que quien lo manda pueda elegirlo.
  const sinFirma = argumentosPara(tool, { contexto: { obra: 'ARCOR' }, entidad: {} })
  assert.deepEqual(sinFirma.args, {})
  assert.deepEqual(sinFirma.falta, ['obra'])
})

// ── EL CONTEXTO DE PANTALLA CAMBIA QUÉ SIGNIFICA LA PREGUNTA ──────────────────────────────────

test('parado en una obra, «¿cómo venimos?» lee ESA obra y no la empresa', async () => {
  const corridas = []
  const r = await atender({
    actor: { id: 'u1', rol: 'DUENO', permisos: ['drive.read'] },
    canal: 'app',
    mensaje: '¿cómo venimos?',
    entidad: { obra_id: 'o-1' },
    contexto: { obra: 'PLAYÓN DE AZUFRE' },
    verificado_por: 'app-server',
  }, { registro: registroDoble(corridas), catalogo: [], ia: iaEspia() })
  assert.equal(r.ok, true)
  assert.deepEqual(corridas, [['os.salud_obra', { obra: 'PLAYÓN DE AZUFRE' }]])
  assert.equal(r.capacidades.via, 'atajo_en_obra')
})

test('sin obra en la pantalla, la misma frase sigue leyendo la empresa', async () => {
  const corridas = []
  const r = await atender({
    actor: { id: 'u1', rol: 'DUENO', permisos: ['drive.read'] },
    canal: 'app', mensaje: '¿cómo venimos?',
  }, { registro: registroDoble(corridas), catalogo: [], ia: iaEspia() })
  assert.equal(r.ok, true)
  assert.deepEqual(corridas, [['os.estado_empresa', {}]])
})

test('con obra pero SIN el nombre, no se rompe: cae en la lectura de empresa', async () => {
  // El `obra_id` viaja verificado pero el nombre no llegó. `os.salud_obra` pide `obra` y no lo
  // tiene: antes que devolver «falta obra», se contesta lo que sí se puede contestar.
  const corridas = []
  const r = await atender({
    actor: { id: 'u1', rol: 'DUENO', permisos: ['drive.read'] },
    canal: 'app', mensaje: 'cómo venimos',
    entidad: { obra_id: 'o-1' },
    verificado_por: 'app-server',
  }, { registro: registroDoble(corridas), catalogo: [], ia: iaEspia() })
  assert.equal(r.ok, true)
  assert.deepEqual(corridas, [['os.estado_empresa', {}]])
})

test('sin permiso para la lectura por obra, la pregunta no falla: cae en la de empresa', async () => {
  const corridas = []
  const r = await atender({
    actor: { id: 'u1', rol: 'CAMPO', permisos: [] },
    canal: 'app', mensaje: 'cómo venimos',
    entidad: { obra_id: 'o-1' }, contexto: { obra: 'PLAYÓN DE AZUFRE' },
    verificado_por: 'app-server',
  }, { registro: registroDoble(corridas), catalogo: [], ia: iaEspia() })
  // No corre la de obra; la de empresa tampoco, porque este actor tampoco tiene `drive.read`.
  assert.deepEqual(corridas, [])
  assert.equal(r.ok, false)
  assert.equal(r.error.tipo, 'sin_permiso')
})

// ── LA ESCRITURA EN DRIVE: DOS CERRADURAS Y UNA FIRMA ─────────────────────────────────────────

function registroConEscritura(corridas, { falla = false } = {}) {
  const mapa = new Map([
    ['slides.crear', {
      capability: 'drive.write',
      schema: { name: 'crear_presentacion_google_slides', input_schema: { type: 'object', properties: {} } },
      async run(a) {
        corridas.push(['slides.crear', a])
        if (falla) throw new Error('Google dijo que no')
        return { ok: true, id: 'ARCHIVO-1', link: 'https://docs.google.com/presentation/d/ARCHIVO-1/edit' }
      },
    }],
    // Una tool que declara la MISMA capability y NO está en la lista de autorizadas.
    ['otra.escribe', {
      capability: 'drive.write',
      schema: { name: 'otra_que_escribe', input_schema: { type: 'object', properties: {} } },
      async run(a) { corridas.push(['otra.escribe', a]); return { ok: true } },
    }],
  ])
  return { mapa, porArchivo: new Map(), fallaron: [] }
}

test('una tool NO nombrada en la lista de autorizadas no escribe aunque el actor tenga drive.write', async () => {
  const corridas = []
  const r = await atender({
    actor: { id: 'u1', rol: 'DUENO', permisos: ['drive.write'] },
    canal: 'app', intencion: 'otra.escribe',
  }, { registro: registroConEscritura(corridas), catalogo: [], ia: iaEspia() })
  assert.deepEqual(corridas, [])
  assert.equal(r.ok, false)
  assert.equal(r.error.tipo, 'sin_permiso')
})

test('la tool autorizada sí escribe, y la escritura queda firmada con actor, archivo y correlation id', async () => {
  const corridas = []
  const filas = []
  const r = await atender({
    actor: { id: 'u1', nombre: 'Jorge', rol: 'DUENO', permisos: ['drive.write'] },
    canal: 'app', intencion: 'slides.crear', correlation_id: 'corr-9',
  }, {
    registro: registroConEscritura(corridas), catalogo: [], ia: iaEspia(),
    query: async (sql, args) => { if (/xsas_escritura/.test(sql)) filas.push(args); return { rows: [] } },
  })
  assert.equal(r.ok, true)
  assert.equal(filas.length, 1)
  const [correlation, actorId, nombre, rol, canal, tool, cap, archivoId, link, resultado] = filas[0]
  assert.equal(correlation, 'corr-9')
  assert.equal(actorId, 'u1')
  assert.equal(nombre, 'Jorge')
  assert.equal(rol, 'DUENO')
  assert.equal(canal, 'app')
  assert.equal(tool, 'slides.crear')
  assert.equal(cap, 'drive.write')
  assert.equal(archivoId, 'ARCHIVO-1')
  assert.ok(link.includes('ARCHIVO-1'))
  assert.equal(resultado, 'ok')
})

test('la firma encuentra el archivo aunque la tool lo nombre distinto', async () => {
  // `imagen.generar` devuelve `{archivo:{id}, drive_url}` en vez de `{id, link}`: con un solo nombre
  // dieciocho escrituras reales quedaron con el archivo en NULL.
  const filas = []
  const mapa = new Map([['imagen.generar', {
    capability: 'drive.write',
    schema: { name: 'generar_imagen', input_schema: { type: 'object', properties: {} } },
    async run() { return { ok: true, archivo: { id: 'IMG-9' }, drive_url: 'https://drive.google.com/file/d/IMG-9/view' } },
  }]])
  await atender({
    actor: { id: 'u1', rol: 'DUENO', permisos: ['drive.write'] },
    canal: 'app', intencion: 'imagen.generar',
  }, {
    registro: { mapa, porArchivo: new Map(), fallaron: [] }, catalogo: [], ia: iaEspia(),
    query: async (sql, args) => { if (/xsas_escritura/.test(sql)) filas.push(args); return { rows: [] } },
  })
  assert.equal(filas.length, 1)
  assert.equal(filas[0][7], 'IMG-9', 'el archivo tiene que quedar en la fila')
  assert.match(filas[0][8], /IMG-9/)
})

test('una escritura que FALLA también queda firmada — el intento es lo que hay que poder auditar', async () => {
  const filas = []
  await atender({
    actor: { id: 'u1', rol: 'DUENO', permisos: ['drive.write'] },
    canal: 'app', intencion: 'slides.crear',
  }, {
    registro: registroConEscritura([], { falla: true }), catalogo: [], ia: iaEspia(),
    query: async (sql, args) => { if (/xsas_escritura/.test(sql)) filas.push(args); return { rows: [] } },
  })
  assert.equal(filas.length, 1)
  assert.equal(filas[0][9], 'error')
})

test('una LECTURA no deja fila en el registro de escrituras', async () => {
  const filas = []
  await atender({
    actor: { id: 'u1', rol: 'DUENO', permisos: ['drive.read'] },
    canal: 'app', mensaje: 'cómo venimos',
  }, {
    registro: registroDoble([]), catalogo: [], ia: iaEspia(),
    query: async (sql, args) => { if (/xsas_escritura/.test(sql)) filas.push(args); return { rows: [] } },
  })
  assert.deepEqual(filas, [])
})

test('si la obra de la pantalla no existe para la lectura por obra, contesta la empresa y lo DICE', async () => {
  const corridas = []
  const mapa = new Map([
    ['os.estado_empresa', {
      capability: 'drive.read',
      schema: { name: 'estado_empresa', input_schema: { type: 'object', properties: {} } },
      async run(a) { corridas.push(['os.estado_empresa', a]); return { resumen_texto: 'venimos así' } },
    }],
    ['os.salud_obra', {
      capability: 'drive.read',
      schema: { name: 'salud_obra', input_schema: { type: 'object', properties: { obra: { type: 'string' } }, required: ['obra'] } },
      // Así contesta la tool real cuando el nombre no está en su universo: ok, con `error` adentro.
      async run(a) { corridas.push(['os.salud_obra', a]); return { error: `"${a.obra}" no resuelve a una obra` } },
    }],
  ])
  const r = await atender({
    actor: { id: 'u1', rol: 'DUENO', permisos: ['drive.read'] },
    canal: 'app', mensaje: 'cómo venimos',
    entidad: { obra_id: 'o-1' }, contexto: { obra: 'PLAYÓN DE AZUFRE' },
    verificado_por: 'app-server',
  }, { registro: { mapa, porArchivo: new Map(), fallaron: [] }, catalogo: [], ia: iaEspia() })
  assert.equal(r.ok, true)
  assert.equal(r.estado, 'degradado')
  assert.match(r.degradacion, /PLAYÓN DE AZUFRE/)
  assert.deepEqual(corridas.map((c) => c[0]), ['os.salud_obra', 'os.estado_empresa'])
})

test('una tool que devuelve {error} SIN lanzar queda firmada como error, no como ok', async () => {
  // `imagen.generar` nunca lanza: devuelve `{error: …}`. La firma miraba sólo la excepción y
  // diecinueve escrituras reales quedaron registradas como «ok».
  const filas = []
  const mapa = new Map([['imagen.generar', {
    capability: 'drive.write',
    schema: { name: 'generar_imagen', input_schema: { type: 'object', properties: {} } },
    async run() { return { error: 'no pude generar la imagen: sin proveedor' } },
  }]])
  await atender({
    actor: { id: 'u1', rol: 'DUENO', permisos: ['drive.write'] },
    canal: 'app', intencion: 'imagen.generar',
  }, {
    registro: { mapa, porArchivo: new Map(), fallaron: [] }, catalogo: [], ia: iaEspia(),
    query: async (sql, args) => { if (/xsas_escritura/.test(sql)) filas.push(args); return { rows: [] } },
  })
  assert.equal(filas.length, 1)
  assert.equal(filas[0][9], 'error')
  assert.match(filas[0][10], /sin proveedor/)
})

test('un {ok:false} del motor también se firma como error', async () => {
  const filas = []
  const mapa = new Map([['imagen.generar', {
    capability: 'drive.write',
    schema: { name: 'generar_imagen', input_schema: { type: 'object', properties: {} } },
    async run() { return { ok: false, falta: 'credencial', motivo: 'sin cuenta de Cloudflare' } },
  }]])
  await atender({
    actor: { id: 'u1', rol: 'DUENO', permisos: ['drive.write'] },
    canal: 'app', intencion: 'imagen.generar',
  }, {
    registro: { mapa, porArchivo: new Map(), fallaron: [] }, catalogo: [], ia: iaEspia(),
    query: async (sql, args) => { if (/xsas_escritura/.test(sql)) filas.push(args); return { rows: [] } },
  })
  assert.equal(filas[0][9], 'error')
  assert.match(filas[0][10], /Cloudflare/)
})
