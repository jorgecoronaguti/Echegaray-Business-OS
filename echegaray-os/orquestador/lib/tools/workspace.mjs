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
        description: 'Crea un BORRADOR de mail (NO lo envía; queda en Borradores para que el dueño lo revise/mande). Reversible. Pasá to, subject y body; cc/bcc opcionales. Para ADJUNTAR archivos, pasá adjuntos = lista de file_id de Drive (buscalos antes con drive_find; los Doc/Sheet nativos se adjuntan como PDF).',
        input_schema: { type: 'object', properties: { to: { type: 'string' }, cc: { type: 'string' }, bcc: { type: 'string' }, subject: { type: 'string' }, body: { type: 'string' }, adjuntos: { type: 'array', items: { type: 'string' } } }, required: ['to', 'subject', 'body'] },
      },
      async run(input) {
        if (!input?.to || !input?.body) return { error: 'faltan to y body' }
        try { return { ok: true, ...(await ws().gmailCreateDraft({ ...input, attachmentFileIds: input?.adjuntos })) } } catch (e) { return sinAcceso(e) }
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
        description: 'ENVÍA un mail desde la cuenta del dueño. Efecto externo: REQUIERE aprobación (cae en Pendientes con el destinatario, asunto, cuerpo y adjuntos; el dueño aprueba y recién ahí sale). Pasá to, subject, body; cc/bcc/threadId opcionales (threadId para responder en un hilo). Para ADJUNTAR archivos, pasá adjuntos = lista de file_id de Drive (buscalos antes con drive_find; los Doc/Sheet nativos se adjuntan como PDF).',
        input_schema: { type: 'object', properties: { to: { type: 'string' }, cc: { type: 'string' }, bcc: { type: 'string' }, subject: { type: 'string' }, body: { type: 'string' }, threadId: { type: 'string' }, adjuntos: { type: 'array', items: { type: 'string' } } }, required: ['to', 'subject', 'body'] },
      },
      async run(input) {
        if (!input?.to || !input?.body) return { error: 'faltan to y body' }
        try { return { ok: true, ...(await ws().gmailSend({ ...input, attachmentFileIds: input?.adjuntos })) } } catch (e) { return sinAcceso(e) }
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
    'calendar.quickadd': {
      capability: 'calendar.write', account: 'ecsas',
      schema: {
        name: 'agenda_crear_rapido',
        description: 'Crea un evento por lenguaje NATURAL (Google parsea la fecha/hora): ej. "Reunión con Pérez el martes a las 15". Úsalo cuando el dueño tira el evento en una frase y no querés armar start/end a mano. REQUIERE aprobación. Pasá text.',
        input_schema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
      },
      async run(input) {
        if (!input?.text) return { error: 'falta text' }
        try { return { ok: true, ...(await ws().calendarQuickAdd(String(input.text))) } } catch (e) { return sinAcceso(e) }
      },
    },

    // ───────── GOOGLE TASKS (pendientes del dueño) — crear/listar/completar es interno ─────────
    'tasks.list': {
      capability: 'tasks.read', account: 'ecsas',
      schema: {
        name: 'tareas_listar',
        description: 'Lista las TAREAS (pendientes de Google Tasks) del dueño: título, vencimiento y estado. Por defecto solo las no completadas. Lectura. Opcional: incluir_completadas (bool).',
        input_schema: { type: 'object', properties: { incluir_completadas: { type: 'boolean' } } },
      },
      async run(input) {
        try { return { ok: true, tareas: await ws().tasksList({ includeCompleted: !!input?.incluir_completadas }) } } catch (e) { return sinAcceso(e) }
      },
    },
    'tasks.create': {
      capability: 'tasks.write', account: 'ecsas',
      schema: {
        name: 'tarea_crear',
        description: 'Crea una TAREA (pendiente) en Google Tasks del dueño. Interno y reversible (no notifica a nadie) → se hace directo, sin aprobación. Pasá title; notes (detalle), due ("YYYY-MM-DD") y subtarea_de (id de otra tarea, para crearla como subtarea) opcionales.',
        input_schema: { type: 'object', properties: { title: { type: 'string' }, notes: { type: 'string' }, due: { type: 'string' }, subtarea_de: { type: 'string' } }, required: ['title'] },
      },
      async run(input) {
        if (!input?.title) return { error: 'falta title' }
        try { return { ok: true, ...(await ws().taskCreate({ ...input, parent: input?.subtarea_de })) } } catch (e) { return sinAcceso(e) }
      },
    },
    'tasks.complete': {
      capability: 'tasks.write', account: 'ecsas',
      schema: {
        name: 'tarea_completar',
        description: 'Marca una tarea como COMPLETADA (o la reabre con completada=false). Pasá id (el que devuelve tareas_listar); completada opcional (def true).',
        input_schema: { type: 'object', properties: { id: { type: 'string' }, completada: { type: 'boolean' } }, required: ['id'] },
      },
      async run(input) {
        if (!input?.id) return { error: 'falta id' }
        const status = input?.completada === false ? 'needsAction' : 'completed'
        try { return { ok: true, ...(await ws().taskComplete(String(input.id), { status })) } } catch (e) { return sinAcceso(e) }
      },
    },

    // ───────── GMAIL (más acciones: responder, marcar leído, destacar) ─────────
    'mail.reply': {
      capability: 'mail.send', account: 'ecsas',
      schema: {
        name: 'gmail_responder',
        description: 'RESPONDE un mail en su hilo (al remitente, con "Re:"). Efecto externo: REQUIERE aprobación (cae en Pendientes). Pasá id (del mail a responder) y body (tu respuesta).',
        input_schema: { type: 'object', properties: { id: { type: 'string' }, body: { type: 'string' } }, required: ['id', 'body'] },
      },
      async run(input) {
        if (!input?.id || !input?.body) return { error: 'faltan id y body' }
        try { return { ok: true, ...(await ws().gmailReply(String(input.id), String(input.body))) } } catch (e) { return sinAcceso(e) }
      },
    },
    'mail.markread': {
      capability: 'mail.modify', account: 'ecsas',
      schema: {
        name: 'gmail_marcar_leido',
        description: 'Marca un mail como leído (o no leído con leido=false). Reversible, interno. Pasá id.',
        input_schema: { type: 'object', properties: { id: { type: 'string' }, leido: { type: 'boolean' } }, required: ['id'] },
      },
      async run(input) {
        if (!input?.id) return { error: 'falta id' }
        try { return { ok: true, ...(await ws().gmailMarkRead(String(input.id), input?.leido !== false)) } } catch (e) { return sinAcceso(e) }
      },
    },
    'mail.star': {
      capability: 'mail.modify', account: 'ecsas',
      schema: {
        name: 'gmail_destacar',
        description: 'Destaca (estrella) un mail o le quita la estrella con destacar=false. Reversible, interno. Pasá id.',
        input_schema: { type: 'object', properties: { id: { type: 'string' }, destacar: { type: 'boolean' } }, required: ['id'] },
      },
      async run(input) {
        if (!input?.id) return { error: 'falta id' }
        try { return { ok: true, ...(await ws().gmailStar(String(input.id), input?.destacar !== false)) } } catch (e) { return sinAcceso(e) }
      },
    },
    'mail.forward': {
      capability: 'mail.send', account: 'ecsas',
      schema: {
        name: 'gmail_reenviar',
        description: 'REENVÍA un mail a otro destinatario, con el original citado. Efecto externo: REQUIERE aprobación. Pasá id (del mail) y to (destinatario); nota (texto arriba) y adjuntos (file_ids de Drive) opcionales.',
        input_schema: { type: 'object', properties: { id: { type: 'string' }, to: { type: 'string' }, nota: { type: 'string' }, adjuntos: { type: 'array', items: { type: 'string' } } }, required: ['id', 'to'] },
      },
      async run(input) {
        if (!input?.id || !input?.to) return { error: 'faltan id y to' }
        try { return { ok: true, ...(await ws().gmailForward(String(input.id), String(input.to), String(input.nota || ''), { attachmentFileIds: input?.adjuntos })) } } catch (e) { return sinAcceso(e) }
      },
    },
    'calendar.freebusy': {
      capability: 'drive.read', account: 'ecsas',
      schema: {
        name: 'agenda_buscar_hueco',
        description: 'Devuelve las franjas OCUPADAS del calendario entre dos fechas, para encontrar un hueco libre (ej. antes de proponer una reunión). Lectura. Pasá start y end ("YYYY-MM-DD" o ISO datetime).',
        input_schema: { type: 'object', properties: { start: { type: 'string' }, end: { type: 'string' } }, required: ['start', 'end'] },
      },
      async run(input) {
        if (!input?.start || !input?.end) return { error: 'faltan start y end' }
        try { return { ok: true, ...(await ws().calendarBusy({ start: String(input.start), end: String(input.end) })) } } catch (e) { return sinAcceso(e) }
      },
    },
  }
}
