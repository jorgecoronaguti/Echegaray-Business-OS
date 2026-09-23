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

// ═══ LA HUELLA DE RESPALDO DESDE compra_sheet (15/09/2026) ═══
import { contarSinHuella, leerRespaldo, reencolarSinHuella } from './cola-obra.mjs'

const TELLO = { ID: 806, Proveedor: 'PEDRO TELLO', Tipo: '', 'N° Comprobante': '', 'CUIT (OS)': '', 'Fecha factura': 46275, Concepto: 'Galpon 5', Total: 4200000 }
const RESPALDO = { proveedor: 'PEDRO TELLO', fecha: '2026-09-10', total: 4200000, concepto: 'Galpon 5', sheet_id: 806, resincronizado: false }
const OBRAS_3 = [...OBRAS, { id: 'galpon', codigo: 'OB-0007', nombre: 'LE - GALPÓN 9', cliente_texto: 'LA ESTRELLA', fusionada_en: null }]
const CAMBIO_806 = { ...CAMBIO, id: 'k-806', fila: 810, sheet_id: 806, clave: null, valor_nuevo: 'OB-0007 · LE - GALPÓN 9', creado_at: new Date('2026-09-15T17:00:00Z') }

/** Google con la fila 810 de Tello, y un port cuyo compra_sheet devuelve `respaldo` (o nada). */
function dobleTello({ respaldo = RESPALDO, fila = TELLO } = {}) {
  const google = dobleGoogle()
  google.readSheetValues = async function (_id, rango, opts) {
    this.lecturas.push({ rango, opts })
    if (rango === rangoEncabezado('Compras')) return [COMPRAS_CON_OBRA]
    if (rango.includes(':')) return [filaDe(COMPRAS_CON_OBRA, { ...fila, Obra: '' })]
    return [[this.escrituras.at(-1)?.data[0].values[0][0]]]
  }
  const port = doblePort({ obras: OBRAS_3, cambios: [CAMBIO_806] })
  const base = port.query.bind(port)
  port.respaldos = []
  port.query = async (sql, params) => {
    if (/from public\.compra_sheet/.test(sql)) { port.respaldos.push(params); return { rows: respaldo ? [respaldo] : [] } }
    return base(sql, params)
  }
  return { google, port }
}

test('DEFECTO 15/09: fila sin comprobante, cambio sin clave → con el respaldo de compra_sheet se ESCRIBE y relee', async () => {
  const { google, port } = dobleTello()
  const r = await aplicarCambio({ port, google, fileId: 'F', cambio: CAMBIO_806, encabezado: COMPRAS_CON_OBRA })
  assert.equal(r, 'aplicado')
  assert.deepEqual(google.escrituras[0].data, [{ range: 'Compras!L810', values: [['OB-0007 · LE - GALPÓN 9']] }])
  assert.deepEqual(port.respaldos, [[810, CAMBIO_806.creado_at]], 'el respaldo se pide por la fila del cambio y con su creado_at')
  assert.equal(ultimo(port).params[1], 'aplicado')
  assert.doesNotMatch(ultimo(port).params[2], /resincronizado/)
})

test('proveedor distinto en la fila viva: rechazado por huella_distinta y ni una escritura', async () => {
  const { google, port } = dobleTello({ fila: { ...TELLO, Proveedor: 'JUAN PÉREZ' } })
  assert.equal(await aplicarCambio({ port, google, fileId: 'F', cambio: CAMBIO_806, encabezado: COMPRAS_CON_OBRA }), 'rechazado')
  assert.equal(google.escrituras.length, 0)
  assert.match(ultimo(port).params[2], /huella_distinta: .*JUAN PÉREZ/)
})

test('la fila no está en compra_sheet: sin_huella, como antes, y sin escribir', async () => {
  const { google, port } = dobleTello({ respaldo: null })
  assert.equal(await aplicarCambio({ port, google, fileId: 'F', cambio: CAMBIO_806, encabezado: COMPRAS_CON_OBRA }), 'rechazado')
  assert.equal(google.escrituras.length, 0)
  assert.match(ultimo(port).params[2], /^sin_huella: /)
})

test('con clave de comprobante NO se consulta compra_sheet; un cambio de Cobranzas tampoco', async () => {
  const { google, port } = dobleTello()
  await aplicarCambio({ port, google, fileId: 'F', cambio: CAMBIO, encabezado: COMPRAS_CON_OBRA })
  assert.equal(port.respaldos.length, 0)
  const g2 = dobleGoogleDosPestanas(); const p2 = doblePort({ obras: OBRAS_2 })
  const sinClave = { ...CAMBIO_COB, clave: null }
  await aplicarCambio({ port: p2, google: g2, fileId: 'F', cambio: sinClave, encabezado: COBRANZAS_CON_OBRA })
  assert.ok(p2.sqls.every((s) => !/compra_sheet/.test(s)))
})

test('respaldo tomado de un espejo resincronizado después del pedido: se aplica y el motivo lo dice', async () => {
  const { google, port } = dobleTello({ respaldo: { ...RESPALDO, resincronizado: true } })
  assert.equal(await aplicarCambio({ port, google, fileId: 'F', cambio: CAMBIO_806, encabezado: COMPRAS_CON_OBRA }), 'aplicado')
  assert.match(ultimo(port).params[2], /resincronizado después del pedido/)
})

