// EL BOT SE CLAVÓ — la reproducción del 25/08/2026, medida en producción antes de escribirse acá.
//
// ═══ LO QUE PASÓ, CON LOS DATOS DE LA BASE ═══
//
// Canal `ataehrd…`, usuario `jorge`. Tres posts con fotos: 15:16:30, 15:19:50 y 15:21:24. La tanda
// `e0f7529f` los agrupó a los tres y su `aviso_post_id` es `qpr8tig33…`, publicado a las 15:16:38.
// El bot NUNCA volvió a crear un post: reescribió ése. Por eso el journal dice tres veces «el
// especialista publicó por su cuenta» y en el canal no hay ningún mensaje nuevo — Mattermost no
// notifica ni reordena un post editado.
//
// El segundo post traía una factura de Corralón Progreso `0004-00003745` que chocó con la fila 889
// de Compras (`0004-00003746`, mismo proveedor, mismo día, un dígito de diferencia). El detector la
// marcó PROBABLE, que es correcto: dos facturas consecutivas del mismo día son dos compras
// distintas y legítimas. Lo que no es correcto es lo que vino después:
//
//   · el fajo quedó `abierto`, con `aviso_post_id = null` y `error = null` — mudo e invisible;
//   · `conLaTanda` reemplazó el mensaje que preguntaba por el resumen de la tanda y lo dio por
//     publicado (`silencioso: true`), así que la pregunta nunca salió del proceso;
//   · los botones están APAGADOS en producción (`ORQ_COMPROBANTES_BOTONES` no está puesto) y
//     `interpretarRespuesta` no entiende ninguna respuesta de duplicado: no había NINGUNA salida.
//
// El dueño hizo lo único razonable —volver a mandar la foto— y esa foto se colapsó como copia del
// ítem trabado: cero efecto. Eso es el clavado.
//
// NÚCLEO PURO: dobles en memoria, cero Postgres, cero Mattermost, cero modelo.

import test from 'node:test'
import assert from 'node:assert/strict'
import { procesarPost } from './flujo.mjs'
import { conLaTanda } from './tanda.mjs'
import { repoMemoria, portGuarda, mmFalso, LISTAS_COMPRAS, filaCompras } from './dobles.mjs'
import { ESTADO } from '../../lib/comprobantes/fajo.mjs'
import { indexarCompras } from '../../lib/comprobantes/compras-vivas.mjs'
import { parteVacia } from '../../lib/comprobantes/parte.mjs'
import { textoCargado } from './escritura.mjs'

const URL = 'https://chat.ecsas.com.ar/comprobantes/accion?t=SECRETO'
const ACTOR = { plataforma_user_id: 'u_jorge', plataforma_username: 'jorge', channel_type: 'P', channel_id: 'c_comprobantes' }
const AHORA = new Date('2026-08-25T15:19:50Z')

/** La factura que se clavó, tal como la leyó la visión. */
function lecturaCorralon3745(over = {}) {
  return {
    emisor: 'Corralon Progreso',
    cuit: '23369111574',
    letra: 'A',
    es_nota_credito: false,
    numero: '0004-00003745',
    cae: '86349814586324',
    fecha: '25/08/2026',
    neto_gravado: '251.666,09',
    iva_21: '52.849,89',
    iva_105: '0',
    otros_tributos: '0',
    total: '304.515,98',
    condicion_venta: 'Cuenta Corriente',
    forma_pago: null,
    concepto: 'Grifería bidet, tapas PVC 110mm, membrana 4mm, bisagras',
    anotacion_manuscrita: null,
    legible: true,
    dudas: [],
    ...over,
  }
}

/** Compras VIVO con la fila 889 real: el mismo proveedor y el mismo día, número consecutivo. */
function comprasConLa889() {
  return { ok: true, ...indexarCompras([
    ...Array.from({ length: 885 }, () => []),
    filaCompras('25/8/2026', 'Corralon Progreso', 'F A', '0004-00003746', '', 'Grif. Mozart Praga', 'Tornillo drywall', '$ 106.429,73', 'B'),
  ]) }
}

