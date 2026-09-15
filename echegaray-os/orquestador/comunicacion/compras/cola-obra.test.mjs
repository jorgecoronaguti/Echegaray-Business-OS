// El worker de la columna «Obra» con dobles en memoria: sin Postgres, sin Google, sin el Sheet real.
// Se verifica el reparto de estados y —sobre todo— que NO escriba cuando no debe.
import test from 'node:test'
import assert from 'node:assert/strict'
import { aplicarCambio, procesarCola, tomarCambio } from './cola-obra.mjs'
import { COMPRAS_2508, COMPRAS_CON_OBRA } from '../../lib/encabezados-referencia.mjs'
import { rangoEncabezado } from '../../lib/columnas-por-encabezado.mjs'
import { claveDeCompra } from '../../lib/compras-fila.mjs'

const COMPRA = {
  ID: 53, Proveedor: 'CORRALÓN EL NORTE', Tipo: 'F A', 'N° Comprobante': '0003-00012345', 'CUIT (OS)': '30712345678',
}
const OBRA = 'OB-0021 · ME - PLAYÓN DE AZUFRE'
function filaDe(encabezado, valores) {
  const f = new Array(encabezado.length).fill('')
  for (const [rotulo, v] of Object.entries(valores)) f[encabezado.indexOf(rotulo)] = v
  return f
}
const CAMBIO = {
  id: 'k-1', fila: 57, sheet_id: 53, valor_anterior: null, valor_nuevo: OBRA, pedido_por: 'u-1', intentos: 1,
  clave: claveDeCompra({ cuit: '30712345678', tipo: 'F A', comprobante: '0003-00012345', proveedor: 'CORRALÓN EL NORTE' }),
}

/** Google en memoria. `releo` = lo que devuelve la relectura de la celda escrita (por defecto, lo escrito). */
function dobleGoogle({ encabezado = COMPRAS_CON_OBRA, obra = '', respuesta = {}, releo } = {}) {
  const escrituras = []; const lecturas = []
  return {
    escrituras, lecturas,
    async readSheetValues(_id, rango, opts) {
      lecturas.push({ rango, opts })
      if (rango === rangoEncabezado('Compras')) return [encabezado]
      if (rango.includes(':')) return [filaDe(encabezado, encabezado.includes('Obra') ? { ...COMPRA, Obra: obra } : COMPRA)]
      if (releo instanceof Error) throw releo
      return [[releo ?? escrituras.at(-1)?.data[0].values[0][0]]]
    },
    async batchUpdateValues(_id, data, opts) { escrituras.push({ data, opts }); return respuesta },
  }
}

const OBRAS = [{ id: 'playon', codigo: 'OB-0021', nombre: 'ME - PLAYÓN DE AZUFRE', cliente_texto: 'MESSINA', fusionada_en: null }]
function doblePort({ perfil = { nombre: 'Rodrigo' }, cambios = [], obras = OBRAS } = {}) {
  const updates = []; const cola = [...cambios]; const sqls = []
  return {
    updates, sqls,
    async query(sql, params) {
      sqls.push(sql)
      if (/from public\.perfiles/.test(sql)) return { rows: perfil ? [perfil] : [] }
      if (/from public\.obra_canonica/.test(sql)) return { rows: obras }
      if (/set estado = 'procesando'/.test(sql)) { const c = cola.shift(); return { rows: c ? [c] : [] } }
      if (/^\s*select \* from public\.compra_obra_cambio/.test(sql)) return { rows: cola }
      if (/set estado/.test(sql)) { updates.push({ sql, params }); return { rows: [] } }
      return { rows: [] }
    },
  }
}
const ultimo = (port) => port.updates.at(-1)

test('camino feliz: escribe SÓLO la celda Obra de la fila, relee y guarda lo releído', async () => {
  const google = dobleGoogle(); const port = doblePort()
  const r = await aplicarCambio({ port, google, fileId: 'F', cambio: CAMBIO, encabezado: COMPRAS_CON_OBRA })
  assert.equal(r, 'aplicado')
  assert.equal(google.escrituras.length, 1)
  assert.deepEqual(google.escrituras[0].data, [{ range: 'Compras!L57', values: [[OBRA]] }])
  assert.equal(ultimo(port).params[1], 'aplicado')
  assert.equal(ultimo(port).params[3], OBRA, 'leido_de_vuelta sale de la relectura')
  assert.ok(google.lecturas.some((l) => l.rango === 'Compras!L57'), 'la celda se releyó')
})

