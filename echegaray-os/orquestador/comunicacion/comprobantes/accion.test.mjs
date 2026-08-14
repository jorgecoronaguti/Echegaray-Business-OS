// LOS BOTONES Y LA ESCRITURA. Sin red, sin Postgres y SIN TOCAR EL SHEET REAL.
//
// El cargador nunca se corre acá: `escribirFajo` recibe una corrida de mentira. Correr el cargador
// de verdad para "probar que anda" es exactamente lo que ya borró trabajo del dueño tres veces.

// ═══ ESTE ARCHIVO CORRE EN LA CONFIGURACIÓN DE PRODUCCIÓN (14/08) ═══
//
// Tenía `process.env.ORQ_COMPROBANTES_BOTONES = '1'` en la línea 16, que encendía las tarjetas para
// los 59 tests aunque producción corra sin esa variable. Sólo 5 dependen de los botones y son los que
// usan `testConBotones`; los otros 54 —escritura, reservas, idempotencia, freno de mano— corren como
// corre el bot. Ver `lib/comprobantes/botones-de-prueba.mjs`.

import test from 'node:test'
import { testConBotones } from '../../lib/comprobantes/botones-de-prueba.mjs'
import assert from 'node:assert/strict'
import { crearManejadorComprobantes, indiceACorregir } from './accion.mjs'
import { escribirFajo, correrCargador, aFajoJson, aIso, filaDeRegistro } from './escritura.mjs'
import { aplicarCorreccion, elementosDe, dialogoCorreccion, leerEstado, MAX_ELEMENTOS } from './dialogo.mjs'
import { repoMemoria, portGuarda, mmFalso } from './dobles.mjs'
import { ESTADO } from '../../lib/comprobantes/fajo.mjs'
import { congelado, RUTA_MARCA } from '../../lib/congelador-sheets.mjs'

const SECRETO = 'un-secreto-largo-de-verdad'
const URL = `https://chat.ecsas.com.ar/comprobantes/accion?t=${SECRETO}`
const OBRAS = ['Estrella', 'San Francisco', 'Messina']

const item = (o = {}) => ({
  clave: o.clave ?? 'c:30712345678|0113-00010489',
  proveedorNuevo: o.proveedorNuevo ?? false,
  comprobante: {
    proveedor: 'Combustibles Barcelo', cuit: '30712345678', tipo: 'A', numero: '0113-00010489',
    fecha: '05/01/2026', total: 36460.30, iva: 5981, obra: 'Estrella', esNotaCredito: false,
    ...(o.comprobante ?? {}),
  },
})

async function conFajo({ items = [item()], estado = ESTADO.ABIERTO } = {}) {
  const repo = repoMemoria()
  const f = await repo.abrirFajo(null, {
    userId: 'u_rodrigo', channelId: 'c_comprobantes', rootPostId: 'p1', postId: 'p1', items,
  })
  if (estado !== ESTADO.ABIERTO) await repo.cerrarFajo(null, { id: f.id, estado })
  repo._fajos.get(f.id).aviso_post_id = 'post_bot'
  return { repo, fajo: repo._fajos.get(f.id) }
}

function manejador({ repo, escribir, mm = mmFalso(), port = portGuarda(), secreto = SECRETO } = {}) {
  return {
    mm,
    manejar: crearManejadorComprobantes({ port, mattermost: mm, secreto, url: URL, repo, escribir, obrasDe: async () => OBRAS }),
  }
}

/**
 * Los dos estados del FRENO DE MANO, inyectados.
 *
 * Hace falta de verdad: en esta máquina la marca real está PUESTA (el dueño congeló la escritura de
 * Sheets), y `RUTA_MARCA` se evalúa al importar el módulo, así que pisar la variable de entorno
 * después no cambia nada. Sin esta costura, los tests de escritura darían "encolado" y pasarían o
 * fallarían según el filesystem de quien los corre — un test cuyo resultado depende de eso no prueba
 * nada. El default de producción sigue siendo el freno real; hay un test más abajo que lo verifica.
 */
const SIN_HIELO = () => null
const CON_HIELO = () => 'escritura de Sheets congelada por pedido del dueño'

const click = (fajoId, accion, extra = {}) => ({
  user_id: 'u_rodrigo', channel_id: 'c_comprobantes', channel_type: 'P', post_id: 'post_bot',
  trigger_id: 'trig1', context: { accion, fajo_id: fajoId }, _secreto: SECRETO, ...extra,
})

// ── El secreto ───────────────────────────────────────────────────────────────

test('sin el secreto de la integración no se atiende NADA', async () => {
  const { repo, fajo } = await conFajo()
  let escribio = false
  const { manejar } = manejador({ repo, escribir: async () => { escribio = true; return {} } })
  const r = await manejar({ ...click(fajo.id, 'confirmar'), _secreto: 'otro' })
  assert.match(r.body.ephemeral_text, /No pude verificar/)
  assert.equal(escribio, false)
  assert.equal(repo._fajos.get(fajo.id).estado, ESTADO.ABIERTO, 'el fajo no se movió')
})

test('sin secreto CONFIGURADO tampoco se atiende: falla cerrado en los dos sentidos', async () => {
  const { repo, fajo } = await conFajo()
  const { manejar } = manejador({ repo, secreto: null, escribir: async () => ({}) })
  const r = await manejar(click(fajo.id, 'confirmar'))
  assert.match(r.body.ephemeral_text, /todavía no está configurada/)
})

test('un click con secreto válido pero desde un canal ajeno se deniega', async () => {
  const { repo, fajo } = await conFajo()
  const { manejar } = manejador({ repo, port: portGuarda({ canalOk: false }), escribir: async () => ({}) })
  const r = await manejar(click(fajo.id, 'confirmar'))
  assert.match(r.body.ephemeral_text, /canal de comprobantes/)
})

test('con secreto válido pero sin grant NI membresía del canal, tampoco', async () => {
  const { repo, fajo } = await conFajo()
  const { manejar } = manejador({ repo, port: portGuarda({ permisoOk: false }), escribir: async () => ({}) })
  const r = await manejar(click(fajo.id, 'confirmar'))
  assert.match(r.body.ephemeral_text, /No pude habilitarte/)
})

