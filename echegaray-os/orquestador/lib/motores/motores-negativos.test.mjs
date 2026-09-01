// LOS OCHO CAMINOS QUE TIENEN QUE FALLAR, Y FALLAR CON NOMBRE.
//
// ═══ CADA UNO SE VIO EN ROJO ANTES QUE EN VERDE ═══
//
// Este repositorio ya tuvo un control que era una constante y no podía dar rojo (escondía $ 4,1 M)
// y una mutación «que lo pone rojo» declarada y nunca corrida. Por eso cada test de acá abajo
// lleva escrita LA MUTACIÓN EXACTA que lo pone en rojo, en código de producción y no en el test, y
// las nueve se corrieron: `node orquestador/scripts/motores-mutaciones.mjs`.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { crearDocumento, actualizarSeccion, exportarDocumento, leerDocumento, reemplazarVariables } from './documento-motor.mjs'
import { crearDesdePlantilla, renderDocumento } from './plantillas-motor.mjs'
import { crearPresentacion } from './presentacion-motor.mjs'
import { validarPropuesta } from './frontera-modelo.mjs'
import { cuerpo, dobleDrive, errorHttp } from './doble-drive.apoyo.mjs'

const DOC = { titulo: 'Nota de prueba', secciones: [{ titulo: 'Cuerpo', bloques: [{ tipo: 'parrafo', texto: 'el texto que se escribió' }] }] }
const LEIDO = cuerpo([['Nota de prueba', 'TITLE'], ['Cuerpo', 'HEADING_1'], ['el texto que se escribió', 'NORMAL_TEXT']])
const DATOS_INFORME = { cliente: 'C', obra: 'O', fecha: '31/08/2026', periodo: 'agosto', resumen: 'r', ejecutado: ['a'] }
/** El actor que SÍ puede escribir. Explícito en cada llamada: los motores no escriben sin saber
 *  quién pide, y un default en el código sería exactamente el permiso que nadie firmó. */
const DUENO = { id: 'jorge@ecsas.com.ar', rol: 'direccion', origen: 'script' }
const DECK_MINIMO = { tipo: 'AVANCE_OBRA', titulo: 'x', laminas: [{ tipo: 'puntos', titulo: 'y', puntos: ['z'] }] }

// 1 ── TEMPLATE INEXISTENTE ────────────────────────────────────────────────────────────────────
// MUTACIÓN QUE LO PONE ROJO: en `plantillas-motor.mjs`, borrar el `if (!p) return fallo(
// TEMPLATE_NOT_FOUND…)` de `crearDesdePlantilla`. Sin él, la línea siguiente lee `p.estado` de
// `null` y el motor tira una excepción en vez de devolver un fallo con nombre.
test('NEGATIVO 1 · una plantilla que no existe no crea nada y dice TEMPLATE_NOT_FOUND', async () => {
  const g = dobleDrive({})
  const r = await crearDesdePlantilla(g, { template_id: 'no.existe.v1', datos: {}, carpeta_id: 'x', actor: DUENO })
  assert.equal(r.codigo, 'TEMPLATE_NOT_FOUND')
  assert.equal(g.llamadas.length, 0, 'no se tocó Drive por una plantilla inexistente')
})

// 2 ── CAMPO REQUERIDO FALTANTE ───────────────────────────────────────────────────────────────
// MUTACIÓN: apagar las DOS guardas —`faltanRequeridos` devolviendo `[]` y el `criticos` de
// `renderSecciones` sin registrar nada—. Apagar una sola no alcanza y eso se midió: el control
// está implementado dos veces y con una sola mutación el test seguía verde sin probar nada.
// Con las dos apagadas el documento sale igual, con la sección «Ejecutado» vacía.
test('NEGATIVO 2 · sin un dato obligatorio no se crea el archivo: MISSING_REQUIRED_FIELD', async () => {
  const g = dobleDrive({})
  const sinDato = { ...DATOS_INFORME }
  delete sinDato.ejecutado
  const r = await crearDesdePlantilla(g, { template_id: 'informe.avance_obra.v1', datos: sinDato, carpeta_id: 'x', actor: DUENO })
  assert.equal(r.codigo, 'MISSING_REQUIRED_FIELD')
  assert.deepEqual(r.falta, ['ejecutado'])
  assert.equal(g.veces('createFile'), 0)
})

