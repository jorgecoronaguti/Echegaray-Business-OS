// LO QUE ESTOS TESTS ATRAPAN: que la vigencia vuelva a ser un número mágico.
//
// El defecto que existía —`DIAS_VIGENCIA = 180` plano— no rompía ningún test porque no había con
// qué probarlo: una constante siempre devuelve lo mismo. Acá cada aserción exige que el número
// CAMBIE con la entrada que dice cambiarlo, que es la única forma de probar que está derivado.

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  CLASE, DIAS_MIN, DIAS_MAX, TOLERANCIA_BASE, TOLERANCIA_MATERIAL,
  claseDeRecurso, derivaDelIPC, derivaDeSerie, vigenciaDerivada,
} from './vigencia.mjs'

const HOY = new Date('2026-08-30T00:00:00Z')
const IPC_FIJO = [
  { periodo: '2026-01', variacion: 0.03 },
  { periodo: '2026-02', variacion: 0.03 },
  { periodo: '2026-03', variacion: 0.03 },
]

test('claseDeRecurso · el jornal de convenio no es un insumo, aunque venga con tipo=otro', () => {
  assert.equal(claseDeRecurso({ tipo: 'mano_obra' }), CLASE.CONVENIO)
  assert.equal(claseDeRecurso({ tipo: 'carga_social' }), CLASE.CONVENIO)
  // En la base real hay 5 recursos con tipo='otro' y familia='MANO DE OBRA'.
  assert.equal(claseDeRecurso({ tipo: 'otro', familia: 'MANO DE OBRA' }), CLASE.CONVENIO)
  assert.equal(claseDeRecurso({ tipo: 'otro', familia: 'SUBCONTRATISTA' }), CLASE.CONTRATO)
  assert.equal(claseDeRecurso({ tipo: 'material', familia: 'MATERIAL' }), CLASE.INSUMO)
  assert.equal(claseDeRecurso({}), CLASE.INSUMO)
})

test('derivaDelIPC · promedio GEOMÉTRICO, no aritmético, y denuncia la tabla congelada', () => {
  const r = derivaDelIPC({ tabla: IPC_FIJO, hoy: HOY })
  assert.ok(Math.abs(r.derivaMensual - 0.03) < 1e-12, `esperaba 3%/mes, dio ${r.derivaMensual}`)
  assert.equal(r.origen, 'IPC_INDEC')
  assert.ok(r.fuente.includes('INDEC'), 'la fuente tiene que ser citable')
  // El último período es 2026-03: cerrado el 31/03. Contra el 30/08 son 152 días.
  assert.equal(r.antiguedadDias, 152)
})

test('derivaDelIPC · el geométrico NO coincide con el aritmético cuando los meses difieren', () => {
  const tabla = [{ periodo: '2026-01', variacion: 0.10 }, { periodo: '2026-02', variacion: 0.00 }]
  const r = derivaDelIPC({ tabla, hoy: HOY })
  const aritmetico = 0.05
  assert.ok(r.derivaMensual < aritmetico, 'el geométrico de 10% y 0% es 4,88%, menor que el aritmético 5%')
  assert.ok(Math.abs(r.derivaMensual - (1.1 ** 0.5 - 1)) < 1e-12)
})

test('derivaDeSerie · UNA sola observación no es una serie — y así está la base entera hoy', () => {
  const r = derivaDeSerie([{ precio: 1000, observadoEn: '2026-01-01' }])
  assert.equal(r.derivaMensual, null)
  assert.equal(r.origen, 'SERIE_INSUFICIENTE')
  assert.match(r.porQue, /1 observación/)
})

test('derivaDeSerie · tres observaciones apretadas en una semana NO habilitan mensualizar', () => {
  const r = derivaDeSerie([
    { precio: 1000, observadoEn: '2026-08-01' },
    { precio: 1100, observadoEn: '2026-08-04' },
    { precio: 1200, observadoEn: '2026-08-07' },
  ])
  assert.equal(r.derivaMensual, null)
  assert.match(r.porQue, /inventa volatilidad/)
})

test('derivaDeSerie · con serie suficiente MIDE, y la mediana ignora la corrección aislada', () => {
  // Cuatro observaciones mensuales: +5%, +5% y un salto de carga corregido de ×3.
  const r = derivaDeSerie([
    { precio: 1000, observadoEn: '2026-01-01' },
    { precio: 1050, observadoEn: '2026-02-01' },
    { precio: 1102, observadoEn: '2026-03-01' },
    { precio: 3306, observadoEn: '2026-04-01' },
  ])
  assert.equal(r.origen, 'SERIE_OBSERVADA')
  assert.equal(r.n, 4)
  assert.ok(r.derivaMensual > 0.04 && r.derivaMensual < 0.35,
    `la mediana de (5%, 5%, 200%) tiene que quedar cerca del 5%, no del 70%: dio ${r.derivaMensual}`)
})

test('vigenciaDerivada · el número SALE del cociente y no de una constante', () => {
  // 30 × 2% ÷ 3%/mes = 20 días.
  const v = vigenciaDerivada({ tipo: 'material', materialidad: 0.10, hoy: HOY, tablaIpc: IPC_FIJO })
  assert.equal(v.dias, 20)
  assert.equal(v.tolerancia, TOLERANCIA_MATERIAL)
  assert.equal(v.origenDeriva, 'IPC_INDEC')
  assert.match(v.porQue, /30 × 2% ÷ 3\.00%\/mes/)
  assert.notEqual(v.dias, 180, 'si esto vuelve a dar 180 es que volvió la constante plana')
})

