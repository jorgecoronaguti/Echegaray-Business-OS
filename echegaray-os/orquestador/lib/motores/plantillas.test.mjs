// EL CATÁLOGO DE PLANTILLAS Y EL RENDER. Puro: plantilla + datos → estructura, sin red y sin modelo.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CATALOGO, indice, plantilla, plantillasDeDominio } from './plantillas-catalogo.mjs'
import { DOMINIOS, huecosDeclarados, validarPlantilla } from './plantillas-contrato.mjs'
import {
  claveIdempotente, destinoDe, faltanRequeridos, nombreDeSalida, renderDocumento, renderPresentacion, sustituir,
} from './plantillas-motor.mjs'

const INFORME = {
  cliente: 'Cliente de prueba', obra: 'Obra de prueba', fecha: '31/08/2026', periodo: 'agosto 2026',
  resumen: 'Dos frentes abiertos y uno cerrado.', ejecutado: ['Frente A terminado', 'Frente B al 60 %'],
}

test('los nueve dominios reales de ECSAS tienen plantilla', () => {
  for (const d of DOMINIOS) assert.ok(plantillasDeDominio(d).length >= 1, `el dominio «${d}» quedó sin plantilla`)
  assert.equal(CATALOGO.length, DOMINIOS.length)
})

test('ninguna plantilla trae un dato de la empresa escrito adentro', () => {
  // Un CUIT, un monto o una carpeta de Drive metidos en una plantilla salen firmados en una oferta
  // sin que nadie los haya decidido. Los huecos son huecos.
  const texto = JSON.stringify(CATALOGO)
  assert.equal(/\b\d{2}-\d{8}-\d\b/.test(texto), false, 'hay un CUIT escrito en el catálogo')
  assert.equal(/\$\s?\d/.test(texto), false, 'hay un monto escrito en el catálogo')
  for (const p of CATALOGO) assert.equal(p.destination_policy.carpeta_id, null, `${p.template_id} trae una carpeta escrita`)
})

test('cada hueco que una plantilla usa está declarado en sus fields', () => {
  for (const p of CATALOGO) {
    const declarados = new Set(p.fields.map((f) => f.clave))
    for (const h of huecosDeclarados(p)) assert.ok(declarados.has(h), `${p.template_id} usa {{${h}}} y no lo declara`)
  }
})

test('una plantilla NATIVA no puede tener source_file_id, y una COPIA no puede no tenerlo', () => {
  const nativaConArchivo = { ...CATALOGO[0], source_file_id: '1AbCdEfGhIjKlMnOpQ' }
  assert.equal(validarPlantilla(nativaConArchivo).ok, false)
  const copiaSinArchivo = { ...CATALOGO[0], origen: 'COPIA_DE_DRIVE' }
  const r = validarPlantilla(copiaSinArchivo)
  assert.equal(r.ok, false)
  assert.match(r.errores.join(' '), /sin source_file_id/)
})

test('sustituir informa los huecos sin dato en vez de dejar {{plazo}} a la vista', () => {
  const r = sustituir('Obra {{obra}}, plazo {{plazo}}', { obra: 'X' })
  assert.equal(r.texto, 'Obra X, plazo ')
  assert.deepEqual(r.faltan, ['plazo'])
})

test('el informe se arma entero desde la plantilla, sin modelo', () => {
  const r = renderDocumento('informe.avance_obra.v1', INFORME)
  assert.equal(r.ok, true)
  assert.equal(r.nombre, 'Informe de avance · Obra de prueba · agosto 2026')
  assert.deepEqual(r.contenido.secciones.map((s) => s.id), ['encabezado', 'resumen', 'ejecutado'])
  assert.deepEqual(r.omitidas.map((o) => o.seccion), ['desvios', 'proximo'])
  const lista = r.contenido.secciones[2].bloques[0]
  assert.deepEqual(lista.items, INFORME.ejecutado)
})