// El pedido del dueño (03/08): el click de alguien agregado al canal tiene que funcionar sin que
// nadie corra un script de permisos. Si se revierte la segunda vía, esto vuelve a "No pude
// habilitarte" y se pone rojo.
test('un click de alguien que está EN EL CANAL entra sin grant', async () => {
  const { repo, fajo } = await conFajo()
  const { manejar } = manejador({
    repo, port: portGuarda({ permisoOk: false }), escribir: async () => ({ ok: true, fila: 7 }),
    mm: mmFalso({ miembros: { c_comprobantes: ['u_rodrigo'] } }),
  })
  const r = await manejar(click(fajo.id, 'confirmar'))
  assert.doesNotMatch(String(r.body.ephemeral_text ?? ''), /No pude habilitarte/)
})

// ── Confirmar una sola vez ───────────────────────────────────────────────────

test('DOS CLICKS en Confirmar cargan UNA vez', async () => {
  const { repo, fajo } = await conFajo()
  let veces = 0
  const escribir = async () => { veces++; return { estado: ESTADO.CARGADO, texto: '✔ fila 412' } }
  const { manejar } = manejador({ repo, escribir })
  const a = await manejar(click(fajo.id, 'confirmar'))
  const b = await manejar(click(fajo.id, 'confirmar'))
  assert.equal(veces, 1, 'el segundo click no vuelve a escribir')
  assert.match(a.body.ephemeral_text, /Cargado/)
  assert.match(b.body.ephemeral_text, /ya se están cargando|ya se cerró/)
})

test('confirmar un fajo que no existe no explota', async () => {
  const { repo } = await conFajo()
  const { manejar } = manejador({ repo, escribir: async () => ({}) })
  const r = await manejar(click('fajo_inexistente', 'confirmar'))
  assert.match(r.body.ephemeral_text, /ya no está disponible/)
})

test('Descartar cierra el fajo y no carga nada', async () => {
  const { repo, fajo } = await conFajo()
  const { manejar, mm } = manejador({ repo, escribir: async () => { throw new Error('no debería escribir') } })
  const r = await manejar(click(fajo.id, 'descartar'))
  assert.equal(repo._fajos.get(fajo.id).estado, ESTADO.DESCARTADO)
  assert.match(r.body.ephemeral_text, /Descartado/)
  assert.equal(repo._cargados.size, 0)
  assert.match(mm.posts.at(-1).message, /Descartado/, 'el mensaje del canal se reescribe')
})

// ── La escritura ─────────────────────────────────────────────────────────────

test('escritura OK: se contesta la FILA y se anota la trazabilidad del post', async () => {
  const { repo, fajo } = await conFajo()
  const correr = async ({ fajo: json }) => {
    assert.equal(json.length, 1)
    assert.equal(json[0].total, 36460.30, 'el total viaja al cargador; él deriva M = Total − IVA')
    assert.equal(json[0].neto, undefined, 'nunca se manda el neto crudo: reintroduciría el defecto')
    return { ok: true, datos: { ok: true, desde: 412, hasta: 412, escritas: 1, filas: [{ i: 0, fila: 412, proveedor: 'Combustibles Barcelo' }] } }
  }
  const r = await escribirFajo({ port: null, repo, correr, congelado: SIN_HIELO }, fajo)
  assert.equal(r.estado, ESTADO.CARGADO)
  assert.match(r.texto, /fila 412/)
  const c = repo._cargados.get('c:30712345678|0113-00010489')
  assert.equal(c.fila, 412)
  assert.equal(c.post_id, 'p1', 'queda de qué post de Mattermost salió la fila')
})

test('CARGADO SIN OBRA: se dice con todas las letras, con su fila y con la columna (03/08 · 13/08)', async () => {
  // La obra dejó de bloquear, y eso no puede pasar en silencio: una fila sin imputar entra al Flujo
  // de Caja con el rubro sin clasificar, y la única forma de que alguien la complete es enterarse de
  // que existe. La fila va en el mensaje para que completarla sea ir a esa línea, no buscarla.
  //
  // 13/08: el aviso nombra la COLUMNA además de la fila. Desde que la imputación no pregunta, este
  // renglón es lo único que queda entre una celda en blanco y nadie que la complete.
  const { repo, fajo } = await conFajo({ items: [item({ comprobante: { obra: null } })] })
  const correr = async ({ fajo: json }) => {
    assert.equal(json.length, 1, 'el que no tiene obra igual se manda al cargador')
    return { ok: true, datos: { ok: true, escritas: 1, filas: [{ i: 0, fila: 413 }] } }
  }
  const r = await escribirFajo({ port: null, repo, correr, congelado: SIN_HIELO }, fajo)
  assert.equal(r.estado, ESTADO.CARGADO)
  assert.match(r.texto, /imputación por completar/)
  // 14/08: el renglón identifica el comprobante por su CONTENIDO —proveedor, importe y fecha— y no
  // sólo por la fila. El dueño reconoce «$36.460 del 05/01»; el número de fila todavía no lo vio.
  assert.match(r.texto, /fila 413 \(Combustibles Barcelo \$36\.460 del 05\/01\) → falta .*Obra \(J\)/)
  assert.doesNotMatch(r.texto, /Estrella/, 'no se inventa una obra que el comprobante no dice')
})

test('EL RESUMEN LLEVA LA PLATA: cuántas filas y cuánto suman', async () => {
  // Contar filas no le dice al dueño si se le perdió una factura de dos millones. El total es el
  // número contra el que compara el fajo de papeles que tiene en la mano.
  const { repo, fajo } = await conFajo({
    items: [
      item({ comprobante: { total: 36460.30 } }),
      item({ clave: 'c:30712345678|0113-00010490', comprobante: { numero: '0113-00010490', total: 121000, iva: 21000 } }),
    ],
  })
  const correr = async () => ({ ok: true, datos: { ok: true, escritas: 2, filas: [{ i: 0, fila: 412 }, { i: 1, fila: 413 }] } })
  const r = await escribirFajo({ port: null, repo, correr, congelado: SIN_HIELO }, fajo)
  assert.match(r.texto, /2 comprobante\(s\) en \*\*Compras\*\* — total \$157\.460/)
})

