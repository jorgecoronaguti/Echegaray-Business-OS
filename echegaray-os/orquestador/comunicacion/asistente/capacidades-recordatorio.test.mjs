// Tests de las tres capacidades de recordatorio, ejecutadas COMO LAS EJECUTA EL ASISTENTE:
// descubiertas desde el registro por id, con su schema de entrada real y un contexto como el
// que arma el router. Nada se importa por ruta de archivo salvo el propio registro — si una
// capacidad deja de estar declarada, estos tests se caen, que es exactamente lo que se quiere.

import { strict as assert } from 'node:assert'
import { describe, it } from 'node:test'
import { CAPACIDAD, zCapacidad } from './contratos.mjs'
import { capacidadPorId, capacidades, capacidadesHabilitadas } from './registro.mjs'
import { RecordatoriosMemoria } from './recordatorios.mjs'
import { IDENTIDAD, relojFijo } from './dobles-recordatorios.mjs'

const LUNES_8 = '2026-08-03T08:00:00-03:00'
const VIERNES = '2026-07-31T09:00:00-03:00' // "hoy" en todos estos tests

/** Contexto como el que arma el router, con el repositorio en memoria como costura. */
function contexto(identidad = IDENTIDAD.JORGE, extra = {}) {
  const reloj = relojFijo(VIERNES)
  const recordatorios = extra.recordatorios ?? new RecordatoriosMemoria({ ahora: reloj.ahora })
  return {
    reloj, recordatorios,
    ctx: {
      port: null, google: null, identidad, recordatorios,
      commEventId: null, correlationId: null, channelId: 'canal-1', rootPostId: null,
      ahora: () => reloj.fecha(), ...extra,
    },
  }
}

const ejecutar = async (id, params, ctx) => (await capacidadPorId(id)).ejecutar(params, ctx)

describe('capacidades de recordatorio · declaración', () => {
  it('las tres están declaradas y tienen la forma del contrato', async () => {
    const lista = await capacidades({ recargar: true })
    for (const id of [CAPACIDAD.RECORDATORIO_CREAR, CAPACIDAD.RECORDATORIO_LISTAR, CAPACIDAD.RECORDATORIO_CANCELAR]) {
      const c = lista.find((x) => x.id === id)
      assert.ok(c, `falta la capacidad ${id}`)
      assert.doesNotThrow(() => zCapacidad.parse(c), `${id} no cumple zCapacidad`)
      assert.equal(c.efectoExterno, false, 'un recordatorio interno no toca ningún sistema de terceros')
      assert.ok(c.descripcion && !c.descripcion.endsWith('.'), 'la descripción se lista con viñetas, sin punto')
      assert.ok(c.ejemplos.length, `${id} sin ejemplos: la ayuda no puede enseñar a usarla`)
    }
  })

  it('dependen de la base y de NADA más: sin Google siguen habilitadas', async () => {
    const { ctx } = contexto()
    const ids = (await capacidadesHabilitadas({ ...ctx, google: null })).map((c) => c.id)
    assert.ok(ids.includes(CAPACIDAD.RECORDATORIO_CREAR))
    assert.ok(ids.includes(CAPACIDAD.RECORDATORIO_LISTAR))
    assert.ok(ids.includes(CAPACIDAD.RECORDATORIO_CANCELAR))
  })

  it('sin base no se ofrecen: prometer lo que va a fallar es peor que no tenerlo', async () => {
    const ids = (await capacidadesHabilitadas({ port: null, identidad: IDENTIDAD.JORGE })).map((c) => c.id)
    assert.equal(ids.includes(CAPACIDAD.RECORDATORIO_CREAR), false)
  })
})