test('la fila se lee sin formato, como el sync: si no, la clave del comprobante no coincide', async () => {
  const google = dobleGoogle()
  await aplicarCambio({ port: doblePort(), google, fileId: 'F', cambio: CAMBIO, encabezado: COMPRAS_CON_OBRA })
  assert.equal(google.lecturas.find((l) => l.rango.includes(':')).opts?.render, 'UNFORMATTED_VALUE')
})

test('el freno se levanta con el NOMBRE de quien eligió la obra', async () => {
  const google = dobleGoogle()
  await aplicarCambio({ port: doblePort(), google, fileId: 'F', cambio: CAMBIO, encabezado: COMPRAS_CON_OBRA })
  assert.equal(google.escrituras[0].opts.confirmacion.actor, 'Rodrigo')
  assert.ok(google.escrituras[0].opts.confirmacion.motivo.length >= 8)
})

test('del chat, sin perfil: el actor es `pedido_por_nombre`', async () => {
  const google = dobleGoogle()
  const cambio = { ...CAMBIO, pedido_por: null, pedido_por_nombre: 'Jorge' }
  assert.equal(await aplicarCambio({ port: doblePort({ perfil: null }), google, fileId: 'F', cambio, encabezado: COMPRAS_CON_OBRA }), 'aplicado')
  assert.equal(google.escrituras[0].opts.confirmacion.actor, 'Jorge')
})

test('sin persona identificada NO se escribe nada', async () => {
  const google = dobleGoogle(); const port = doblePort({ perfil: null })
  assert.equal(await aplicarCambio({ port, google, fileId: 'F', cambio: CAMBIO, encabezado: COMPRAS_CON_OBRA }), 'rechazado')
  assert.equal(google.escrituras.length, 0)
})

test('sin columna «Obra» no escribe: el cambio queda PENDIENTE con motivo y sin gastar un intento', async () => {
  const google = dobleGoogle({ encabezado: COMPRAS_2508 }); const port = doblePort()
  assert.equal(await aplicarCambio({ port, google, fileId: 'F', cambio: CAMBIO, encabezado: COMPRAS_2508 }), 'diferido')
  assert.equal(google.escrituras.length, 0)
  const u = ultimo(port)
  assert.match(u.sql, /estado = 'pendiente'/)
  assert.match(u.sql, /intentos = greatest\(intentos - 1, 0\)/)
  assert.match(u.params[1], /sin_columna_obra/)
})

test('si la celda cambió desde que se miró, se RECHAZA y no se escribe', async () => {
  const google = dobleGoogle({ obra: 'ES-ADM · Estructura – Administración' }); const port = doblePort()
  assert.equal(await aplicarCambio({ port, google, fileId: 'F', cambio: CAMBIO, encabezado: COMPRAS_CON_OBRA }), 'rechazado')
  assert.equal(google.escrituras.length, 0)
  assert.match(ultimo(port).params[2], /celda_cambio/)
})

test('si la fila ya es otra compra, se RECHAZA y no se escribe', async () => {
  const google = dobleGoogle(); const port = doblePort()
  const cambio = { ...CAMBIO, clave: 'otra-clave' }
  assert.equal(await aplicarCambio({ port, google, fileId: 'F', cambio, encabezado: COMPRAS_CON_OBRA }), 'rechazado')
  assert.equal(google.escrituras.length, 0)
  assert.match(ultimo(port).params[2], /huella_distinta/)
})

test('relectura distinta de lo escrito marca ERROR, no aplicado', async () => {
  const google = dobleGoogle({ releo: 'ES-TAL · Estructura – Taller' }); const port = doblePort()
  assert.equal(await aplicarCambio({ port, google, fileId: 'F', cambio: CAMBIO, encabezado: COMPRAS_CON_OBRA }), 'error')
  assert.equal(ultimo(port).params[1], 'error')
  assert.equal(ultimo(port).params[3], 'ES-TAL · Estructura – Taller')
  assert.match(ultimo(port).params[2], /relectura distinta/)
})

test('si no puede releer, no cierra como aplicado: vuelve a la cola a buscar evidencia', async () => {
  const google = dobleGoogle({ releo: new Error('red caída') }); const port = doblePort()
  assert.equal(await aplicarCambio({ port, google, fileId: 'F', cambio: CAMBIO, encabezado: COMPRAS_CON_OBRA }), 'error')
  assert.equal(ultimo(port).params[1], 'pendiente')
})

test('reintento de una escritura que aterrizó: cierra aplicado SIN volver a escribir', async () => {
  const google = dobleGoogle({ obra: OBRA }); const port = doblePort()
  assert.equal(await aplicarCambio({ port, google, fileId: 'F', cambio: CAMBIO, encabezado: COMPRAS_CON_OBRA }), 'aplicado')
  assert.equal(google.escrituras.length, 0)
  assert.equal(ultimo(port).params[3], OBRA)
})