test('UN ARCHIVO CON VARIOS COMPROBANTES: entró uno y se dice cuál, para que el resto no se dé por cargado', async () => {
  const uno = item({ comprobante: { variosComprobantes: true, cuantosComprobantes: 3 } })
  uno.origen = { fileId: 'f1', nombre: 'IMG_7530.jpg' }
  const { repo, fajo } = await conFajo({ items: [uno] })
  const correr = async () => ({ ok: true, datos: { ok: true, escritas: 1, filas: [{ i: 0, fila: 412 }] } })
  const r = await escribirFajo({ port: null, repo, correr, congelado: SIN_HIELO }, fajo)
  assert.match(r.texto, /IMG_7530\.jpg\*\* tenía 3 comprobantes: cargué sólo el de la fila 412/)
  assert.match(r.texto, /fotos separadas/)
})

test('CON OBRA no aparece la advertencia de obra: sólo se avisa lo que quedó incompleto', async () => {
  const { repo, fajo } = await conFajo()
  const correr = async () => ({ ok: true, datos: { ok: true, escritas: 1, filas: [{ i: 0, fila: 412 }] } })
  const r = await escribirFajo({ port: null, repo, correr, congelado: SIN_HIELO }, fajo)
  assert.doesNotMatch(r.texto, /Obra \(J\)/)
})

test('un comprobante que YA estaba cargado no se manda al cargador', async () => {
  const { repo, fajo } = await conFajo()
  repo._cargados.set('c:30712345678|0113-00010489', { clave: 'c:30712345678|0113-00010489', fila: 99 })
  let corrio = false
  const correr = async () => { corrio = true; return { ok: true, datos: {} } }
  const r = await escribirFajo({ port: null, repo, correr, congelado: SIN_HIELO }, fajo)
  assert.equal(corrio, false)
  assert.match(r.texto, /ya estaban cargados/)
})

// ═══ EL TIQUE DE BARCELO DEL 03/08 — EL PEOR MODO DE FALLA QUE TUVO ESTE MÓDULO ═══
//
// Un comprobante SIN CLAVE nunca vuelve de `reservarClaves` (la columna es NOT NULL y
// `registrarCargados` saltea la fila en silencio). Eso caía en la misma rama que "la clave ya estaba
// en la tabla": el bot contestaba "ya estaban cargados. No los dupliqué.", cerraba el fajo como
// CARGADO con `filas: []`, y el gasto NO QUEDABA EN NINGÚN LADO. Medido en producción el 04/08: el
// fajo cerró `cargado`, `comunicacion.comprobantes_cargados` estaba VACÍA —o sea que no había con
// qué haber deduplicado— y Compras no tenía la fila.
//
// Declarar éxito sin escribir es peor que fallar: nadie va a buscar lo que el sistema dijo que hizo.
test('un comprobante SIN CLAVE no se declara cargado: falla fuerte y no se escribe nada', async () => {
  const { repo, fajo } = await conFajo({
    // La visión no leyó "TIQUE FACTURA A": sin letra no hay clave. Todo lo demás está.
    // "S/N" pasa la política del chat —`numero` no está vacío— pero `numeroCanonico` no saca un
    // correlativo de ahí: no hay con qué deduplicar. Es el único agujero que le queda al invariante
    // "todo lo cargable es identificable", y por eso la guarda tiene que seguir estando.
    // `clave: null` se pone DESPUÉS del helper a propósito: su `??` trataría el null como "no lo
    // pasaste" y pondría la clave de siempre — el test pasaría sin probar nada.
    items: [{ ...item({ comprobante: { numero: 'S/N', total: 60000.02 } }), clave: null }],
  })
  let corrio = false
  const correr = async () => { corrio = true; return { ok: true, datos: { ok: true, escritas: 1, filas: [{ i: 0, fila: 810 }] } } }
  const r = await escribirFajo({ port: null, repo, correr, congelado: SIN_HIELO }, fajo)

  assert.equal(r.estado, ESTADO.ERROR, 'no es un éxito')
  assert.doesNotMatch(r.texto, /ya estaban cargados/, 'NO se lo confunde con un duplicado')
  assert.match(r.texto, /No cargué nada/)
  assert.match(r.texto, /el número/, 'dice QUÉ falta, para que se pueda contestar')
  assert.match(r.texto, /Corregir/, 'y cómo salir')
  assert.equal(corrio, false, 'no se gasta una corrida del cargador')
  assert.equal(repo._cargados.size, 0)
  assert.equal(repo._fajos.get(fajo.id).estado, ESTADO.ABIERTO, 'se puede corregir y reintentar')
})

// La otra mitad del par: cuando SÍ es un duplicado, se sigue diciendo que lo es — y ahora con la
// fila, que es lo que permite ir a mirarlo. Un mensaje que no se puede verificar no es una respuesta.
test('el duplicado de verdad dice EN QUÉ FILA está', async () => {
  const { repo, fajo } = await conFajo()
  repo._cargados.set('c:30712345678|0113-00010489', { clave: 'c:30712345678|0113-00010489', fila: 412 })
  const r = await escribirFajo({ port: null, repo, correr: async () => ({ ok: true, datos: {} }), congelado: SIN_HIELO }, fajo)
  assert.equal(r.estado, ESTADO.CARGADO)
  assert.match(r.texto, /fila 412 de Compras/)
})

test('si el cargador falla SIN escribir, se sueltan las reservas y el fajo vuelve a abierto', async () => {
  const { repo, fajo } = await conFajo()
  const correr = async () => ({ ok: false, error: 'no anduvo', datos: { ok: false, escritas: 0 } })
  const r = await escribirFajo({ port: null, repo, correr, congelado: SIN_HIELO }, fajo)
  assert.equal(r.estado, ESTADO.ERROR)
  assert.equal(repo._cargados.size, 0, 'la clave no queda ocupada por una carga que no ocurrió')
  assert.equal(repo._fajos.get(fajo.id).estado, ESTADO.ABIERTO, 'se puede reintentar')
})

