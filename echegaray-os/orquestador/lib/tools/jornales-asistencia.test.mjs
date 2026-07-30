import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  pestanaOperativaPara, leerEstructuraJornales, contextoParaFecha, listarObrasPorFecha,
  listarPersonalPorObraYFecha, planificarAsistencia, registrarAsistencia, claveIdempotencia,
  huellaCelda, dryRun, MOTIVO,
} from './jornales-asistencia.mjs'
import {
  fakeGoogleJornales, idxCol, PESTANAS as TABS,
  FECHA_HOY, FECHA_SABADO, FECHA_DOMINGO, FECHA_INEXISTENTE,
} from '../jornales-fixture.mjs'

const OBRA_JS = 'JAVIER SANCHEZ|REVOQUE'
const OBRA_MESSINAS = 'MESSINAS|BASES DE TANQUE'
const ACTOR = { plataforma_user_id: 'mm-jefe-1' }

const fakeGoogle = fakeGoogleJornales

async function planPara(g, { fecha = FECHA_HOY, claveObra = OBRA_JS, marcas } = {}) {
  const ctx = await contextoParaFecha(g, { fecha })
  const personal = await listarPersonalPorObraYFecha(g, { fecha, claveObra })
  const usar = marcas ?? personal.personal.map((p) => ({ nombre_clave: p.nombre_clave, estado: 'presente' }))
  return { ctx, personal, plan: planificarAsistencia(ctx, { claveObra, marcas: usar, actor: ACTOR }) }
}

test('la pestaña se resuelve por AÑO, no está escrita en el código', () => {
  assert.equal(pestanaOperativaPara(TABS, '2026-07-30'), 'Obreros 26')
  assert.equal(pestanaOperativaPara(TABS, '2025-07-30'), null, 'no hay Obreros 25 → no cae en otra pestaña')
  assert.equal(pestanaOperativaPara(['Obreros 27'], '2027-01-02'), 'Obreros 27')
  assert.equal(pestanaOperativaPara(TABS, '2026-07-30'), 'Obreros 26')
})

test('sin pestaña del año, se declara — no se elige una cualquiera', async () => {
  const g = fakeGoogle({ tabs: ['Oficina 26'] })
  const r = await leerEstructuraJornales(g, { fecha: FECHA_HOY })
  assert.equal(r.ok, false)
  assert.equal(r.motivo, MOTIVO.PESTANA_NO_ENCONTRADA)
})

test('una fecha que NO existe en JORNALES no crea columna: se informa', async () => {
  const g = fakeGoogle()
  const r = await contextoParaFecha(g, { fecha: FECHA_INEXISTENTE })
  assert.equal(r.ok, false)
  assert.equal(r.motivo, MOTIVO.FECHA_NO_EN_JORNALES)
  assert.equal(g.escrituras.length, 0)
})

test('el domingo tampoco existe como columna en el bloque real', async () => {
  const g = fakeGoogle()
  const r = await contextoParaFecha(g, { fecha: FECHA_DOMINGO })
  assert.equal(r.motivo, MOTIVO.FECHA_NO_EN_JORNALES)
})

test('las obras del dropdown salen del bloque de ESA fecha', async () => {
  const g = fakeGoogle()
  const r = await listarObrasPorFecha(g, { fecha: FECHA_HOY })
  assert.equal(r.ok, true)
  assert.deepEqual(r.obras.map((o) => o.clave).sort(), [OBRA_JS, 'LA ESTRELLA|OFICINAS Y FABRICA', OBRA_MESSINAS].sort())
  assert.equal(r.jornada.horas, 9, 'jueves calibrado')
})

test('una obra que no está en el bloque se rechaza con las válidas', async () => {
  const g = fakeGoogle()
  const r = await listarPersonalPorObraYFecha(g, { fecha: FECHA_HOY, claveObra: 'INVENTADA|X' })
  assert.equal(r.ok, false)
  assert.equal(r.motivo, MOTIVO.OBRA_DESCONOCIDA)
  assert.ok(r.obras_validas.includes(OBRA_JS))
})

