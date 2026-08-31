// LO QUE ESTOS TESTS ATRAPAN: que la vigencia vuelva a ser un número mágico.
//
// El defecto que existía —`DIAS_VIGENCIA = 180` plano— no rompía ningún test porque no había con
// qué probarlo: una constante siempre devuelve lo mismo. Acá cada aserción exige que el número
// CAMBIE con la entrada que dice cambiarlo, que es la única forma de probar que está derivado.

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  CLASE, DIAS_MIN, DIAS_MAX, TOLERANCIA_SIN_MATERIALIDAD, TOLERANCIA_MIN, TOLERANCIA_MAX,
  DIAS_MONEDA_EXTRANJERA_NO_MEDIDA, TRAMO_PARITARIA_HASTA, TRAMO_PARITARIA_FUENTE,
  claseDeRecurso, derivaDelIPC, derivaDeSerie, toleranciaDeMaterialidad, vigenciaDerivada,
} from './vigencia.mjs'

const HOY = new Date('2026-08-30T00:00:00Z')
/** Con IPC_FIJO (último período 2026-03) esta fecha deja el índice AL DÍA: sirve para probar el
 *  cociente limpio, sin el recorte por atraso que se prueba aparte. */
const HOY_IPC_AL_DIA = new Date('2026-04-15T00:00:00Z')
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
  assert.equal(r.origen, 'IPC_INDEC_ATRASADO', 'a 152 días del último dato, el origen lo denuncia')
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
  // f = 10% ⇒ tolerancia = 2% ÷ 10% = 20%. Días = 30 × 20% ÷ 3%/mes = 200.
  const v = vigenciaDerivada({ tipo: 'material', materialidad: 0.10, hoy: HOY_IPC_AL_DIA, tablaIpc: IPC_FIJO })
  assert.equal(v.dias, 200)
  assert.ok(Math.abs(v.tolerancia - 0.20) < 1e-12)
  assert.equal(v.origenDeriva, 'IPC_INDEC')
  assert.match(v.porQue, /30 × 20% ÷ 3\.00%\/mes/)
  assert.notEqual(v.dias, 180, 'si esto vuelve a dar 180 es que volvió la constante plana')
})

test('vigenciaDerivada · el TORNILLO no puede frenar una obra de $79,5 M y el PANEL sí', () => {
  const tornillo = vigenciaDerivada({ tipo: 'material', materialidad: 0.00002, hoy: HOY_IPC_AL_DIA, tablaIpc: IPC_FIJO })
  const panel = vigenciaDerivada({ tipo: 'material', materialidad: 0.30, hoy: HOY_IPC_AL_DIA, tablaIpc: IPC_FIJO })
  assert.equal(tornillo.tolerancia, TOLERANCIA_MAX)
  assert.ok(Math.abs(panel.tolerancia - 0.02 / 0.30) < 1e-12)
  assert.equal(tornillo.dias, DIAS_MAX, 'un tornillo que mueve centavos no vence: su error no mueve el total')
  assert.ok(panel.dias < tornillo.dias, `el panel (${panel.dias}) tiene que vencer antes que el tornillo (${tornillo.dias})`)
})

test('toleranciaDeMaterialidad · se DESPEJA de f × e < IMPACTO_MATERIAL', () => {
  assert.ok(Math.abs(toleranciaDeMaterialidad(0.20).tolerancia - 0.10) < 1e-12, '2% ÷ 20% = 10%')
  assert.equal(toleranciaDeMaterialidad(1).tolerancia, TOLERANCIA_MIN, 'un recurso que ES el costo no tolera más que el propio umbral material')
  assert.equal(toleranciaDeMaterialidad(0.000001).tolerancia, TOLERANCIA_MAX)
  assert.equal(toleranciaDeMaterialidad(null).tolerancia, TOLERANCIA_SIN_MATERIALIDAD)
  assert.equal(toleranciaDeMaterialidad(0).tolerancia, TOLERANCIA_SIN_MATERIALIDAD, 'cero no es «no pesa nada»: es no saber')
})