test('si NO se sabe si escribió, la reserva se DEJA puesta y se avisa que revisen Compras', async () => {
  const { repo, fajo } = await conFajo()
  const correr = async () => ({ ok: false, error: 'se cortó a mitad' }) // sin `escritas`
  const r = await escribirFajo({ port: null, repo, correr, congelado: SIN_HIELO }, fajo)
  assert.equal(repo._cargados.size, 1, 'ante la duda no se suelta: un duplicado en el Flujo no se ve')
  assert.match(r.texto, /Revisá Compras antes de reintentar/)
})

test('el cargador dice "protegido": se traduce a que no se escribió nada', async () => {
  const { repo, fajo } = await conFajo()
  const correr = async () => ({ ok: false, datos: { ok: false, motivo: 'protegido', congelado: true, escritas: 0 } })
  const r = await escribirFajo({ port: null, repo, correr, congelado: SIN_HIELO }, fajo)
  assert.match(r.texto, /congelada/)
  assert.equal(repo._cargados.size, 0)
})

// ── El freno de mano ─────────────────────────────────────────────────────────

test('CON EL FRENO DE MANO PUESTO no se escribe: se dice y se encola', async () => {
  const { repo, fajo } = await conFajo()
  let corrio = false
  const r = await escribirFajo({
    port: null, repo, congelado: CON_HIELO,
    correr: async () => { corrio = true; return { ok: true } },
  }, fajo)
  assert.equal(corrio, false, 'ni siquiera se arranca el cargador')
  assert.equal(r.estado, ESTADO.ENCOLADO)
  assert.match(r.texto, /congelada/)
  assert.equal(repo._cargados.size, 0, 'no se reservan claves de una carga que no va a ocurrir')
  assert.equal(repo._fajos.get(fajo.id).estado, ESTADO.ENCOLADO)
})

// ═══ LA PUERTA DE LA PERSONA, Y EL BYPASS QUE ERA CÓDIGO MUERTO (03/08) ═══
//
// `correrCargador` ponía `ORQ_SHEETS_DESCONGELAR` en el entorno del proceso hijo desde esa misma
// mañana, con el argumento de que del otro lado había una persona apretando Confirmar. No servía
// para nada: el chequeo del freno, sesenta líneas antes, devolvía ENCOLADO y el cargador no se
// corría nunca. Con la marca puesta, comprobantes NO escribía — y se le dijo al dueño que sí.
//
// La distinción que sostiene la puerta es la misma que la de la asistencia: un timer no tiene
// nombre. Un fajo confirmado tiene `plataforma_username`.

test('con el freno puesto pero una PERSONA que confirmó, la carga corre igual', async () => {
  const repo = repoMemoria()
  const f = await repo.abrirFajo(null, {
    userId: 'u_rodrigo', username: 'rodrigo', channelId: 'c_comprobantes', rootPostId: 'p1', postId: 'p1', items: [item()],
  })
  const fajo = repo._fajos.get(f.id)
  let visto = null
  const r = await escribirFajo({
    port: null, repo, congelado: CON_HIELO,
    correr: async (o) => { visto = o; return { ok: true, datos: { ok: true, escritas: 1, filas: [{ i: 0, fila: 900 }] } } },
  }, fajo)
  assert.notEqual(r.estado, ESTADO.ENCOLADO, 'una persona confirmó: no se encola')
  assert.equal(r.estado, ESTADO.CARGADO)
  assert.equal(visto?.actor, 'rodrigo', 'el actor viaja al hijo: el motivo del deshielo tiene que nombrarlo')
})

test('el deshielo del hijo NOMBRA a quien confirmó — sin nombre no se puede auditar', async () => {
  let entorno = null
  const spawnFalso = (_exe, _args, o) => {
    entorno = o.env
    return { stdout: { on: () => {} }, stderr: { on: () => {} }, on: (ev, cb) => { if (ev === 'close') setImmediate(() => cb(0)) } }
  }
  await correrCargador({ fajo: [], actor: 'rodrigo', spawnImpl: spawnFalso, env: {} }).catch(() => {})
  assert.match(String(entorno?.ORQ_SHEETS_DESCONGELAR ?? ''), /rodrigo/)

  entorno = null
  await correrCargador({ fajo: [], actor: null, spawnImpl: spawnFalso, env: {} }).catch(() => {})
  assert.equal(entorno?.ORQ_SHEETS_DESCONGELAR, undefined, 'sin actor, el hijo no recibe el deshielo')
})

test('el freno que se consulta por defecto es el REAL del OS, no uno inventado acá', () => {
  // Sin esto, la costura inyectable de arriba podría estar apuntando a cualquier lado y los dos
  // tests de freno pasarían igual sin proteger nada.
  assert.equal(typeof congelado, 'function')
  assert.match(RUTA_MARCA, /SHEETS-CONGELADOS$/)
})

// ── Corregir ─────────────────────────────────────────────────────────────────

test('el formulario nunca pasa de cinco campos y pone primero lo que falta', () => {
  const sinObraNiNumero = item({ comprobante: { obra: null, numero: null } })
  const els = elementosDe(sinObraNiNumero, { obras: OBRAS })
  assert.ok(els.length <= MAX_ELEMENTOS)
  assert.equal(els[0].name, 'obra')
  assert.ok(els.slice(0, 3).some((e) => e.name === 'numero'))
})

test('la obra sale como desplegable cuando se conoce la lista estricta', () => {
  const [obra] = elementosDe(item(), { obras: OBRAS })
  assert.equal(obra.type, 'select')
  assert.equal(obra.default, 'Estrella')
  assert.deepEqual(obra.options.map((o) => o.value), OBRAS)
})

test('corregir la obra la valida contra la lista: no entra una que el desplegable va a rechazar', () => {
  const r = aplicarCorreccion(item({ comprobante: { obra: null } }), { obra: 'Obra Inventada' }, { obras: OBRAS })
  assert.equal(r.ok, false)
  assert.match(r.errors.obra, /No reconozco esa obra/)
})

