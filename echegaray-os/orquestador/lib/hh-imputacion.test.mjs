// LA IMPUTACIÓN DE HORAS, MEDIDA CONTRA LA BASE REAL.
//
// ═══ POR QUÉ ESTE ARCHIVO NO PRUEBA LA PANTALLA ═══
//
// Las reglas que este módulo necesita que se cumplan SIEMPRE —la semana derivada del día, la
// actividad que tiene que ser de la misma obra, y la clave que impide cargar dos veces las mismas
// horas— no pueden vivir en el formulario: el sincronizador del Sheet, un script y cualquier cliente
// de PostgREST las esquivarían. Viven en Postgres, y por eso se miden en Postgres.
//
// ═══ TODO ADENTRO DE UNA TRANSACCIÓN QUE TERMINA EN ROLLBACK (25/09/2026) ═══
//
// Escribía COMMITEADO sobre datos productivos reales —una persona «ZZ-E2E hh-imputacion», registros de
// horas, dos cuadrillas— con `finally { limpiar(...) }` como única red. El 07/09/2026 una corrida que
// murió antes de llegar a ese `finally` dejó esa persona entre los dieciséis obreros del dueño, sin
// tarifa y trabando el cierre de la quincena — la misma clase de incidente que las 500 filas
// `TEST_CENTINELA_*` de `caja_conteo_observado`. Ahora cada caso corre adentro de una transacción
// prestada (`conexion-prestable.mjs`, el mismo mecanismo que `caja-conteo-centinela.mjs`,
// `huella-celda.mjs` y `no-reponer.mjs`) y termina en ROLLBACK: la persona, los registros y las
// cuadrillas de prueba se leen igual dentro del propio test (misma transacción) y no sobreviven al
// `rollback`, muera el proceso donde muera.
//
// SE SACÓ EL `finally { limpiar(...) }` DE CADA TEST, Y NO ES UN DESCUIDO. La mitad de estos casos
// afirman con `assert.rejects` que Postgres RECHAZA un insert (clave única, CHECK, trigger). Eso dejaba
// la transacción en estado ABORTED —el mismo 25P02 que ya documentó `suite-segunda-corrida-miente.md`
// para otra suite—, y el `limpiar()` de la línea siguiente, sobre la MISMA transacción envenenada,
// volvía a tirar: `current transaction is aborted, commands ignored until end of transaction block`.
// El rollback de `enRollback` ya limpia todo (ROLLBACK es válido incluso con la transacción abortada),
// así que un `finally` que corre más SQL ahí es puro riesgo y ningún beneficio.
import test from 'node:test'
import assert from 'node:assert/strict'
import { getPool, query } from './db.mjs'
import { crearConexionPrestable } from './conexion-prestable.mjs'

const { ejecutar, conConexion } = crearConexionPrestable(query)

/** El cuerpo corre con TODAS las lecturas/escrituras de este archivo por una conexión en transacción,
 *  y se deshace — el mismo helper que `caja-conteo-centinela-persistencia.test.mjs`. */
async function enRollback(fn) {
  const c = await getPool().connect()
  try {
    await c.query('begin')
    return await conConexion(c, fn)
  } finally {
    await c.query('rollback').catch(() => {})
    c.release()
  }
}

const SIN_BASE = !process.env.DATABASE_URL
const MARCA = 'ZZ-E2E hh-imputacion'

/** Crea una persona de prueba y una obra donde imputar; devuelve los ids. La transacción prestada es
 *  la única limpieza: no hace falta borrar nada a mano (ver el comentario de arriba). */
async function escenario() {
  // `es_prueba` DESDE EL INSERT, NO AL BORRAR (10/09/2026). Sin ella, la persona que este archivo
  // crea entra a `persona_directorio` —que filtra `es_prueba is not true`— y de ahí a PLANTEL,
  // ASISTENCIA y LIQUIDACIÓN. Una corrida que murió antes de limpiar el 07/09 dejó «ZZ-E2E
  // hh-imputacion» entre los dieciséis obreros del dueño, sin tarifa y trabando el cierre de la
  // quincena. La transacción es lo que hace que un corte no se vea.
  const { rows: [p] } = await ejecutar(
    `insert into public.personas (nombre_completo, es_prueba) values ($1, true) returning id`,
    [MARCA])
  const { rows: [o] } = await ejecutar(
    `select id from public.obra_canonica order by orden limit 1`)
  // ═══ `limit 1` SIN `order by` ELIGE CUALQUIERA (21/08/2026) ═══
  //
  // Postgres devuelve las filas en el orden en que están en el heap, y ese orden cambia con
  // cualquier UPDATE masivo. Al rellenar la jerarquía de 161 actividades, este `limit 1` empezó a
  // devolver otra actividad —una que ya tenía una hora imputada— y el test se puso rojo sin que
  // cambiara ni la vista ni el trigger que mide. Un escenario que depende del orden físico de la
  // tabla no prueba lo que dice probar.
  const { rows: [a] } = await ejecutar(
    `select id, obra_id from public.obra_actividad
      where obra_id = $1 and not archivada order by orden, id limit 1`, [o.id])
  const { rows: [otra] } = await ejecutar(
    `select id from public.obra_actividad
      where obra_id <> $1 and not archivada order by orden, id limit 1`, [o.id])
  return { personaId: p.id, obraId: o.id, actividadId: a?.id ?? null, actividadAjena: otra?.id ?? null }
}

