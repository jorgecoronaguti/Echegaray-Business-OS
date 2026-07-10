'use server'

import crypto from 'crypto'
import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

// Carga nativa del saldo diario de Caja (ciclo autónomo, retomado 2026-07-10).
// El Sheet "Flujo de Caja - Cash Flow" es la única fuente de verdad: este
// formulario NO crea una tabla paralela de saldos.
//  - Con GOOGLE_SERVICE_ACCOUNT_JSON en el entorno: agrega la fila directo a la
//    pestaña Caja (append con OVERWRITE, nunca INSERT_ROWS: el panel de saldo
//    vive en las filas 1-8 de la misma pestaña y un insert de fila lo
//    desplazaría -- incidente real documentado en la skill de Sheets).
//  - Sin credencial (Vercel hoy): encola una Acción (categoria_alerta=
//    'cargar_saldo_caja') que el sync local con credencial pasa al Sheet en la
//    próxima corrida (≤4 h) y marca resuelta. Una persona real cargó el dato;
//    el sistema solo lo transcribe -- dentro del techo de autonomía.

const SPREADSHEET_ID = '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'

const saldoSchema = z.object({
  cuenta: z.enum(['Banco Santander', 'Efectivo']),
  saldo: z.coerce.number().finite(),
  notas: z.string().trim().max(300).optional().default(''),
})

export interface CargarSaldoState {
  ok: string | null
  error: string | null
}

async function appendSaldoAlSheet(
  saJson: string,
  fila: { fecha: string; cuenta: string; saldo: number; cargadoPor: string; notas: string },
): Promise<void> {
  const sa = JSON.parse(saJson) as { client_email: string; private_key: string }
  const now = Math.floor(Date.now() / 1000)
  const b64 = (obj: object) => Buffer.from(JSON.stringify(obj)).toString('base64url')
  const input = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  })}`
  const signature = crypto.createSign('RSA-SHA256').update(input).sign(sa.private_key).toString('base64url')
  const tokRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${input}.${signature}`,
    }),
  })
  if (!tokRes.ok) throw new Error(`token: ${tokRes.status}`)
  const { access_token } = (await tokRes.json()) as { access_token: string }
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent('Caja!A5:F')}:append?valueInputOption=USER_ENTERED&insertDataOption=OVERWRITE`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        values: [[fila.fecha, fila.cuenta, fila.saldo, 'OS web', fila.cargadoPor, fila.notas]],
      }),
    },
  )
  if (!res.ok) throw new Error(`append: ${res.status}`)
}

export async function cargarSaldoCajaAction(
  _prev: CargarSaldoState,
  formData: FormData,
): Promise<CargarSaldoState> {
  const parsed = saldoSchema.safeParse({
    cuenta: formData.get('cuenta'),
    saldo: formData.get('saldo'),
    notas: formData.get('notas') ?? '',
  })
  if (!parsed.success) return { ok: null, error: 'Datos inválidos: revisar cuenta y saldo.' }
  const { cuenta, saldo, notas } = parsed.data

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: null, error: 'Tenés que estar logueado para cargar el saldo.' }

  const hoy = new Date().toLocaleDateString('es-AR', { timeZone: 'America/Argentina/San_Juan' })
  const saJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON

  if (saJson) {
    try {
      await appendSaldoAlSheet(saJson, { fecha: hoy, cuenta, saldo, cargadoPor: user.email ?? 'usuario OS', notas })
      revalidatePath('/flujo-caja')
      return { ok: `Saldo de ${cuenta} cargado en el Sheet.`, error: null }
    } catch {
      // sin conexión al Sheet: mejor encolado que perdido -- cae a la cola
    }
  }

  const { error } = await supabase.from('acciones').insert({
    origen: 'manual',
    titulo: `Pasar al Sheet: saldo ${cuenta} ${hoy}`,
    causa: JSON.stringify({ fecha: hoy, cuenta, saldo, cargado_por: user.email ?? '', notas }),
    area: 'administracion_finanzas',
    categoria_alerta: 'cargar_saldo_caja',
    contraparte: cuenta,
    monto: saldo,
    severidad: 'informativa',
    responsable: user.email ?? null,
  })
  if (error) return { ok: null, error: `No se pudo encolar la carga: ${error.message}` }
  revalidatePath('/flujo-caja')
  return {
    ok: `Saldo de ${cuenta} registrado. Pasa al Sheet en la próxima sincronización automática (≤4 h).`,
    error: null,
  }
}
