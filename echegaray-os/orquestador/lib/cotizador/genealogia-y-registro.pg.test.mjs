// LA EVIDENCIA DEL EFECTO: la fila escrita en su destino, no la función que dijo que sí.
//
// ═══ LOS DOS HECHOS QUE ESTE TEST FIJA ═══
//
// Medido sobre la base real el 03/09/2026, antes de este trabajo:
//
//   origen = 'xsas:plano'   →  12 cotizaciones,  58 partidas,  73 líneas de `computo`
//   origen = 'os'           →   7 cotizaciones, 110 partidas,   0 líneas de `computo`
//   cotizacion_politica_ref →  0 filas en toda la base
//   cotizacion_indirecto    →  0 filas en toda la base
//
// Todo adentro de un `begin`/`rollback`: `COT-2026-001/002/003` son documentos emitidos y no se
// tocan. Lo que se prueba es que el CAMINO produce el efecto, y eso se lee del destino real —
// `public.computo`, `cotizacion_politica_ref`, `cotizacion_indirecto`— con un SELECT aparte.
//
// ═══ POR QUÉ SE COTIZA CON `origen = 'os'` ═══
//
// Porque el hueco no era del motor: era que el camino productivo no pasaba por él. Pasarle
// `origen: 'os'` a `persistir()` prueba que la genealogía no depende de la etiqueta — depende de
// que la cotización nazca del emisor.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { getPool } from '../db.mjs'
import { agruparPartidas, armar, persistir } from '../plano/cotizacion-v0.mjs'
import { leerPoliticaDeCotizacion, leerIndirectoDeCotizacion } from './politica-pg.mjs'

const hayBase = await getPool().query('select 1').then(() => true).catch(() => false)

/** Un mapeo como el que produce `plano/pipeline.mjs`: el elemento con su evidencia literal. */
const mapeo = (tarea) => ({
  estado: 'MAPEADA',
  tarea,
  porQue: 'la sección coincide con la tarea de la Base Maestra',
  computo: {
    id: 'C1', nombre: 'Columna 40×20', sistema: 'hormigon_armado', unidad: 'm3',
    archivo: 'Plano de Estructura.pdf', lamina: 'E-01',
    cantidad: { valor: 3.36, formula: '0.40 × 0.20 × 3.50 × 12', entradas: { b: 0.4, h: 0.2, l: 3.5, n: 12 } },
    evidencia: { archivoId: '1PlAn0DeEstructura', textoLiteral: 'C1 H=3.50m ... 0.40 0.20 ... 2 Ø 16', vista: 'planta de fundaciones' },
  },
})