function armar({ repo = repoMemoria(), lecturas = [lecturaCorralon3745()], compras = null } = {}) {
  const mm = mmFalso({ archivos: { f1: { name: 'rn_image_picker.jpg', mime: 'image/jpeg' }, f2: { name: 'image.png', mime: 'image/png' } } })
  let i = 0
  const escritas = []
  return {
    repo,
    mm,
    escritas,
    d: {
      port: portGuarda(), repo, mattermost: mm, url: URL,
      leer: async () => { const c = lecturas[Math.min(i++, lecturas.length - 1)]; return c ? { ok: true, crudo: c } : { ok: false, error: 'ilegible' } },
      listas: async () => LISTAS_COMPRAS,
      comprasDe: compras ? async () => compras() : undefined,
      escribir: async (fajo) => { escritas.push(fajo); return { estado: ESTADO.CARGADO, texto: '✔ **Cargado** — Compras, fila 890.' } },
    },
  }
}

const post = (o = {}) => ({
  fileIds: ['f1'], actor: ACTOR, channelId: 'c_comprobantes', postId: 'p_xpjrwaau', rootPostId: 'p_ycpth5kc',
  ahora: AHORA, ...o,
})

// ═══ 1 · UN FAJO QUE ESPERA UNA RESPUESTA TIENE QUE PEDIRLA ══════════════════

test('el fajo que queda abierto por un duplicado probable DECLARA su pregunta, no la deja adentro', async () => {
  const { d, repo } = armar({ compras: comprasConLa889 })
  const r = await procesarPost(d, post())

  // Primero, el estado que se midió en producción: fajo abierto con un solo ítem trabado.
  assert.equal(r.estado, 'confirmar', 'el duplicado probable tiene que frenar la carga')
  const f = repo._fajos.get(r.fajoId)
  assert.equal(f.estado, ESTADO.ABIERTO)
  assert.equal(f.items[0].posibleDuplicado?.fila, 889, 'la fila candidata es la 889')

  // Y lo que faltaba: la salida tiene que decir que hay algo que contestar. Sin esto, quien publica
  // no puede distinguir «terminé» de «te estoy preguntando algo», y publica el resumen.
  assert.ok(r.pregunta, 'la salida no declara que quedó una pregunta abierta')
  assert.equal(r.pregunta.fajoId, r.fajoId)
  assert.match(r.pregunta.texto, /889/, 'la pregunta tiene que nombrar la fila candidata')
  assert.match(r.pregunta.texto, /0004-00003745/, 'y el comprobante del que habla')
})

// ═══ 2 · LA TANDA NO PUEDE TRAGARSE LA PREGUNTA ══════════════════════════════

/** El repositorio de tandas en memoria, con la MISMA garantía que importa: una abierta por persona. */
function repoTandas() {
  const tandas = []
  const partes = []
  return {
    tandas,
    partes,
    async tablasListas() { return true },
    async tandaViva(_p, { userId, channelId }) {
      return tandas.find((t) => t.estado === 'abierta' && t.plataforma_user_id === userId && t.channel_id === channelId) ?? null
    },
    async cerrarVencidas() {},
    async abrirTanda(_p, { userId, channelId, rootPostId }) {
      const t = { id: `t${tandas.length + 1}`, plataforma_user_id: userId, channel_id: channelId, root_post_id: rootPostId, aviso_post_id: null, estado: 'abierta' }
      tandas.push(t)
      return t
    },
    async abrirParte(_p, { tandaId, postId, recibidos }) {
      const ya = partes.find((x) => x.tanda_id === tandaId && x.post_id === String(postId))
      if (ya) return { nueva: false, parte: ya }
      const p = { tanda_id: tandaId, post_id: String(postId), estado: 'en_curso', parte: { ...parteVacia(), recibidos } }
      partes.push(p)
      return { nueva: true, parte: p }
    },
    async cerrarParte(_p, { tandaId, postId, parte }) {
      const p = partes.find((x) => x.tanda_id === tandaId && x.post_id === String(postId))
      if (p) { p.estado = 'listo'; p.parte = parte }
    },
    async estadoDeLaTanda(_p, tandaId) {
      const mias = partes.filter((x) => x.tanda_id === tandaId)
      const suma = mias.reduce((a, x) => ({
        ...a,
        recibidos: a.recibidos + (x.parte?.recibidos ?? 0),
        cargados: a.cargados + (x.parte?.cargados ?? 0),
        trabados: [...a.trabados, ...(x.parte?.trabados ?? [])],
      }), parteVacia())
      return { parte: suma, enVuelo: mias.filter((x) => x.estado === 'en_curso').length }
    },
    async guardarAviso(_p, { id, avisoPostId }) {
      const t = tandas.find((x) => x.id === id)
      if (t && !t.aviso_post_id) t.aviso_post_id = avisoPostId
      return t?.aviso_post_id ?? null
    },
  }
}

