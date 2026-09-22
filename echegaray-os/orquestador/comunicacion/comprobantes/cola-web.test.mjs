// EL CONSUMIDOR DE LA COLA DE LA PANTALLA — probado con dobles, sin Postgres ni Storage.
//
// LOS DEFECTOS QUE ESTOS TESTS ATRAPAN
//
//  1. Procesar de a un archivo en vez de por lote. Cinco fotos subidas juntas tienen que entrar como
//     UN fajo: de a una, la misma factura fotografiada dos veces se cargaría dos veces (el colapso
//     de repetidos trabaja dentro del fajo) y el Sheet quedaría con el gasto duplicado.
//  2. Cerrar una fila que quedó ESPERANDO. `en_espera` es un comprobante vivo: si se le pone
//     `cerrado_at`, la pantalla lo da por terminado y el gasto desaparece de la vista sin haber
//     entrado a Compras.
//  3. Aflojar la puerta cuando la base no contesta. El rol se vuelve a preguntar al procesar porque
//     acá se escribe plata; si esa consulta falla y se deja pasar, el permiso no es un permiso.
//  4. Cerrar la fila y dejar el fajo ABIERTO. En el chat «abierto» significa que el bot espera un
//     botón; en la web nadie contesta nunca, así que el fajo queda vivo con sus ítems ya cargados
//     (fajos 6569dd6d… y 64d7e5da… del 25/08) y la carga siguiente de esa persona se le agrega.

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  bajadorDe, comprobantesDelLote, guardaDeLaWeb, procesarUnLote,
} from './cola-web.mjs'
import { ENTRADA } from '../../lib/comprobantes/entrada-web.mjs'
import { ESTADO } from '../../lib/comprobantes/fajo.mjs'

const LOTE = '11111111-1111-1111-1111-111111111111'
const USUARIO = '22222222-2222-2222-2222-222222222222'

function filaCola(id, nombre) {
  return { id, lote: LOTE, storage_path: `${USUARIO}/${id}.jpg`, nombre_archivo: nombre, media_type: 'image/jpeg', subido_por: USUARIO, intentos: 1 }
}

/** Un Postgres de mentira que contesta por la forma de la consulta y anota los updates. */
function portFalso({ filas = [], rol = 'administracion', registrados = [], rompeRegistro = false } = {}) {
  const updates = []
  return {
    updates,
    async query(sql, args = []) {
      if (/update public\.comprobante_entrada[\s\S]*for update skip locked|with siguiente/.test(sql)) {
        return { rows: filas }
      }
      if (/from public\.perfiles/.test(sql)) {
        if (rol === 'ROMPE') throw new Error('econnrefused')
        return { rows: rol ? [{ rol, nombre: 'Quien Sea' }] : [] }
      }
      if (/comprobantes_cargados/.test(sql)) {
        if (rompeRegistro) throw new Error('no se pudo leer')
        return { rows: registrados }
      }
      if (/^\s*update public\.comprobante_entrada\s+set estado = \$2/.test(sql)) {
        updates.push({ id: args[0], estado: args[1], motivo: args[2], resultado: args[3], fajoId: args[4] })
        return { rows: [] }
      }
      return { rows: [] }
    },
  }
}

const parte = (o = {}) => ({ recibidos: 0, cargados: 0, yaEstaban: 0, copias: 0, suma: 0, ilegibles: [], sinImputar: [], trabados: [], avisos: [], ...o })

test('el lote entra al circuito COMPLETO, en una sola llamada', async () => {
  const filas = [filaCola('a', '1.jpg'), filaCola('b', '2.jpg'), filaCola('c', '3.jpg')]
  const port = portFalso({ filas, registrados: [{ proveedor: 'Acindar', fila: 845 }] })
  const llamadas = []
  await procesarUnLote({
    port,
    procesar: async (_dep, m) => {
      llamadas.push(m)
      return { estado: 'cargado', texto: '✔ Cargado.', fajoId: 'f1', parte: parte({ cargados: 3, suma: 900 }) }
    },
  })
  assert.equal(llamadas.length, 1, 'llamó al circuito más de una vez: el lote se partió')
  assert.deepEqual(llamadas[0].fileIds, ['a', 'b', 'c'])
  // El lote viaja como canal: es la clave con la que el fajo agrupa y con la que se vuelve al registro.
  assert.equal(llamadas[0].channelId, LOTE)
  assert.equal(llamadas[0].plataforma, 'web')
  // Y sin texto inventado: la obra no se fabrica.
  assert.equal(llamadas[0].texto, null)
  assert.deepEqual(port.updates.map((u) => u.estado), [ENTRADA.CARGADO, ENTRADA.CARGADO, ENTRADA.CARGADO])
})

