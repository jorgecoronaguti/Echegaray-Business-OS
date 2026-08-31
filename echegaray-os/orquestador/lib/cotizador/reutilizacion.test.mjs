// LA OBRA TERMINADA TIENE QUE MEJORAR LA PRÓXIMA COTIZACIÓN (§19 · §20).
//
// Sin este eslabón el circuito de aprendizaje es un archivo: observa, compara, promueve — y nadie
// lo lee nunca. «Aprender» y «guardar» se distinguen exactamente acá.
//
// Lo que se prueba no es que el número baje, sino que:
//   · sólo entra lo ACTIVADO por la gobernanza (un candidato no es una norma);
//   · el costo y las HH se mueven JUNTOS (pisar sólo las horas deja una partida que declara 200 h
//     y cobra por 260);
//   · queda escrito de dónde salió el rendimiento, partida por partida.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { correr, etapa } from './orquestador.mjs'
import { politicaComercial } from './comercial.mjs'
import { observacionDePrecio, TIPO_RECURSO } from './precios.mjs'
import { entradaDeAlcance, ALCANCE } from './alcance.mjs'

const HOY = new Date('2026-08-30T12:00:00Z')

const POLITICA = politicaComercial({
  fuente: 'Planilla para Cotizar (2).xlsm', pctGastosGenerales: 0.27, pctBeneficio: 0.22,
  pctFinanciero: 0.07, factorFinanciero: 0.5, pctIibb: 0.024, pctGanancias: 0.02,
  pctCheque: 0.012, pctIva: 0.21,
})

/** Dos horas de oficial por m² es lo que dice el análisis del catálogo. */
const COMPOSICION = [
  { recursoCodigo: 'MAT-LAD', nombre: 'Ladrillón', tipo: TIPO_RECURSO.MATERIAL, cantidad: 45, unidad: 'un' },
  { recursoCodigo: 'MO-OF', nombre: 'Oficial albañil', tipo: TIPO_RECURSO.MANO_OBRA, cantidad: 2, unidad: 'hs' },
]

const ENTRADA = (extra = {}) => ({
  cliente: 'ZZ REUSO', clientesConocidos: ['ZZ REUSO'],
  documentos: [{ hash: 'sha-1', nombre: 'Plano.pdf', parseado: true }],
  elementos: [{ id: 'M1' }],
  partidas: [{ codigo: 'T4010', descripcion: 'MAMPOSTERIA LADRILLON e=0,20', rubro: 'MAMPOSTERÍA', unidad: 'M2', cantidad: 100, tareaTipoId: 'u-4010' }],
  composiciones: new Map([['u-4010', COMPOSICION]]),
  observaciones: [
    observacionDePrecio({ recursoCodigo: 'MAT-LAD', precio: 950, fuente: 'lista 08/2026', observadoEn: '2026-08-20' }),
    observacionDePrecio({ recursoCodigo: 'MO-OF', precio: 4200, fuente: 'convenio UOCRA Zona A', observadoEn: '2026-08-20' }),
  ],
  alcance: [entradaDeAlcance({ patron: 'mamposteria', estado: ALCANCE.INCLUIDO, fuente: 'pliego art. 3.1' })],
  politica: POLITICA, hoy: HOY,
  ...extra,
})

const hhDe = (r) => r.costoDirecto.hh
const costoDe = (r) => r.costoDirecto.total

test('sin aprendizaje activo, el motor cotiza con el análisis del catálogo', () => {
  const r = correr(ENTRADA())
  assert.equal(hhDe(r), 200) // 100 m² × 2 hs
  assert.equal(etapa(r, 'COST').result.reutilizanAprendizaje, 0)
  assert.equal(etapa(r, 'COST').result.aprendizajesDisponibles, 0)
})

