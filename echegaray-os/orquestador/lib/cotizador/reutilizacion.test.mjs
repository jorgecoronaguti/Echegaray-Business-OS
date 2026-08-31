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

// ══════════════════════════════════════════════════════════════════════════════════════════════
// LOS DOS AGUJEROS QUE ENCONTRÓ LA AUDITORÍA ADVERSARIAL
// ══════════════════════════════════════════════════════════════════════════════════════════════

test('F1 · un renglón de mano de obra SIN CANTIDAD no se escala a cero, y el gate sigue cerrado', () => {
  // El defecto, textual del auditor: `Number(null ?? 0)` convertía en CERO la cantidad DESCONOCIDA
  // de un ayudante. `costo.mjs` bloquea sobre `null` y no sobre `0` porque 0 es finito, así que el
  // FALTA_DATO desaparecía y una cotización NO AFIRMABLE pasaba a congelable y ofertable:
  //   sin aprendizaje → costoDirecto null · gate.ready false
  //   con aprendizaje → costoDirecto 4.947.000 · gate.ready TRUE · venta $8.320.695
  // Aplicar un aprendizaje llegaba a DESBLOQUEAR un presupuesto. Es lo contrario de lo que un
  // aprendizaje puede hacer.
  //
  // MUTACIÓN CORRIDA: volver a `Number(l.cantidad ?? 0)` y sacar la guarda `sinMedir`.
  const conAyudanteSinMedir = [
    { recursoCodigo: 'MAT-LAD', nombre: 'Ladrillón', tipo: TIPO_RECURSO.MATERIAL, cantidad: 45, unidad: 'un' },
    { recursoCodigo: 'MO-OF', nombre: 'Oficial albañil', tipo: TIPO_RECURSO.MANO_OBRA, cantidad: 2, unidad: 'hs' },
    { recursoCodigo: 'MO-AY', nombre: 'Ayudante', tipo: TIPO_RECURSO.MANO_OBRA, cantidad: null, unidad: 'hs' },
  ]
  // El ayudante lleva precio: así lo ÚNICO que puede bloquear es su cantidad sin medir, y el test
  // no pasa por la razón equivocada. (En la primera versión no lo tenía y el `total: null` venía de
  // un SIN_PRECIO — verde por casualidad, que es la forma más cara de estar verde.)
  const entrada = (extra) => ENTRADA({
    composiciones: new Map([['u-4010', conAyudanteSinMedir]]),
    observaciones: [
      observacionDePrecio({ recursoCodigo: 'MAT-LAD', precio: 950, fuente: 'lista 08/2026', observadoEn: '2026-08-20' }),
      observacionDePrecio({ recursoCodigo: 'MO-OF', precio: 4200, fuente: 'convenio UOCRA Zona A', observadoEn: '2026-08-20' }),
      observacionDePrecio({ recursoCodigo: 'MO-AY', precio: 3600, fuente: 'convenio UOCRA Zona A', observadoEn: '2026-08-20' }),
    ],
    ...extra,
  })

  const sin = correr(entrada())
  const con = correr(entrada({ aprendizajesActivos: new Map([['rendimiento.T4010', 1.6]]) }))

  // Lo que el aprendizaje NO puede hacer: cambiar un «no se puede afirmar» por un número.
  assert.equal(sin.costoDirecto.total, null)
  assert.equal(sin.gate.ready, false)
  assert.equal(con.costoDirecto.total, null, 'el aprendizaje afirmó un costo que sin él era desconocido')
  assert.equal(con.gate.ready, false, 'aplicar un aprendizaje ABRIÓ el gate de congelado')
  assert.equal(con.costoDirecto.hh, null)

  // Y no se aplica en silencio: la partida queda declarada con su motivo.
  const cost = etapa(con, 'COST')
  assert.equal(cost.result.reutilizanAprendizaje, 0)
  assert.equal(cost.result.aprendizajesNoAplicados, 1)
  assert.match(cost.provenance.join(' '), /NO se aplicó el aprendizaje — 1 renglón\(es\) de mano de obra sin cantidad/)
})

test('F2 · cambiar el aprendizaje CAMBIA la huella de entradas', () => {
  // La otra mitad de §39, y la que faltaba. `correr(e).huella === correr(e).huella` sobre el MISMO
  // objeto es una tautología —el propio `freeze.mjs` lo dice—; lo que prueba algo es que dos
  // entradas distintas no puedan firmarse igual. Medido por el auditor: tres corridas con costos
  // null / $4.947.000 / $5.535.000 llevaban la misma huella.
  //
  // MUTACIÓN CORRIDA: sacar `aprendizajes` de `huellaDeEntradas` → este test en rojo.
  const sin = correr(ENTRADA()).huella.sha256
  const con16 = correr(ENTRADA({ aprendizajesActivos: new Map([['rendimiento.T4010', 1.6]]) })).huella.sha256
  const con30 = correr(ENTRADA({ aprendizajesActivos: new Map([['rendimiento.T4010', 3]]) })).huella.sha256
  assert.equal(new Set([sin, con16, con30]).size, 3, 'tres corridas con resultados distintos firmaron igual')
})