// 3 ── SECCIÓN INEXISTENTE ────────────────────────────────────────────────────────────────────
// MUTACIÓN: en `escribirEnSeccion`, cambiar `if (!seccion)` por `const s = seccion ??
// leido.estructura.secciones[0]`. La escritura entra en la primera sección que encuentre, que es
// exactamente el modo de falla que este código existe para evitar.
test('NEGATIVO 3 · una sección que no existe NO se escribe en la de al lado', async () => {
  const g = dobleDrive({ getDoc: LEIDO, docsBatchUpdate: {} })
  const r = await actualizarSeccion(g, 'doc1', { seccion_id: 'no_existe', bloques: [{ tipo: 'parrafo', texto: 'x' }], actor: DUENO })
  assert.equal(r.codigo, 'SECTION_NOT_FOUND')
  assert.deepEqual(r.secciones_disponibles, ['cuerpo'])
  assert.equal(g.veces('docsBatchUpdate'), 0, 'no se escribió una sola letra')
})

// 4 ── FILE_ID INCORRECTO ─────────────────────────────────────────────────────────────────────
// MUTACIÓN: en `errores.mjs`, mapear el 404 a `DRIVE_UNAVAILABLE`. Un id equivocado pasaría a
// parecer una caída de Drive, y quien llama reintentaría para siempre contra un archivo que no existe.
test('NEGATIVO 4 · un file_id que no existe es FILE_NOT_FOUND, no una caída de Drive', async () => {
  const g = dobleDrive({ getDoc: errorHttp(404, 'File not found') })
  const r = await leerDocumento(g, 'id_que_no_existe_1234')
  assert.equal(r.codigo, 'FILE_NOT_FOUND')
  const vacio = await leerDocumento(g, '')
  assert.equal(vacio.codigo, 'FILE_NOT_FOUND')
})

// 5 ── PERMISO DENEGADO ───────────────────────────────────────────────────────────────────────
// MUTACIÓN A: en `errores.mjs`, mapear el 403 a `DRIVE_UNAVAILABLE`.
// MUTACIÓN B: en `frontera-modelo.mjs`, cambiar `permisosDeRol(actor.rol)` por
// `Object.values(OPERACIONES)` — o sea, que todos puedan todo.
// MEDIDO, y vale anotarlo: la mutación «obvia» (`actor.permisos ?? permisosDeRol(...)`, el agujero
// que la auditoría del 27/08 encontró) resultó INERTE acá, porque el esquema Zod del actor DESCARTA
// las llaves que no declara y el `permisos` que viniera en el pedido nunca llega a leerse. Es una
// segunda defensa, y por eso hizo falta una mutación que rompiera de verdad el control.
test('NEGATIVO 5 · sin permiso: FORBIDDEN de Google, y FORBIDDEN antes de salir', async () => {
  const g = dobleDrive({ getDoc: errorHttp(403, 'The caller does not have permission') })
  assert.equal((await leerDocumento(g, 'doc1')).codigo, 'FORBIDDEN')

  const propuesta = { operation: 'crear_documento', proposed_content: DOC }
  const conMentira = validarPropuesta(propuesta, { actor: { id: 'u1', rol: 'jefe_obra', tool: 'slides.crear', permisos: ['drive.write'] } })
  assert.equal(conMentira.codigo, 'FORBIDDEN', 'el rol lo dice la base, nunca el cuerpo del pedido')

  // Y la SEGUNDA cerradura: rol correcto, tool no autorizada a escribir.
  const sinTool = validarPropuesta(propuesta, { actor: { id: 'u1', rol: 'direccion', tool: 'documentos.crear' } })
  assert.equal(sinTool.codigo, 'PERMISSION_REQUIRED')
})

