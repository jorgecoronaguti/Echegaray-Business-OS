import test from 'node:test'
import assert from 'node:assert/strict'
import { armarCaraDocumentos } from './caraDocumentos.ts'
import { papelesPorObra, type PapelDeObra } from './papelesDeObra.ts'
import type { PapelesDelCliente } from './papelesCliente.ts'

const R = 'administracion/PRESUPUESTOS - CLIENTES/MESSINA'
const drive = (id: string, nombre: string, obra = 'madre'): PapelDeObra => ({
  drive_file_id: id, obra_id: obra, nombre, ruta: `${R}/x/${nombre}`, mime_type: null,
  size_bytes: 1024, modified_time: '2026-09-01', web_view_link: `https://drive/${id}`, via: 'carpeta',
})
const orden = (clave: string, numero: string, driveFileId: string | null, obraId: string | null) => ({
  clave, clase: 'oc' as const, numeroCorto: numero, numeroCanonico: numero, fecha: '2026-09-02',
  importe: 100, moneda: 'ARS', obraId, archivoId: `a-${clave}`, driveFileId, copias: 1,
  ids: [`a-${clave}`], facturas: [], retenciones: [], pagadaPor: [], cita: null,
})
const papelesCliente = (o: Partial<PapelesDelCliente>): PapelesDelCliente => ({
  oc: [], op: [], facturas: [], retenciones: [], otros: [], porObra: new Map(),
  sinObra: { oc: [], op: [] }, totalOC: { n: 0, importe: null, parcial: false },
  totalOP: { n: 0, importe: null, parcial: false }, ...o,
} as PapelesDelCliente)

const FILAS = [
  { obra_id: 'madre', nombre: 'ME - PLAYÓN DE AZUFRE', nivel: 0 as const, esAdicional: false, huerfano: false },
  { obra_id: 'hija', nombre: 'ME - ADICIONAL TERCER MURO', nivel: 1 as const, esAdicional: true, huerfano: false },
]
const armar = (extra: Partial<Parameters<typeof armarCaraDocumentos>[0]> = {}) => armarCaraDocumentos({
  filas: FILAS,
  papelesObra: papelesPorObra([], { obrasConCarpeta: new Set(['madre']), aceptadas: new Set() }),
  papelesCliente: null, documentos: [], archivosDelCliente: [], carpetas: new Map(), ...extra,
})

test('EL MISMO PDF NO SE DIBUJA DOS VECES: gana el papel del OS, que trae el número', () => {
  // Es el caso real: la OC 2256 está atada en `cliente_orden` Y la ve `obra_papel_drive` adentro de
  // la carpeta. Dibujada por los dos caminos, el cliente muestra dos filas del mismo archivo y el
  // contador de la solapa dice uno más de los que hay.
  const cara = armar({
    papelesObra: papelesPorObra([drive('pdf-2256', 'OC_32_0000200002256.pdf', 'hija')],
      { obrasConCarpeta: new Set(['hija']), aceptadas: new Set() }),
    papelesCliente: papelesCliente({
      porObra: new Map([['hija', {
        oc: [orden('c1', '2256', 'pdf-2256', 'hija')], op: [],
        totalOC: { n: 1, importe: 100, parcial: false }, totalOP: { n: 0, importe: null, parcial: false },
      }]]),
    }),
  })
  const hija = cara.obras.find((o) => o.obra_id === 'hija')!
  assert.equal(hija.total, 1, 'el mismo PDF salió por los dos caminos')
  assert.equal(hija.grupos[0].archivos[0].fuente, 'os')
  assert.match(hija.grupos[0].archivos[0].nombre, /OC 2256/)
  assert.equal(cara.total, 1)
})

test('ningún archivo aparece dos veces en TODA la cara, ni entre secciones', () => {
  const cara = armar({
    papelesObra: papelesPorObra([drive('d1', 'PRESUPUESTO.pdf'), drive('d2', 'PLANO.dwg')],
      { obrasConCarpeta: new Set(['madre']), aceptadas: new Set(['d1']) }),
    papelesCliente: papelesCliente({ sinObra: { oc: [orden('c9', '9999', 'd1', null)], op: [] } }),
    documentos: [{ drive_file_id: 'd2', rol: null, origen: 'manual', name: 'PLANO.dwg', path: null, mime_type: null, modified_time: null, creado_en: null }],
    archivosDelCliente: [
      { drive_file_id: 'd1', name: 'PRESUPUESTO.pdf', path: `${R}/PRESUPUESTO.pdf`, size_bytes: 1, modified_time: null, web_view_link: null },
      { drive_file_id: 'suelto', name: 'Nota.jpg', path: `${R}/Nota.jpg`, size_bytes: 1, modified_time: null, web_view_link: null },
    ],
  })
  const claves = [
    ...cara.obras.flatMap((o) => o.grupos.flatMap((g) => g.archivos.map((a) => a.clave))),
    ...cara.sinObra.flatMap((g) => g.archivos.map((a) => a.clave)),
    ...cara.vinculados.map((d) => d.drive_file_id),
    ...cara.carpetaDelCliente.map((a) => a.clave),
  ]
  assert.equal(new Set(claves).size, claves.length, `un archivo se dibuja dos veces: ${claves}`)
  // Y el total ES lo que se dibuja: el número de la solapa no puede decir otra cosa que las filas.
  assert.equal(cara.total, claves.length)
  // «Nota.jpg» es lo único de la carpeta del cliente que ninguna obra reclama.
  assert.deepEqual(cara.carpetaDelCliente.map((a) => a.clave), ['suelto'])
})

test('la obra con carpeta y sin archivos se distingue de la que no tiene carpeta', () => {
  const cara = armar()
  const madre = cara.obras.find((o) => o.obra_id === 'madre')!
  const hija = cara.obras.find((o) => o.obra_id === 'hija')!
  assert.equal(madre.tieneCarpeta, true)
  assert.equal(madre.total, 0)
  assert.equal(hija.tieneCarpeta, false, 'una obra sin carpeta se dibujaría como «0 papeles»')
  assert.equal(cara.total, 0)
})

test('el adicional conserva su nivel y su marca dentro de la cara Documentos', () => {
  const cara = armar()
  assert.deepEqual(cara.obras.map((o) => [o.obra_id, o.nivel, o.esAdicional]), [
    ['madre', 0, false], ['hija', 1, true],
  ])
})

test('lo que no llegó a ninguna obra se muestra, no se esconde', () => {
  const cara = armar({
    papelesCliente: papelesCliente({ sinObra: { oc: [orden('c9', '5146', null, null)], op: [] } }),
  })
  assert.equal(cara.nSinObra, 1)
  assert.match(cara.sinObra[0].archivos[0].href, /^\/api\/clientes\/orden\//,
    'un papel sin PDF en Drive tiene que abrirse por el proxy del OS')
})
