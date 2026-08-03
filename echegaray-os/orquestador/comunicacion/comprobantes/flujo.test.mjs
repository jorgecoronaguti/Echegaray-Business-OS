// EL CAMINO COMPLETO: foto en el canal → mensaje con botones. Sin red, sin Postgres, sin modelo.
//
// Lo que se verifica no es que "no tire excepción": es QUÉ dice el mensaje y QUÉ quedó en el fajo.
// Un test que sólo comprobara que la función devuelve algo pasaría con el proveedor equivocado, con
// la obra inventada y con el comprobante duplicado.

import test from 'node:test'
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

function armar({ repo = repoMemoria(), port = portGuarda(), lecturas = [lecturaBarcelo()], listas = LISTAS, archivos } = {}) {
  const mm = mmFalso({ archivos: archivos ?? { f1: { name: 'factura.jpg', mime: 'image/jpeg' }, f2: { name: 'otra.jpg', mime: 'image/jpeg' } } })
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

test('una foto en el canal abre un fajo y devuelve el mensaje con los tres botones', async () => {
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

// ── Proveedor desconocido ────────────────────────────────────────────────────

test('PROVEEDOR DESCONOCIDO: se pregunta, no se inventa, y no se ofrece Confirmar', async () => {
  const { d } = armar({ lecturas: [lecturaBarcelo({ emisor: 'FERRETERIA EL TORNILLO SRL' })] })
  const r = await procesarPost(d, post())
  assert.match(r.texto, /no está en la lista de Compras/)
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

test('sin anotación manuscrita, la obra se PREGUNTA y no se puede confirmar', async () => {
  const { d } = armar({ lecturas: [lecturaBarcelo({ anotacion_manuscrita: null })] })
  const r = await procesarPost(d, post())
  assert.match(r.texto, /❓ \*\*¿A qué obra va\?\*\*/)
  // Sin historia de este proveedor no hay opciones que ofrecer, y se dice POR QUÉ en vez de dejar la
  // pregunta pelada. Con historia, el mensaje trae las obras contadas (ver mensaje.test.mjs).
  assert.match(r.texto, /No tengo ninguna carga anterior de \*\*Combustibles Barcelo\*\* en Compras/)
  assert.ok(!r.attachments[0].actions.some((a) => a.id === 'confirmar'))
})

// ── Idempotencia ─────────────────────────────────────────────────────────────

test('un comprobante YA CARGADO se avisa con su fila, y no se ofrece cargarlo de nuevo', async () => {
  const repo = repoMemoria()
  repo._cargados.set('c:30712345678|A|0113-00010489', { clave: 'c:30712345678|A|0113-00010489', fila: 412, hoja: 'Compras' })
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

test('estar en el canal NO habilita: sin grant de permiso se deniega', async () => {
  const { d } = armar({ port: portGuarda({ permisoOk: false }) })
  const r = await procesarPost(d, post())
  assert.equal(r.estado, 'rechazado_permiso')
  assert.match(r.texto, /No tenés habilitada/)
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
  assert.match(r.texto, /No pude con estos/)
  assert.match(r.texto, /malo\.mp3/)
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

test('la obra sale de lo que la persona ESCRIBIÓ al mandar la foto', async () => {
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
  assert.equal(r.attachments[0].actions.some((a) => a.id === 'confirmar'), false)
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

test('la obra ESCRITA A MANO se resuelve sola: no se pregunta lo que está en el papel', async () => {
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
  const base = armar({ lecturas: [lecturaCorralonReal({ anotacion_manuscrita: 'Messinas', numero: '0004-00009999', fecha: '02/08/2026' })], listas })
  const r = await procesarPost({ ...base.d, arcaDe: async () => [], comprasDe: async () => null }, post())
  assert.match(r.texto, /\| Obra \| _falta/)
  assert.match(r.texto, /a qué obra va/)
  assert.equal(r.attachments[0].actions.some((a) => a.id === 'confirmar'), false)
})

test('el DÍGITO DE MÁS se corrige contra ARCA, y ahí aparece el duplicado de la fila 802', async () => {
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

test('otra factura del MISMO proveedor el MISMO día NO se marca duplicada', async () => {
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

test('mismo proveedor, día e importe con OTRO número: se pregunta con botones, no se decide', async () => {
  const { d } = armarConPadron({
    lecturas: [lecturaCorralonReal({ numero: '0009-00000123', anotacion_manuscrita: 'Messinas BSA' })],
    arca: [], // sin ARCA que corrija el número, queda el probable duplicado a secas
  })
  const r = await procesarPost(d, post())
  assert.match(r.texto, /Puede que ya esté cargado\*\* — fila 802/)
  assert.deepEqual(r.attachments[0].actions.map((a) => a.id), ['duplicado_mismo', 'duplicado_otro', 'descartar'])
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

test('un comprobante AUSENTE de ARCA se busca IGUAL en Compras: ahí estaba, fila 800', async () => {
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
    lecturas: [lecturaTiqueBarcelo({ numero: '00113-00019997', anotacion_manuscrita: null, total: '20.000,00', iva_21: '3.471,07', otros_tributos: null })],
  })
  const r = await procesarPost(d, post())
  assert.equal(repo._fajos.get(r.fajoId).items[0].comprobante.obra, null)
  assert.match(r.texto, /a qué obra va/)
  assert.equal(r.attachments[0].actions.some((a) => a.id === 'confirmar'), false)
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