test('una tabla repite una fila por elemento de la lista de datos', () => {
  const r = renderDocumento('presupuesto.obra.v1', {
    cliente: 'C', obra: 'O', fecha: '31/08/2026', total: 'total pactado',
    partidas: [
      { descripcion: 'Hormigón', unidad: 'm3', cantidad: '10', precio_unitario: 'a', total: 'b' },
      { descripcion: 'Acero', unidad: 'kg', cantidad: '200', precio_unitario: 'c', total: 'd' },
    ],
  })
  assert.equal(r.ok, true)
  const tabla = r.contenido.secciones.find((s) => s.id === 'partidas').bloques[0]
  assert.equal(tabla.filas.length, 2)
  assert.deepEqual(tabla.filas[1], ['Acero', 'kg', '200', 'c', 'd'])
})

test('falta un dato obligatorio ⇒ MISSING_REQUIRED_FIELD con el nombre del que falta', () => {
  const { ejecutado, ...sinEjecutado } = INFORME
  const r = renderDocumento('informe.avance_obra.v1', sinEjecutado)
  assert.equal(r.ok, false)
  assert.equal(r.codigo, 'MISSING_REQUIRED_FIELD')
  assert.deepEqual(r.falta, ['ejecutado'])
  assert.deepEqual(faltanRequeridos(plantilla('informe.avance_obra.v1'), sinEjecutado), ['ejecutado'])
})

test('una plantilla que no existe ⇒ TEMPLATE_NOT_FOUND, no un documento vacío', () => {
  const r = renderDocumento('informe.que_no_existe.v9', INFORME)
  assert.equal(r.ok, false)
  assert.equal(r.codigo, 'TEMPLATE_NOT_FOUND')
})

test('la política de destino se hace cumplir: sin carpeta no se crea donde no corresponde', () => {
  const oferta = plantilla('oferta.obra.v1')
  const sin = destinoDe(oferta, {})
  assert.equal(sin.ok, false)
  assert.equal(sin.codigo, 'MISSING_REQUIRED_FIELD')
  assert.deepEqual(sin.falta, ['carpeta_id'])
  assert.equal(destinoDe(oferta, { carpeta_id: 'abc' }).carpeta_id, 'abc')
})

test('la clave de idempotencia es estable entre corridas y cambia con los datos', () => {
  const a = claveIdempotente('informe.avance_obra.v1', INFORME)
  const b = claveIdempotente('informe.avance_obra.v1', { ...INFORME })
  const c = claveIdempotente('informe.avance_obra.v1', { ...INFORME, periodo: 'julio 2026' })
  assert.equal(a, b, 'los mismos datos tienen que dar la misma clave o el reintento duplica')
  assert.notEqual(a, c)
  assert.match(a, /^[0-9a-f]{32}$/)
})

test('la presentación sale de la MISMA plantilla, con el mapeo fijo de sección a lámina', () => {
  const r = renderPresentacion('presentacion.avance_obra.v1', {
    ...INFORME,
    indicadores: [{ rotulo: 'Avance', valor: '62 %' }, { rotulo: 'Certificado', valor: 'al día' }],
  })
  assert.equal(r.ok, true)
  assert.equal(r.contenido.tipo, 'AVANCE_OBRA')
  const tipos = r.contenido.laminas.map((l) => l.tipo)
  assert.deepEqual(tipos, ['puntos', 'tabla', 'puntos'])
  assert.equal(r.contenido.laminas[1].filas.length, 2)
})

test('pedirle una presentación a una plantilla de documento ⇒ UNSUPPORTED_OPERATION', () => {
  const r = renderPresentacion('informe.avance_obra.v1', INFORME)
  assert.equal(r.ok, false)
  assert.equal(r.codigo, 'UNSUPPORTED_OPERATION')
})

test('el índice del catálogo dice lo que hay que saber para elegir', () => {
  const i = indice().find((x) => x.template_id === 'control.planilla_obra.v1')
  assert.equal(i.estado, 'DECLARADA_NO_IMPLEMENTADA')
  assert.equal(i.file_type, 'sheet')
  assert.equal(nombreDeSalida(plantilla('admin.nota.v1'), { asunto: 'Pedido', fecha: '31/08/2026' }).nombre,
    'Nota · Pedido · 31/08/2026')
})
