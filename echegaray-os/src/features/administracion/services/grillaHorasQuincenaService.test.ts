// LA SOLAPA «HORAS» LEE LO MISMO QUE ASISTENCIA — probado contra una base que capa en 1.000 filas.
//
// ═══ EL DEFECTO QUE ATRAPA (captura del dueño, 10/09/2026 08:08) ═══
//
// La grilla de Liquidación mostraba «·» y CARG. 0 sobre gente con nueve horas cargadas, y el pie
// decía «Cargadas 206» donde Asistencia mostraba 1.019 de la MISMA quincena. Causa: la ventana
// ancha de cinco meses que el panel necesita se pedía en un solo viaje, PostgREST la cortaba en
// `db-max-rows` sin error, y la quincena en curso —las filas más nuevas— quedaba fuera del corte.
//
// Si alguien vuelve a leer `registros_hh` sin paginar, estos tres tests se ponen rojos.
//
// ═══ Y LO QUE SE MIDIÓ DESPUÉS (10/09/2026) ═══
//
// Esa ventana ancha se pedía con las ONCE columnas del detalle del día y con los dos
// `obra_canonica(nombre)` / `obra_actividad(nombre)`: 2.069 filas, 903 KB por carga, y 201 llamadas
// con 15 s de máximo en pg_stat_statements. El costo no eran las filas sino el `left join lateral` a
// `obra_canonica`, que tiene RLS por `ve_obra(id)` y se evaluaba una vez por fila. Los dos últimos
// tests fijan la forma que reemplazó eso: DOS ventanas, cada una con sus columnas. Sin ellos, la
// próxima columna que alguien necesite en el panel vuelve a la ventana ancha y nadie lo nota.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getDatosDeLaSolapaHoras } from './grillaHorasQuincenaService.ts'
import { filasDeGrilla, resumenDeGrilla } from './grillaHorasQuincena.ts'

const Q = { desde: '2026-09-01', hasta: '2026-09-15' } as const

type Fila = Record<string, unknown>

/** Lo que una lectura le pidió a la base: la tabla, las columnas y los filtros de rango. */
interface Pedido { tabla: string; columnas: string; gte: Record<string, string>; lte: Record<string, string> }

/**
 * Una base de mentira que aplica el TOPE de PostgREST: nunca devuelve más de `maxRows` por viaje,
 * y no lo dice. Es la única forma de reproducir el defecto sin la base real.
 *
 * `pedidos` es opcional y anota lo que cada lectura pidió: sin eso no hay forma de probar que la
 * ventana de los meses NO trae las once columnas, porque el resultado sería el mismo.
 */
function baseCapada(tablas: Record<string, Fila[]>, maxRows = 1000, pedidos?: Pedido[]): SupabaseClient {
  const from = (tabla: string) => {
    const filtros: ((f: Fila) => boolean)[] = []
    const pedido: Pedido = { tabla, columnas: '', gte: {}, lte: {} }
    if (pedidos) pedidos.push(pedido)
    let orden: string | null = null
    let inicio = 0
    let fin = maxRows - 1
    const api = {
      select: (columnas?: string) => { pedido.columnas = columnas ?? ''; return api },
      eq: (c: string, v: unknown) => { filtros.push((f) => f[c] === v); return api },
      gte: (c: string, v: string) => { pedido.gte[c] = v; filtros.push((f) => String(f[c]) >= v); return api },
      lte: (c: string, v: string) => { pedido.lte[c] = v; filtros.push((f) => String(f[c]) <= v); return api },
      in: (c: string, v: unknown[]) => { filtros.push((f) => v.includes(f[c])); return api },
      not: (c: string, _op: string, _v: unknown) => { filtros.push((f) => f[c] != null); return api },
      order: (c: string) => { orden = c; return api },
      range: (a: number, b: number) => { inicio = a; fin = b; return api },
      then: (resolver: (r: { data: Fila[] | null; error: null }) => unknown) => {
        let filas = (tablas[tabla] ?? []).filter((f) => filtros.every((p) => p(f)))
        if (orden) filas = [...filas].sort((x, y) => String(x[orden as string]).localeCompare(String(y[orden as string])))
        const tope = Math.min(fin, inicio + maxRows - 1)
        return resolver({ data: filas.slice(inicio, tope + 1), error: null })
      },
    }
    return api
  }
  return { from } as unknown as SupabaseClient
}

