import test from 'node:test'
import assert from 'node:assert/strict'
import {
  analizarFila, cantidadEjecutadaDe, diasEntre, aprender, OBRAS_NO_REALES,
  aprenderDuracion, desvioDuracion, confianzaDuracion,
} from './xsas-aprendizaje.mjs'

// Una fila como la devuelve `public.xsas_actividad`, que ahora LEE de `obra_actividad_control`. Los
// numéricos vienen como STRING desde Postgres: es el modo de falla que más veces rompió este repo.
const fila = (x = {}) => ({
  actividad_id: 'a1', obra_id: 'quattropani', obra: 'Salón Comercial', cliente: 'Q',
  actividad: 'REPLANTEO', tarea: 'REPLANTEO', tarea_tipo_id: 't1', unidad: 'm2',
  plan_cantidad: '258.77', plan_hh: '31.0524', plan_dias: null, plan_dotacion: null,
  cantidad_real: '258.77', avance_pct: '100', origen_avance: 'cantidad', terminada: true,
  hh_real: '30.00', hh_improductivas: '0', hh_productivas: '30.00', n_imputaciones: 1,
  dotacion_real: 1, presupuesto_hs_unitarias: '0.12', n_partes: 1,
  inicio_real: '2026-08-19', fin_real: '2026-08-22', dias_real: 4,
  origen_inicio_real: 'imputación de HH', origen_fin_real: 'parte de avance',
  ultimo_parte: '2026-08-22', ...x,
})

test('los numéricos que Postgres devuelve como texto se calculan igual', () => {
  const o = analizarFila(fila())
  assert.equal(o.plan.hsUnitarias.toFixed(4), '0.1200')
  assert.equal(o.real.hsUnitarias.toFixed(4), '0.1159')
  assert.equal(o.avancePct, 100)
  assert.equal(o.aprendible, true)
})

test('el avance y las fechas se LEEN de la vista, no se recalculan acá', () => {
  // El día que este módulo volvió a decidirlo por su cuenta publicó «ninguna actividad tiene fecha
  // real» mientras el sistema tenía 152.
  const o = analizarFila(fila({ avance_pct: '43', terminada: false, fin_real: null }))
  assert.equal(o.avancePct, 43)
  assert.equal(o.inicioReal, '2026-08-19')
  assert.equal(o.finReal, null)
  assert.equal(o.origenInicioReal, 'imputación de HH')
})

test('terminada manda sobre el porcentaje para la confianza', () => {
  assert.equal(analizarFila(fila({ avance_pct: '96', terminada: false })).confianza, 'media')
  assert.equal(analizarFila(fila({ avance_pct: '100', terminada: true })).confianza, 'alta')
})

test('una actividad parcial NO aprende como terminada', () => {
  const o = analizarFila(fila({ avance_pct: '43', terminada: false, fin_real: null, cantidad_real: '20', hh_real: '10' }))
  assert.equal(o.confianza, 'baja')
  assert.equal(o.terminada, false)
  assert.equal(o.finReal, null)
})

// ── LA CANTIDAD QUE SE PUEDE DEMOSTRAR ───────────────────────────────────────────────────────

test('terminada sin cantidad cargada: lo ejecutado es el objetivo, y queda marcado como derivado', () => {
  const r = cantidadEjecutadaDe({ cantidad_real: null, plan_cantidad: '120', terminada: true })
  assert.equal(r.cantidad, 120)
  assert.equal(r.derivada, true)
  assert.match(r.porQue, /terminada/)
})

test('un 60% de avance NO son 60% de los metros: eso sería inventar la medición', () => {
  const r = cantidadEjecutadaDe({ cantidad_real: null, plan_cantidad: '120', terminada: false, avance_pct: '60' })
  assert.equal(r.cantidad, null)
  assert.equal(r.derivada, false)
})

test('la cantidad cargada le gana siempre a la derivada', () => {
  const r = cantidadEjecutadaDe({ cantidad_real: '95', plan_cantidad: '120', terminada: true })
  assert.equal(r.cantidad, 95)
  assert.equal(r.derivada, false)
})