test('F2 · y el resultado también las distingue — no alcanza con que difiera la entrada', () => {
  const con16 = correr(ENTRADA({ aprendizajesActivos: new Map([['rendimiento.T4010', 1.6]]) }))
  const con30 = correr(ENTRADA({ aprendizajesActivos: new Map([['rendimiento.T4010', 3]]) }))
  assert.notEqual(con16.costoDirecto.total, con30.costoDirecto.total)
  assert.notEqual(con16.huellaResultado?.sha256 ?? con16.costoDirecto.total, con30.huellaResultado?.sha256 ?? con30.costoDirecto.total)
})

test('P2-R1 · la cadena vacía y los espacios TAMPOCO son una cantidad medida', () => {
  // El auditor reabrió F1 entero con `cantidad: ''`: `Number('')` es **0**, y 0 es finito, así que
  // la guarda escrita a mano lo dejaba pasar mientras `costo.mjs` sí lo listaba. Dos definiciones
  // del mismo predicado, y ganaba la laxa. Ahora hay una sola, en `costo.mjs`, y ésta la usa.
  //
  // MUTACIÓN CORRIDA: en `sinMedir`, sacar la rama de string vacío → este test en rojo.
  for (const vacia of ['', '  ', '\t']) {
    const comp = [
      { recursoCodigo: 'MAT-LAD', nombre: 'Ladrillón', tipo: TIPO_RECURSO.MATERIAL, cantidad: 45, unidad: 'un' },
      { recursoCodigo: 'MO-OF', nombre: 'Oficial albañil', tipo: TIPO_RECURSO.MANO_OBRA, cantidad: 2, unidad: 'hs' },
      { recursoCodigo: 'MO-AY', nombre: 'Ayudante', tipo: TIPO_RECURSO.MANO_OBRA, cantidad: vacia, unidad: 'hs' },
    ]
    const r = correr(ENTRADA({
      composiciones: new Map([['u-4010', comp]]),
      observaciones: [
        observacionDePrecio({ recursoCodigo: 'MAT-LAD', precio: 950, fuente: 'lista', observadoEn: '2026-08-20' }),
        observacionDePrecio({ recursoCodigo: 'MO-OF', precio: 4200, fuente: 'convenio', observadoEn: '2026-08-20' }),
        observacionDePrecio({ recursoCodigo: 'MO-AY', precio: 3600, fuente: 'convenio', observadoEn: '2026-08-20' }),
      ],
      aprendizajesActivos: new Map([['rendimiento.T4010', 1.6]]),
    }))
    assert.equal(r.costoDirecto.total, null, `con cantidad ${JSON.stringify(vacia)} el aprendizaje afirmó un costo desconocido`)
    assert.equal(r.gate.ready, false)
    assert.equal(etapa(r, 'COST').result.aprendizajesNoAplicados, 1)
  }
})

// ══════════════════════════════════════════════════════════════════════════════════════════════
// EL INVARIANTE, GENERALIZADO — un aprendizaje NUNCA desbloquea un presupuesto
// ══════════════════════════════════════════════════════════════════════════════════════════════
//
// F1 probaba el invariante para UNA causa de bloqueo: el renglón de mano de obra sin medir. Pero el
// invariante no es sobre esa causa, es sobre el aprendizaje: aplicar experiencia de obras terminadas
// puede hacer una cotización más cara, más barata o igual — nunca puede convertir un «no se puede
// afirmar» en un número, ni abrir un gate que estaba cerrado.
//
// El bug original tenía esa forma exacta: un `?? 0` hacía desaparecer un FALTA_DATO y una cotización
// que no se podía afirmar quedaba congelable en $4.947.000 con `gate.ready: true`. Si mañana el
// escalado toca otra cosa —el material, la cantidad de la partida, el desperdicio— el agujero vuelve
// por otra puerta y F1 sigue verde. Este test recorre las causas de bloqueo una por una.

import { sinMedir } from './costo.mjs'