test('lo que quedó esperando NO se declara terminado', async () => {
  const port = portFalso({ filas: [filaCola('a', '1.jpg')] })
  await procesarUnLote({
    port,
    procesar: async () => ({ estado: 'encolado', texto: '🧊 La escritura de Sheets está congelada.', parte: parte() }),
  })
  assert.equal(port.updates[0].estado, ENTRADA.EN_ESPERA)
  assert.match(port.updates[0].motivo, /congelada/)
})

test('la puerta se vuelve a preguntar al procesar, y falla cerrada', async () => {
  const sinPerfil = guardaDeLaWeb(portFalso({ rol: null }))
  assert.equal((await sinPerfil({ actor: { plataforma_user_id: USUARIO } })).ok, false)

  const rota = guardaDeLaWeb(portFalso({ rol: 'ROMPE' }))
  const r = await rota({ actor: { plataforma_user_id: USUARIO } })
  assert.equal(r.ok, false, 'dejó pasar con la base caída: el permiso no es un permiso')

  const sinIdentidad = guardaDeLaWeb(portFalso({}))
  assert.equal((await sinIdentidad({ actor: {} })).ok, false)

  for (const rol of ['direccion', 'administracion', 'jefe_obra']) {
    assert.equal((await guardaDeLaWeb(portFalso({ rol }))({ actor: { plataforma_user_id: USUARIO } })).ok, true, rol)
  }
})

test('«no pude leer el registro» no se guarda como «no entró ninguno»', async () => {
  const port = portFalso({ filas: [filaCola('a', '1.jpg')], rompeRegistro: true })
  await procesarUnLote({
    port,
    procesar: async () => ({ estado: 'cargado', texto: '✔ Cargado.', parte: parte({ cargados: 1 }) }),
  })
  const r = JSON.parse(port.updates[0].resultado)
  assert.equal(r.comprobantes, null, 'un registro ilegible se guardó como lista vacía: son cosas opuestas')
})

test('el registro leído en su destino viaja con la fila de Compras', async () => {
  const port = portFalso({
    filas: [filaCola('a', '1.jpg')],
    registrados: [{ proveedor: 'Acindar', numero: '0001-00000123', total: '475200.00', fila: 845, hoja: 'Compras' }],
  })
  await procesarUnLote({
    port,
    procesar: async () => ({ estado: 'cargado', texto: '✔ Cargado.', parte: parte({ cargados: 1, suma: 475200 }) }),
  })
  const r = JSON.parse(port.updates[0].resultado)
  assert.equal(r.comprobantes[0].fila, 845)
  assert.equal(r.suma, 475200)
})

test('una excepción del circuito devuelve el lote a la cola mientras queden reintentos', async () => {
  const port = portFalso({ filas: [filaCola('a', '1.jpg')] })
  await procesarUnLote({ port, procesar: async () => { throw new Error('ECONNRESET') } })
  assert.equal(port.updates[0].estado, ENTRADA.PENDIENTE)

  const gastado = portFalso({ filas: [{ ...filaCola('b', '2.jpg'), intentos: 3 }] })
  await procesarUnLote({ port: gastado, procesar: async () => { throw new Error('ECONNRESET') } })
  assert.equal(gastado.updates[0].estado, ENTRADA.ERROR)
})

test('sin nada pendiente no se llama al circuito ni se gasta un token', async () => {
  const port = portFalso({ filas: [] })
  let llamo = false
  const r = await procesarUnLote({ port, procesar: async () => { llamo = true } })
  assert.equal(r, null)
  assert.equal(llamo, false)
})

test('el bajador traduce el id de la fila en su objeto de Storage', async () => {
  const pedidos = []
  const bajar = bajadorDe([filaCola('a', 'IMG.jpg')], async (o) => { pedidos.push(o); return { ok: true, data: 'x', mediaType: o.mediaType, nombre: o.nombre } })
  const r = await bajar('a')
  assert.equal(r.fileId, 'a')
  assert.deepEqual(pedidos[0], { bucket: 'comprobantes', path: `${USUARIO}/a.jpg`, nombre: 'IMG.jpg', mediaType: 'image/jpeg' })

  // Un id que no es de este lote NO baja nada: sería leer el archivo de otra carga.
  const ajeno = await bajar('zzz')
  assert.equal(ajeno.ok, false)
  assert.deepEqual(pedidos.length, 1)
})