const portVacio = { query: async () => ({ rows: [] }) }

/** Mattermost de la tanda: anota los posts CREADOS aparte de los EDITADOS. La diferencia es el defecto. */
function mmTanda({ romperCreacion = false } = {}) {
  const creados = []
  const editados = []
  return {
    creados,
    editados,
    async crearPost(p) {
      if (romperCreacion) throw new Error('Mattermost caído (simulado)')
      const post = { id: `post${creados.length + 1}`, ...p }
      creados.push(post)
      return post
    },
    async actualizarPost(p) { editados.push(p); return p },
  }
}

test('EL SILENCIO: la tanda ya publicó su resumen y llega una PREGUNTA — tiene que salir un post nuevo', async () => {
  const repo = repoTandas()
  const mm = mmTanda()
  const base = { plataforma: 'mattermost', userId: 'u_jorge', channelId: 'c_comprobantes', recibidos: 1 }

  // Post 1: la ráfaga que sí funcionó. Publica el ⏳ y lo reescribe con el resumen.
  await conLaTanda({ port: portVacio, mattermost: mm, repo }, { ...base, postId: 'p_ycpth5kc', recibidos: 5 },
    async () => ({ texto: 'ok', estado: 'cargado', parte: { ...parteVacia(), recibidos: 5, cargados: 5 } }))
  assert.equal(mm.creados.length, 1, 'el primer post publica UN mensaje')

  // Post 2: el que se clavó. El trabajo devuelve una pregunta abierta.
  const r = await conLaTanda({ port: portVacio, mattermost: mm, repo }, { ...base, postId: 'p_xpjrwaau' },
    async () => ({
      texto: 'resumen', estado: 'confirmar', fajoId: 'fajo_2',
      parte: { ...parteVacia(), recibidos: 1, trabados: [{ nombre: 'rn_image_picker.jpg', motivo: 'puede ser la fila 889 de Compras' }] },
      pregunta: { texto: '⚠ Corralón Progreso **0004-00003745** — puede que ya esté en la **fila 889**. ¿Es el mismo?', fajoId: 'fajo_2' },
    }))

  assert.equal(mm.creados.length, 2, 'la pregunta se editó sobre el mensaje viejo en vez de publicarse: eso es el silencio')
  assert.match(mm.creados[1].message, /fila 889/, 'el post nuevo tiene que ser la pregunta')
  assert.equal(mm.creados[1].root_id, 'p_ycpth5kc', 'la respuesta va al hilo del mensaje que la originó')
  assert.equal(r.silencioso, true, 'la publicó él mismo, así que el handler no debe publicar de nuevo')
})

test('si la pregunta NO se puede publicar, no se declara silencioso: sale por el outbox', async () => {
  const repo = repoTandas()
  const mm = mmTanda({ romperCreacion: true })
  const r = await conLaTanda({ port: portVacio, mattermost: mm, repo },
    { userId: 'u_jorge', channelId: 'c_comprobantes', postId: 'p1', recibidos: 1 },
    async () => ({
      texto: 'resumen', estado: 'confirmar',
      parte: { ...parteVacia(), recibidos: 1 },
      pregunta: { texto: '⚠ ¿Es el mismo?' },
    }))
  assert.notEqual(r.silencioso, true, 'una pregunta que no se pudo publicar NO puede darse por publicada')
  assert.match(r.texto, /Es el mismo/, 'y el texto que sale por el outbox tiene que ser la pregunta')
})

