// Cada test de acá corresponde a un defecto que ESTA corrida produjo sobre los planos reales de
// Quattropani. No hay ninguno escrito «por cobertura»: si se revierte el arreglo, se pone rojo.

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { partirDocumentos, planosDe, revelaElResultado } from './documentos.mjs'
import { repeticionDe, validarElemento, validarLamina, extraerJson, MODO } from './interpretar.mjs'
import { cantidadDeElementos, computarElemento } from './computo.mjs'
import { unidadCompatible, puntaje, mapearPartida, espesorSinRespaldo, declaraDimension } from './partidas.mjs'
import { fusionar, sinResolver } from './conteo.mjs'
import { comparar, CAUSA } from './comparar.mjs'
import { agruparPartidas, valorizar } from './cotizacion-v0.mjs'
import { dato, faltaDato, FUENTE, evidencia } from './fuente.mjs'

const RAIZ = 'administracion/PRESUPUESTOS - CLIENTES/FRANCO QUATTROPANI'

// ── LA VALIDACIÓN CIEGA ──────────────────────────────────────────────────────────────────────

test('la carpeta que CONTIENE al proyecto no reserva el proyecto entero', () => {
  // Primera corrida real: 33 documentos, 0 insumos. La ruta absoluta incluye
  // «PRESUPUESTOS - CLIENTES», así que el filtro leía todo como resultado — planos incluidos.
  const filas = [
    { is_folder: true, path: RAIZ, name: 'FRANCO QUATTROPANI', drive_file_id: 'd0' },
    { is_folder: false, path: `${RAIZ}/PLANOS FINALES/Plano de Estructura.pdf`, name: 'Plano de Estructura.pdf', mime_type: 'application/pdf', drive_file_id: 'p1' },
    { is_folder: false, path: `${RAIZ}/Cotizacion APROBADA.pdf`, name: 'Cotizacion APROBADA.pdf', mime_type: 'application/pdf', drive_file_id: 'c1' },
  ]
  const { insumos, reservados } = partirDocumentos(filas, { carpetaObra: RAIZ })
  assert.deepEqual(insumos.map((d) => d.name), ['Plano de Estructura.pdf'])
  assert.deepEqual(reservados.map((d) => d.name), ['Cotizacion APROBADA.pdf'])
})

test('lo que revela el resultado se reserva por nombre y por carpeta del proyecto', () => {
  assert.equal(revelaElResultado({ name: 'COMPUTO.xlsx', path: `${RAIZ}/COMPUTO.xlsx` }, { carpetaObra: RAIZ }).revela, true)
  assert.equal(revelaElResultado({ name: 'LISTADO DE TAREAS A EJECUTAR.pdf', path: `${RAIZ}/COTIZACION INTERNA/x.pdf` }, { carpetaObra: RAIZ }).revela, true)
  assert.equal(revelaElResultado({ name: 'ECHEGARAY C 2.pdf', path: `${RAIZ}/Presupuestos de Materiales/Cotizaciones Alumetal/ECHEGARAY C 2.pdf` }, { carpetaObra: RAIZ }).revela, true)
  assert.equal(revelaElResultado({ name: 'Plano de Arquitectura.pdf', path: `${RAIZ}/PLANOS FINALES/Plano de Arquitectura.pdf` }, { carpetaObra: RAIZ }).revela, false)
})

test('un DWG es un plano y NO es legible: se cuenta y se declara, no desaparece', () => {
  const { insumos } = partirDocumentos([
    { is_folder: false, path: `${RAIZ}/PLANOS FINALES/01-ESTRUCTURA Galpon.dwg`, name: '01-ESTRUCTURA Galpon.dwg', mime_type: 'image/vnd.dwg', drive_file_id: 'w1' },
    { is_folder: false, path: `${RAIZ}/PLANOS FINALES/Plano de Estructura.pdf`, name: 'Plano de Estructura.pdf', mime_type: 'application/pdf', drive_file_id: 'p1' },
  ], { carpetaObra: RAIZ })
  const p = planosDe(insumos)
  assert.equal(p.legibles.length, 1)
  assert.equal(p.noLegibles.length, 1)
  assert.match(p.noLegibles[0].porQueNoLegible, /CAD/)
})