test('comprobantesDelLote devuelve null cuando no pudo mirar, [] cuando miró y no había', async () => {
  assert.equal(await comprobantesDelLote(portFalso({ rompeRegistro: true }), LOTE), null)
  assert.deepEqual(await comprobantesDelLote(portFalso({ registrados: [] }), LOTE), [])
})

test('el nombre de quien subió viaja al fajo: sin él, el freno de mano no se levanta nunca', async () => {
  const port = portFalso({ filas: [filaCola('a', '1.jpg')], rol: 'direccion' })
  let visto = null
  await procesarUnLote({ port, procesar: async (_d, m) => { visto = m; return { estado: 'cargado', texto: '✔', parte: parte({ cargados: 1 }) } } })
  assert.equal(visto.actor.plataforma_username, 'Quien Sea')

  // Y si el perfil no se puede leer, viaja null: el freno queda puesto y los comprobantes esperan.
  // Fallar cerrado acá cuesta una espera; fallar abierto cuesta una escritura que nadie pidió.
  const sinPerfil = portFalso({ filas: [filaCola('b', '2.jpg')], rol: null })
  let visto2 = null
  await procesarUnLote({ port: sinPerfil, procesar: async (_d, m) => { visto2 = m; return { estado: 'encolado', texto: '🧊 congelada', parte: parte() } } })
  assert.equal(visto2.actor.plataforma_username, null)
})

/** Un repositorio de fajos de mentira: anota los cierres y de dónde salió el id. */
function repoFalso({ abierto = { id: 'f-abierto' } } = {}) {
  const cierres = []
  const buscados = []
  return {
    cierres,
    buscados,
    async fajoAbierto(_port, clave) { buscados.push(clave); return abierto },
    async cerrarFajo(_port, o) { cierres.push(o); return { id: o.id, estado: o.estado } },
  }
}

test('un lote que ya estaba cargado CIERRA su fajo, no lo deja abierto (25/08)', async () => {
  const port = portFalso({ filas: [filaCola('a', '1.jpg')] })
  const repo = repoFalso()
  const r = await procesarUnLote({
    port,
    repo,
    procesar: async () => ({
      estado: 'confirmar',
      texto: '⚠️ Ya está cargado — Compras fila 883. No hay nada para cargar.',
      fajoId: 'f-web',
      parte: parte({ cargados: 0, yaEstaban: 1 }),
    }),
  })
  assert.equal(port.updates[0].estado, ENTRADA.YA_ESTABA)
  assert.equal(repo.cierres.length, 1, 'la fila cerró y el fajo quedó abierto: nadie va a contestarle')
  assert.equal(repo.cierres[0].id, 'f-web')
  // El estado es el del bot para «ya estaban»: CARGADO con filas [], no un estado nuevo.
  assert.equal(repo.cierres[0].estado, ESTADO.CARGADO)
  assert.deepEqual(repo.cierres[0].filas, [])
  // Y se cierra sólo si sigue abierto: pisar un fajo ya cerrado por escritura.mjs le borraría las
  // filas de Compras que se escribieron.
  assert.equal(repo.cierres[0].desde, ESTADO.ABIERTO)
  assert.equal(r.fajo.estado, ESTADO.CARGADO)
  // El id vino en la salida del circuito: no hizo falta ir a buscarlo.
  assert.equal(repo.buscados.length, 0)
})

test('lo que quedó ESPERANDO deja el fajo abierto: todavía puede completarlo una persona', async () => {
  const port = portFalso({ filas: [filaCola('a', '1.jpg')] })
  const repo = repoFalso()
  await procesarUnLote({
    port,
    repo,
    procesar: async () => ({ estado: 'encolado', texto: '🧊 La escritura de Sheets está congelada.', fajoId: 'f-web', parte: parte() }),
  })
  assert.equal(port.updates[0].estado, ENTRADA.EN_ESPERA)
  assert.deepEqual(repo.cierres, [], 'cerró el fajo de un comprobante que sigue vivo')

  // Lo mismo con «confirmar» cuando SÍ falta cargar algo: es el caso del chat, y ahí el fajo abierto
  // es lo correcto — lo que falta es un dato que alguien puede completar.
  const otro = portFalso({ filas: [filaCola('b', '2.jpg')] })
  const repo2 = repoFalso()
  await procesarUnLote({
    port: otro,
    repo: repo2,
    procesar: async () => ({ estado: 'confirmar', texto: 'Obra: falta', fajoId: 'f-web', parte: parte({ suma: 1000 }) }),
  })
  assert.equal(otro.updates[0].estado, ENTRADA.EN_ESPERA)
  assert.deepEqual(repo2.cierres, [])
})