test('vigenciaDerivada · un precio en DÓLARES no envejece con la inflación en pesos', () => {
  const usd = vigenciaDerivada({ tipo: 'equipo', moneda: 'USD', materialidad: 0.05, hoy: HOY, tablaIpc: IPC_FIJO })
  const ars = vigenciaDerivada({ tipo: 'equipo', moneda: 'ARS', materialidad: 0.05, hoy: HOY, tablaIpc: IPC_FIJO })
  assert.equal(usd.origenDeriva, 'MONEDA_EXTRANJERA_NO_MEDIDA')
  assert.equal(usd.dias, DIAS_MONEDA_EXTRANJERA_NO_MEDIDA)
  assert.match(usd.porQue, /NO MEDIDOS/)
  assert.match(usd.porQue, /aplicarFx/)
  assert.notEqual(usd.origenDeriva, ars.origenDeriva)
})

test('vigenciaDerivada · en dólares, una serie PROPIA le gana al hueco declarado', () => {
  const serie = [
    { precio: 1000, observadoEn: '2026-01-01' },
    { precio: 1010, observadoEn: '2026-03-01' },
    { precio: 1020, observadoEn: '2026-05-01' },
  ]
  const v = vigenciaDerivada({ tipo: 'equipo', moneda: 'USD', serie, materialidad: 0.05, hoy: HOY, tablaIpc: IPC_FIJO })
  assert.equal(v.origenDeriva, 'SERIE_OBSERVADA', 'medir siempre le gana a declarar un hueco')
})

test('vigenciaDerivada · materialidad DESCONOCIDA no se lee como cero', () => {
  const sinSaber = vigenciaDerivada({ tipo: 'material', materialidad: null, hoy: HOY, tablaIpc: IPC_FIJO })
  const chico = vigenciaDerivada({ tipo: 'material', materialidad: 0.0001, hoy: HOY, tablaIpc: IPC_FIJO })
  assert.equal(sinSaber.tolerancia, TOLERANCIA_SIN_MATERIALIDAD)
  assert.ok(sinSaber.dias < chico.dias, 'no saber cuánto pesa no puede salir más barato que saber que no pesa')
  assert.match(sinSaber.componentes.join(' '), /no se lee como cero/)
})

test('vigenciaDerivada · una serie propia le gana al IPC', () => {
  const serie = [
    { precio: 1000, observadoEn: '2026-01-01' },
    { precio: 1005, observadoEn: '2026-03-01' },
    { precio: 1010, observadoEn: '2026-05-01' },
  ]
  const v = vigenciaDerivada({ tipo: 'material', serie, materialidad: 0.60, hoy: HOY, tablaIpc: IPC_FIJO })
  assert.equal(v.origenDeriva, 'SERIE_OBSERVADA')
  const sinSerie = vigenciaDerivada({ tipo: 'material', materialidad: 0.60, hoy: HOY, tablaIpc: IPC_FIJO })
  assert.ok(v.dias > sinSerie.dias, 'un recurso que se movió 0,25%/mes propio tiene que durar más que el piso del IPC')
})

test('vigenciaDerivada · un precio de la web dura la MITAD que la misma observación interna', () => {
  const base = { tipo: 'material', materialidad: 0.60, hoy: HOY, tablaIpc: IPC_FIJO }
  const interno = vigenciaDerivada({ ...base, origen: 'INTERNO' })
  const web = vigenciaDerivada({ ...base, origen: 'WEB' })
  assert.equal(web.dias, Math.max(DIAS_MIN, Math.round(interno.dias * 0.5)))
  assert.match(web.porQue, /recortado ×0\.5/)
})

test('vigenciaDerivada · CONVENIO usa el tramo de paritaria, no una deriva mensual', () => {
  const v = vigenciaDerivada({ tipo: 'mano_obra', tramoParitariaHasta: '2026-10-31', observadoEn: '2026-08-30', hoy: HOY })
  assert.equal(v.clase, CLASE.CONVENIO)
  assert.equal(v.origenDeriva, 'TRAMO_PARITARIA')
  assert.equal(v.caducaEl, '2026-10-31')
  assert.equal(v.dias, 62)
  assert.equal(v.derivaMensual, null, 'un jornal de convenio no tiene deriva mensual: salta')
})

test('vigenciaDerivada · CONVENIO con el tramo ya vencido lo dice, no lo estira', () => {
  const v = vigenciaDerivada({ tipo: 'mano_obra', tramoParitariaHasta: '2026-05-01', observadoEn: '2026-04-01', hoy: HOY })
  assert.equal(v.caducaEl, '2026-05-01')
  assert.match(v.porQue, /CADUCÓ/)
})