// ═══ 3 · REENVIAR EL QUE NO ENTRÓ TIENE QUE VOLVER A PREGUNTAR ═══════════════

test('reenviar la misma foto que quedó trabada vuelve a pedir la respuesta, no se pierde como copia', async () => {
  const repo = repoMemoria()
  const { d } = armar({ repo, compras: comprasConLa889, lecturas: [lecturaCorralon3745(), lecturaCorralon3745()] })
  repo.en(AHORA)
  const r1 = await procesarPost(d, post())
  assert.ok(r1.pregunta, 'la primera vez ya tiene que preguntar')

  // El dueño reenvía el que "no entró", 94 segundos después: cae en el MISMO fajo abierto.
  const luego = new Date('2026-08-25T15:21:24Z')
  repo.en(luego)
  const r2 = await procesarPost(d, post({ postId: 'p_feafj5ot', fileIds: ['f2'], ahora: luego }))
  assert.equal(r2.fajoId, r1.fajoId, 'sigue siendo el mismo fajo')
  assert.ok(r2.pregunta, 'el reenvío se comió la pregunta: para el dueño el bot se clavó')
})

// ═══ 4 · EL DUPLICADO SE PUEDE CONTESTAR ESCRIBIENDO ═════════════════════════

test('«es otro, cargalo» destraba el fajo y lo escribe — sin botones, que en producción están apagados', async () => {
  const { interpretarRespuesta, RESPUESTA } = await import('../../lib/comprobantes/respuesta-texto.mjs')
  const fajo = {
    id: 'f1',
    items: [{
      comprobante: { proveedor: 'Corralon Progreso', cuit: '23369111574', numero: '0004-00003745', fecha: '25/08/2026', total: 304515.98 },
      posibleDuplicado: { fila: 889, numero: '0004-00003746' },
    }],
  }
  const otro = interpretarRespuesta(fajo, 'es otro, cargalo')
  assert.ok(otro, 'no hay forma de contestar un duplicado por texto: el fajo queda trabado para siempre')
  assert.equal(otro.que, RESPUESTA.DUPLICADO)
  assert.equal(otro.valor, 'otro')

  const mismo = interpretarRespuesta(fajo, 'es el mismo')
  assert.equal(mismo?.que, RESPUESTA.DUPLICADO)
  assert.equal(mismo.valor, 'mismo')

  // Y lo que NO es una respuesta de duplicado sigue sin serlo: un especialista que se cree dueño de
  // todo le roba mensajes a los demás.
  assert.equal(interpretarRespuesta(fajo, 'cuánto facturamos en agosto'), null)
})

// ═══ 5 · DOS PERSONAS A LA VEZ ═══════════════════════════════════════════════

test('dos personas mandando a la vez en el MISMO canal: dos fajos, dos respuestas, nada mezclado', async () => {
  const repo = repoMemoria()
  const { d } = armar({ repo, lecturas: [lecturaCorralon3745(), lecturaCorralon3745({ numero: '0004-00009999', total: '11.000,00', cae: '86349814586399' })] })
  repo.en(AHORA)

  const [a, b] = await Promise.all([
    procesarPost(d, post({ actor: { ...ACTOR, plataforma_user_id: 'u_jorge' }, postId: 'pA' })),
    procesarPost(d, post({ actor: { ...ACTOR, plataforma_user_id: 'u_rodrigo', plataforma_username: 'rodrigo' }, postId: 'pB' })),
  ])

  assert.notEqual(a.fajoId, b.fajoId, 'las dos personas compartieron fajo: el índice es (persona, canal)')
  const fa = repo._fajos.get(a.fajoId)
  const fb = repo._fajos.get(b.fajoId)
  assert.equal(fa.plataforma_user_id, 'u_jorge')
  assert.equal(fb.plataforma_user_id, 'u_rodrigo')
  assert.equal(fa.items.length + fb.items.length, 2, 'un comprobante se perdió en la carrera')
  assert.ok(a.texto && b.texto, 'las dos personas tienen que recibir su respuesta')
})

