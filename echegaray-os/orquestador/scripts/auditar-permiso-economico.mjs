#!/usr/bin/env node
// ¿QUÉ PLATA VE CADA ROL? — medido asumiendo el rol, no leyendo las policies.
//
//   node orquestador/scripts/auditar-permiso-economico.mjs
//
// ═══ POR QUÉ NO ALCANZA CON LEER LAS POLICIES ═══
//
// Hoy, en una sola sesión, aparecieron TRES formas distintas de que el corte económico no exista
// aunque la policy diga que sí:
//
//   · `cotizaciones` tenía RLS **sin GRANT**: la policy decía que sí y la base contestaba
//     «permission denied». La tabla era inalcanzable para todos.
//   · y su policy de lectura decía **`using (true)`**: apenas se concedía el GRANT, cualquier
//     autenticado leía `monto_venta` y `margen_pct`.
//   · `analisis_sin_precio` es `security_invoker`, así que a quien no ve precios le devolvía las
//     199 tareas como deuda — **contestaba mal en vez de no contestar**.
//
// Ninguna de las tres se ve leyendo `pg_policies`. Las tres se ven **asumiendo el rol**: se pone
// `request.jwt.claims` con el `sub` de un perfil real, se hace `set local role authenticated`, y se
// pregunta. Con superusuario la RLS ni siquiera se evalúa, así que una prueba hecha así da verde
// siempre y no prueba nada — ya me pasó en esta misma sesión.
//
// Todo corre dentro de una transacción que termina en ROLLBACK: este script no escribe nada.
import { getPool } from '../lib/db.mjs'

// Las columnas económicas de `obra_canonica`, `presupuestos` y `personas` NO se conceden a
// `authenticated` NI SIQUIERA a dirección: el SELECT de esas tablas se otorga columna por columna y
// esas quedan afuera. El dato sale por funciones SECDEF (`contratado_de_obra`, `presupuesto_monto`,
// `presupuesto_margen`) que preguntan `ve_economia()` adentro. Que la consulta directa FALLE es el
// diseño funcionando, no un defecto — por eso van marcadas y no se cuentan como hallazgo.
const POR_FUNCION = new Set([
  'obra_canonica.monto_contratado', 'presupuestos.monto_presupuestado', 'personas.retribucion_pactada',
])

/** Lo que NO puede ver quien no tiene permiso económico. Cada entrada dice qué se pregunta. */
export const LO_ECONOMICO = [
  { que: 'recurso_precio', sql: 'select count(*)::int n from public.recurso_precio' },
  { que: 'cotizaciones', sql: 'select count(*)::int n from public.cotizaciones' },
  { que: 'cotizacion_partida', sql: 'select count(*)::int n from public.cotizacion_partida' },
  { que: 'cotizacion_cascada', sql: 'select count(*)::int n from public.cotizacion_cascada' },
  { que: 'cotizacion_partida_valorizada', sql: 'select count(*)::int n from public.cotizacion_partida_valorizada' },
  { que: 'analisis_sin_precio', sql: 'select count(*)::int n from public.analisis_sin_precio' },
  { que: 'carga_social', sql: 'select count(*)::int n from public.carga_social' },
  { que: 'obra_canonica.monto_contratado', sql: 'select count(monto_contratado)::int n from public.obra_canonica' },
  { que: 'presupuestos.monto_presupuestado', sql: 'select count(monto_presupuestado)::int n from public.presupuestos' },
  { que: 'personas.retribucion_pactada', sql: 'select count(retribucion_pactada)::int n from public.personas' },
]

/** Lo que SÍ tiene que ver un jefe de obra: es su trabajo. Un cero acá también es un defecto. */
export const LO_OPERATIVO = [
  { que: 'tarea_tipo', sql: 'select count(*)::int n from public.tarea_tipo' },
  { que: 'analisis_linea', sql: 'select count(*)::int n from public.analisis_linea' },
  { que: 'analisis_incompleto', sql: 'select count(*)::int n from public.analisis_incompleto' },
  { que: 'obra_actividad', sql: 'select count(*)::int n from public.obra_actividad' },
  { que: 'obra_wbs', sql: 'select count(*)::int n from public.obra_wbs' },
  { que: 'plantilla_paso', sql: 'select count(*)::int n from public.plantilla_paso' },
  { que: 'categoria_obra', sql: 'select count(*)::int n from public.categoria_obra' },
]

/**
 * @param hay  cuántas filas tiene de verdad, contadas SIN RLS. Sin este dato, un cero no se puede
 *             interpretar: una tabla vacía y una tabla bloqueada se ven exactamente igual, y un
 *             auditor que las confunde grita en falso hasta que alguien deja de leerlo.
 */