test('corregir el número RECALCULA la clave: si no, se deduplicaría contra otra cosa', () => {
  const r = aplicarCorreccion(item(), { numero: '0113-00099999' }, { obras: OBRAS })
  assert.equal(r.ok, true)
  assert.equal(r.item.clave, 'c:30712345678|0113-00099999')
})

test('corregir el total de una NOTA DE CRÉDITO conserva el signo negativo', () => {
  const nc = item({ comprobante: { esNotaCredito: true, tipo: 'NC', total: -100, iva: -21 } })
  // La persona escribe el total como lo ve en el papel: positivo.
  const r = aplicarCorreccion(nc, { total: '9.823.178,00', iva: '1.704.849,90' }, { obras: OBRAS })
  assert.equal(r.ok, true)
  assert.equal(r.item.comprobante.total, -9823178)
  assert.equal(r.item.comprobante.iva, -1704849.90)
})

test('una fecha o un importe que no se pueden interpretar vuelven como error del formulario', () => {
  const a = aplicarCorreccion(item(), { fecha: 'el martes' }, { obras: OBRAS })
  assert.equal(a.ok, false)
  assert.match(a.errors.fecha, /DD\/MM\/AAAA/)
  const b = aplicarCorreccion(item(), { total: 'como mil' }, { obras: OBRAS })
  assert.equal(b.ok, false)
})

test('un campo vacío deja el dato como estaba: no lo borra', () => {
  const r = aplicarCorreccion(item(), { proveedor: '', obra: '   ' }, { obras: OBRAS })
  assert.equal(r.ok, true)
  assert.equal(r.item.comprobante.proveedor, 'Combustibles Barcelo')
  assert.equal(r.item.comprobante.obra, 'Estrella')
})

test('escribir el proveedor a mano deja de marcarlo como desconocido', () => {
  const r = aplicarCorreccion(item({ proveedorNuevo: true }), { proveedor: 'Cemento SA' }, { obras: OBRAS })
  assert.equal(r.item.proveedorNuevo, false)
})

test('el diálogo lleva el fajo y el índice en el state, y vuelven enteros', () => {
  const d = dialogoCorreccion({ fajo: { id: 'f1', items: [item()] }, indice: 0, obras: OBRAS, url: URL })
  assert.deepEqual(leerEstado(d.dialog.state), { fajoId: 'f1', indice: 0 })
  assert.equal(leerEstado('no es json'), null)
})

test('el formulario apunta al comprobante INCOMPLETO, no siempre al primero', () => {
  // Incompleto = le falta algo que IMPIDE cargar. La obra dejó de ser eso el 03/08/2026, así que el
  // ítem incompleto de este caso es el que no tiene número.
  const items = [item(), item({ clave: 'c:x|1', comprobante: { numero: null } })]
  assert.equal(indiceACorregir(items), 1)
})

test('un click en Corregir abre el diálogo con el secreto en la URL', async () => {
  const { repo, fajo } = await conFajo({ items: [item({ comprobante: { obra: null } })] })
  const { manejar, mm } = manejador({ repo, escribir: async () => ({}) })
  await manejar(click(fajo.id, 'corregir'))
  assert.equal(mm.dialogos.length, 1)
  assert.equal(mm.dialogos[0].url, URL)
  assert.equal(mm.dialogos[0].trigger_id, 'trig1')
})

testConBotones('guardar la corrección actualiza el fajo y reescribe el mensaje del canal', async () => {
  const { repo, fajo } = await conFajo({ items: [item({ comprobante: { obra: null } })] })
  const { manejar, mm } = manejador({ repo, escribir: async () => ({}) })
  const r = await manejar({
    ...click(fajo.id, null),
    type: 'dialog_submission',
    state: JSON.stringify({ fajo_id: fajo.id, indice: 0 }),
    submission: { obra: 'Messina' },
  })
  assert.equal(r.status, 200)
  assert.equal(repo._fajos.get(fajo.id).items[0].comprobante.obra, 'Messina')
  assert.match(mm.posts.at(-1).message, /\| Obra \| Messina/)
  assert.ok(mm.posts.at(-1).props.attachments[0].actions.some((a) => a.id === 'confirmar'))
})

test('no se puede corregir un fajo ya cerrado', async () => {
  const { repo, fajo } = await conFajo({ estado: ESTADO.CARGADO })
  const { manejar } = manejador({ repo, escribir: async () => ({}) })
  const r = await manejar(click(fajo.id, 'corregir'))
  assert.match(r.body.ephemeral_text, /ya se cerró/)
})

// ── Piezas puras de la escritura ─────────────────────────────────────────────

test('los ítems incompletos NO se mandan al cargador', () => {
  const json = aFajoJson([item(), item({ comprobante: { numero: null } })])
  assert.equal(json.length, 1)
})

test('el que va SIN OBRA sí se manda: la obra viaja vacía, no lo excluye (03/08/2026)', () => {
  // `aFajoJson` filtra por `estaCompleto`. Al dejar de exigir la obra, el comprobante sin imputar
  // tiene que llegar al cargador —que ya sabe escribir la fila con la columna J vacía— en vez de
  // caerse en silencio del array.
  const json = aFajoJson([item({ comprobante: { obra: null } })])
  assert.equal(json.length, 1)
  assert.equal(json[0].obra, undefined, 'la obra viaja ausente, no como un texto inventado')
})

test('la fecha se guarda como date, no como texto argentino', () => {
  assert.equal(aIso('05/01/2026'), '2026-01-05')
  assert.equal(aIso('no es fecha'), null)
})

// ── La costura con el cargador ───────────────────────────────────────────────
//
// El cargador NO se corre acá. Lo que se verifica es el contrato entre los dos: que el fajo se le
// pase por archivo, que se le pida `--json`, y que su línea de resultado se lea bien aunque venga
// mezclada con toda la prosa que ese script imprime para una persona.