test('CARRERA: dos posts de la misma persona a la vez — el que pierde no puede perder sus comprobantes', async () => {
  const repo = repoMemoria()
  repo.en(AHORA)
  // El fajo de A se abre primero; B pierde la carrera del índice único parcial.
  const a = await repo.abrirFajo(null, { userId: 'u_jorge', channelId: 'c_comprobantes', postId: 'pA', items: [{ clave: 'c:1|A' }] })
  const b = await repo.abrirFajo(null, { userId: 'u_jorge', channelId: 'c_comprobantes', postId: 'pB', items: [{ clave: 'c:2|B' }] })

  assert.equal(b.id, a.id, 'el índice único parcial obliga a un solo fajo abierto por (persona, canal)')
  assert.equal(b.items.length, 2, 'el perdedor devolvió el fajo ajeno SIN sus comprobantes: se evaporaron')
  assert.ok(b.post_ids.includes('pB'), 'y su post tiene que quedar anotado en el fajo que sobrevivió')
})

// ═══ 6 · UN FAJO ABIERTO Y MUDO TIENE QUE GRITAR ═════════════════════════════

test('un fajo abierto sin aviso publicado hace más de N minutos se detecta', async () => {
  const { fajosMudos } = await import('../../lib/comprobantes/vigilancia.mjs')
  const ahora = new Date('2026-08-25T16:30:00Z')
  const fajos = [
    // el de producción: abierto 15:20:18, último movimiento 15:21:48, sin aviso y sin error
    { id: 'de1c9a7a', estado: ESTADO.ABIERTO, aviso_post_id: null, error: null, ultimo_at: '2026-08-25T15:21:48Z', items: [{ comprobante: { proveedor: 'Corralon Progreso', numero: '0004-00003745', total: 304515.98 } }] },
    // recién abierto: todavía no es mudo, es reciente
    { id: 'fresco', estado: ESTADO.ABIERTO, aviso_post_id: null, error: null, ultimo_at: '2026-08-25T16:29:00Z', items: [{}] },
    // abierto pero con su aviso publicado: la persona lo vio
    { id: 'hablo', estado: ESTADO.ABIERTO, aviso_post_id: 'post_x', error: null, ultimo_at: '2026-08-25T15:00:00Z', items: [{}] },
    // cerrado: no espera nada de nadie
    { id: 'cerrado', estado: ESTADO.CARGADO, aviso_post_id: null, error: null, ultimo_at: '2026-08-25T15:00:00Z', items: [{}] },
  ]
  const mudos = fajosMudos(fajos, { ahora, minutos: 15 })
  assert.deepEqual(mudos.map((f) => f.id), ['de1c9a7a'])
  assert.match(mudos[0].motivo, /sin aviso/i)
})

// ═══ 7 · LA PUERTA DEL DIRECTOR: sin reclamo, el arreglo no existe ═══════════
//
// Este subsistema ya pagó esta lección con el feedback del buscador: el router sabía leer la
// respuesta y el mensaje nunca le llegaba, porque ningún especialista lo reclamaba. Una respuesta
// nueva sin reclamo es código muerto con buen aspecto.

