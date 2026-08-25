#!/usr/bin/env node
// PROYECTA LA RÉPLICA DE COBRANZAS A LA CARA DEL CLIENTE (pantallas 28/29/32).
//
//   node orquestador/scripts/sync-esquema-cliente.mjs [--aplicar]
//
// Sin `--aplicar` es un ENSAYO: calcula todo, muestra qué escribiría y no escribe nada.
//
// ═══ POR QUÉ ES UN SCRIPT APARTE Y NO PARTE DE `sync-cobranzas.mjs` ═══
//
// El contrato dejaba la opción abierta. Va aparte, por tres razones concretas:
//
//  1. NO NECESITA GOOGLE. `sync-cobranzas.mjs` lee el Sheet y necesita credenciales, red hacia
//     Google y que el freno de mano lo deje pasar. Esto lee Postgres y escribe Postgres: 0 API.
//     Meterlo adentro lo haría fallar cada vez que Google no esté, sin ninguna razón.
//  2. UN FALLO ACÁ NO PUEDE VOLTEAR LA RÉPLICA. Son la misma transacción si viven juntos: un error
//     proyectando el portal haría rollback del espejo de Cobranzas, que es el dato del que dependen
//     la caja y el calendario de cobros. La réplica es más importante que el portal.
//  3. SE PUEDE RECONSTRUIR SOLO. La proyección es derivada: hay que poder recalcularla a voluntad
//     —después de arreglar un alias, después de dar de alta un cliente— sin volver a leer el Sheet.
//
// El timer corre a los :10, después del de cobranzas (:00), para trabajar sobre la réplica del día.
//
// ═══ IDEMPOTENCIA ═══
//
// La clave es `cobranza_fila`, con índice único parcial en las dos tablas. Se hace UPSERT, nunca
// delete+insert: `esquema_pago` tiene columnas PROPIAS de la app (visible_portal, aviso_dias,
// nota_interna, orden, publicado_at) que el Sheet no conoce. Borrar y reinsertar perdería el trabajo
// que el admin hizo en la pantalla 32 en cada corrida del timer. Se fusiona, no se rehace.
import { query, closePool } from '../lib/db.mjs'
import { proyectar } from '../lib/portal/cobranzas-a-cliente.mjs'

const APLICAR = process.argv.includes('--aplicar')

/** Los alias que el DUEÑO ya declaró, resueltos hasta el cliente. No se inventa ninguno acá. */
async function cargarIndice() {
  const { rows } = await query(
    `select a.alias, o.cliente_id
       from public.obra_alias a
       join public.obra_canonica o on o.id = a.obra_id
      where o.cliente_id is not null`,
  )
  return rows
}

/** Cuán vieja es la réplica. Proyectar un portal desde una foto de hace semanas es mentirle al cliente. */
async function edadDeLaReplica() {
  const { rows } = await query(
    `select max(sincronizado_en) ult, extract(epoch from (now() - max(sincronizado_en)))/3600 horas
       from public.cobranzas where origen = 'cobranzas_sheet'`,
  )
  return rows[0] ?? { ult: null, horas: null }
}

const MAX_HORAS = Number(process.env.ORQ_PORTAL_MAX_HORAS_REPLICA || 26)