describe('capacidad recordatorio.crear', () => {
  it('recordatorio propio recurrente: la confirmación dice cuándo suena', async () => {
    const { ctx, recordatorios } = contexto()
    const r = await ejecutar(CAPACIDAD.RECORDATORIO_CREAR,
      { contenido: 'cargar saldos', cuando: LUNES_8, cadencia: 'weekly:lun:08:00' }, ctx)
    assert.equal(r.ok, true)
    assert.equal(r.texto, 'Listo. Te recuerdo cargar saldos todos los lunes a las 08:00.')
    assert.ok(r.evidencia.id, 'un ok sin evidencia sería una promesa vacía')
    assert.equal(recordatorios.filas.length, 1)
    assert.equal(recordatorios.filas[0].destinatario_user_id, 'u-jorge')
  })

  it('recordatorio cruzado: nombra a la persona y la fecha completa', async () => {
    const { ctx, recordatorios } = contexto()
    const r = await ejecutar(CAPACIDAD.RECORDATORIO_CREAR,
      { contenido: 'buscar las llaves', cuando: LUNES_8, destinatario: 'Rodrigo', destinatarioUserId: 'u-rodrigo' }, ctx)
    assert.equal(r.texto, 'Listo. Le recuerdo a Rodrigo buscar las llaves el lunes 3 de agosto a las 08:00.')
    assert.equal(recordatorios.filas[0].destinatario_user_id, 'u-rodrigo')
    assert.equal(recordatorios.filas[0].creador_user_id, 'u-jorge')
  })

  it('un nombre que no resolvió a una persona se pregunta, no se adivina', async () => {
    const { ctx, recordatorios } = contexto()
    const r = await ejecutar(CAPACIDAD.RECORDATORIO_CREAR,
      { contenido: 'algo', cuando: LUNES_8, destinatario: 'Rodrigo' }, ctx)
    assert.equal(r.ok, false)
    assert.ok(r.aclaracion.pregunta.includes('Rodrigo'))
    assert.equal(recordatorios.filas.length, 0, 'no se crea nada hasta saber a quién')
  })

  it('sin momento no se crea un recordatorio que nunca va a sonar: se pregunta', async () => {
    const { ctx, recordatorios } = contexto()
    const r = await ejecutar(CAPACIDAD.RECORDATORIO_CREAR, { contenido: 'algo' }, ctx)
    assert.ok(r.aclaracion)
    assert.equal(recordatorios.filas.length, 0)
  })

  it('un momento que ya pasó se rechaza con la fecha a la vista', async () => {
    const { ctx } = contexto()
    const r = await ejecutar(CAPACIDAD.RECORDATORIO_CREAR, { contenido: 'algo', cuando: '2026-07-30T08:00:00-03:00' }, ctx)
    assert.equal(r.ok, false)
    assert.equal(r.error.codigo, 'dato_faltante')
    assert.ok(r.texto.includes('jueves 30 de julio'))
  })

  it('con cadencia, un ancla vieja se corre a la próxima ocurrencia real', async () => {
    const { ctx, recordatorios } = contexto()
    const r = await ejecutar(CAPACIDAD.RECORDATORIO_CREAR,
      { contenido: 'cargar saldos', cuando: '2026-07-27T08:00:00-03:00', cadencia: 'weekly:lun:08:00' }, ctx)
    assert.equal(r.ok, true)
    assert.equal(new Date(recordatorios.filas[0].proxima_ejecucion).toISOString(), '2026-08-03T11:00:00.000Z')
  })

  it('el mismo mensaje reintentado no crea un segundo recordatorio', async () => {
    const { ctx, recordatorios } = contexto(IDENTIDAD.JORGE, { commEventId: 'evt-1' })
    const params = { contenido: 'cargar saldos', cuando: LUNES_8 }
    await ejecutar(CAPACIDAD.RECORDATORIO_CREAR, params, ctx)
    const r = await ejecutar(CAPACIDAD.RECORDATORIO_CREAR, params, ctx)
    assert.equal(r.ok, true)
    assert.equal(r.evidencia.duplicado, true)
    assert.ok(r.texto.startsWith('Ya lo tenía.'))
    assert.equal(recordatorios.filas.length, 1)
  })
})

