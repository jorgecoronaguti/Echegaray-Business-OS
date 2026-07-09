import crypto from 'crypto'

// Calendario de cobros y pagos: agenda día por día de todo el dinero que entra
// y sale, leída del Sheet real "Flujo de Caja - Cash Flow" (pedido de Jorge
// 2026-07-09: "solamente crea un calendario de cobros y pagos, por lo menos").
// Reglas anti doble conteo idénticas a las del CF Semanal del Sheet:
//  - Cobros: 02_Cobranzas no cobradas, por TOTAL Bruto (lo que acredita el banco).
//  - Pagos: Compras Pendiente/Proyectado, EXCEPTO las pagadas con cheque/echeq/
//    tarjeta (esas debitan por sus propias pestañas).
//  - Cheques/echeqs no debitados, por fecha de pago.
//  - Consumos de tarjeta no debitados, por fecha de débito.

const SPREADSHEET_ID = '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
export const SHEET_URL = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/edit`

export type TipoMovimiento = 'cobro' | 'pago' | 'cheque' | 'tarjeta'

export interface Movimiento {
  fecha: string // ISO yyyy-mm-dd
  tipo: TipoMovimiento
  quien: string
  detalle: string
  monto: number // positivo = entra, negativo = sale
}

export interface DiaCalendario {
  fecha: string
  movimientos: Movimiento[]
  neto: number
  acumulado: number
}

export interface Calendario {
  saldoHoy: number | null
  vencidos: Movimiento[]
  dias: DiaCalendario[]
  totalCobros: number
  totalPagos: number
  leidoEn: string
}

async function getAccessToken(saJson: string): Promise<string> {
  const sa = JSON.parse(saJson) as { client_email: string; private_key: string }
  const now = Math.floor(Date.now() / 1000)
  const b64 = (obj: object) => Buffer.from(JSON.stringify(obj)).toString('base64url')
  const input = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/spreadsheets.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  })}`
  const signature = crypto.createSign('RSA-SHA256').update(input).sign(sa.private_key).toString('base64url')
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${input}.${signature}`,
    }),
  })
  if (!res.ok) throw new Error(`token: ${res.status}`)
  return ((await res.json()) as { access_token: string }).access_token
}

type Fila = (string | number | boolean | null)[]
const celda = (r: Fila, i: number) => (r.length > i ? r[i] : null)
const texto = (r: Fila, i: number) => String(celda(r, i) ?? '').trim()
const numero = (r: Fila, i: number) => {
  const v = celda(r, i)
  return typeof v === 'number' ? v : null
}

// Serial de Sheets (base 1899-12-30) -> ISO. 25569 = días hasta 1970-01-01.
function serialAIso(serial: number): string {
  return new Date(Math.round((serial - 25569) * 86400 * 1000)).toISOString().slice(0, 10)
}

export async function leerCalendario(): Promise<Calendario | { error: string }> {
  const saJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON
  if (!saJson) {
    return {
      error:
        'Falta GOOGLE_SERVICE_ACCOUNT_JSON en el entorno. Cargar el JSON de la cuenta de servicio (scripts/google_workspace/credentials/service-account.json) como variable de entorno en Vercel.',
    }
  }
  try {
    const token = await getAccessToken(saJson)
    const rangos = ['02_Cobranzas!A5:Q200', 'Compras!A5:Y940', 'Cheques!A2:L997', "'Tarjeta de Credito'!A3:K200", 'Caja!I7']
    const params = rangos.map((r) => `ranges=${encodeURIComponent(r)}`).join('&')
    const res = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values:batchGet?${params}&valueRenderOption=UNFORMATTED_VALUE`,
      { headers: { Authorization: `Bearer ${token}` }, next: { revalidate: 300 } },
    )
    if (!res.ok) throw new Error(`sheets: ${res.status}`)
    const data = (await res.json()) as { valueRanges: { values?: Fila[] }[] }
    const [cobranzas, compras, cheques, tarjeta, caja] = data.valueRanges.map((v) => v.values ?? [])

    const movimientos: Movimiento[] = []

    // Cobros: estado(O=14) no vacío ni Cobrado, fecha cobro(Q=16), TOTAL Bruto(M=12)
    for (const r of cobranzas) {
      const estado = texto(r, 14)
      const fecha = numero(r, 16)
      const monto = numero(r, 12)
      if (!estado || estado === 'Cobrado' || fecha === null || !monto) continue
      movimientos.push({
        fecha: serialAIso(fecha),
        tipo: 'cobro',
        quien: texto(r, 6) || 'Cliente sin nombre',
        detalle: `${texto(r, 5)} · ${estado}`,
        monto,
      })
    }

    // Pagos: Estado(Y=24) Pendiente/Proyectado, fecha pago(Q=16), Total(O=14),
    // excluyendo medios que debitan por su propia pestaña (Tipo pago P=15)
    const MEDIOS_APARTE = new Set(['cheque', 'echeq', 'tarjeta crédito'])
    for (const r of compras) {
      const estado = texto(r, 24)
      if (estado !== 'Pendiente' && estado !== 'Proyectado') continue
      if (MEDIOS_APARTE.has(texto(r, 15).toLowerCase())) continue
      const fecha = numero(r, 16)
      const monto = numero(r, 14)
      if (fecha === null || !monto) continue
      movimientos.push({
        fecha: serialAIso(fecha),
        tipo: 'pago',
        quien: texto(r, 4) || 'Proveedor sin nombre',
        detalle: [texto(r, 8), texto(r, 11) || texto(r, 10), estado === 'Proyectado' ? 'proyectado' : '']
          .filter(Boolean)
          .join(' · '),
        monto: -monto,
      })
    }

    // Cheques no debitados: DEBITADO(K=10) != SI, fecha de pago(I=8), monto(F=5)
    for (const r of cheques) {
      if (texto(r, 10).toUpperCase() === 'SI') continue
      const fecha = numero(r, 8)
      const monto = numero(r, 5)
      if (fecha === null || !monto) continue
      movimientos.push({
        fecha: serialAIso(fecha),
        tipo: 'cheque',
        quien: texto(r, 4) || 'Proveedor sin nombre',
        detalle: `${texto(r, 0)} N° ${texto(r, 1)}`,
        monto: -monto,
      })
    }

    // Tarjeta no debitada: DEBITADO(J=9) != SI, fecha de pago(H=7), monto(E=4)
    for (const r of tarjeta) {
      if (texto(r, 9).toUpperCase() === 'SI') continue
      const fecha = numero(r, 7)
      const monto = numero(r, 4)
      if (fecha === null || !monto) continue
      movimientos.push({
        fecha: serialAIso(fecha),
        tipo: 'tarjeta',
        quien: texto(r, 2) || 'Proveedor sin nombre',
        detalle: 'débito de tarjeta',
        monto: -monto,
      })
    }

    const hoyIso = new Date().toISOString().slice(0, 10)
    const vencidos = movimientos.filter((m) => m.fecha < hoyIso).sort((a, b) => a.fecha.localeCompare(b.fecha))
    const futuros = movimientos.filter((m) => m.fecha >= hoyIso).sort((a, b) => a.fecha.localeCompare(b.fecha))

    const saldoHoy = caja.length && typeof caja[0][0] === 'number' ? caja[0][0] : null

    const porDia = new Map<string, Movimiento[]>()
    for (const m of futuros) {
      const lista = porDia.get(m.fecha) ?? []
      lista.push(m)
      porDia.set(m.fecha, lista)
    }
    let acumulado = saldoHoy ?? 0
    const dias: DiaCalendario[] = [...porDia.entries()].map(([fecha, movs]) => {
      const neto = movs.reduce((s, m) => s + m.monto, 0)
      acumulado += neto
      return { fecha, movimientos: movs, neto, acumulado }
    })

    return {
      saldoHoy,
      vencidos,
      dias,
      totalCobros: movimientos.filter((m) => m.monto > 0).reduce((s, m) => s + m.monto, 0),
      totalPagos: movimientos.filter((m) => m.monto < 0).reduce((s, m) => s + m.monto, 0),
      leidoEn: new Date().toLocaleString('es-AR', { timeZone: 'America/Argentina/San_Juan' }),
    }
  } catch (e) {
    return { error: `No se pudo leer el Sheet: ${e instanceof Error ? e.message : String(e)}` }
  }
}