test('la semana se DERIVA del día: un miércoles se guarda con su lunes', { skip: SIN_BASE }, () => enRollback(async () => {
  // Si la calculara la web, Postgres y TypeScript podrían decir lunes distintos y la clave única
  // dejaría entrar las mismas horas dos veces. La deriva el trigger `registros_hh_normalizar`.
  const e = await escenario()
  const { rows: [r] } = await ejecutar(
    `insert into public.registros_hh
       (obra_canonica_id, persona_id, fecha, fecha_inicio_semana, horas, fuente_legacy)
     values ($1, $2, '2026-08-12', '2026-08-12', 8, $3)
     returning fecha_inicio_semana`, [e.obraId, e.personaId, MARCA])
  assert.equal(r.fecha_inicio_semana.toISOString().slice(0, 10), '2026-08-10',
    'la semana no se derivó al lunes: dos cargas de la misma semana entrarían por separado')
}))

test('la misma persona, el mismo día y la misma actividad NO entran dos veces', { skip: SIN_BASE }, () => enRollback(async () => {
  const e = await escenario()
  const alta = () => ejecutar(
    `insert into public.registros_hh
       (obra_canonica_id, persona_id, actividad_id, fecha, fecha_inicio_semana, horas, fuente_legacy)
     values ($1, $2, $3, '2026-08-19', '2026-08-19', 8, $4)`,
    [e.obraId, e.personaId, e.actividadId, MARCA])
  await alta()
  await assert.rejects(alta, /duplicate key|unique/i,
    'la clave única no impidió cargar dos veces las mismas horas: el HH real infla y nada grita')
}))

test('el MISMO día en DOS actividades distintas sí entra: son horas distintas', { skip: SIN_BASE }, () => enRollback(async () => {
  // La clave vieja era `(obra, trabajador_texto, SEMANA)`. Con el grano diario habría rechazado el
  // segundo día de la misma semana — el defecto opuesto, y también silencioso para quien carga.
  const e = await escenario()
  if (!e.actividadId) return
  await ejecutar(
    `insert into public.registros_hh
       (obra_canonica_id, persona_id, actividad_id, fecha, fecha_inicio_semana, horas, fuente_legacy)
     values ($1, $2, $3, '2026-08-19', '2026-08-19', 4, $4),
            ($1, $2, null, '2026-08-20', '2026-08-20', 4, $4)`,
    [e.obraId, e.personaId, e.actividadId, MARCA])
  const { rows: [c] } = await ejecutar(
    `select count(*)::int as n from public.registros_hh where persona_id = $1`, [e.personaId])
  assert.equal(c.n, 2, 'dos días distintos de la misma semana no pudieron cargarse')
}))

test('no se pueden imputar horas a la actividad de OTRA obra', { skip: SIN_BASE }, () => enRollback(async () => {
  // Un CHECK no puede consultar otra tabla, así que lo hace un trigger. Sin él, el plan contra real
  // de las DOS obras queda mal y ninguna de las dos pantallas puede notarlo.
  const e = await escenario()
  if (!e.actividadAjena) return
  await assert.rejects(
    () => ejecutar(
      `insert into public.registros_hh
         (obra_canonica_id, persona_id, actividad_id, fecha, fecha_inicio_semana, horas, fuente_legacy)
       values ($1, $2, $3, '2026-08-19', '2026-08-19', 8, $4)`,
      [e.obraId, e.personaId, e.actividadAjena, MARCA]),
    /pertenece a la obra/i,
    'se pudieron imputar horas a una actividad de otra obra')
}))

test('una imputación con persona SIEMPRE tiene su día', { skip: SIN_BASE }, () => enRollback(async () => {
  const e = await escenario()
  await assert.rejects(
    () => ejecutar(
      `insert into public.registros_hh
         (obra_canonica_id, persona_id, fecha_inicio_semana, horas, fuente_legacy)
       values ($1, $2, '2026-08-17', 8, $3)`, [e.obraId, e.personaId, MARCA]),
    /registros_hh_persona_con_fecha/,
    'se pudo cargar «8 horas, esta semana» sin decir qué día')
}))