/** Las causas por las que una cotización NO se puede afirmar, cada una con su entrada. */
const BLOQUEOS = [
  ['un renglón de mano de obra sin cantidad', {
    composiciones: new Map([['u-4010', [
      { recursoCodigo: 'MAT-LAD', nombre: 'Ladrillón', tipo: TIPO_RECURSO.MATERIAL, cantidad: 45, unidad: 'un' },
      { recursoCodigo: 'MO-OF', nombre: 'Oficial', tipo: TIPO_RECURSO.MANO_OBRA, cantidad: 2, unidad: 'hs' },
      { recursoCodigo: 'MO-AY', nombre: 'Ayudante', tipo: TIPO_RECURSO.MANO_OBRA, cantidad: null, unidad: 'hs' },
    ]]]),
  }],
  ['un renglón de MATERIAL sin cantidad', {
    composiciones: new Map([['u-4010', [
      { recursoCodigo: 'MAT-LAD', nombre: 'Ladrillón', tipo: TIPO_RECURSO.MATERIAL, cantidad: null, unidad: 'un' },
      { recursoCodigo: 'MO-OF', nombre: 'Oficial', tipo: TIPO_RECURSO.MANO_OBRA, cantidad: 2, unidad: 'hs' },
    ]]]),
  }],
  ['un recurso SIN PRECIO', {
    observaciones: [observacionDePrecio({ recursoCodigo: 'MAT-LAD', precio: 950, fuente: 'lista', observadoEn: '2026-08-20' })],
  }],
  ['la partida SIN CANTIDAD computada', {
    partidas: [{ codigo: 'T4010', descripcion: 'MAMPOSTERIA LADRILLON e=0,20', rubro: 'MAMPOSTERÍA', unidad: 'M2', cantidad: null, tareaTipoId: 'u-4010' }],
  }],
  ['la partida SIN COMPOSICIÓN', { composiciones: new Map() }],
]

test('INVARIANTE · aplicar un aprendizaje NUNCA convierte un costo desconocido en un número', () => {
  for (const [causa, entrada] of BLOQUEOS) {
    const sin = correr(ENTRADA(entrada))
    const con = correr(ENTRADA({ ...entrada, aprendizajesActivos: new Map([['rendimiento.T4010', 1.6]]) }))
    assert.equal(sin.costoDirecto.total, null, `el fixture «${causa}» tiene que bloquear SIN aprendizaje, o no prueba nada`)
    assert.equal(con.costoDirecto.total, null, `«${causa}»: el aprendizaje afirmó un costo que sin él era desconocido`)
    assert.equal(con.gate.ready, false, `«${causa}»: aplicar un aprendizaje ABRIÓ el gate de congelado`)
    // Y en la dirección permitida: un aprendizaje SÍ puede cerrar un gate que estaba abierto —
    // encarecer una obra hasta sacarla del margen es un resultado legítimo—, pero nunca al revés.
  }
})

test('INVARIANTE · el gate nunca pasa de cerrado a abierto por un aprendizaje, para NINGÚN rendimiento', () => {
  // Barrido sobre el rango de rendimientos plausibles: de 10× mejor a 10× peor que el análisis.
  const entrada = BLOQUEOS[0][1]
  for (const rendimiento of [0.2, 0.5, 1, 1.6, 2, 2.0001, 5, 20]) {
    const con = correr(ENTRADA({ ...entrada, aprendizajesActivos: new Map([['rendimiento.T4010', rendimiento]]) }))
    assert.equal(con.gate.ready, false, `con rendimiento ${rendimiento} el gate se abrió`)
    assert.equal(con.costoDirecto.total, null, `con rendimiento ${rendimiento} el costo se afirmó`)
  }
})

test('sinMedir · el predicado vive en UN solo lugar y sigue diciendo que no', () => {
  // El P2-R1 nació de tener dos definiciones del mismo predicado y que ganara la laxa. La guarda
  // está exportada de `costo.mjs` justamente para que no se pueda volver a escribir a mano.
  // Lo que NO es una cantidad medida:
  for (const v of [null, undefined, '', '  ', '\t', NaN, 'mucho', {}]) {
    assert.equal(sinMedir(v), true, `${JSON.stringify(v)} se tomó como una cantidad medida`)
  }
  // Lo que SÍ lo es. El 0 está adentro a propósito: «esta partida no lleva ayudante» es un dato.
  for (const v of [0, '0', 1, 2.5, '2.5', -1]) {
    assert.equal(sinMedir(v), false, `${JSON.stringify(v)} se tomó como sin medir`)
  }
  // MUTACIÓN CORRIDA: en `costo.mjs::sinMedir`, sacar la rama del string vacío —
  //   `!Number.isFinite(Number(v))` a secas—. FALLA: «"" se tomó como una cantidad medida:
  //   false !== true», porque `Number('')` es 0 y 0 es finito. Es el bug que P2-R1 reabrió.
})
