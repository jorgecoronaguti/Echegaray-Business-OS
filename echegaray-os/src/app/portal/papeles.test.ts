import test from 'node:test'
import assert from 'node:assert/strict'
import {
  categoriaDe, veredicto, esCarpetaDelCliente, rutaEnBucket,
  papelesVisibles, vistaDeObra, type Papel,
} from './papeles.ts'

// LOS DEFECTOS QUE ESTE ARCHIVO ATRAPA. Los nombres NO son inventados: salen de las carpetas reales
// de Drive de Quattropani, Messina y San Francisco, leídas el 26/08/2026.

const papel = (p: Partial<Papel> & { id: string }): Papel => ({
  obraId: 'quattropani', titulo: p.id, categoria: 'otro', disciplina: null, revision: null,
  hojas: null, fecha: null, bytes: null, visiblePortal: true, ...p,
})

// ── EL PORTERO ────────────────────────────────────────────────────────────────────────────────
// Los tres se pusieron rojos revirtiendo una línea de `papelesVisibles`.

test('sin puede_ver_obra NO sale ni un documento', () => {
  const todos = [papel({ id: 'a' }), papel({ id: 'b', obraId: null })]
  assert.deepEqual(papelesVisibles(todos, { puedeVerObra: false, obras: null }), [])
  // Y no es que «no haya»: con el permiso puesto salen los dos.
  assert.equal(papelesVisibles(todos, { puedeVerObra: true, obras: null }).length, 2)
})

test('un documento de una obra fuera del alcance no aparece', () => {
  const todos = [papel({ id: 'mia', obraId: 'quattropani' }), papel({ id: 'ajena', obraId: 'pisos-industriales' })]
  const vistos = papelesVisibles(todos, { puedeVerObra: true, obras: ['quattropani'] })
  assert.deepEqual(vistos.map((p) => p.id), ['mia'])

  // obras = [] es NINGUNA, no «todas». Aplanar el vacío es lo que abre el acceso por accidente.
  assert.deepEqual(papelesVisibles(todos, { puedeVerObra: true, obras: [] }), [])

  // Un papel SIN obra sólo lo alcanza quien alcanza todas: con acceso acotado falla cerrado.
  const suelto = [papel({ id: 'suelto', obraId: null })]
  assert.deepEqual(papelesVisibles(suelto, { puedeVerObra: true, obras: ['quattropani'] }), [])
  assert.equal(papelesVisibles(suelto, { puedeVerObra: true, obras: null }).length, 1)
})

test('visible_portal = false no se muestra, aunque el acceso alcance todo', () => {
  const todos = [papel({ id: 'visible' }), papel({ id: 'escondido', visiblePortal: false })]
  const vistos = papelesVisibles(todos, { puedeVerObra: true, obras: null })
  assert.deepEqual(vistos.map((p) => p.id), ['visible'])
})

// ── QUÉ SALE DE DRIVE Y QUÉ NO ────────────────────────────────────────────────────────────────

test('el material interno de la empresa NUNCA sale de Drive', () => {
  // Todos existen hoy en la carpeta de la obra, al lado del contrato firmado.
  for (const nombre of [
    'Gastos - Franco Quattropani (1).pdf',
    'Gastos -  Entrepiso y Escalera JS (1).pdf',
    'COMPUTO.xlsx',
    'CORREOS Y CONTRASEÑAS PARA AUTOGESTIÓN DE ARCOR.docx',
  ]) {
    assert.equal(veredicto({ nombre, mimeType: 'application/pdf' }).destino, 'saltar', nombre)
  }
  // Y tampoco sale un PDF inocente que cuelga de una carpeta interna.
  const v = veredicto({ nombre: 'Cotizacion.pdf', mimeType: 'application/pdf', carpeta: 'COTIZACION INTERNA' })
  assert.equal(v.destino, 'saltar', 'un PDF dentro de COTIZACION INTERNA no se publica')
})

test('sólo se espeja lo que el cliente puede abrir', () => {
  assert.equal(veredicto({ nombre: 'Plano de Arquitectura.pdf', mimeType: 'application/pdf' }).destino, 'publicar')
  assert.equal(veredicto({ nombre: 'foto obra.jpg', mimeType: 'image/jpeg' }).categoria, 'otro')
  // El archivo de trabajo del estudio y su respaldo automático no son papeles.
  assert.equal(veredicto({ nombre: 'Galpon_2.dwg', mimeType: 'application/acad' }).destino, 'saltar')
  assert.equal(veredicto({ nombre: 'planos.bak', mimeType: 'application/octet-stream' }).destino, 'saltar')
  assert.equal(veredicto({ nombre: 'PRESUPUESTO V.2.xlsm', mimeType: 'application/vnd.ms-excel.sheet.macroEnabled.12' }).destino, 'saltar')
  // Un documento nativo de Google no se baja con alt=media: bajar una exportación silenciosa
  // publicaría una versión que nadie revisó.
  assert.equal(veredicto({ nombre: 'CONTRATO DE OBRA Y MEMORIA DESCRIPTIVA', mimeType: 'application/vnd.google-apps.document' }).destino, 'saltar')
  assert.equal(veredicto({ nombre: 'PLANOS FINALES', mimeType: 'application/vnd.google-apps.folder' }).destino, 'saltar')
})