test('al cargador se le pasa un archivo y se le pide --json', async () => {
  let visto = null
  const spawnImpl = (_exe, args) => { visto = args; return procesoFalso('') }
  await correrCargador({ fajo: [{ proveedor: 'X' }], spawnImpl })
  assert.ok(visto.some((a) => a.endsWith('cargar-comprobantes-compras.mjs')))
  assert.ok(visto.includes('--file'))
  assert.ok(visto.includes('--json'))
  assert.ok(!visto.includes('--dry'), 'la corrida real no lleva --dry; el --dry es una opción aparte')
})

test('la línea de resultado se rescata de entre toda la prosa del cargador', async () => {
  const salida = [
    'Compras: última fila con datos = 411. Se cargan 1 comprobante(s) → filas 412..412.',
    '⚠ Proveedores NUEVOS: Ferretería',
    '##ORQ-JSON##{"ok":true,"desde":412,"escritas":1,"filas":[{"i":0,"fila":412}]}',
    'SIGUIENTE: node orquestador/scripts/sync-compras.mjs',
  ].join('\n')
  const r = await correrCargador({ fajo: [], spawnImpl: () => procesoFalso(salida) })
  assert.equal(r.ok, true)
  assert.equal(r.datos.filas[0].fila, 412)
})

test('si el cargador NO devuelve la línea, no se inventa un éxito', async () => {
  const r = await correrCargador({ fajo: [], spawnImpl: () => procesoFalso('todo bien!', 0) })
  assert.equal(r.ok, false)
  assert.match(r.error, /no devolvió resultado/)
})

test('un cargador que sale con error devuelve su última salida, no un "ok"', async () => {
  const r = await correrCargador({ fajo: [], spawnImpl: () => procesoFalso('', 1, 'Error: falta DATABASE_URL') })
  assert.equal(r.ok, false)
  assert.match(r.error, /DATABASE_URL/)
})

/** Un proceso hijo de mentira: emite lo que se le diga y cierra con el código pedido. */
function procesoFalso(stdout, code = 0, stderr = '') {
  const oyentes = { close: [], error: [] }
  const canal = (texto) => ({ on: (_e, f) => { if (texto) setImmediate(() => f(Buffer.from(texto))) } })
  setImmediate(() => setImmediate(() => oyentes.close.forEach((f) => f(code))))
  return {
    stdout: canal(stdout),
    stderr: canal(stderr),
    kill() {},
    on(evento, f) { (oyentes[evento] ??= []).push(f) },
  }
}

test('la fila de trazabilidad guarda de qué post y de qué fajo salió', () => {
  const f = filaDeRegistro(item(), { id: 'f1', channel_id: 'c1', post_ids: ['p1', 'p2'], plataforma_user_id: 'u1' })
  assert.equal(f.fajoId, 'f1')
  assert.equal(f.postId, 'p1')
  assert.equal(f.channelId, 'c1')
  assert.equal(f.userId, 'u1')
  assert.equal(f.tipo, 'A')
})

// ── El probable duplicado: dos botones, y ninguna decisión automática ────────
//
// Mismo proveedor, mismo día y mismo importe con otro número puede ser el mismo comprobante con un
// dígito mal leído —lo que pasó el 03/08— o dos compras distintas. Cargar de más duplica el gasto en
// el Flujo de Fondos; descartar de más lo hace desaparecer. Las dos salidas son caras: decide el dueño.

const conDuplicado = (o = {}) => ({
  ...item(o),
  posibleDuplicado: { fila: 802, hoja: 'Compras', numero: '0004-00003642', fecha: '30/07/2026', total: 62000, obra: 'MESSINA' },
})

testConBotones('mientras el duplicado no se conteste NO aparece Confirmar', async () => {
  const { repo, fajo } = await conFajo({ items: [conDuplicado()] })
  const { mm, manejar } = manejador({ repo })
  await manejar(click(fajo.id, 'corregir')) // cualquier acción que redibuje sirve para mirar el mensaje
  const { botonesFajo } = await import('../../lib/comprobantes/fajo.mjs')
  const ids = botonesFajo(repo._fajos.get(fajo.id), { url: URL })[0].actions.map((a) => a.id)
  assert.deepEqual(ids, ['dupmismo', 'dupotro', 'descartar'])
  assert.ok(mm)
})

testConBotones('"Es el mismo, no lo cargues" NO lo carga, y queda constancia de que se decidió', async () => {
  const { repo, fajo } = await conFajo({ items: [conDuplicado()] })
  let escribio = false
  const { mm, manejar } = manejador({ repo, escribir: async () => { escribio = true; return {} } })
  const r = await manejar(click(fajo.id, 'duplicado_mismo', { context: { accion: 'duplicado_mismo', fajo_id: fajo.id, indice: 0 } }))
  assert.match(r.body.ephemeral_text, /no lo cargo/i)
  assert.equal(repo._fajos.get(fajo.id).items[0].duplicadoResuelto, 'mismo')
  assert.equal(escribio, false)
  const post = mm.posts.find((p) => p.id === 'post_bot')
  assert.match(post.message, /Marcado como ya cargado/)
  // Y sigue sin haber Confirmar: lo que el dueño dijo es que ese comprobante NO se carga.
  assert.equal(post.props.attachments[0].actions.some((a) => a.id === 'confirmar'), false)
})

testConBotones('"Es otro, cargalo" habilita Confirmar', async () => {
  const { repo, fajo } = await conFajo({ items: [conDuplicado()] })
  const { mm, manejar } = manejador({ repo })
  await manejar(click(fajo.id, 'duplicado_otro', { context: { accion: 'duplicado_otro', fajo_id: fajo.id, indice: 0 } }))
  assert.equal(repo._fajos.get(fajo.id).items[0].duplicadoResuelto, 'otro')
  const post = mm.posts.find((p) => p.id === 'post_bot')
  assert.equal(post.props.attachments[0].actions.some((a) => a.id === 'confirmar'), true)
})