test('vigenciaDerivada · CONVENIO sin tramo DECLARA que está aproximando', () => {
  // Hay que pasar `null` EXPLÍCITO: el default del parámetro es el tramo real cableado.
  const v = vigenciaDerivada({ tipo: 'mano_obra', tramoParitariaHasta: null, hoy: HOY })
  assert.equal(v.origenDeriva, 'TRAMO_PARITARIA_DESCONOCIDO')
  assert.equal(v.caducaEl, null)
  assert.match(v.porQue, /APROXIMACIÓN DECLARADA/)
  assert.match(v.porQue, /No es una medición/)
})

test('vigenciaDerivada · sin IPC y sin serie NO supone que el precio está quieto', () => {
  const v = vigenciaDerivada({ tipo: 'material', materialidad: 0.60, hoy: HOY, tablaIpc: [] })
  assert.equal(v.dias, DIAS_MIN, 'sin deriva medible la vigencia va al mínimo, no al máximo')
  assert.match(v.porQue, /en vez de suponer que el precio no se mueve/)
})

test('vigenciaDerivada · el resultado siempre queda dentro del rango declarado', () => {
  const casi_quieto = [
    { precio: 1000, observadoEn: '2020-01-01' },
    { precio: 1000.01, observadoEn: '2023-01-01' },
    { precio: 1000.02, observadoEn: '2026-01-01' },
  ]
  const v = vigenciaDerivada({ tipo: 'material', serie: casi_quieto, materialidad: 0.60, hoy: HOY, tablaIpc: IPC_FIJO })
  assert.ok(v.dias >= DIAS_MIN && v.dias <= DIAS_MAX, `${v.dias} salió del rango`)
  assert.equal(v.dias, DIAS_MAX)
  assert.match(v.porQue, /acotado al rango/)
})

// ══════════════════════════════════════════════════════════════════════════════════════════════
// EL TRAMO DE PARITARIA · CADUCAR NO ES DEGRADARSE
// ══════════════════════════════════════════════════════════════════════════════════════════════

test('TRAMO_PARITARIA_HASTA sale de uocra-paritaria.mjs, no de un número escrito acá', async () => {
  const { VIGENCIA_HASTA } = await import('../uocra-paritaria.mjs')
  const [d, m, a] = VIGENCIA_HASTA.split('/')
  assert.equal(TRAMO_PARITARIA_HASTA, `${a}-${m}-${d}`)
  assert.equal(TRAMO_PARITARIA_HASTA, '2026-08-31')
  assert.match(TRAMO_PARITARIA_FUENTE, /CCT 76\/75/)
  assert.match(TRAMO_PARITARIA_FUENTE, /Zona A/)
})

test('el básico de convenio vale HASTA la fecha del tramo, contado desde su observación', () => {
  // El bug que esto cierra: la versión anterior hacía `dias = fin del tramo − HOY`, y quien llama
  // compara ese número contra `HOY − observadoEn`. Un básico observado el 01/08 con el tramo
  // terminando el 31/08 daba `dias = 1` contra una antigüedad de 29 y salía VENCIDO el 30/08,
  // un día antes de que el tramo terminara de verdad.
  const v = vigenciaDerivada({ tipo: 'mano_obra', observadoEn: '2026-08-01', hoy: new Date('2026-08-30T00:00:00Z') })
  assert.equal(v.caducaEl, '2026-08-31')
  assert.equal(v.dias, 30, 'del 01/08 al 31/08 son 30 días, no «1 día que resta»')
  assert.equal(v.origenDeriva, 'TRAMO_PARITARIA')
  assert.equal(v.derivaMensual, null, 'un básico de convenio no tiene deriva mensual: caduca')
})

test('EL 30/08 el básico de agosto SIGUE vigente — el día antes de que caduque', () => {
  const v = vigenciaDerivada({ tipo: 'mano_obra', observadoEn: '2026-08-01', hoy: new Date('2026-08-30T00:00:00Z') })
  assert.match(v.porQue, /vale hasta el 2026-08-31/)
  assert.doesNotMatch(v.porQue, /CADUCÓ/)
})