// ── LA PROCEDENCIA ───────────────────────────────────────────────────────────────────────────

test('declarar EXTRAIDO_PLANO sin evidencia degrada a INFERIDO en vez de creerle', () => {
  const sin = dato({ valor: 0.3, unidad: 'm', fuente: FUENTE.EXTRAIDO_PLANO })
  assert.equal(sin.fuente, FUENTE.INFERIDO)
  assert.match(sin.nota, /evidencia citable/)
  const con = dato({ valor: 0.3, unidad: 'm', fuente: FUENTE.EXTRAIDO_PLANO, evidencia: evidencia({ archivo: 'E-01.pdf', textoLiteral: 'C1(30-50)' }) })
  assert.equal(con.fuente, FUENTE.EXTRAIDO_PLANO)
})

test('una evidencia sin texto literal no es evidencia', () => {
  assert.equal(evidencia({ archivo: 'E-01.pdf', lamina: 'E-01' }), null)
})

// ── EL CONTEO, QUE ES LO QUE TRABABA EL CÓMPUTO ──────────────────────────────────────────────

test('la cantidad por separación la calcula el código, con el +1 de los extremos declarado', () => {
  // 18,30 m de nave con correas cada 1,63 m: 12 tramos + la del extremo = 13.
  const r = cantidadDeElementos({ modo: MODO.SEPARACION, longitudTramo: 18.30, separacion: 1.63, incluyeExtremos: true, cantidad: null })
  assert.equal(r.valor, 13)
  assert.match(r.magnitud.formula, /separación/)
  assert.deepEqual(r.magnitud.entradas, { longitudTramo: 18.30, separacion: 1.63, incluyeExtremos: true })
  const sinExtremos = cantidadDeElementos({ modo: MODO.SEPARACION, longitudTramo: 18.30, separacion: 1.63, incluyeExtremos: false, cantidad: null })
  assert.equal(sinExtremos.valor, 12)
})

test('sin cantidad no se computa UNO: se devuelve el hueco con su motivo', () => {
  const e = {
    id: 'K1', nombre: 'Correa K1', sistema: 'estructura_metalica', forma: 'lineal', computable: true,
    dimensiones: { largo: { valor: 18.3 }, ancho: null, alto: null, espesor: null, area: null },
    repeticion: { modo: MODO.INDETERMINABLE, cantidad: null, longitudTramo: null, separacion: null, incluyeExtremos: true, textoLiteral: null },
  }
  const c = computarElemento(e)
  assert.equal(c.cantidad, null)
  assert.equal(c.hueco.fuente, FUENTE.FALTA_DATO)
  assert.match(c.faltan.join(' '), /cantidad de elementos/)
})

test('una cantidad suelta del contrato viejo se sigue leyendo como conteo directo', () => {
  const r = repeticionDe({ cantidad: 8 }, null)
  assert.equal(r.modo, MODO.CONTEO)
  assert.equal(r.cantidad, 8)
})

test('el volumen total dice de qué unitario y de qué cantidad viene', () => {
  const e = {
    id: 'C1', nombre: 'Columna C1', sistema: 'hormigon_armado', forma: 'prisma', computable: true,
    dimensiones: { ancho: { valor: 0.30 }, alto: { valor: 0.50 }, largo: { valor: 3.50 }, espesor: null, area: null },
    repeticion: { modo: MODO.CONTEO, cantidad: 8, longitudTramo: null, separacion: null, incluyeExtremos: true, textoLiteral: 'ocho C1' },
  }
  const c = computarElemento(e)
  assert.equal(c.cantidad.valor, 4.2)
  assert.equal(c.unitaria.valor, 0.525)
  assert.deepEqual(c.cantidad.entradas, { unitaria: 0.525, cantidadElementos: 8 })
})

// ── LA SEGUNDA PASADA ────────────────────────────────────────────────────────────────────────

