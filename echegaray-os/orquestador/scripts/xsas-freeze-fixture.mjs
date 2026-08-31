// EL BORRADOR VÁLIDO QUE NO EXISTÍA — el camino VERDE del congelado.
//
// ═══ QUÉ FALTABA, MEDIDO ═══
//
// Todos los casos de freeze del repo arrancan de algo que ya está congelado (`COT-2026-001` v1,
// `COT-2026-003` v1) o de algo que BLOQUEA (una partida sin análisis, una cotización sin partidas).
// Nunca se probó que el candado deje pasar algo CORRECTO. Un candado que sólo se probó bloqueando no
// se distingue de un candado soldado: las dos veces dice que no. `control-que-no-puede-decir-que-no`
// al revés — acá hay que demostrar que PUEDE decir que sí.
//
// Este módulo arma, dentro de una transacción, la cotización mínima que el gate tiene que aprobar:
// una partida con cantidad, con análisis vigente, con dos recursos, con precio FRESCO de hoy, sin
// conflicto de alcance, con política comercial referenciada y con el cómputo que dice de qué plano
// salió la cantidad. Después cada mutación le saca UNA de esas piezas.
//
// ═══ POR QUÉ TODO LLEVA `ZZ-XSAS-` Y POR QUÉ NADA SE COMMITEA ═══
//
// La base es la PRODUCTIVA y está compartida. Nada de lo que arma este módulo puede sobrevivir a la
// corrida: se escribe dentro de un `begin` y sale por `rollback` en `finally`. El prefijo es la
// segunda red — si alguna vez algo escapa, se ve y se puede barrer sin adivinar qué era.

import crypto from 'node:crypto'
import { getPool } from '../lib/db.mjs'
import { huellaDeEntradas } from '../lib/cotizador/freeze.mjs'

export const PREFIJO = 'ZZ-XSAS'

const sufijo = () => crypto.randomBytes(4).toString('hex')

/**
 * ¿Estamos DENTRO de una transacción? PostgreSQL no expone el estado de transacción por SQL, pero
 * `SET LOCAL` fuera de un bloque de transacción no hace nada y sólo emite un WARNING: si el valor
 * vuelve leído, hay transacción. Es la única comprobación barata que no depende del driver.
 *
 * Existe porque este módulo ESCRIBE sobre la base productiva. Un llamador distraído que lo use en
 * autocommit dejaría 8 filas basura por corrida y nadie se enteraría hasta el próximo inventario.
 */
async function exigirTransaccion(c) {
  const centinela = `xsas-fixture-${sufijo()}`
  await c.query(`set local application_name = '${centinela}'`)
  const { rows } = await c.query('select current_setting(\'application_name\') as n')
  if (rows[0].n !== centinela) {
    throw new Error('la fixture escribe sobre la base productiva y exige un `begin` abierto: en autocommit dejaría filas ZZ-XSAS vivas')
  }
}

/** La versión de política comercial que la cotización va a referenciar. Se reusa la vigente si la
 *  hay: inventar una versión nueva de la política de la EMPRESA para una prueba es fabricar un dato
 *  de gobernanza, y eso no se hace ni dentro de una transacción. */
async function politicaVersion(c) {
  const { rows } = await c.query(`select id, version from public.politica_comercial_version
    where vigente order by version desc limit 1`)
  if (rows.length) return { ...rows[0], creada: false }
  const { rows: nueva } = await c.query(`insert into public.politica_comercial_version
    (version, estado, vigente, vigencia_desde, fuente, notas)
    values (9990, 'VIGENTE', false, current_date, 'PRUEBA', '${PREFIJO} — fixture del camino verde')
    returning id, version`)
  return { ...nueva[0], creada: true }
}

/** Los dos recursos con su observación de precio de HOY. Dos y no uno: con un solo recurso de mano
 *  de obra el análisis no tendría materiales, y `analisis_costo` separa por tipo — una fixture que
 *  no ejercita esa separación no representa una partida real. */