test('el personal viene con lo que la celda YA tiene cargado', async () => {
  const g = fakeGoogle()
  const js = await listarPersonalPorObraYFecha(g, { fecha: FECHA_HOY, claveObra: OBRA_JS })
  assert.equal(js.personal.length, 3)
  assert.ok(js.personal.every((p) => p.actual.escrita === false), 'hoy está vacío para esta obra')
  const me = await listarPersonalPorObraYFecha(g, { fecha: FECHA_HOY, claveObra: OBRA_MESSINAS })
  const reta = me.personal.find((p) => p.nombre_clave === 'RETA SEBASTIAN')
  assert.equal(reta.actual.horas, 9)
  assert.equal(reta.actual.estado_equivalente, 'presente')
})

test('plan de presentes: 3 celdas nuevas, jornada 9h, nada bloqueado', async () => {
  const { plan } = await planPara(fakeGoogle())
  assert.equal(plan.resumen.presentes, 3)
  assert.equal(plan.resumen.celdas_nuevas, 3)
  assert.equal(plan.resumen.celdas_modificadas, 0)
  assert.equal(plan.resumen.bloqueadas, 0)
  assert.equal(plan.requiere_confirmacion_sobrescritura, false)
  assert.ok(plan.items.every((i) => i.horas_nuevas === 9))
  assert.equal(plan.columna_letra, 'R')
})

test('ausente planifica 0 y parcial planifica las horas dadas', async () => {
  const g = fakeGoogle()
  const { personal } = await planPara(g)
  const [a, b, c] = personal.personal.map((p) => p.nombre_clave)
  const ctx = await contextoParaFecha(g, { fecha: FECHA_HOY })
  const plan = planificarAsistencia(ctx, {
    claveObra: OBRA_JS,
    marcas: [
      { nombre_clave: a, estado: 'presente' },
      { nombre_clave: b, estado: 'ausente' },
      { nombre_clave: c, estado: 'parcial', horas: '5,5' },
    ],
    actor: ACTOR,
  })
  const h = Object.fromEntries(plan.items.map((i) => [i.nombre_clave, i.horas_nuevas]))
  assert.equal(h[a], 9)
  assert.equal(h[b], 0)
  assert.equal(h[c], 5.5)
  assert.equal(plan.resumen.ausentes, 1)
  assert.equal(plan.resumen.parciales, 1)
})

test('una celda con FÓRMULA queda bloqueada: no se pisan las horas extra', async () => {
  const g = fakeGoogle()
  const ctx = await contextoParaFecha(g, { fecha: '2026-07-16' })
  const plan = planificarAsistencia(ctx, {
    claveObra: OBRA_JS,
    marcas: [{ nombre_clave: 'QUIROGA SEBASTIAN', estado: 'presente' }],
    actor: ACTOR,
  })
  assert.equal(plan.items[0].bloqueada, MOTIVO.CELDA_CON_FORMULA)
  assert.equal(plan.items[0].formula_actual, '=8+6')
  assert.equal(plan.escribibles.length, 0)
})

test('una celda con TEXTO no numérico queda bloqueada', async () => {
  const g = fakeGoogle()
  const ctx = await contextoParaFecha(g, { fecha: '2026-07-31' })
  const plan = planificarAsistencia(ctx, {
    claveObra: OBRA_JS, marcas: [{ nombre_clave: 'EMANUEL ALANIZ', estado: 'ausente' }], actor: ACTOR,
  })
  assert.equal(plan.items[0].bloqueada, MOTIVO.TEXTO_NO_NUMERICO)
})

test('presente en SÁBADO se bloquea pidiendo horas (no hay jornada de referencia)', async () => {
  const g = fakeGoogle()
  const ctx = await contextoParaFecha(g, { fecha: FECHA_SABADO })
  const plan = planificarAsistencia(ctx, {
    claveObra: OBRA_JS, marcas: [{ nombre_clave: 'AGUERO CRISTIAN', estado: 'presente' }], actor: ACTOR,
  })
  assert.equal(plan.items[0].bloqueada, 'jornada_requiere_manual')
})

