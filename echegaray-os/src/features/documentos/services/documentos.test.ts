// DOCUMENTOS — los tests son los casos que hacían mentir a la pantalla.
//
// El más importante es el de la vigencia: el canónico de diseño pinta «Vigente» en verde para casi
// todas las filas, y con los datos reales eso es una afirmación falsa 3.123 veces.

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  carpetaDe, conVinculos, enlaceDescarga, enlaceDrive, enlacePreview, estadoVigencia, etiquetaLegajo,
  hayVencimientos, IDS_POR_PARTE, migajaDe, partirIds, pesoLegible, resumirListado, unirPartes,
  type ArchivoIndexado, type VinculoCliente, type VinculoLegajo, type VinculoObra,
} from './documentos.ts'

/** Una fila ya armada, como la recibe la tabla. Sólo importan `vence` y el id. */
const doc = (vence: string | null, id = Math.random().toString(36)) => ({
  drive_file_id: id, name: 'x.pdf', path: null, tipo: 'pdf', mime_type: null, size_bytes: null,
  modified_time: null, nombre_norm: 'x', vinculos: [], vence,
})

const archivo = (p: Partial<ArchivoIndexado> = {}): ArchivoIndexado => ({
  drive_file_id: 'f1',
  name: 'EPP QUIROGA Y BAZAN.pdf',
  path: 'administracion/PRESUPUESTOS - CLIENTES/ARCOR - SAN JUAN/PUENTE DE PLAYA/EPP.pdf',
  tipo: 'pdf', mime_type: 'application/pdf', size_bytes: 1766658,
  modified_time: '2024-03-20T15:04:19.005+00:00',
  nombre_norm: 'epp quiroga y bazan', ...p,
})

test('un documento sin vencimiento cargado NO está vigente: no se sabe', () => {
  assert.equal(estadoVigencia(null, '2026-08-21'), null, 'afirmó vigencia sin tener la fecha')
  assert.equal(estadoVigencia('', '2026-08-21'), null)
})

test('la vigencia distingue vencido, por vencer y vigente contra el día de hoy', () => {
  assert.equal(estadoVigencia('2026-08-12', '2026-08-21'), 'vencido')
  assert.equal(estadoVigencia('2026-09-04', '2026-08-21'), 'vence-pronto')
  assert.equal(estadoVigencia('2027-02-11', '2026-08-21'), 'vigente')
  // El borde: vence HOY todavía no está vencido, y a 30 días sigue siendo aviso.
  assert.equal(estadoVigencia('2026-08-21', '2026-08-21'), 'vence-pronto')
  assert.equal(estadoVigencia('2026-09-20', '2026-08-21'), 'vence-pronto')
  assert.equal(estadoVigencia('2026-09-21', '2026-08-21'), 'vigente')
})

test('la columna VENCE no se dibuja si ninguna fila tiene vencimiento', () => {
  const sin = conVinculos([archivo()], [], [])
  assert.equal(hayVencimientos(sin), false, 'iba a dibujar 3.123 celdas que dicen «sin dato»')
  const con = conVinculos([archivo()], [legajo({ fecha_vencimiento: '2026-09-04' })], [])
  assert.equal(hayVencimientos(con), true, 'escondió el único vencimiento que existe')
})

const legajo = (p: Partial<VinculoLegajo> = {}): VinculoLegajo => ({
  id: 'l1', drive_file_id: 'f1', tipo_documento: 'alta_temprana', fecha_vencimiento: null,
  persona_id: 'p1', personas: { nombre_completo: 'GONZALEZ EMILIANO' }, ...p,
})

const docCliente = (p: Partial<VinculoCliente> = {}): VinculoCliente => ({
  drive_file_id: 'f1', rol: null,
  clientes: { nombre_comercial: 'ARCOR', slug: 'arcor' }, ...p,
})

test('un archivo que cuelga de una persona y de un cliente muestra los DOS vínculos', () => {
  const [d] = conVinculos([archivo()], [legajo()], [docCliente()])
  assert.equal(d.vinculos.length, 2, 'se quedó con el primer vínculo y ocultó el otro')
  assert.deepEqual(d.vinculos.map((v) => v.clase).sort(), ['cliente', 'persona'])
})

test('un archivo sin vínculo no se pierde ni se le inventa dueño', () => {
  const [d] = conVinculos([archivo({ drive_file_id: 'huerfano' })], [legajo()], [docCliente()])
  assert.deepEqual(d.vinculos, [], 'le colgó el vínculo de OTRO archivo')
  assert.equal(d.drive_file_id, 'huerfano')
})