test('freno puesto o pestaña candada: pendiente sin gastar intento, y la corrida se corta', async () => {
  for (const respuesta of [{ protegido: true, congelado: true }, { protegido: true, motivo: 'candado' }]) {
    const google = dobleGoogle({ respuesta })
    const port = doblePort({ cambios: [CAMBIO, { ...CAMBIO, id: 'k-2' }] })
    const c = await procesarCola({ port, google, fileId: 'F', dry: false })
    assert.equal(c.diferido, 1, 'no vuelve a tomar el mismo cambio en la misma corrida')
    assert.equal(google.escrituras.length, 1)
    assert.match(ultimo(port).sql, /intentos = greatest/)
  }
})

test('vaciar la celda que no-borrar frena se rechaza con motivo: no queda girando para siempre', async () => {
  const google = dobleGoogle({ obra: OBRA, respuesta: { protegido: true, noBorrar: true } }); const port = doblePort()
  const cambio = { ...CAMBIO, valor_anterior: OBRA, valor_nuevo: '' }
  assert.equal(await aplicarCambio({ port, google, fileId: 'F', cambio, encabezado: COMPRAS_CON_OBRA }), 'rechazado')
  assert.match(ultimo(port).params[2], /no-borrar/)
})

test('falla técnica: con reintentos vuelve a pendiente; agotados, error', async () => {
  const roto = { ...dobleGoogle(), readSheetValues: async () => { throw new Error('red caída') } }
  const port = doblePort({ cambios: [{ ...CAMBIO, intentos: 1 }] })
  await procesarCola({ port, google: roto, fileId: 'F', max: 1, dry: false })
  assert.equal(ultimo(port).params[1], 'pendiente')
  const port2 = doblePort({ cambios: [{ ...CAMBIO, intentos: 3 }] })
  await procesarCola({ port: port2, google: roto, fileId: 'F', max: 1, dry: false })
  assert.equal(ultimo(port2).params[1], 'error')
})

test('EN SECO por defecto: dice qué escribiría y no escribe el Sheet ni la base', async () => {
  const google = dobleGoogle(); const port = doblePort({ cambios: [CAMBIO] })
  const c = await procesarCola({ port, google, fileId: 'F' })
  assert.equal(c.dry, true)
  assert.equal(c.plan[0].accion, 'escribir')
  assert.equal(c.plan[0].celda, 'Compras!L57')
  assert.equal(google.escrituras.length, 0)
  assert.equal(port.updates.length, 0)
  assert.ok(port.sqls.every((s) => !/^\s*(update|insert|delete)/i.test(s)), 'ni un UPDATE en seco')
})

test('procesarCola cuenta y se detiene cuando la cola se vacía', async () => {
  const google = dobleGoogle()
  const port = doblePort({ cambios: [CAMBIO, { ...CAMBIO, id: 'k-2' }] })
  const c = await procesarCola({ port, google, fileId: 'F', dry: false })
  assert.equal(c.aplicado, 2)
  assert.equal(google.escrituras.length, 2)
  assert.equal(c.diferido + c.rechazado + c.error, 0)
})

test('tomarCambio marca procesando en el MISMO update, con skip locked', async () => {
  let sql = null
  await tomarCambio({ async query(s) { sql = s; return { rows: [CAMBIO] } } })
  assert.match(sql, /for update skip locked/i)
  assert.match(sql, /set estado = 'procesando'/)
})

test('el valor se valida contra obra_canonica ANTES de escribir: «OB-0021 · X» se rechaza sin tocar el Sheet', async () => {
  const google = dobleGoogle(); const port = doblePort()
  const r = await aplicarCambio({ port, google, fileId: 'F', cambio: { ...CAMBIO, valor_nuevo: 'OB-0021 · X' }, encabezado: COMPRAS_CON_OBRA })
  assert.equal(r, 'rechazado')
  assert.equal(google.escrituras.length, 0)
  assert.match(ultimo(port).params[2], /valor_invalido: .*no es el rótulo de OB-0021/)
  assert.ok(port.sqls.some((q) => /from public\.obra_canonica/.test(q)), 'el catálogo sale de la base')
})

test('sin obras en la base no escribe: difiere', async () => {
  const google = dobleGoogle(); const port = doblePort({ obras: [] })
  const r = await aplicarCambio({ port, google, fileId: 'F', cambio: CAMBIO, encabezado: COMPRAS_CON_OBRA })
  assert.equal(r, 'diferido')
  assert.equal(google.escrituras.length, 0)
})