test('un trabajador que no está en la cuadrilla de esa obra se rechaza (nada de nombres libres)', async () => {
  const g = fakeGoogle()
  const ctx = await contextoParaFecha(g, { fecha: FECHA_HOY })
  const plan = planificarAsistencia(ctx, {
    claveObra: OBRA_JS,
    marcas: [{ nombre_clave: 'PASTRAN MARCELO', estado: 'presente' }, { nombre_clave: 'JUAN INVENTADO', estado: 'presente' }],
    actor: ACTOR,
  })
  assert.equal(plan.items.length, 2)
  assert.ok(plan.items.every((i) => i.bloqueada === MOTIVO.TRABAJADOR_NO_EN_BLOQUE))
  assert.equal(plan.escribibles.length, 0)
})

test('celda existente IGUAL → sin_cambio, no se reescribe', async () => {
  const g = fakeGoogle()
  const ctx = await contextoParaFecha(g, { fecha: FECHA_HOY })
  const plan = planificarAsistencia(ctx, {
    claveObra: OBRA_MESSINAS, marcas: [{ nombre_clave: 'RETA SEBASTIAN', estado: 'presente' }], actor: ACTOR,
  })
  assert.equal(plan.items[0].accion, 'sin_cambio')
  assert.equal(plan.resumen.a_escribir, 0)
  const r = await registrarAsistencia(g, { plan })
  assert.equal(r.escritas, 0)
  assert.equal(g.escrituras.length, 0)
})

test('celda existente DISTINTA → modifica y exige confirmación explícita', async () => {
  const g = fakeGoogle()
  const ctx = await contextoParaFecha(g, { fecha: FECHA_HOY })
  const plan = planificarAsistencia(ctx, {
    claveObra: OBRA_MESSINAS, marcas: [{ nombre_clave: 'RETA SEBASTIAN', estado: 'ausente' }], actor: ACTOR,
  })
  assert.equal(plan.items[0].accion, 'modifica')
  assert.equal(plan.items[0].horas_actuales, 9)
  assert.equal(plan.items[0].horas_nuevas, 0)
  assert.equal(plan.requiere_confirmacion_sobrescritura, true)

  const sin = await registrarAsistencia(g, { plan })
  assert.equal(sin.ok, false)
  assert.equal(sin.motivo, 'sobrescritura_no_confirmada')
  assert.equal(g.escrituras.length, 0, 'no escribió nada sin confirmación')

  const con = await registrarAsistencia(g, { plan, confirmarSobrescritura: true })
  assert.equal(con.ok, true)
  assert.equal(con.celdas[0].old_value, '9')
  assert.equal(con.celdas[0].new_value, 0)
})

test('la escritura es UNA sola operación batch con todas las celdas', async () => {
  const g = fakeGoogle()
  const { plan } = await planPara(g)
  const r = await registrarAsistencia(g, { plan })
  assert.equal(r.ok, true)
  assert.equal(r.escritas, 3)
  assert.equal(g.escrituras.length, 1, 'una llamada, no una por trabajador')
  assert.equal(g.escrituras[0].data.length, 3)
  assert.deepEqual(g.escrituras[0].data.map((d) => d.range).sort(), [
    "'Obreros 26'!R21", "'Obreros 26'!R22", "'Obreros 26'!R23",
  ])
})

test('escribe NÚMEROS, no texto ni letras de asistencia', async () => {
  const g = fakeGoogle()
  const { plan } = await planPara(g)
  await registrarAsistencia(g, { plan })
  for (const d of g.escrituras[0].data) {
    assert.equal(typeof d.values[0][0], 'number', 'nunca "P", "X", "Sí"')
  }
})