test('en seco, el cambio sin clave dice que escribiría L810 y no toca nada', async () => {
  const { google, port } = dobleTello()
  const c = await procesarCola({ port, google, fileId: 'F' })
  assert.equal(c.plan[0].accion, 'escribir'); assert.equal(c.plan[0].celda, 'Compras!L810')
  assert.equal(google.escrituras.length, 0); assert.equal(port.updates.length, 0)
})

test('leerRespaldo pide fecha como texto, total como número y si el espejo es posterior al pedido', async () => {
  let sql = null; let params = null
  await leerRespaldo({ async query(s, p) { sql = s; params = p; return { rows: [] } } }, CAMBIO_806)
  assert.match(sql, /fecha::text/); assert.match(sql, /total::float8/); assert.match(sql, /sincronizado_en >/)
  assert.deepEqual(params, [810, CAMBIO_806.creado_at])
})

test('reencolar los sin_huella es a pedido: pendiente con intentos en cero, SÓLO los rechazados por sin_huella', async () => {
  let sql = null
  const n = await reencolarSinHuella({ async query(s) { sql = s; return { rows: [{ id: 'a' }, { id: 'b' }] } } })
  assert.equal(n, 2)
  assert.match(sql, /set estado = 'pendiente', intentos = 0/)
  assert.match(sql, /where estado = 'rechazado' and motivo like 'sin_huella:%'/)
  let lectura = null
  await contarSinHuella({ async query(s) { lectura = s; return { rows: [{ n: 3 }] } } })
  assert.match(lectura, /^\s*select/i); assert.match(lectura, /motivo like 'sin_huella:%'/)
})

test('el worker NO reencola solo: procesarCola no toca los rechazados', async () => {
  const google = dobleGoogle(); const port = doblePort({ cambios: [] })
  await procesarCola({ port, google, fileId: 'F', dry: false })
  assert.ok(port.sqls.every((s) => !/sin_huella/.test(s)))
})

// ═══ ANULAR DESDE LA APP SACA LA FILA DE COMPRAS (dueño, 23/09/2026) ═══
//
// Una entrega de efectivo anulada encola `tipo = 'anular'` por cada fila que sus rendiciones escribieron.
// El worker pone «Estado = Cancelado» en ESA fila —y sólo si es «A rendir»— con la misma huella de siempre.

const A_RENDIR = { ...COMPRA, 'Tipo pago': 'A rendir', Estado: 'Pagado' }
const ANULAR = { ...CAMBIO, id: 'an-1', tipo: 'anular', valor_anterior: 'Pagado', valor_nuevo: 'Cancelado' }
function googleConFila(valores) {
  const g = dobleGoogle()
  const leer = g.readSheetValues.bind(g)
  g.readSheetValues = async (id, rango, opts) => {
    if (rango.includes(':') && rango !== rangoEncabezado('Compras')) { g.lecturas.push({ rango, opts }); return [filaDe(COMPRAS_CON_OBRA, valores)] }
    return leer(id, rango, opts)
  }
  return g
}

test('anular: escribe SÓLO Estado = Cancelado en la fila A rendir, relee y cierra', async () => {
  const google = googleConFila(A_RENDIR); const port = doblePort()
  const r = await aplicarCambio({ port, google, fileId: 'F', cambio: ANULAR, encabezado: COMPRAS_CON_OBRA })
  assert.equal(r, 'aplicado')
  assert.equal(google.escrituras.length, 1)
  const col = COMPRAS_CON_OBRA.indexOf('Estado')
  assert.ok(col >= 0)
  const [esc] = google.escrituras[0].data
  assert.match(esc.range, /^Compras![A-Z]+57$/)
  assert.deepEqual(esc.values, [['Cancelado']])
  assert.match(google.escrituras[0].opts.confirmacion.motivo, /cancelada/)
  assert.equal(ultimo(port).params[1], 'aplicado')
})

test('anular: una fila que NO es A rendir la cargó una persona y se RECHAZA sin escribir', async () => {
  const google = googleConFila({ ...COMPRA, 'Tipo pago': 'Efectivo', Estado: 'Pagado' }); const port = doblePort()
  const r = await aplicarCambio({ port, google, fileId: 'F', cambio: ANULAR, encabezado: COMPRAS_CON_OBRA })
  assert.equal(r, 'rechazado')
  assert.equal(google.escrituras.length, 0)
  assert.match(ultimo(port).params[2], /no_es_a_rendir/)
})

test('anular: si la fila ya dice Cancelado no se vuelve a escribir', async () => {
  const google = googleConFila({ ...A_RENDIR, Estado: 'Cancelado' }); const port = doblePort()
  const r = await aplicarCambio({ port, google, fileId: 'F', cambio: ANULAR, encabezado: COMPRAS_CON_OBRA })
  assert.equal(r, 'aplicado')
  assert.equal(google.escrituras.length, 0)
})

test('anular: si la fila ya es otra compra, se RECHAZA', async () => {
  const google = googleConFila({ ...A_RENDIR, 'N° Comprobante': '0001-00000001' }); const port = doblePort()
  const r = await aplicarCambio({ port, google, fileId: 'F', cambio: ANULAR, encabezado: COMPRAS_CON_OBRA })
  assert.equal(r, 'rechazado')
  assert.equal(google.escrituras.length, 0)
})