async function main() {
  const edad = await edadDeLaReplica()
  if (edad.horas === null) {
    console.error('la réplica de Cobranzas está vacía — no proyecto nada')
    await closePool(); process.exit(1)
  }
  // El techo es 26 h y no 2 h porque el timer de cobranzas es horario pero la VM puede estar apagada
  // un rato; 26 h deja pasar un día entero de fin de semana y corta antes de que el dato sea de otra
  // semana. Ver el episodio de la réplica singular, congelada 35 días sin que nada avisara.
  if (Number(edad.horas) > MAX_HORAS) {
    console.error(`la réplica de Cobranzas tiene ${Number(edad.horas).toFixed(1)} h (techo ${MAX_HORAS} h).`)
    console.error(`último sync: ${edad.ult}. NO proyecto: el portal mostraría fechas viejas al cliente.`)
    await closePool(); process.exit(1)
  }

  const indice = await cargarIndice()
  const { rows: filas } = await query(
    `select sheet_id, categoria, factura, numero_comprobante, obra_cliente, concepto,
            monto_neto, total_bruto, forma_cobro, estado, fecha_emision, fecha_cobro
       from public.cobranzas where origen = 'cobranzas_sheet'`,
  )
  const { certificados, pagos, sin_cliente, ajustes } = proyectar(filas, indice, new Date())

  console.log(`réplica: ${filas.length} filas (${Number(edad.horas).toFixed(1)} h) · alias: ${indice.length}`)
  console.log(`proyectado: ${certificados.length} certificados · ${pagos.length} pagos · ${ajustes} ajustes (NC)`)
  if (sin_cliente.length) {
    const $ = (n) => `$${Math.round(n).toLocaleString('es-AR')}`
    console.log(`\nSIN CLIENTE RESOLUBLE — ${sin_cliente.length} filas, ${$(sin_cliente.reduce((a, s) => a + s.total, 0))}:`)
    for (const s of sin_cliente) console.log(`  fila ${s.sheet_id}: «${s.texto}» (${s.motivo}) ${$(s.total)}`)
    console.log('  Estas NO entran al portal. Se resuelven agregando el alias en obra_alias.')
  }
  const noAptos = pagos.filter((p) => !p.apto_para_portal).length
  if (noAptos) console.log(`\n${noAptos} pagos quedan marcados NO aptos para el portal (categoría N).`)

  if (!APLICAR) {
    console.log('\nENSAYO: no escribí nada. Agregá --aplicar para escribir.')
    await closePool(); return
  }

  await query('begin')
  try {
    for (const c of certificados) await guardarCertificado(c)
    for (const p of pagos) await guardarPago(p)
    await query('commit')
  } catch (e) {
    await query('rollback')
    console.error('la proyección falló, ROLLBACK:', e.message)
    await closePool(); process.exit(1)
  }
  console.log(`\nescritos ${certificados.length} certificados y ${pagos.length} pagos.`)
  await closePool()
}

// El UPDATE toca SÓLO lo que viene del Sheet. `estado` y `observacion` no se pisan: el estado de
// aprobación lo pone el cliente en el portal y el Sheet no sabe nada de eso.
async function guardarCertificado(c) {
  await query(
    `insert into public.certificado_cliente
       (cliente_id, numero, factura, monto, emitido_at, vence, estado, cobranza_fila,
        huella_comprobante, huella_monto, origen, sincronizado_en)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'sync_cobranzas',now())
     on conflict (cobranza_fila) where cobranza_fila is not null do update
       set numero = excluded.numero, factura = excluded.factura, monto = excluded.monto,
           emitido_at = excluded.emitido_at, vence = excluded.vence,
           huella_comprobante = excluded.huella_comprobante, huella_monto = excluded.huella_monto,
           sincronizado_en = now(), actualizado_at = now()
     where public.certificado_cliente.origen = 'sync_cobranzas'`,
    [c.cliente_id, c.numero, c.factura, c.monto, c.emitido_at, c.vence, c.estado, c.cobranza_fila,
      c.huella_comprobante, c.huella_monto],
  )
}

// Ídem: `visible_portal`, `aviso_dias`, `nota_interna`, `orden` y `publicado_at` NO están en el SET.
// Son del admin y el Sheet no las conoce — pisarlas despublicaría el esquema en cada corrida.
async function guardarPago(p) {
  await query(
    `insert into public.esquema_pago
       (cliente_id, cobranza_fila, huella_comprobante, huella_monto, concepto, fecha, monto,
        estado, medio, origen, sincronizado_en)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,'sync_cobranzas',now())
     on conflict (cobranza_fila) where cobranza_fila is not null do update
       set concepto = excluded.concepto, fecha = excluded.fecha, monto = excluded.monto,
           estado = excluded.estado, medio = excluded.medio,
           huella_comprobante = excluded.huella_comprobante, huella_monto = excluded.huella_monto,
           -- Cambió algo que el cliente ya había visto: se marca para que el admin lo publique.
           cambio_pendiente = (public.esquema_pago.publicado_at is not null
                               and (public.esquema_pago.fecha is distinct from excluded.fecha
                                    or public.esquema_pago.monto is distinct from excluded.monto)),
           sincronizado_en = now(), actualizado_at = now()
     where public.esquema_pago.origen = 'sync_cobranzas'`,
    [p.cliente_id, p.cobranza_fila, p.huella_comprobante, p.huella_monto, p.concepto, p.fecha,
      p.monto, p.estado, p.medio],
  )
}

main().catch((e) => { console.error(e); process.exit(1) })
