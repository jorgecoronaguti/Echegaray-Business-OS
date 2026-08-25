// LAS PLANTILLAS DE MAIL DEL PORTAL — habilitación (31), publicación y aviso (32).
//
// Puras: entra un objeto, sale `{ asunto, html, clave_unica }`. No leen la base ni mandan nada, así
// que se pueden probar de verdad — y hay que poder probarlas, porque un mail a un cliente es lo
// único de todo este trabajo que sale de la empresa y no se puede deshacer.
//
// ═══ POR QUÉ SON SOBRIAS Y POR QUÉ NO LLEVAN NÚMEROS QUE NO HAGAN FALTA ═══
//
// El mail viaja por internet y queda en la bandeja del cliente para siempre. El saldo, el detalle de
// los certificados y las fechas viven DETRÁS del login del portal, donde la RLS controla quién ve
// qué. Acá va lo mínimo para que la persona sepa qué pasó y entre: si el mail se reenvía a otra
// persona del cliente —cosa que pasa siempre— no puede llevar la cuenta corriente adentro.
//
// El logo se referencia por URL y no se incrusta: un adjunto embebido dispara filtros de spam y
// pesa en cada envío.

/** Grafito y amarillo del logo real. Los mismos que usa la app. */
const GRAFITO = '#30302F'
const AMARILLO = '#FDC900'
const LOGO = process.env.ORQ_PORTAL_LOGO_URL || 'https://app.ecsas.com.ar/logo-ecsas.png'
const PORTAL = process.env.ORQ_PORTAL_URL || 'https://app.ecsas.com.ar/portal'

/** Escapa lo que viene de la base. Un nombre de cliente con `<` rompería el HTML del mail. */
export function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

/** $ 1.234.567 — es-AR, sin decimales: en un mail el centavo no ayuda a decidir nada. */
export function pesos(n) {
  const v = Number(n)
  if (!Number.isFinite(v)) return null
  return `$ ${Math.round(v).toLocaleString('es-AR')}`
}