describe('capacidad recordatorio.listar', () => {
  it('sin recordatorios lo dice, y eso no es un error', async () => {
    const { ctx } = contexto()
    const r = await ejecutar(CAPACIDAD.RECORDATORIO_LISTAR, {}, ctx)
    assert.equal(r.ok, true)
    assert.equal(r.texto, 'No tenés recordatorios programados.')
    assert.equal(r.evidencia.cantidad, 0)
  })

  it('muestra los propios y los que le pusieron otros, con quién y cuándo', async () => {
    const { ctx, recordatorios } = contexto()
    await ejecutar(CAPACIDAD.RECORDATORIO_CREAR, { contenido: 'cargar saldos', cuando: LUNES_8, cadencia: 'weekly:lun:08:00' }, ctx)
    await recordatorios.crear({
      creador: { userId: 'u-jorge', display: 'Jorge' }, destinatario: { userId: 'u-rodrigo', display: 'Rodrigo' },
      contenido: 'llevar la documentación', cuando: LUNES_8,
    })
    const mio = await ejecutar(CAPACIDAD.RECORDATORIO_LISTAR, {}, ctx)
    assert.ok(mio.texto.startsWith('Tenés 2 recordatorios:'))
    assert.ok(mio.texto.includes('cargar saldos — todos los lunes a las 08:00'))
    assert.ok(mio.texto.includes('(para Rodrigo)'))

    const { ctx: ctxR } = contexto(IDENTIDAD.RODRIGO, { recordatorios })
    const suyo = await ejecutar(CAPACIDAD.RECORDATORIO_LISTAR, {}, ctxR)
    assert.ok(suyo.texto.startsWith('Tenés 1 recordatorio:'))
    assert.ok(suyo.texto.includes('(te lo puso Jorge)'))
  })
})

describe('capacidad recordatorio.cancelar', () => {
  it('cancela por lo que dice el recordatorio, no por un id', async () => {
    const { ctx, recordatorios } = contexto()
    await ejecutar(CAPACIDAD.RECORDATORIO_CREAR, { contenido: 'cargar saldos', cuando: LUNES_8 }, ctx)
    const r = await ejecutar(CAPACIDAD.RECORDATORIO_CANCELAR, { referencia: 'saldos' }, ctx)
    assert.equal(r.ok, true)
    assert.equal(r.texto, 'Listo. Ya no te recuerdo cargar saldos.')
    assert.equal(recordatorios.filas[0].estado, 'cancelled')
  })

  it('si la referencia alcanza a varios, pregunta en vez de apagar el equivocado', async () => {
    const { ctx } = contexto()
    await ejecutar(CAPACIDAD.RECORDATORIO_CREAR, { contenido: 'cargar saldos del banco', cuando: LUNES_8 }, ctx)
    await ejecutar(CAPACIDAD.RECORDATORIO_CREAR, { contenido: 'revisar saldos de caja', cuando: LUNES_8 }, ctx)
    const r = await ejecutar(CAPACIDAD.RECORDATORIO_CANCELAR, { referencia: 'saldos' }, ctx)
    assert.equal(r.ok, false)
    assert.equal(r.aclaracion.opciones.length, 2)
    assert.ok(r.aclaracion.opciones[0].etiqueta.includes('saldos'))
  })

  it('un tercero no puede cancelar un recordatorio ajeno', async () => {
    const { ctx, recordatorios } = contexto()
    const creado = await ejecutar(CAPACIDAD.RECORDATORIO_CREAR, { contenido: 'cargar saldos', cuando: LUNES_8 }, ctx)
    const { ctx: ctxAjeno } = contexto(IDENTIDAD.AJENO, { recordatorios })
    const r = await ejecutar(CAPACIDAD.RECORDATORIO_CANCELAR, { id: creado.evidencia.id }, ctxAjeno)
    assert.equal(r.ok, false)
    assert.equal(r.error.codigo, 'permiso_denegado')
    assert.equal(recordatorios.filas[0].estado, 'active', 'sigue vivo')
  })

  it('lo que no existe no se cancela en silencio', async () => {
    const { ctx } = contexto()
    const r = await ejecutar(CAPACIDAD.RECORDATORIO_CANCELAR, { referencia: 'lo que sea' }, ctx)
    assert.equal(r.ok, false)
    assert.equal(r.error.codigo, 'no_encontrado')
  })
})
