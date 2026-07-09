import crypto from 'crypto'

// Lector de solo-lectura del Sheet real "Flujo de Caja - Cash Flow" con la misma
// cuenta de servicio que ya usa scripts/google_workspace (decisión 2026-07-09:
// el Sheet sigue siendo la fuente de verdad de caja; la web lo refleja, no lo
// duplica -- ver arquitectura-integracion-finanzas-obras). Sin dependencias
// nuevas: el JWT RS256 se firma con crypto nativo de Node.
//
// Requiere GOOGLE_SERVICE_ACCOUNT_JSON (el JSON completo de la cuenta de
// servicio como string) en el entorno. Sin la variable, la página lo informa
// en vez de romper.

const SPREADSHEET_ID = '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const SHEET_URL = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/edit`

export interface BloqueResumen {
  titulo: string
  filas: { label: string; valor: string }[]
}

export interface FlujoCajaResumen {
  bloques: BloqueResumen[]
  actualizadoEn: string
  sheetUrl: string
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
  const data = (await res.json()) as { access_token: string }
  return data.access_token
}

// Rangos del RESUMEN real (los bloques que Jorge mira para decidir). Si el
// RESUMEN cambia de filas, ajustar acá -- la web es un espejo, no una copia.
const RANGOS = [
  { titulo: 'Saldo disponible real hoy', range: 'RESUMEN!A4:B6' },
  { titulo: 'Nómina', range: 'RESUMEN!A9:B11' },
  { titulo: 'Proyección de caja 2026', range: 'RESUMEN!A13:B15' },
  { titulo: 'Capital de trabajo', range: 'RESUMEN!D4:E6' },
]

export async function leerResumenFlujoCaja(): Promise<FlujoCajaResumen | { error: string }> {
  const saJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON
  if (!saJson) {
    return {
      error:
        'Falta GOOGLE_SERVICE_ACCOUNT_JSON en el entorno. Cargar el JSON de la cuenta de servicio (scripts/google_workspace/credentials/service-account.json) como variable de entorno en Vercel.',
    }
  }
  try {
    const token = await getAccessToken(saJson)
    const params = RANGOS.map((r) => `ranges=${encodeURIComponent(r.range)}`).join('&')
    const res = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values:batchGet?${params}&valueRenderOption=FORMATTED_VALUE`,
      { headers: { Authorization: `Bearer ${token}` }, next: { revalidate: 300 } },
    )
    if (!res.ok) throw new Error(`sheets: ${res.status}`)
    const data = (await res.json()) as { valueRanges: { values?: string[][] }[] }
    const bloques: BloqueResumen[] = data.valueRanges.map((vr, i) => ({
      titulo: RANGOS[i].titulo,
      filas: (vr.values ?? [])
        .filter((fila) => (fila[0] ?? '').trim() !== '')
        .map((fila) => ({ label: fila[0] ?? '', valor: fila[1] ?? '' })),
    }))
    return {
      bloques,
      actualizadoEn: new Date().toLocaleString('es-AR', { timeZone: 'America/Argentina/San_Juan' }),
      sheetUrl: SHEET_URL,
    }
  } catch (e) {
    return { error: `No se pudo leer el Sheet: ${e instanceof Error ? e.message : String(e)}` }
  }
}
