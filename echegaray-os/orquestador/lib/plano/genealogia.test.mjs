// QUE LA COTIZACIÓN SE VUELVA OBRA SIN PERDER DE DÓNDE SALIÓ CADA NÚMERO.
//
// La prueba que importa es la tercera: una actividad de obra creada desde una cotización tiene que
// poder contestar «¿de dónde salieron estos 2,1 m³?» tres meses después, cuando el real no dé
// contra el plan. Sin eso no hay aprendizaje posible, porque no se sabe si falló la medición, el
// rendimiento o la ejecución.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cadenaDe, actividadDesde, obraDesdeCotizacion, ESLABONES, ESLABONES_DE_OBRA } from './genealogia.mjs'
import { FUENTE } from './fuente.mjs'

const RESULTADO = {
  termino: 'quattropani',
  computo: { items: [] },
  procesos: { procesos: [{ elemento: 'C1', tarea: 'Encofrado' }] },
  composiciones: new Map([['u-1010', [{ codigo: 'MO-1', costoUnitario: 12000 }, { codigo: 'MAT-1', costoUnitario: 90000 }]]]),
  mapeo: {
    mapeos: [
      {
        elemento: 'C1', estado: 'MAPEADA', porQue: 'unidad, vocabulario y 2 atributos coinciden',
        tarea: { id: 'u-1010', codigo: 'T1010', nombre: 'COLUMNA DE CARGA H17', unidad: 'M3' },
        computo: {
          id: 'C1', nombre: 'Columna de carga C1', unidad: 'm3',
          cantidad: { valor: 2.1, fuente: FUENTE.CALCULADO, formula: 'ancho × alto × largo × cantidad', entradas: { ancho: 0.4, alto: 0.2, largo: 3.5, cantidad: 8 } },
          evidencia: { archivo: 'Plano de Estructura.pdf', vista: 'ESTRUCTURA FUNDACION', textoLiteral: 'C1 H=3.50m, sección 0.40x0.20' },
        },
      },
      {
        elemento: 'CORREA', estado: 'PARTIDA_CANDIDATA', tarea: null,
        computo: { id: 'CORREA', nombre: 'Correa C140', unidad: 'm', cantidad: { valor: 300, fuente: FUENTE.CALCULADO }, evidencia: null },
      },
    ],
  },
}

test('LA CADENA TIENE SUS ESLABONES y los que faltan se DECLARAN, no se omiten', () => {
  const c = cadenaDe(RESULTADO, 'C1')
  assert.deepEqual(c.pasos.map((p) => p.etapa), ESLABONES.slice(0, 9))
  assert.equal(c.faltantes.length, 0)
  assert.ok(c.legible.some((l) => /Plano de Estructura.pdf/.test(l)))
  assert.ok(c.legible.some((l) => /2.1 m3/.test(l)), 'la cantidad viaja con su unidad')
})

test('un eslabón cortado se ve como corte, con nombre', () => {
  const c = cadenaDe(RESULTADO, 'CORREA')
  assert.ok(c.faltantes.includes('PARTIDA'))
  assert.ok(c.faltantes.includes('DOCUMENTO'), 'sin evidencia no hay documento que citar')
  assert.equal(c.completa, false)
})

test('LA ACTIVIDAD DE OBRA NACE CON SU ORIGEN COMPLETO — sin eso es una fila nueva, no una continuación', () => {
  const a = actividadDesde({ resultado: RESULTADO, elementoId: 'C1', obraId: 'obra-1' })
  assert.equal(a.ok, true)
  assert.equal(a.cantidad_plan, 2.1)
  assert.equal(a.codigo, 'T1010')
  assert.equal(a.origen.documento, 'Plano de Estructura.pdf')
  assert.equal(a.origen.lamina, 'ESTRUCTURA FUNDACION')
  assert.match(a.origen.textoLiteral, /C1 H=3.50m/)
  assert.equal(a.origen.formula, 'ancho × alto × largo × cantidad')
  assert.deepEqual(a.origen.entradas, { ancho: 0.4, alto: 0.2, largo: 3.5, cantidad: 8 })
  assert.ok(a.origen.cadena.length >= 5, 'la cadena legible viaja con la actividad')
})

test('SIN PARTIDA NO NACE ACTIVIDAD, y el motivo es el que hay que leer', () => {
  const a = actividadDesde({ resultado: RESULTADO, elementoId: 'CORREA' })
  assert.equal(a.ok, false)
  assert.match(a.porQue, /no tiene partida asignada/)
  assert.ok(a.faltantes.includes('PARTIDA'))
})

test('SIN CANTIDAD TAMPOCO: una actividad sin cantidad no se puede planificar', () => {
  const sinCantidad = {
    ...RESULTADO,
    mapeo: { mapeos: [{ elemento: 'X', estado: 'MAPEADA', tarea: { id: 'u-1', codigo: 'T1', nombre: 'N', unidad: 'M3' }, computo: { id: 'X', cantidad: { valor: null } } }] },
  }
  const a = actividadDesde({ resultado: sinCantidad, elementoId: 'X' })
  assert.equal(a.ok, false)
  assert.match(a.porQue, /no tiene cantidad computada/)
})

test('la obra entera sale ordenada y dice qué quedó afuera y por qué', () => {
  const o = obraDesdeCotizacion(RESULTADO, { obraId: 'obra-1' })
  assert.equal(o.actividades.length, 1)
  assert.equal(o.bloqueadas.length, 1)
  assert.equal(o.conservaOrigen, true)
  assert.match(o.porQue, /1 actividad\(es\) pueden nacer con su origen completo/)
})

test('los eslabones que TODAVÍA NO EXISTEN están nombrados, para que nadie invente otro modelo', () => {
  const a = actividadDesde({ resultado: RESULTADO, elementoId: 'C1' })
  assert.deepEqual(a.pendientesDeObra, ESLABONES_DE_OBRA)
  assert.ok(ESLABONES_DE_OBRA.includes('CANTIDAD_REAL'))
  assert.ok(ESLABONES_DE_OBRA.includes('PLAN_VS_REAL'))
  assert.ok(ESLABONES_DE_OBRA.includes('APRENDIZAJE'))
})

test('DOS CONVERSIONES IDÉNTICAS producen la misma obra, en el mismo orden', () => {
  assert.deepEqual(obraDesdeCotizacion(RESULTADO), obraDesdeCotizacion(RESULTADO))
})