export function veredicto({ que, esperado, visto, hay }) {
  if (POR_FUNCION.has(que)) {
    return visto === 'ERROR'
      ? { estado: 'ok', texto: 'no se concede la columna: el dato sale por su función con portero' }
      : { estado: 'fuga', texto: `LA COLUMNA SE LEE DIRECTO (${visto}) — la función con portero deja de ser el único camino` }
  }
  if (visto === 'ERROR') return { estado: 'fuga', texto: 'la consulta falló y no debería' }
  if (esperado === 'cero') {
    return visto === 0
      ? { estado: 'ok', texto: hay === 0 ? 'no le llega nada (y la tabla está vacía igual)' : 'no le llega nada' }
      : { estado: 'fuga', texto: `LE LLEGAN ${visto} — el corte económico no existe acá` }
  }
  if (hay === 0) return { estado: 'ok', texto: 'la tabla está VACÍA: no hay nada que ver, no es un bloqueo' }
  return visto > 0
    ? { estado: 'ok', texto: `${visto} de ${hay} fila(s)` }
    : { estado: 'ciego', texto: `CERO de ${hay}: lo necesita para trabajar y no le llega` }
}

async function comoRol(cliente, sub, preguntas) {
  const out = []
  await cliente.query("select set_config('request.jwt.claims', json_build_object('sub', $1::text)::text, true)", [sub])
  await cliente.query('set local role authenticated')
  for (const p of preguntas) {
    // Un savepoint por consulta: sin esto, la primera que falla —y varias van a fallar, que es
    // justamente lo que se está midiendo— aborta la transacción y todas las siguientes contestan
    // «current transaction is aborted». El resultado sería un informe donde todo parece roto.
    await cliente.query('savepoint p')
    try {
      const r = await cliente.query(p.sql)
      await cliente.query('release savepoint p')
      out.push({ ...p, visto: r.rows[0].n })
    } catch {
      await cliente.query('rollback to savepoint p')
      out.push({ ...p, visto: 'ERROR' })
    }
  }
  await cliente.query('reset role')
  return out
}

async function main() {
  const pool = getPool()
  const perfiles = (await pool.query(
    `select rol, min(id::text) as id from public.perfiles
      where rol in ('direccion','administracion','jefe_obra','campo') group by rol order by rol`)).rows
  const c = await pool.connect()

  // ═══ LA LÍNEA DE BASE SE MIDE COMO DIRECCIÓN, NO COMO SUPERUSUARIO ═══
  //
  // Parece al revés y no lo es. Varias vistas llevan `ve_economia()` ADENTRO —es lo que hace que se
  // nieguen a contestar en vez de contestar mal—, y `ve_economia()` cuelga de `auth.uid()`. Un
  // superusuario no tiene `auth.uid()`, así que esas vistas le devuelven CERO y el auditor
  // concluiría «la tabla está vacía» justo donde hay que mirar. El rasero correcto es lo que ve el
  // rol MÁS privilegiado: si dirección ve 2 y el jefe ve 0, eso es un corte; si dirección ve 0,
  // no hay nada que cortar.
  const direccion = perfiles.find((p) => p.rol === 'direccion')
  const hay = new Map()
  await c.query('begin')
  if (direccion) {
    for (const r of await comoRol(c, direccion.id, [...LO_ECONOMICO, ...LO_OPERATIVO])) {
      hay.set(r.que, r.visto === 'ERROR' ? null : r.visto)
    }
  }
  await c.query('rollback')
  let fugas = 0
  let ciegos = 0
  try {
    await c.query('begin')
    for (const p of perfiles) {
      console.log(`\n══ ${p.rol.toUpperCase()} ══`)
      const economico = await comoRol(c, p.id, LO_ECONOMICO)
      const veEco = p.rol === 'direccion' || p.rol === 'administracion'
      console.log('  lo ECONÓMICO' + (veEco ? ' (debe verlo)' : ' (NO debe verlo)'))
      for (const r of economico) {
        const v = veredicto({ ...r, esperado: veEco ? 'algo' : 'cero', hay: hay.get(r.que) })
        if (v.estado === 'fuga') fugas++
        console.log(`    ${v.estado === 'ok' ? '·' : '✗'} ${r.que.padEnd(34)} ${v.texto}`)
      }
      if (p.rol !== 'campo') {
        const operativo = await comoRol(c, p.id, LO_OPERATIVO)
        console.log('  lo OPERATIVO (debe verlo)')
        for (const r of operativo) {
          const v = veredicto({ ...r, esperado: 'algo', hay: hay.get(r.que) })
          if (v.estado === 'ciego') ciegos++
          console.log(`    ${v.estado === 'ok' ? '·' : '✗'} ${r.que.padEnd(34)} ${v.texto}`)
        }
      }
    }
    await c.query('rollback')
  } finally {
    c.release()
    await pool.end()
  }
  console.log(`\n${fugas} fuga(s) de plata · ${ciegos} ceguera(s) operativa(s)`)
  if (fugas) {
    console.log('Una fuga es plata que llega a quien no le corresponde POR POSTGREST, aunque la pantalla la esconda.')
    process.exitCode = 1
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error('falló:', e.message); process.exit(1) })
