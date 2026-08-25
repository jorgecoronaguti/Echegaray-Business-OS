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

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  bajadorDe, comprobantesDelLote, guardaDeLaWeb, procesarUnLote,
} from './cola-web.mjs'
import { ENTRADA } from '../../lib/comprobantes/entrada-web.mjs'

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