async function recursosConPrecio(c, sf) {
  const filas = [
    { codigo: `${PREFIJO}-MO-${sf}`, nombre: 'Oficial albañil (fixture)', unidad: 'h', tipo: 'mano_obra', desperdicio: 0, costo: 8000 },
    { codigo: `${PREFIJO}-MAT-${sf}`, nombre: 'Hormigón H21 elaborado (fixture)', unidad: 'm3', tipo: 'material', desperdicio: 0.05, costo: 150000 },
  ]
  const out = []
  for (const f of filas) {
    const { rows: [r] } = await c.query(`insert into public.recurso (codigo, nombre, unidad, tipo, desperdicio, origen)
      values ($1,$2,$3,$4,$5,'${PREFIJO}') returning id, codigo`, [f.codigo, f.nombre, f.unidad, f.tipo, f.desperdicio])
    const { rows: [p] } = await c.query(`insert into public.recurso_precio
      (recurso_id, costo, fecha_precio, fuente, proveedor, vigente, moneda)
      values ($1, $2, current_date, '${PREFIJO}', 'Proveedor de prueba', true, 'ARS') returning id`, [r.id, f.costo])
    out.push({ ...f, id: r.id, precioId: p.id })
  }
  return out
}

/** El análisis vigente y sus dos líneas. `cantidad` en `analisis_linea` es cuánto lleva el recurso
 *  POR UNIDAD de la partida: 8 h/m3 de oficial y 1 m3 de hormigón por m3 de tabique. */
async function analisisConLineas(c, sf, recursos) {
  const { rows: [tt] } = await c.query(`insert into public.tarea_tipo (codigo, nombre, unidad, division, origen)
    values ($1, 'Tabique de hormigón armado (fixture)', 'm3', 'ESTRUCTURA', '${PREFIJO}') returning id`, [`${PREFIJO}-TT-${sf}`])
  const { rows: [a] } = await c.query(`insert into public.analisis (tarea_tipo_id, version, vigente, estado, motivo)
    values ($1, 1, true, 'VALIDADO', '${PREFIJO} — fixture del camino verde') returning id, version`, [tt.id])
  const cantidades = [8, 1]
  const lineas = []
  for (let i = 0; i < recursos.length; i++) {
    const { rows: [l] } = await c.query(`insert into public.analisis_linea (analisis_id, recurso_id, cantidad, orden)
      values ($1,$2,$3,$4) returning id`, [a.id, recursos[i].id, cantidades[i], i])
    lineas.push({ id: l.id, recursoId: recursos[i].id, cantidad: cantidades[i] })
  }
  return { tareaTipoId: tt.id, analisisId: a.id, analisisVersion: a.version, lineas }
}

/** La cotización BORRADOR con su política, su partida y el cómputo que dice de qué plano salió la
 *  cantidad. `vigente = false`: una fixture no compite con la cotización viva de un cliente real. */
async function cotizacionConPartida(c, sf, { analisisId, tareaTipoId }, politica) {
  const { rows: [cot] } = await c.query(`insert into public.cotizaciones
    (numero, version, vigente, estado, obra_nombre, cliente, fecha_cotizacion,
     pct_gastos_generales, pct_beneficio, pct_financiero, factor_financiero,
     pct_iibb, pct_ganancias, pct_cheque, pct_iva)
    values ($1, 1, false, 'borrador', $2, 'Cliente de prueba', current_date,
            0.15, 0.10, 0.02, 0.30, 0.035, 0.02, 0.012, 0.21)
    returning id, version`, [`${PREFIJO}-D-${sf}`, `${PREFIJO} camino verde ${sf}`])
  await c.query(`insert into public.cotizacion_politica_ref (cotizacion_id, politica_version_id, version)
    values ($1,$2,$3)`, [cot.id, politica.id, politica.version])
  const { rows: [par] } = await c.query(`insert into public.cotizacion_partida
    (cotizacion_id, orden, rubro, codigo, descripcion, cantidad, unidad, tarea_tipo_id, analisis_id,
     metodo_medicion, subcontratada)
    values ($1, 1, 'ESTRUCTURA', $2, 'Tabique de hormigón armado H21 e=0,20 m', 12.5, 'm3', $3, $4, 'cantidad', false)
    returning id, codigo, cantidad`, [cot.id, `${PREFIJO}-P-${sf}`, tareaTipoId, analisisId])
  return { cotizacionId: cot.id, cotizacionVersion: cot.version, partidaId: par.id, partidaCodigo: par.codigo, cantidad: Number(par.cantidad) }
}

