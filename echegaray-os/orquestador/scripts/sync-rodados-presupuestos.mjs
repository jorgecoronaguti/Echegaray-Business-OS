#!/usr/bin/env node
// SYNC de los PRESUPUESTOS DE RODADOS → public.rodados_presupuestos, y de la condición del crédito
// → public.condiciones_financieras (la fuente única de tasas).
//
// POR QUÉ DOS DESTINOS Y NO UNO (13/08). Son dos conceptos distintos y cada uno ya tiene dueño: la
// TASA es de condiciones_financieras, que la Web, el chat y el motor de ingeniería financiera ya
// leen; el PRESUPUESTO (unidad, precio, vigencia, forma de pago, ficha técnica) no tenía dónde vivir
// y va al singleton nuevo. Escribir la tasa en los dos lados sería crear la segunda verdad que este
// sistema ya pagó caro: el snapshot referencia la condición por clave y no repite el número.
//
// NO INVENTA NADA: todo sale de orquestador/lib/rodados-datos.mjs, que es transcripción literal de
// los adjuntos. Idempotente: upsert del singleton + upsert por clave única de la condición.
//
//   node orquestador/scripts/sync-rodados-presupuestos.mjs
//   node orquestador/scripts/sync-rodados-presupuestos.mjs --dry   (no escribe: muestra qué haría)
import { query, closePool } from '../lib/db.mjs'
import { registrarCondicion } from '../lib/condiciones-financieras.mjs'
import {
  presupuestosAlDia, loQueFalta, CONDICION_CREDITO_RODADO, FECHA_ADJUNTOS, ORIGEN_ADJUNTOS,
} from '../lib/rodados-datos.mjs'
import { compararFormasDePago } from '../lib/rodados-financiacion.mjs'

/** El documento que va al singleton. `clave` y `desconocido` no son columnas: no viajan a la tasa. */
function armarDoc(hoy = new Date()) {
  const presupuestos = presupuestosAlDia(hoy)
  const conPrecio = presupuestos.filter((p) => p.tiene_precio)
  return {
    presupuestos,
    condicion_financiera: {
      clave: CONDICION_CREDITO_RODADO.clave,
      entidad: CONDICION_CREDITO_RODADO.entidad,
      producto: CONDICION_CREDITO_RODADO.producto,
      // La TASA vive en public.condiciones_financieras. Acá va sólo el puntero, para que nadie tenga
      // que decidir cuál de las dos copias está bien cuando alguna se actualice.
      donde_vive_la_tasa: 'public.condiciones_financieras',
    },
    // La comparación viaja CALCULADA, no como insumo para que la recalcule quien la lea: si la Web
    // reprodujera la fórmula, habría dos versiones del costo del plazo y un día dirían distinto.
    comparacion_formas_de_pago: compararFormasDePago(),
    falta: loQueFalta(),
    resumen: {
      total_presupuestos: presupuestos.length,
      con_precio: conPrecio.length,
      vigentes: presupuestos.filter((p) => p.vigente === true).length,
      vencidos: presupuestos.filter((p) => p.vigente === false).length,
    },
    fecha_adjuntos: FECHA_ADJUNTOS,
    origen: ORIGEN_ADJUNTOS,
    nota: 'Transcripción de los adjuntos del dueño. Cada dato lleva el adjunto del que salió; lo que no se pudo leer está en falta[], no en un valor razonable.',
    generado_en: new Date().toISOString(),
  }
}

async function main() {
  const dry = process.argv.includes('--dry')
  const doc = armarDoc()

  if (dry) {
    console.log(JSON.stringify(doc.resumen, null, 2))
    console.log(`· ${doc.falta.length} datos declarados como no leídos`)
    console.log('· condición a registrar:', CONDICION_CREDITO_RODADO.producto)
    return
  }

  await query(
    `insert into public.rodados_presupuestos (id, presupuestos, calculado_en, actualizado_en)
     values (1, $1::jsonb, now(), now())
     on conflict (id) do update set
       presupuestos = excluded.presupuestos,
       calculado_en = excluded.calculado_en,
       actualizado_en = now()`,
    [JSON.stringify(doc)],
  )

  // Tres claves del módulo NO son columnas de condiciones_financieras y se sacan a mano: `clave` (el
  // puntero que usa el snapshot), `desconocido` (la lista de límites, que ya viaja en falta[]) y
  // `adjunto` (que ya está dentro de `fuente`). El test de rodados-datos verifica que sean ésas y no
  // otras: una clave nueva que no sea columna se pierde en el INSERT sin decir una palabra.
  const cond = { ...CONDICION_CREDITO_RODADO }
  for (const k of ['clave', 'desconocido', 'adjunto']) delete cond[k]
  const res = await registrarCondicion({}, cond)
  if (!res.ok) throw new Error(`no pude registrar la condición del crédito: ${res.motivo}`)

  const { resumen } = doc
  console.log(`✓ rodados materializados · ${resumen.total_presupuestos} presupuestos (${resumen.con_precio} con precio, ${resumen.vencidos} vencidos) · ${doc.falta.length} datos sin leer`)
  console.log(`✓ condición registrada en condiciones_financieras · ${cond.entidad} — ${cond.producto}`)
}

main().then(() => closePool()).catch(async (e) => { console.error('sync-rodados-presupuestos falló:', e?.message ?? e); await closePool(); process.exit(1) })