test('el rol vacío de un documento de cliente es «sin clasificar», no una cadena vacía', () => {
  // Las 214 filas de `cliente_documento` tienen `rol` en null: si se dibujara tal cual, la columna
  // quedaría con 214 huecos mudos en vez de decir que nadie los clasificó.
  const [d] = conVinculos([archivo()], [], [docCliente({ rol: '   ' })])
  assert.equal(d.vinculos[0].detalle, null)
})

test('un vínculo sin destino navegable no dibuja un enlace roto', () => {
  const [d] = conVinculos([archivo()], [legajo({ persona_id: null })], [])
  assert.equal(d.vinculos[0].href, null, 'iba a dibujar un enlace a /administracion/personas/null')
})

test('el nombre del tipo de documento se lee, no se muestra el valor de la base', () => {
  assert.equal(etiquetaLegajo('libreta_fondo_cese'), 'Libreta fondo cese')
  assert.equal(etiquetaLegajo(null), null)
  assert.equal(etiquetaLegajo('  '), null)
})

test('el archivo se ABRE en Drive: el OS no lo copia ni lo sirve', () => {
  assert.equal(
    enlaceDrive('17P0Zrixdwa091srh-p4LXD30Mv8qS6sG'),
    'https://drive.google.com/file/d/17P0Zrixdwa091srh-p4LXD30Mv8qS6sG/view',
  )
})

// ── DESCARGAR Y PREVISUALIZAR ──────────────────────────────────────────────────────────────────
//
// EL DEFECTO QUE ATRAPAN: ofrecer «Descargar» sobre algo que no tiene bytes. 15 de los 3.123
// archivos son de Google —10 nativos y 5 accesos directos— y para ésos el botón bajaría nada.

test('un binario de Drive se descarga; un nativo de Google, no', () => {
  assert.equal(
    enlaceDescarga('17P0Zri', 'application/pdf'),
    'https://drive.google.com/uc?export=download&id=17P0Zri',
  )
  assert.equal(enlaceDescarga('17P0Zri', 'application/vnd.google-apps.document'), null,
    'iba a bajar un archivo de 0 bytes')
  assert.equal(enlaceDescarga('17P0Zri', 'application/vnd.google-apps.shortcut'), null)
  // Sin mime declarado se asume binario: es el caso de los 17 `application/octet-stream` del índice
  // y de cualquier archivo que el indexador no supo tipar. Bajarlo funciona.
  assert.equal(enlaceDescarga('17P0Zri', null), 'https://drive.google.com/uc?export=download&id=17P0Zri')
})

test('el visor embebido cambia según el producto, y no existe para un acceso directo', () => {
  assert.equal(enlacePreview('a1', 'application/pdf'), 'https://drive.google.com/file/d/a1/preview')
  // Un Doc nativo en drive.google.com/file/… devuelve error, no el documento.
  assert.equal(enlacePreview('a1', 'application/vnd.google-apps.document'), 'https://docs.google.com/document/d/a1/preview')
  assert.equal(enlacePreview('a1', 'application/vnd.google-apps.spreadsheet'), 'https://docs.google.com/spreadsheets/d/a1/preview')
  assert.equal(enlacePreview('a1', 'application/vnd.google-apps.shortcut'), null, 'un acceso directo no tiene nada que mostrar')
  assert.equal(enlacePreview('a1', 'application/vnd.google-apps.folder'), null)
})

// ── EL VÍNCULO QUE PUEDE LLEVAR VENCIMIENTO ────────────────────────────────────────────────────

test('sólo el vínculo de legajo trae el id con el que se escribe el vencimiento', () => {
  const [d] = conVinculos([archivo()], [legajo({ id: 'leg-9' })], [docCliente()])
  const persona = d.vinculos.find((v) => v.clase === 'persona')
  const cliente = d.vinculos.find((v) => v.clase === 'cliente')
  assert.equal(persona?.legajoId, 'leg-9')
  // `cliente_documento` NO tiene columna de vencimiento: ofrecer el campo ahí sería un formulario
  // que acepta una fecha y no la guarda en ningún lado.
  assert.equal(cliente?.legajoId, null, 'iba a ofrecer editar el vencimiento de un cliente')
})

test('la carpeta es la ruta SIN el nombre del archivo', () => {
  assert.equal(carpetaDe('administracion/LOGO SAS/logo.png'), 'administracion/LOGO SAS')
  assert.equal(carpetaDe('carga-masiva.xlsx'), null, 'llamó carpeta al archivo suelto de la raíz')
  assert.equal(carpetaDe(null), null)
})

