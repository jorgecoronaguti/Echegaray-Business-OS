// LOS CUATRO DEFECTOS QUE ESTA CAPA TIENE QUE PODER ATRAPAR.
//
// Cada bloque de abajo describe un defecto que ya existió o que la forma de los datos hace
// inevitable. Si se revierte el arreglo, el test correspondiente se pone rojo — que es lo único
// que distingue un test de un acompañamiento del código.

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  FUENTE_DE_CARPETA, archivosDeLaCarpeta, estadoDeCarpeta, fechaDeArchivo, patronDeDescendencia,
  puedeListar, tamano,
} from './carpetaDeEntidad.ts'

const CARPETA = {
  drive_file_id: 'CARP1',
  path: 'administracion/PRESUPUESTOS - CLIENTES/MESSINA',
  is_folder: true,
  trashed: false,
  ausente_en_drive: false,
  web_view_link: 'https://drive.google.com/drive/folders/CARP1',
}

// ── Defecto 1: LA CARPETA EN LA PAPELERA SE LEE VACÍA Y SIN ERROR ───────────────────────────
// Es la trampa que ya se pagó en este repo. Si `estadoDeCarpeta` devolviera 'ok' para una carpeta
// en la papelera, la ficha pediría los archivos, el índice devolvería cero y la pantalla diría
// «sin archivos» sobre una obra con treinta papeles adentro.
test('una carpeta en la papelera no habilita a listar, y lo dice', () => {
  const c = estadoDeCarpeta('obra', 'CARP1', { ...CARPETA, trashed: true })
  assert.equal(c.estado, 'en_papelera')
  assert.equal(puedeListar(c), false)
})

test('una carpeta marcada ausente tampoco habilita a listar', () => {
  const c = estadoDeCarpeta('obra', 'CARP1', { ...CARPETA, ausente_en_drive: true })
  assert.equal(c.estado, 'ausente')
  assert.equal(puedeListar(c), false)
})

// ── Defecto 2: «NO SÉ CUÁL ES LA CARPETA» CONFUNDIDO CON «NO HAY ARCHIVOS» ───────────────────
// Los 41 proveedores no tienen carpeta en Drive y seis obras de Messina tampoco. Los tres estados
// tienen que ser distinguibles: si los tres colapsaran en uno, nadie sabría a cuál le falta una
// decisión del dueño y a cuál le falta subir un papel.
test('los tres modos de no tener archivos son tres estados distintos', () => {
  const sinDeclarar = estadoDeCarpeta('proveedor', null, null)
  const declaradaNoIndexada = estadoDeCarpeta('obra', 'CARP9', null)
  const viva = estadoDeCarpeta('obra', 'CARP1', CARPETA)
  assert.equal(sinDeclarar.estado, 'sin_declarar')
  assert.equal(declaradaNoIndexada.estado, 'no_indexada')
  assert.equal(viva.estado, 'ok')
  assert.equal(new Set([sinDeclarar.estado, declaradaNoIndexada.estado, viva.estado]).size, 3)
})

test('un id de carpeta en blanco es sin declarar, no una carpeta que no se encuentra', () => {
  assert.equal(estadoDeCarpeta('cliente', '   ', null).estado, 'sin_declarar')
})

test('la fuente de la carpeta se declara, y para proveedores es explícitamente ninguna', () => {
  assert.equal(estadoDeCarpeta('obra', 'CARP1', CARPETA).fuente, 'obra_canonica.drive_carpeta_id')
  assert.equal(estadoDeCarpeta('persona', 'X', null).fuente, 'persona_legajo.drive_folder_id')
  assert.equal(FUENTE_DE_CARPETA.proveedor, null)
  assert.equal(estadoDeCarpeta('proveedor', null, null).fuente, null)
})

// La ficha de obra lee `obra_canonica`; `obras` es otra tabla con una columna del mismo nombre.
// Clavar cuál es evita que alguien "arregle" la lectura apuntándola a la que tiene 10 filas.
test('la obra resuelve contra obra_canonica y no contra obras', () => {
  assert.deepEqual(FUENTE_DE_CARPETA.obra, { tabla: 'obra_canonica', columna: 'drive_carpeta_id' })
})

// ── Defecto 2 bis: EL ERROR DE LECTURA DISFRAZADO DE «NO TIENE CARPETA» ─────────────────────
// Apareció probando esta misma capa: la ficha del cliente resuelve por slug y el uuid sale de otra
// columna. Con el id equivocado PostgREST contesta 22P02 y, si el error se tragara, la pantalla
// diría «carpeta desconocida» sobre un cliente que tiene su carpeta cargada — y alguien iría a
// cargarla de nuevo.
test('no haber podido leer la entidad no es no tener carpeta', () => {
  const c = estadoDeCarpeta('cliente', null, null, true)
  assert.equal(c.estado, 'no_se_pudo_leer')
  assert.notEqual(c.estado, 'sin_declarar')
  assert.equal(puedeListar(c), false)
})

