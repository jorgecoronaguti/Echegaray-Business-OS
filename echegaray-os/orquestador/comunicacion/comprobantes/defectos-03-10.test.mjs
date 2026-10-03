// EL RECIBO DEL SERENO (dueño, 03/10/2026): «se envió una foto de recibo por canal efectivo de chat y no se
// reconoció nada, está mal, no puede funcionar así, tiene que tener lenguaje y funciones naturales de captura».
//
// El caso real (fajo 9207eb82, post 13w9an1n…, canal Efectivo, 03/10 11:44): la visión LEYÓ bien el papel
// —«RECIBI de Echegaray Construcciones SAS · La cantidad de Un millon Quinientos cuarenta mil · en concepto de
// Sereno Quattropani Segunda Quincena · 280 horas a $5500 · Son $1.540.000 · (firma)»— y el bot contestó
// «No hay nada que cargar todavía … tocá Corregir», sin un solo botón en el mensaje. Tres defectos encadenados:
//
//   1. La política del chat exige NÚMERO de comprobante, y un recibo manuscrito no lo tiene NUNCA: no había
//      dato que el dueño pudiera dar para destrabarlo.
//   2. Lo que sí faltaba —a quién se le pagó, porque la firma no se lee— se pedía con un botón inexistente.
//   3. Y si el dueño contestaba escribiendo en el hilo, Rendiciones (dueño del canal) reclamaba el texto como
//      «ayuda» y le devolvía el instructivo: el Director decide antes que nadie, y el canal desempata.
//
// Sin base y sin modelo: puertos dobles. El ítem es el leído en producción, tal cual.
import test from 'node:test'
import assert from 'node:assert/strict'
import { faltantesDe, POLITICA, MOTIVO } from '../../lib/comprobantes/faltantes.mjs'
import { interpretarRespuesta, RESPUESTA } from '../../lib/comprobantes/respuesta-texto.mjs'
import { mensajeFajo } from '../../lib/comprobantes/mensaje.mjs'
import { filaDeRegistro } from './escritura.mjs'
import { resolver } from '../director.mjs'
import { especialista as rendiciones } from '../especialistas/rendiciones.mjs'

const ANOTACION = '2 de Octubre de 20 26 · RECIBI de Echegaray Construcciones SAS · La cantidad de Un millon Quinientos cuarenta mil · en concepto de Sereno Quattropani Segunda Quincena · 280 horas a $5500 · Son $1.540.000 · (firma)'

/** El ítem del fajo 9207eb82 (03/10/2026), con lo que la visión devolvió. */
function itemSereno(cambios = {}) {
  return {
    arca: { estado: 'sin_registro' },
    clave: null,
    dudas: [
      'No es un comprobante fiscal, es un recibo manuscrito de pago a sereno',
      'No hay letra, CUIT ni CAE porque no es factura',
      'Recibo manuscrito sin datos del emisor (razón social, CUIT), sin número ni CAE',
    ],
    escala: { n: 0, max: 0 },
    origen: { fileId: 'xayj5e6n7jdcif9jueze7zefdw', nombre: '9558F116.jpg' },
    postId: 'post-sereno',
    leidoEn: '2026-10-03T14:44:23.089Z',
    proveedorNuevo: false,
    listasVerificadas: true,
    comprobante: {
      cae: null, iva: null, cuit: null, neto: null, obra: 'Quattropani', tipo: null, fecha: '02/10/2026',
      total: 1540000, numero: null, unidad: 'Civil', concepto: 'Servicio de sereno - 280 horas a $5.500',
      anotacion: ANOTACION, categoria: 'N', condicion: 'Contado', formaPago: 'A rendir', proveedor: null,
      detalleObra: 'Sereno Quattropani segunda quincena · 280 horas x $5.500',
      esNotaDebito: false, esNotaCredito: false, esPresupuestoORemito: false,
      ...(cambios.comprobante ?? {}),
    },
    ...Object.fromEntries(Object.entries(cambios).filter(([k]) => k !== 'comprobante')),
  }
}
const fajoDe = (items) => ({
  id: 'f-sereno', estado: 'abierto', plataforma: 'mattermost', plataforma_user_id: 'mm-rodrigo',
  plataforma_username: 'rodrigo', channel_id: 'ch-efectivo', root_post_id: 'post-sereno',
  aviso_post_id: 'aviso-sereno', post_ids: ['post-sereno'], items,
})

test('un recibo manuscrito no tiene número: el chat no lo puede exigir (sólo falta a quién se le pagó)', () => {
  const codigos = faltantesDe(itemSereno(), POLITICA.CHAT).map((f) => f.codigo)
  assert.ok(!codigos.includes(MOTIVO.NUMERO), `pidió el número de un recibo manuscrito: ${codigos}`)
  assert.deepEqual(codigos, [MOTIVO.PROVEEDOR])
})