test('la migaja recorta por el MEDIO y respeta el máximo de tramos', () => {
  const larga = 'administracion/PRESUPUESTOS - CLIENTES/ARCOR - SAN JUAN/PUENTE DE PLAYA/x.pdf'
  assert.equal(migajaDe(larga), 'administracion / … / PUENTE DE PLAYA')
  assert.equal(
    migajaDe(larga)?.split(' / ').length, 3,
    'recortó a 3 y devolvió 4: el recorte no acotaba nada',
  )
  // Corta ya: no se recorta lo que entra.
  assert.equal(migajaDe('libro-sueldos/2025/recibo.pdf'), 'libro-sueldos / 2025')
})

test('un tamaño ausente es «sin dato», nunca «0 kB»', () => {
  assert.equal(pesoLegible(null), null, 'un archivo sin tamaño se dibujó como vacío')
  assert.equal(pesoLegible(0), '0 B')
  assert.equal(pesoLegible(1766658), '1,7 MB')
  assert.equal(pesoLegible(2048), '2 kB')
})

// ── EL ARCHIVO DE UNA OBRA ─────────────────────────────────────────────────────────────────────
//
// EL DEFECTO QUE ATRAPA: `obra_documento` estaba en 0 filas el 21/08 y la pantalla dejó de mirarla.
// El 24/08 tiene 32. Un vínculo que existe y no se lee hace que «De obras» devuelva vacío y que
// alguien concluya que la obra no tiene papeles cargados.

const docObra = (p: Partial<VinculoObra> = {}): VinculoObra => ({
  drive_file_id: 'f1', rol: null, obra_canonica: { id: 'quattropani', nombre: 'Salón Comercial' }, ...p,
})

test('un archivo colgado de una obra publica su vínculo y el enlace a la obra', () => {
  const [d] = conVinculos([archivo()], [], [], [docObra()])
  assert.equal(d.vinculos.length, 1, 'ignoró obra_documento')
  assert.equal(d.vinculos[0].clase, 'obra')
  assert.equal(d.vinculos[0].nombre, 'Salón Comercial')
  // `obra_canonica.id` ES el identificador de la URL: no existe columna `slug`.
  assert.equal(d.vinculos[0].href, '/obras/quattropani')
})

test('un archivo que cuelga de una obra Y de un cliente muestra los dos', () => {
  const [d] = conVinculos([archivo()], [], [docCliente()], [docObra()])
  assert.deepEqual(d.vinculos.map((v) => v.clase).sort(), ['cliente', 'obra'])
})

test('una obra sin nombre no deja el vínculo mudo ni dibuja un enlace roto', () => {
  const [d] = conVinculos([archivo()], [], [], [docObra({ obra_canonica: { id: null, nombre: null } })])
  assert.equal(d.vinculos[0].nombre, 'obra sin nombre')
  assert.equal(d.vinculos[0].href, null, 'iba a dibujar un enlace a /obras/null')
})

// ── LA CONSULTA PARTIDA ────────────────────────────────────────────────────────────────────────
//
// ═══ EL DEFECTO QUE ATRAPA, Y ES REAL, NO HIPOTÉTICO ═══
//
// `documentacion_legajo` tiene 847 `drive_file_id` distintos (medido 24/08/2026). Pedirlos en un
// solo `drive_index?drive_file_id=in.(…)` es una URL de ~30 kB y PostgREST devuelve **400 Bad
// Request** — comprobado contra la base real, no supuesto. El recorte por vencimiento que ya
// existía (`idsPorVencer`) sólo funciona hoy porque NINGUNA de las 847 filas tiene fecha cargada, y
// la fecha la carga esta misma pantalla: el día que se carguen 500, «Vencidos» deja de filtrar y
// devuelve un error.
//
// Si alguien vuelve a un solo `.in()` —o sube `IDS_POR_PARTE` a 847 «porque son pocos»— este
// archivo se pone rojo antes de que la pantalla se rompa en producción.

/** El presupuesto de URL de PostgREST, con margen para el resto de los filtros. */
const LIMITE_URL_B = 8000