test('el segundo click sobre el mismo duplicado no cambia la respuesta ya dada', async () => {
  const { repo, fajo } = await conFajo({ items: [conDuplicado()] })
  const { manejar } = manejador({ repo })
  const ctx = { accion: 'duplicado_mismo', fajo_id: fajo.id, indice: 0 }
  await manejar(click(fajo.id, 'duplicado_mismo', { context: ctx }))
  const r = await manejar(click(fajo.id, 'duplicado_otro', { context: { ...ctx, accion: 'duplicado_otro' } }))
  assert.match(r.body.ephemeral_text, /ya lo contestaste/)
  assert.equal(repo._fajos.get(fajo.id).items[0].duplicadoResuelto, 'mismo')
})

// ── La obra, con un click ────────────────────────────────────────────────────
//
// El bot preguntaba la obra tirando lo que la lib de imputación ya sabía. Ahora la ofrece con sus
// conteos, y las tres más frecuentes son botones: contestar es un click, no escribir.

/** Un tique sin obra, con la sugerencia real de un proveedor que va a varias obras. */
const sinObra = () => ({
  ...item({ comprobante: { obra: null } }),
  sugerencia: {
    obra: {
      sugerido: 'Taller', n: 126, distintos: 7, share: 0.325, evidencia: 'ambiguo', pide_confirmacion: true,
      opciones: [{ valor: 'San Francisco', n: 41 }, { valor: 'Administracion', n: 39 }, { valor: 'Taller', n: 18 }],
      nota: 'obra elegida por coincidencia de concepto, no por la más frecuente del proveedor',
    },
  },
})

// El click de un MENÚ: el valor llega en `selected_option`, que lo agrega Mattermost. El `context`
// es el que nosotros configuramos y viaja igual para todas las opciones del menú.
const clickObra = (fajoId, valor, indice = 0) => click(fajoId, 'imputar', {
  context: { accion: 'imputar', fajo_id: fajoId, indice, campo: 'obra', selected_option: valor },
})

// CONTESTAR LO ÚLTIMO QUE FALTABA ES CONFIRMAR (04/08). A quien acaba de completar la imputación no
// se le pide un click más: si ya no queda nada que preguntar, se carga.
test('elegir la ÚLTIMA imputación que faltaba carga sola, sin pedir Confirmar', async () => {
  const { repo, fajo } = await conFajo({ items: [sinObra()] })
  let escribio = null
  const { manejar } = manejador({ repo, escribir: async (f) => { escribio = f; return { estado: ESTADO.CARGADO, texto: '✔ fila 810' } } })
  const r = await manejar(clickObra(fajo.id, 'San Francisco'))
  assert.equal(repo._fajos.get(fajo.id).items[0].comprobante.obra, 'San Francisco')
  assert.ok(escribio, 'se cargó sin un click más')
  assert.match(r.body.ephemeral_text, /Cargado|fila 810/)
})

// La otra mitad: mientras QUEDE algo que preguntar, no se escribe una fila a medias. Este ítem tiene
// la unidad sin resolver y con opciones para ofrecer, así que contestar la obra no alcanza.
testConBotones('si todavía queda imputación pendiente, se sigue preguntando en vez de cargar', async () => {
  const conUnidad = {
    ...sinObra(),
    opciones: { obra: ['San Francisco', 'Taller'], unidad: ['Civil', 'Estructura'], detalle: {} },
  }
  const { repo, fajo } = await conFajo({ items: [conUnidad] })
  let escribio = null
  const { mm, manejar } = manejador({ repo, escribir: async (f) => { escribio = f; return {} } })
  const r = await manejar(clickObra(fajo.id, 'San Francisco'))
  assert.equal(escribio, null, 'no se escribe nada mientras falte la unidad de negocio')
  assert.match(r.body.ephemeral_text, /San Francisco/)
  const post = mm.posts.find((p) => p.id === 'post_bot')
  assert.equal(post.props.attachments[0].actions.map((a) => a.id).includes('unidad'), true, 'ahora pregunta la unidad')
})

test('una obra que este comprobante NO ofreció no se aplica — el callback no trae identidad', async () => {
  const { repo, fajo } = await conFajo({ items: [sinObra()] })
  const { manejar } = manejador({ repo })
  const r = await manejar(clickObra(fajo.id, 'Obra Que No Existe'))
  assert.match(r.body.ephemeral_text, /ya no corresponde/)
  assert.equal(repo._fajos.get(fajo.id).items[0].comprobante.obra, null, 'no se imputó nada')
})

test('un fajo ya cerrado no acepta que le cambien la obra', async () => {
  const { repo, fajo } = await conFajo({ items: [sinObra()], estado: ESTADO.CONFIRMADO })
  const { manejar } = manejador({ repo })
  const r = await manejar(clickObra(fajo.id, 'Taller'))
  assert.match(r.body.ephemeral_text, /ya se cerró/)
  assert.equal(repo._fajos.get(fajo.id).items[0].comprobante.obra, null)
})

test('un fajo con un duplicado abierto NO escribe nada si igual se fuerza el Confirmar', async () => {
  const { repo, fajo } = await conFajo({ items: [conDuplicado()] })
  let corridas = 0
  const r = await escribirFajo({
    port: null, repo, congelado: SIN_HIELO, correr: async () => { corridas++; return { ok: true, datos: { ok: true, escritas: 1, filas: [] } } },
  }, repo._fajos.get(fajo.id))
  assert.equal(corridas, 0, 'no se corre el cargador con una pregunta sin contestar')
  assert.equal(r.estado, ESTADO.DESCARTADO)
})

// ═══ LA PRUEBA DEL EFECTO: releer la fila y mostrar lo que quedó ═══
//
// El bot contestaba "✔ Cargado en Compras, fila 412" y nada más. Con el importe leído mal la
// respuesta era idéntica. El dueño lo pidió textual: "tiene que ser exactamente igual que
// directamente por esta vía, la experiencia es confusa y no es certera". Lo que da certeza no es
// el tilde: es el dato leído de su destino.

