// EL CAMINO VERDE DEL CONGELADO, Y LAS SIETE MUTACIONES QUE LO TIENEN QUE CORTAR.
//
// ═══ QUÉ PRUEBA ESTE SCRIPT, Y POR QUÉ NO ALCANZABA CON LO QUE HABÍA ═══
//
// Todos los casos de freeze del repo arrancaban de algo ya congelado o de algo que bloquea. Nunca se
// probó que el candado deje pasar algo CORRECTO — y un candado que sólo se vio bloqueando no se
// distingue de un candado soldado. Acá:
//
//   1 · se arma un BORRADOR válido y se congela DE VERDAD, leyendo `congelada_en` en su destino;
//   2 · se le saca UNA pieza por vez, se comprueba que el congelado se corta, se REVIERTE y se
//       comprueba que vuelve a permitirlo. Siete veces. Un bloqueo que no vuelve a verde al
//       revertir no probó la mutación: probó que el gate está roto para todo.
//
// Todo corre dentro de un `begin` y sale por `rollback`. La base es la productiva y está compartida.
//
// USO:  node orquestador/scripts/xsas-freeze-camino-verde.mjs

import { getPool } from '../lib/db.mjs'
import { crearBorradorValido, congelarBorrador } from './xsas-freeze-fixture.mjs'

const gate = async (c, id) => (await c.query('select public.cot_gate_congelado($1) as g', [id])).rows[0].g
const valida = async (c, id) => (await c.query('select public.xsas_freeze_validacion($1) as v', [id])).rows[0].v
const tipos = (issues) => [...new Set(issues.map((i) => i.tipo))].sort()

/**
 * LAS SIETE MUTACIONES. Cada una saca UNA pieza del borrador válido.
 *
 * `fuente` dice QUIÉN la ataja hoy: `gate` es `cot_gate_congelado`, el que hace cumplir el congelado
 * en producción; `validacion` es `xsas_freeze_validacion`, que existe porque el gate es ciego a esas
 * tres y endurecerlo rompe `casos-reales.pg.test.mjs:240` — un archivo de otro frente. La
 * distinción no es cosmética: las tres de `validacion` HOY SE CONGELARÍAN.
 */
export const MUTACIONES = [
  {
    nombre: '1 · cantidad NULL en la partida',
    fuente: 'gate', tipo: 'CANTIDAD_CRITICA_AUSENTE',
    aplicar: (c, fx) => c.query('update public.cotizacion_partida set cantidad = null where id = $1', [fx.partidaId]),
  },
  {
    nombre: '2 · precio NULL: la observación pierde la fecha',
    // `recurso_precio.costo` es NOT NULL, así que un precio «vacío» sólo puede llegar por la fecha.
    // Sin fecha no hay precio afirmable: no se sabe de cuándo es.
    fuente: 'gate', tipo: 'SIN_PRECIO',
    aplicar: (c, fx) => c.query('update public.recurso_precio set fecha_precio = null where recurso_id = $1', [fx.recursos[1].id]),
  },
  {
    nombre: '3 · recurso requerido sin ninguna observación de precio',
    fuente: 'gate', tipo: 'SIN_PRECIO',
    aplicar: async (c, fx) => {
      const { rows: [r] } = await c.query(`insert into public.recurso (codigo, nombre, unidad, tipo, desperdicio, origen)
        values ($1, 'Malla Q188 sin precio (fixture)', 'm2', 'material', 0, 'ZZ-XSAS') returning id`, [`ZZ-XSAS-NOPRE-${fx.sufijo}`])
      await c.query('insert into public.analisis_linea (analisis_id, recurso_id, cantidad, orden) values ($1,$2,1.1,9)', [fx.analisisId, r.id])
    },
  },
  {
    nombre: '4 · composición inconsistente: la partida se queda sin análisis',
    fuente: 'gate', tipo: 'SIN_COMPOSICION',
    aplicar: (c, fx) => c.query('update public.cotizacion_partida set analisis_id = null where id = $1', [fx.partidaId]),
  },
  {
    nombre: '5 · conflicto material: el alcance dice dos cosas de la misma partida',
    fuente: 'gate', tipo: 'CONFLICTO',
    aplicar: async (c, fx) => {
      for (const [patron, estado] of [['tabique', 'INCLUIDO'], ['hormigón', 'EXCLUIDO']]) {
        await c.query(`insert into public.cotizacion_alcance (cotizacion_id, patron, estado, fuente, texto_literal)
          values ($1,$2,$3,'ZZ-XSAS','conflicto fabricado para la prueba')`, [fx.cotizacionId, patron, estado])
      }
    },
  },
  {
    nombre: '6 · policy inexistente: la cotización se queda sin política comercial',
    fuente: 'validacion', tipo: 'SIN_POLITICA_COMERCIAL',
    aplicar: async (c, fx) => {
      await c.query('delete from public.cotizacion_politica_ref where cotizacion_id = $1', [fx.cotizacionId])
      await c.query(`update public.cotizaciones set pct_gastos_generales=null, pct_beneficio=null,
        pct_financiero=null, factor_financiero=null, pct_iibb=null, pct_ganancias=null,
        pct_cheque=null, pct_iva=null where id = $1`, [fx.cotizacionId])
    },
  },
  {
    nombre: '7 · genealogía rota: la cantidad pierde el documento del que salió',
    fuente: 'validacion', tipo: 'SIN_ORIGEN_DOCUMENTAL',
    aplicar: (c, fx) => c.query('delete from public.computo where cotizacion_partida_id = $1', [fx.partidaId]),
  },
]