test('la derivación viaja en la evidencia, no escondida en el número', async () => {
  const escrituras = []
  const query = async (sql, params) => {
    if (/from public\.xsas_actividad/.test(sql)) {
      return { rows: [fila({ cantidad_real: null, plan_cantidad: '10', plan_hh: '20', hh_real: '18', terminada: true, avance_pct: '100' })] }
    }
    escrituras.push({ sql, params })
    return { rows: [] }
  }
  const r = await aprender({ query })
  const ev = JSON.parse(escrituras.find((e) => /insert into public.rendimiento_historico/.test(e.sql)).params.find((p) => typeof p === 'string' && p.startsWith('{')))
  assert.equal(ev.cantidad_derivada, true)
  assert.match(ev.cantidad_derivada_porque, /terminada/)
  assert.equal(r.aprendidas, 1)
})

// ── LO QUE NO SE PUEDE DEMOSTRAR QUEDA EN NULL ───────────────────────────────────────────────

test('el costo por actividad no existe y se declara: no se rellena con cero', () => {
  const o = analizarFila(fila())
  assert.equal(o.real.costo, null)
  assert.equal(o.derivado.desvioCostoPct, null)
  assert.ok(o.faltantes.some((f) => f.includes('costo')))
})

test('HH faltantes no se convierten en cero', () => {
  const o = analizarFila(fila({ hh_real: null, hh_improductivas: null }))
  assert.equal(o.real.hh, null)
  assert.equal(o.real.hsUnitarias, null)
  assert.equal(o.aprendible, false)
  assert.ok(o.faltantes.includes('HH reales imputadas a la actividad'))
})

test('la duración real sale de las fechas derivadas', () => {
  assert.equal(analizarFila(fila()).real.dias, 4)
  assert.equal(analizarFila(fila({ dias_real: null })).real.dias, null)
  assert.equal(diasEntre('2026-08-01', '2026-08-01'), 1)
  assert.equal(diasEntre(null, '2026-08-05'), null)
})

test('sin plan de obra, el rendimiento con el que se comparó es el del presupuesto', () => {
  const o = analizarFila(fila({ plan_hh: null }))
  assert.equal(o.plan.hsUnitarias, null)
  assert.equal(o.hsUnitariasPlan, 0.12, 'la partida cotizada es el plan que quedó')
})

test('la dotación real la resuelve la vista: personas que imputaron horas, si no las asignadas', () => {
  // La regla se mudó al SQL, pero el módulo la transporta y tiene que seguir haciéndolo.
  assert.equal(analizarFila(fila({ dotacion_real: 3 })).real.dotacion, 3)
  assert.equal(analizarFila(fila({ dotacion_real: null })).real.dotacion, null)
})

// ── UN CIERRE QUE SALIÓ DE UNA SUMA NO ES UN CIERRE MEDIDO ───────────────────────────────────

test('avance armado sumando declarado + partes: ni cantidad inventada ni confianza alta', () => {
  // «Armado armadura de VF» tiene 75 declarado + 75 de partes y la canónica publica 100.
  const r = cantidadEjecutadaDe({ cantidad_real: null, plan_cantidad: '120', terminada: true, avance_sumado: true })
  assert.equal(r.cantidad, null, 'le inventó la cantidad objetivo a una actividad al 75%')
  assert.equal(analizarFila(fila({ avance_sumado: true })).confianza, 'media')
})

test('terminada con MENOS cantidad que la objetivo no llega a confianza alta', () => {
  // O el objetivo cambió o la medición está incompleta: en los dos casos el rendimiento sale alto.
  assert.equal(analizarFila(fila({ cantidad_real: '200', plan_cantidad: '258.77' })).confianza, 'media')
})

test('la obra de pruebas no puede enseñarle nada al OS', async () => {
  const vistas = []
  const query = async (sql, params) => { vistas.push({ sql, params }); return { rows: [] } }
  const r = await aprender({ query }, { dry: true })
  assert.equal(r.aprendidas, 0)
  assert.deepEqual(vistas[0].params, [OBRAS_NO_REALES, null], 'la obra de fixture se excluye siempre; el filtro de obras va en null en producción')
  assert.match(vistas[0].sql, /obra_id <> all/)
})