/** 17 personas, 1.400 filas viejas (mayo) y la quincena real de septiembre encima. */
function tablasDePrueba(): Record<string, Fila[]> {
  const personas = Array.from({ length: 17 }, (_, i) => ({
    id: `p${String(i).padStart(2, '0')}`, nombre_completo: `PERSONA ${i}`, en_la_empresa: true,
    categoria: null, especialidad: null, puesto: null, fecha_ingreso: null, fecha_egreso: null,
    cuadrilla: null, obra_actual: null, rol_en_obra: null, asignada_desde: null, legajo: i,
  }))
  const hh: Fila[] = []
  // EL LASTRE: cinco meses de historia. Es lo que llenaba la única página y tapaba la quincena.
  for (let i = 0; i < 1400; i++) {
    hh.push({
      id: `a${String(i).padStart(5, '0')}`, persona_id: `p${String(i % 17).padStart(2, '0')}`,
      fecha: '2026-05-04', horas: 9, tipo_hora: 'normal', notas: null, fuente_legacy: null,
      created_at: null, creado_por: null, obra_canonica: null, obra_actividad: null,
    })
  }
  // LA QUINCENA: cada una de las 17 personas con 9 h el lunes 1 de septiembre (M1 de la grilla).
  personas.forEach((p, i) => {
    hh.push({
      id: `z${String(i).padStart(5, '0')}`, persona_id: p.id, fecha: '2026-09-01', horas: 9,
      tipo_hora: 'normal', notas: null, fuente_legacy: null, created_at: null, creado_por: null,
      obra_canonica: null, obra_actividad: null,
    })
  })
  return {
    persona_directorio: personas,
    persona_legajo: personas.map((p) => ({ id: p.id, dni: null, cuil: null, fecha_nacimiento: null,
      nacionalidad: null, telefono: null, email: null, domicilio: null, contacto_emergencia: null,
      convenio_colectivo: 'UOCRA', modalidad_liquidacion: null, notas: null })),
    // Quince por hora y dos de Oficina con neto mensual (Maldonado y Nievas en la base real).
    persona_tarifa: personas.map((p, i) => (i < 15
      ? { persona_id: p.id, desde: '2026-01-01', valor_hora: 3650, neto_mensual: null }
      : { persona_id: p.id, desde: '2026-01-01', valor_hora: null, neto_mensual: 1_800_000 })),
    registros_hh: hh,
    asistencia_dia: [],
    nomina_adelanto: [],
    liquidacion_quincena: [],
    registro_hh_correccion: [],
    perfiles: [],
  }
}

test('9 h EL M1 EN LA FUENTE DE ASISTENCIA SE VEN COMO 9 EN LA GRILLA DE LIQUIDACIÓN', async () => {
  const datos = await getDatosDeLaSolapaHoras(baseCapada(tablasDePrueba()), Q)
  assert.deepEqual(datos.errores, [])
  assert.equal(datos.personas.length, 17)
  // Las 17 filas de la quincena están: antes llegaban cero porque el corte se las comía.
  assert.equal(datos.registros.length, 17)
  const filas = filasDeGrilla({
    quincena: Q, personas: datos.personas, registros: datos.registros, presencias: datos.presencias,
    personaDeRegistro: (r) => (r as unknown as { persona_id: string }).persona_id,
    personaDePresencia: (p) => (p as unknown as { persona_id: string }).persona_id,
    hoy: '2026-09-01',
  })
  for (const f of filas) {
    assert.equal(f.celdas[0].marca, 'horas', `${f.nombre} quedó en «·» con 9 h cargadas`)
    assert.equal(f.celdas[0].horas, 9)
    assert.equal(f.cargadas, 9)
  }
})

test('ESPERADAS DEL PIE = LA SUMA DEL PLANTEL, no las de una persona', async () => {
  const datos = await getDatosDeLaSolapaHoras(baseCapada(tablasDePrueba()), Q)
  const filas = filasDeGrilla({
    quincena: Q, personas: datos.personas, registros: datos.registros, presencias: datos.presencias,
    personaDeRegistro: (r) => (r as unknown as { persona_id: string }).persona_id,
    personaDePresencia: (p) => (p as unknown as { persona_id: string }).persona_id,
    hoy: '2026-09-01',
  })
  const resumen = resumenDeGrilla(Q, filas)
  // El pie decía «Esperadas 97» —las de UNA persona— al lado de las cargadas de DIECISIETE.
  assert.equal(resumen.esperadas, 17 * 97)
  assert.equal(resumen.cargadas, 17 * 9)
})

