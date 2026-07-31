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
  assert.ok(plan.items.every((i) => i.normales_nuevas === 9 && i.extras_nuevas === 0))
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
      { nombre_clave: c, estado: 'parcial', normales: '5,5' },
    ],
    actor: ACTOR,
  })
  const h = Object.fromEntries(plan.items.map((i) => [i.nombre_clave, i.total_nuevo]))
  assert.equal(h[a], 9)
  assert.equal(h[b], 0)
  assert.equal(h[c], 5.5)
  assert.equal(plan.resumen.ausentes, 1)
  assert.equal(plan.resumen.parciales, 1)
})

test('una celda con =8+6 se INTERPRETA como 8 normales + 6 extra, no se bloquea', async () => {
  const g = fakeGoogle()
  const ctx = await contextoParaFecha(g, { fecha: '2026-07-16' })
  const plan = planificarAsistencia(ctx, {
    claveObra: OBRA_JS,
    marcas: [{ nombre_clave: 'QUIROGA SEBASTIAN', estado: 'presente', extras: 6 }],
    actor: ACTOR,
  })
  const i = plan.items[0]
  assert.equal(i.bloqueada, null, 'una fórmula de horas extra es una carga válida')
  assert.equal(i.formula_actual, '=8+6')
  assert.deepEqual(
    { n: i.normales_actuales, e: i.extras_actuales, t: i.total_actual },
    { n: 8, e: 6, t: 14 },
    'el estado anterior viene desglosado',
  )
  // el jueves calibra 9: pasar de 8+6 a 9+6 es una modificación real
  assert.equal(i.accion, 'modifica')
  assert.equal(i.escribir, '=9+6')
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
  assert.equal(plan.items[0].total_actual, 9)
  assert.equal(plan.items[0].total_nuevo, 0)
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

test('la escritura se declara COMPARTIDA: JORNALES la editan personas y la firma no puede frenarla', async () => {
  // EL BUG (30/07, en producción). `Obreros 26` no la genera el OS: la editan personas todos los días.
  // Sin declarar la escritura como compartida, el portón comparaba la firma de toda la pestaña contra la
  // última que selló el OS, la encontraba distinta SIEMPRE, la auto-candaba y descartaba la marcada: el
  // jefe de obra veía "la pestaña está tomada" y la asistencia quedaba muerta para siempre.
  // Lo que protege esta escritura no es la firma sino el control de concurrencia POR CELDA de acá arriba
  // (relee la celda, compara la huella con la del plan y aborta todo si cambió) — más fuerte, no más
  // débil. El candado explícito del dueño sigue frenándola: eso se prueba en guarda-escritura.test.mjs.
  const g = fakeGoogle()
  const { plan } = await planPara(g)
  await registrarAsistencia(g, { plan })
  assert.equal(g.escrituras[0].opts?.compartida, true, 'sin esta bandera la asistencia no entra nunca')
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
  assert.ok(['accion', 'celda', 'trabajador', 'valor_actual', 'valor_propuesto',
    'normales_nuevas', 'extras_nuevas', 'total_nuevo'].every((k) => k in d.filas[0]))
  assert.equal(d.filas[0].valor_propuesto, 9)
  assert.equal(d.filas[0].total_nuevo, 9)
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

// ── HORAS EXTRA en el plan y en la escritura ────────────────────────────────
// Los casos se inyectan MUTANDO la grilla del fake, no tocando el fixture compartido:
// así estos tests son independientes de lo que el fixture traiga por defecto.

/** Pone una celda en la columna del día `iso` para la fila 1-based dada. */
function ponerCelda(g, fila1, col, { formula = null, valor, numero }) {
  g.grid.filas[fila1 - 1][idxCol(col)] = { valor: String(valor), numero, formula, derivada: false }
}

test('presente CON horas extra escribe una fórmula que preserva la separación', async () => {
  const g = fakeGoogle()
  const ctx = await contextoParaFecha(g, { fecha: FECHA_HOY })
  const plan = planificarAsistencia(ctx, {
    claveObra: OBRA_JS, marcas: [{ nombre_clave: 'AGUERO CRISTIAN', estado: 'presente', extras: 2 }], actor: ACTOR,
  })
  const i = plan.items[0]
  assert.deepEqual({ n: i.normales_nuevas, e: i.extras_nuevas, t: i.total_nuevo }, { n: 9, e: 2, t: 11 })
  assert.equal(i.escribir, '=9+2')
  const r = await registrarAsistencia(g, { plan })
  assert.equal(r.ok, true)
  assert.equal(g.escrituras[0].data[0].values[0][0], '=9+2')
  assert.equal(r.celdas[0].new_total_hours, 11)
  assert.equal(r.celdas[0].new_formula, '=9+2')
})

test('el resumen agrega horas normales, extra y total', async () => {
  const g = fakeGoogle()
  const ctx = await contextoParaFecha(g, { fecha: FECHA_HOY })
  const plan = planificarAsistencia(ctx, {
    claveObra: OBRA_JS,
    marcas: [
      { nombre_clave: 'AGUERO CRISTIAN', estado: 'presente', extras: 2 },
      { nombre_clave: 'QUIROGA SEBASTIAN', estado: 'presente' },
      { nombre_clave: 'EMANUEL ALANIZ', estado: 'ausente' },
    ],
    actor: ACTOR,
  })
  assert.equal(plan.resumen.horas_normales, 18)
  assert.equal(plan.resumen.horas_extra, 2)
  assert.equal(plan.resumen.horas_total, 20)
  assert.equal(plan.resumen.con_extras, 1)
  assert.equal(plan.resumen.ausentes, 1)
})

test('editar una carga existente =9+2 precarga el desglose y no lo reinicia', async () => {
  const g = fakeGoogle()
  ponerCelda(g, 21, 'R', { formula: '=9+2', valor: '11', numero: 11 })
  const p = await listarPersonalPorObraYFecha(g, { fecha: FECHA_HOY, claveObra: OBRA_JS })
  const a = p.personal.find((x) => x.nombre_clave === 'AGUERO CRISTIAN').actual
  assert.deepEqual({ n: a.carga.normales, e: a.carga.extras, t: a.carga.total }, { n: 9, e: 2, t: 11 })
  assert.equal(a.carga.inequivoca, true)
})

test('cambiar sólo las normales PRESERVA la forma =4+3*1,5 de las extras', async () => {
  const g = fakeGoogle()
  ponerCelda(g, 21, 'R', { formula: '=4+3*1,5', valor: '8,5', numero: 8.5 })
  const ctx = await contextoParaFecha(g, { fecha: FECHA_HOY })
  const plan = planificarAsistencia(ctx, {
    claveObra: OBRA_JS, marcas: [{ nombre_clave: 'AGUERO CRISTIAN', estado: 'presente', extras: 4.5 }], actor: ACTOR,
  })
  const i = plan.items[0]
  assert.equal(i.escribir, '=9+3*1.5', 'no se destruye que eran 3 h al 1,5')
  assert.equal(i.total_nuevo, 13.5)
})

test('pasar de =9+2 a un 11 pelado NO es "sin cambio": cambia el archivo', async () => {
  const g = fakeGoogle()
  ponerCelda(g, 21, 'R', { formula: '=9+2', valor: '11', numero: 11 })
  const ctx = await contextoParaFecha(g, { fecha: FECHA_HOY })
  const plan = planificarAsistencia(ctx, {
    claveObra: OBRA_JS, marcas: [{ nombre_clave: 'AGUERO CRISTIAN', estado: 'parcial', normales: 11 }], actor: ACTOR,
  })
  assert.equal(plan.items[0].total_nuevo, 11)
  assert.equal(plan.items[0].accion, 'modifica', 'mismo total, otra representación')
})

test('una carga IDÉNTICA con extras queda sin_cambio y no se reescribe', async () => {
  const g = fakeGoogle()
  ponerCelda(g, 21, 'R', { formula: '=9+2', valor: '11', numero: 11 })
  const ctx = await contextoParaFecha(g, { fecha: FECHA_HOY })
  const plan = planificarAsistencia(ctx, {
    claveObra: OBRA_JS, marcas: [{ nombre_clave: 'AGUERO CRISTIAN', estado: 'presente', extras: 2 }], actor: ACTOR,
  })
  assert.equal(plan.items[0].accion, 'sin_cambio')
  assert.equal(plan.resumen.a_escribir, 0)
})

test('una fórmula NO interpretable exige una confirmación aparte para reemplazarla', async () => {
  const g = fakeGoogle()
  ponerCelda(g, 21, 'R', { formula: '=9-2,5+2', valor: '8,5', numero: 8.5 })
  const ctx = await contextoParaFecha(g, { fecha: FECHA_HOY })
  const plan = planificarAsistencia(ctx, {
    claveObra: OBRA_JS, marcas: [{ nombre_clave: 'AGUERO CRISTIAN', estado: 'presente' }], actor: ACTOR,
  })
  const i = plan.items[0]
  assert.equal(i.bloqueada, null, 'no está bloqueada: se puede reemplazar CON confirmación')
  assert.equal(i.reemplaza_formula_no_interpretable, true)
  assert.equal(i.total_actual, 8.5, 'el total anterior se conoce')
  assert.equal(i.normales_actuales, null, 'la composición anterior NO se inventa')
  assert.equal(plan.requiere_confirmacion_formula, true)

  const sin = await registrarAsistencia(g, { plan, confirmarSobrescritura: true })
  assert.equal(sin.ok, false)
  assert.equal(sin.motivo, 'reemplazo_formula_no_confirmado')
  assert.equal(g.escrituras.length, 0)

  const con = await registrarAsistencia(g, { plan, confirmarSobrescritura: true, confirmarReemplazoFormula: true })
  assert.equal(con.ok, true)
  assert.equal(con.celdas[0].old_formula, '=9-2,5+2')
  assert.equal(con.celdas[0].old_effective_value, 8.5)
  assert.equal(con.celdas[0].new_total_hours, 9)
})

test('llegada tarde con horas extra: normales trabajadas + extras', async () => {
  const g = fakeGoogle()
  const ctx = await contextoParaFecha(g, { fecha: FECHA_HOY })
  const plan = planificarAsistencia(ctx, {
    claveObra: OBRA_JS, marcas: [{ nombre_clave: 'AGUERO CRISTIAN', estado: 'tarde', normales: 7, extras: 2 }], actor: ACTOR,
  })
  const i = plan.items[0]
  assert.deepEqual({ n: i.normales_nuevas, e: i.extras_nuevas, t: i.total_nuevo }, { n: 7, e: 2, t: 9 })
  assert.equal(i.escribir, '=7+2')
  assert.equal(plan.resumen.tardes, 1)
})

test('un ausente con horas extra se bloquea (incoherente)', async () => {
  const g = fakeGoogle()
  const ctx = await contextoParaFecha(g, { fecha: FECHA_HOY })
  const plan = planificarAsistencia(ctx, {
    claveObra: OBRA_JS, marcas: [{ nombre_clave: 'AGUERO CRISTIAN', estado: 'ausente', extras: 2 }], actor: ACTOR,
  })
  assert.equal(plan.items[0].bloqueada, 'ausente_con_extras')
  assert.equal(plan.escribibles.length, 0)
})

test('horas negativas y texto en las extras se bloquean', async () => {
  const g = fakeGoogle()
  const ctx = await contextoParaFecha(g, { fecha: FECHA_HOY })
  for (const [marca, motivo] of [
    [{ nombre_clave: 'AGUERO CRISTIAN', estado: 'presente', extras: -2 }, 'negativo'],
    [{ nombre_clave: 'AGUERO CRISTIAN', estado: 'presente', extras: 'A1' }, 'no_numerico'],
    [{ nombre_clave: 'AGUERO CRISTIAN', estado: 'parcial', normales: '=1+1' }, 'no_numerico'],
    [{ nombre_clave: 'AGUERO CRISTIAN', estado: 'parcial', normales: 20, extras: 8 }, 'total_mayor_al_maximo'],
  ]) {
    const plan = planificarAsistencia(ctx, { claveObra: OBRA_JS, marcas: [marca], actor: ACTOR })
    assert.equal(plan.items[0].bloqueada, motivo, JSON.stringify(marca))
  }
})

test('INYECCIÓN de fórmula: lo que manda el cliente nunca llega a la celda', async () => {
  const g = fakeGoogle()
  const ctx = await contextoParaFecha(g, { fecha: FECHA_HOY })
  for (const veneno of ['=IMPORTRANGE("x","y")', '9;DELETE', '=A1+1', '8)+SUM(A:A']) {
    const plan = planificarAsistencia(ctx, {
      claveObra: OBRA_JS, marcas: [{ nombre_clave: 'AGUERO CRISTIAN', estado: 'parcial', normales: veneno }], actor: ACTOR,
    })
    assert.equal(plan.items[0].bloqueada, 'no_numerico', veneno)
    assert.equal(plan.escribibles.length, 0)
  }
  assert.equal(g.escrituras.length, 0)
})

test('la idempotencia distingue 9+2 de 11: no es la misma carga', async () => {
  const g = fakeGoogle()
  const ctx = await contextoParaFecha(g, { fecha: FECHA_HOY })
  const conExtras = planificarAsistencia(ctx, {
    claveObra: OBRA_JS, marcas: [{ nombre_clave: 'AGUERO CRISTIAN', estado: 'presente', extras: 2 }], actor: ACTOR,
  })
  const soloTotal = planificarAsistencia(ctx, {
    claveObra: OBRA_JS, marcas: [{ nombre_clave: 'AGUERO CRISTIAN', estado: 'parcial', normales: 11 }], actor: ACTOR,
  })
  assert.equal(conExtras.items[0].total_nuevo, soloTotal.items[0].total_nuevo)
  assert.notEqual(conExtras.idempotency_key, soloTotal.idempotency_key)
})

test('CONCURRENCIA: si cambia la FÓRMULA manteniendo el total, igual es conflicto', async () => {
  const g = fakeGoogle()
  ponerCelda(g, 21, 'R', { formula: '=9+2', valor: '11', numero: 11 })
  const ctx = await contextoParaFecha(g, { fecha: FECHA_HOY })
  const plan = planificarAsistencia(ctx, {
    claveObra: OBRA_JS, marcas: [{ nombre_clave: 'AGUERO CRISTIAN', estado: 'presente', extras: 3 }], actor: ACTOR,
  })
  // alguien reescribe la celda con otra fórmula que da el MISMO total
  ponerCelda(g, 21, 'R', { formula: '=8+3', valor: '11', numero: 11 })
  const r = await registrarAsistencia(g, { plan, confirmarSobrescritura: true })
  assert.equal(r.ok, false)
  assert.equal(r.motivo, MOTIVO.CONFLICTO_CONCURRENCIA)
  assert.equal(g.escrituras.length, 0)
})

test('la verificación posterior compara el TOTAL interpretado, no el texto', async () => {
  const g = fakeGoogle()
  const ctx = await contextoParaFecha(g, { fecha: FECHA_HOY })
  const plan = planificarAsistencia(ctx, {
    claveObra: OBRA_JS, marcas: [{ nombre_clave: 'AGUERO CRISTIAN', estado: 'presente', extras: 2 }], actor: ACTOR,
  })
  // el fake guarda la fórmula y su valor calculado, como haría el Sheet
  const orig = g.batchUpdateValues.bind(g)
  g.batchUpdateValues = async (id, data) => {
    const res = await orig(id, data)
    g.grid.filas[20][idxCol('R')] = { valor: '11', numero: 11, formula: '=9+2', derivada: false }
    return res
  }
  const r = await registrarAsistencia(g, { plan })
  assert.equal(r.ok, true, 'una escritura con fórmula no debe dar verificación fallida')
  assert.equal(r.escritas, 1)
})

// ── CORRECCIONES DE PRODUCCIÓN ──────────────────────────────────────────────
// Cada uno reproduce un defecto que se encontró antes de desplegar.

test('la celda YA CARGADA queda SIN CAMBIO por defecto: no se propone pisarla', async () => {
  const g = fakeGoogle({ alLeer(grid) { grid.filas[20][idxCol('R')] = { valor: '8,5', numero: 8.5, formula: '=4+3*1,5', derivada: false } } })
  const personal = await listarPersonalPorObraYFecha(g, { fecha: FECHA_HOY, claveObra: OBRA_JS })
  const cargados = personal.personal.filter((p) => p.cargada)
  assert.equal(cargados.length, 1, 'el fixture tiene exactamente una celda cargada')

  const ctx = await contextoParaFecha(g, { fecha: FECHA_HOY })
  const plan = planificarAsistencia(ctx, {
    claveObra: OBRA_JS, actor: ACTOR,
    marcas: personal.personal.map((p) => ({ ref: p.ref, estado: p.cargada ? 'sin_cambio' : 'presente' })),
  })
  const i = plan.items.find((x) => x.ref === cargados[0].ref)
  assert.equal(i.accion, 'sin_cambio')
  assert.equal(i.escribir, null, 'no se compone ningún valor para escribir')
  assert.equal(plan.escribibles.some((e) => e.ref === i.ref), false, 'no entra en el batch')
  assert.equal(i.formula_actual, '=4+3*1,5', 'la fórmula original queda intacta')
})

test('marcar EXPLÍCITAMENTE esa misma celda sí la actualiza', async () => {
  const g = fakeGoogle({ alLeer(grid) { grid.filas[20][idxCol('R')] = { valor: '8,5', numero: 8.5, formula: '=4+3*1,5', derivada: false } } })
  const personal = await listarPersonalPorObraYFecha(g, { fecha: FECHA_HOY, claveObra: OBRA_JS })
  const ctx = await contextoParaFecha(g, { fecha: FECHA_HOY })
  const cargado = personal.personal.find((p) => p.cargada)
  const plan = planificarAsistencia(ctx, {
    claveObra: OBRA_JS, actor: ACTOR,
    marcas: [{ ref: cargado.ref, estado: 'presente', extras: 2 }],
  })
  const i = plan.items[0]
  assert.equal(i.accion, 'modifica')
  assert.equal(i.extras_nuevas, 2)
  assert.equal(plan.requiere_confirmacion_sobrescritura, true)
})

test('el plan DECLARA cuántas horas extra se borran (no las esconde en un 0)', async () => {
  const g = fakeGoogle({ alLeer(grid) { grid.filas[20][idxCol('R')] = { valor: '14', numero: 14, formula: '=8+6', derivada: false } } })
  const personal = await listarPersonalPorObraYFecha(g, { fecha: FECHA_HOY, claveObra: OBRA_JS })
  const ctx = await contextoParaFecha(g, { fecha: FECHA_HOY })
  const cargado = personal.personal.find((p) => p.cargada)
  const plan = planificarAsistencia(ctx, {
    claveObra: OBRA_JS, actor: ACTOR, marcas: [{ ref: cargado.ref, estado: 'presente' }],
  })
  assert.equal(plan.items[0].pierde_extras, true)
  assert.equal(plan.items[0].extras_borradas, 6)
  assert.equal(plan.resumen.pierden_extras, 1)
  assert.equal(plan.resumen.horas_extra_borradas, 6)
  assert.equal(plan.pierde_horas_extra, true)
})

test('dos HOMÓNIMOS en la misma obra van a filas distintas', async () => {
  // Dos filas con el mismo nombre: antes colapsaban en una clave y se escribía UNA sola.
  const g = fakeGoogle({
    alLeer(grid) {
      const c = idxCol('B')
      grid.filas[21][c] = { valor: 'Aguero Cristian', numero: null, formula: null, derivada: false }
    },
  })
  const personal = await listarPersonalPorObraYFecha(g, { fecha: FECHA_HOY, claveObra: OBRA_JS })
  const homonimos = personal.personal.filter((p) => p.nombre_clave === 'AGUERO CRISTIAN')
  assert.equal(homonimos.length, 2, 'hay dos personas con el mismo nombre')
  assert.notEqual(homonimos[0].ref, homonimos[1].ref, 'la identidad estructural los distingue')

  const ctx = await contextoParaFecha(g, { fecha: FECHA_HOY })
  const plan = planificarAsistencia(ctx, {
    claveObra: OBRA_JS, actor: ACTOR,
    marcas: [
      { ref: homonimos[0].ref, estado: 'presente' },
      { ref: homonimos[1].ref, estado: 'ausente' },
    ],
  })
  assert.equal(plan.items.length, 2)
  const celdas = plan.items.map((i) => i.celda_a1)
  assert.notEqual(celdas[0], celdas[1], 'dos celdas distintas')
  assert.equal(plan.items[0].total_nuevo, 9)
  assert.equal(plan.items[1].total_nuevo, 0)
})

test('un nombre AMBIGUO (sin ref) se rechaza en vez de elegir una fila al azar', async () => {
  const g = fakeGoogle({
    alLeer(grid) {
      grid.filas[21][idxCol('B')] = { valor: 'Aguero Cristian', numero: null, formula: null, derivada: false }
    },
  })
  const ctx = await contextoParaFecha(g, { fecha: FECHA_HOY })
  const plan = planificarAsistencia(ctx, {
    claveObra: OBRA_JS, actor: ACTOR, marcas: [{ nombre_clave: 'AGUERO CRISTIAN', estado: 'presente' }],
  })
  assert.equal(plan.items[0].bloqueada, MOTIVO.TRABAJADOR_AMBIGUO)
  assert.equal(plan.escribibles.length, 0)
})

test('una fórmula CON ERROR queda protegida: ni se pisa ni se ofrece reemplazar', async () => {
  const g = fakeGoogle({ alLeer(grid) { grid.filas[20][idxCol('R')] = { valor: '#REF!', numero: null, formula: '=F20/0', derivada: false } } })
  const personal = await listarPersonalPorObraYFecha(g, { fecha: FECHA_HOY, claveObra: OBRA_JS })
  const ctx = await contextoParaFecha(g, { fecha: FECHA_HOY })
  const conError = personal.personal.find((p) => p.actual.carga.forma === 'error')
  assert.ok(conError, 'la celda se clasifica como ERROR, no como no_interpretable')
  const plan = planificarAsistencia(ctx, {
    claveObra: OBRA_JS, actor: ACTOR, marcas: [{ ref: conError.ref, estado: 'presente' }],
  })
  assert.equal(plan.items[0].bloqueada, MOTIVO.FORMULA_CON_ERROR)
  assert.equal(plan.escribibles.length, 0)
  assert.equal(plan.requiere_confirmacion_formula, false, 'no se ofrece reemplazarla con un sí')
})

test('el RANGO DESPLAZADO no corre las filas: la celda es la de la persona', async () => {
  const g = fakeGoogle()
  const sinOffset = await contextoParaFecha(g, { fecha: FECHA_HOY })
  const filaSin = sinOffset.trabajadores[0].fila1
  const a1Sin = celdaDe(sinOffset)

  const g2 = fakeGoogle({ alLeer(grid) { grid.offset = { fila: 5, col: 0 } } })
  const conOffset = await contextoParaFecha(g2, { fecha: FECHA_HOY })
  assert.equal(conOffset.trabajadores[0].fila1, filaSin + 5, 'la fila real sube con el offset')
  assert.notEqual(celdaDe(conOffset), a1Sin, 'la coordenada A1 cambia con el rango')
  assert.match(celdaDe(conOffset), new RegExp(`${filaSin + 5}$`))
})

function celdaDe(ctx) {
  const t = ctx.trabajadores[0]
  return `${ctx.columna_letra}${t.fila1}`
}