test('sólo se toca la celda del día: ninguna otra columna ni fila entra en el batch', async () => {
  const g = fakeGoogle()
  const { plan } = await planPara(g)
  await registrarAsistencia(g, { plan })
  const rangos = g.escrituras[0].data.map((d) => d.range)
  assert.ok(rangos.every((r) => /!R\d+$/.test(r)), 'todas en la columna R (30/7)')
  assert.ok(rangos.every((r) => r.startsWith("'Obreros 26'!")), 'ninguna otra pestaña')
})

test('CONFLICTO concurrente: si la celda cambió tras planificar, no escribe nada', async () => {
  let mutado = false
  const g = fakeGoogle({
    alLeer(grid, n) {
      // en la relectura previa a la escritura, alguien cargó la celda a mano
      if (n >= 3 && !mutado) {
        mutado = true
        grid.filas[20][idxCol('R')] = { valor: '8', numero: 8, formula: null }
      }
    },
  })
  const { plan } = await planPara(g)
  const r = await registrarAsistencia(g, { plan })
  assert.equal(r.ok, false)
  assert.equal(r.motivo, MOTIVO.CONFLICTO_CONCURRENCIA)
  assert.equal(r.escritas, 0)
  assert.equal(g.escrituras.length, 0, 'ni las celdas sanas se escriben: la operación es atómica')
  const c = r.conflictos[0]
  assert.equal(c.valor_al_planificar, null)
  assert.equal(c.valor_ahora, '8')
})

test('la huella incluye la fórmula: pasar de 8 a =8 es un cambio real', () => {
  assert.notEqual(huellaCelda({ valor: '8', formula: null }), huellaCelda({ valor: '8', formula: '=8' }))
})

test('la huella es guardable en jsonb: sin byte NUL ni caracteres de control', () => {
  // El plan (con las huellas) se persiste como jsonb en la sesión, y Postgres RECHAZA el
  // byte NUL dentro de jsonb. El separador de la huella ERA un NUL: guardarPlan habría
  // fallado EN PRODUCCIÓN y ningún test en memoria lo notaba. Este test cierra el agujero.
  const casos = [
    { formula: '=8+6', valor_crudo: '14' },
    { formula: null, valor_crudo: '' },
    { formula: null, valor_crudo: null },
    { formula: '=SUM(F7:F9)', valor_crudo: '5,5' },
  ]
  for (const c of casos) {
    const h = huellaCelda(c)
    const control = [...h].some((ch) => ch.codePointAt(0) < 32)
    assert.equal(control, false, `huella con caracteres de control: ${JSON.stringify(h)}`)
    assert.doesNotThrow(() => JSON.parse(JSON.stringify({ huella: h })))
  }
})

test('la huella no se confunde por dónde corta: `8|` y `|8` son distintas', () => {
  assert.notEqual(
    huellaCelda({ formula: '8', valor_crudo: '' }),
    huellaCelda({ formula: '', valor_crudo: '8' }),
  )
  assert.notEqual(
    huellaCelda({ formula: null, valor_crudo: '' }),
    huellaCelda({ formula: null, valor_crudo: null }),
    'vacía y sin dato no son lo mismo',
  )
})

test('IDEMPOTENCIA: misma confirmación → misma clave; cambiar algo → clave distinta', async () => {
  const g = fakeGoogle()
  const a = await planPara(g)
  const b = await planPara(fakeGoogle())
  assert.equal(a.plan.idempotency_key, b.plan.idempotency_key)
  assert.equal(a.plan.idempotency_key.length, 32)

  const ctx = a.ctx
  const otroValor = planificarAsistencia(ctx, {
    claveObra: OBRA_JS,
    marcas: a.personal.personal.map((p, i) => ({ nombre_clave: p.nombre_clave, estado: i === 0 ? 'ausente' : 'presente' })),
    actor: ACTOR,
  })
  assert.notEqual(otroValor.idempotency_key, a.plan.idempotency_key)

  const otroActor = planificarAsistencia(ctx, {
    claveObra: OBRA_JS,
    marcas: a.personal.personal.map((p) => ({ nombre_clave: p.nombre_clave, estado: 'presente' })),
    actor: { plataforma_user_id: 'mm-jefe-2' },
  })
  assert.notEqual(otroActor.idempotency_key, a.plan.idempotency_key)
})

