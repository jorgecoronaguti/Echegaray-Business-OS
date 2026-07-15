// PRP-024 — Tools de GMAIL y CALENDAR (lectura) para el motor y los especialistas.
// Ahora usan el MISMO cliente OAuth por usuario que Drive (scopes gmail.readonly +
// calendar ya autorizados cuando el usuario conectó su Google). Ya NO dependen de la
// delegación de dominio: si el usuario autorizó, funcionan; si no, mensaje claro.
// Son lectura (Nivel A) → capacidad 'drive.read' (auto). El envío de mail / crear
// evento es una fase posterior (Nivel E, con aprobación) y NO está acá.

const sinAcceso = (e) => {
  const m = String(e?.message ?? e)
  if (/unauthorized_client|401|403|delegat|invalid_grant|insufficient/i.test(m)) {
    return { error: 'Todavía no tengo acceso a tu Google. Conectá tu cuenta desde el botón "Conectar con Google" en la extensión (autoriza Gmail y Calendar) y volvé a pedírmelo.' }
  }
  return { error: `no pude consultar Google: ${m.slice(0, 140)}` }
}

// Recibe el cliente Google YA construido con el token del usuario (el mismo de Drive).
export function workspaceTools({ google } = {}) {
  const ws = () => {
    if (!google) throw new Error('unauthorized_client: sin cuenta Google conectada')
    return google
  }
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
        try { return { ok: true, mensajes: await ws().gmailSearch(String(input?.query || ''), { max: Math.min(Number(input?.max) || 8, 15) }) } }
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
        try { return { ok: true, ...(await ws().gmailGet(String(input.id))) } }
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
        try { return { ok: true, eventos: await ws().calendarUpcoming({ days: Math.min(Number(input?.dias) || 30, 120), max: Math.min(Number(input?.max) || 10, 25) }) } }
        catch (e) { return sinAcceso(e) }
      },
    },
  }
}