/** 25/08/2026. Nunca el ISO: al cliente no se le manda `2026-08-25`. */
export function fechaAR(iso) {
  if (!iso) return null
  const d = new Date(`${String(iso).slice(0, 10)}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return null
  const p = (n) => String(n).padStart(2, '0')
  return `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`
}

function envoltorio({ titulo, cuerpo, boton }) {
  const cta = boton
    ? `<p style="margin:28px 0 0"><a href="${esc(boton.href)}" style="background:${AMARILLO};color:${GRAFITO};`
      + `text-decoration:none;font-weight:600;padding:12px 22px;border-radius:6px;display:inline-block">`
      + `${esc(boton.texto)}</a></p>`
    : ''
  return `<!doctype html><html lang="es"><body style="margin:0;background:#F4F4F2;`
    + `font-family:'IBM Plex Sans',Helvetica,Arial,sans-serif;color:${GRAFITO}">`
    + `<div style="max-width:560px;margin:0 auto;padding:32px 24px">`
    + `<img src="${esc(LOGO)}" alt="Echegaray Construcciones" height="34" style="height:34px;display:block">`
    + `<h1 style="font-size:20px;font-weight:600;margin:26px 0 14px;color:${GRAFITO}">${esc(titulo)}</h1>`
    + `<div style="font-size:15px;line-height:1.55">${cuerpo}</div>`
    + cta
    + `<hr style="border:0;border-top:1px solid #E2E2DE;margin:32px 0 14px">`
    + `<p style="font-size:12px;color:#77776F;margin:0">Echegaray Construcciones · San Juan, Argentina<br>`
    + `Este mensaje es para ${esc('el destinatario indicado')}. Si no esperabas este mail, respondé y lo damos de baja.</p>`
    + `</div></body></html>`
}

const saludo = (persona) => (persona ? `Hola ${esc(persona)}:` : 'Hola:')

/**
 * HABILITACIÓN (pantalla 31, «Habilitar y avisarle por mail»).
 * No lleva link mágico adentro: el link lo pide la propia persona en /portal/ingresar. Un enlace de
 * acceso viajando por mail es un enlace que sirve para cualquiera que reenvíe el mensaje.
 */
export function habilitacionPortal({ para, persona_contacto, cliente_nombre, acceso_id }) {
  const cuerpo =
    `<p>${saludo(persona_contacto)}</p>`
    + `<p>Habilitamos el acceso al portal de clientes de Echegaray Construcciones para `
    + `<strong>${esc(cliente_nombre)}</strong>. Desde ahí vas a poder ver el avance de la obra, los `
    + `certificados y el esquema de pagos.</p>`
    + `<p>Para entrar, ingresá tu correo <strong>${esc(para)}</strong> y te mandamos un enlace de acceso. `
    + `No hace falta contraseña.</p>`
  return {
    asunto: 'Tu acceso al portal de Echegaray Construcciones',
    html: envoltorio({ titulo: 'Ya tenés acceso al portal', cuerpo, boton: { href: `${PORTAL}/ingresar`, texto: 'Entrar al portal' } }),
    // Una habilitación por acceso. Un segundo click en el botón no manda un segundo mail.
    clave_unica: acceso_id ? `habilitacion:${acceso_id}` : null,
    plantilla: 'habilitacion_portal',
  }
}

/**
 * PUBLICACIÓN DEL ESQUEMA (pantalla 32, «Publicar al cliente»).
 * `publicado_at` entra en la clave: republicar después de cambiar fechas SÍ manda un mail nuevo,
 * pero dos clicks sobre la misma publicación mandan uno solo.
 */
export function esquemaPublicado({ persona_contacto, cliente_nombre, cantidad_pagos, proximo, cliente_id, publicado_at }) {
  const prox = proximo?.fecha && proximo?.monto
    ? `<p>El próximo vencimiento es el <strong>${esc(fechaAR(proximo.fecha))}</strong> por `
      + `<strong>${esc(pesos(proximo.monto))}</strong>.</p>`
    : ''
  const cuerpo =
    `<p>${saludo(persona_contacto)}</p>`
    + `<p>Publicamos el esquema de pagos de <strong>${esc(cliente_nombre)}</strong>`
    + (Number.isFinite(Number(cantidad_pagos)) ? `, con ${esc(cantidad_pagos)} pagos previstos` : '')
    + `. Podés verlo completo en el portal.</p>`
    + prox
  return {
    asunto: 'Actualizamos el esquema de pagos',
    html: envoltorio({ titulo: 'Esquema de pagos actualizado', cuerpo, boton: { href: PORTAL, texto: 'Ver el esquema' } }),
    clave_unica: cliente_id && publicado_at ? `esquema:${cliente_id}:${publicado_at}` : null,
    plantilla: 'esquema_publicado',
  }
}

/**
 * AVISO DE VENCIMIENTO (pantalla 32, N días antes).
 * Es un recordatorio, no una intimación: la mora tiene consecuencias contractuales y ese texto lo
 * escribe una persona, no una plantilla.
 */
export function avisoVencimiento({ persona_contacto, cliente_nombre, concepto, fecha, monto, dias, esquema_pago_id }) {
  const cuando = Number(dias) > 0 ? `en ${esc(dias)} día${Number(dias) === 1 ? '' : 's'}` : 'hoy'
  const cuerpo =
    `<p>${saludo(persona_contacto)}</p>`
    + `<p>Te recordamos que vence ${cuando}, el <strong>${esc(fechaAR(fecha))}</strong>, el pago `
    + `correspondiente a <strong>${esc(concepto)}</strong>`
    + (pesos(monto) ? ` por <strong>${esc(pesos(monto))}</strong>` : '')
    + ` de ${esc(cliente_nombre)}.</p>`
    + `<p>Si ya lo abonaste, podés informarnos la transferencia desde el portal y lo conciliamos.</p>`
  return {
    asunto: `Vencimiento del ${fechaAR(fecha)} — ${concepto}`,
    html: envoltorio({ titulo: 'Recordatorio de vencimiento', cuerpo, boton: { href: PORTAL, texto: 'Ver en el portal' } }),
    // Un aviso por pago y por día: si el timer corre dos veces, el cliente recibe uno.
    clave_unica: esquema_pago_id ? `aviso:${esquema_pago_id}:${String(fecha).slice(0, 10)}` : null,
    plantilla: 'aviso_vencimiento',
  }
}
