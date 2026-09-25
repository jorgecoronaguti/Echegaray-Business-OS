// EFECTIVO A RENDIR, etapa 1 (22/09/2026): el mismo billete sale del cajón UNA vez.
//
// La entrega descarga la caja física (desde `_EFECTIVO_RAW`); el gasto que la persona rinde entra a
// Compras como «A rendir» y no vuelve a restar. Estos tests fijan las dos mitades de esa regla.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { instrumentoDePago, estadoDeEgreso, canalDeMovimiento, CANAL } from './caja-canales.mjs'
import {
  formulaEntregasARendirPosteriores, formulaDevolucionesARendirPosteriores, formulaComprasEfectivoPosteriores,
} from './caja-posterior-al-corte.mjs'
import { tipoPagoValido, TIPOS_PAGO } from './carga-comprobantes.mjs'
import { perfilesDePago } from './comprobantes/imputacion-historial.mjs'
import { fila, grilla, COL } from '../scripts/efectivo-raw-pestana.mjs'
import { RENDIR } from './caja-fuentes-banco.mjs'

test('«A rendir» es su propio instrumento, y «Efectivo a rendir» NO cae en efectivo', () => {
  assert.equal(instrumentoDePago('A rendir'), 'a_rendir')
  assert.equal(instrumentoDePago('Efectivo a rendir'), 'a_rendir', 'si cayera en efectivo, el billete saldría dos veces')
  assert.equal(instrumentoDePago('Efectivo'), 'efectivo')
})

test('una compra «A rendir» pagada es REAL (no diferida ni desconocida) y la cubre la entrega', () => {
  const corte = 100
  assert.equal(estadoDeEgreso({ instrumento: 'a_rendir', pagado: true, fecha: 105, corte }), 'REAL',
    'no espera un débito del banco: la plata ya salió con la entrega')
  const c = canalDeMovimiento({ estado: 'REAL', instrumento: 'a_rendir', fecha: 105 }, { corte })
  assert.deepEqual(c, { canal: CANAL.aRendir, cubierto: true })
})

test('el cajón resta sólo «Efectivo»: la fila «A rendir» de Compras no lo toca', () => {
  const cmp = { hoja: 'Compras', desde: 4, tipoPago: 'Q', rubro: 'AF', montoPagado: 'U', estado: 'X', fechaCaja: 'AD', fechaCarga: 'B' }
  const f = formulaComprasEfectivoPosteriores('$F$1', cmp)
  assert.match(f, /="Efectivo"\)/)
  assert.doesNotMatch(f, /rendir/i)
})

test('la entrega SALE con ventana inclusiva; la devolución ENTRA desde el día siguiente', () => {
  const e = formulaEntregasARendirPosteriores('$F$9')
  const d = formulaDevolucionesARendirPosteriores('$F$9')
  assert.match(e, /_EFECTIVO_RAW!\$E\$4:\$E="Entrega"/)
  assert.match(e, />=INT\(\$F\$9\)/, 'sale del cajón: el mismo día del conteo entra (lado conservador)')
  assert.match(e, /-_EFECTIVO_RAW!\$F\$4:\$F/, 'la réplica trae la entrega negativa: la fórmula devuelve el monto positivo')
  assert.match(d, /_EFECTIVO_RAW!\$E\$4:\$E="Devolución"/)
  assert.match(d, />INT\(\$F\$9\)/, 'entra al cajón: desde el día siguiente al conteo')
  assert.doesNotMatch(d, />=INT/)
  for (const x of [e, d]) assert.ok(!x.includes(','), 'es-AR: separador ;')
})

test('el adelanto de sueldo pagado con la entrega vuelve del fondo igual que una devolución (25/09/2026)', () => {
  const d = formulaDevolucionesARendirPosteriores('$F$9')
  assert.match(d, /_EFECTIVO_RAW!\$E\$4:\$E="Adelanto de sueldo"/)
  assert.match(d, /\(\(_EFECTIVO_RAW!\$E\$4:\$E="Devolución"\)\+\(_EFECTIVO_RAW!\$E\$4:\$E="Adelanto de sueldo"\)\)/)
  assert.ok(!d.includes(','), 'es-AR: separador ;')
  // La entrega NO cambia: sigue restando entera el día que sale.
  assert.doesNotMatch(formulaEntregasARendirPosteriores('$F$9'), /Adelanto/)
})