/** Un Compras de mentira: `filas` es {nro: {proveedor, comprobante, fecha, importe, iva, total, obra}}. */
function comprasFalso(filas = {}) {
  const max = Math.max(...Object.keys(filas).map(Number), 4)
  const grilla = Array.from({ length: max - 3 }, () => [])
  for (const [nro, v] of Object.entries(filas)) {
    const f = []
    f[4] = v.proveedor; f[7] = v.comprobante; f[2] = v.fecha; f[9] = v.obra ?? 'Estrella'
    f[12] = v.importe; f[13] = v.iva; f[14] = v.total
    grilla[Number(nro) - 4] = f
  }
  return async () => grilla
}

test('CARGADO: el mensaje trae lo que quedó ESCRITO, releído de Compras', async () => {
  const { repo, fajo } = await conFajo()
  const correr = async () => ({ ok: true, datos: { ok: true, escritas: 1, filas: [{ i: 0, fila: 412 }] } })
  const leerCompras = comprasFalso({
    412: { proveedor: 'Combustibles Barcelo', comprobante: '0113-00010489', fecha: '05/01/2026', importe: 30479.30, iva: 5981, total: 36460.30 },
  })
  const r = await escribirFajo({ port: null, repo, correr, congelado: SIN_HIELO, leerCompras }, fajo)

  assert.match(r.texto, /Esto es lo que quedó escrito en Compras/)
  assert.match(r.texto, /\| 412 \| Combustibles Barcelo \| 0113-00010489 \|/, 'no muestra la fila releída')
  assert.match(r.texto, /\$36\.460/, 'no muestra el total que quedó en el archivo')
  assert.match(r.texto, /Releído del archivo/)
})

test('un importe leído mal se DENUNCIA, no se confirma con un tilde', async () => {
  const { repo, fajo } = await conFajo()
  const correr = async () => ({ ok: true, datos: { ok: true, escritas: 1, filas: [{ i: 0, fila: 412 }] } })
  // La foto decía 36.460,30 y en el archivo quedó un total que no cierra con importe + IVA.
  const leerCompras = comprasFalso({
    412: { proveedor: 'Combustibles Barcelo', comprobante: '0113-00010489', fecha: '05/01/2026', importe: 30479.30, iva: 5981, total: 3646030 },
  })
  const r = await escribirFajo({ port: null, repo, correr, congelado: SIN_HIELO, leerCompras }, fajo)

  assert.match(r.texto, /la aritmética no cierra/)
  assert.match(r.texto, /No lo des por bueno/)
})

test('si releer falla, se dice — no se afirma un éxito que no se verificó', async () => {
  const { repo, fajo } = await conFajo()
  const correr = async () => ({ ok: true, datos: { ok: true, escritas: 1, filas: [{ i: 0, fila: 412 }] } })
  const leerCompras = async () => { throw new Error('google 503') }
  const r = await escribirFajo({ port: null, repo, correr, congelado: SIN_HIELO, leerCompras }, fajo)

  assert.equal(r.estado, ESTADO.CARGADO, 'la carga ocurrió: no se puede decir que falló')
  assert.match(r.texto, /no pude releer las filas/)
  assert.match(r.texto, /fila 412/, 'igual se dice dónde quedó')
})

// ── EL MODO ENSAYO: existe para poder probar el camino entero sin tocar `Compras` ────────────────
//
// Y tiene dos obligaciones, porque un modo que no escribe es peligroso justamente por eso:
//   1. estar APAGADO por defecto — la variable no está en producción, y si algún día apareciera,
//      el default no puede ser "no escribas";
//   2. no MENTIR. Con `--dry` el cargador devuelve `ok:true` y `escritas:0`, y sin el aviso el
//      mensaje diría "cargué" sobre filas que nadie escribió. Es el defecto que este repo ya nombró:
//      un log que felicita sin haber escrito.

test('ENSAYO apagado por defecto: sin la variable, el cargador NO lleva --dry', async () => {
  const antes = process.env.ORQ_COMPROBANTES_ENSAYO
  delete process.env.ORQ_COMPROBANTES_ENSAYO
  try {
    let visto = null
    await correrCargador({ fajo: [{ proveedor: 'X' }], spawnImpl: (_e, a) => { visto = a; return procesoFalso('') } })
    assert.ok(!visto.includes('--dry'))
  } finally { if (antes != null) process.env.ORQ_COMPROBANTES_ENSAYO = antes }
})

test('ENSAYO=1: el cargador lleva --dry', async () => {
  const antes = process.env.ORQ_COMPROBANTES_ENSAYO
  process.env.ORQ_COMPROBANTES_ENSAYO = '1'
  try {
    let visto = null
    await correrCargador({ fajo: [{ proveedor: 'X' }], spawnImpl: (_e, a) => { visto = a; return procesoFalso('') } })
    assert.ok(visto.includes('--dry'), 'con ENSAYO=1 tiene que correr en seco')
  } finally {
    if (antes == null) delete process.env.ORQ_COMPROBANTES_ENSAYO
    else process.env.ORQ_COMPROBANTES_ENSAYO = antes
  }
})

test('un ensayo NO se puede confundir con una carga: el mensaje lo dice y no relee nada', async () => {
  const repo = repoMemoria()
  const fajo = {
    id: 'f-ensayo', plataforma_username: 'rodrigo',
    items: [{
      comprobante: {
        proveedor: 'DUPEC', cuit: '30712345678', tipo: 'A', numero: '0113-00010489',
        fecha: '05/01/2026', total: 121, iva: 21, obra: 'MESSINA', categoria: 'B',
      },
    }],
  }
  repo._fajos.set(fajo.id, { ...fajo, estado: ESTADO.CONFIRMADO })
  // El cargador contesta lo que contesta `--dry`: ok, pero CERO escritas.
  const correr = async () => ({ ok: true, datos: { ok: true, dry: true, desde: 844, escritas: 0, filas: [{ i: 0, fila: 844 }] } })
  // Releer EXPLOTA: si el código intentara mostrar "lo que quedó", este test se pone rojo.
  const google = { readSheetValues: () => { throw new Error('un ensayo no puede releer filas que no escribió') } }
  const r = await escribirFajo({ port: portGuarda(), repo, correr, congelado: () => false, google }, repo._fajos.get(fajo.id))
  assert.match(r.texto, /ENSAYO/)
  assert.match(r.texto, /NO escribió/)
})
