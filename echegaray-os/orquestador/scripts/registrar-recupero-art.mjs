#!/usr/bin/env node
// REGISTRA UN REINTEGRO DE ART — el hecho que el OS veía entrar al banco sin saber qué era.
//
// Entra el JSON de la orden de pago de la aseguradora (transcripto del PDF), sale un registro que
// NETEA el costo de nómina de los meses TRABAJADOS que recupera. En CAJA no toca nada: el cobro ya
// está en el saldo del extracto y sumarlo otra vez lo contaría dos veces. Toda la razón de por qué va
// acá y no en Cobranzas está en `lib/recupero-art.mjs`.
//
// ANTES DE ESCRIBIR, BUSCA LA PRUEBA. Un recupero se da por cobrado sólo si un crédito del extracto lo
// respalda, y lo que se guarda es la REFERENCIA del banco — nunca el saldo corrido, que cambia cuando
// se inserta un movimiento anterior. Sin respaldo, el registro entra igual pero marcado, porque el
// hecho documental existe; lo que no se puede es afirmar que la plata está.
//
// IDEMPOTENTE. La identidad de un reintegro es (siniestro, orden de pago). Correrlo dos veces
// actualiza el mismo registro; nunca duplica un neteo.
//
//   node orquestador/scripts/registrar-recupero-art.mjs --file <orden.json> [--dry]
//
// El JSON, con los campos que la orden de pago trae:
//   {
//     "siniestro": "3012927", "solicitud": "…", "orden_pago": "…",
//     "aseguradora": "Prevención ART", "cuit_aseguradora": "30-68436191-7",
//     "trabajador": "APELLIDO NOMBRE", "documento": "44.527.554", "contingencia": "ilt",
//     "fecha_cobro": "2026-08-11", "cbu_acreditacion": "…",
//     "importe_solicitado": 1042045.00, "importe_liquidado": 914612.42,
//     "conceptos": { "remunerativo": …, "sac": …, "no_remunerativo": …, "contribuciones": … },
//     "periodos": [ { "periodo": "2026-06", "monto": … }, { "periodo": "2026-07", "monto": … } ]
//   }
//
// `periodos` admite `monto` (la liquidación por período: es un HECHO) o `dias` (prorrateo: queda
// marcado ESTIMACIÓN). Si no está, el recupero se registra entero y SIN IMPUTAR — visible en
// `public.recupero_art_sin_imputar` — y no netea ningún mes hasta que se complete. No se prorratea a
// ojo: una precisión inventada se convierte en "el costo de junio" y nadie la vuelve a mirar.

import { readFileSync } from 'node:fs'
import { query, closePool } from '../lib/db.mjs'
import { normalizarRecupero, imputar, respaldoDelCobro, formatRecupero } from '../lib/recupero-art.mjs'

const args = process.argv.slice(2)
const DRY = args.includes('--dry')
const file = args[args.indexOf('--file') + 1]

if (!file || file.startsWith('--')) {
  console.error('Falta --file <orden.json>. Ver la cabecera de este script para el formato.')
  process.exit(1)
}

/** Los créditos del extracto alrededor de la fecha de cobro. Es la ventana donde puede estar la prueba. */
async function creditosCerca(fecha, dias = 5) {
  const r = await query(
    `select fecha::text, concepto, importe, referencia
       from public.banco_movimientos
      where importe > 0
        and fecha between $1::date - $2::int and $1::date + $2::int`,
    [fecha, dias],
  )
  return (r.rows ?? []).map((m) => ({ ...m, fecha: String(m.fecha).slice(0, 10) }))
}

