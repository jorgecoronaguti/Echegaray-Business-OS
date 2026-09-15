// LA LECTURA DEL DESTINO DE `horas-dia-anterior-obra-cerrada.spec.ts`, POR OTRA PUERTA QUE LA PANTALLA.
//
// Sólo SELECT, por `orquestador/lib/db.mjs` (driver `pg`, sin PostgREST ni RLS). La pantalla escribe por
// la sesión y la acción `corregirJornada`; si la verificación leyera por el mismo cliente, un control se
// validaría contra la misma información que produce. Acá se lee la fila cruda en Postgres.
//
// La obra se elige con la regla de la app (`admiteHorasEl`, importada, no copiada): si el spec tuviera su
// propia versión de la ventana, podría elegir una obra que la pantalla no ofrece y medir otra cosa.
//
//   node tests/util/horas-dia-anterior-db.mjs elegir  <fecha>
//   node tests/util/horas-dia-anterior-db.mjs leer    <persona> <fecha>
//   node tests/util/horas-dia-anterior-db.mjs residuo <persona> <desde> <hasta> [id,id,…]
//
// Imprime UNA línea JSON al final: es lo que parsea el spec.
import { query, closePool } from '../../orquestador/lib/db.mjs'
import { admiteHorasEl, esObraDePrueba, ventanaDe } from '../../src/features/administracion/services/obrasPorFecha.ts'

const d = (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : v == null ? null : String(v).slice(0, 10))

async function elegir(fecha) {
  const liq = await query(
    `select estado from liquidacion_quincena where desde::date <= $1::date and hasta::date >= $1::date`, [fecha])
  const r = await query(`select o.id, o.nombre, o.codigo, o.estado,
      o.fecha_inicio_real::date::text fecha_inicio_real, o.fecha_inicio_plan::date::text fecha_inicio_plan,
      o.fecha_fin_real::date::text fecha_fin_real,
      (select min(h.fecha)::text from registros_hh h where h.obra_canonica_id = o.id) primera_hh,
      (select max(h.fecha)::text from registros_hh h where h.obra_canonica_id = o.id) ultima_hh
    from obra_canonica o order by o.nombre`)
  const admiten = r.rows.filter((o) => !esObraDePrueba(o) && admiteHorasEl(o, fecha))
  const conVentana = (o) => ({
    id: o.id, nombre: o.nombre, estado: o.estado, fecha_fin_real: o.fecha_fin_real,
    primera_hh: o.primera_hh, ultima_hh: o.ultima_hh, ventana: ventanaDe(o),
    // EL CASO QUE ARREGLÓ 6711fc15: el cierre declarado quedó antes del día y sólo las horas lo cubren.
    soloPorEvidencia: o.fecha_fin_real !== null && o.fecha_fin_real < fecha,
  })
  return {
    liquidacion: liq.rows.map((x) => x.estado),
    cerradas: admiten.filter((o) => o.estado !== 'activa').map(conVentana),
    activas: admiten.filter((o) => o.estado === 'activa').map(conVentana),
  }
}

async function leer(persona, fecha) {
  // `creado_por` VIENE EN LA LECTURA PORQUE ES QUIEN ESCRIBIÓ. `registros_hh.creado_por` tiene
  // `default auth.uid()` (20260709121504): una fila nacida de la sesión del navegador trae el uuid de
  // esa cuenta, y una escrita por el service_role del propio spec trae null. Es lo único que separa
  // «lo guardó la pantalla» de «lo guardé yo y me lo creí».
  const r = await query(`select id, persona_id, fecha::text fecha, obra_canonica_id, horas::float8 horas, tipo_hora,
      fuente_legacy, creado_por, actualizado_por from registros_hh where persona_id = $1 and fecha = $2::date order by id`,
  [persona, fecha])
  return r.rows.map((x) => ({ ...x, fecha: d(x.fecha) }))
}

async function residuo(persona, desde, hasta, ids) {
  const n = async (sql, p) => Number((await query(sql, p)).rows[0].n)
  const rango = [persona, desde, hasta]
  return {
    registros_hh: await n(`select count(*) n from registros_hh where persona_id=$1 and fecha between $2::date and $3::date`, rango),
    asistencia_dia: await n(`select count(*) n from asistencia_dia where persona_id=$1 and fecha between $2::date and $3::date`, rango),
    asistencia_dia_retiro: await n(`select count(*) n from asistencia_dia_retiro where persona_id=$1 and fecha between $2::date and $3::date`, rango),
    obra_asignacion: await n(`select count(*) n from obra_asignacion where persona_id=$1`, [persona]),
    registro_hh_correccion: ids.length === 0 ? 0
      : await n(`select count(*) n from registro_hh_correccion where registro_id::text = any($1::text[])`, [ids]),
  }
}

const [cmd, ...args] = process.argv.slice(2)
try {
  const salida = cmd === 'elegir' ? await elegir(args[0])
    : cmd === 'leer' ? await leer(args[0], args[1])
      : cmd === 'residuo' ? await residuo(args[0], args[1], args[2], (args[3] ?? '').split(',').filter(Boolean))
        : null
  if (salida === null) throw new Error(`comando desconocido: ${cmd}`)
  process.stdout.write(`\n${JSON.stringify(salida)}\n`)
} finally {
  await closePool()
}