/** Corre UNA mutación: aplicar → tiene que cortar → revertir → tiene que volver a permitir. */
async function correrMutacion(c, fx, m, i) {
  const sp = `mut_${i}`
  await c.query(`savepoint ${sp}`)
  await m.aplicar(c, fx)
  const g = await gate(c, fx.cotizacionId)
  const v = await valida(c, fx.cotizacionId)
  const bloqueos = m.fuente === 'gate' ? g.blocking_issues : v.ciegos
  const corta = m.fuente === 'gate' ? !g.ready : !v.ready_estricto
  const vistos = tipos(bloqueos)
  await c.query(`rollback to savepoint ${sp}`)
  const gVuelta = await gate(c, fx.cotizacionId)
  const vVuelta = await valida(c, fx.cotizacionId)
  return {
    nombre: m.nombre, fuente: m.fuente, esperado: m.tipo,
    corta, tieneElTipo: vistos.includes(m.tipo), vistos,
    vuelveAVerde: gVuelta.ready && vVuelta.ready_estricto,
    readyGateBajoLaMutacion: g.ready,
  }
}

/**
 * El congelado REAL sobre el borrador válido. Lo que prueba que congeló es `congelada_en` leída en
 * su destino, nunca el jsonb que devolvió la función.
 *
 * ═══ SE CONGELA COMO LA PERSONA, NO COMO EL POOL ═══
 *
 * `cot_permiso('FREEZE')` deriva del rol del PERFIL de quien pregunta. Sin identidad, `current_rol()`
 * no devuelve nada y la función rebota con «congelar exige el permiso FREEZE» — medido. Congelar
 * como el dueño del pool probaría que la lógica del gate anda, no que una persona con FREEZE puede
 * congelar: son dos afirmaciones distintas y la segunda es la que importa. La fila final se lee
 * DESPUÉS de `reset role`, para que ninguna policy la esconda y un `null` signifique de verdad que
 * no se congeló.
 */
async function congelarDeVerdad(c, fx) {
  const antes = (await c.query('select congelada_en from public.cotizaciones where id=$1', [fx.cotizacionId])).rows[0]
  const res = await congelarBorrador(c, fx)
  if (!res) return { NO_MEDIDO: 'no hay ningún perfil con rol `direccion` en esta base' }
  const { rows: [fila] } = await c.query('select congelada_en, congelada_por from public.cotizaciones where id=$1', [fx.cotizacionId])
  const { rows: [comp] } = await c.query(`select count(*)::int n from public.cotizacion_partida_composicion x
    join public.cotizacion_partida p on p.id=x.partida_id where p.cotizacion_id=$1`, [fx.cotizacionId])
  const { rows: [hue] } = await c.query('select sha256 from public.cotizacion_huella where cotizacion_id=$1', [fx.cotizacionId])
  return {
    congeladaAntes: antes.congelada_en, congeladaDespues: fila.congelada_en,
    congeladaPor: fila.congelada_por,
    lineasComposicion: comp.n, huella: hue?.sha256 ?? null, devuelto: res.devuelto,
  }
}

/** La validación NO escribe: el hash del estado tiene que ser idéntico antes y después. El hash lo
 *  toma el llamador —no la validación— porque un control no se valida contra lo que él mismo produce. */
async function probarSoloLectura(c, id) {
  const h = async () => (await c.query('select public.xsas_freeze_hash_estado($1) as h', [id])).rows[0].h
  const antes = await h()
  await valida(c, id)
  await c.query('select public.xsas_genealogia_cadena(p.id) from public.cotizacion_partida p where p.cotizacion_id=$1', [id])
  const despues = await h()
  return { antes, despues, iguales: antes === despues }
}

async function main() {
  const c = await getPool().connect()
  try {
    await c.query('begin')
    const fx = await crearBorradorValido(c)
    const g0 = await gate(c, fx.cotizacionId)
    const v0 = await valida(c, fx.cotizacionId)
    const casc = (await c.query('select costo_directo, venta_sin_iva from public.cotizacion_cascada where id=$1', [fx.cotizacionId])).rows[0]

    console.log('══ CAMINO VERDE ══')
    console.log(`cotización ${fx.cotizacionId} · partida ${fx.partidaCodigo} · ${fx.cantidad} m3`)
    console.log(`gate.ready = ${g0.ready} · validacion.ready_estricto = ${v0.ready_estricto}`)
    console.log(`costo directo = ${casc.costo_directo} · venta sin IVA = ${casc.venta_sin_iva}`)

    console.log('\n══ SÓLO LECTURA ══')
    console.log(JSON.stringify(await probarSoloLectura(c, fx.cotizacionId)))

    console.log('\n══ SIETE MUTACIONES ══')
    for (let i = 0; i < MUTACIONES.length; i++) {
      const r = await correrMutacion(c, fx, MUTACIONES[i], i)
      console.log(`${r.corta && r.tieneElTipo && r.vuelveAVerde ? 'OK  ' : 'MAL '} ${r.nombre}`)
      console.log(`      corta=${r.corta} (${r.fuente}) tipo=${r.tieneElTipo} vuelveAVerde=${r.vuelveAVerde} vistos=${r.vistos.join(',') || '—'}`)
      if (r.fuente === 'validacion') console.log(`      ATENCIÓN: el gate de producción dijo ready=${r.readyGateBajoLaMutacion} — HOY ESTO SE CONGELARÍA`)
    }

    console.log('\n══ CONGELADO REAL ══')
    console.log(JSON.stringify(await congelarDeVerdad(c, fx), null, 1))
  } finally {
    await c.query('rollback').catch(() => {})
    c.release()
    await getPool().end()
  }
}

if (import.meta.url === `file://${process.argv[1]}`) await main()
