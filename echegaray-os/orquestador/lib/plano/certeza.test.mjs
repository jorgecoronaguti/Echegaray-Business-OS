// QUE «COTIZABLE» NO SE PUEDA REGALAR, Y QUE TAMPOCO SEA INALCANZABLE.
//
// ═══ LOS DOS DEFECTOS QUE ESTE ARCHIVO TIENE QUE ATRAPAR ═══
//
// El primero ya se pagó en este mismo motor: un control estructuralmente incapaz de dar rojo. Por
// eso todo lo que acá se prueba se arma por la RUTA DE PRODUCCIÓN —`validarElemento` →
// `computarElemento` → `seleccionarTodas` → `controlar` → `agruparPartidas` → `armar`— y nunca a
// mano. Un item escrito a mano con la fuente que hace falta prueba que el `if` funciona, no que el
// circuito produzca alguna vez esa entrada.
//
// El segundo es el simétrico y es igual de grave: un control incapaz de dar VERDE. Si COTIZABLE no
// se puede alcanzar ni con el proyecto perfecto, el estado no distingue nada y se ignora. Por eso el
// primer test construye una cotización que sí llega.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { certeza, metricas, plataEnSupuestos, vigenciaDePrecios, validacionDe, CERTEZA, REGLAS, UMBRAL } from './certeza.mjs'
import { controlar } from './control.mjs'
import { computarElemento } from './computo.mjs'
import { validarElemento } from './interpretar.mjs'
import { seleccionarTodas } from './seleccion.mjs'
import { agruparPartidas, armar } from './cotizacion-v0.mjs'
import { isoFecha } from './pipeline.mjs'

const HOY = new Date('2026-08-28T12:00:00Z')
const AYER = '2026-08-20'

/** El elemento como sale del circuito: interpretado y computado, nunca escrito a mano. */
const delCircuito = (crudo) => computarElemento(validarElemento(crudo, { archivo: 'Plano.pdf', archivoId: 'd1', lamina: 'L1' }))

/** Un contrapiso con la superficie CITADA. Es el elemento más limpio del circuito para probar el
 *  escalón: mapea contra la Base Maestra sin atributos bloqueantes y `procesos.mjs` no le deriva
 *  ninguna tarea —deriva de hormigón armado, metálica, mampostería y cubierta—, así que el ruido de
 *  otras reglas no tapa la que cada test quiere ver. */
const contrapiso = (id, area) => delCircuito({
  id, nombre: 'Contrapiso de hormigon', sistema: 'piso', forma: 'superficie',
  dimensiones: { area_m2: area },
  dimensiones_texto: { area_m2: `${area}m²` },
  repeticion: { modo: 'conteo_directo', cantidad: 1 },
  evidencia: { vista: 'PLANTA', texto_literal: `Contrapiso ${id}: ${area}m²` },
})

/** Un elemento SIN medidas: el circuito lo devuelve con `cantidad: null` y su motivo. */
const sinMedir = (id) => delCircuito({
  id, nombre: 'Contrapiso de hormigon', sistema: 'piso', forma: 'superficie',
  repeticion: { modo: 'conteo_directo', cantidad: 1 },
  evidencia: { vista: 'PLANTA', texto_literal: `Contrapiso ${id}: sin cotas` },
})

const CATALOGO = [{ id: 't-cp', codigo: 'T-CP', nombre: 'CONTRAPISO DE HORMIGON', unidad: 'M2' }]

/** Una composición con precio de ayer: es lo que `composiciones()` devuelve de Postgres. */
const composicion = (fecha = AYER) => new Map([['t-cp', [
  { codigo: 'M1', nombre: 'Cemento', tipo: 'material', unidad: 'kg', cantidad: 8, desperdicio: 0.05, costoUnitario: 100, fechaPrecio: fecha, moneda: 'ARS', fuentePrecio: 'proveedor' },
  { codigo: 'H1', nombre: 'Oficial albañil', tipo: 'mano_obra', unidad: 'hs', cantidad: 1.2, desperdicio: 0, costoUnitario: 5000, fechaPrecio: fecha, moneda: 'ARS', fuentePrecio: 'CIRCOT' },
]]])

/** Un proyecto completo pasado por todo el circuito. `extra` inyecta lo que el pipeline le pasa a
 *  `controlar` desde afuera: conflictos del cruce documental y ambigüedades de identidad. */