test('lo que falta se pregunta en castellano y se contesta escribiendo, no con un botón que no existe', () => {
  const [f] = faltantesDe(itemSereno(), POLITICA.CHAT)
  assert.match(f.pregunta, /a qui[eé]n se le pag[oó]/i)
  const { texto } = mensajeFajo(fajoDe([itemSereno()]))
  assert.doesNotMatch(texto, /toc[aá] \*\*Corregir\*\*/, 'manda a tocar un botón que en producción no está')
  assert.match(texto, /escrib/i, 'tiene que decir que se contesta escribiendo en el hilo')
})

test('con el nombre de quien cobró, el recibo se puede cargar: sin pedir CUIT y con clave propia', () => {
  const it = itemSereno({ proveedorNuevo: true, comprobante: { proveedor: 'Juan Pérez' } })
  assert.deepEqual(faltantesDe(it, POLITICA.CHAT), [], 'una persona que cobra un recibo no tiene CUIT que dar')
  const { clave } = filaDeRegistro(it)
  assert.match(String(clave), /^r:/, 'sin número la barrera de duplicados sale de quién, cuándo y cuánto')
  // Otra quincena del mismo sereno es OTRO recibo: no puede chocar con la clave del primero.
  const otro = itemSereno({ comprobante: { proveedor: 'Juan Pérez', fecha: '16/10/2026' } })
  assert.notEqual(filaDeRegistro(otro).clave, clave)
})

test('una factura de verdad sigue exigiendo su número', () => {
  const factura = itemSereno({ dudas: [], comprobante: { anotacion: null, cuit: '30711111110', tipo: 'Factura A', proveedor: 'Corralón SA', concepto: 'Cemento' } })
  assert.ok(faltantesDe(factura, POLITICA.CHAT).some((f) => f.codigo === MOTIVO.NUMERO))
})

test('«Juan Pérez» escrito en el hilo es a quién se le pagó; fuera del hilo no es para mí', () => {
  const fajo = fajoDe([itemSereno()])
  assert.deepEqual(interpretarRespuesta(fajo, 'Juan Pérez', { enHilo: true }), { que: RESPUESTA.PROVEEDOR, valor: 'Juan Pérez', indices: [0] })
  assert.deepEqual(interpretarRespuesta(fajo, 'se le pagó a Juan Pérez', { enHilo: true }), { que: RESPUESTA.PROVEEDOR, valor: 'Juan Pérez', indices: [0] })
  assert.equal(interpretarRespuesta(fajo, 'Juan Pérez'), null, 'fuera del hilo un nombre suelto no se roba')
})

test('sin importe leído, «de 1.540.000» en el hilo es el importe', () => {
  const fajo = fajoDe([itemSereno({ comprobante: { total: null, proveedor: 'Juan Pérez' } })])
  const [f] = faltantesDe(fajo.items[0], POLITICA.CHAT)
  assert.match(f.pregunta, /de cu[aá]nto/i)
  assert.deepEqual(interpretarRespuesta(fajo, 'de $1.540.000', { enHilo: true }), { que: RESPUESTA.IMPORTE, valor: 1540000, indices: [0] })
  assert.equal(interpretarRespuesta(fajo, '150000'), null, 'fuera del hilo un número suelto es de la libreta o de un pago')
  assert.equal(interpretarRespuesta(fajo, '1,54 millones', { enHilo: true })?.valor, 1540000)
})

// ── Quién reclama la respuesta escrita en el canal Efectivo ─────────────────────────────────────────────────
function portEfectivo({ fajo = fajoDe([itemSereno()]) } = {}) {
  return {
    async query(sql) {
      if (/comunicacion\.canales_area/.test(sql)) return { rows: [{ area_clave: 'rendicion', canal_nombre: 'Efectivo' }] }
      if (/comunicacion\.comprobante_fajos/.test(sql)) return { rows: fajo ? [fajo] : [] }
      if (/comunicacion\.identidades/.test(sql)) return { rows: [{ perfil_id: 'perf-rodrigo', persona_id: 'p-rodrigo', es_prueba: false, rol: 'admin' }] }
      return { rows: [] }
    },
  }
}
const actorHilo = (root = 'post-sereno') => ({ plataforma: 'mattermost', plataforma_user_id: 'mm-rodrigo', channel_id: 'ch-efectivo', root_post_id: root })

test('la respuesta en el hilo del recibo la reclama Rendiciones como respuesta, no como «ayuda»', async () => {
  const r = await resolver({ texto: 'Juan Pérez', port: portEfectivo(), channelId: 'ch-efectivo', actor: actorHilo() })
  assert.equal(r.especialista?.slug, 'rendiciones')
  assert.equal(r.intencion?.destino, 'responder', `terminó en «${r.intencion?.destino}»: el dueño recibía el instructivo`)
})

