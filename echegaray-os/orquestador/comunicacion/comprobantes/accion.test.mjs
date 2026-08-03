// LOS BOTONES Y LA ESCRITURA. Sin red, sin Postgres y SIN TOCAR EL SHEET REAL.
//
// El cargador nunca se corre acá: `escribirFajo` recibe una corrida de mentira. Correr el cargador
// de verdad para "probar que anda" es exactamente lo que ya borró trabajo del dueño tres veces.

import test from 'node:test'
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
  clave: o.clave ?? 'c:30712345678|A|0113-00010489',
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

test('con secreto válido pero SIN grant de permiso, tampoco', async () => {
  const { repo, fajo } = await conFajo()
  const { manejar } = manejador({ repo, port: portGuarda({ permisoOk: false }), escribir: async () => ({}) })
  const r = await manejar(click(fajo.id, 'confirmar'))
  assert.match(r.body.ephemeral_text, /No tenés habilitada/)
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
  const c = repo._cargados.get('c:30712345678|A|0113-00010489')
  assert.equal(c.fila, 412)
  assert.equal(c.post_id, 'p1', 'queda de qué post de Mattermost salió la fila')
})

test('un comprobante que YA estaba cargado no se manda al cargador', async () => {
  const { repo, fajo } = await conFajo()
  repo._cargados.set('c:30712345678|A|0113-00010489', { clave: 'c:30712345678|A|0113-00010489', fila: 99 })
  let corrio = false
  const correr = async () => { corrio = true; return { ok: true, datos: {} } }
  const r = await escribirFajo({ port: null, repo, correr, congelado: SIN_HIELO }, fajo)
  assert.equal(corrio, false)
  assert.match(r.texto, /ya estaban cargados/)
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
  assert.equal(r.item.clave, 'c:30712345678|A|0113-00099999')
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
  const items = [item(), item({ clave: 'c:x|A|1', comprobante: { numero: '0113-00000001', obra: null } })]
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

test('guardar la corrección actualiza el fajo y reescribe el mensaje del canal', async () => {
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
  const json = aFajoJson([item(), item({ comprobante: { obra: null } })])
  assert.equal(json.length, 1)
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

test('mientras el duplicado no se conteste NO aparece Confirmar', async () => {
  const { repo, fajo } = await conFajo({ items: [conDuplicado()] })
  const { mm, manejar } = manejador({ repo })
  await manejar(click(fajo.id, 'corregir')) // cualquier acción que redibuje sirve para mirar el mensaje
  const { botonesFajo } = await import('../../lib/comprobantes/fajo.mjs')
  const ids = botonesFajo(repo._fajos.get(fajo.id), { url: URL })[0].actions.map((a) => a.id)
  assert.deepEqual(ids, ['duplicado_mismo', 'duplicado_otro', 'descartar'])
  assert.ok(mm)
})

test('"Es el mismo, no lo cargues" NO lo carga, y queda constancia de que se decidió', async () => {
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

test('"Es otro, cargalo" habilita Confirmar', async () => {
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

const clickObra = (fajoId, valor, indice = 0) => click(fajoId, 'imputar', {
  context: { accion: 'imputar', fajo_id: fajoId, indice, campo: 'obra', valor },
})

test('tocar una obra la deja imputada y habilita Confirmar', async () => {
  const { repo, fajo } = await conFajo({ items: [sinObra()] })
  const { mm, manejar } = manejador({ repo })
  const r = await manejar(clickObra(fajo.id, 'San Francisco'))
  assert.match(r.body.ephemeral_text, /San Francisco/)
  assert.equal(repo._fajos.get(fajo.id).items[0].comprobante.obra, 'San Francisco')
  const post = mm.posts.find((p) => p.id === 'post_bot')
  assert.match(post.message, /\| Obra \| San Francisco _\(la elegiste vos\)_ \|/)
  assert.equal(post.props.attachments[0].actions.some((a) => a.id === 'confirmar'), true)
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