function proyectoDe(items, { extra = {}, comp = composicion() } = {}) {
  const seleccion = seleccionarTodas(items, CATALOGO)
  const control = controlar({ computo: { detectados: items.length, items }, mapeo: seleccion, ...extra })
  const { partidas, candidatas } = agruparPartidas(seleccion.mapeos)
  const cotizacion = armar({ obraNombre: 'test', partidas, composiciones: comp, candidatas })
  return { control, items, cotizacion, seleccion }
}

const diez = () => Array.from({ length: 10 }, (_, i) => contrapiso(`C${i}`, 20 + i))

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// EL CONTROL PUEDE DAR VERDE
// ═══════════════════════════════════════════════════════════════════════════════════════════════

test('CON TODO EN ORDEN LLEGA A COTIZABLE — si esto no pasa, el estado no distingue nada', () => {
  const p = proyectoDe(diez())
  const c = certeza({ ...p, hoy: HOY })
  assert.equal(c.estado, CERTEZA.COTIZABLE, `quedó ${c.estado}: ${JSON.stringify(c.queFalta)}`)
  assert.equal(c.queFalta.length, 0)
  assert.equal(c.paraSubir.siguiente, CERTEZA.VALIDADO)
  assert.match(c.paraSubir.falta[0], /firma de una persona distinta/)
  assert.equal(c.metricas.coberturaCantidades, 1)
  assert.ok(c.metricas.costoDirecto > 0, 'la cotización está valorizada de verdad')
})

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// Y PUEDE DAR ROJO POR CADA REGLA, DE A UNA
// ═══════════════════════════════════════════════════════════════════════════════════════════════

test('UN CONFLICTO DOCUMENTAL SOLO TIRA COTIZABLE ABAJO, con cobertura 100%', () => {
  const conflicto = { que: 'PLATEA:hormigon', porQue: 'el plano dice H-21 y la memoria dice H-25' }
  const p = proyectoDe(diez(), { extra: { conflictos: [conflicto] } })
  const c = certeza({ ...p, hoy: HOY })
  assert.equal(c.metricas.coberturaCantidades, 1, 'la cobertura sigue perfecta')
  assert.equal(c.estado, CERTEZA.REQUIERE_DEFINICION, 'la cobertura NO compensa un conflicto')
  assert.equal(c.queFalta.length, 1)
  assert.equal(c.queFalta[0].regla, 'conflictos')
})

test('UNA AMBIGÜEDAD QUE BLOQUEA TIRA COTIZABLE ABAJO; una que no bloquea, no', () => {
  const bloquea = { tipo: 'CANTIDAD_DISTINTA', nombre: 'Columna C1' }
  const noBloquea = { tipo: 'SOLO_NOMBRE', nombre: 'Viga V2' }
  const mala = certeza({ ...proyectoDe(diez(), { extra: { identidadesAmbiguas: [bloquea] } }), hoy: HOY })
  const buena = certeza({ ...proyectoDe(diez(), { extra: { identidadesAmbiguas: [noBloquea] } }), hoy: HOY })
  assert.equal(mala.estado, CERTEZA.REQUIERE_DEFINICION)
  assert.equal(buena.estado, CERTEZA.COTIZABLE, 'una ambigüedad ya resuelta no puede frenar una cotización')
  assert.equal(buena.metricas.ambiguedades.total, 1, 'se muestra igual: no bloquear no es esconder')
})

test('UN SUPUESTO OCULTO QUE SOSTIENE PLATA TIRA COTIZABLE ABAJO, Y DICE CUÁNTA', () => {
  // La cita habla de la platea «s/Cálculo»: el número 60 no está en ella. Es la forma exacta del
  // hallazgo de Quattropani, construida por el circuito y no declarada a mano.
  const items = diez()
  items[3] = delCircuito({
    id: 'C3', nombre: 'Contrapiso de hormigon', sistema: 'piso', forma: 'superficie',
    dimensiones: { area_m2: 60 },
    repeticion: { modo: 'conteo_directo', cantidad: 1 },
    evidencia: { vista: 'PLANTA', texto_literal: 'Contrapiso s/Cálculo' },
  })
  const p = proyectoDe(items)
  const c = certeza({ ...p, hoy: HOY })
  assert.equal(c.metricas.supuestos.ocultos, 1)
  assert.ok(c.metricas.supuestos.pesos > 0, 'el supuesto cae sobre una partida con precio')
  assert.equal(c.estado, CERTEZA.REQUIERE_DEFINICION)
  assert.match(c.queFalta[0].falta, /sostienen \$/)
  assert.equal(c.metricas.supuestos.partidas[0].codigo, 'T-CP')
})