// 6 ── FORMATO NO SOPORTADO ───────────────────────────────────────────────────────────────────
// MUTACIÓN: en `exportarDocumento`, `const mime = FORMATOS[...] ?? FORMATOS.pdf`. Pedir un `.odt`
// devolvería un PDF llamándolo odt, que es peor que negarse.
test('NEGATIVO 6 · un formato que no sabemos exportar es UNSUPPORTED_OPERATION', async () => {
  const g = dobleDrive({ exportarBytesComo: Buffer.from('%PDF-1.4') })
  const r = await exportarDocumento(g, 'doc1', { formato: 'odt' })
  assert.equal(r.codigo, 'UNSUPPORTED_OPERATION')
  assert.deepEqual(r.soportados, ['pdf', 'docx', 'txt'])
  assert.equal(g.veces('exportarBytesComo'), 0)
  assert.equal((await exportarDocumento(g, 'doc1', { formato: 'pdf' })).ok, true)
})

// 7 ── RETRY DUPLICADO ────────────────────────────────────────────────────────────────────────
// MUTACIÓN: en `crearDocumento`, borrar el bloque `if (clave) { const previo = await
// buscarPorClave(...) }`. El segundo intento crea un archivo nuevo y quedan «Informe agosto» e
// «Informe agosto» dos veces, que es el reclamo textual del dueño.
test('NEGATIVO 7 · el reintento devuelve el MISMO archivo, no un segundo', async () => {
  let creado = null
  const g = dobleDrive({
    buscarPorPropiedad: () => (creado ? [creado] : []),
    createFile: (m) => { creado = { id: 'doc_1', name: m.name, parents: m.parents ?? [] }; return { ...creado, mimeType: m.mimeType } },
    docsBatchUpdate: {},
    getDoc: LEIDO,
    getMeta: () => ({ id: 'doc_1', name: 'Nota de prueba', parents: creado?.parents ?? [], trashed: false }),
  })
  const uno = await crearDocumento(g, { contenido: DOC, clave: 'informe-agosto-2026', actor: DUENO })
  const dos = await crearDocumento(g, { contenido: DOC, clave: 'informe-agosto-2026', actor: DUENO })
  assert.equal(uno.ok && dos.ok, true)
  assert.equal(uno.reutilizado, false)
  assert.equal(dos.reutilizado, true)
  assert.equal(dos.id, uno.id)
  assert.equal(g.veces('createFile'), 1, 'el reintento creó un segundo archivo')
})

// 8 ── ESCRITURA QUE NO PERSISTIÓ ─────────────────────────────────────────────────────────────
// MUTACIÓN: en `verificarDocumento`, devolver `{ok:true, verificacion:{}}` antes de comparar. El
// motor diría «creado» sobre un documento vacío, que es la falla que la regla de la casa nombra:
// lo que prueba una escritura es el dato leído en su destino.
test('NEGATIVO 8 · la API dijo 200 y el documento está vacío ⇒ WRITE_NOT_PERSISTED', async () => {
  const g = dobleDrive({
    buscarPorPropiedad: [],
    createFile: { id: 'doc_1', name: 'Nota de prueba' },
    docsBatchUpdate: {},
    getDoc: cuerpo([['Nota de prueba', 'TITLE']]), // Google contestó que sí y no escribió nada
  })
  const r = await crearDocumento(g, { contenido: DOC, actor: DUENO })
  assert.equal(r.ok, false)
  assert.equal(r.codigo, 'WRITE_NOT_PERSISTED')
  assert.deepEqual(r.titulos_ausentes, ['Cuerpo'])
  assert.deepEqual(r.textos_ausentes, ['el texto que se escribió'])
})