test('el especialista RECLAMA «es otro, cargalo» cuando hay un duplicado abierto — y sólo entonces', async () => {
  const { especialista } = await import('../especialistas/comprobantes.mjs')
  const item = {
    comprobante: { proveedor: 'Corralon Progreso', cuit: '23369111574', numero: '0004-00003745', fecha: '25/08/2026', total: 304515.98 },
    posibleDuplicado: { fila: 889, numero: '0004-00003746' },
  }
  const ctx = (items) => ({
    actor: { plataforma_user_id: 'u_jorge', channel_id: 'c_comprobantes', plataforma: 'mattermost' },
    port: {
      async query(sql) {
        if (/comprobante_fajos/.test(sql)) {
          return { rows: items ? [{ id: 'f1', estado: ESTADO.ABIERTO, items }] : [] }
        }
        return { rows: [] }
      },
    },
  })

  const r = await especialista.reconoce('es otro, cargalo', ctx([item]))
  assert.equal(r?.destino, 'responder', 'nadie reclamó la respuesta: el Director la manda al catálogo')
  assert.equal(r.respuesta.que, 'duplicado')
  assert.equal(r.respuesta.valor, 'otro')

  // Sin fajo abierto no se reclama nada: el mensaje sigue su camino intacto.
  assert.equal(await especialista.reconoce('es otro, cargalo', ctx(null)), null)
  // Y con fajo abierto, algo que no contesta la pregunta tampoco se secuestra.
  assert.equal(await especialista.reconoce('cuánto facturamos en agosto', ctx([item])), null)
})

test('el efecto completo: «es otro» → el fajo se cierra CARGADO y el escritor recibió la fila', async () => {
  const { atenderRespuesta } = await import('./respuesta.mjs')
  const { interpretarRespuesta } = await import('../../lib/comprobantes/respuesta-texto.mjs')
  const repo = repoMemoria()
  repo.en(AHORA)
  const item = {
    comprobante: {
      categoria: 'B', proveedor: 'Corralon Progreso', cuit: '23369111574', tipo: 'A',
      numero: '0004-00003745', fecha: '25/08/2026', total: 304515.98, iva: 52849.89, unidad: 'Civil',
    },
    posibleDuplicado: { fila: 889, numero: '0004-00003746', total: 106429.73 },
  }
  const fajo = await repo.abrirFajo(null, { userId: 'u_jorge', channelId: 'c_comprobantes', postId: 'p1', items: [item] })

  const escritas = []
  const r = await atenderRespuesta(
    { port: null, repo, mattermost: mmFalso(), url: URL, escribir: async (_d, f) => { escritas.push(f); return { estado: ESTADO.CARGADO, texto: '✔ **Cargado** — Compras, fila 890.' } } },
    { fajo, respuesta: interpretarRespuesta(fajo, 'es otro') })

  assert.equal(escritas.length, 1, 'contestar lo último que faltaba TIENE que escribir, no pedir un click más')
  assert.equal(escritas[0].items[0].duplicadoResuelto, 'otro')
  assert.match(r.texto, /es otro comprobante/i)
  assert.match(r.texto, /fila 890/)
  assert.notEqual(repo._fajos.get(fajo.id).estado, ESTADO.ABIERTO, 'el fajo tiene que dejar de retener el gasto')
})

test('«es el mismo» sobre el único comprobante cierra el fajo sin escribir nada', async () => {
  const { atenderRespuesta } = await import('./respuesta.mjs')
  const { interpretarRespuesta } = await import('../../lib/comprobantes/respuesta-texto.mjs')
  const repo = repoMemoria()
  repo.en(AHORA)
  const item = {
    comprobante: { proveedor: 'Corralon Progreso', numero: '0004-00003745', fecha: '25/08/2026', total: 304515.98 },
    posibleDuplicado: { fila: 889 },
  }
  const fajo = await repo.abrirFajo(null, { userId: 'u_jorge', channelId: 'c_comprobantes', postId: 'p1', items: [item] })
  const escritas = []
  const r = await atenderRespuesta(
    { port: null, repo, mattermost: mmFalso(), url: URL, escribir: async (_d, f) => { escritas.push(f); return { estado: ESTADO.CARGADO } } },
    { fajo, respuesta: interpretarRespuesta(fajo, 'es el mismo') })

  assert.equal(escritas.length, 0, 'se cargó un gasto que el dueño dijo que ya estaba')
  assert.match(r.texto, /no lo cargo/i)
  assert.equal(repo._fajos.get(fajo.id).estado, ESTADO.DESCARTADO, 'un fajo sin nada que cargar no puede quedar abierto trabando el siguiente')
})