test('SIN COTIZACIÓN VALORIZADA, LA PLATA EN SUPUESTOS ES «NO SÉ» Y NO CERO', () => {
  const r = plataEnSupuestos({ supuestosOcultos: [{ elemento: 'X' }], cotizacion: null })
  assert.equal(r.pesos, null, 'un control que no pudo mirar no puede informar cero')
  assert.match(r.porQue, /no puede afirmar que sea cero/)
})

test('POR DEBAJO DE LA MITAD MEDIDA ES BORRADOR_TECNICO, no «incompleto»', () => {
  const items = diez()
  for (let i = 0; i < 6; i++) items[i] = sinMedir(`C${i}`)
  const c = certeza({ ...proyectoDe(items), hoy: HOY })
  assert.equal(c.metricas.coberturaCantidades, 0.4)
  assert.equal(c.estado, CERTEZA.BORRADOR_TECNICO)
  assert.match(c.paraSubir.falta[0], /es un relevamiento, no un cómputo/)
  assert.equal(c.paraSubir.siguiente, CERTEZA.INCOMPLETO)
})

test('ENTRE LA MITAD Y EL 90% ES INCOMPLETO, Y DICE CUÁNTOS ELEMENTOS FALTAN MEDIR', () => {
  const items = diez()
  for (let i = 0; i < 3; i++) items[i] = sinMedir(`C${i}`)
  const c = certeza({ ...proyectoDe(items), hoy: HOY })
  assert.equal(c.metricas.coberturaCantidades, 0.7)
  assert.equal(c.estado, CERTEZA.INCOMPLETO)
  assert.match(c.paraSubir.falta.join(' '), /medir 2 elemento\(s\) más/)
})

test('UNA PARTIDA SIN PRECIO ROMPE LA COBERTURA ECONÓMICA — un total al que le falta un renglón engaña más que un total ausente', () => {
  const sinPrecio = new Map([['t-cp', [{ codigo: 'M1', nombre: 'Cemento', tipo: 'material', unidad: 'kg', cantidad: 8, desperdicio: 0, costoUnitario: null, fechaPrecio: AYER }]]])
  const c = certeza({ ...proyectoDe(diez(), { comp: sinPrecio }), hoy: HOY })
  assert.equal(c.metricas.coberturaEconomica, 0)
  assert.equal(c.estado, CERTEZA.INCOMPLETO)
  assert.match(c.queFalta.find((f) => f.regla === 'economica').falta, /poner precio a 1 partida/)
})

test('SIN COMPOSICIÓN NO HAY HH NI COSTO, y las dos reglas lo dicen por separado', () => {
  const c = certeza({ ...proyectoDe(diez(), { comp: new Map() }), hoy: HOY })
  assert.equal(c.metricas.coberturaComposicion, 0)
  assert.equal(c.metricas.hh, 0)
  assert.ok(c.queFalta.some((f) => f.regla === 'composicion'))
  assert.ok(c.queFalta.some((f) => f.regla === 'economica'))
})

test('LO QUE FRENA COTIZABLE ES LA PLATA APOYADA EN PRECIOS VIEJOS, no el insumo más viejo', () => {
  // Medido el 28/08/2026 sobre la Base Maestra real: de 389 precios «vigentes», 112 tienen más de
  // cinco años. Con un semáforo binario sobre el más antiguo, TODA cotización quedaba en rojo para
  // siempre — y un control que siempre está en rojo se mira una vez y después se ignora.
  const viejo = certeza({ ...proyectoDe(diez(), { comp: composicion('2025-10-01') }), hoy: HOY })
  assert.equal(viejo.metricas.vigencia.dias, 332, 'la fecha se sigue midiendo y se sigue informando')
  assert.equal(viejo.metricas.plataVieja.fraccion, 1, 'acá el 100% del costo está sobre precios viejos')
  assert.equal(viejo.estado, CERTEZA.REQUIERE_DEFINICION)
  assert.match(viejo.queFalta[0].falta, /re-preciar antes de mandarla/)
  assert.equal(certeza({ ...proyectoDe(diez()), hoy: HOY }).estado, CERTEZA.COTIZABLE)
})