// ═══ DOS PESTAÑAS, UNA COLA (20260915T2210) ═══
import { COBRANZAS_CON_OBRA } from '../../lib/encabezados-referencia.mjs'
import { huellaDeCobranza } from '../../lib/bisturi-cobranzas-obra.mjs'

const COBRO = { ID: 10, 'N° Comprobante': '01-00000204', 'Obra / Cliente': 'ARCOR', 'TOTAL a cobrar (neto de retenciones)': 1066808 }
const OBRAS_2 = [...OBRAS, { id: 'arcor', codigo: 'OB-0001', nombre: 'AR - MANTENIMIENTO', cliente_texto: 'ARCOR', fusionada_en: null }]
const CAMBIO_COB = {
  id: 'c-1', pestana: 'Cobranzas', fila: 14, sheet_id: 10, valor_anterior: null, valor_nuevo: 'OB-0001 · AR - MANTENIMIENTO',
  pedido_por: 'u-1', intentos: 1, clave: huellaDeCobranza({ comprobante: '01-00000204', cliente: 'ARCOR', total: 1066808 }),
}
/** Google en memoria que sabe las DOS pestañas: cada una con su fila de rótulos y su fila de datos. */
function dobleGoogleDosPestanas() {
  const escrituras = []; const lecturas = []
  return {
    escrituras, lecturas,
    async readSheetValues(_id, rango, opts) {
      lecturas.push({ rango, opts })
      if (rango === rangoEncabezado('Compras')) return [COMPRAS_CON_OBRA]
      if (rango === rangoEncabezado('Cobranzas')) return [COBRANZAS_CON_OBRA]
      if (rango.startsWith('Cobranzas!A')) return [filaDe(COBRANZAS_CON_OBRA, { ...COBRO, Obra: '' })]
      if (rango.startsWith('Compras!A')) return [filaDe(COMPRAS_CON_OBRA, { ...COMPRA, Obra: '' })]
      return [[escrituras.at(-1)?.data[0].values[0][0]]]
    },
    async batchUpdateValues(_id, data, opts) { escrituras.push({ data, opts }); return {} },
  }
}

test('un cambio de Cobranzas lee la fila de rótulos de Cobranzas y escribe H de ESA fila', async () => {
  const google = dobleGoogleDosPestanas(); const port = doblePort({ obras: OBRAS_2 })
  const r = await aplicarCambio({ port, google, fileId: 'F', cambio: CAMBIO_COB, encabezado: COBRANZAS_CON_OBRA })
  assert.equal(r, 'aplicado')
  assert.deepEqual(google.escrituras[0].data, [{ range: 'Cobranzas!H14', values: [['OB-0001 · AR - MANTENIMIENTO']] }])
  assert.match(google.escrituras[0].opts.confirmacion.motivo, /Cobranzas/)
  assert.ok(google.lecturas.some((l) => l.rango === 'Cobranzas!A14:BZ14' && l.opts?.render === 'UNFORMATTED_VALUE'), 'la fila de Cobranzas se relee sin formato')
})

test('la cola mezclada: cada cambio va con el encabezado de SU pestaña, y sin `pestana` es Compras', async () => {
  const google = dobleGoogleDosPestanas()
  const port = doblePort({ obras: OBRAS_2, cambios: [CAMBIO_COB, { ...CAMBIO, pestana: undefined }, { ...CAMBIO, id: 'k-3', pestana: 'Compras' }] })
  const c = await procesarCola({ port, google, fileId: 'F', dry: false })
  assert.equal(c.aplicado, 3)
  assert.deepEqual(google.escrituras.map((e) => e.data[0].range), ['Cobranzas!H14', 'Compras!L57', 'Compras!L57'])
  const encabezados = google.lecturas.filter((l) => [rangoEncabezado('Compras'), rangoEncabezado('Cobranzas')].includes(l.rango))
  assert.equal(encabezados.length, 2, 'cada fila de rótulos se lee UNA vez por corrida')
  assert.ok(port.sqls.some((s) => /from public\.cliente_alias/.test(s)), 'el mapa de clientes sale de la base, para «Sin obra – X» canónico')
})

test('en seco, un cambio de Cobranzas dice qué celda escribiría y no toca nada', async () => {
  const google = dobleGoogleDosPestanas(); const port = doblePort({ obras: OBRAS_2, cambios: [CAMBIO_COB] })
  const c = await procesarCola({ port, google, fileId: 'F' })
  assert.equal(c.plan[0].celda, 'Cobranzas!H14'); assert.equal(c.plan[0].pestana, 'Cobranzas')
  assert.equal(google.escrituras.length, 0); assert.equal(port.updates.length, 0)
})