// EXTRA ── DRIVE CAÍDO ────────────────────────────────────────────────────────────────────────
test('NEGATIVO 9 · Drive caído es DRIVE_UNAVAILABLE, y sin cliente tampoco se afirma nada', async () => {
  const g = dobleDrive({ getDoc: errorHttp(503, 'backend error') })
  assert.equal((await leerDocumento(g, 'doc1')).codigo, 'DRIVE_UNAVAILABLE')
  assert.equal((await leerDocumento({}, 'doc1')).codigo, 'DRIVE_UNAVAILABLE')
  const red = new Error('fetch failed')
  assert.equal((await leerDocumento(dobleDrive({ getDoc: red }), 'doc1')).codigo, 'DRIVE_UNAVAILABLE')
})

// EXTRA ── EL SHEET DE PRODUCCIÓN ─────────────────────────────────────────────────────────────
test('NEGATIVO 10 · el Cash Flow real no se toca desde este motor, lo pida quien lo pida', () => {
  const r = validarPropuesta(
    { operation: 'reemplazar_variables', file_id: '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8', proposed_content: {} },
    { actor: { id: 'u1', rol: 'direccion', tool: 'slides.crear' } })
  assert.equal(r.codigo, 'FORBIDDEN')
  assert.match(r.motivo, /fuente de verdad/)
})

// ═══ LOS CINCO QUE UN AUDITOR ENCONTRÓ INERTES (31/08/2026) ═══
//
// Un revisor con contexto nuevo rehizo las mutaciones de arriba (9/9 rojo) y después hizo las
// suyas: cinco controles que existían y NO podían dar rojo. La lección, que ya había aparecido con
// `faltanRequeridos` y no terminé de aplicar: cuando un control está implementado DOS VECES, hay
// que mutar cada mitad POR SEPARADO. Apagar las dos juntas esconde que una sola no está probada.

// 11 ── EL VERIFY-AFTER-WRITE DE LA RUTA DE ACTUALIZACIÓN ──────────────────────────────────────
// MUTACIÓN: en `verificarSeccion`, devolver `{ok:true, verificacion:{}}` en la primera línea.
// El NEGATIVO 8 cubre `verificarDocumento` —la ruta de CREACIÓN— y dejaba la de actualización sin
// guardia probada: `actualizarSeccion` e `insertarEnSeccion` cierran por acá y por ningún otro lado.
test('NEGATIVO 11 · actualizar una sección y que no quede nada ⇒ WRITE_NOT_PERSISTED', async () => {
  const g = dobleDrive({
    getDoc: LEIDO, // relee SIEMPRE lo mismo: el texto nuevo nunca aparece
    docsBatchUpdate: {},
  })
  const r = await actualizarSeccion(g, 'doc1', { seccion_id: 'cuerpo', actor: DUENO, bloques: [{ tipo: 'parrafo', texto: 'lo que Google dijo haber escrito' }] })
  assert.equal(r.ok, false)
  assert.equal(r.codigo, 'WRITE_NOT_PERSISTED')
  assert.deepEqual(r.ausentes, ['lo que Google dijo haber escrito'])
  assert.ok(g.veces('docsBatchUpdate') > 0, 'la escritura se intentó: lo que falló es la comprobación')
})

// 12 ── LAS VARIABLES QUE QUEDARON A LA VISTA ─────────────────────────────────────────────────
// MUTACIÓN: en `reemplazarVariables`, borrar el `if (sinReemplazar.length) return fallo(...)`.
// Un contrato con `{{monto}}` impreso se manda igual y lo descubre el cliente.
test('NEGATIVO 12 · si una {{variable}} sobrevivió al reemplazo, no se dice que se reemplazó', async () => {
  const conHueco = cuerpo([['Nota', 'TITLE'], ['Cuerpo', 'HEADING_1'], ['Monto: {{monto}}', 'NORMAL_TEXT']])
  const g = dobleDrive({ getDoc: conHueco, docsBatchUpdate: {} })
  const r = await reemplazarVariables(g, 'doc1', { monto: '$ 1' }, { actor: DUENO })
  assert.equal(r.codigo, 'WRITE_NOT_PERSISTED')
  assert.deepEqual(r.sin_reemplazar, ['monto'])
})