test('NEGATIVO: un insumo viejo que pesa poco NO frena la cotización — el caso real de la cercha', () => {
  // Sobre Quattropani: «el precio más viejo tiene 974 días» convivía con que esa línea pesa
  // $ 202 de $ 73.895 del unitario. Cierto como dato, falso como conclusión.
  const casi = new Map([['t-cp', [
    { codigo: 'M1', nombre: 'Cemento', tipo: 'material', unidad: 'kg', cantidad: 8, desperdicio: 0.05, costoUnitario: 100, fechaPrecio: AYER, moneda: 'ARS', fuentePrecio: 'proveedor' },
    { codigo: 'H1', nombre: 'Oficial albañil', tipo: 'mano_obra', unidad: 'hs', cantidad: 1.2, desperdicio: 0, costoUnitario: 5000, fechaPrecio: AYER, moneda: 'ARS', fuentePrecio: 'CIRCOT' },
    { codigo: 'X1', nombre: 'Alambre de atar', tipo: 'material', unidad: 'kg', cantidad: 0.02, desperdicio: 0, costoUnitario: 500, fechaPrecio: '2023-12-28', moneda: 'ARS', fuentePrecio: 'proveedor' },
  ]]])
  const c = certeza({ ...proyectoDe(diez(), { comp: casi }), hoy: HOY })
  assert.ok(c.metricas.vigencia.dias > 900, 'el insumo de 2023 sigue estando y se sigue informando')
  assert.ok(c.metricas.plataVieja.fraccion < 0.01, `pesa ${c.metricas.plataVieja.fraccion}: menos del 1% del costo`)
  assert.equal(c.estado, CERTEZA.COTIZABLE, 'y por eso NO frena: si frenara, el control sería ruido')
})

test('NEGATIVO: un renglón SIN fecha de precio cuenta como viejo — no poder saber no es estar al día', () => {
  const sinFecha = new Map([['t-cp', [
    { codigo: 'M1', nombre: 'Cemento', tipo: 'material', unidad: 'kg', cantidad: 8, desperdicio: 0.05, costoUnitario: 100, fechaPrecio: null, moneda: 'ARS', fuentePrecio: 'proveedor' },
    { codigo: 'H1', nombre: 'Oficial albañil', tipo: 'mano_obra', unidad: 'hs', cantidad: 1.2, desperdicio: 0, costoUnitario: 5000, fechaPrecio: AYER, moneda: 'ARS', fuentePrecio: 'CIRCOT' },
  ]]])
  const c = certeza({ ...proyectoDe(diez(), { comp: sinFecha }), hoy: HOY })
  assert.ok(c.metricas.plataVieja.sinFecha > 0)
  assert.ok(c.metricas.plataVieja.fraccion > 0.1, 'el cemento sin fecha pesa lo suficiente para frenar')
  assert.equal(c.estado, CERTEZA.REQUIERE_DEFINICION)
})

test('UNA FECHA QUE NO ES UNA FECHA NO PUEDE LEERSE COMO VIGENTE', () => {
  // El defecto real: `pg` devuelve las columnas `date` como `Date`, y `String(fecha).slice(0,10)`
  // daba «Fri May 01». La resta salía NaN y la regla de vigencia pasaba sin haber medido nada.
  const rota = vigenciaDePrecios({ partidas: [{ composicion: [{ fechaPrecio: 'Fri May 01' }] }] }, HOY)
  assert.equal(rota.dias, null)
  assert.match(rota.porQue, /no se puede interpretar como fecha/)
  const c = certeza({ ...proyectoDe(diez(), { comp: composicion('Fri May 01') }), hoy: HOY })
  assert.notEqual(c.estado, CERTEZA.COTIZABLE, 'sin fecha legible la vigencia no se puede afirmar')
  // Y la ruta de producción ahora sí devuelve una fecha comparable.
  assert.equal(isoFecha(new Date(2026, 4, 1)), '2026-05-01')
  assert.equal(isoFecha(null), null)
})

test('UNA CANTIDAD SIN CITA LITERAL FRENA COTIZABLE — y no poder mirar no es poder decir «no hay»', () => {
  const items = diez()
  items[0] = { ...items[0], evidencia: { ...items[0].evidencia, textoLiteral: null } }
  const c = certeza({ ...proyectoDe(items), hoy: HOY })
  assert.equal(c.metricas.fuentes.sinCitaLiteral, 1)
  assert.ok(c.queFalta.some((f) => f.regla === 'fuentes'))
  const sinItems = certeza({ ...proyectoDe(diez()), items: null, hoy: HOY })
  assert.equal(sinItems.metricas.fuentes.sinCitaLiteral, null)
  assert.match(sinItems.queFalta.find((f) => f.regla === 'fuentes').falta, /sin ellos no se puede afirmar/)
})

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// VALIDADO NO LO PUEDE ALCANZAR EL CÓDIGO
// ═══════════════════════════════════════════════════════════════════════════════════════════════

