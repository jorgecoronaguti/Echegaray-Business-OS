#!/usr/bin/env node
// SEMBRAR LAS CONDICIONES FINANCIERAS REALES en public.condiciones_financieras.
//
// NO DUPLICA VALORES. Las tasas y límites se leen de donde ya están autorados —banco-santander.mjs
// (extracto verificado al 22/07) y costo-descubierto.mjs (el modelo del descubierto reproducido al
// centavo)— y se copian a la fuente única. Un número, un dueño; la tabla se llena desde él.
//
// LO QUE NO SE SABE, NO SE INVENTA: el préstamo prendario aparece en el extracto pero sin sus
// términos, y la tarjeta no publica la TNA de sus cuotas. Esas filas entran con las tasas en NULL y
// nivel_confianza 'pendiente', diciendo exactamente qué falta y de dónde sacarlo.
import { query, closePool } from '../lib/db.mjs'
import { ACUERDO, TARJETA, CORTE, ORIGEN } from '../lib/banco-santander.mjs'
import { TASAS } from '../lib/costo-descubierto.mjs'

// upsert por la clave única (entidad, producto, tipo, moneda, vigencia_desde): re-correrlo actualiza,
// no duplica. Sólo se tocan las filas de esta semilla; las cargadas a mano quedan intactas.
async function upsert(c) {
  const cols = ['entidad', 'producto', 'tipo_financiacion', 'moneda', 'vigencia_desde', 'vigencia_hasta',
    'tna', 'tea', 'cft', 'iva_sobre_intereses', 'comisiones', 'gastos', 'plazo_dias', 'dias_minimos',
    'limite_disponible', 'saldo_utilizado', 'amortizacion', 'fecha_debito', 'garantias', 'fuente',
    'nivel_confianza', 'observaciones']
  const vals = cols.map((k) => c[k] ?? null)
  const ph = cols.map((_, i) => `$${i + 1}`).join(',')
  const set = cols.filter((k) => !['entidad', 'producto', 'tipo_financiacion', 'moneda', 'vigencia_desde'].includes(k))
    .map((k) => `${k}=excluded.${k}`).concat('actualizado_en=now()').join(', ')
  await query(
    `insert into public.condiciones_financieras (${cols.join(',')}) values (${ph})
     on conflict (entidad, producto, tipo_financiacion, moneda, coalesce(vigencia_desde,'1900-01-01'::date))
     do update set ${set}`, vals)
}

const SEED = [
  // DESCUBIERTO — condición REAL y VERIFICADA al centavo (costo-descubierto reprodujo el cargo del
  // extracto). El CFT es el efectivo total; el IVA sobre intereses es 10,5% + 1,5% percepción = 12%.
  {
    entidad: 'Banco Santander', producto: `Acuerdo de descubierto N°${ACUERDO.numero}`,
    tipo_financiacion: 'descubierto', moneda: 'ARS',
    vigencia_desde: CORTE, vigencia_hasta: ACUERDO.vence,
    tna: ACUERDO.tna, tea: ACUERDO.tea, cft: ACUERDO.cft,
    iva_sobre_intereses: TASAS.iva + TASAS.percepcion,
    limite_disponible: ACUERDO.importe, saldo_utilizado: null,
    amortizacion: 'revolving', garantias: 'acuerdo en cuenta corriente',
    fuente: ORIGEN, nivel_confianza: 'verificado',
    observaciones: `Cargo reproducido al centavo contra el extracto (interés × ${(1 + TASAS.iva + TASAS.percepcion).toFixed(2)}). El límite es el del acuerdo; el saldo utilizado sale del saldo negativo de la cuenta en el momento.`,
  },
  // TARJETA — límite y disponible REALES del resumen; la TNA de financiación de cuotas NO la publica
  // el resumen, así que va en NULL (pendiente). No se inventa.
  {
    entidad: 'Banco Santander', producto: `Tarjeta ${TARJETA.cuenta}`,
    tipo_financiacion: 'tarjeta', moneda: 'ARS',
    vigencia_desde: CORTE, vigencia_hasta: TARJETA.vence,
    tna: null, tea: null, cft: null,
    limite_disponible: TARJETA.disponible, saldo_utilizado: TARJETA.consumidoPesos,
    fecha_debito: TARJETA.debitoAutomatico, amortizacion: 'revolving',
    fuente: `${ORIGEN} — resumen tarjeta`, nivel_confianza: 'informado',
    observaciones: `Cupo de cuotas: límite $${TARJETA.cuotas.limite.toLocaleString('es-AR')}, disponible $${TARJETA.cuotas.disponible.toLocaleString('es-AR')}. FALTA la TNA de financiación de cuotas — está en el resumen mensual o se pide al banco; sin ella no se calcula el costo de financiar con tarjeta.`,
  },
  // PRÉSTAMO PRENDARIO — existe (débito real en el extracto: "Prestamos prendarios 0179-039101464204"),
  // pero sus términos (tasa, sistema, cuotas, seguro) NO están en el extracto. Fila 'pendiente'.
  {
    entidad: 'Banco Santander', producto: 'Préstamo prendario 0179-039101464204',
    tipo_financiacion: 'prestamo', moneda: 'ARS',
    vigencia_desde: null, vigencia_hasta: null,
    tna: null, tea: null, cft: null, amortizacion: null,
    fuente: `${ORIGEN} — débito de cuota en el extracto`, nivel_confianza: 'pendiente',
    observaciones: 'Cuota debitada el 07/07 por $1.282.810,54. FALTAN tasa, sistema de amortización, cuotas restantes y seguro — están en el contrato/liquidación del préstamo (pedir al banco o buscar en Drive). Sin eso no se compara su costo total.',
  },
  // IMPUESTO AL CHEQUE — Ley 25.413 (débitos y créditos). 0,6% cada lado. Es un costo cierto que
  // afecta a cheques/eCheq/transferencias, no una línea de financiación. Verificar vigencia de la
  // alícuota antes de usarla como definitiva (por eso 'informado', no 'verificado').
  {
    entidad: 'ARCA', producto: 'Impuesto a los débitos y créditos bancarios (Ley 25.413)',
    tipo_financiacion: 'impuesto', moneda: 'ARS',
    vigencia_desde: null, vigencia_hasta: null,
    tna: null, tea: null, cft: 0.006,
    fuente: 'Ley 25.413 — alícuota general 0,6% por lado', nivel_confianza: 'informado',
    observaciones: 'Alícuota general 0,6% sobre débitos y sobre créditos (1,2% ida y vuelta). Verificar vigencia y si hay cómputo como pago a cuenta de Ganancias antes de tratarla como costo neto.',
  },
]

async function main() {
  for (const c of SEED) await upsert(c)
  const { rows } = await query(`select tipo_financiacion, entidad, producto, nivel_confianza,
    case when cft is not null then round(cft*100,1)||'%' when tna is not null then round(tna*100,1)||'% TNA' else 'sin tasa' end tasa
    from public.condiciones_financieras order by tipo_financiacion, entidad`)
  console.log(`condiciones sembradas/actualizadas: ${SEED.length}. Estado de la tabla:`)
  for (const r of rows) console.log(`  · ${r.tipo_financiacion.padEnd(24)} ${r.nivel_confianza.padEnd(11)} ${String(r.tasa).padEnd(10)} ${r.entidad} — ${r.producto}`)
  await closePool()
}
main().catch((e) => { console.error(e); process.exit(1) })