// 13 ── LA MITAD B DEL CONTROL DE DATOS ───────────────────────────────────────────────────────
// MUTACIÓN: en `renderSecciones`, borrar el `incompletas.push(...)`.
// La mitad A (`faltanRequeridos`) atrapa lo OBLIGATORIO que falta. Esta mitad es la otra: una
// sección obligatoria a la que le faltó un dato OPCIONAL sale igual —y tiene que decirlo—. Antes
// esta rama existía y no hacía nada: por eso mutarla no ponía nada en rojo.
test('NEGATIVO 13 · un certificado sin su acumulado sale, y lo DECLARA', async () => {
  const sinAcumulado = {
    cliente: 'C', obra: 'O', fecha: '31/08/2026', numero: '3', periodo: 'agosto',
    items: [{ item: 'Frente A', avance: '100 %', monto: 'ver certificado' }], monto_del_periodo: 'ver certificado',
  }
  const r = renderDocumento('certificado.avance.v1', sinAcumulado)
  assert.equal(r.ok, true, 'un acumulado ausente no invalida el certificado')
  assert.deepEqual(r.incompletas, [{ seccion: 'cierre', sin_dato: ['acumulado'] }])
  // Y con el dato puesto no hay nada que declarar: el control distingue los dos casos.
  assert.deepEqual(renderDocumento('certificado.avance.v1', { ...sinAcumulado, acumulado: 'ver certificado' }).incompletas, [])
})

// 14 ── DÓNDE QUEDÓ EL ARCHIVO ────────────────────────────────────────────────────────────────
// MUTACIÓN: en `crearDocumento`, sacar el `...(carpeta_id ? { parents: [carpeta_id] } : {})`.
// El documento sale perfecto en la raíz del Drive del dueño en vez de en la carpeta del cliente, y
// el control de contenido —que sólo mira lo que dice adentro— lo aprueba.
test('NEGATIVO 14 · un archivo perfecto en la carpeta equivocada NO está bien', async () => {
  // El doble responde `getMeta` CON LO QUE RECIBIÓ `createFile`, como haría Drive. Si contestara
  // siempre lo mismo, el test probaría que `verificarDestino` sabe comparar dos strings, no que el
  // motor pide la carpeta — y sacarle el `parents` al motor seguiría en verde. Pasó: la primera
  // versión de este test se quedó verde con la mutación puesta.
  let creado = null
  const fiel = dobleDrive({
    buscarPorPropiedad: [],
    createFile: (m) => { creado = { id: 'doc_1', name: m.name, parents: m.parents ?? [] }; return creado },
    docsBatchUpdate: {},
    getDoc: LEIDO,
    getMeta: () => ({ id: 'doc_1', parents: creado.parents, trashed: false }),
  })
  const bien = await crearDocumento(fiel, { contenido: DOC, carpeta_id: 'CARPETA_DEL_CLIENTE', actor: DUENO })
  assert.equal(bien.ok, true, JSON.stringify(bien))
  assert.equal(bien.verificacion.carpeta, 'CARPETA_DEL_CLIENTE', 'el motor tiene que PEDIR la carpeta, no sólo comprobarla')

  // Y si Drive lo deja en otro lado igual —o alguien lo movió entre la creación y el control—,
  // el contenido impecable no salva al archivo perdido.
  const g = dobleDrive({
    buscarPorPropiedad: [],
    createFile: (m) => ({ id: 'doc_1', name: m.name, parents: m.parents ?? [] }),
    docsBatchUpdate: {},
    getDoc: LEIDO,
    getMeta: () => ({ id: 'doc_1', parents: ['OTRA_CARPETA'], trashed: false }),
  })
  const r = await crearDocumento(g, { contenido: DOC, carpeta_id: 'CARPETA_DEL_CLIENTE', actor: DUENO })
  assert.equal(r.codigo, 'WRITE_NOT_PERSISTED')
  assert.equal(r.esperada, 'CARPETA_DEL_CLIENTE')
  assert.deepEqual(r.quedó_en, ['OTRA_CARPETA'])

  // Y el archivo que nació en la papelera tampoco pasa.
  const enPapelera = dobleDrive({
    buscarPorPropiedad: [], createFile: { id: 'doc_1' }, docsBatchUpdate: {}, getDoc: LEIDO,
    getMeta: () => ({ id: 'doc_1', parents: ['CARPETA_DEL_CLIENTE'], trashed: true }),
  })
  assert.match((await crearDocumento(enPapelera, { contenido: DOC, carpeta_id: 'CARPETA_DEL_CLIENTE', actor: DUENO })).motivo, /papelera/)
})