test('sin tipo de tarea el rendimiento no se guarda, y el hueco se cuenta', async () => {
  const query = async (sql) => {
    if (/from public\.xsas_actividad/.test(sql)) return { rows: [fila({ tarea_tipo_id: null })] }
    return { rows: [] }
  }
  const r = await aprender({ query }, { dry: true })
  assert.equal(r.aprendidas, 0, 'no se puede reutilizar en otra obra un rendimiento sin tarea')
  assert.equal(r.sinTipoDeTarea, 1, 'pero el hueco se ve')
})

test('un parte duplicado no duplica el rendimiento: la clave es la actividad', async () => {
  const escrituras = []
  const query = async (sql, params) => {
    if (/from public\.xsas_actividad/.test(sql)) return { rows: [fila(), fila()] }
    escrituras.push({ sql, params }); return { rows: [] }
  }
  await aprender({ query })
  const ins = escrituras.filter((e) => /insert into public\.rendimiento_historico/.test(e.sql))
  assert.equal(ins.length, 2, 'se intenta escribir las dos')
  assert.match(ins[0].sql, /on conflict \(actividad_id\)/, 'y la base deja una sola')
  // LA CLAVE, buscada por su forma y no por su posición. `params.at(-1)` era `cuadrilla_id` —null en
  // las dos filas— así que el assert pasaba aunque la clave llevara un timestamp, que es el defecto
  // exacto que este test dice cuidar.
  const claveDe = (p) => p.find((x) => typeof x === 'string' && x.startsWith('plan-real:'))
  assert.ok(claveDe(ins[0].params), 'no encontré la clave entre los parámetros')
  assert.equal(claveDe(ins[0].params), claveDe(ins[1].params), 'misma clave')
  assert.match(claveDe(ins[0].params), /^plan-real:[^:]+$/, 'la clave lleva algo más que la actividad')
})

// ═══ DURACIÓN — LA OTRA MÉTRICA, QUE NO NECESITA UNA SOLA HORA IMPUTADA ═══

test('el desvío de duración es relativo al plan, y sin plan no existe', () => {
  assert.equal(desvioDuracion(10, 15), 50)
  assert.equal(desvioDuracion(10, 5), -50)
  assert.equal(desvioDuracion(null, 5), null)
  assert.equal(desvioDuracion(0, 5), null, 'no se divide por un plan de cero días')
})

test('la confianza de la duración exige fechas reales y un cierre que no salió de una suma', () => {
  const base = { terminada: true, inicioReal: '2026-08-01', finReal: '2026-08-05' }
  assert.equal(confianzaDuracion(base), 'alta')
  assert.equal(confianzaDuracion({ ...base, avanceSumado: true }), 'media')
  assert.equal(confianzaDuracion({ ...base, finReal: null }), 'baja')
  assert.equal(confianzaDuracion({ ...base, terminada: false }), 'baja')
})

test('el hecho de duración se guarda aunque la actividad no tenga tipo — pero nunca VALIDA', async () => {
  const escrituras = []
  const query = async (sql, params) => {
    if (/from public\.xsas_actividad/.test(sql)) {
      return { rows: [{
        actividad_id: 'a1', obra_id: 'le-galpon-9', actividad: 'ARMADO DE PLATINA',
        tarea_tipo_id: null, plan_dias: '1', dias_real: '3', terminada: true,
        inicio_plan: '2026-07-01', fin_plan: '2026-07-01', inicio_real: '2026-07-14', fin_real: '2026-07-16',
        avance_sumado: false, dotacion_real: 2,
      }] }
    }
    escrituras.push({ sql, params }); return { rows: [] }
  }
  const r = await aprenderDuracion({ query })
  assert.equal(r.medidas, 1)
  assert.equal(r.validadas, 0, 'sin tipo de tarea no hay con qué comparar entre obras')
  assert.equal(r.sinTipo, 1)
  assert.equal(r.tardaronMas, 1)
  const ins = escrituras.find((e) => /insert into public\.duracion_historica/.test(e.sql))
  assert.ok(ins, 'el hecho no se guardó')
  assert.match(ins.sql, /on conflict \(clave\)/, 'sin clave estable, cada corrida crearía un caso nuevo')
  const ev = JSON.parse(ins.params.find((p) => typeof p === 'string' && p.startsWith('{')))
  assert.equal(ev.sin_tipo_de_tarea, true)
})

