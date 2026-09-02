// GATE 3 · EL COTIZADOR SE PIDE CON LA FRASE Y LOS PLANOS ADJUNTOS — cada test revierte un defecto.
//
// El defecto que este gate evita: «cotizame esta obra» con dos planos adjuntos terminaba en la
// ingesta genérica («leí 2 archivos PDF») mientras la capacidad que los consume (`plano.cotizar`)
// existía al lado. El mecanismo es GENERAL: la tool declara `adjuntos: true` y el gateway la elige
// por la MISMA afinidad del ruteo — sin frases hardcodeadas.
import test from 'node:test'
import assert from 'node:assert/strict'
import { atender } from './xsas-gateway.mjs'

const PLANO = { nombre: 'planta-fundaciones.txt', contenido: 'LÁMINA E-01 · zapatas Z1 60x60 · vigas de fundación VF-10' }

const razonadorMuerto = () => ({
  pedirTexto: async () => { throw new Error('el camino determinístico llamó al modelo potente') },
  pedirTextoONull: async () => { throw new Error('el camino determinístico llamó al modelo potente') },
})

/** El extractor barato de argumentos, con respuesta fija: es traducción, no decisión. */
const extractorQueDevuelve = (json) => ({
  pedirTexto: async () => { throw new Error('sólo pedirTextoONull puede correr acá') },
  pedirTextoONull: async () => JSON.stringify(json),
})

const toolCotizar = (corridas) => ({
  capability: 'os.write',
  adjuntos: true,
  schema: {
    name: 'analizar_planos_y_cotizar',
    description:
      'LEE LOS PLANOS de un cliente u obra y devuelve una COTIZACIÓN BORRADOR con su cascada. '
      + 'USALO cuando el dueño diga "cotizame esta obra", "cotizame estos planos", "armame una cotización de [obra]".',
    input_schema: {
      type: 'object',
      properties: { proyecto: { type: 'string', description: 'cliente u obra' } },
      required: ['proyecto'],
    },
  },
  async run(a) { corridas.push(a); return { cotizacion_id: 7, resumen_texto: `cotización borrador de ${a.proyecto}` } },
})

const registroCon = (corridas) => ({
  mapa: new Map([['plano.cotizar', toolCotizar(corridas)]]),
  porArchivo: new Map(), fallaron: [],
})

const DIRECCION = { id: 'u', rol: 'direccion', permisos: ['drive.read', 'os.read', 'drive.write', 'os.write', 'comercial.read'] }

test('«cotizame esta obra» + plano adjunto CORRE plano.cotizar con los archivos y el proyecto de la frase', async () => {
  const corridas = []
  const r = await atender(
    { actor: DIRECCION, canal: 'app', mensaje: 'cotizame esta obra de Quattropani', adjuntos: [PLANO] },
    { registro: registroCon(corridas), catalogo: [], ia: extractorQueDevuelve({ proyecto: 'Quattropani' }) },
  )
  assert.equal(r.ok, true, JSON.stringify(r.error ?? r.degradacion ?? ''))
  assert.equal(r.capacidades.via, 'adjunto_con_motor')
  assert.equal(corridas.length, 1, 'la capacidad tenía que correr UNA vez')
  assert.equal(corridas[0].proyecto, 'Quattropani')
  assert.equal(corridas[0].archivos.length, 1, 'los adjuntos tienen que llegar a la tool')
  assert.equal(corridas[0].archivos[0].nombre, PLANO.nombre)
  assert.match(String(corridas[0].archivos[0].contenido ?? ''), /zapatas Z1/, 'el contenido llega ENTERO a la tool')
  assert.match(r.respuesta, /cotización borrador de Quattropani/)
  // La traza no arrastra los bytes: en acciones queda nombre y tamaño, no el archivo.
  const args = r.acciones.ejecutadas[0].args
  assert.equal(args.archivos[0].nombre, PLANO.nombre)
  assert.equal(args.archivos[0].contenido ?? undefined, undefined, 'los bytes no pueden viajar en acciones/traza')
})

