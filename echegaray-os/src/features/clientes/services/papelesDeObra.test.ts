import test from 'node:test'
import assert from 'node:assert/strict'
import { categoriaDePapel, papelesPorObra, peso, versionDe, type PapelDeObra } from './papelesDeObra.ts'

// LOS NOMBRES SON LOS REALES DEL DRIVE DE ECHEGARAY (11/09/2026).
const R = 'administracion/PRESUPUESTOS - CLIENTES'
const papel = (nombre: string, ruta: string, extra: Partial<PapelDeObra> = {}): PapelDeObra => ({
  drive_file_id: extra.drive_file_id ?? nombre, obra_id: extra.obra_id ?? 'o1', nombre,
  ruta: `${R}/${ruta}/${nombre}`, mime_type: null, size_bytes: null,
  modified_time: extra.modified_time ?? null, web_view_link: null, via: null,
})

test('una OC se reconoce por su numeración, no por la palabra', () => {
  // El cliente los manda así: el nombre no dice «orden de compra» en ningún lado.
  assert.equal(categoriaDePapel({ nombre: 'OC_32_0000200002256.pdf', ruta: '' }).categoria, 'oc')
  assert.equal(categoriaDePapel({ nombre: 'O_P_0000000004807_G00002174.pdf', ruta: '' }).categoria, 'oc')
})

test('la carpeta «PRESUPUESTO - OC» no convierte sus OC en cotizaciones', () => {
  // EL DEFECTO QUE ATRAPA: una regla de cotización sobre la RUTA se lleva puesta toda la carpeta.
  const oc = categoriaDePapel({
    nombre: 'ADICIONAL - OC_32_0000200001923.pdf',
    ruta: `${R}/MESSINA/BASES DE TANQUE /PRESUPUESTO - OC/ADICIONAL - OC_32_0000200001923.pdf`,
  })
  assert.equal(oc.categoria, 'oc')
  assert.match(oc.porque ?? '', /nombre/)
})

test('cada clasificación dice el texto que la sostiene, y «otro» no inventa ninguno', () => {
  const c = categoriaDePapel({ nombre: 'PLATEA DE HORMIGON - AGOSTO 2026.pdf', ruta: `${R}/MESSINA/x/Cotizaciones/y.pdf` })
  assert.equal(c.categoria, 'cotizacion')
  assert.equal(c.porque, 'ruta: «/Cotizaciones»')
  const otro = categoriaDePapel({ nombre: 'Nota Rodrigo 10-09-2026.jpg', ruta: `${R}/MESSINA/Nota.jpg` })
  assert.equal(otro.categoria, 'acta')
  const sinMarca = categoriaDePapel({ nombre: '0000000005146.pdf', ruta: `${R}/MESSINA/0000000005146.pdf` })
  assert.equal(sinMarca.categoria, 'otro')
  assert.equal(sinMarca.porque, null, '«otro» inventó un motivo que no tiene')
})

test('las seis categorías con marca, sobre archivos que existen', () => {
  const casos: [string, string][] = [
    ['CONTRATO DE OBRA Y MEMORIA DESCRIPTIVA.docx', 'contrato'],
    ['PS ECHEGARAY_QUATTROPANI_APROBADO.pdf', 'otro'],
    ['PROGRAMA DE SEGURIDAD.pdf', 'hys'],
    ['PLANOS - ARSJ Legajo de Planos - Ampliacion Piso Baño Maria.pdf', 'plano'],
    ['ARQUITECTURA GALPONES SAN FRANCISCO DEL MONTE.dwg', 'plano'],
    ['Cotizacion - Playon para dilución de ácido.pdf', 'cotizacion'],
    ['ADICIONAL MURO.pdf', 'cotizacion'],
    ['Certificado 3.pdf', 'certificacion'],
  ]
  for (const [nombre, esperada] of casos) {
    assert.equal(categoriaDePapel({ nombre, ruta: nombre }).categoria, esperada, nombre)
  }
})

test('la versión sale del nombre cuando el nombre la dice, y si no, no se inventa', () => {
  assert.equal(versionDe('PRESUPUESTO V.2.xlsm'), 2)
  assert.equal(versionDe('ETAPA 2.1.pdf'), 2.1)
  assert.equal(versionDe('Cotizacion APROBADA.pdf'), null)
})

test('las cotizaciones van de la más nueva a la más vieja y la ACEPTADA va primera', () => {
  const papeles = [
    papel('PRESUPUESTO V.2.xlsm', 'MESSINA/x', { drive_file_id: 'v2', modified_time: '2026-02-01' }),
    papel('Cotizacion APROBADA.pdf', 'MESSINA/x', { drive_file_id: 'ok', modified_time: '2026-01-01' }),
    papel('PRESUPUESTO V.3.pdf', 'MESSINA/x', { drive_file_id: 'v3', modified_time: '2026-03-01' }),
  ]
  const r = papelesPorObra(papeles, { obrasConCarpeta: new Set(['o1']), aceptadas: new Set(['ok']) })
  const cotiz = r.get('o1')!.grupos.find((g) => g.clave === 'cotizacion')!
  assert.deepEqual(cotiz.papeles.map((p) => p.drive_file_id), ['ok', 'v3', 'v2'])
  assert.equal(cotiz.papeles[0].aceptada, true)
})

test('«sin papeles» y «sin carpeta vinculada» son dos hechos distintos', () => {
  // El primero es una obra sin documentar; el segundo, trabajo del OS que falta hacer. Dibujados
  // igual —una lista vacía— el dueño no puede saber cuál de los dos está mirando.
  const r = papelesPorObra([], { obrasConCarpeta: new Set(['con']), aceptadas: new Set() })
  assert.equal(r.get('con')!.tieneCarpeta, true)
  assert.equal(r.get('con')!.total, 0)
  assert.equal(r.get('sin'), undefined)
  const conPapeles = papelesPorObra([papel('x.pdf', 'MESSINA/x', { obra_id: 'sin' })],
    { obrasConCarpeta: new Set(), aceptadas: new Set() })
  assert.equal(conPapeles.get('sin')!.tieneCarpeta, false, 'un papel atado no inventa una carpeta vinculada')
  assert.equal(conPapeles.get('sin')!.total, 1)
})

test('el peso se dice cuando Drive lo publica, y «—» cuando no (los nativos de Google no lo tienen)', () => {
  assert.equal(peso(318 * 1024), '318 kB')
  assert.equal(peso(1_468_006), '1,4 MB')
  assert.equal(peso(null), '—')
  assert.equal(peso(0), '—')
})
