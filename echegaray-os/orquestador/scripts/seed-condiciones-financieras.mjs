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
import { filaParaLaTabla as fondefin } from '../lib/linea-fondefin.mjs'

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
  // TARJETA — cupos REALES del resumen (banco-santander.mjs); la TASA de financiación NO viene en el
  // "Detalle de tarjeta", así que se toma de la tasa PUBLICADA por Santander para financiación de
  // saldo Visa, con su fuente y fecha. Va como 'informado' (dato de la web, no del resumen del cliente)
  // hasta que el dueño aporte el resumen de cuenta mensual con la CFT/TNA de SU liquidación.
  // El CFT queda en null a propósito: la fuente publica TNA y TEA, no el CFT; el costo se calcula con
  // TNA + IVA sobre intereses (21%), no con un CFT inventado.
  {
    entidad: 'Banco Santander', producto: `Tarjeta ${TARJETA.cuenta}`,
    tipo_financiacion: 'tarjeta', moneda: 'ARS',
    vigencia_desde: CORTE, vigencia_hasta: TARJETA.vence,
    tna: 0.779, tea: 1.1277, cft: null, iva_sobre_intereses: 0.21,
    limite_disponible: TARJETA.disponible, saldo_utilizado: TARJETA.consumidoPesos,
    fecha_debito: TARJETA.debitoAutomatico, amortizacion: 'revolving',
    fuente: `${ORIGEN} — resumen tarjeta; TASA de financiación: Santander Visa publicada TNA 77,90% / TEA 112,77%, vigencia 01/07→08/08/2026 (santander.com.ar, consultado 24/07/2026)`,
    nivel_confianza: 'informado',
    observaciones: `Cupo de cuotas: límite $${TARJETA.cuotas.limite.toLocaleString('es-AR')}, disponible $${TARJETA.cuotas.disponible.toLocaleString('es-AR')}; cuotas pendientes próximo período $${TARJETA.cuotasPendientes.proximoPeriodo.toLocaleString('es-AR')}. TASA: TNA 77,90% · TEA 112,77% (Santander Visa, financiación de saldo, vigencia 01/07→08/08/2026, consultado 24/07/2026 — INFORMADO, dato de la web). CFT no publicado en la fuente: el costo se calcula con TNA + IVA 21% sobre intereses. Nota BCRA: la financiación de resúmenes de hasta $200.000/mes tiene tope 62%; el consumo de Echegaray ($998k) supera ese piso, aplica la TNA plena. Reemplazar por la CFT/TNA del resumen de cuenta mensual del cliente cuando esté disponible (pasa a 'verificado').`,
  },
  // PRÉSTAMO PRENDARIO — datos REALES de la liquidación oficial del banco (Drive:
  // "48599_0179_ECHEGARAY CONSTRUCCIONES SAS_30716304643.pdf", Aviso de Liquidación del 07/10/2024).
  // Verificado: capital $25M al 38,9% francés a 60 meses reproduce la cuota del banco ($950.600,38).
  // limite_disponible = 0 A PROPÓSITO: es un préstamo YA DESEMBOLSADO, no una línea de la que se
  // pueda sacar plata nueva → la capa NO lo ofrece como alternativa para un bache (ver paramsParaMotor).
  // Su tasa real sí sirve como referencia de costo (es más barato que el descubierto).
  {
    entidad: 'Banco Santander', producto: 'Préstamo prendario 039101464204',
    tipo_financiacion: 'prestamo', moneda: 'ARS',
    vigencia_desde: '2024-10-07', vigencia_hasta: '2029-10-07',
    tna: 0.389, tea: 0.4664, cft: 0.651, amortizacion: 'francés',
    plazo_dias: null, limite_disponible: 0, saldo_utilizado: null,
    fecha_debito: '2024-11-07',
    garantias: 'Prenda sobre Ford Ranger 3.0 TDI DC 4x4 XLS 2023 (motor BF2SRJ382607, carrocería 8AFBR01J8RJ382607)',
    fuente: 'Comprobante del préstamo — Banco Santander, N°039101464204, emitido 24/07/2026 (aportado por el dueño)',
    nivel_confianza: 'verificado',
    observaciones: 'Datos OFICIALES del comprobante: TNA 38,90% · TEA 46,64% · CFTEA 65,10% (el costo real, más caro que el descubierto 62,78%). Capital $25.000.000, neto acreditado $23.953.674,25, sistema francés, 60 cuotas, débito. Acreditación 07/10/2024, vencimiento 07/10/2029. La cuota francesa pura es ~$950.600, pero el DÉBITO REAL en el extracto es ~$1.282.810 (07/07 $1.282.810,54 · 08/06 $1.284.505,37): la diferencia (~$332k) es seguro + IVA sobre intereses, y por eso el CFTEA (65,10%) supera a la TNA. Es una obligación en curso, NO una línea disponible: no se puede tomar plata nueva.',
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
  // FONDEFIN — la línea de Fiduciaria San Juan que el dueño señaló como faltante (13/08). La ficha
  // entera, con su fórmula de tasa, sus huecos y sus preguntas, vive en lib/linea-fondefin.mjs: acá
  // sólo se siembra. Es la más barata de las que hay cargadas y la única que NO es capital de trabajo.
  fondefin(),
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