test('UN PLANO SIN FRASE MÁGICA VA AL COTIZADOR: «mirá esta obra» + plano pregunta la obra, no vuelca el archivo', async () => {
  // ═══ CONTRATO NUEVO (dueño, 02/09 noche: «mira el log… no sirve») ═══
  // Antes: la frase sin afinidad ≥5 mandaba el plano a la ingesta genérica, que le devolvía la
  // extracción cruda. Ahora el ARCHIVO clasificado como plano arranca el cotizador aunque la
  // frase no lo nombre; como «planta-fundaciones» no trae obra en el rótulo, pregunta SOLO eso.
  const corridas = []
  const r = await atender(
    { actor: DIRECCION, canal: 'app', mensaje: 'mirá esta obra', adjuntos: [PLANO] },
    { registro: registroCon(corridas), catalogo: [], ia: extractorQueDevuelve({ proyecto: null }) },
  )
  assert.equal(r.ok, false)
  assert.equal(r.error.tipo, 'falta_dato')
  assert.match(r.respuesta, /¿De qué obra o cliente/)
  assert.equal(corridas.length, 0, 'sin proyecto la capacidad NO corre')
})

test('SIN FRASE MÁGICA + OBRA EN EL RÓTULO: «procesá esto» corre el cotizador con la obra INFERIDA y la declara', async () => {
  // «Estructura San Francisco del Monte Entrepiso.pdf» + «procesá esto» (dueño, 02/09 20:46):
  // preguntar «¿de qué obra?» es ignorar la respuesta que viaja en el nombre del archivo.
  // Deducción determinística (razonadorMuerto prueba que NO tocó el modelo), declarada como
  // inferencia corregible — nunca como hecho.
  const corridas = []
  const ADJ = { nombre: 'Estructura San Francisco del Monte Entrepiso.txt', contenido: 'ANALISIS DE CARGAS · perfilería · sobrecarga · H=6.10m' }
  const r = await atender(
    { actor: DIRECCION, canal: 'app', mensaje: 'procesá esto', adjuntos: [ADJ] },
    { registro: registroCon(corridas), catalogo: [], ia: razonadorMuerto() },
  )
  assert.equal(r.ok, true, JSON.stringify(r.error ?? r.degradacion ?? ''))
  assert.equal(r.capacidades.via, 'adjunto_con_motor')
  assert.equal(corridas.length, 1)
  assert.equal(corridas[0].proyecto, 'San Francisco del Monte')
  assert.match(r.respuesta, /Obra tomada del nombre del archivo: «San Francisco del Monte»/)
  assert.match(r.respuesta, /inferencia/, 'la inferencia se declara, no se presenta como hecho')
})

test('SIN OBRA EN EL RÓTULO: «procesá esto» + «Plano de Estructura.txt» pregunta la obra — nunca la extracción cruda', async () => {
  const corridas = []
  const r = await atender(
    { actor: DIRECCION, canal: 'app', mensaje: 'procesá esto', adjuntos: [{ nombre: 'Plano de Estructura.txt', contenido: '2C 240 · K1 · ESTRUCTURA TECHO P.ALTA H=6.10m' }] },
    { registro: registroCon(corridas), catalogo: [], ia: extractorQueDevuelve({ proyecto: null }) },
  )
  assert.equal(r.ok, false)
  assert.equal(r.error.tipo, 'falta_dato')
  assert.match(r.respuesta, /¿De qué obra o cliente/)
  assert.equal(corridas.length, 0)
})