// 15 ── EL PORTERO, LLAMADO DESDE ADENTRO ─────────────────────────────────────────────────────
// MUTACIÓN: en `documento-motor.mjs`, borrar el `if (!puerta.ok) return puerta` de `crearDocumento`.
// Es la que el auditor señaló: la frontera validaba lindo y NINGÚN motor la importaba, así que
// cualquiera que llamara al motor escribía Drive con el token del dueño salteándose las dos
// cerraduras y la lista de archivos prohibidos.
test('NEGATIVO 15 · sin actor no se escribe, y el rol se comprueba DENTRO del motor', async () => {
  const g = dobleDrive({})
  const sinActor = await crearDocumento(g, { contenido: DOC })
  assert.equal(sinActor.codigo, 'FORBIDDEN')
  assert.equal(g.llamadas.length, 0, 'no se tocó Drive sin saber quién pedía')

  const jefe = await crearDocumento(g, { contenido: DOC, actor: { id: 'u2', rol: 'jefe_obra', origen: 'script' } })
  assert.equal(jefe.codigo, 'FORBIDDEN')

  // La misma puerta, en los otros dos motores y en la entrada de plantillas.
  assert.equal((await actualizarSeccion(g, 'doc1', { seccion_id: 'cuerpo', bloques: [{ tipo: 'parrafo', texto: 'x' }] })).codigo, 'FORBIDDEN')
  assert.equal((await crearPresentacion(g, { contenido: DECK_MINIMO })).codigo, 'FORBIDDEN')
  assert.equal((await crearDesdePlantilla(g, { template_id: 'informe.avance_obra.v1', datos: DATOS_INFORME, carpeta_id: 'x' })).codigo, 'FORBIDDEN')
  assert.equal(g.llamadas.length, 0)

  // Y el archivo prohibido lo frena el motor, no sólo la frontera de las propuestas.
  const alCashFlow = await actualizarSeccion(g, '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8', {
    seccion_id: 'cuerpo', bloques: [{ tipo: 'parrafo', texto: 'x' }], actor: DUENO,
  })
  assert.equal(alCashFlow.codigo, 'FORBIDDEN')
  assert.match(alCashFlow.motivo, /fuente de verdad/)
  assert.equal(g.llamadas.length, 0)

  // Y un archivo que no está entre los que se abrieron para la tarea tampoco.
  const ajeno = await actualizarSeccion(g, 'doc_ajeno_1234', {
    seccion_id: 'cuerpo', bloques: [{ tipo: 'parrafo', texto: 'x' }], actor: DUENO, archivos_habilitados: ['doc_propio_1234'],
  })
  assert.equal(ajeno.codigo, 'FORBIDDEN')
})