async function main() {
  const doc = JSON.parse(readFileSync(file, 'utf8'))
  const recupero = normalizarRecupero(doc)
  const imputacion = imputar(recupero, doc.periodos ?? [])
  const respaldo = respaldoDelCobro(recupero.cabecera, await creditosCerca(recupero.cabecera.fecha_cobro))

  console.log(formatRecupero(recupero, imputacion, respaldo))
  console.log('')

  if (DRY) {
    console.log('  --dry: no se escribió nada.')
    return
  }

  const c = recupero.cabecera
  const ins = await query(
    `insert into public.recupero_art
       (siniestro, contingencia, aseguradora, cuit_aseguradora, trabajador, documento, solicitud,
        orden_pago, fecha_cobro, cbu_acreditacion, importe_solicitado, importe_liquidado, diferencia,
        referencia_banco, documento_origen)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
     on conflict (siniestro, orden_pago) do update set
       contingencia=excluded.contingencia, aseguradora=excluded.aseguradora,
       cuit_aseguradora=excluded.cuit_aseguradora, trabajador=excluded.trabajador,
       documento=excluded.documento, solicitud=excluded.solicitud, fecha_cobro=excluded.fecha_cobro,
       cbu_acreditacion=excluded.cbu_acreditacion, importe_solicitado=excluded.importe_solicitado,
       importe_liquidado=excluded.importe_liquidado, diferencia=excluded.diferencia,
       referencia_banco=excluded.referencia_banco, documento_origen=excluded.documento_origen,
       registrado_en=now()
     returning id`,
    [c.siniestro, c.contingencia, c.aseguradora, c.cuit_aseguradora, c.trabajador, c.documento,
      c.solicitud, c.orden_pago, c.fecha_cobro, c.cbu_acreditacion, c.importe_solicitado,
      c.importe_liquidado, c.diferencia, respaldo.respaldado ? respaldo.referencia_banco : null,
      c.documento_origen],
  )
  const id = (ins.rows ?? [])[0]?.id
  if (!id) throw new Error('la cabecera del recupero no devolvió id: no se escriben las imputaciones a ciegas')

  // LAS IMPUTACIONES SE REEMPLAZAN ENTERAS. Si el desglose cambió (llegó la liquidación por período y
  // antes estaba sin imputar), dejar la vieja al lado de la nueva netearía el mes DOS VECES.
  await query('delete from public.recupero_art_imputacion where recupero_id = $1', [id])
  for (const r of imputacion.renglones) {
    await query(
      `insert into public.recupero_art_imputacion
         (recupero_id, periodo, concepto, concepto_nombre, linea, monto, metodo, es_estimacion)
       values ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [id, r.periodo, r.concepto, r.concepto_nombre, r.linea, r.monto, imputacion.metodo, imputacion.es_estimacion],
    )
  }

  // LA EVIDENCIA ES EL DATO LEÍDO EN SU DESTINO, no la pantalla que respondió que sí.
  const v = await query(
    `select to_char(mes,'YYYY-MM') mes, jornales, cargas_sociales, costo_nomina,
            recupero_art, costo_nomina_neto, es_estimacion
       from public.nomina_por_mes
      where mes in (select to_date(periodo||'-01','YYYY-MM-DD')
                      from public.recupero_art_imputacion where recupero_id = $1 and periodo <> '')
      order by mes`,
    [id],
  )
  console.log(`  Escrito: recupero ${id} · ${imputacion.renglones.length} renglón(es) de imputación.`)
  if (!v.rows?.length) {
    console.log('  ⚠ El recupero NO netea ningún mes todavía (sin imputar). Se ve en public.recupero_art_sin_imputar.')
    return
  }
  console.log('')
  console.log('  COSTO DE NÓMINA DEVENGADO, YA NETEADO (leído de public.nomina_por_mes):')
  console.log('    MES       BRUTO            RECUPERO ART      NETO')
  for (const r of v.rows) {
    const $ = (x) => `$${Number(x).toLocaleString('es-AR', { maximumFractionDigits: 2 })}`
    console.log(`    ${r.mes}   ${$(r.costo_nomina).padStart(14)}   ${$(r.recupero_art).padStart(14)}   ${$(r.costo_nomina_neto).padStart(14)}`)
  }
}

main()
  .catch((e) => { console.error(`ERROR: ${e.message}`); process.exitCode = 1 })
  .finally(() => closePool())