test('847 ids se parten en tramos que caben en una URL, y no se pierde ni se repite ninguno', () => {
  const ids = Array.from({ length: 847 }, (_, i) => `1ljxxCI_PMRZ0HQiOo0on4z-CUZOm${String(i).padStart(4, '0')}`)
  const partes = partirIds(ids)

  for (const parte of partes) {
    assert.ok(parte.length <= IDS_POR_PARTE, `una parte trae ${parte.length} ids`)
    // `in.(a,b,c)` más el nombre de la columna: lo que de verdad se mide es el largo de la URL.
    const largo = `drive_file_id=in.(${parte.join(',')})`.length
    assert.ok(largo <= LIMITE_URL_B, `la parte arma una URL de ${largo} B y PostgREST devuelve 400`)
  }

  const unidos = partes.flat()
  assert.equal(unidos.length, ids.length, 'se perdieron o se duplicaron ids al partir')
  assert.deepEqual(new Set(unidos).size, ids.length)
  assert.deepEqual(unidos, ids, 'el orden de los ids cambió')
})

test('partir una lista vacía no deja una parte vacía que consultaría TODO', () => {
  // Un `.in('drive_file_id', [])` no devuelve cero filas: en algunos clientes se cae hacia el lado
  // abierto. Sin partes no hay consulta, que es lo correcto.
  assert.deepEqual(partirIds([]), [])
})

test('unir las partes rehace el orden global, no las concatena', () => {
  // Cada parte viene ordenada por fecha descendente; el conjunto NO lo está. Concatenar dibujaría
  // los 150 más nuevos de la parte 1, después los de la parte 2, y la lista mentiría sobre qué se
  // tocó último.
  const unido = unirPartes(
    [
      [{ modified_time: '2026-08-20' }, { modified_time: '2026-01-02' }],
      [{ modified_time: '2026-08-24' }, { modified_time: '2026-05-05' }],
    ],
    10,
  )
  assert.deepEqual(unido.map((d) => d.modified_time), ['2026-08-24', '2026-08-20', '2026-05-05', '2026-01-02'])
})

test('unir recorta al tope: dos partes de 100 no dibujan 200 filas', () => {
  const parte = (base: string) => Array.from({ length: 100 }, (_, i) => ({ modified_time: `${base}-${i}` }))
  assert.equal(unirPartes([parte('2026'), parte('2025')], 100).length, 100)
})

test('un archivo sin fecha de modificación no encabeza la lista', () => {
  // `null` ordenado como cadena vacía queda al final, que es donde va: no saber cuándo se tocó no
  // es haberlo tocado recién.
  const unido = unirPartes([[{ modified_time: null }, { modified_time: '2026-08-24' }]], 10)
  assert.deepEqual(unido.map((d) => d.modified_time), ['2026-08-24', null])
})

// ═══ EL PIE DE TOTALES — el defecto que atrapa: afirmar que está todo en orden ═══

test('el pie NO puede afirmar «0 vencidos» cuando nadie cargó una fecha', () => {
  // Es el estado real de hoy: 847 filas de legajo con `fecha_vencimiento` en null. Un pie que
  // dijera VENCIDOS 0 se lee «está todo controlado», y lo que pasa es que el control no existe.
  // `conVencimiento` es lo que deja al componente callarse; si volviera a contar filas en vez de
  // fechas, este test se pone rojo.
  const r = resumirListado([doc(null), doc(null), doc(null)], '2026-08-24')
  assert.equal(r.documentos, 3)
  assert.equal(r.conVencimiento, 0, 'contó como controlado un documento sin fecha')
  assert.equal(r.vencidos, 0)
})

test('el pie cuenta vencido, por vencer y vigente con la misma regla que pinta la fila', () => {
  const r = resumirListado(
    [doc('2026-08-01'), doc('2026-09-10'), doc('2027-01-01'), doc(null)],
    '2026-08-24',
  )
  assert.equal(r.documentos, 4, 'el total son las filas dibujadas, tengan fecha o no')
  assert.equal(r.conVencimiento, 3)
  assert.equal(r.vencidos, 1)
  assert.equal(r.porVencer, 1, 'el que vence en 17 días entra en la ventana de 30')
  // El vigente no se cuenta en ninguno de los dos avisos: existe y no es noticia.
  assert.equal(r.vencidos + r.porVencer, 2)
})

test('el pie usa el MISMO día que la fila: el corte de los 30 días no se corre', () => {
  // El día 30 todavía es «vence pronto» y el 31 ya es «vigente». Si el pie contara con otra
  // ventana que `estadoVigencia`, la tabla mostraría una pastilla ámbar que el pie no cuenta.
  assert.equal(resumirListado([doc('2026-09-23')], '2026-08-24').porVencer, 1)
  assert.equal(resumirListado([doc('2026-09-24')], '2026-08-24').porVencer, 0)
})
