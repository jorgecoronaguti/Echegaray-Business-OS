// QUIÉN RECLAMA EL ARCHIVO — la trampa número uno de este subsistema.
//
// El Director decide ANTES que cualquier router: una capacidad puede estar impecable y no ejecutarse
// nunca porque nadie reclamó el mensaje. Este archivo prueba la frontera entre los DOS especialistas
// que miran adjuntos, que es lo único que puede salir mal acá:
//
//   · en el área `compras` manda Compras IA (la foto de la factura);
//   · en cualquier otro lado manda la recepción genérica (el CSV del banco, el PDF, el resto).
//
// Las dos gramáticas son mutuamente excluyentes por construcción. Si alguien las toca y se pisan, el
// Director ve dos reclamos y el mensaje termina resolviéndose por confianza o por el modelo — que es
// exactamente lo que este subsistema evita gastar.

import test from 'node:test'
import assert from 'node:assert/strict'
import { especialista as archivos } from './archivos.mjs'
import { especialista as comprobantes } from './comprobantes.mjs'
import { resolver, VIA } from '../director.mjs'
import { especialistas, especialistaDeArea } from '../registro-especialistas.mjs'

const portSinCanal = { async query() { return { rows: [] } } }
const portCanal = (area) => ({
  async query(sql) {
    if (/canales_area/.test(sql)) return { rows: [{ area_clave: area, canal_nombre: `canal-${area}` }] }
    return { rows: [] }
  },
})

test('EN EL CANAL DE COMPRAS el adjunto es de Compras IA, y la recepción genérica NO lo reclama', async () => {
  assert.equal((await comprobantes.reconoce('', { fileIds: ['f1'], area: 'compras' })).destino, 'cargar')
  assert.equal(archivos.reconoce('', { fileIds: ['f1'], area: 'compras' }), null,
    'robarle la foto a Compras IA rompería la carga de gastos entera')
})

test('FUERA DE COMPRAS el adjunto es de la recepción genérica, y Compras IA NO lo reclama', async () => {
  assert.equal(archivos.reconoce('', { fileIds: ['f1'], area: 'administracion_finanzas' }).destino, 'recibir')
  assert.equal(await comprobantes.reconoce('', { fileIds: ['f1'], area: 'administracion_finanzas' }), null)
})

test('sin adjuntos no reclama nada: un mensaje de texto no es un archivo', () => {
  assert.equal(archivos.reconoce('cuánta plata me sobra', { fileIds: [], area: 'administracion_finanzas' }), null)
  assert.equal(archivos.reconoce('hola', {}), null)
})

test('EL RECLAMO ES DETERMINÍSTICO: mirar quién atiende no cuesta un centavo', () => {
  // Si `reconoce` llamara al modelo, cada archivo que alguien suelta costaría plata sólo por existir.
  const antes = Date.now()
  for (let i = 0; i < 1000; i++) archivos.reconoce('', { fileIds: ['f1'] })
  assert.ok(Date.now() - antes < 200, 'mil reclamos en menos de 200 ms: es una comparación, no una consulta')
})

test('EL DIRECTOR LE DA EL CSV A LA RECEPCIÓN GENÉRICA — sin razonar, por reclamo', async () => {
  const r = await resolver({
    texto: '', port: portCanal('administracion_finanzas'), channelId: 'c1', fileIds: ['f1'],
    razonar: () => { throw new Error('SE LLAMÓ AL MODELO PARA RUTEAR UN ARCHIVO') },
  })
  assert.equal(r.especialista?.slug, 'archivos')
  assert.ok([VIA.RECLAMO, VIA.AREA_CANAL].includes(r.via), `vía determinística, no razonamiento (fue ${r.via})`)
})

test('EL DIRECTOR LE DA LA FOTO DEL CANAL DE COMPRAS A COMPRAS IA', async () => {
  const r = await resolver({
    texto: '', port: portCanal('compras'), channelId: 'c-compras', fileIds: ['f1'],
    razonar: () => { throw new Error('SE LLAMÓ AL MODELO') },
  })
  assert.equal(r.especialista?.slug, 'comprobantes')
})

test('UN ARCHIVO EN UN DM (sin área) llega a la recepción genérica y no al catálogo', async () => {
  // Es el caso del pedido: el dueño le manda el CSV al bot por privado. Antes moría en "no supe a
  // quién derivarlo" con la capacidad entera construida del otro lado.
  const r = await resolver({
    texto: '', port: portSinCanal, channelId: 'dm-1', fileIds: ['f1'],
    razonar: () => { throw new Error('SE LLAMÓ AL MODELO') },
  })
  assert.equal(r.especialista?.slug, 'archivos')
  assert.equal(r.via, VIA.RECLAMO)
})

test('NO LE ROBA EL CANAL AL TESORERO: administracion_finanzas sigue teniendo un solo preferido', async () => {
  const preferido = await especialistaDeArea('administracion_finanzas')
  assert.equal(preferido.slug, 'tesoreria', 'la recepción de archivos atiende por reclamo, nunca por pertenencia')
})

test('queda declarado en el catálogo: una capacidad que no se puede descubrir no existe', async () => {
  const todos = await especialistas({ recargar: true })
  const e = todos.find((x) => x.slug === 'archivos')
  assert.ok(e, 'el registro se arma leyendo el directorio: tiene que estar')
  assert.equal(e.operativo, true)
  assert.match(e.descripcion, /formato REAL por su contenido/)
})

test('sin identidad de plataforma no se procesa nada (fail-closed)', async () => {
  const r = await archivos.atender({ texto: '', fileIds: ['f1'], actor: {}, port: portSinCanal })
  assert.equal(r.estado, 'sin_identidad')
})

test('sin adjuntos, `atender` explica qué sabe hacer en vez de fallar', async () => {
  const r = await archivos.atender({ texto: 'hola', fileIds: [], actor: { plataforma_user_id: 'u1' } })
  assert.equal(r.estado, 'ayuda')
  assert.match(r.texto, /CSV o Excel del banco/)
})