test('lo que no se reconoce se espeja OCULTO, no publicado', () => {
  // Falla cerrado: administración lo publica desde la ficha. El camino inverso —descubrir que el
  // cliente ya vio algo que no debía— no existe.
  const v = veredicto({ nombre: '02.AO.pdf', mimeType: 'application/pdf' })
  assert.equal(v.destino, 'oculto')
  assert.equal(v.categoria, 'otro')
})

test('la categoría sale del nombre real, incluido el que le pone ARCA', () => {
  assert.equal(categoriaDe('30716304643_001_00001_00000220.pdf'), 'factura')
  assert.equal(categoriaDe('Recibo 17. r.pdf'), 'recibo')
  assert.equal(categoriaDe('CONTRATO DE OBRA - ECSAS + Franco Quattropani.pdf'), 'contrato')
  assert.equal(categoriaDe('Copia de Cotizacion Final.pdf'), 'cotizacion')
  assert.equal(categoriaDe('PRESUPUESTO PISOS INDUSTRIALES - JS.pdf'), 'cotizacion')
  assert.equal(categoriaDe('Plano estructuras E2 PLANTAS.pdf'), 'plano')
  assert.equal(categoriaDe('Estructura San Francisco del Monte Entrepiso.pdf'), 'plano')
  // Sin nombre útil, decide la carpeta — y sólo entonces.
  assert.equal(categoriaDe('escaneo 3.pdf', 'CERTIFICADOS'), 'certificado')
  assert.equal(categoriaDe('escaneo 3.pdf'), 'otro')
})

test('el espejo baja un nivel y sólo a las carpetas del cliente', () => {
  assert.equal(esCarpetaDelCliente('CERTIFICADOS'), true)
  assert.equal(esCarpetaDelCliente('PLANOS FINALES'), true)
  assert.equal(esCarpetaDelCliente('Facturas '), true)
  assert.equal(esCarpetaDelCliente('Contrato de Obra'), true)
  // Las tres que ya existen al lado y que mezclarían obras o publicarían material interno.
  assert.equal(esCarpetaDelCliente('COTIZACION INTERNA'), false)
  assert.equal(esCarpetaDelCliente('Archivos viejos'), false)
  assert.equal(esCarpetaDelCliente('Presupuestos de Materiales'), false)
  assert.equal(esCarpetaDelCliente('Diagramacion de Obra'), false)
})

test('la ruta del bucket separa por cliente y por obra, y no se repite', () => {
  assert.equal(
    rutaEnBucket('c1c62549', 'pisos-industriales', '1abcDEF', 'Plano de Arquitectura.pdf'),
    'c1c62549/pisos-industriales/1abcDEF.pdf',
  )
  // Sin obra el papel es del cliente. `null` no se dibuja como una carpeta llamada «null».
  assert.equal(rutaEnBucket('c1', null, '1x', 'a.PDF'), 'c1/_cliente/1x.pdf')
})

// ── LA PILA DE UNA OBRA ───────────────────────────────────────────────────────────────────────

test('los recibos entran a la pila de certificados y las facturas van aparte', () => {
  const v = vistaDeObra([
    papel({ id: 'r1', categoria: 'recibo' }), papel({ id: 'c1', categoria: 'certificado' }),
    papel({ id: 'f1', categoria: 'factura' }),
  ])
  assert.equal(v.certificados.length, 2)
  assert.equal(v.facturas.length, 1)
})

test('entre dos cotizaciones gana la revisión más alta y el total de hojas se calla si falta una', () => {
  const v = vistaDeObra([
    papel({ id: 'v2', categoria: 'cotizacion', revision: 'rev 2' }),
    papel({ id: 'v5', categoria: 'cotizacion', revision: 'rev 5' }),
    papel({ id: 'p1', categoria: 'plano', disciplina: 'arquitectura', hojas: 6 }),
    papel({ id: 'p2', categoria: 'plano', disciplina: 'estructura' }),
  ])
  assert.equal(v.cotizacion?.id, 'v5')
  assert.equal(v.hojasTotales, null)
  assert.deepEqual(v.planos.map((p) => p.disciplina), ['arquitectura', 'estructura'])
})
