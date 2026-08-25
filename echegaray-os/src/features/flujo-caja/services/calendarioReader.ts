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

// ═══ EL TOKEN DE LA SERVICE ACCOUNT SE PIDE UNA VEZ POR HORA, NO UNA POR VISITA (25/08/2026) ═══
//
// Este archivo minteaba un JWT nuevo, lo firmaba con RSA y hacía un POST a
// `oauth2.googleapis.com/token` en CADA carga de la pantalla. Dura una hora y se tiraba entera.
//
// Y ARRUINABA, SIN DECIRLO, EL CACHÉ DE ABAJO. El `batchGet` de Sheets lleva
// `next: { revalidate: 60 }` — alguien lo puso a propósito. Pero la clave de caché de fetch de Next
// incluye las CABECERAS (comprobado en su código: `incremental-cache/index.js`, `generateCacheKey`
// arma el `cacheString` con `url, init.method, headers, …`). Con un `Authorization: Bearer <token>`
// distinto en cada request, cada visita estrenaba una clave: el `revalidate` no acertaba NUNCA, se
// leían las cinco pestañas del Sheet enteras cada vez, y encima quedaba una entrada de caché nueva
// por visita que nadie iba a volver a leer.
//
// O sea DOS viajes a Google encadenados por carga —el token y después el Sheet—, que es la espera de
// datos que el dueño ve en esta pantalla. Con el token estable, la cabecera se repite y el
// `revalidate: 60` por fin hace lo que dice.
//
// ═══ POR QUÉ ACÁ SÍ VALE UN CACHÉ DE MÓDULO, Y EN `authService` NO ═══
//
// Éste es el token de la SERVICE ACCOUNT: no depende de quién entró, es idéntico para todos por
// construcción y su permiso es `spreadsheets.readonly`. No hay frontera de usuario que cruzar porque
// nunca dependió de un usuario. El perfil de una persona es exactamente lo contrario —por eso allá
// el memo es `cache()` de React y muere con el request—.
//
// SE RENUEVA CINCO MINUTOS ANTES DE VENCER: un token que expira en vuelo da un 401 que esta pantalla
// mostraría como «la conexión con el Sheet no está configurada», que es mentira.
export interface TokenGuardado { token: string; venceEn: number }
let tokenGuardado: TokenGuardado | null = null
const MARGEN_MS = 5 * 60 * 1000

/**
 * Si el token guardado todavía sirve. Está separada y exportada porque es la única parte de esto que
 * se puede probar sin red: el resto es firmar y salir a Google.
 */
export function tokenVigente(guardado: TokenGuardado | null, ahora: number): boolean {
  return guardado !== null && ahora < guardado.venceEn - MARGEN_MS
}

async function getAccessToken(saJson: string): Promise<string> {
  if (tokenVigente(tokenGuardado, Date.now())) return tokenGuardado!.token
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
  const cuerpo = (await res.json()) as { access_token: string; expires_in?: number }
  // `expires_in` viene en segundos y Google manda 3599. Si algún día no viniera, una hora es lo que
  // pedimos arriba en el `exp` del JWT: no se inventa una vida más larga que la que firmamos.
  const vive = (cuerpo.expires_in ?? 3600) * 1000
  tokenGuardado = { token: cuerpo.access_token, venceEn: Date.now() + vive }
  return cuerpo.access_token
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
    // Sin credencial en el entorno (caso Vercel hoy): servir el snapshot
    // commiteado por scripts/sync-calendario.mjs. Es el mismo dato, con la
    // frescura del último sync -- el timestamp visible (leidoEn) es el del
    // momento en que se leyó el Sheet, nunca se disfraza de "en vivo".
    const { default: snapshot } = await import('../data/calendario-snapshot.json')
    return snapshot as Calendario
  }
  try {
    const token = await getAccessToken(saJson)
    // Rangos alineados a la estructura REAL del Sheet (25/07): el rediseño de las pestañas renombró/
    // partió varias (02_Cobranzas→Cobranzas, Cheques→Cheques Emitidos, Caja→CAJA, RESUMEN eliminada).
    // Un rango a una pestaña inexistente tira 400 en TODO el batchGet. Gemelo de scripts/sync-calendario.mjs.
    const rangos = ['Cobranzas!A5:Q200', 'Compras!A5:Y940', 'Cheques Emitidos!A1:N997', "'Tarjeta de Credito'!A3:K200", 'CAJA!A5']
    const params = rangos.map((r) => `ranges=${encodeURIComponent(r)}`).join('&')
    const res = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values:batchGet?${params}&valueRenderOption=UNFORMATTED_VALUE`,
      { headers: { Authorization: `Bearer ${token}` }, next: { revalidate: 60 } },
    )
    // El cuerpo del 400 nombra el rango culpable: incluirlo evita un "sheets: 400" mudo si una pestaña se renombra.
    if (!res.ok) throw new Error(`sheets: ${res.status} — ${(await res.text()).slice(0, 300)}`)
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

    // Pagos: Estado(X=23) Pendiente/Proyectado, fecha pago(Q=16), Total(O=14),
    // excluyendo medios que debitan por su propia pestaña (Tipo pago P=15).
    // Estado pasó de col 24 a 23 (se insertó una columna; Y=24 hoy es "Tipo de Costo"): leer 24
    // hacía que el filtro nunca diera true y Compras aportara CERO pagos al calendario.
    const MEDIOS_APARTE = new Set(['cheque', 'echeq', 'tarjeta crédito'])
    for (const r of compras) {
      const estado = texto(r, 23)
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

    // Cheques no debitados: Tipo(A=0) ECHEQ/CHEQUE (saltea banda-resumen/encabezado),
    // DEBITADO(K=10) != SI, fecha de pago(I=8), monto(F=5)
    for (const r of cheques) {
      const tipoCheque = texto(r, 0).toUpperCase()
      if (tipoCheque !== 'ECHEQ' && tipoCheque !== 'CHEQUE') continue
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

    // Saldo de arranque = DISPONIBILIDADES de la pestaña CAJA (CAJA!A5): bancos + caja + valores,
    // BRUTO (antes de restar cheques emitidos), la MISMA cifra de "Plata disponible hoy". El
    // calendario resta día a día los cheques/pagos futuros, así que el arranque debe ser el bruto
    // y no la LIQUIDEZ NETA (que ya descuenta los cheques emitidos), o se contarían dos veces.
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