test('NETO MENSUAL CARGADO NO ES «SIN RETRIBUCIÓN» (mismo criterio que el cierre)', async () => {
  const datos = await getDatosDeLaSolapaHoras(baseCapada(tablasDePrueba()), Q)
  // Los dos de Oficina cobran un neto mensual: su valor hora es NULL por definición.
  const oficina = datos.personas.filter((p) => p.modalidad === 'mensual')
  assert.equal(oficina.length, 2)
  assert.equal(oficina[0].valorHora, null)
  const filas = filasDeGrilla({
    quincena: Q, personas: datos.personas, registros: datos.registros, presencias: datos.presencias,
    personaDeRegistro: (r) => (r as unknown as { persona_id: string }).persona_id,
    personaDePresencia: (p) => (p as unknown as { persona_id: string }).persona_id,
    hoy: '2026-09-01',
  })
  assert.equal(resumenDeGrilla(Q, filas).sinRetribucion, 0)
  const suyas = filas.filter((f) => oficina.some((o) => o.id === f.personaId))
  for (const f of suyas) assert.notEqual(f.estado, 'tarifa')
})


// ═══ LAS DOS VENTANAS, FIJADAS ═══

/** Las lecturas de `registros_hh` de una carga, sin las páginas repetidas del mismo pedido. */
function lecturasDeHH(pedidos: Pedido[]): Pedido[] {
  const vistas = new Map<string, Pedido>()
  for (const p of pedidos.filter((x) => x.tabla === 'registros_hh')) {
    vistas.set(`${p.columnas}|${JSON.stringify(p.gte)}|${JSON.stringify(p.lte)}`, p)
  }
  return [...vistas.values()]
}

test('LA VENTANA DE LOS MESES PIDE TRES COLUMNAS Y NO PISA LA QUINCENA', async () => {
  const pedidos: Pedido[] = []
  await getDatosDeLaSolapaHoras(baseCapada(tablasDePrueba(), 1000, pedidos), Q)
  const lecturas = lecturasDeHH(pedidos)
  assert.equal(lecturas.length, 2, 'registros_hh tiene que leerse en dos ventanas y sólo dos')

  const meses = lecturas.find((l) => l.columnas === 'persona_id, fecha, horas')
  assert.ok(meses, 'la ventana de los meses dejó de pedir sólo persona_id, fecha y horas: '
    + `pidió ${lecturas.map((l) => `«${l.columnas}»`).join(' y ')}`)
  // NI UN `obra_canonica(...)`: cada nombre de obra es una evaluación de `ve_obra()` POR FILA, y en
  // esta ventana son 1.671 filas para dibujar cinco barras.
  assert.doesNotMatch(meses.columnas, /obra_canonica|obra_actividad/)
  // CINCO MESES CALENDARIO contados desde `hasta`, y cierra el día ANTERIOR a la quincena: lo de la
  // quincena ya vino en la otra lectura y traerlo dos veces era el motivo de leer una sola ventana.
  assert.equal(meses.gte.fecha, '2026-05-01')
  assert.equal(meses.lte.fecha, '2026-08-31')

  const quincena = lecturas.find((l) => l !== meses)!
  assert.match(quincena.columnas, /obra_canonica\(nombre\)/)
  assert.match(quincena.columnas, /obra_actividad\(nombre\)/)
  assert.equal(quincena.gte.fecha, Q.desde)
  assert.equal(quincena.lte.fecha, Q.hasta)
})

test('EL GRÁFICO DE CINCO MESES NO PIERDE EL MES EN CURSO', async () => {
  const datos = await getDatosDeLaSolapaHoras(baseCapada(tablasDePrueba()), Q)
  const meses = datos.porPersona.p00.mesesHH
  // Las dos ventanas se unen para el gráfico: si sólo se sumara la ancha, septiembre —que está
  // partido por el corte— saldría «sin cargar» sobre nueve horas cargadas.
  assert.deepEqual(meses.map((m) => m.clave), ['2026-05', '2026-06', '2026-07', '2026-08', '2026-09'])
  assert.equal(meses[4].horas, 9, 'el mes en curso perdió las horas de la quincena')
  assert.ok((meses[0].horas ?? 0) > 0, 'mayo perdió las 1.400 filas de la ventana ancha')
  // Un mes sin ninguna hora es `null`, nunca 0: un 0 afirmaría que no trabajó el mes entero.
  assert.equal(meses[1].horas, null)
})