test('las HH reales de la actividad son la SUMA de sus imputaciones, no una columna', { skip: SIN_BASE }, () => enRollback(async () => {
  // ═══ EL CANARIO DE LA COLUMNA RETIRADA ═══
  //
  // `obra_actividad.hh_real` se cargaba A MANO en el panel de la actividad, al lado de las horas
  // imputadas de verdad en `registros_hh`: dos números para el mismo hecho, y ninguna regla que
  // dijera cuál manda. El campo salió de la pantalla y de las dos acciones que lo escribían.
  //
  // La columna se retiró en DOS pasos —primero el código dejó de mandarla, después el despliegue,
  // recién ahí el `drop`— porque borrarla antes dejaba a la versión viva de la aplicación mandando
  // una columna inexistente: `PGRST204` y guardar una actividad falla en las ocho obras. Ver
  // `20260819T2500` y `20260819T2700`.
  //
  // El segundo paso ya se dio (19/08/2026), así que el canario endurece: ya no vigila que esté
  // VACÍA, vigila que NO EXISTA. Si alguien la vuelve a crear, este test la nombra.
  const { rows: [col] } = await ejecutar(
    `select count(*)::int as n from information_schema.columns
      where table_schema = 'public' and table_name = 'obra_actividad' and column_name = 'hh_real'`)
  assert.equal(col.n, 0,
    '`obra_actividad.hh_real` volvió a existir: hay lugar para una segunda versión de las horas reales')

  const e = await escenario()
  if (!e.actividadId) return
  // Se mide el DELTA, no el total. La actividad que toca puede tener horas de antes —de hecho
  // las tiene— y afirmar «el total es 6,5» probaba que esa actividad estuviera vacía, no que la
  // vista sumara. Lo que hay que probar es que la imputación nueva LLEGA.
  const leer = async () => {
    const { rows: [v] } = await ejecutar(
      `select coalesce(hh_real, 0) as hh_real from public.obra_actividad_hh where actividad_id = $1`,
      [e.actividadId])
    return Number(v?.hh_real ?? 0)
  }
  const antes = await leer()
  await ejecutar(
    `insert into public.registros_hh
       (obra_canonica_id, persona_id, actividad_id, fecha, fecha_inicio_semana, horas, fuente_legacy)
     values ($1, $2, $3, '2026-08-19', '2026-08-19', 6.5, $4)`,
    [e.obraId, e.personaId, e.actividadId, MARCA])
  const despues = await leer()
  assert.equal(despues - antes, 6.5,
    '`obra_actividad_hh` no refleja la imputación recién hecha')
}))

test('una persona no puede estar en dos cuadrillas al mismo tiempo', { skip: SIN_BASE }, () => enRollback(async () => {
  // Es lo que hace que CUADRILLA pueda ser UNA columna del listado. Sin esta única, la pantalla
  // tendría que elegir una de las dos, y elegiría la que devuelva primero el planificador.
  const e = await escenario()
  const nombres = [`${MARCA} A`, `${MARCA} B`]
  const ids = []
  for (const n of nombres) {
    const { rows: [c] } = await ejecutar(
      `insert into public.cuadrilla (nombre) values ($1) returning id`, [n])
    ids.push(c.id)
  }
  await ejecutar(
    `insert into public.cuadrilla_integrante (cuadrilla_id, persona_id) values ($1, $2)`,
    [ids[0], e.personaId])
  await assert.rejects(
    () => ejecutar(
      `insert into public.cuadrilla_integrante (cuadrilla_id, persona_id) values ($1, $2)`,
      [ids[1], e.personaId]),
    /duplicate key|unique/i,
    'la misma persona quedó abierta en dos cuadrillas a la vez')
}))

test('NO QUEDA NADA: después de las pruebas, cero personas ni cuadrillas de prueba en la base real', { skip: SIN_BASE }, async () => {
  const p = await query(`select count(*)::int n from public.personas where nombre_completo like 'ZZ-E2E hh-imputacion%'`)
  assert.equal(p.rows[0].n, 0, 'una persona ZZ-E2E hh-imputacion en producción es un test que escribió fuera de su transacción')
  const c = await query(`select count(*)::int n from public.cuadrilla where nombre like 'ZZ-E2E hh-imputacion%'`)
  assert.equal(c.rows[0].n, 0, 'una cuadrilla ZZ-E2E hh-imputacion en producción es un test que escribió fuera de su transacción')
})