test('la segunda pasada LLENA huecos y nunca pisa lo que la primera ya sostuvo', () => {
  const e = {
    id: 'C1', evidencia: { archivo: 'E-01.pdf', textoLiteral: 'C1(30-50)' },
    dimensiones: { ancho: { valor: 0.30 }, alto: null, largo: null, espesor: null, area: null },
    repeticion: { modo: MODO.INDETERMINABLE, cantidad: null, longitudTramo: null, separacion: null, incluyeExtremos: true },
  }
  const { elemento, cambios } = fusionar(e, {
    id: 'C1',
    ancho_m: { valor: 0.99, texto_literal: 'medí 0,99' },
    largo_m: { valor: 3.5, texto_literal: 'C1 H=3.50m' },
    cantidad: { modo: 'conteo_directo', valor: 14, texto_literal: 'conté 14 en planta' },
  })
  assert.equal(elemento.dimensiones.ancho.valor, 0.30, 'el ancho de la primera pasada no se pisa')
  assert.equal(elemento.dimensiones.largo.valor, 3.5, 'el largo que faltaba se llena')
  assert.equal(cantidadDeElementos(elemento.repeticion).valor, 14)
  assert.ok(cambios.some((c) => /se conserva el inventario/.test(c)))
})

test('la segunda pasada sólo se pide sobre lo que quedó sin resolver', () => {
  const listo = {
    id: 'A', computable: true, forma: 'lineal', dimensiones: { largo: { valor: 6 } },
    repeticion: { modo: MODO.CONTEO, cantidad: 3 },
  }
  const falta = { id: 'B', computable: true, forma: 'lineal', dimensiones: { largo: null }, repeticion: { modo: MODO.INDETERMINABLE } }
  assert.deepEqual(sinResolver([listo, falta]).map((x) => x.elemento.id), ['B'])
})

// ── LA PARTIDA ───────────────────────────────────────────────────────────────────────────────

test('una cantidad en m3 no puede ir a una partida en m2', () => {
  assert.equal(unidadCompatible('m3', 'M3'), true)
  assert.equal(unidadCompatible('m', 'ML'), true)
  assert.equal(unidadCompatible('m3', 'M2'), false)
  assert.equal(unidadCompatible('un', 'GL'), false)
})

test('el sistema constructivo castiga el vocabulario del material equivocado', () => {
  const correa = { nombre: 'Correa metálica C140', sistema: 'estructura_metalica', material: 'perfil C140' }
  const hormigon = { id: 'h', nombre: 'VIGA DE CARGA H17 - FE 130 KG/M4' }
  assert.ok(puntaje(correa, hormigon) < 0, 'una viga de hormigón no puede ganarle a un perfil metálico')
})

test('una partida que declara espesor no cubre un elemento que no lo declara', () => {
  // «Platea s/Calculo» → «PLATEA DE HORMIGON - 50CM» metió $ 29,6 M inventados en la V0 real.
  assert.equal(declaraDimension('PLATEA DE HORMIGON - 50CM'), true)
  assert.equal(declaraDimension('EJECUCIÓN DE CONTRAPISO DE HORMIGÓN e = 0,10 m'), true)
  assert.equal(declaraDimension('CERCHA  P/TECHO METALICO'), false)

  const platea = { id: 'PLATEA', nombre: 'Platea de fundación', sistema: 'piso', unidad: 'm2', especificacion: 'Platea s/Cálculo', dimensiones: {} }
  const tarea = { id: 't1', codigo: 'T1166', nombre: 'PLATEA DE HORMIGON - 50CM', unidad: 'M2' }
  assert.equal(espesorSinRespaldo(platea, tarea), true)
  const m = mapearPartida(platea, [tarea])
  assert.equal(m.estado, 'PARTIDA_CANDIDATA')
  assert.match(m.porQue, /espesor/)

  // El mismo elemento CON su espesor leído del plano sí puede tomarla.
  const conEspesor = { ...platea, dimensiones: { espesor: { valor: 0.5 } } }
  assert.equal(espesorSinRespaldo(conEspesor, tarea), false)
})

test('sin candidata la partida no se fuerza: sale PARTIDA_CANDIDATA con el motivo', () => {
  const correa = { id: 'K1', nombre: 'Correa metálica K1', sistema: 'estructura_metalica', unidad: 'm', dimensiones: {} }
  const m = mapearPartida(correa, [{ id: 'x', codigo: 'T1017', nombre: 'CAPA AISLADORA HORIZONTAL EN MUROS', unidad: 'ML' }])
  assert.equal(m.estado, 'PARTIDA_CANDIDATA')
  assert.equal(m.tarea, null)
})

// ── LA COTIZACIÓN ────────────────────────────────────────────────────────────────────────────

