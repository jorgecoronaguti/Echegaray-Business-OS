// PRP-024 — Tools de GMAIL y CALENDAR (lectura) para el motor y los especialistas.
// Requieren domain-wide delegation activa (@ecsas.com.ar) + una cuenta a impersonar
// (env ORQ_GOOGLE_IMPERSONATE). Sin eso, devuelven un mensaje CLARO (no rompen). Son
// lectura (Nivel A) → capacidad 'drive.read' (auto). El envío de mail / crear evento es
// una fase posterior (Nivel E, con aprobación) y NO está acá.
import { makeGoogleClient, WORKSPACE_SCOPES } from '../google.mjs'

// Cliente con scopes de Workspace + impersonación (lazy, se comparte en el módulo).
let _ws = null
function ws(config) {
  if (!_ws) _ws = makeGoogleClient({ config, scopes: WORKSPACE_SCOPES })
  return _ws
}
const sinAcceso = (e) => {
  const m = String(e?.message ?? e)
  if (/unauthorized_client|403|delegat|invalid_grant/i.test(m)) {
    return { error: 'Todavía no tengo acceso a la cuenta de Google. Falta activar la delegación de dominio en admin.google.com y configurar la cuenta a impersonar (ORQ_GOOGLE_IMPERSONATE).' }
  }
  return { error: `no pude consultar Google: ${m.slice(0, 140)}` }
}

export function workspaceTools({ config } = {}) {
  return {
    'gmail.search': {
      capability: 'drive.read',
      account: 'ecsas',
      schema: {
        name: 'gmail_buscar',
        description: 'Busca en Gmail de la empresa (lectura). Usá query estilo Gmail: "from:proveedor factura", "cobranza vencida", "asunto:remito". Devuelve remitente, asunto, fecha y un extracto. Para leer el cuerpo completo, después usá gmail_leer con el id.',
        input_schema: { type: 'object', properties: { query: { type: 'string' }, max: { type: 'number' } }, required: ['query'] },
      },
      async run(input) {
        try { return { ok: true, mensajes: await ws(config).gmailSearch(String(input?.query || ''), { max: Math.min(Number(input?.max) || 8, 15) }) } }
        catch (e) { return sinAcceso(e) }
      },
    },
    'gmail.get': {
      capability: 'drive.read',
      account: 'ecsas',
      schema: {
        name: 'gmail_leer',
        description: 'Lee el cuerpo de un mail por su id (el que devuelve gmail_buscar). Devuelve el texto plano. Lectura, sin efecto externo.',
        input_schema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
      },
      async run(input) {
        if (!input?.id) return { error: 'falta id' }
        try { return { ok: true, ...(await ws(config).gmailGet(String(input.id))) } }
        catch (e) { return sinAcceso(e) }
      },
    },
    'calendar.upcoming': {
      capability: 'drive.read',
      account: 'ecsas',
      schema: {
        name: 'agenda',
        description: 'Próximos eventos del calendario de la empresa (vencimientos, reuniones, hitos). Lectura. Parámetros opcionales: dias (ventana, def 30), max (def 10).',
        input_schema: { type: 'object', properties: { dias: { type: 'number' }, max: { type: 'number' } } },
      },
      async run(input) {
        try { return { ok: true, eventos: await ws(config).calendarUpcoming({ days: Math.min(Number(input?.dias) || 30, 120), max: Math.min(Number(input?.max) || 10, 25) }) } }
        catch (e) { return sinAcceso(e) }
      },
    },
  }
}