test('la duración sólo VALIDA con otra OBRA que tenga la misma tarea', async () => {
  const fila = (obra) => ({
    actividad_id: 'a-' + obra, obra_id: obra, actividad: 'REPLANTEO', tarea_tipo_id: 't1',
    plan_dias: '2', dias_real: '2', terminada: true,
    inicio_plan: '2026-07-01', fin_plan: '2026-07-02', inicio_real: '2026-07-01', fin_real: '2026-07-02',
    avance_sumado: false, dotacion_real: 1,
  })
  const conPrevio = (obraPrevia) => async (sql) => {
    if (/from public\.xsas_actividad/.test(sql)) return { rows: [fila('obra-nueva')] }
    if (/from public\.duracion_historica/.test(sql)) {
      return { rows: [{ actividad_id: 'x', obra_id: obraPrevia, tarea_tipo_id: 't1', dias_plan: 2, dias_real: 2, confianza: 'alta', estado: 'CANDIDATO' }] }
    }
    return { rows: [] }
  }
  assert.equal((await aprenderDuracion({ query: conPrevio('otra-obra') }, { dry: true })).validadas, 1)
  assert.equal((await aprenderDuracion({ query: conPrevio('obra-nueva') }, { dry: true })).validadas, 0,
    'dos frentes de la misma obra comparten cuadrilla, encargado y clima: no se confirman')
})

// ── LA CAPA FÓSIL DEL RENDIMIENTO ─────────────────────────────────────────────
//
// La auditoría adversarial del 27/08/2026: `aprenderDuracion` retiraba lo que dejaba de calificar y
// `aprender` no. Una actividad que pasa a agrupar a otras deja de ser un trabajo, y su fila de
// rendimiento se quedaba publicando un número que ya no corresponde — en silencio, y visible en
// `rendimiento_recomendado` como si fuera experiencia vigente.

test('lo que dejó de ser trabajo se retira: el número Y la frase', async () => {
  const escrituras = []
  const query = async (sql, params) => {
    escrituras.push({ sql, params })
    if (/update public\.rendimiento_historico/.test(sql)) return { rowCount: 3 }
    if (/update public\.conocimiento_empresa/.test(sql)) return { rowCount: 3 }
    return { rows: [] }
  }
  const r = await aprender({ query })

  const numero = escrituras.find((e) => /update public\.rendimiento_historico/.test(e.sql))
  assert.ok(numero, 'el número no se retira: la fila vieja sigue publicando un rendimiento muerto')
  assert.match(numero.sql, /estado = 'DESCARTADO'/, 'se descarta, no se borra: haberlo medido es historia')
  assert.match(numero.sql, /es_trabajo is false/, 'la condición es dejar de ser trabajo, la misma que duración')

  const frase = escrituras.find((e) => /update public\.conocimiento_empresa/.test(e.sql))
  assert.ok(frase, 'la frase no se retira: el chat seguiría afirmando lo que la base descartó')
  assert.match(frase.sql, /vigente = false/)
  assert.match(frase.sql, /plan-real:/, 'sólo las frases de este circuito, no las de otra fuente')

  assert.equal(r.retiradasPorNoSerTrabajo, 3, 'un retiro que no se cuenta es un retiro que nadie audita')
  assert.equal(r.frasesRetiradas, 3)
})

test('en dry no se retira nada — igual que no se escribe nada', async () => {
  const escrituras = []
  const query = async (sql, params) => { escrituras.push({ sql, params }); return { rows: [] } }
  const r = await aprender({ query }, { dry: true })
  assert.ok(!escrituras.some((e) => /^\s*update public\./m.test(e.sql)), 'un dry que retira no es un dry')
  assert.equal(r.retiradasPorNoSerTrabajo, 0)
  assert.equal(r.frasesRetiradas, 0)
})
