// PRP-024 — Tools de GMAIL y CALENDAR para el motor y los especialistas. Usan el MISMO
// cliente OAuth por usuario que Drive: el OS actúa COMO el usuario (su mail, su agenda).
//
// AUTONOMÍA (decisión del dueño): LEER es automático (buscar, leer, ver agenda) y también
// lo REVERSIBLE e interno (crear borrador, archivar, etiquetar). Lo IRREVERSIBLE hacia
// afuera pasa por APROBACIÓN (Nivel E, cae en Pendientes): enviar mail, mandar a papelera,
// crear/editar/borrar eventos que invitan a terceros. La disposición la fija la policy por
// capacidad (mail.send/mail.trash/calendar.write/calendar.delete = requires_approval).

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

    // ───────── ESCRITURA ─────────
    // AUTO (reversible/interno): borrador, archivar, etiquetar.
    'mail.draft': {
      capability: 'mail.draft', account: 'ecsas',
      schema: {
        name: 'gmail_borrador',
        description: 'Crea un BORRADOR de mail (NO lo envía; queda en Borradores para que el dueño lo revise/mande). Reversible. Pasá to, subject y body; cc/bcc opcionales.',
        input_schema: { type: 'object', properties: { to: { type: 'string' }, cc: { type: 'string' }, bcc: { type: 'string' }, subject: { type: 'string' }, body: { type: 'string' } }, required: ['to', 'subject', 'body'] },
      },
      async run(input) {
        if (!input?.to || !input?.body) return { error: 'faltan to y body' }
        try { return { ok: true, ...(await ws().gmailCreateDraft(input)) } } catch (e) { return sinAcceso(e) }
      },
    },
    'mail.archive': {
      capability: 'mail.modify', account: 'ecsas',
      schema: {
        name: 'gmail_archivar',
        description: 'Archiva un mail (lo saca de Recibidos; reversible). Pasá id (el que devuelve gmail_buscar).',
        input_schema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
      },
      async run(input) {
        if (!input?.id) return { error: 'falta id' }
        try { return { ok: true, ...(await ws().gmailArchive(String(input.id))) } } catch (e) { return sinAcceso(e) }
      },
    },
    // APROBACIÓN (irreversible/externo): enviar, papelera, eventos.
    'mail.send': {
      capability: 'mail.send', account: 'ecsas',
      schema: {
        name: 'gmail_enviar',
        description: 'ENVÍA un mail desde la cuenta del dueño. Efecto externo: REQUIERE aprobación (cae en Pendientes con el destinatario, asunto y cuerpo; el dueño aprueba y recién ahí sale). Pasá to, subject, body; cc/bcc/threadId opcionales (threadId para responder en un hilo).',
        input_schema: { type: 'object', properties: { to: { type: 'string' }, cc: { type: 'string' }, bcc: { type: 'string' }, subject: { type: 'string' }, body: { type: 'string' }, threadId: { type: 'string' } }, required: ['to', 'subject', 'body'] },
      },
      async run(input) {
        if (!input?.to || !input?.body) return { error: 'faltan to y body' }
        try { return { ok: true, ...(await ws().gmailSend(input)) } } catch (e) { return sinAcceso(e) }
      },
    },
    'mail.trash': {
      capability: 'mail.trash', account: 'ecsas',
      schema: {
        name: 'gmail_a_papelera',
        description: 'Manda un mail a la PAPELERA (reversible 30 días). Efecto destructivo: REQUIERE aprobación. Pasá id.',
        input_schema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
      },
      async run(input) {
        if (!input?.id) return { error: 'falta id' }
        try { return { ok: true, ...(await ws().gmailTrash(String(input.id))) } } catch (e) { return sinAcceso(e) }
      },
    },
    'calendar.create': {
      capability: 'calendar.write', account: 'ecsas',
      schema: {
        name: 'agenda_crear_evento',
        description: 'Crea un evento en el calendario. Si hay invitados (attendees), les llega la invitación → efecto externo: REQUIERE aprobación. Pasá summary, start y end ("YYYY-MM-DD" para día completo o ISO datetime "2026-07-20T15:00:00-03:00"); description, location y attendees (lista de emails) opcionales.',
        input_schema: { type: 'object', properties: { summary: { type: 'string' }, description: { type: 'string' }, location: { type: 'string' }, start: { type: 'string' }, end: { type: 'string' }, attendees: { type: 'array', items: { type: 'string' } } }, required: ['summary', 'start', 'end'] },
      },
      async run(input) {
        if (!input?.summary || !input?.start || !input?.end) return { error: 'faltan summary, start o end' }
        try { return { ok: true, ...(await ws().calendarCreateEvent(input)) } } catch (e) { return sinAcceso(e) }
      },
    },
    'calendar.update': {
      capability: 'calendar.write', account: 'ecsas',
      schema: {
        name: 'agenda_editar_evento',
        description: 'Modifica un evento existente (avisa a los invitados). REQUIERE aprobación. Pasá id (de la agenda) y los campos a cambiar: summary, description, location, start, end, attendees.',
        input_schema: { type: 'object', properties: { id: { type: 'string' }, summary: { type: 'string' }, description: { type: 'string' }, location: { type: 'string' }, start: { type: 'string' }, end: { type: 'string' }, attendees: { type: 'array', items: { type: 'string' } } }, required: ['id'] },
      },
      async run(input) {
        if (!input?.id) return { error: 'falta id' }
        const { id, ...patch } = input
        try { return { ok: true, ...(await ws().calendarUpdateEvent(String(id), patch)) } } catch (e) { return sinAcceso(e) }
      },
    },
    'calendar.delete': {
      capability: 'calendar.delete', account: 'ecsas',
      schema: {
        name: 'agenda_borrar_evento',
        description: 'Borra un evento del calendario (avisa a los invitados). REQUIERE aprobación. Pasá id.',
        input_schema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
      },
      async run(input) {
        if (!input?.id) return { error: 'falta id' }
        try { return { ok: true, ...(await ws().calendarDeleteEvent(String(input.id))) } } catch (e) { return sinAcceso(e) }
      },
    },
  }
}
