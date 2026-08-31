// LA HUELLA TIENE QUE REPRESENTAR EL ESTADO ECONÓMICO — UNA MUTACIÓN REAL POR DIMENSIÓN.
//
// ═══ EL DEFECTO QUE ESTO VIGILA, MEDIDO ═══
//
// La auditoría encontró tres corridas con costos directos distintos —`null`, $4.947.000 y
// $5.535.000— que firmaban con la MISMA huella: `huellaDeEntradas` no incluía `aprendizajes`,
// `estructuraIndirecta`, `politicaEfectiva` ni `estadosDeComposicion`. Dos ofertas con precios
// distintos, la misma firma, y «volver a correr con las mismas entradas» dejaba de reproducir el
// número congelado.
//
// ═══ POR QUÉ ESTE ARCHIVO NO COMPARA `correr(e) === correr(e)` ═══
//
// Porque eso es una TAUTOLOGÍA: hashea dos veces el mismo objeto y por supuesto da igual. Estaría
// verde también con la huella rota — de hecho lo estaba. La dirección que importa es la contraria:
// entradas DISTINTAS tienen que dar huellas DISTINTAS. Cada dimensión de acá abajo cambia UNA cosa
// en la base, vuelve a LEER las entradas de la base y exige que el sha256 se mueva; después
// revierte y exige que vuelva al original.
//
// USO:  node orquestador/scripts/xsas-freeze-huella.mjs

import { getPool } from '../lib/db.mjs'
import { huellaDeEntradas } from '../lib/cotizador/freeze.mjs'
import { crearBorradorValido, entradasDeLaCotizacion } from './xsas-freeze-fixture.mjs'

/** Las nueve dimensiones que mueven el número. Cada una es una escritura REAL sobre la base. */
export const DIMENSIONES = [
  {
    dim: 'cantidad', porQue: 'la partida pasa de 12,5 a 13 m3',
    aplicar: (c, fx) => c.query('update public.cotizacion_partida set cantidad = 13 where id = $1', [fx.partidaId]),
  },
  {
    dim: 'composicion', porQue: 'el hormigón por unidad pasa de 1 a 1,2 m3/m3',
    aplicar: (c, fx) => c.query('update public.analisis_linea set cantidad = 1.2 where analisis_id = $1 and recurso_id = $2', [fx.analisisId, fx.recursos[1].id]),
  },
  {
    dim: 'precio', porQue: 'el hormigón pasa de $150.000 a $160.000',
    aplicar: (c, fx) => c.query('update public.recurso_precio set costo = 160000 where recurso_id = $1', [fx.recursos[1].id]),
  },
  {
    dim: 'recurso', porQue: 'la composición suma un recurso que antes no estaba',
    aplicar: async (c, fx) => {
      const { rows: [r] } = await c.query(`insert into public.recurso (codigo, nombre, unidad, tipo, desperdicio, origen)
        values ($1, 'Encofrado fenólico (fixture)', 'm2', 'material', 0, 'ZZ-XSAS') returning id`, [`ZZ-XSAS-ENC-${fx.sufijo}`])
      await c.query(`insert into public.recurso_precio (recurso_id, costo, fecha_precio, fuente, vigente, moneda)
        values ($1, 42000, current_date, 'ZZ-XSAS', true, 'ARS')`, [r.id])
      await c.query('insert into public.analisis_linea (analisis_id, recurso_id, cantidad, orden) values ($1,$2,2.5,7)', [fx.analisisId, r.id])
    },
  },
  {
    dim: 'hh', porQue: 'la mano de obra pasa de 8 a 10 h/m3 — mismo costo de material, más horas',
    aplicar: (c, fx) => c.query('update public.analisis_linea set cantidad = 10 where analisis_id = $1 and recurso_id = $2', [fx.analisisId, fx.recursos[0].id]),
  },
  {
    dim: 'indirecto', porQue: 'se aplica una estructura de indirectos que antes no había',
    aplicar: (c, fx) => c.query(`insert into public.cotizacion_indirecto (cotizacion_id, pct_calculado, pct_aplicado)
      values ($1, 0.18, 0.18)`, [fx.cotizacionId]),
  },
  {
    dim: 'policy', porQue: 'el beneficio pasa de 10 % a 12 %',
    aplicar: (c, fx) => c.query('update public.cotizaciones set pct_beneficio = 0.12 where id = $1', [fx.cotizacionId]),
  },
  {
    dim: 'override', porQue: 'alguien asume un precio vencido y firma el override',
    aplicar: async (c, fx) => {
      const { rows: [quien] } = await c.query("select id from public.perfiles where rol = 'direccion' limit 1")
      await c.query(`insert into public.cotizacion_override_precio (cotizacion_id, recurso_codigo, autorizado_por, motivo)
        values ($1, $2, $3, 'ZZ-XSAS prueba de dimensión')`, [fx.cotizacionId, fx.recursos[1].codigo, quien.id])
    },
  },
  {
    dim: 'scope', porQue: 'el alcance declara una exclusión que antes no existía',
    aplicar: (c, fx) => c.query(`insert into public.cotizacion_alcance (cotizacion_id, patron, estado, fuente, texto_literal)
      values ($1, 'terminación superficial', 'EXCLUIDO', 'ZZ-XSAS', 'no incluye terminación')`, [fx.cotizacionId]),
  },
]

const sha = async (c, id) => huellaDeEntradas(await entradasDeLaCotizacion(c, id)).sha256

/** Aplica UNA dimensión, mide el sha, revierte y vuelve a medir. */
export async function correrDimension(c, fx, d, i) {
  const base = await sha(c, fx.cotizacionId)
  await c.query(`savepoint dim_${i}`)
  await d.aplicar(c, fx)
  const mutado = await sha(c, fx.cotizacionId)
  await c.query(`rollback to savepoint dim_${i}`)
  const vuelta = await sha(c, fx.cotizacionId)
  return { dim: d.dim, porQue: d.porQue, base, mutado, vuelta, cambio: base !== mutado, revierte: base === vuelta }
}

async function main() {
  const c = await getPool().connect()
  try {
    await c.query('begin')
    const fx = await crearBorradorValido(c)
    const base = await sha(c, fx.cotizacionId)
    console.log(`huella base: ${base}\n`)
    // La MISMA base leída dos veces da lo mismo. Es lo único que la reproducibilidad exige de este
    // lado, y es UNA línea — no el test entero, porque sola no prueba nada.
    console.log(`estable al releer la base: ${base === (await sha(c, fx.cotizacionId))}\n`)
    for (let i = 0; i < DIMENSIONES.length; i++) {
      const r = await correrDimension(c, fx, DIMENSIONES[i], i)
      console.log(`${r.cambio && r.revierte ? 'OK  ' : 'MAL '} ${r.dim.padEnd(12)} ${r.porQue}`)
      console.log(`      cambia=${r.cambio} revierte=${r.revierte} · ${r.mutado.slice(0, 16)}…`)
    }
  } finally {
    await c.query('rollback').catch(() => {})
    c.release()
    await getPool().end()
  }
}

if (import.meta.url === `file://${process.argv[1]}`) await main()