// ── Defecto 3: EL COMODÍN DE LIKE TRAE ARCHIVOS DE OTRA ENTIDAD ──────────────────────────────
// `_` en LIKE es «una letra cualquiera». Sin escapar, la carpeta `SF_PISOS` traería lo que cuelga
// de `SFXPISOS` — un papel de otra obra en la ficha equivocada, sin error y sin que nadie lo note.
test('el patrón de descendencia escapa los comodines de LIKE', () => {
  assert.equal(patronDeDescendencia('a/SF_PISOS'), 'a/SF\\_PISOS/%')
  assert.equal(patronDeDescendencia('a/100%'), 'a/100\\%/%')
  assert.equal(patronDeDescendencia('a\\b'), 'a\\\\b/%')
  assert.equal(patronDeDescendencia('administracion/MESSINA'), 'administracion/MESSINA/%')
})

// ── Defecto 4: EL TAMAÑO QUE LLEGA COMO TEXTO ────────────────────────────────────────────────
// `size_bytes` es bigint y PostgREST lo devuelve como string. Comparado o formateado como número
// da resultados absurdos sin fallar.
test('el tamaño llega como texto desde PostgREST y se convierte una sola vez', () => {
  const [a] = archivosDeLaCarpeta(
    [{ drive_file_id: 'F1', name: 'x.pdf', path: 'C/x.pdf', mime_type: null, size_bytes: '1572864', modified_time: null, web_view_link: null, trashed: null, ausente_en_drive: null }],
    'C',
  )
  assert.equal(a.size_bytes, 1572864)
  assert.equal(tamano(a.size_bytes), '1.5 MB')
})

test('sin tamaño se escribe una raya, no un cero: los nativos de Google no tienen bytes', () => {
  assert.equal(tamano(null), '—')
  assert.equal(tamano(0), '0 B')
})

// ── El listado ───────────────────────────────────────────────────────────────────────────────
const filas = [
  { drive_file_id: 'F1', name: 'viejo.pdf', path: 'C/ADICIONAL/viejo.pdf', mime_type: 'application/pdf', size_bytes: 10, modified_time: '2026-01-02T00:00:00Z', web_view_link: null, trashed: false, ausente_en_drive: false },
  { drive_file_id: 'F2', name: 'nuevo.pdf', path: 'C/nuevo.pdf', mime_type: 'application/pdf', size_bytes: 20, modified_time: '2026-09-02T00:00:00Z', web_view_link: null, trashed: false, ausente_en_drive: false },
  { drive_file_id: 'F3', name: 'sin fecha.pdf', path: 'C/sin fecha.pdf', mime_type: null, size_bytes: null, modified_time: null, web_view_link: null, trashed: true, ausente_en_drive: false },
]

test('lo último tocado va primero y lo que no tiene fecha va al final, no adelante', () => {
  const r = archivosDeLaCarpeta(filas, 'C')
  assert.deepEqual(r.map((a) => a.drive_file_id), ['F2', 'F1', 'F3'])
})

test('la subcarpeta sale de la ruta, y la raíz queda vacía', () => {
  const r = archivosDeLaCarpeta(filas, 'C')
  assert.equal(r.find((a) => a.drive_file_id === 'F1')?.subcarpeta, 'ADICIONAL')
  assert.equal(r.find((a) => a.drive_file_id === 'F2')?.subcarpeta, '')
})

// Un archivo en la papelera que desaparece de la lista es el mismo hueco que el H1 le sacó al
// indexador: quien busca el papel lo sigue buscando sin saber que está a un clic de restaurarse.
test('el archivo en la papelera se lista marcado, no se esconde', () => {
  const r = archivosDeLaCarpeta(filas, 'C')
  const f3 = r.find((a) => a.drive_file_id === 'F3')
  assert.ok(f3, 'el archivo en papelera tiene que seguir en la lista')
  assert.equal(f3.trashed, true)
})

// ── Defecto 5: LA FECHA FORMATEADA EN EL HUSO DE QUIEN MIRA ──────────────────────────────────
// Sin huso fijo, el servidor y el navegador formatean distinto: React rompe la hidratación (pasó,
// y el navegador lo escribió en la consola) y, peor, un archivo de las 22 h se lee con la fecha del
// día siguiente. Este test corre con el TZ de la máquina, sea cual sea: si alguien saca el
// `timeZone`, en una máquina en UTC este caso da 10/09 y se pone rojo.
test('la fecha se lee en el huso de la empresa, no en el de la máquina', () => {
  assert.equal(fechaDeArchivo('2026-09-10T02:00:00Z'), '09/09/2026')
  assert.equal(fechaDeArchivo(null), '—')
  assert.equal(fechaDeArchivo('no es una fecha'), '—')
})