test('UNA FACTURA NO ES UN PLANO: «procesá esto» + factura sigue en la ingesta de siempre', async () => {
  const corridas = []
  const r = await atender(
    { actor: DIRECCION, canal: 'app', mensaje: 'procesá esto', adjuntos: [{ nombre: 'Factura A 0003-00012345.txt', contenido: 'FACTURA A · CUIT 30-11223344-5 · IVA 21% · total $120.000' }] },
    { registro: registroCon(corridas), catalogo: [], ia: razonadorMuerto() },
  )
  assert.equal(r.ok, true)
  assert.equal(r.capacidades.via, 'archivo_ingesta', 'el cotizador no secuestra papeles administrativos')
  assert.equal(corridas.length, 0)
})

test('FALTA_DATO: «cotizame estos planos» sin proyecto NO inventa — pregunta en criollo y guarda la acción pendiente', async () => {
  // CONTRATO NUEVO (dueño, 02/09 tarde): antes se pedía «mandámelos de nuevo con ese dato» — al
  // dueño no le sirvió («no entiendo qué quiere que haga»). Ahora los bytes persisten y se
  // pregunta sólo lo que falta; el circuito completo está en xsas-pendiente.test.mjs.
  const corridas = []
  const r = await atender(
    { actor: DIRECCION, canal: 'app', mensaje: 'cotizame estos planos', adjuntos: [PLANO] },
    { registro: registroCon(corridas), catalogo: [], ia: extractorQueDevuelve({ proyecto: null }) },
  )
  assert.equal(r.ok, false)
  assert.equal(r.error.tipo, 'falta_dato')
  assert.match(r.respuesta, /¿De qué obra o cliente/)
  assert.doesNotMatch(r.respuesta, /capacidad plano\.cotizar/, 'sin jerga interna en la pregunta')
  assert.equal(corridas.length, 0, 'sin proyecto la capacidad NO corre')
})

test('EL CANDADO: un jefe_obra con planos adjuntos no cotiza, y se le dice por qué', async () => {
  const corridas = []
  const r = await atender(
    { actor: { id: 'j', rol: 'jefe_obra', permisos: ['drive.read', 'os.read'] }, canal: 'app', mensaje: 'cotizame esta obra de Quattropani', adjuntos: [PLANO] },
    { registro: registroCon(corridas), catalogo: [], ia: razonadorMuerto() },
  )
  assert.equal(r.ok, false)
  assert.equal(r.error.tipo, 'sin_permiso')
  assert.match(r.respuesta, /plano\.cotizar/)
  assert.equal(corridas.length, 0)
})

test('UN EXTRACTO SIGUE SIENDO DEL BANCO: con el cotizador registrado al lado, el CSV va al importador', async () => {
  const CSV = [
    'Últimos Movimientos',
    'Cuenta corriente en Pesos Nro. 179-091383/6',
    'Fecha;Suc. Origen;Desc. Sucursal;Cod. Operativo;Referencia;Concepto;Importe;Saldo',
    '02/09/2026;0179;San Juan;3043;000000400;Echeq clearing recibido 48hs;(100.000,00);5.607.239,01',
  ].join('\n')
  const cotizadas = []
  const importadas = []
  const registro = registroCon(cotizadas)
  registro.mapa.set('banco.importar_extracto', {
    capability: 'drive.write',
    schema: { name: 'importar_extracto_bancario', input_schema: { type: 'object', properties: { contenido: { type: 'string' }, nombre: { type: 'string' } }, required: ['contenido'] } },
    async run(a) { importadas.push(a); return { ok: true, resumen_texto: 'importado' } },
  })
  const r = await atender(
    { actor: DIRECCION, canal: 'app', mensaje: 'procesá esto', adjuntos: [{ nombre: 'extracto.csv', contenido: CSV }] },
    { registro, catalogo: [], ia: razonadorMuerto() },
  )
  assert.equal(r.ok, true)
  assert.equal(r.capacidades.via, 'adjunto_extracto')
  assert.equal(importadas.length, 1)
  assert.equal(cotizadas.length, 0, 'el cotizador no puede secuestrar un extracto bancario')
})