test('Rendiciones aplica la respuesta con la puerta de SU canal (la de Compras la negaba)', async () => {
  const port = portEfectivo()
  const r0 = await resolver({ texto: 'Juan Pérez', port, channelId: 'ch-efectivo', actor: actorHilo() })
  const vistas = []
  const out = await rendiciones.atender({
    texto: 'Juan Pérez', intencion: r0.intencion, port, actor: actorHilo(), fileIds: [],
    responder: async (_d, p) => { vistas.push(p); return { texto: '✔ Anotado', estado: 'anotado' } },
  })
  assert.equal(out.estado, 'anotado')
  assert.equal(vistas[0]?.respuesta?.que, RESPUESTA.PROVEEDOR)
  assert.equal(vistas[0]?.fajo?.id, 'f-sereno')
})

test('sin fajo abierto, un texto en el canal Efectivo sigue siendo de quien era (nada se secuestra)', async () => {
  const r = await rendiciones.reconoce('Juan Pérez', { area: 'rendicion', port: portEfectivo({ fajo: null }), actor: actorHilo() })
  assert.equal(r?.destino, 'ayuda')
})

// ── De punta a punta: la foto deja el fajo, el dueño contesta en el hilo, y se escribe ───────────────────────
test('«se le pagó a Juan Pérez» en el hilo: anota quién cobró y CARGA por el mismo escritor (con y sin texto en la foto)', async () => {
  for (const textoFoto of ['Sereno Quattropani', null]) {
    const { repoMemoria } = await import('./dobles.mjs')
    const { atenderRespuesta } = await import('./respuesta.mjs')
    const repo = repoMemoria()
    const it = itemSereno(textoFoto ? {} : { comprobante: { obra: null, detalleObra: null } })
    const fajo = await repo.abrirFajo(null, { userId: 'mm-rodrigo', channelId: 'ch-efectivo', rootPostId: 'post-sereno', items: [it] })
    const port = {
      async query(sql) {
        if (/comunicacion\.canales_area/.test(sql)) return { rows: [{ area_clave: 'rendicion', canal_nombre: 'Efectivo' }] }
        if (/comunicacion\.comprobante_fajos/.test(sql)) return { rows: [await repo.fajoAbierto(null, { userId: 'mm-rodrigo', channelId: 'ch-efectivo' })] }
        if (/from public\.proveedores/.test(sql)) return { rows: [{ nombre: 'Pedro Tello', razon_social: null }] }
        return { rows: [] }
      },
    }
    const ruta = await rendiciones.reconoce('se le pagó a Juan Pérez', { area: 'rendicion', port, actor: actorHilo(), fileIds: [] })
    assert.equal(ruta?.destino, 'responder', 'la respuesta tiene dueño')
    const escrito = []
    const r = await rendiciones.atender({
      texto: 'se le pagó a Juan Pérez', intencion: ruta, port, actor: actorHilo(), fileIds: [],
      responder: (d, p) => atenderRespuesta({ ...d, repo, mattermost: { async actualizarPost() {} },
        escribir: async (_d, f) => { escrito.push(f); return { texto: '✔ Cargado — Compras fila 1063.', estado: 'cargado' } } }, p),
    })
    assert.match(r.texto, /se le pag[oó] a Juan Pérez/)
    assert.match(r.texto, /Proveedor \(E\) vac[ií]o/, 'dice que no está en la lista y qué queda en la fila')
    assert.equal(escrito.length, 1, `con «${textoFoto}»: no escribió`)
    const c = escrito[0].items[0]
    assert.equal(c.comprobante.proveedor, 'Juan Pérez')
    assert.equal(c.comprobante.total, 1540000)
    assert.match(String(filaDeRegistro(c, fajo).clave), /^r:juan-perez\|2026-10-02\|154000000$/)
  }
})

test('un nombre que ya es proveedor se escribe con el nombre del desplegable', async () => {
  const { repoMemoria } = await import('./dobles.mjs')
  const { aplicarDato } = await import('./aplicar.mjs')
  const repo = repoMemoria()
  const fajo = await repo.abrirFajo(null, { userId: 'mm-rodrigo', channelId: 'ch-efectivo', rootPostId: 'post-sereno', items: [itemSereno()] })
  const port = { async query() { return { rows: [{ nombre: 'Pedro Tello', razon_social: null }, { nombre: 'Pedro Fredes', razon_social: null }] } } }
  const r = await aplicarDato({ port, repo }, { fajoId: fajo.id, indices: [0], campo: 'proveedor', valor: 'pedro tello' })
  assert.equal(r.conocido, 'Pedro Tello')
  assert.equal(r.fajo.items[0].comprobante.proveedor, 'Pedro Tello')
  assert.equal(r.fajo.items[0].proveedorNuevo, false)
  assert.equal(r.listo, true)
  // «Pedro» solo no es nadie: dos proveedores empiezan así y ninguno se llama exactamente «Pedro».
  const r2 = await aplicarDato({ port, repo }, { fajoId: fajo.id, indices: [0], campo: 'proveedor', valor: 'Pedro' })
  assert.equal(r2.conocido, null)
  assert.equal(r2.fajo.items[0].proveedorNuevo, true)
})