test('la réplica y las fórmulas hablan de las mismas columnas', () => {
  assert.equal(COL.fecha, RENDIR.fecha)
  assert.equal(COL.movimiento, RENDIR.movimiento)
  assert.equal(COL.importe, RENDIR.importe)
  assert.deepEqual(fila({ fecha: new Date('2026-09-22T00:00:00Z'), codigo: 'ER-0001', persona: 'X', destino: 'Galpón 8', movimiento: 'Entrega', importe: '-800000.00' }),
    ['2026-09-22', 'ER-0001', 'X', 'Galpón 8', 'Entrega', -800000])
  const g = grilla([{ fecha: '2026-09-22', codigo: 'ER-0001', movimiento: 'Entrega', importe: -800000 },
    { fecha: '2026-09-23', codigo: 'ER-0001', movimiento: 'Devolución', importe: 300000 }], '2026-09-22 10:00')
  assert.equal(g.length, 3 + 2, 'título, nota, encabezados y una fila por movimiento')
  assert.match(g[1][0], /neto para la caja física -500\.000/)
})

test('«A rendir» está en el desplegable de respaldo y se acepta tal cual', () => {
  assert.ok(TIPOS_PAGO.includes('A rendir'))
  assert.equal(tipoPagoValido('a rendir'), 'A rendir')
})

test('la historia del proveedor NUNCA sugiere «A rendir»: lo decide quién pagó, no a quién', () => {
  const h = Array.from({ length: 5 }, () => ({ proveedor: 'Corralón El Nogal', tipo_pago: 'A rendir' }))
  const p = Object.values(perfilesDePago(h))[0]
  assert.equal(p.sugerido, null)
  assert.equal(p.ultimas.length, 5, 'lo que había se sigue mostrando, sin afirmarlo')
})