/** EL PRIMER ESLABÓN: de qué documento, de qué lámina y con qué fórmula salieron los 12,5 m3. Sin
 *  esta fila la partida tiene una cantidad sin origen, que es exactamente lo que `genealogia.mjs`
 *  existe para impedir. */
async function computoDeLaPartida(c, sf, partidaId, cantidad) {
  const { rows: [k] } = await c.query(`insert into public.computo
    (cotizacion_partida_id, documento_drive_id, documento_nombre, revision, elemento, sector, unidad,
     cantidad, origen, criterio)
    values ($1, $2, 'Plano de Estructura — fixture.pdf', 'R00', $3, 'E-01', 'm3', $4, 'plano', $5)
    returning id, elemento, documento_nombre`, [
    partidaId, `${PREFIJO}-DRIVE-${sf}`, `${PREFIJO}-T1 — Tabique de hormigón T1`, cantidad,
    'largo × alto × espesor · entradas {"largo":25,"alto":2.5,"espesor":0.2} · el plano dice «T1 L=25.00m H=2.50m e=0.20 H21»',
  ])
  return { computoId: k.id, elemento: k.elemento, documento: k.documento_nombre }
}

/**
 * EL BORRADOR VÁLIDO COMPLETO. Exige transacción abierta. Devuelve todos los ids que las mutaciones
 * necesitan para sacar UNA pieza por vez y volver a ponerla.
 */
export async function crearBorradorValido(c) {
  await exigirTransaccion(c)
  const sf = sufijo()
  const politica = await politicaVersion(c)
  const recursos = await recursosConPrecio(c, sf)
  const analisis = await analisisConLineas(c, sf, recursos)
  const cot = await cotizacionConPartida(c, sf, analisis, politica)
  const computo = await computoDeLaPartida(c, sf, cot.partidaId, cot.cantidad)
  return { sufijo: sf, politica, recursos, ...analisis, ...cot, ...computo }
}

/**
 * LAS ENTRADAS DE LA HUELLA, LEÍDAS DE LA BASE. Con la forma exacta que `huellaDeEntradas()` espera.
 *
 * Existe para que la huella de una corrida se calcule sobre lo que la base DICE, y no sobre lo que
 * el que la calcula creía que decía. Cada mutación de dimensión —cantidad, composición, precio,
 * recurso, HH, indirecto, política, override, alcance— cambia una de estas listas, y por eso el
 * sha256 se puede probar dimensión por dimensión sin fabricar entradas a mano.
 */