test('vigenciaDerivada · un recurso que no mueve plata dura MÁS que uno material', () => {
  const clavo = vigenciaDerivada({ tipo: 'material', materialidad: 0.0001, hoy: HOY, tablaIpc: IPC_FIJO })
  const hormigon = vigenciaDerivada({ tipo: 'material', materialidad: 0.30, hoy: HOY, tablaIpc: IPC_FIJO })
  assert.equal(clavo.tolerancia, TOLERANCIA_BASE)
  assert.equal(hormigon.tolerancia, TOLERANCIA_MATERIAL)
  assert.ok(clavo.dias > hormigon.dias, `el clavo (${clavo.dias}) tiene que durar más que el hormigón (${hormigon.dias})`)
})

test('vigenciaDerivada · materialidad DESCONOCIDA se trata como material, no como cero', () => {
  const sinSaber = vigenciaDerivada({ tipo: 'material', materialidad: null, hoy: HOY, tablaIpc: IPC_FIJO })
  const chico = vigenciaDerivada({ tipo: 'material', materialidad: 0.0001, hoy: HOY, tablaIpc: IPC_FIJO })
  assert.equal(sinSaber.tolerancia, TOLERANCIA_MATERIAL)
  assert.ok(sinSaber.dias < chico.dias, 'no saber cuánto pesa no puede salir más barato que saber que no pesa')
  assert.match(sinSaber.componentes.join(' '), /peso desconocido se trata como material/)
})

test('vigenciaDerivada · una serie propia le gana al IPC', () => {
  const serie = [
    { precio: 1000, observadoEn: '2026-01-01' },
    { precio: 1005, observadoEn: '2026-03-01' },
    { precio: 1010, observadoEn: '2026-05-01' },
  ]
  const v = vigenciaDerivada({ tipo: 'material', serie, materialidad: 0.10, hoy: HOY, tablaIpc: IPC_FIJO })
  assert.equal(v.origenDeriva, 'SERIE_OBSERVADA')
  const sinSerie = vigenciaDerivada({ tipo: 'material', materialidad: 0.10, hoy: HOY, tablaIpc: IPC_FIJO })
  assert.ok(v.dias > sinSerie.dias, 'un recurso que se movió 0,25%/mes propio tiene que durar más que el piso del IPC')
})

test('vigenciaDerivada · un precio de la web dura la MITAD que la misma observación interna', () => {
  const base = { tipo: 'material', materialidad: 0.001, hoy: HOY, tablaIpc: IPC_FIJO }
  const interno = vigenciaDerivada({ ...base, origen: 'INTERNO' })
  const web = vigenciaDerivada({ ...base, origen: 'WEB' })
  assert.equal(web.dias, Math.max(DIAS_MIN, Math.round(interno.dias * 0.5)))
  assert.match(web.porQue, /recortado ×0\.5/)
})

test('vigenciaDerivada · CONVENIO usa el tramo de paritaria, no una deriva mensual', () => {
  const v = vigenciaDerivada({ tipo: 'mano_obra', tramoParitariaHasta: '2026-10-31', hoy: HOY })
  assert.equal(v.clase, CLASE.CONVENIO)
  assert.equal(v.origenDeriva, 'TRAMO_PARITARIA')
  assert.equal(v.dias, 62)
  assert.equal(v.derivaMensual, null, 'un jornal de convenio no tiene deriva mensual: salta')
})

test('vigenciaDerivada · CONVENIO con el tramo ya vencido NO devuelve días positivos largos', () => {
  const v = vigenciaDerivada({ tipo: 'mano_obra', tramoParitariaHasta: '2026-05-01', hoy: HOY })
  assert.equal(v.dias, DIAS_MIN)
  assert.match(v.porQue, /venció/)
})

test('vigenciaDerivada · CONVENIO sin tramo DECLARA que está aproximando', () => {
  const v = vigenciaDerivada({ tipo: 'mano_obra', hoy: HOY })
  assert.equal(v.origenDeriva, 'TRAMO_PARITARIA_DESCONOCIDO')
  assert.match(v.porQue, /APROXIMACIÓN DECLARADA/)
  assert.match(v.porQue, /No es una medición/)
})

test('vigenciaDerivada · sin IPC y sin serie NO supone que el precio está quieto', () => {
  const v = vigenciaDerivada({ tipo: 'material', materialidad: 0.10, hoy: HOY, tablaIpc: [] })
  assert.equal(v.dias, DIAS_MIN, 'sin deriva medible la vigencia va al mínimo, no al máximo')
  assert.match(v.porQue, /en vez de suponer que el precio no se mueve/)
})

test('vigenciaDerivada · el resultado siempre queda dentro del rango declarado', () => {
  const casi_quieto = [
    { precio: 1000, observadoEn: '2020-01-01' },
    { precio: 1000.01, observadoEn: '2023-01-01' },
    { precio: 1000.02, observadoEn: '2026-01-01' },
  ]
  const v = vigenciaDerivada({ tipo: 'material', serie: casi_quieto, materialidad: 0.001, hoy: HOY, tablaIpc: IPC_FIJO })
  assert.ok(v.dias >= DIAS_MIN && v.dias <= DIAS_MAX, `${v.dias} salió del rango`)
  assert.equal(v.dias, DIAS_MAX)
  assert.match(v.porQue, /acotado al rango/)
})