test('Comprobantes-gastos volvió a ser sólo compras: el efectivo vive en su propio canal', async () => {
  // Dos pedidos del dueño el 22/09/2026, en este orden: «en el canal comprobantes gastos tb se van a subir
  // comprobantes de consumos en efectivo q actualmente esta todo armado», y después «quiero usar el canal
  // "envio de comprobantes" en lugar del nuevo q has creado». Conviven: quien NO tiene efectivo a rendir
  // abierto carga como siempre, y su foto no la reclama Rendiciones.
  const { especialista } = await import('../comunicacion/especialistas/rendiciones.mjs')
  assert.equal(await especialista.reconoce('', { area: 'compras', fileIds: ['x'] }), null,
    'una foto en Comprobantes-gastos no la reclama Rendiciones')
  const { readFileSync } = await import('node:fs')
  const canal = readFileSync(new URL('../comunicacion/especialistas/comprobantes.mjs', import.meta.url), 'utf8')
  // Ni entregas adivinadas ni vales: ese canal no adivina a quién va el efectivo.
  assert.doesNotMatch(canal, /entregasAbiertasDe|atenderVale/)
  // «A rendir» forzado, UNA sola vez y sólo en el camino del NÚMERO ESCRITO (dueño 24/09/2026: «ER-0020» en
  // el mensaje imputa a esa entrega). Sin número el mensaje al circuito es el de siempre — lo prueba la
  // regresión con el post real de las 17:04 (`comprobantes/imputacion-a-entrega.test.mjs`).
  const forzados = [...canal.matchAll(/forzar: \{/g)]
  assert.equal(forzados.length, 1, 'el especialista fuerza «A rendir» en más de un lugar')
  const cargarImputado = canal.indexOf('async function cargarImputado(')
  assert.ok(cargarImputado > 0 && forzados[0].index > cargarImputado, '«A rendir» forzado fuera del camino del número escrito')
})

test('CAJA no cuenta dos veces el ticket rendido: «Ya salió» del día y lo pagado del mes', async () => {
  const { repartirSalidas } = await import('./caja-necesidad-baldes.mjs')
  const RUBRO = 'Efectivo a rendir (fondos en manos de la gente)'
  // Día del ticket: el gasto sale REAL en Materiales y el espejo vuelve REAL en la línea de fondos.
  const dia = [
    { signo: -1, importe: 96400, estado: 'REAL', rubro: 'Materiales', instrumento: 'a_rendir' },
    { signo: 1, importe: 96400, estado: 'REAL', rubro: RUBRO, instrumento: 'a_rendir' },
  ]
  assert.equal(repartirSalidas(dia).yaSalio, 0, 'ese día no salió plata: salió con la entrega')
  // Día de la entrega: sale de verdad.
  assert.equal(repartirSalidas([{ signo: -1, importe: 800000, estado: 'REAL', rubro: RUBRO, instrumento: 'efectivo' }]).yaSalio, 800000)
})

test('el aviso de una entrega: menciona, lleva el enlace a la firma y NO publica el monto', async () => {
  const { textoDelAviso, avisarEntregas } = await import('../scripts/efectivo-avisos.mjs')
  const t = textoDelAviso({ username: 'rsosa', codigo: 'ER-0001', destino: 'Galpón 8', entregaId: 'abc' })
  assert.match(t, /^@rsosa /)
  assert.match(t, /\/mi-informacion\/efectivo\/firmar\?entrega=abc/)
  assert.doesNotMatch(t, /\$|\d{3}\.\d{3}/)
  // Sin canal de Rendiciones no se inventa otro lugar ni se marca como avisada.
  const q = []
  const port = { async query(sql) { q.push(sql); return { rows: /efectivo_entrega e/.test(sql) ? [{ id: 'abc', codigo: 'ER-0001', destino: 'X', username: 'r' }] : [] } } }
  const r = await avisarEntregas(port, { log: { warn() {} }, publicar: async () => 'post1' })
  assert.equal(r.sinCanal, 1)
  assert.ok(!q.some((s) => /update public\.efectivo_entrega/.test(s)))
  // Con canal: publica y marca UNA vez, sólo si el post se pudo releer.
  const q2 = []
  const port2 = { async query(sql) { q2.push(sql); if (/efectivo_entrega e/.test(sql)) return { rows: [{ id: 'abc', codigo: 'ER-0001', destino: 'X', username: 'r' }] }; if (/canales_area/.test(sql)) return { rows: [{ channel_id: 'ch' }] }; return { rows: [] } } }
  assert.equal((await avisarEntregas(port2, { log: {}, publicar: async () => null })).avisadas, 0, 'post no releído: no cuenta')
  assert.equal((await avisarEntregas(port2, { log: {}, publicar: async () => 'post1' })).avisadas, 1)
})

test('el conciliador CAJA ↔ Cash Flow no cuenta «A rendir» como salida futura (auditoría 22/09/2026)', async () => {
  const { comprasPorRubro } = await import('../scripts/conciliar-caja-vs-cashflow.mjs')
  const r = comprasPorRubro({
    cRubro: ['Materiales', 'Materiales'], cFecha: [46300, 46300], cTotal: [1000, 96400],
    cSub: ['', ''], cTipo: ['Transferencia', 'A rendir'],
  }, 46290)
  assert.deepEqual(r.get('Materiales'), [{ fecha: 46300, monto: 1000 }], 'el billete rendido ya salió con la entrega')
})

test('el pipeline escribe _EFECTIVO_RAW ANTES que _CAJA_ANEXO (el anexo la lee por fórmula)', async () => {
  const { PASOS } = await import('./flujo-caja-pasos.mjs')
  const i = PASOS.findIndex(([s]) => s === 'efectivo-raw-pestana.mjs')
  const j = PASOS.findIndex(([s]) => s === 'caja-anexo-pestana.mjs')
  assert.ok(i >= 0 && j >= 0 && i < j, `orden: réplica ${i}, anexo ${j}`)
})

test('SIN IDENTIDAD TODAVÍA, EL AVISO BUSCA A LA PERSONA POR EMAIL Y VA POR DIRECTO, NO AL CANAL (24/09/2026, ER-0020)', async () => {
  const { avisarEntregas } = await import('../scripts/efectivo-avisos.mjs')
  const fila = { id: 'e20', codigo: 'ER-0020', destino: 'Estructura', username: null, mm_user_id: null, usuario_id: 'u-emi', email: 'hys@ecsas.com.ar' }
  const port = { async query(sql) { if (/efectivo_entrega e/.test(sql)) return { rows: [fila] }; if (/canales_area/.test(sql)) return { rows: [{ channel_id: 'canal-efectivo' }] }; return { rows: [] } } }
  const buscados = []; const destinos = []
  const r = await avisarEntregas(port, {
    log: {},
    porEmail: async (email) => { buscados.push(email); return { id: 'mm-emiliano', username: 'emiliano' } },
    directo: async (mmId) => `dm-con-${mmId}`,
    publicar: async (canal) => { destinos.push(canal); return 'post' },
  })
  assert.equal(r.avisadas, 1)
  assert.deepEqual(buscados, ['hys@ecsas.com.ar'])
  assert.deepEqual(destinos, ['dm-con-mm-emiliano'], 'fue al directo, no al canal')
  // Y si Mattermost no lo conoce, el aviso cae al canal con la mención: la firma hace falta igual.
  const destinos2 = []
  await avisarEntregas(port, { log: {}, porEmail: async () => null, publicar: async (c) => { destinos2.push(c); return 'p' } })
  assert.deepEqual(destinos2, ['canal-efectivo'])
})

// ═══ TODO EN EL HILO DEL CANAL EFECTIVO (dueño 24/09/2026) ═══
// «La persona firmó el recibo y no me emitió notificación ni de ida ni de que ya estaba firmado. Todo esto
// pase en el canal efectivo, en el hilo de cada escritura». ER-0020: el directo al dueño salió y se perdió.

test('la migración: la firma y la anulación van al canal sin monto, y el directo al dueño se retiró', async () => {
  const { readFileSync } = await import('node:fs')
  const sql = readFileSync(new URL('../../supabase/migrations/20260924T2200_la_entrega_contesta_en_su_hilo.sql', import.meta.url), 'utf8')
  const cuerpo = sql.slice(sql.indexOf('create or replace function'))
  assert.ok(!cuerpo.includes("'dueno'"), 'ya no se encola nada para el dueño')
  assert.match(sql, /add column if not exists origen_post_id text/)
  // Cada insert al canal, desde su «'canal'» hasta su v_quien, no nombra el monto.
  const alCanal = cuerpo.split("'canal',").slice(1).map((t) => t.slice(0, t.indexOf('v_quien')))
  assert.equal(alCanal.length, 2, 'firma y anulación')
  for (const t of alCanal) {
    assert.ok(!/monto|_efectivo_pesos/.test(t), `el canal no dice el monto: ${t.slice(0, 80)}`)
    assert.ok(t.includes('{persona}'), 'nombra a la persona por mención')
  }
  // El directo a la persona por la anulación se queda.
  assert.match(cuerpo, /'anulacion', 'persona'/)
})

/** Un puerto que contesta la cola y registra cada sentencia. */
function colaFalsa(filas) {
  const q = []
  return {
    q,
    async query(sql, params) {
      q.push({ sql, params })
      if (/from public\.efectivo_aviso a/.test(sql)) return { rows: filas }
      if (/canales_area/.test(sql)) return { rows: [{ channel_id: 'canal-efectivo' }] }
      return { rows: [], rowCount: 0 }
    },
  }
}

test('LA FIRMA SALE EN EL HILO DEL REGISTRO, con la mención y sin monto; NADA por directo al dueño', async () => {
  const { drenarAvisos } = await import('../scripts/efectivo-avisos.mjs')
  const port = colaFalsa([{
    id: 'a1', tipo: 'firmada', destino: 'canal', texto: '✓ {persona} firmó la conformidad de **ER-0020** · 16:23',
    username: null, mm_user_id: null, usuario_id: 'u-emi', email: 'hys@ecsas.com.ar', nombre: 'MALDONADO BATISTA EMILIANO MIGUEL',
    codigo: 'ER-0020', origen_post_id: '1iekghqpj78y5bntwixeofh86e',
  }])
  const posts = []; const directos = []
  const r = await drenarAvisos(port, {
    log: {},
    porEmail: async () => ({ id: 'mm-emi', username: 'emiliano' }),
    directo: async (id) => { directos.push(id); return `dm-${id}` },
    publicar: async (canal, texto, root) => { posts.push({ canal, texto, root }); return 'post-firma' },
  })
  assert.equal(r.enviados, 1)
  assert.deepEqual(posts, [{ canal: 'canal-efectivo', texto: '✓ @emiliano firmó la conformidad de **ER-0020** · 16:23', root: '1iekghqpj78y5bntwixeofh86e' }])
  assert.deepEqual(directos, [], 'no se abrió ningún directo')
  assert.doesNotMatch(posts[0].texto, /\$|\d{1,3}\.\d{3}/, 'sin monto')
  assert.ok(port.q.some((x) => /efectivo_aviso_enviado/.test(x.sql) && x.params[1] === 'post-firma'))
})

test('una entrega de la web (sin hilo) avisa SUELTA en el canal, con el código ER y el nombre si no hay usuario', async () => {
  const { drenarAvisos } = await import('../scripts/efectivo-avisos.mjs')
  const port = colaFalsa([{
    id: 'a2', tipo: 'firmada', destino: 'canal', texto: '✓ {persona} firmó la conformidad de **ER-0030** · 10:05',
    username: null, email: null, nombre: 'PEREZ JUAN', codigo: 'ER-0030', origen_post_id: null,
  }])
  const posts = []
  await drenarAvisos(port, { log: {}, porEmail: async () => null, publicar: async (canal, texto, root) => { posts.push({ canal, texto, root }); return 'p' } })
  assert.deepEqual(posts, [{ canal: 'canal-efectivo', texto: '✓ PEREZ JUAN firmó la conformidad de **ER-0030** · 10:05', root: null }])
})

test('un directo al dueño que quedó encolado de antes NO sale: se descarta diciendo por qué', async () => {
  const { drenarAvisos } = await import('../scripts/efectivo-avisos.mjs')
  const port = colaFalsa([{ id: 'a3', tipo: 'firmada', destino: 'dueno', texto: '**ER-0020** firmada: X recibió $ 20.000,00', codigo: 'ER-0020' }])
  const posts = []
  const r = await drenarAvisos(port, { log: {}, publicar: async (...a) => { posts.push(a); return 'p' }, directo: async () => 'dm' })
  assert.equal(r.enviados, 0)
  assert.deepEqual(posts, [])
  const d = port.q.find((x) => /set intentos = 5/.test(x.sql))
  assert.ok(d && d.params[0] === 'a3' && /retiró/.test(d.params[1]))
})

test('la anulación: a la persona por directo (con monto) y al hilo sin monto; sin directo, el monto NO cae al canal', async () => {
  const { drenarAvisos } = await import('../scripts/efectivo-avisos.mjs')
  const persona = { id: 'a4', tipo: 'anulacion', destino: 'persona', texto: 'Se anuló la entrega de efectivo **ER-0019** ($ 2.000,00): error', username: 'rodrigo', mm_user_id: 'mm-rod', usuario_id: 'u-rod', codigo: 'ER-0019', origen_post_id: 'hilo-19' }
  const canal = { id: 'a5', tipo: 'anulacion', destino: 'canal', texto: '✕ **ER-0019** de {persona} anulada: error\nNo se rinden tickets contra esa entrega.', username: 'rodrigo', usuario_id: 'u-rod', codigo: 'ER-0019', origen_post_id: 'hilo-19' }
  const posts = []
  const publicar = async (c, texto, root) => { posts.push({ c, texto, root }); return `p${posts.length}` }
  await drenarAvisos(colaFalsa([persona, canal]), { log: {}, directo: async (id) => `dm-${id}`, publicar })
  assert.deepEqual(posts, [
    { c: 'dm-mm-rod', texto: persona.texto, root: null },
    { c: 'canal-efectivo', texto: '✕ **ER-0019** de @rodrigo anulada: error\nNo se rinden tickets contra esa entrega.', root: 'hilo-19' },
  ])
  // Sin usuario de Mattermost: el directo no sale y el texto con monto tampoco va al canal.
  const posts2 = []
  const port2 = colaFalsa([{ ...persona, mm_user_id: null }])
  await drenarAvisos(port2, { log: {}, publicar: async (...a) => { posts2.push(a); return 'p' } })
  assert.deepEqual(posts2, [])
  assert.ok(port2.q.some((x) => /set intentos = 5/.test(x.sql) && /monto/.test(x.params[1])))
})

test('LA IDA: con directo, la constancia «📨 Le pedí la firma» se encola al hilo en la misma sentencia que marca avisada', async () => {
  const { avisarEntregas, horaSanJuan } = await import('../scripts/efectivo-avisos.mjs')
  const ahora = new Date('2026-09-24T19:22:10Z')
  assert.equal(horaSanJuan(ahora), '16:22')
  const fila = { id: 'e20', codigo: 'ER-0020', destino: 'Estructura', username: null, mm_user_id: null, usuario_id: 'u-emi', email: 'hys@ecsas.com.ar', nombre: 'MALDONADO BATISTA EMILIANO MIGUEL', entregada_por: 'u-jorge', origen_post_id: 'hilo-20' }
  const q = []
  const port = { async query(sql, params) { q.push({ sql, params }); if (/efectivo_entrega e/.test(sql)) return { rows: [fila] }; if (/canales_area/.test(sql)) return { rows: [{ channel_id: 'canal-efectivo' }] }; return { rows: [] } } }
  const posts = []
  await avisarEntregas(port, { log: {}, ahora: () => ahora, porEmail: async () => ({ id: 'mm-emi', username: 'emiliano' }), directo: async (id) => `dm-${id}`, publicar: async (c, t, root) => { posts.push({ c, root }); return 'post-dm' } })
  assert.deepEqual(posts, [{ c: 'dm-mm-emi', root: null }], 'el enlace va por directo, fuera de todo hilo')
  const marca = q.find((x) => /avisada_en = now\(\)/.test(x.sql))
  assert.match(marca.sql, /insert into public\.efectivo_aviso[\s\S]*'pedido_firma', 'canal'/)
  assert.equal(marca.params[2], '📨 Le pedí la firma de **ER-0020** a @emiliano por mensaje directo · 16:22')
  // Sin Mattermost: el pedido mismo va al HILO y dice por qué no fue por directo; no se encola otra constancia.
  const q2 = []; const posts2 = []
  const port2 = { async query(sql, params) { q2.push({ sql, params }); return port.query(sql, params) } }
  await avisarEntregas(port2, { log: {}, ahora: () => ahora, porEmail: async () => null, publicar: async (c, t, root) => { posts2.push({ c, t, root }); return 'p' } })
  assert.equal(posts2[0].c, 'canal-efectivo')
  assert.equal(posts2[0].root, 'hilo-20')
  assert.match(posts2[0].t, /^📨 No le pude pedir la firma de \*\*ER-0020\*\* a MALDONADO BATISTA EMILIANO MIGUEL por mensaje directo \(no tiene usuario de Mattermost\)/)
  assert.match(posts2[0].t, /firmar\?entrega=e20/)
  assert.doesNotMatch(posts2[0].t, /\$/)
  assert.ok(!q2.some((x) => /pedido_firma/.test(x.sql)))
})

test('el hilo de una entrega hecha por chat se rellena desde la respuesta «Registrado» del outbox', async () => {
  const { rellenarOrigenDesdeElChat } = await import('../scripts/efectivo-avisos.mjs')
  const q = []
  assert.equal(await rellenarOrigenDesdeElChat({ async query(sql) { q.push(sql); return { rowCount: 1 } } }), 1)
  assert.match(q[0], /Registrado: \\\*\\\*\(ER-\[0-9\]\+\)\\\*\\\*/)
  assert.match(q[0], /origen_post_id is null/)
  assert.match(q[0], /between e\.creada_en and e\.creada_en \+ interval '10 minutes'/)
  const sinColumna = { async query() { throw Object.assign(new Error('no existe'), { code: '42703' }) } }
  assert.equal(await rellenarOrigenDesdeElChat(sinColumna), null)
})

test('EL TIMER CORRE EL CICLO ENTERO: relleno del hilo → ida → cola (24/09: el relleno no lo llamaba nadie)', async () => {
  const { readFileSync } = await import('node:fs')
  // Se lee el fuente: importar el script del timer ejecuta su main().
  const timer = readFileSync(new URL('../scripts/procesar-comprobantes-web.mjs', import.meta.url), 'utf8')
  assert.match(timer, /cicloDeAvisos\(port/)
  assert.doesNotMatch(timer, /avisarEntregas\(|drenarAvisos\(/, 'nada suelto que se saltee el relleno')
  const { cicloDeAvisos } = await import('../scripts/efectivo-avisos.mjs')
  const orden = []
  const port = { async query(sql) {
    if (/comunicacion\.outbox/.test(sql)) orden.push('hilo')
    else if (/from public\.efectivo_entrega e/.test(sql)) orden.push('ida')
    else if (/from public\.efectivo_aviso a/.test(sql)) orden.push('cola')
    return { rows: [], rowCount: 0 }
  } }
  await cicloDeAvisos(port, { log: {} })
  assert.deepEqual(orden, ['hilo', 'ida', 'cola'])
})