test('cotizador · genealogía y registro de política/indirecto contra la base', { skip: !hayBase }, async (t) => {
  const c = await getPool().connect()
  const query = (sql, params) => c.query(sql, params)
  const uno = async (sql, params) => (await c.query(sql, params)).rows[0]

  try {
    await c.query('begin')
    const tarea = await uno(`select id, codigo, nombre, unidad from public.tarea_tipo order by codigo limit 1`)
    assert.ok(tarea, 'la base no tiene ninguna tarea de la Base Maestra: sin eso no hay partida que cotizar')

    const { partidas } = agruparPartidas([mapeo(tarea)])
    const cot = armar({ cliente: 'QA — rollback', obraNombre: 'QA genealogía', partidas })
    const numero = `COT-QA-GENEALOGIA-${Date.now().toString(36).slice(-6)}`
    const { cotizacionId, registro } = await persistir({ query }, cot, { numero, origen: 'os' })

    await t.test('la cotización quedó con origen «os» — el camino del negocio real', async () => {
      const f = await uno('select origen, numero from public.cotizaciones where id = $1', [cotizacionId])
      assert.equal(f.origen, 'os')
      assert.equal(f.numero, numero)
    })

    await t.test('LA CADENA SE NAVEGA: partida → elemento → documento → cita literal → fórmula → cantidad', async () => {
      const l = await uno(
        `select p.descripcion, k.elemento, k.documento_nombre, k.documento_drive_id, k.sector,
                k.cantidad, k.origen, k.criterio
           from public.computo k
           join public.cotizacion_partida p on p.id = k.cotizacion_partida_id
          where p.cotizacion_id = $1`, [cotizacionId])
      assert.ok(l, 'CERO líneas de cómputo: es exactamente el defecto que este trabajo vino a arreglar')
      assert.equal(l.documento_nombre, 'Plano de Estructura.pdf')
      assert.equal(l.documento_drive_id, '1PlAn0DeEstructura')
      assert.equal(l.sector, 'E-01')
      assert.equal(l.elemento, 'C1 — Columna 40×20')
      assert.equal(Number(l.cantidad), 3.36)
      assert.equal(l.origen, 'plano')
      assert.match(l.criterio, /0\.40 × 0\.20 × 3\.50 × 12/)
      assert.match(l.criterio, /el plano dice «C1 H=3\.50m \.\.\. 0\.40 0\.20 \.\.\. 2 Ø 16»/)
    })

    await t.test('la vista de trazabilidad dice que la partida es la suma de su cómputo', async () => {
      const v = await uno('select n_lineas, n_documentos, n_estimadas, lectura from public.computo_de_partida where cotizacion_id = $1', [cotizacionId])
      assert.equal(v.n_lineas, 1)
      assert.equal(v.n_documentos, 1)
      assert.equal(v.n_estimadas, 0)
      assert.equal(v.lectura, 'la cantidad de la partida es la suma del cómputo')
    })

    await t.test('LA COTIZACIÓN REFERENCIA UNA VERSIÓN DE POLÍTICA — 0 filas en toda la base hasta hoy', async () => {
      assert.equal(registro.politica.escrita, true, `no se escribió la referencia: ${registro.politica.porQue}`)
      const { referencia } = await leerPoliticaDeCotizacion({ query }, cotizacionId)
      assert.ok(referencia, 'la referencia no está en cotizacion_politica_ref: lo que prueba una escritura es el dato leído en su destino')
      assert.equal(referencia.version, 1)
      // La referencia guarda el NÚMERO y el id de la fila, no los porcentajes: publicar una política
      // nueva no puede reescribir el precio de una oferta ya emitida.
      const f = await uno('select politica_version_id, version from public.cotizacion_politica_ref where cotizacion_id = $1', [cotizacionId])
      const v = await uno('select id from public.politica_comercial_version where version = 1')
      assert.equal(f.politica_version_id, v.id)
    })

    await t.test('EL MOTOR DE INDIRECTOS CORRIÓ, y su resultado NULL es una medición y no una ausencia', async () => {
      assert.equal(registro.indirecto.escrito, true, `no se escribió el indirecto: ${registro.indirecto.porQue}`)
      const ind = await leerIndirectoDeCotizacion({ query }, cotizacionId)
      assert.ok(ind, 'la fila no está en cotizacion_indirecto')
      // Los 14 conceptos reales de `indirecto_concepto` están sin valor y la estructura no tiene
      // costo directo anual: el motor corrió sobre los 14 y no pudo afirmar el porcentaje. NULL, no
      // cero — un indirecto en cero significaría que la empresa no tiene estructura.
      assert.equal(ind.pctCalculado, null)
      assert.equal(ind.pctAplicado, null)
      assert.equal(ind.override, null)
      assert.equal(registro.indirecto.nHuecos, 14, 'si la estructura se completó, este número cambia y el test tiene que revisarse')
      const f = await uno('select estructura_id from public.cotizacion_indirecto where cotizacion_id = $1', [cotizacionId])
      const e = await uno('select id from public.indirecto_estructura where vigente')
      assert.equal(f.estructura_id, e.id, 'la fila tiene que apuntar a la estructura contra la que se midió')
    })

    await t.test('EL REGISTRO PUEDE DECIR QUE NO: si los porcentajes no son los de la versión, no se referencia', async () => {
      // Un control que no puede negarse no es un control. Se negocia el beneficio de esta cotización
      // y la referencia deja de escribirse — decir «se cotizó con la v1» cuando el beneficio se
      // negoció distinto es peor que no decir nada, porque parece auditado.
      const otro = await persistir({ query }, cot, { numero: `${numero}-B`, origen: 'os' })
      await c.query('update public.cotizaciones set pct_beneficio = 0.15 where id = $1', [otro.cotizacionId])
      await c.query('delete from public.cotizacion_politica_ref where cotizacion_id = $1', [otro.cotizacionId])
      const { registrarPoliticaEIndirecto } = await import('./politica-pg.mjs')
      const r = await registrarPoliticaEIndirecto({ query }, { cotizacionId: otro.cotizacionId })
      assert.equal(r.politica.escrita, false)
      assert.match(r.politica.porQue, /pctBeneficio \(0\.15 vs 0\.22\)/)
      const quedo = await uno('select 1 from public.cotizacion_politica_ref where cotizacion_id = $1', [otro.cotizacionId])
      assert.equal(quedo, undefined, 'escribió una referencia que había declarado que no iba a escribir')
    })
  } finally {
    await c.query('rollback')
    c.release()
  }
})