test('un rendimiento APRENDIDO reemplaza al del catálogo, y se dice de dónde salió', () => {
  // MUTACIÓN CORRIDA: devolver `lineas` sin escalar en `conAprendizaje` → este test en rojo.
  const r = correr(ENTRADA({ aprendizajesActivos: new Map([['rendimiento.T4010', 1.6]]) }))
  assert.equal(hhDe(r), 160) // 100 m² × 1,6 hs medidas en obra
  const cost = etapa(r, 'COST')
  assert.equal(cost.result.reutilizanAprendizaje, 1)
  assert.match(cost.provenance[0], /T4010: rendimiento aprendido 1\.6 en vez de 2 del análisis/)
})

test('el costo y las HH se mueven JUNTOS — no se pisa una sin la otra', () => {
  // Es el defecto que este diseño evita: si sólo se corrigieran las horas, la partida declararía
  // 160 h y seguiría cobrando 200 × $4.200. La mano de obra tiene que bajar en la misma proporción.
  const base = correr(ENTRADA())
  const conAprendizaje = correr(ENTRADA({ aprendizajesActivos: new Map([['rendimiento.T4010', 1.6]]) }))
  const bajaHoras = hhDe(base) - hhDe(conAprendizaje)          // 40 h
  const bajaCosto = costoDe(base) - costoDe(conAprendizaje)
  assert.equal(bajaHoras, 40)
  assert.equal(Math.round(bajaCosto), 40 * 4200)
})

test('un rendimiento aprendido PEOR que el del catálogo también entra — no se elige el más lindo', () => {
  // La trampa cómoda sería aplicar el aprendizaje sólo cuando baja el costo. Eso no es aprender:
  // es maquillar. Si la obra real rindió peor, la próxima cotización tiene que ser más cara.
  const r = correr(ENTRADA({ aprendizajesActivos: new Map([['rendimiento.T4010', 3]]) }))
  assert.equal(hhDe(r), 300)
  assert.ok(costoDe(r) > costoDe(correr(ENTRADA())))
})

test('un aprendizaje de OTRA partida no toca ésta', () => {
  const r = correr(ENTRADA({ aprendizajesActivos: new Map([['rendimiento.T9999', 0.1]]) }))
  assert.equal(hhDe(r), 200)
  assert.equal(etapa(r, 'COST').result.reutilizanAprendizaje, 0)
  // Pero el motor SÍ declara que tenía uno disponible: que no aplicara no es que no existiera.
  assert.equal(etapa(r, 'COST').result.aprendizajesDisponibles, 1)
})

test('un rendimiento aprendido de cero, negativo o nulo NO se aplica', () => {
  // `0` no es «no lleva mano de obra»: es un dato imposible. Aplicarlo daría productividad infinita
  // y un costo de obra sin una sola hora — el mismo agujero que `NULL ≠ 0`, por otra puerta.
  for (const malo of [0, -1, null, undefined, NaN, 'mucho']) {
    const r = correr(ENTRADA({ aprendizajesActivos: new Map([['rendimiento.T4010', malo]]) }))
    assert.equal(hhDe(r), 200, `se aplicó un rendimiento inválido: ${String(malo)}`)
  }
})

test('una partida SIN mano de obra en su análisis no se escala contra cero', () => {
  // El cociente aprendido/original con original en 0 es Infinity, no un rendimiento. La partida
  // sigue como está y no se cuenta como reutilizada.
  const soloMaterial = [{ recursoCodigo: 'MAT-LAD', nombre: 'Ladrillón', tipo: TIPO_RECURSO.MATERIAL, cantidad: 45, unidad: 'un' }]
  const r = correr(ENTRADA({
    composiciones: new Map([['u-4010', soloMaterial]]),
    aprendizajesActivos: new Map([['rendimiento.T4010', 1.6]]),
  }))
  assert.equal(etapa(r, 'COST').result.reutilizanAprendizaje, 0)
  assert.ok(Number.isFinite(costoDe(r)))
})

test('la reutilización es reproducible: dos corridas iguales dan la misma huella', () => {
  const e = ENTRADA({ aprendizajesActivos: new Map([['rendimiento.T4010', 1.6]]) })
  assert.equal(correr(e).huella.sha256, correr(e).huella.sha256)
})