test('una excepción sin reintentos cierra el fajo buscándolo por lote; con reintentos no lo toca', async () => {
  const gastado = portFalso({ filas: [{ ...filaCola('a', '1.jpg'), intentos: 3 }] })
  const repo = repoFalso()
  await procesarUnLote({ port: gastado, repo, procesar: async () => { throw new Error('ECONNRESET') } })
  assert.equal(gastado.updates[0].estado, ENTRADA.ERROR)
  assert.equal(repo.cierres[0].estado, ESTADO.ERROR)
  // Sin `fajoId` (el circuito nunca contestó) el fajo se busca por la clave con la que se abrió.
  assert.deepEqual(repo.buscados[0], { plataforma: 'web', userId: USUARIO, channelId: LOTE })

  // Con reintentos disponibles la fila vuelve a `pendiente` y el fajo TIENE que seguir abierto: el
  // próximo intento lo reusa.
  const vivo = portFalso({ filas: [filaCola('b', '2.jpg')] })
  const repo2 = repoFalso()
  await procesarUnLote({ port: vivo, repo: repo2, procesar: async () => { throw new Error('ECONNRESET') } })
  assert.equal(vivo.updates[0].estado, ENTRADA.PENDIENTE)
  assert.deepEqual(repo2.cierres, [])
  assert.deepEqual(repo2.buscados, [], 'fue a buscar un fajo que no iba a cerrar')
})

test('si cerrar el fajo falla, el veredicto de las filas igual queda guardado', async () => {
  const port = portFalso({ filas: [filaCola('a', '1.jpg')] })
  const repo = { async fajoAbierto() { return null }, async cerrarFajo() { throw new Error('la base se cayó') } }
  const r = await procesarUnLote({
    port,
    repo,
    procesar: async () => ({ estado: 'cargado', texto: '✔ Cargado.', fajoId: 'f-web', parte: parte({ cargados: 1, suma: 100 }) }),
  })
  assert.equal(port.updates[0].estado, ENTRADA.CARGADO)
  assert.equal(r.fajo, null)
})

// ═══ EFECTIVO A RENDIR (22/09/2026) ═══════════════════════════════════════════════════════════════
const ENTREGA = '33333333-3333-3333-3333-333333333333'
const PERSONA = '44444444-4444-4444-4444-444444444444'

function portRendicion({ filas, rol = 'campo', personaDelPerfil = PERSONA, abierta = true, estructura = false, registrados = [], vinculadas = 1, confirmado = true, itemsDelFajo = null } = {}) {
  const inserts = []
  const base = portFalso({ filas, rol, registrados })
  return {
    inserts,
    updates: base.updates,
    async query(sql, args = []) {
      if (/from public\.perfiles/.test(sql)) return { rows: [{ rol, nombre: 'Rubén Sosa', persona_id: personaDelPerfil }] }
      if (/from public\.efectivo_comprobante c/.test(sql)) {
        return { rows: filas.slice(0, vinculadas).map((f, i) => ({ comprobante_id: `c${i}`, entrada_id: f.id, entrega_id: ENTREGA, codigo: 'ER-0001', persona_id: PERSONA, abierta, estructura, obra_codigo: estructura ? null : 'OB-0011', obra: estructura ? null : 'SF - PISOS INDUSTRIALES', confirmado_en: confirmado ? '2026-09-22T12:00:00Z' : null })) }
      }
      if (/from comunicacion\.comprobante_fajos/.test(sql)) return { rows: [{ items: itemsDelFajo ?? [] }] }
      if (/insert into public\.efectivo_rendicion/.test(sql)) { inserts.push(args); return { rows: [] } }
      return base.query(sql, args)
    },
  }
}
const filaRendicion = (id) => ({ ...filaCola(id, `${id}.jpg`), origen: 'rendicion' })