// ═══ 8 · UNA PUBLICACIÓN FALLIDA NUNCA ES UN ÉXITO ══════════════════════════

test('si Mattermost rechaza la REESCRITURA del resumen, tampoco se declara silencioso', async () => {
  const repo = repoTandas()
  const mm = mmTanda()
  const base = { plataforma: 'mattermost', userId: 'u_jorge', channelId: 'c_comprobantes', recibidos: 2 }

  // Primer post: publica bien y deja el aviso guardado.
  await conLaTanda({ port: portVacio, mattermost: mm, repo }, { ...base, postId: 'p1' },
    async () => ({ estado: 'cargado', parte: { ...parteVacia(), recibidos: 2, cargados: 2 } }))
  assert.equal(mm.creados.length, 1)

  // Segundo post: la EDICIÓN falla. `aviso_post_id` sigue puesto, pero este mensaje no entró.
  mm.actualizarPost = async () => { throw new Error('Mattermost caído (simulado)') }
  const r = await conLaTanda({ port: portVacio, mattermost: mm, repo }, { ...base, postId: 'p2' },
    async () => ({ estado: 'cargado', parte: { ...parteVacia(), recibidos: 2, cargados: 2 } }))

  assert.notEqual(r.silencioso, true, 'el canal se quedó con el mensaje viejo y el handler dijo que había publicado')
  assert.match(r.texto, /Cargué \*\*4 comprobantes\*\*/, 'y por el outbox tiene que salir el acumulado, no un texto vacío')
})

// ═══ EL BOT NO PUEDE ANUNCIAR UN ALTA QUE NO OCURRIÓ (25/08) ═══
//
// El cargador da de alta al proveedor que el CUIT identifica. El mensaje del chat se armaba con el
// PLAN (`altas.altas`) —lo que se iba a crear—, no con lo que la base devolvió. Con la escritura del
// Sheet frenada, o con otra corrida ganando la carrera del CUIT, el dueño leería "Proveedor NUEVO
// dado de alta" sobre una ficha que no existe, y dejaría de buscarla.
//
// La evidencia del alta es la fila que volvió de Postgres, nunca el plan que la pidió.
test('el chat anuncia el proveedor que la BASE creó, no el que el plan pensaba crear', () => {
  const plan = { altas: [{ cuit: '30999999995', nombre: 'Metalúrgica del Oeste' }], existentes: [], alias: [], conflictos: [], ambiguos: [], sinIdentidad: [] }

  const sinEfecto = textoCargado([{ fila: 900, proveedor: 'X' }], [], { altas: plan, altasAplicadas: null })
  assert.ok(!/dado de alta/i.test(sinEfecto), 'sin respuesta de la base no se afirma ningún alta')

  const conEfecto = textoCargado([{ fila: 900, proveedor: 'X' }], [], {
    altas: plan,
    altasAplicadas: { creados: [{ cuit: '30999999995', nombre: 'Metalúrgica del Oeste', id: 'p1' }], yaEstaban: [], alias: [], rechazos: [] },
  })
  assert.match(conEfecto, /Proveedor NUEVO dado de alta: \*\*Metalúrgica del Oeste\*\* \(CUIT 30999999995\)/)
})

test('lo que nadie pudo resolver se nombra igual: un pendiente que no se dice no se mira', () => {
  const t = textoCargado([{ fila: 900, proveedor: 'X' }], [], {
    altas: { altas: [], existentes: [], alias: [], conflictos: [{ nombreLeido: 'EL PUENTE', motivo: 'nombre_ocupado' }], ambiguos: ['DOS CUIT'], sinIdentidad: [] },
    altasAplicadas: { creados: [], yaEstaban: [], alias: [], rechazos: [] },
  })
  assert.match(t, /No pude resolver "EL PUENTE" \(nombre_ocupado\)/)
  assert.match(t, /"DOS CUIT" apareció con dos CUIT distintos/)
})