test('dos elementos de la misma tarea son UNA partida con DOS líneas de cómputo', () => {
  const linea = (id, valor) => ({
    estado: 'MAPEADA', elemento: id, porQue: 'ok',
    tarea: { id: 't1', codigo: 'T1010', nombre: 'COLUMNA DE CARGA', unidad: 'M3' },
    computo: {
      id, nombre: id, sistema: 'hormigon_armado', unidad: 'm3', archivo: 'E-01.pdf', lamina: 'E-01',
      cantidad: { valor, formula: 'ancho × alto × largo × cantidad', entradas: {} },
      evidencia: { archivoId: 'e1', textoLiteral: `${id}(30-50)`, vista: 'ESTRUCTURA' },
    },
  })
  const { partidas } = agruparPartidas([linea('C1', 3), linea('C2', 1.5)])
  assert.equal(partidas.length, 1)
  assert.equal(partidas[0].cantidad, 4.5)
  assert.deepEqual(partidas[0].lineas.map((l) => l.elemento), ['C1', 'C2'])
})

test('un solo recurso sin precio deja la partida SIN costo, no con el costo de los demás', () => {
  const v = valorizar({ cantidad: 10 }, [
    { nombre: 'CEMENTO', tipo: 'material', cantidad: 2, costoUnitario: 100, desperdicio: 0 },
    { nombre: 'ARENA', tipo: 'material', cantidad: 1, costoUnitario: null, desperdicio: 0 },
  ])
  assert.equal(v.subtotal, null)
  assert.deepEqual(v.sinPrecio, ['ARENA'])
})

// ── LA COMPARACIÓN ───────────────────────────────────────────────────────────────────────────

test('M3 y m3 son la misma unidad: la diferencia es de medición, no de Base Maestra', () => {
  const c = comparar({
    v0: [{ codigo: 'T1010', descripcion: 'COLUMNA', unidad: 'M3', cantidad: 3.29, subtotal: 2546116 }],
    historico: [{ codigo: 'T1010', descripcion: 'COLUMNA', unidad: 'm3', cantidad: 4.8, subtotal: 3714698 }],
  })
  assert.equal(c.diferencias.length, 1)
  assert.equal(c.diferencias[0].causa.clave, CAUSA.COMPUTO.clave)
})

test('lo que XSAS computó y el histórico no cotizó es ALCANCE, no error de lectura', () => {
  const c = comparar({
    v0: [{ codigo: 'T1075', descripcion: 'TECHO', unidad: 'M2', cantidad: 200, subtotal: 100 }],
    historico: [],
  })
  assert.equal(c.diferencias[0].causa.clave, CAUSA.ALCANCE.clave)
})

// ── LA LECTURA DEL MODELO ────────────────────────────────────────────────────────────────────

test('un elemento sin forma reconocible queda detectado y declarado NO computable', () => {
  const e = validarElemento({ id: 'X', nombre: 'algo', forma: 'lo-que-sea', sistema: 'inventado', evidencia: { texto_literal: 'X' } }, { archivo: 'a.pdf', lamina: 'A' })
  assert.equal(e.computable, false)
  assert.equal(e.sistema, 'otro')
  assert.match(e.porQueNoComputable, /cómo se mide/)
})

test('la lámina cuenta lo que descartó en vez de perderlo en silencio', () => {
  const l = validarLamina({ elementos: [{ nombre: 'ok', forma: 'conteo', evidencia: { texto_literal: 'x' } }, { sin: 'id' }] }, { archivo: 'a.pdf' })
  assert.equal(l.elementos.length, 1)
  assert.equal(l.descartados, 1)
})

test('el JSON se saca de la respuesta aunque venga envuelto en markdown', () => {
  assert.deepEqual(extraerJson('```json\n{"a":1}\n```'), { a: 1 })
  assert.equal(extraerJson('no hay json acá'), null)
})

test('un hueco declarado no es cero y dice quién lo tiene', () => {
  const f = faltaDato({ que: 'espesor de la platea', porque: 'el plano dice «s/Cálculo»' })
  assert.equal(f.valor, null)
  assert.equal(f.fuente, FUENTE.FALTA_DATO)
  assert.match(f.quienLoTiene, /proyecto|dirección/)
})