export async function entradasDeLaCotizacion(c, cotizacionId, { hoy = '2026-08-31' } = {}) {
  const uno = async (sql, p = [cotizacionId]) => (await c.query(sql, p)).rows
  const [cot] = await uno(`select pct_gastos_generales, pct_beneficio, pct_financiero, factor_financiero,
    pct_iibb, pct_ganancias, pct_cheque, pct_iva, version from public.cotizaciones where id = $1`)
  const partidas = await uno(`select coalesce(codigo, id::text) as codigo, cantidad, unidad from public.cotizacion_partida where cotizacion_id = $1`)
  const precios = await uno(`select rc.codigo, rp.costo, rp.moneda, rp.fecha_precio, rp.fuente
    from public.cotizacion_partida p
    join public.analisis_linea l on l.analisis_id = p.analisis_id
    join public.recurso rc on rc.id = l.recurso_id
    join public.recurso_precio rp on rp.recurso_id = rc.id and rp.vigente
   where p.cotizacion_id = $1`)
  const documentos = await uno(`select distinct k.documento_drive_id, k.documento_nombre
    from public.computo k join public.cotizacion_partida p on p.id = k.cotizacion_partida_id where p.cotizacion_id = $1`)
  const alcance = await uno('select patron, estado, fuente from public.cotizacion_alcance where cotizacion_id = $1')
  const lineas = await uno(`select rc.codigo, l.cantidad from public.cotizacion_partida p
    join public.analisis_linea l on l.analisis_id = p.analisis_id
    join public.recurso rc on rc.id = l.recurso_id where p.cotizacion_id = $1`)
  const overrides = await uno('select recurso_codigo from public.cotizacion_override_precio where cotizacion_id = $1')
  const [ind] = await uno('select estructura_id, pct_aplicado from public.cotizacion_indirecto where cotizacion_id = $1')
  const [pol] = await uno('select version from public.cotizacion_politica_ref where cotizacion_id = $1')
  return {
    hoy,
    documentos: documentos.map((d) => ({ hash: d.documento_drive_id, nombre: d.documento_nombre })),
    partidas: partidas.map((p) => ({ codigo: p.codigo, cantidad: p.cantidad, unidad: p.unidad })),
    precios: precios.map((p) => ({ recursoCodigo: p.codigo, precio: p.costo, moneda: p.moneda, observadoEn: p.fecha_precio, fuente: p.fuente })),
    politica: cot ? { ...cot, version: cot.version } : null,
    alcance: alcance.map((a) => ({ patron: a.patron, estado: a.estado, fuente: a.fuente })),
    // La composición y los overrides viajan como pares: son las dos dimensiones que el defecto de la
    // huella idéntica sobre costos distintos dejaba afuera.
    estadosDeComposicion: lineas.map((l) => [l.codigo, String(l.cantidad)])
      .concat(overrides.map((o) => [`override:${o.recurso_codigo}`, 'ASUMIDO'])),
    estructuraIndirecta: ind ? { version: ind.estructura_id, conceptos: [], costoDirectoAnual: ind.pct_aplicado } : null,
    politicaEfectiva: pol ? { versionReferenciada: pol.version, valores: cot ?? {} } : null,
  }
}

/**
 * CONGELA EL BORRADOR DE VERDAD, con la identidad de una persona con FREEZE.
 *
 * Vive acá y no en cada script porque los dos lo necesitan y una segunda definición del congelado de
 * prueba es exactamente lo que la Realidad Única prohíbe. Dos detalles que costaron una corrida cada
 * uno, los dos medidos:
 *
 *   · sin identidad, `cot_permiso('FREEZE')` es false y la función rebota — congelar como el dueño
 *     del pool probaría que el gate anda, no que una PERSONA con FREEZE puede congelar;
 *   · `cotizacion_huella.sha256` tiene un CHECK de 64 hex: un `'sha-de-prueba'` rebota, así que la
 *     huella tiene que ser la REAL, calculada con el mismo `huellaDeEntradas()` del motor.
 *
 * Devuelve `null` si no hay ningún perfil de dirección: decirlo es mejor que congelar con otro rol
 * y dar por probado un camino que no se probó.
 */
export async function congelarBorrador(c, fx) {
  const { rows: [quien] } = await c.query("select id from public.perfiles where rol = 'direccion' limit 1")
  if (!quien) return null
  const h = huellaDeEntradas(await entradasDeLaCotizacion(c, fx.cotizacionId))
  await c.query('set local role authenticated')
  await c.query("select set_config('request.jwt.claims', json_build_object('sub', $1::text, 'role', 'authenticated')::text, true)", [quien.id])
  const { rows: [res] } = await c.query('select public.cot_congelar_con_gate($1,$2,$3::jsonb,$4) as r',
    [fx.cotizacionId, h.sha256, JSON.stringify(h.partes), h.resumen])
  await c.query('reset role')
  return { congeladoPor: quien.id, huella: h, devuelto: res.r.congelado }
}

/** Abre la transacción, arma el borrador, corre `fn` y REVIERTE siempre. La única forma segura de
 *  usar esta fixture desde un script suelto: el `rollback` está en `finally`, no al final del try. */
export async function conBorradorValido(fn) {
  const c = await getPool().connect()
  try {
    await c.query('begin')
    const fx = await crearBorradorValido(c)
    return await fn(c, fx)
  } finally {
    await c.query('rollback').catch(() => {})
    c.release()
  }
}