test('VALIDADO NO SE CALCULA: sin firma, el techo del código es COTIZABLE', () => {
  const c = certeza({ ...proyectoDe(diez()), hoy: HOY })
  assert.equal(c.estado, CERTEZA.COTIZABLE)
  assert.equal(c.validacion, null)
  assert.ok(!Object.values(c.reglas).some((g) => g.tope === CERTEZA.VALIDADO), 'ninguna regla medible puede llevar a VALIDADO')
})

test('CON FIRMA DE OTRO SÍ LLEGA A VALIDADO', () => {
  const c = certeza({ ...proyectoDe(diez()), firma: { firmante: 'jorge', cuando: '2026-08-28' }, producidoPor: 'xsas', hoy: HOY })
  assert.equal(c.estado, CERTEZA.VALIDADO)
  assert.equal(c.validacion.firmante, 'jorge')
  assert.equal(c.paraSubir.siguiente, null)
})

test('QUIEN LA PRODUJO NO LA PUEDE FIRMAR — ningún trabajo lo cierra quien lo construyó', () => {
  assert.throws(
    () => certeza({ ...proyectoDe(diez()), firma: { firmante: 'xsas' }, producidoPor: 'xsas', hoy: HOY }),
    /no puede firmarla/,
  )
})

test('FIRMAR LO QUE ESTÁ INCOMPLETO NO LO COMPLETA', () => {
  const p = proyectoDe(diez(), { extra: { conflictos: [{ que: 'x', porQue: 'dos documentos' }] } })
  const c = certeza({ ...p, firma: { firmante: 'jorge' }, hoy: HOY })
  assert.equal(c.estado, CERTEZA.REQUIERE_DEFINICION)
  assert.equal(c.validacion.aceptada, false)
  assert.match(c.validacion.porQue, /firmar lo que está incompleto no lo completa/)
})

test('validacionDe es la misma regla que la biblioteca de conocimiento, no una copia relajada', () => {
  assert.throws(() => validacionDe({ porMedicion: CERTEZA.COTIZABLE, firma: { firmante: 'a' }, producidoPor: 'a' }), /no puede firmarla/)
  assert.equal(validacionDe({ porMedicion: CERTEZA.COTIZABLE, firma: null }).estado, CERTEZA.COTIZABLE)
})

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// LA FORMA DEL ESCALÓN
// ═══════════════════════════════════════════════════════════════════════════════════════════════

test('NADA SE PROMEDIA: el estado es el techo más bajo de las reglas rotas, no un puntaje', () => {
  // Cobertura perfecta (6 reglas verdes) contra un solo conflicto. Un promedio daría «casi
  // cotizable»; acá da REQUIERE_DEFINICION, que es lo único que se puede defender.
  const c = certeza({ ...proyectoDe(diez(), { extra: { conflictos: [{ que: 'x', porQue: 'y' }] } }), hoy: HOY })
  assert.equal(c.reglas.filter((g) => g.pasa).length, REGLAS.length - 1)
  assert.equal(c.estado, CERTEZA.REQUIERE_DEFINICION)
})

test('CADA REGLA DICE QUÉ EXIGE, QUÉ TECHO PONE Y QUÉ FALTA — una regla sin eso es un rótulo', () => {
  const m = metricas({ control: {}, hoy: HOY })
  for (const r of REGLAS) {
    assert.ok(r.clave && r.exige && r.tope, `${r.clave} está incompleta`)
    assert.equal(typeof r.pasa, 'function')
    assert.ok(String(r.falta(m)).length > 20, `${r.clave} no dice qué falta`)
  }
  assert.ok(UMBRAL.cantidades >= 0.9, 'el umbral no se afloja para que un proyecto pase')
})

test('QUEFALTA LISTA TODAS LAS REGLAS ROTAS, no sólo la que decidió el estado', () => {
  const items = diez()
  items[0] = sinMedir('C0')
  items[1] = sinMedir('C1')
  const c = certeza({ ...proyectoDe(items, { extra: { conflictos: [{ que: 'x', porQue: 'y' }] } }), hoy: HOY })
  assert.equal(c.estado, CERTEZA.INCOMPLETO)
  assert.ok(c.queFalta.some((f) => f.regla === 'conflictos'), 'el conflicto sigue listado aunque no sea el que frena este escalón')
  assert.ok(c.paraSubir.falta.every((f) => !/conflicto/.test(f)), 'pero no se mezcla con lo que destraba el escalón siguiente')
})

test('DOS CORRIDAS SOBRE LA MISMA COTIZACIÓN DAN EXACTAMENTE LO MISMO', () => {
  const p = proyectoDe(diez())
  assert.deepEqual(certeza({ ...p, hoy: HOY }), certeza({ ...p, hoy: HOY }))
})
