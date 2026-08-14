// EL CAMINO COMPLETO: foto en el canal → mensaje con botones. Sin red, sin Postgres, sin modelo.
//
// Lo que se verifica no es que "no tire excepción": es QUÉ dice el mensaje y QUÉ quedó en el fajo.
// Un test que sólo comprobara que la función devuelve algo pasaría con el proveedor equivocado, con
// la obra inventada y con el comprobante duplicado.

// ═══ ESTE ARCHIVO CORRE EN LA CONFIGURACIÓN DE PRODUCCIÓN (14/08) ═══
//
// Hasta el 14/08 la primera línea de este archivo era `process.env.ORQ_COMPROBANTES_BOTONES = '1'`, y
// eso encendía las tarjetas para los 64 tests. Producción corre sin esa variable desde el 13/08: los
// verdes no eran verdes sobre lo desplegado. Medido, sólo 12 de los 64 dependen de los botones, y son
// los que ahora usan `testConBotones` — que enciende el interruptor para ESE test y lo restaura.
//
// Los otros 52 —lectura, ARCA, duplicados, idempotencia, carga automática— corren como corre el bot.
// Que las tarjetas NO se publican por defecto se prueba aparte, en `sin-tarjetas.test.mjs`.

import test from 'node:test'
import { testConBotones } from '../../lib/comprobantes/botones-de-prueba.mjs'
import assert from 'node:assert/strict'
import { procesarPost, armarItem, bajarAdjunto, TEXTO } from './flujo.mjs'
import { repoMemoria, portGuarda, mmFalso, lecturaBarcelo, LISTAS, lecturaCorralonReal, ARCA_CORRALON, LISTAS_COMPRAS, filasCompras, filaCompras, lecturaTiqueBarcelo, filasBarcelo } from './dobles.mjs'
import { ESTADO } from '../../lib/comprobantes/fajo.mjs'
import { indexarCompras } from '../../lib/comprobantes/compras-vivas.mjs'

const URL = 'https://chat.ecsas.com.ar/comprobantes/accion?t=SECRETO'
const ACTOR = { plataforma_user_id: 'u_rodrigo', plataforma_username: 'rodrigo', channel_type: 'P', channel_id: 'c_comprobantes' }

/** Manda un post y deja el reloj del repositorio sincronizado con el del mensaje. */
async function mandar(d, repo, m) {
  repo.en(m.ahora)
  return procesarPost(d, m)
}

function armar({ repo = repoMemoria(), port = portGuarda(), lecturas = [lecturaBarcelo()], listas = LISTAS, archivos, miembros, miembrosRoto } = {}) {
  const mm = mmFalso({
    archivos: archivos ?? { f1: { name: 'factura.jpg', mime: 'image/jpeg' }, f2: { name: 'otra.jpg', mime: 'image/jpeg' } },
    miembros, miembrosRoto,
  })
  let i = 0
  return {
    repo,
    mm,
    d: {
      port, repo, mattermost: mm, url: URL,
      leer: async () => { const c = lecturas[Math.min(i++, lecturas.length - 1)]; return c ? { ok: true, crudo: c } : { ok: false, error: 'ilegible' } },
      listas: async () => listas,
    },
  }
}

const post = (o = {}) => ({
  fileIds: ['f1'], actor: ACTOR, channelId: 'c_comprobantes', postId: 'p1', rootPostId: 'p1',
  ahora: new Date('2026-08-03T10:00:00Z'), ...o,
})

// ── El camino feliz ──────────────────────────────────────────────────────────

testConBotones('una foto en el canal abre un fajo y devuelve el mensaje con los tres botones', async () => {
  const { d, repo } = armar()
  const r = await procesarPost(d, post())
  assert.equal(r.estado, 'confirmar')
  assert.match(r.texto, /COMBUSTIBLES BARCELO|Combustibles Barcelo/)
  assert.match(r.texto, /\| \*\*Total\*\* \| \*\*\$36\.460,30\*\*/)
  assert.match(r.texto, /\| Obra \| Estrella/)
  assert.deepEqual(r.attachments[0].actions.map((a) => a.id), ['confirmar', 'corregir', 'descartar'])
  const f = repo._fajos.get(r.fajoId)
  assert.equal(f.estado, ESTADO.ABIERTO)
  assert.equal(f.items.length, 1)
})

test('NO se escribe nada en el Sheet al recibir la foto: sólo se muestra', async () => {
  const { d, repo } = armar()
  await procesarPost(d, post())
  assert.equal(repo._cargados.size, 0, 'nada se dio por cargado sin un Confirmar')
})

// ── El agrupado de un fajo ───────────────────────────────────────────────────