test('RENDICIÓN: el ticket viaja con la obra de la entrega y con «A rendir» forzado', async () => {
  const filas = [filaRendicion('r1')]
  const port = portRendicion({ filas, registrados: [{ proveedor: 'Corralón El Nogal', clave: '30-1|FB|3-41927', total: 96400 }] })
  const llamadas = []
  await procesarUnLote({ port, procesar: async (_d, m) => { llamadas.push(m); return { estado: 'cargado', texto: '✔', fajoId: 'f', parte: parte({ cargados: 1, suma: 96400 }) } } })
  assert.equal(llamadas[0].texto, 'OB-0011 SF - PISOS INDUSTRIALES')
  assert.deepEqual(llamadas[0].forzar, { formaPago: 'A rendir', pagado: true })
  assert.deepEqual(port.inserts, [[ENTREGA, '30-1|FB|3-41927', 96400, USUARIO, 'c0']], 'lo escrito en Compras queda vinculado a la entrega')
})

test('RENDICIÓN: un «ya estaba» NO se vincula — podría ser una compra pagada por otro medio', async () => {
  const filas = [filaRendicion('r1')]
  const port = portRendicion({ filas, registrados: [] })
  await procesarUnLote({ port, procesar: async () => ({ estado: 'ya_estaba', texto: '', fajoId: 'f', parte: parte({ yaEstaban: 1 }) }) })
  assert.equal(port.inserts.length, 0)
})

test('RENDICIÓN: la persona de la entrega pasa la guarda sin rol de Administración; otra no', async () => {
  const ctx = { personaId: PERSONA, abierta: true }
  const actor = { plataforma_user_id: USUARIO, channel_id: LOTE }
  const suya = await guardaDeLaWeb(portRendicion({ filas: [] }), { rendicion: ctx })({ actor })
  assert.equal(suya.ok, true)
  assert.equal(suya.via, 'entrega')
  const ajena = await guardaDeLaWeb(portRendicion({ filas: [], personaDelPerfil: 'otra' }), { rendicion: ctx })({ actor })
  assert.equal(ajena.ok, false)
  const cerrada = await guardaDeLaWeb(portRendicion({ filas: [] }), { rendicion: { ...ctx, abierta: false } })({ actor })
  assert.equal(cerrada.ok, false, 'una entrega cerrada ya no recibe tickets')
  const sinRendicion = await guardaDeLaWeb(portRendicion({ filas: [] }))({ actor })
  assert.equal(sinRendicion.ok, false, 'fuera de la rendición, el rol campo sigue sin cargar')
})

test('RENDICIÓN: un lote sin vínculo completo no se adivina — va sin «A rendir» ni obra', async () => {
  const filas = [filaRendicion('r1'), filaRendicion('r2')]
  const port = portRendicion({ filas, vinculadas: 1, rol: 'administracion' })
  const llamadas = []
  await procesarUnLote({ port, procesar: async (_d, m) => { llamadas.push(m); return { estado: 'cargado', texto: '', fajoId: 'f', parte: parte() } } })
  assert.equal(llamadas[0].forzar, undefined)
  assert.equal(llamadas[0].texto, null)
})

test('RENDICIÓN: entrega a Estructura no manda obra, pero sí «A rendir»', async () => {
  const filas = [filaRendicion('r1')]
  const port = portRendicion({ filas, estructura: true })
  const llamadas = []
  await procesarUnLote({ port, procesar: async (_d, m) => { llamadas.push(m); return { estado: 'cargado', texto: '', fajoId: 'f', parte: parte() } } })
  assert.equal(llamadas[0].texto, null)
  assert.deepEqual(llamadas[0].forzar, { formaPago: 'A rendir', pagado: true })
})

test('un lote de una entrega de PRUEBA no se procesa y queda rechazado (auditoría 22/09/2026)', async () => {
  // Sin esto el ticket caía al circuito de siempre: entraba a Compras como gasto común, restando de la
  // caja, mientras la caja no ve la entrega de una persona de prueba (migración 1900).
  const fila = { ...filaCola('a', '1.jpg'), origen: 'rendicion' }
  const port = portFalso({ filas: [fila] })
  const antes = port.query.bind(port)
  port.query = async (sql, args) => {
    if (/from public\.efectivo_comprobante c/.test(sql)) {
      return { rows: [{ comprobante_id: 'c1', entrada_id: 'a', entrega_id: 'g1', codigo: 'ER-0002', persona_id: 'p1', abierta: true, estructura: true, es_prueba: true }] }
    }
    return antes(sql, args)
  }
  let proceso = false
  const r = await procesarUnLote({ port, procesar: async () => { proceso = true; return { estado: 'cargado', parte: parte() } } })
  assert.equal(proceso, false, 'no se llamó al circuito')
  assert.equal(r.estado, 'rechazado')
  assert.match(port.updates[0].motivo, /prueba/)
})