test('EL 01/09 CADUCA: no se sigue sirviendo el básico de agosto en silencio', () => {
  const v = vigenciaDerivada({ tipo: 'mano_obra', observadoEn: '2026-08-01', hoy: new Date('2026-09-01T00:00:00Z') })
  assert.equal(v.caducaEl, '2026-08-31')
  assert.match(v.porQue, /CADUCÓ el 2026-08-31/)
  assert.match(v.porQue, /no se sigue sirviendo en silencio/)
})

test('caducar NO es degradarse: un material de la misma fecha sigue vivo el 01/09', () => {
  const jornal = vigenciaDerivada({ tipo: 'mano_obra', observadoEn: '2026-08-01', hoy: new Date('2026-09-01T00:00:00Z') })
  const material = vigenciaDerivada({ tipo: 'material', materialidad: 0.001, observadoEn: '2026-08-01', hoy: new Date('2026-09-01T00:00:00Z'), tablaIpc: IPC_FIJO })
  assert.equal(jornal.caducaEl, '2026-08-31', 'el jornal tiene fecha dura')
  assert.equal(material.caducaEl, null, 'el material no caduca: se degrada, y quien decide es la antigüedad')
  assert.ok(material.dias > 31, 'el material de la misma fecha todavía tiene vida')
})

// ══════════════════════════════════════════════════════════════════════════════════════════════
// LA GUARDA DEL IPC · UN ÍNDICE CONGELADO NO SE CITA COMO FRESCO
// ══════════════════════════════════════════════════════════════════════════════════════════════

test('derivaDelIPC · con el índice al día NO se recorta nada', () => {
  // Último período 2026-03, cerrado el 31/03. Contra el 15/04 son 15 días: menos de un mes.
  const r = derivaDelIPC({ tabla: IPC_FIJO, hoy: new Date('2026-04-15T00:00:00Z') })
  assert.equal(r.origen, 'IPC_INDEC')
  assert.equal(r.factorFrescura, 1)
})

test('derivaDelIPC · un índice ATRASADO se declara y recorta, no se publica como medición', () => {
  const r = derivaDelIPC({ tabla: IPC_FIJO, hoy: new Date('2026-08-30T00:00:00Z') })
  assert.equal(r.origen, 'IPC_INDEC_ATRASADO', 'el origen cambia: en el informe se ve que el índice está viejo')
  assert.equal(r.antiguedadDias, 152)
  assert.ok(r.factorFrescura < 1 && r.factorFrescura > 0, `esperaba un recorte parcial, dio ${r.factorFrescura}`)
  assert.match(r.porQue, /meses posteriores sin medir/)
})

test('derivaDelIPC · una tabla ABANDONADA no sostiene ninguna vigencia', () => {
  const r = derivaDelIPC({ tabla: IPC_FIJO, hoy: new Date('2028-01-01T00:00:00Z') })
  assert.equal(r.origen, 'IPC_INDEC_ABANDONADO')
  assert.equal(r.derivaMensual, null)
  assert.match(r.porQue, /abandonada/)
})

test('NEGATIVO · el atraso del IPC ACORTA la vigencia — el control puede decir que no', () => {
  const base = { tipo: 'material', materialidad: 0.10, tablaIpc: IPC_FIJO }
  const alDia = vigenciaDerivada({ ...base, hoy: new Date('2026-04-15T00:00:00Z') })
  const atrasado = vigenciaDerivada({ ...base, hoy: new Date('2026-08-30T00:00:00Z') })
  assert.ok(atrasado.dias < alDia.dias,
    `con el índice 152 días viejo la vigencia tiene que ser MENOR: al día ${alDia.dias}, atrasado ${atrasado.dias}`)
  assert.equal(atrasado.origenDeriva, 'IPC_INDEC_ATRASADO')
  assert.match(atrasado.porQue, /recortado ×.*porque el IPC que sostiene la deriva tiene 152 días/)
})

test('con la tabla abandonada la vigencia cae al MÍNIMO, no al máximo', () => {
  const v = vigenciaDerivada({ tipo: 'material', materialidad: 0.10, tablaIpc: IPC_FIJO, hoy: new Date('2028-01-01T00:00:00Z') })
  assert.equal(v.dias, DIAS_MIN)
  assert.match(v.porQue, /en vez de suponer que el precio no se mueve/)
})