test('la clave de idempotencia no depende del ORDEN en que se marcó la cuadrilla', async () => {
  const g = fakeGoogle()
  const { ctx, personal } = await planPara(g)
  const m = personal.personal.map((p) => ({ nombre_clave: p.nombre_clave, estado: 'presente' }))
  const p1 = planificarAsistencia(ctx, { claveObra: OBRA_JS, marcas: m, actor: ACTOR })
  const p2 = planificarAsistencia(ctx, { claveObra: OBRA_JS, marcas: [...m].reverse(), actor: ACTOR })
  assert.equal(p1.idempotency_key, p2.idempotency_key)
})

test('reintentar la MISMA confirmación no vuelve a mutar (queda sin_cambio)', async () => {
  const g = fakeGoogle()
  const primera = await planPara(g)
  const r1 = await registrarAsistencia(g, { plan: primera.plan })
  assert.equal(r1.escritas, 3)
  // replanificar sobre la planilla ya escrita: todo sin_cambio
  const segunda = await planPara(g)
  assert.equal(segunda.plan.resumen.sin_cambio, 3)
  assert.equal(segunda.plan.resumen.a_escribir, 0)
  const r2 = await registrarAsistencia(g, { plan: segunda.plan })
  assert.equal(r2.escritas, 0)
  assert.equal(g.escrituras.length, 1, 'una sola mutación en total')
})

test('pestaña protegida (candado del dueño) NO se reporta como éxito', async () => {
  const g = fakeGoogle({ protegido: true })
  const { plan } = await planPara(g)
  const r = await registrarAsistencia(g, { plan })
  assert.equal(r.ok, false)
  assert.equal(r.motivo, MOTIVO.PESTANA_PROTEGIDA)
  assert.equal(r.escritas, 0)
})

test('claveIdempotencia ignora los items bloqueados (no forman parte de la mutación)', () => {
  const ctx = { spreadsheet_id: 'x', pestana: 'Obreros 26', fecha: FECHA_HOY }
  const base = [{ nombre_clave: 'A', horas_nuevas: 9 }]
  const conBloqueado = [...base, { nombre_clave: 'B', horas_nuevas: 9, bloqueada: 'celda_con_formula' }]
  assert.equal(
    claveIdempotencia({ ctx, claveObra: OBRA_JS, items: base, actor: ACTOR }),
    claveIdempotencia({ ctx, claveObra: OBRA_JS, items: conBloqueado, actor: ACTOR }),
  )
})

test('dry-run muestra sheet, fecha, obra, celda, valor actual y propuesto sin escribir', async () => {
  const g = fakeGoogle()
  const { plan } = await planPara(g)
  const d = dryRun(plan)
  assert.equal(d.sheet, 'Obreros 26')
  assert.equal(d.fecha, FECHA_HOY)
  assert.equal(d.filas.length, 3)
  assert.deepEqual(Object.keys(d.filas[0]).sort(), ['accion', 'celda', 'trabajador', 'valor_actual', 'valor_propuesto'])
  assert.equal(d.filas[0].valor_propuesto, 9)
  assert.equal(g.escrituras.length, 0, 'dry-run no escribe')
})

test('obra sin personal en esa fecha se informa (no se inventa cuadrilla)', async () => {
  const g = fakeGoogle()
  // el sábado 18/7 la obra de Messinas no tiene a nadie con datos, pero la cuadrilla
  // del bloque igual existe: la ausencia real se prueba con una obra inexistente
  const r = await listarPersonalPorObraYFecha(g, { fecha: FECHA_HOY, claveObra: 'TALLER|NADIE' })
  assert.equal(r.ok, false)
  assert.equal(r.motivo, MOTIVO.OBRA_DESCONOCIDA)
})