// ═══ M05 · LO QUE SE LEYÓ SE CONFIRMA ANTES DE ESCRIBIR ═══
//
// El defecto que atrapan: la persona saca la foto y el circuito decide solo. El total que el modelo
// leyó de SU ticket es el que le baja el saldo, y una lectura ×10 la deja debiendo plata que no gastó.

test('M05: mientras falte la confirmación, el lote se LEE pero no se escribe', async () => {
  const filas = [filaRendicion('r1')]
  const port = portRendicion({ filas, confirmado: false })
  const llamadas = []
  await procesarUnLote({ port, procesar: async (_d, m) => { llamadas.push(m); return { estado: 'confirmar', texto: 'Falta algo', fajoId: 'f', parte: parte() } } })
  assert.equal(llamadas[0].confirmaLaPersona, true, 'el freno no viajó: el circuito iba a escribir sin preguntar')
  assert.equal(port.updates[0].estado, ENTRADA.EN_ESPERA, 'un ticket que espera a una persona no está terminado')
  assert.match(port.updates[0].motivo, /confirme lo que se leyó/)
  assert.equal(port.inserts.length, 0, 'se vinculó a Compras algo que nadie confirmó')
})

test('M05: ya confirmado, el lote se escribe como siempre — el freno es de una sola vuelta', async () => {
  const filas = [filaRendicion('r1')]
  const port = portRendicion({ filas, confirmado: true, registrados: [{ clave: '30-1|FB|3-41927', total: 96400 }] })
  const llamadas = []
  await procesarUnLote({ port, procesar: async (_d, m) => { llamadas.push(m); return { estado: 'cargado', texto: '✔', fajoId: 'f', parte: parte({ cargados: 1, suma: 96400 }) } } })
  assert.equal(llamadas[0].confirmaLaPersona, false)
  assert.equal(port.inserts.length, 1)
})

test('M05: el lote frenado guarda lo LEÍDO, que es lo que la pantalla le muestra a la persona', async () => {
  const filas = [filaRendicion('r1')]
  const port = portRendicion({
    filas, confirmado: false,
    itemsDelFajo: [{ clave: 'k1', comprobante: { proveedor: 'Corralón El Nogal', total: 96400, fecha: '2026-09-22' } }],
  })
  await procesarUnLote({ port, procesar: async () => ({ estado: 'confirmar', texto: '', fajoId: 'f', parte: parte() }) })
  const r = JSON.parse(port.updates[0].resultado)
  assert.deepEqual(r.leidos, [{ clave: 'k1', proveedor: 'Corralón El Nogal', total: 96400, fecha: '2026-09-22', obra: null }])
  assert.deepEqual(r.comprobantes, [], 'lo LEÍDO no se mezcla con lo ESCRITO: uno es una lectura y el otro un hecho')
})

test('M05: el freno es sólo de la rendición — el bot y la pantalla de Compras no lo ven', async () => {
  const port = portFalso({ filas: [filaCola('a', '1.jpg')] })
  const llamadas = []
  await procesarUnLote({ port, procesar: async (_d, m) => { llamadas.push(m); return { estado: 'cargado', texto: '✔', parte: parte({ cargados: 1 }) } } })
  assert.equal(llamadas[0].confirmaLaPersona, false)
})

test('M05: un lote es un fajo — si a UNO le falta la confirmación, no se escribe ninguno', async () => {
  const filas = [filaRendicion('r1'), filaRendicion('r2')]
  const port = {
    inserts: [],
    ...portRendicion({ filas, vinculadas: 2 }),
  }
  // Una confirmada y la otra no: `contextoDeRendicion` exige TODAS.
  const mixto = portRendicion({ filas, vinculadas: 2, confirmado: false })
  const llamadas = []
  await procesarUnLote({ port: mixto, procesar: async (_d, m) => { llamadas.push(m); return { estado: 'confirmar', texto: '', fajoId: 'f', parte: parte() } } })
  assert.equal(llamadas[0].confirmaLaPersona, true)
  assert.equal(mixto.inserts.length, 0)
})