test('varios adjuntos en UN post son un solo fajo con dos comprobantes', async () => {
  const { d, repo } = armar({
    lecturas: [lecturaBarcelo(), lecturaBarcelo({ numero: '0113-00010490', total: '10.000,00' })],
  })
  const r = await procesarPost(d, post({ fileIds: ['f1', 'f2'] }))
  assert.equal(repo._fajos.get(r.fajoId).items.length, 2)
  assert.match(r.texto, /### 2\. /, 'un bloque por comprobante, no una lista corrida')
})

test('dos posts seguidos del mismo usuario se SUMAN al mismo fajo: una sola confirmación', async () => {
  const { d, repo } = armar({
    lecturas: [lecturaBarcelo(), lecturaBarcelo({ numero: '0113-00010490', total: '10.000,00' })],
  })
  const r1 = await mandar(d, repo, post({ postId: 'p1' }))
  const r2 = await mandar(d, repo, post({ postId: 'p2', fileIds: ['f2'], ahora: new Date('2026-08-03T10:02:00Z') }))
  assert.equal(r1.fajoId, r2.fajoId, 'el segundo post no abre una confirmación nueva')
  assert.equal(repo._fajos.size, 1)
  assert.equal(repo._fajos.get(r2.fajoId).items.length, 2)
  assert.deepEqual(repo._fajos.get(r2.fajoId).post_ids, ['p1', 'p2'])
})

test('la MISMA foto mandada dos veces en la tanda no duplica la línea', async () => {
  const { d, repo } = armar({ lecturas: [lecturaBarcelo(), lecturaBarcelo()] })
  const r1 = await mandar(d, repo, post({ postId: 'p1' }))
  await mandar(d, repo, post({ postId: 'p2', fileIds: ['f2'], ahora: new Date('2026-08-03T10:01:00Z') }))
  assert.equal(repo._fajos.get(r1.fajoId).items.length, 1, 'mismo (CUIT, tipo, número) = un comprobante')
})

test('pasada la ventana, el fajo viejo se cierra y arranca uno nuevo', async () => {
  const { d, repo } = armar({ lecturas: [lecturaBarcelo(), lecturaBarcelo({ numero: '0113-00010490' })] })
  const r1 = await mandar(d, repo, post({ postId: 'p1' }))
  const r2 = await mandar(d, repo, post({ postId: 'p2', fileIds: ['f2'], ahora: new Date('2026-08-03T10:30:00Z') }))
  assert.notEqual(r1.fajoId, r2.fajoId)
  assert.equal(repo._fajos.get(r1.fajoId).estado, ESTADO.DESCARTADO)
})

// ── EL GASTO NO SE PIERDE AL VENCER LA VENTANA (05/08) ───────────────────────
//
// El defecto que este bloque congela costó ocho comprobantes en producción, entre ellos uno de
// $469.564,70: el bot preguntaba algo, la persona tardaba más de cinco minutos, mandaba la foto
// siguiente, y el comprobante anterior se cerraba `descartado` con cero filas SIN QUE NADIE LO
// DIJERA. No es un caso raro: es el caso normal de cualquier comprobante que necesite una respuesta.

test('el comprobante pendiente NO se pierde al vencer la ventana: se muda al fajo nuevo', async () => {
  const { d, repo } = armar({
    // El primero no se puede cargar solo (proveedor fuera del desplegable): queda esperando respuesta.
    lecturas: [lecturaBarcelo({ emisor: 'FERRETERIA EL TORNILLO SRL' }), lecturaBarcelo({ numero: '0113-00010490' })],
  })
  const r1 = await mandar(d, repo, post({ postId: 'p1' }))
  const viejo = repo._fajos.get(r1.fajoId)
  assert.equal(viejo.items.length, 1)

  const r2 = await mandar(d, repo, post({ postId: 'p2', fileIds: ['f2'], ahora: new Date('2026-08-03T10:30:00Z') }))
  const nuevo = repo._fajos.get(r2.fajoId)

  assert.equal(repo._fajos.get(r1.fajoId).estado, ESTADO.DESCARTADO, 'el fajo viejo se cierra igual: un solo abierto por persona y canal')
  assert.equal(nuevo.items.length, 2, 'el pendiente viajó: sin esto el gasto desaparece sin que nadie se entere')
  const proveedores = nuevo.items.map((it) => it.comprobante?.proveedor)
  assert.ok(proveedores.includes('FERRETERIA EL TORNILLO SRL'), 'el que quedó esperando respuesta tiene que seguir en la conversación')
  assert.match(r2.texto, /FERRETERIA EL TORNILLO SRL/, 'y tiene que verse en el mensaje nuevo, con sus botones vivos')
})

test('el mensaje viejo se reescribe: no quedan botones que digan que se perdió algo que no se perdió', async () => {
  const { d, repo, mm } = armar({
    lecturas: [lecturaBarcelo({ emisor: 'FERRETERIA EL TORNILLO SRL' }), lecturaBarcelo({ numero: '0113-00010490' })],
  })
  const r1 = await mandar(d, repo, post({ postId: 'p1' }))
  // El aviso con botones lo publica el especialista; acá se simula esa anotación.
  await repo.guardarAvisoPost(null, { id: r1.fajoId, avisoPostId: 'aviso_1' })
  await mm.crearPost({ channel_id: 'c_comprobantes', message: 'viejo' })
  mm.posts[mm.posts.length - 1].id = 'aviso_1'

  await mandar(d, repo, post({ postId: 'p2', fileIds: ['f2'], ahora: new Date('2026-08-03T10:30:00Z') }))

  const aviso = mm.posts.find((p) => p.id === 'aviso_1')
  assert.match(aviso.message, /no se perdieron/, 'el mensaje viejo tiene que decir la verdad de lo que pasó')
  assert.deepEqual(aviso.props.attachments, [], 'y quedarse sin botones muertos')
})

test('lo que YA está cargado no se muda: mudar un cargado lo pondría de nuevo en la cola', async () => {
  const { d, repo } = armar({ lecturas: [lecturaBarcelo({ emisor: 'FERRETERIA EL TORNILLO SRL' }), lecturaBarcelo({ numero: '0113-00010490' })] })
  const r1 = await mandar(d, repo, post({ postId: 'p1' }))
  // Se marca como ya cargado, igual que si Compras lo hubiera desmentido entre un post y el otro.
  repo._fajos.get(r1.fajoId).items[0].yaCargado = { fila: 700, hoja: 'Compras' }

  const r2 = await mandar(d, repo, post({ postId: 'p2', fileIds: ['f2'], ahora: new Date('2026-08-03T10:30:00Z') }))
  assert.equal(repo._fajos.get(r2.fajoId).items.length, 1, 'sólo viaja lo que sigue pendiente de una respuesta')
})

// ── Proveedor desconocido ────────────────────────────────────────────────────

testConBotones('PROVEEDOR DESCONOCIDO: se pregunta, no se inventa, y no se ofrece Confirmar', async () => {
  const { d } = armar({ lecturas: [lecturaBarcelo({ emisor: 'FERRETERIA EL TORNILLO SRL' })] })
  const r = await procesarPost(d, post())
  assert.match(r.texto, /no está en el desplegable de Compras/)
  assert.match(r.texto, /Corregir/, 'una pregunta sin la acción que la contesta deja el comprobante trabado')
  assert.match(r.texto, /FERRETERIA EL TORNILLO SRL/, 'se nombra al proveedor, no un "hubo un problema"')
  assert.deepEqual(r.attachments[0].actions.map((a) => a.id), ['corregir', 'descartar'])
})

test('un proveedor con otra grafía SÍ matchea contra el desplegable estricto', () => {
  const it = armarItem({ lectura: lecturaBarcelo({ emisor: 'combustibles barcelo' }), listas: LISTAS })
  assert.equal(it.comprobante.proveedor, 'Combustibles Barcelo')
  assert.equal(it.proveedorNuevo, false)
})

test('si NO se pudieron leer las listas, no se acusa al proveedor de nuevo', () => {
  const it = armarItem({ lectura: lecturaBarcelo({ emisor: 'CUALQUIER COSA SA' }), listas: { ok: false, proveedores: [], obras: [] } })
  assert.equal(it.proveedorNuevo, false, '"no sé" no es lo mismo que "no está"')
  assert.equal(it.listasVerificadas, false, 'y queda declarado')
})

// ── Sin obra ─────────────────────────────────────────────────────────────────

testConBotones('sin anotación manuscrita, la obra se PREGUNTA — pero ya no bloquea (03/08/2026)', async () => {
  const { d } = armar({ lecturas: [lecturaBarcelo({ anotacion_manuscrita: null })] })
  const r = await procesarPost(d, post())
  assert.match(r.texto, /❓ \*\*¿A qué obra va\?\*\*/)
  // Sin historia de este proveedor no hay opciones que ofrecer, y se dice POR QUÉ en vez de dejar la
  // pregunta pelada. Con historia, el mensaje trae las obras contadas (ver mensaje.test.mjs).
  assert.match(r.texto, /No tengo ninguna carga anterior de \*\*Combustibles Barcelo\*\* en Compras/)
  // El dueño decidió que se cargue igual: el Confirmar está, y al lado dice que va sin imputar.
  assert.ok(r.attachments.at(-1).actions.some((a) => a.id === 'confirmar'))
  assert.match(r.texto, /⚠️ Va \*\*sin obra\*\* — completala en Compras/)
})

// ── Idempotencia ─────────────────────────────────────────────────────────────

testConBotones('un comprobante YA CARGADO se avisa con su fila, y no se ofrece cargarlo de nuevo', async () => {
  const repo = repoMemoria()
  repo._cargados.set('c:30712345678|0113-00010489', { clave: 'c:30712345678|0113-00010489', fila: 412, hoja: 'Compras' })
  const { d } = armar({ repo })
  const r = await procesarPost(d, post())
  assert.match(r.texto, /Ya está cargado\*\* — fila 412/)
  assert.ok(!r.attachments[0].actions.some((a) => a.id === 'confirmar'))
})

// ── La puerta ────────────────────────────────────────────────────────────────

test('desde un canal que NO es el oficial no se carga nada', async () => {
  const { d } = armar({ port: portGuarda({ canalOk: false }) })
  const r = await procesarPost(d, post())
  assert.equal(r.estado, 'rechazado_canal')
  assert.match(r.texto, /canal de comprobantes/)
})

// EL PEDIDO DEL DUEÑO, 03/08: «todos los q esten ese canal tienen q estar habilitados a cargar».
// Hasta ese día este test decía lo contrario ("estar en el canal NO habilita") y era correcto para
// la regla anterior. La regla cambió: se reescribe, no se borra, y queda dicho por qué.
test('estar en el canal HABILITA, aunque no haya grant', async () => {
  const { d } = armar({
    port: portGuarda({ permisoOk: false }),
    miembros: { c_comprobantes: ['u_rodrigo'] },
  })
  const r = await procesarPost(d, post())
  assert.notEqual(r.estado, 'rechazado_permiso')
})

test('sin grant Y sin estar en el canal, se deniega', async () => {
  const { d } = armar({ port: portGuarda({ permisoOk: false }), miembros: {} })
  const r = await procesarPost(d, post())
  assert.equal(r.estado, 'rechazado_permiso')
  assert.match(r.texto, /No pude habilitarte/)
  // El mensaje tiene que nombrar la acción que destraba —estar en el canal— y no mandar a pedir
  // un permiso: con la regla vigente, quien llegó hasta acá ya escribió desde el canal oficial.
  assert.match(r.texto, /canal de comprobantes/i)
  assert.doesNotMatch(r.texto, /Ped[íi]sela a Dirección/i)
})

test('membresía de OTRO canal no habilita: se pregunta por el canal oficial', async () => {
  // Cualquiera puede crear un canal y agregarse solo. Si la pregunta fuera "¿es miembro del canal
  // desde el que dice escribir?", el permiso se regalaría. Se pregunta por el canal del binding.
  const { d } = armar({
    port: portGuarda({ permisoOk: false }),
    miembros: { c_cualquiera: ['u_rodrigo'] },
  })
  const r = await procesarPost(d, post())
  assert.equal(r.estado, 'rechazado_permiso')
})

test('FAIL-CLOSED: si no se puede preguntar la membresía, se deniega y se dice que no se pudo', async () => {
  const { d } = armar({ port: portGuarda({ permisoOk: false }), miembrosRoto: true })
  const r = await procesarPost(d, post())
  assert.equal(r.estado, 'rechazado_permiso')
  assert.match(r.texto, /No pude confirmar/)
})

test('un DM se rechaza sin gastar una consulta', async () => {
  const { d } = armar()
  const r = await procesarPost(d, post({ actor: { ...ACTOR, channel_type: 'D' } }))
  assert.equal(r.estado, 'rechazado_canal')
})

test('FAIL-CLOSED: si la base no responde, se deniega', async () => {
  const { d } = armar({ port: portGuarda({ explota: true }) })
  const r = await procesarPost(d, post())
  assert.equal(r.estado, 'rechazado_canal')
  assert.match(r.texto, /no cargué nada/i)
})

test('sin identidad de plataforma no se ejecuta nada', async () => {
  const { d } = armar()
  const r = await procesarPost(d, post({ actor: { ...ACTOR, plataforma_user_id: null } }))
  assert.equal(r.estado, 'rechazado_sin_identidad')
})

test('sin la migración aplicada se avisa y no se revienta', async () => {
  const { d } = armar({ repo: repoMemoria().sinEsquema() })
  const r = await procesarPost(d, post())
  assert.equal(r.estado, 'sin_esquema')
  assert.equal(r.texto, TEXTO.SIN_ESQUEMA)
})

// ── Adjuntos que no sirven ───────────────────────────────────────────────────

test('un formato que no se puede mirar se reporta con nombre y motivo', async () => {
  const mm = mmFalso({ archivos: { f1: { name: 'audio.mp3', mime: 'audio/mpeg' } } })
  const r = await bajarAdjunto(mm, 'f1')
  assert.equal(r.ok, false)
  assert.match(r.error, /audio\/mpeg/)
})

test('un archivo enorme no se baja', async () => {
  const mm = mmFalso({ archivos: { f1: { name: 'foto.jpg', mime: 'image/jpeg', size: 50 * 1024 * 1024 } } })
  const r = await bajarAdjunto(mm, 'f1')
  assert.equal(r.ok, false)
  assert.match(r.error, /pesa demasiado/)
})

test('si ninguno se pudo leer se dice, con el detalle de cada uno', async () => {
  const { d } = armar({ archivos: { f1: { name: 'x.mp3', mime: 'audio/mpeg' } } })
  const r = await procesarPost(d, post())
  assert.equal(r.estado, 'ilegible')
  assert.match(r.texto, /x\.mp3/)
})

test('un adjunto ilegible no tumba a los otros del mismo post', async () => {
  const { d } = armar({
    archivos: { f1: { mime: 'image/jpeg', name: 'ok.jpg' }, f2: { mime: 'audio/mpeg', name: 'malo.mp3' } },
  })
  const r = await procesarPost(d, post({ fileIds: ['f1', 'f2'] }))
  assert.equal(r.estado, 'confirmar')
  // Desde el 05/08 el ilegible no sale en un bloque aparte: sale en la RENDICIÓN, que además cierra
  // la cuenta contra los dos adjuntos que entraron. Ver `lib/comprobantes/rendicion.mjs`.
  assert.match(r.texto, /2 adjuntos/)
  assert.match(r.texto, /malo\.mp3/)
  assert.match(r.texto, /1 que no pude leer/)
})

test('un post sin adjuntos no dispara ningún trabajo', async () => {
  const { d } = armar()
  const r = await procesarPost(d, post({ fileIds: [] }))
  assert.equal(r.estado, 'sin_adjuntos')
})

// ── LA OBRA QUE VIENE DEL MENSAJE, NO DEL PAPEL ──────────────────────────────
//
// Una factura de proveedor NO dice a qué obra se imputa: eso lo sabe quien la manda. La forma
// natural de decirlo en un chat es escribirlo al lado de la foto ("ARCOR" + la imagen), no anotarlo
// a mano en el papel antes de fotografiarlo. Verificado contra el Mattermost vivo: sin esto el bot
// preguntaba por una obra que la persona acababa de escribir un renglón más arriba.

testConBotones('la obra sale de lo que la persona ESCRIBIÓ al mandar la foto', async () => {
  const { d } = armar({ lecturas: [lecturaBarcelo({ anotacion_manuscrita: null })] })
  const r = await procesarPost(d, post({ texto: 'San Francisco' }))
  assert.match(r.texto, /\| Obra \| San Francisco/)
  assert.match(r.texto, /de lo que escribiste/, 'se declara de dónde salió la obra')
  assert.ok(r.attachments[0].actions.some((a) => a.id === 'confirmar'))
})

test('el texto del mensaje NO pisa la obra que dice el comprobante', () => {
  const it = armarItem({
    lectura: lecturaBarcelo({ anotacion_manuscrita: 'Messina' }),
    listas: LISTAS,
    textoPost: 'San Francisco',
  })
  assert.equal(it.comprobante.obra, 'Messina', 'manda el papel')
  assert.equal(it.comprobante.obraVia, 'comprobante')
})

test('un texto que no matchea ninguna obra no inventa nada: se sigue preguntando', async () => {
  const { d } = armar({ lecturas: [lecturaBarcelo({ anotacion_manuscrita: null })] })
  const r = await procesarPost(d, post({ texto: 'ahí te mando la factura, gracias' }))
  assert.match(r.texto, /\| Obra \| _falta/)
  assert.match(r.texto, /a qué obra va/)
  // Lo que NO se hace sigue siendo lo importante: no se rellena la obra con una adivinada. Que se
  // pueda cargar sin ella es otra cosa — la fila queda vacía y visible, no imputada al azar.
  assert.match(r.texto, /⚠️ Va \*\*sin obra\*\*/)
})

test('un texto AMBIGUO entre dos obras no elige una: pregunta', () => {
  // "San" matchea parcialmente con "San Francisco" y nada más; con dos candidatas debe dar null.
  const it = armarItem({
    lectura: lecturaBarcelo({ anotacion_manuscrita: null }),
    listas: { ok: true, proveedores: LISTAS.proveedores, obras: ['San Francisco', 'San Martin'] },
    textoPost: 'San',
  })
  assert.equal(it.comprobante.obra, null, 'elegir una sería tirar una moneda sobre a qué obra va el costo')
})

test('el texto del post vale para TODOS los adjuntos del mismo post', async () => {
  const { d } = armar({
    lecturas: [lecturaBarcelo({ numero: '0001-00000001', anotacion_manuscrita: null }),
      lecturaBarcelo({ numero: '0001-00000002', anotacion_manuscrita: null })],
  })
  const r = await procesarPost(d, post({ fileIds: ['f1', 'f2'], texto: 'Messina' }))
  assert.equal((r.texto.match(/\| Obra \| Messina/g) ?? []).length, 2)
})

// ── EL CASO REAL DEL 03/08: la obra escrita a mano y el duplicado que no se vio ──
//
// El dueño mandó al canal la foto de una factura de Corralón Progreso con "Messinas BSA" escrito a
// mano arriba a la izquierda. El bot contestó `obra: falta · ¿cuál es?` y se ofreció a cargarla —
// cuando ese mismo comprobante ya estaba en Compras fila 802, imputado a MESSINA / Planta de BSA.
// Eran dos defectos: no leer lo manuscrito, y no ver el duplicado porque el número tenía un dígito
// de más. Los cuatro tests de abajo son los cuatro que se ponen rojos si cualquiera de los dos vuelve.

/** Arma el flujo con el padrón de ARCA y la pestaña Compras vivos, como en producción. */
function armarConPadron({ lecturas, filas = filasCompras(), arca = ARCA_CORRALON } = {}) {
  const base = armar({ lecturas, listas: LISTAS_COMPRAS })
  return {
    ...base,
    d: {
      ...base.d,
      arcaDe: async () => arca,
      comprasDe: async () => ({ ok: true, ...indexarCompras(filas) }),
    },
  }
}

/** Otra factura, con un número que ARCA no conoce: aísla la imputación del duplicado. */
const otraFactura = (over) => lecturaCorralonReal({
  numero: '0004-00009999', total: '9.900,00', iva_21: '1.717,36', neto_gravado: '8.182,64',
  fecha: '02/08/2026', legible: true, ...over,
})

testConBotones('la obra ESCRITA A MANO se resuelve sola: no se pregunta lo que está en el papel', async () => {
  const { d } = armarConPadron({ lecturas: [otraFactura({ anotacion_manuscrita: 'Messinas BSA' })] })
  const r = await procesarPost(d, post())
  assert.match(r.texto, /\| Obra \| MESSINA/)
  assert.match(r.texto, /escrito a mano/)
  assert.doesNotMatch(r.texto, /a qué obra va/, 'la obra estaba en el papel: no había nada que preguntar')
  assert.equal(r.attachments[0].actions.some((a) => a.id === 'confirmar'), true)
})

test('la letra manuscrita mal leída se salva con el vocabulario VIVO de la columna K', async () => {
  // Lo que el modelo grande leyó DE VERDAD de esa foto fue "Nuestros BSA": ni siquiera acertó la
  // palabra que nombra la obra. Alcanza igual, porque "BSA" sólo aparece en detalles de MESSINA.
  const { d } = armarConPadron({ lecturas: [otraFactura({ anotacion_manuscrita: 'Nuestros BSA' })] })
  const r = await procesarPost(d, post())
  assert.match(r.texto, /\| Obra \| MESSINA/)
  assert.doesNotMatch(r.texto, /a qué obra va/)
})

test('el DETALLE de la columna K se completa sólo cuando es UNO solo', async () => {
  const { d, repo } = armarConPadron({ lecturas: [otraFactura({ anotacion_manuscrita: 'Messinas Planta de BSA' })] })
  const r = await procesarPost(d, post())
  assert.equal(repo._fajos.get(r.fajoId).items[0].comprobante.detalleObra, 'Planta de BSA')
  assert.match(r.texto, /\| Detalle \| Planta de BSA/)

  // Y con "BSA" a secas, cuando en Compras hay TRES detalles con BSA —los tres de MESSINA—, la obra
  // se resuelve igual y el detalle queda vacío: elegir uno de los tres sería inventar.
  const tresBsa = filasCompras([
    filaCompras('12/6/2026', 'Combustibles Barcelo', 'F A', '0113-00010001', 'MESSINA', 'Camion - BSA', 'gasoil', '$ 1.000,00'),
    filaCompras('13/6/2026', 'Combustibles Barcelo', 'F A', '0113-00010002', 'MESSINA', 'Excavadora - BSA', 'gasoil', '$ 1.000,00'),
  ])
  const otro = armarConPadron({ lecturas: [otraFactura({ anotacion_manuscrita: 'BSA' })], filas: tresBsa })
  const r2 = await procesarPost(otro.d, post())
  const it = otro.repo._fajos.get(r2.fajoId).items[0]
  assert.equal(it.comprobante.obra, 'MESSINA', 'los tres BSA son de MESSINA: la obra es inequívoca')
  assert.equal(it.comprobante.detalleObra, null, 'cuál de los tres, no')
})

test('una anotación AMBIGUA sigue preguntando: el arreglo no es un adivinador', async () => {
  const listas = { ...LISTAS_COMPRAS, obras: ['MESSINA NORTE', 'MESSINA SUR'], detalles: {} }
  // Los importes de este comprobante CIERRAN a propósito: `lecturaCorralonReal` trae el total copiado
  // en el lugar del neto —el defecto real de aquella foto— y desde el 04/08 eso bloquea la carga. Lo
  // que se prueba acá es la obra ambigua, no la aritmética: si el fixture no cerrara, el test pasaría
  // por el motivo equivocado.
  const base = armar({
    lecturas: [lecturaCorralonReal({
      anotacion_manuscrita: 'Messinas', numero: '0004-00009999', fecha: '02/08/2026',
      neto_gravado: '51.239,67', iva_21: '10.760,33', total: '62.000,00',
    })],
    listas,
  })
  const r = await procesarPost({ ...base.d, arcaDe: async () => [], comprasDe: async () => null }, post())
  assert.match(r.texto, /\| Obra \| _falta/)
  assert.match(r.texto, /a qué obra va/)
  // Ambigua = no se elige ninguna. Se carga sin obra y se dice; adivinar entre MESSINA NORTE y
  // MESSINA SUR imputaría el costo a la obra equivocada, que es lo caro.
  assert.match(r.texto, /⚠️ Va \*\*sin obra\*\*/)
})

testConBotones('el DÍGITO DE MÁS se corrige contra ARCA, y ahí aparece el duplicado de la fila 802', async () => {
  const { d, repo } = armarConPadron({ lecturas: [lecturaCorralonReal({ anotacion_manuscrita: 'Messinas BSA' })] })
  const r = await procesarPost(d, post())
  const it = repo._fajos.get(r.fajoId).items[0]
  assert.equal(it.comprobante.numero, '0004-00003642', 'el número bueno es el de ARCA')
  assert.equal(it.comprobante.numeroLeidoMal, '0004-00036542')
  assert.equal(it.comprobante.cuit, '23369111574', 'el CUIT del emisor lo pone el padrón')
  assert.match(r.texto, /había leído \*\*0004-00036542\*\*/)
  assert.match(r.texto, /Ya está cargado\*\* — fila 802 de Compras/)
  assert.match(r.texto, /figura en ARCA \(PEREZ GARCIA MARISOL BIBIANA\)/)
  assert.equal(r.attachments[0].actions.some((a) => a.id === 'confirmar'), false, 'no se ofrece cargar lo que ya está')
})

testConBotones('otra factura del MISMO proveedor el MISMO día NO se marca duplicada', async () => {
  // La 3366 de $31.533,90 existe de verdad y es otra compra. Marcarla duplicada sería una alarma
  // falsa, y una alarma que suena por nada deja de leerse.
  const { d } = armarConPadron({
    lecturas: [lecturaCorralonReal({
      numero: '0006-00003400', total: '48.400,00', iva_21: '8.400,00', neto_gravado: '40.000,00',
      anotacion_manuscrita: 'Messinas BSA', legible: true,
    })],
  })
  const r = await procesarPost(d, post())
  assert.doesNotMatch(r.texto, /[Yy]a está cargado/)
  assert.doesNotMatch(r.texto, /puede que ya esté cargado/)
  assert.match(r.texto, /no figura en ARCA/, 'y se dice que no se pudo verificar, en vez de callarlo')
  assert.equal(r.attachments[0].actions.some((a) => a.id === 'confirmar'), true)
})

testConBotones('mismo proveedor, día e importe con OTRO número: se pregunta con botones, no se decide', async () => {
  const { d } = armarConPadron({
    lecturas: [lecturaCorralonReal({ numero: '0009-00000123', anotacion_manuscrita: 'Messinas BSA' })],
    arca: [], // sin ARCA que corrija el número, queda el probable duplicado a secas
  })
  const r = await procesarPost(d, post())
  assert.match(r.texto, /Puede que ya esté cargado\*\* — fila 802/)
  assert.deepEqual(r.attachments[0].actions.map((a) => a.id), ['dupmismo', 'dupotro', 'descartar'])
})

test('sin ARCA y sin Compras el flujo sigue, y DECLARA que no pudo verificar', async () => {
  const { d } = armar({ lecturas: [lecturaCorralonReal({ anotacion_manuscrita: 'Estrella' })], listas: LISTAS })
  const r = await procesarPost(d, post())
  assert.equal(r.estado, 'confirmar')
  assert.match(r.texto, /no pude verificarlo contra ARCA/)
})

// ═══ EL TIQUE DE COMBUSTIBLE (03/08) ═══
//
// El bot leyó bien el papel, dijo "no figura en ARCA" y ofreció **Confirmar y cargar** un gasto que
// ya estaba en Compras fila 800. Estos tests se ponen rojos si vuelve cualquiera de las dos causas:
// que la búsqueda del duplicado dependa de ARCA o del tipo de comprobante, y que la imputación no
// aproveche lo que la empresa ya hizo con ese proveedor.

/** El flujo con la pestaña Compras viva y SIN ARCA — que es como llega un tique de estación. */
function armarTique({ filas = filasBarcelo(), arca = [], listas = LISTAS_COMPRAS, lecturas } = {}) {
  const base = armar({ lecturas: lecturas ?? [lecturaTiqueBarcelo()], listas })
  return {
    ...base,
    d: { ...base.d, arcaDe: async () => arca, comprasDe: async () => ({ ok: true, ...indexarCompras(filas) }) },
  }
}

testConBotones('un comprobante AUSENTE de ARCA se busca IGUAL en Compras: ahí estaba, fila 800', async () => {
  const { d, repo } = armarTique()
  const r = await procesarPost(d, post())
  const it = repo._fajos.get(r.fajoId).items[0]
  assert.equal(it.comprobante.tipo, null, 'de un tique la visión no sacó la letra: así llegó el caso real')
  assert.equal(it.yaCargado.fila, 800, 'el tipo faltaba, pero (proveedor, número) alcanza')
  assert.match(r.texto.split('\n')[0], /Ya está cargado/, 'y se lee en la primera línea')
  assert.match(r.texto, /fila 800/)
  assert.match(r.texto, /no figura en ARCA/)
  assert.equal(r.attachments[0].actions.some((a) => a.id === 'confirmar'), false,
    'NO se ofrece "Confirmar y cargar" un gasto que ya está en el Flujo de Fondos')
})

test('que ARCA no lo tenga no puede apagar la búsqueda: sin ARCA se encuentra igual', async () => {
  // El mismo tique, con ARCA devolviendo filas de otro proveedor (o sea: sin registro para éste).
  const { d } = armarTique({ arca: ARCA_CORRALON })
  const r = await procesarPost(d, post())
  assert.match(r.texto, /Ya está cargado\*\* — fila 800/)
})

test('el DETALLE de la columna K sale del historial de ese proveedor EN ESA obra', async () => {
  // El mismo tique con OTRO número (no está cargado) y sin la anotación manuscrita: la obra la
  // resuelve el historial y el detalle también, porque (Barcelo, MESSINA) → "Camion - BSA".
  const { d, repo } = armarTique({
    lecturas: [lecturaTiqueBarcelo({ numero: '00113-00019999', anotacion_manuscrita: null, total: '20.000,00', iva_21: '3.471,07', otros_tributos: null })],
  })
  const r = await procesarPost(d, post())
  const it = repo._fajos.get(r.fajoId).items[0]
  assert.equal(it.comprobante.obra, 'MESSINA')
  assert.equal(it.comprobante.detalleObra, 'Camion - BSA')
  assert.equal(it.comprobante.obraVia, 'historial')
  assert.match(r.texto, /\| Detalle \| Camion - BSA _\(sugerido: \d+ de \d+ cargas de este proveedor en MESSINA\)_/,
    'se dice de dónde salió: el dueño tiene que poder desconfiar')
})

test('lo ESCRITO A MANO manda sobre el historial: no se discute con el papel', async () => {
  const filas = filasBarcelo({ cargado: false })
  const { d, repo } = armarTique({
    filas,
    lecturas: [lecturaTiqueBarcelo({ numero: '00113-00019998', anotacion_manuscrita: 'ARCOR', total: '20.000,00', iva_21: '3.471,07', otros_tributos: null })],
  })
  const r = await procesarPost(d, post())
  const it = repo._fajos.get(r.fajoId).items[0]
  assert.equal(it.comprobante.obra, 'ARCOR', 'el historial dice MESSINA 6 de 6 y no importa: el papel dice ARCOR')
  assert.equal(it.comprobante.obraVia, 'comprobante')
  assert.equal(it.comprobante.detalleObra, null, 'y no se le cuelga el detalle de MESSINA a una compra de ARCOR')
})

test('sin historia suficiente NO se adivina la obra: se pregunta', async () => {
  const { d, repo } = armarTique({
    filas: filasBarcelo({ conHistoria: false, cargado: false }),
    // El neto acompaña al total: 16.528,93 + 3.471,07 = 20.000,00. Un fixture cuyos importes no
    // cierran ya no llega a cargarse (04/08), y este test es sobre la obra, no sobre la aritmética.
    lecturas: [lecturaTiqueBarcelo({ numero: '00113-00019997', anotacion_manuscrita: null, neto_gravado: '16.528,93', total: '20.000,00', iva_21: '3.471,07', otros_tributos: null })],
  })
  const r = await procesarPost(d, post())
  assert.equal(repo._fajos.get(r.fajoId).items[0].comprobante.obra, null)
  assert.match(r.texto, /a qué obra va/)
  assert.match(r.texto, /⚠️ Va \*\*sin obra\*\*/, 'se carga sin obra, y se dice — no se adivina')
})

test('si no se pudo leer Compras, se DICE — no se deja creer que se miró', async () => {
  const base = armar({ lecturas: [lecturaTiqueBarcelo()], listas: LISTAS_COMPRAS })
  const r = await procesarPost({ ...base.d, arcaDe: async () => [], comprasDe: async () => ({ ok: false, error: 'timeout' }) }, post())
  assert.match(r.texto, /no pude leer la pestaña Compras/)
})

test('lo manuscrito se matchea contra J Y contra K: "Camion BSA - Messina" son DOS datos', async () => {
  // Escrito a mano arriba del tique. El bot sacaba la obra y dejaba el detalle vacío; la fila 800,
  // cargada a mano, dice MESSINA / Camion - BSA. El dato estaba escrito y no se usaba.
  const { d, repo } = armarTique({
    filas: filasBarcelo({ cargado: false }),
    lecturas: [lecturaTiqueBarcelo({ numero: '00113-00019996', total: '20.000,00', iva_21: '3.471,07', otros_tributos: null })],
  })
  const r = await procesarPost(d, post())
  const c = repo._fajos.get(r.fajoId).items[0].comprobante
  assert.equal(c.obra, 'MESSINA')
  assert.equal(c.detalleObra, 'Camion - BSA')
  assert.equal(c.obraVia, 'comprobante', 'del papel, no del historial')
  assert.equal(c.detalleVia, 'palabras', 'del papel también: "Camion BSA" identifica el detalle')
  // Y los productos del ticket son el CONCEPTO (columna L), nunca el detalle (columna K).
  assert.equal(c.concepto, 'Nafta Super 1 y Diesel 500')
  assert.match(r.texto, /\| Concepto \| Nafta Super 1 y Diesel 500 \|/)
})

// ── SE CARGA SOLO: mandar la foto ES el pedido (04/08) ───────────────────────
//
// El dueño lo pidió textual: "quiero que todo funcione, mandar una foto y que se cargue perfecto sin
// fallas". Un fajo de veinte comprobantes eran veinte clicks, y cada click es una chance de que el
// flujo se abandone a mitad — el gasto sin cargar en ningún lado es el peor resultado posible.
//
// La condición no se inventó para esto: es `estaCompleto`, la misma que decide si hay algo que
// preguntar. Lo que cambió es que, cuando no falta nada, no se le hace perder el tiempo a nadie.

/** El escritor de mentira. Nunca se corre el cargador de verdad acá. */
function conEscritor(over = {}) {
  const llamadas = []
  const escribir = async (fajo) => {
    llamadas.push(fajo)
    return { estado: ESTADO.CARGADO, texto: '✔ **Cargado** — Compras, fila 810.' }
  }
  return { escribir, llamadas, ...over }
}

test('un comprobante al que no le falta nada SE CARGA SOLO, sin botones y sin clicks', async () => {
  const { d, repo } = armar()
  const { escribir, llamadas } = conEscritor()
  const r = await procesarPost({ ...d, escribir }, post())

  assert.equal(llamadas.length, 1, 'se escribió, y una sola vez')
  assert.match(r.texto, /Cargado/)
  assert.equal(r.attachments, undefined, 'no quedan botones esperando a nadie')
  assert.notEqual(r.estado, 'confirmar')
  // El fajo NO queda abierto: si quedara, el próximo post se le sumaría y se cargaría dos veces.
  assert.notEqual(repo._fajos.get(r.fajoId).estado, 'abierto')
})

testConBotones('el que SÍ tiene algo que preguntar sigue parando en los botones', async () => {
  // Proveedor fuera del desplegable: agregarlo a la lista de Compras es una decisión de una persona.
  const { d } = armar({ listas: { ok: true, proveedores: ['ACEROLATINA'], obras: LISTAS.obras } })
  const { escribir, llamadas } = conEscritor()
  const r = await procesarPost({ ...d, escribir }, post())

  assert.equal(llamadas.length, 0, 'no se escribe nada mientras haya una pregunta abierta')
  assert.equal(r.estado, 'confirmar')
  assert.ok(r.attachments?.length, 'y los botones siguen ahí')
})

// ═══ NO PREGUNTA NADA — EL PEDIDO DEL DUEÑO DEL 13/08 ════════════════════════
//
// Textual: "no quiero q pregunte nada, quiero q el mismo mecanismo de carga por esta via sea el q se
// usa por la via de mattermost". El cargador que corre Claude Code escribe la fila con la imputación
// vacía y el dueño la completa en el Sheet; el bot frenaba en un menú apenas alguna de las cuatro
// columnas con desplegable quedara sin resolver — o sea casi siempre. Ésa era la falencia.
//
// EL LÍMITE QUE NO SE CRUZA: no se inventa la obra. Se carga con la celda VACÍA y se dice cuál es.

test('un comprobante SIN OBRA deducible se carga solo, con la celda vacía y declarándolo', async () => {
  // Sin anotación manuscrita y sin nada en el texto del post: no hay de dónde sacar la obra.
  const { d } = armar({ lecturas: [lecturaBarcelo({ anotacion_manuscrita: null })] })
  const { escribir, llamadas } = conEscritor()
  const r = await procesarPost({ ...d, escribir }, post({ texto: null }))

  assert.equal(llamadas.length, 1, 'se carga igual: una foto que no llega a Compras es un gasto perdido')
  assert.equal(r.attachments, undefined, 'y NO se le pregunta nada')
  assert.equal(llamadas[0].items[0].comprobante.obra, null, 'la obra queda VACÍA, no inventada')
  assert.notEqual(llamadas[0].items[0].comprobante.obra, 'Estrella')
})

test('la obra que SÍ se puede deducir se sigue deduciendo: no preguntar no es no mirar', async () => {
  const { d } = armar()
  const { escribir, llamadas } = conEscritor()
  await procesarPost({ ...d, escribir }, post())
  assert.equal(llamadas[0].items[0].comprobante.obra, 'Estrella', 'la anotación manuscrita manda')
})

// ═══ UNA FOTO MALA NO PUEDE FRENAR A LAS OTRAS ONCE (13/08) ══════════════════
//
// `items.every(estaCompleto)` hacía que un solo comprobante trabado dejara toda la tanda esperando un
// click. En una carga fuerte eso es la diferencia entre cargar todo y no cargar nada.
testConBotones('en una tanda mixta entran los buenos y sólo el trabado queda preguntando', async () => {
  const { d, repo } = armar({
    lecturas: [
      lecturaBarcelo(),                                                   // carga solo
      lecturaBarcelo({ numero: '0113-00010490', emisor: 'FERRETERIA EL TORNILLO SRL' }), // proveedor nuevo
    ],
  })
  const { escribir, llamadas } = conEscritor()
  const r = await procesarPost({ ...d, escribir }, post({ fileIds: ['f1', 'f2'] }))

  assert.equal(llamadas.length, 1, 'se escribió')
  assert.equal(llamadas[0].items.length, 2, 'al escritor le llega el fajo entero; él filtra por estaCompleto')
  assert.match(r.texto, /Cargado/)
  assert.ok(r.attachments?.length, 'y el trabado queda con sus botones')
  assert.match(r.texto, /no los pude cargar solos|no lo pude cargar solo/)
  // El fajo nuevo tiene SÓLO el trabado: si arrastrara el cargado, un Confirmar lo cargaría dos veces.
  const nuevo = repo._fajos.get(r.fajoId)
  assert.equal(nuevo.estado, ESTADO.ABIERTO)
  assert.equal(nuevo.items.length, 1)
  assert.equal(nuevo.items[0].comprobante.numero, '0113-00010490')
})

// ═══ UN NÚMERO PARA TODA LA TANDA (13/08) ═══
//
// Mattermost limita los adjuntos por post, así que treinta fotos son tres o cuatro posts y tres o
// cuatro resúmenes. Sumar cuatro mensajes a mano para saber si entró todo es la fricción que este
// flujo existe para sacar.
test('el acumulado de la tanda se informa cuando hay más cargado que en este post', async () => {
  const { d, repo } = armar()
  const { escribir } = conEscritor()
  const repoConTanda = { ...repo, acumuladoDeLaTanda: async () => ({ cuantos: 23, suma: 4128900 }) }
  const r = await procesarPost({ ...d, repo: repoConTanda, escribir }, post())
  assert.match(r.texto, /En esta tanda llevás 23 comprobantes por \*\*\$4\.128\.900\*\*/)
})

test('si la tanda es este post y nada más, el acumulado no se repite', async () => {
  const { d, repo } = armar()
  const { escribir } = conEscritor()
  const repoConTanda = { ...repo, acumuladoDeLaTanda: async () => ({ cuantos: 1, suma: 36460.30 }) }
  const r = await procesarPost({ ...d, repo: repoConTanda, escribir }, post())
  assert.doesNotMatch(r.texto, /En esta tanda/, 'el mismo dato dos veces se deja de leer')
})

test('si el acumulado no se puede consultar, el mensaje sale igual: es informativo', async () => {
  const { d, repo } = armar()
  const { escribir } = conEscritor()
  const repoRoto = { ...repo, acumuladoDeLaTanda: async () => { throw new Error('base caída') } }
  const r = await procesarPost({ ...d, repo: repoRoto, escribir }, post())
  assert.match(r.texto, /Cargado/, 'saber dónde quedó el gasto no depende de un renglón de color')
})

test('si NINGUNO se puede cargar solo, no se toma el fajo ni se escribe: se pregunta como siempre', async () => {
  const { d } = armar({ lecturas: [lecturaBarcelo({ emisor: 'FERRETERIA EL TORNILLO SRL' })] })
  const { escribir, llamadas } = conEscritor()
  const r = await procesarPost({ ...d, escribir }, post())
  assert.equal(llamadas.length, 0)
  assert.equal(r.estado, 'confirmar')
})

test('sin escritor inyectado NO se carga solo: el flujo viejo queda intacto', async () => {
  const { d } = armar()
  const r = await procesarPost(d, post())
  assert.equal(r.estado, 'confirmar')
})

// LA CARRERA. Dos posts casi simultáneos de la misma persona pueden llegar acá con el mismo fajo:
// el `tomarParaConfirmar` es un compare-and-set y el que pierde no tiene que escribir NADA. Sin esto,
// el mismo comprobante entra dos veces a Compras y el costo de la obra se duplica.
test('si alguien ya tomó el fajo, la carga automática no escribe', async () => {
  const { d, repo } = armar()
  const { escribir, llamadas } = conEscritor()
  // El repositorio devuelve null en `tomarParaConfirmar`: alguien se lo llevó primero.
  const repoTomado = { ...repo, tomarParaConfirmar: async () => null }
  const r = await procesarPost({ ...d, repo: repoTomado, escribir }, post())
  assert.equal(llamadas.length, 0)
  assert.equal(r.estado, 'confirmar', 'se degrada al mensaje con botones, no se pierde el fajo')
})

// Que la escritura reviente no puede tumbar el post ni dejar el fajo trabado: se reabre para poder
// reintentar, y se dice. Un fajo que queda en `confirmado` para siempre es un comprobante perdido.
test('si la escritura revienta, el fajo vuelve a abierto y se avisa', async () => {
  const { d, repo } = armar()
  const escribir = async () => { throw new Error('Google no contesta') }
  const r = await procesarPost({ ...d, escribir }, post())
  assert.equal(r.estado, 'error')
  assert.match(r.texto, /Google no contesta/)
  assert.equal(repo._fajos.get(r.fajoId).estado, 'abierto', 'se puede reintentar')
})

// ═══ LA FILA BORRADA A MANO (04/08) ═══
//
// El OS cargó el tique en la fila 810 y lo anotó en su registro. El dueño borró esa fila. Mandó la
// foto de nuevo y el bot contestó "Ya está cargado — Compras fila 810. No hay nada que cargar":
// el comprobante quedaba imposible de cargar para siempre, con un mensaje que sonaba a que todo
// estaba bien.
//
// La regla del OS: un control no se valida contra la información que él mismo produce. El registro
// dice lo que ESTE sistema escribió; la pestaña dice lo que HAY. Cuando difieren, manda la pestaña.
test('si el dueño borró la fila, la pestaña le gana al registro y se vuelve a cargar', async () => {
  const repo = repoMemoria()
  const { d } = armar({ repo })
  const clave = 'c:30712345678|0113-00010489'
  // El registro dice que está en la 810…
  repo._cargados.set(clave, { clave, fila: 810, hoja: 'Compras' })
  // …y Compras, leída de verdad, no lo tiene.
  const { escribir, llamadas } = conEscritor()
  const r = await procesarPost({ ...d, escribir, comprasDe: async () => ({ ok: true, ...indexarCompras([]) }) }, post())

  assert.equal(llamadas.length, 1, 'se vuelve a cargar')
  assert.doesNotMatch(r.texto, /Ya está cargado/)
  assert.equal(repo._cargados.has(clave), false, 'y el registro obsoleto se borra, no se ignora una vez')
})

// La otra mitad, y la que impide que el arreglo se convierta en un duplicador: cuando la fila SÍ
// está en Compras, el aviso sigue igual y no se carga nada.
test('si la fila SÍ está en Compras, sigue sin duplicarse', async () => {
  const repo = repoMemoria()
  const { d } = armar({ repo })
  const clave = 'c:30712345678|0113-00010489'
  repo._cargados.set(clave, { clave, fila: 810, hoja: 'Compras' })
  const enCompras = { ok: true, ...indexarCompras([
    ...Array.from({ length: 808 }, () => []),
    filaCompras('5/1/2026', 'Combustibles Barcelo', 'F A', '0113-00010489', 'Estrella', '', 'Gasoil', '$ 36.460,30'),
  ]) }
  const { escribir, llamadas } = conEscritor()
  const r = await procesarPost({ ...d, escribir, comprasDe: async () => enCompras }, post())

  assert.equal(llamadas.length, 0, 'no se duplica')
  assert.match(r.texto, /[Yy]a est/)
  assert.equal(repo._cargados.has(clave), true, 'el registro que la pestaña CONFIRMA no se toca')
})

// NO PODER MIRAR NO ES HABER MIRADO. Si Compras no se pudo leer, no hay desmentido: el registro se
// respeta. Degradar a "cargalo igual" ahí sería duplicar un gasto cada vez que Google no contesta.
test('si no se pudo leer Compras, el registro se respeta', async () => {
  const repo = repoMemoria()
  const { d } = armar({ repo })
  const clave = 'c:30712345678|0113-00010489'
  repo._cargados.set(clave, { clave, fila: 810, hoja: 'Compras' })
  const { escribir, llamadas } = conEscritor()
  await procesarPost({ ...d, escribir, comprasDe: async () => ({ ok: false, error: 'Google no contesta' }) }, post())

  assert.equal(llamadas.length, 0)
  assert.equal(repo._cargados.has(clave), true)
})

// ═══ UN "PROBABLE" NO DESMIENTE AL REGISTRO (13/08) ═══
//
// La condición para dar el registro por vencido era «Compras no lo devolvió como CARGADO», y un
// hallazgo PROBABLE cumple eso. O sea: el bot dudaba de si el comprobante ya estaba y, POR DUDAR,
// borraba la clave de idempotencia — el único freno que tenía para no escribirlo dos veces.
//
// No es hipotético. Medido contra el registro real y la pestaña viva el 13/08, tres comprobantes
// caían justo ahí porque el punto de venta se había leído distinto y el importe también:
//
//   Alumetal        `0036-00025942` contra la fila 797 `0038-00025942`   $2.014.940,07
//   VILLA DEL PINO  `0001-00015177` contra la fila 812 `00015-00015177`  $105.000,67
//   Hormiserv N C   `0005-00000386` contra la fila 815 `00005-00000386`  −$686.070
//
// Reenviar cualquiera de esos tres los habría cargado por segunda vez, sin un solo aviso.
test('un duplicado PROBABLE no borra la clave de idempotencia: dudar no es haber mirado', async () => {
  const repo = repoMemoria()
  const { d } = armar({ repo })
  const clave = 'c:30712345678|0113-00010489'
  repo._cargados.set(clave, { clave, fila: 810, hoja: 'Compras' })
  // La misma factura en Compras con el número a UN DÍGITO de distancia: `…10489` contra `…10480`.
  // Es el hallazgo PROBABLE, no el CARGADO.
  const enCompras = { ok: true, ...indexarCompras([
    ...Array.from({ length: 808 }, () => []),
    filaCompras('5/1/2026', 'Combustibles Barcelo', 'F A', '0113-00010480', 'Estrella', '', 'Gasoil', '$ 99.999,99'),
  ]) }
  const { escribir, llamadas } = conEscritor()
  await procesarPost({ ...d, escribir, comprasDe: async () => enCompras }, post())

  assert.equal(llamadas.length, 0, 'con un duplicado probable no se escribe solo')
  assert.equal(repo._cargados.has(clave), true, 'y sobre todo: la clave sigue puesta')
})
