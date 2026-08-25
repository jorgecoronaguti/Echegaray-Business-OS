// CONTESTAR ESCRIBIENDO EN EL HILO — el otro extremo de `lib/comprobantes/respuesta-texto.mjs`.
//
// El bot terminaba su mensaje con «Tocá la obra —o escribime otra— y lo cargo» y escribirla no hacía
// nada: nadie reclamaba ese mensaje. Acá se cierra el círculo, con TRES reglas que son las que el
// dueño pidió cuando dijo que la experiencia «no es certera»:
//
// 1. **Nunca se pide dos veces lo mismo.** Una respuesta vale para todos los comprobantes del fajo
//    que ofrecían esa opción, y la tarjeta del bot se reescribe: la pregunta contestada desaparece.
// 2. **Siempre se dice qué quedó.** Qué se anotó, en cuántos comprobantes, y qué falta todavía —con
//    el nombre real de la columna de Compras, no con una etiqueta interna.
// 3. **Lo ambiguo se repregunta, no se adivina.** Imputar a la obra equivocada ensucia el margen de
//    dos obras y después nadie lo encuentra.

import { ESTADO, ETIQUETA_CAMPO, imputacionPendiente } from '../../lib/comprobantes/fajo.mjs'
import { mensajeFajo } from '../../lib/comprobantes/mensaje.mjs'
import { RESPUESTA } from '../../lib/comprobantes/respuesta-texto.mjs'
import { aplicarEleccion, confirmarFajo, contestarDuplicado, RESULTADO } from './aplicar.mjs'
import * as repoReal from './repositorio.mjs'

export const TEXTO = Object.freeze({
  SIN_FAJO: 'Esa carga ya no está disponible. Volvé a mandar el comprobante.',
  YA_CERRADO: 'Esa carga ya se cerró. Si querés cambiar algo, mandá el comprobante de nuevo.',
  INVALIDA: 'Esa opción ya no corresponde a estos comprobantes. Usá **Corregir** en el mensaje de arriba.',
  DESCARTADO: '🗑 Descartado. **No cargué nada.**',
  DUPLICADO_RESUELTO: 'Ese ya lo contestaste. Si querés cambiarlo, mandá el comprobante de nuevo.',
  CARGANDO: '⏳ Cargando en Compras…',
})

const etiqueta = (campo) => ETIQUETA_CAMPO[campo] ?? campo

/** "en los 3 comprobantes" / "" cuando es uno solo. Contar de más confunde; no contar, también. */
function alcance(n) {
  return n > 1 ? ` en los ${n} comprobantes` : ''
}

/**
 * Lo que TODAVÍA falta, con el nombre real de la columna. Es la mitad de la frase que el dueño
 * reclamó: sin esto, "anotado" se lee como "listo" y la persona se va creyendo que cargó.
 */
export function loQueFalta(fajo) {
  const campos = new Set()
  for (const it of fajo?.items ?? []) for (const c of imputacionPendiente(it)) campos.add(c)
  return [...campos].map(etiqueta)
}

/** Reescribe la tarjeta del bot. Que falle no puede tumbar nada: se devuelve si se pudo o no. */
async function refrescar(mattermost, fajo, { message, attachments = [] }, log) {
  const id = fajo?.aviso_post_id
  if (!id || typeof mattermost?.actualizarPost !== 'function') return false
  try {
    await mattermost.actualizarPost({ id, message, props: { attachments } })
    return true
  } catch (e) {
    log?.warn?.('comprobantes: no pude actualizar la tarjeta', { detalle: String(e?.message ?? e).slice(0, 200) })
    return false
  }
}

/**
 * Atiende una respuesta escrita contra un fajo abierto.
 *
 * @param {object} d {port, mattermost, repo?, escribir?, url, log?}
 * @param {object} p {fajo, respuesta}   `respuesta` = lo que devolvió `interpretarRespuesta`
 * @returns {Promise<{texto:string, estado:string}>}
 */
export async function atenderRespuesta(d, { fajo, respuesta } = {}) {
  const { port, mattermost, repo = repoReal, escribir, url, log } = d
  if (!fajo || !respuesta) return { texto: TEXTO.SIN_FAJO, estado: 'sin_fajo' }

  // ── Descartar ──────────────────────────────────────────────────────────────
  if (respuesta.que === RESPUESTA.DESCARTAR) {
    const cerrado = await repo.cerrarFajo(port, { id: fajo.id, estado: ESTADO.DESCARTADO })
    if (!cerrado) return { texto: TEXTO.YA_CERRADO, estado: 'ya_cerrado' }
    await refrescar(mattermost, cerrado, { message: TEXTO.DESCARTADO }, log)
    return { texto: TEXTO.DESCARTADO, estado: 'descartado' }
  }

  // ── El PROBABLE duplicado, contestado escribiendo ──────────────────────────
  //
  // Era el único freno del flujo sin salida por texto, y los botones —su única salida— están
  // apagados en producción. Ver `RE_DUP_MISMO` / `RE_DUP_OTRO`.
  if (respuesta.que === RESPUESTA.DUPLICADO) {
    const r = await contestarDuplicado({ port, repo, log }, {
      fajoId: fajo.id, indice: respuesta.indices?.[0] ?? -1, respuesta: respuesta.valor,
    })
    if (r.que === RESULTADO.SIN_FAJO) return { texto: TEXTO.SIN_FAJO, estado: 'sin_fajo' }
    if (r.que === RESULTADO.CERRADO) return { texto: TEXTO.YA_CERRADO, estado: 'ya_cerrado' }
    if (r.que === RESULTADO.INVALIDA) return { texto: TEXTO.DUPLICADO_RESUELTO, estado: 'duplicado_resuelto' }

    const anotado = respuesta.valor === 'mismo'
      ? '✔ Anotado: **es el mismo**, no lo cargo de nuevo.'
      : '✔ Anotado: **es otro comprobante**, lo cargo.'

    // CONTESTAR LO ÚLTIMO QUE FALTABA ES CONFIRMAR — el mismo escritor y la misma condición que el
    // botón y que la carga automática del post. No hay un tercer camino de escritura.
    if (r.listo) {
      const c = await confirmarFajo({
        port, repo, escribir, log,
        alEmpezar: (f) => refrescar(mattermost, f, { message: `${TEXTO.CARGANDO}\n\n${anotado}` }, log),
      }, { fajoId: r.fajo.id })
      if (c.que === RESULTADO.SIN_FAJO) return { texto: TEXTO.SIN_FAJO, estado: 'sin_fajo' }
      if (c.que === 'ya_en_curso' || c.que === RESULTADO.CERRADO) {
        return { texto: `${anotado}\n\nEsos comprobantes ya se estaban cargando.`, estado: 'ya_en_curso' }
      }
      await refrescar(mattermost, c.fajo, { message: c.texto }, log)
      return { texto: `${anotado}\n\n${c.texto ?? '✔ Cargado.'}`, estado: c.estado ?? ESTADO.CARGADO }
    }

    // «Es el mismo» sobre el ÚNICO comprobante del fajo deja un fajo sin nada que cargar: se cierra
    // acá mismo. Dejarlo abierto lo volvería a trabar todo, que es justo el defecto que se corrige.
    if ((r.fajo.items ?? []).every((it) => it?.duplicadoResuelto === 'mismo' || it?.yaCargado)) {
      await repo.cerrarFajo(port, { id: r.fajo.id, estado: ESTADO.DESCARTADO, error: 'el dueño confirmó que ya estaba cargado' })
      return { texto: `${anotado}`, estado: 'ya_estaba' }
    }

    await refrescar(mattermost, r.fajo, mensajeAtarjeta(r.fajo, url), log)
    const faltan = loQueFalta(r.fajo)
    return {
      texto: faltan.length ? `${anotado}\n\nMe falta todavía: **${faltan.join('** · **')}**.` : anotado,
      estado: 'anotado',
    }
  }

  // ── Ambiguo: se repregunta nombrando las candidatas ────────────────────────
  if (respuesta.que === RESPUESTA.AMBIGUO) {
    const l = ['❓ **Eso me deja dos opciones y no quiero adivinar.** ¿Cuál de estas?']
    for (const c of respuesta.candidatas ?? []) l.push(`• **${c.valor}** _(${etiqueta(c.campo)})_`)
    l.push('_Escribila entera, o tocá el botón en el mensaje de arriba._')
    return { texto: l.join('\n'), estado: 'ambiguo' }
  }

  // ── Aplicar la elección ────────────────────────────────────────────────────
  const r = await aplicarEleccion({ port, repo, log }, {
    fajoId: fajo.id, indices: respuesta.indices ?? [], campo: respuesta.campo, valor: respuesta.valor,
  })
  if (r.que === RESULTADO.SIN_FAJO) return { texto: TEXTO.SIN_FAJO, estado: 'sin_fajo' }
  if (r.que === RESULTADO.CERRADO) return { texto: TEXTO.YA_CERRADO, estado: 'ya_cerrado' }
  if (r.que === RESULTADO.INVALIDA) return { texto: TEXTO.INVALIDA, estado: 'opcion_invalida' }

  const anotado = `✔ Anotado: **${etiqueta(respuesta.campo)} = ${respuesta.valor}**${alcance(r.aplicados.length)}.`

  // CONTESTAR LO ÚLTIMO QUE FALTABA ES CONFIRMAR — la misma condición y el mismo escritor que usan el
  // botón Confirmar y la carga automática del post. No hay un tercer camino de escritura.
  if (r.listo) {
    const c = await confirmarFajo({
      port, repo, escribir, log,
      alEmpezar: (f) => refrescar(mattermost, f, { message: `${TEXTO.CARGANDO}\n\n${anotado}` }, log),
    }, { fajoId: r.fajo.id })
    if (c.que === RESULTADO.SIN_FAJO) return { texto: TEXTO.SIN_FAJO, estado: 'sin_fajo' }
    if (c.que === 'ya_en_curso' || c.que === RESULTADO.CERRADO) {
      return { texto: `${anotado}\n\nEsos comprobantes ya se estaban cargando.`, estado: 'ya_en_curso' }
    }
    // La tarjeta queda con el resultado —la prueba del efecto, releída de Compras— y la respuesta en
    // el hilo dice qué pasó sin repetir el cuadro entero.
    await refrescar(mattermost, c.fajo, { message: c.texto }, log)
    return { texto: `${anotado}\n\n${c.texto ?? '✔ Cargado.'}`, estado: c.estado ?? ESTADO.CARGADO }
  }

  // Todavía falta algo: la tarjeta se reescribe SIN la pregunta ya contestada y se nombra lo que
  // queda. Dejar la tarjeta vieja sería volver a pedir lo que la persona acaba de contestar.
  await refrescar(mattermost, r.fajo, mensajeAtarjeta(r.fajo, url), log)
  const falta = loQueFalta(r.fajo)
  return {
    texto: falta.length
      ? `${anotado}\n\nMe falta todavía: **${falta.join('** · **')}**. Contestame acá mismo o tocá el botón arriba.`
      : `${anotado}\n\nNo puedo cargarlo todavía: revisá el mensaje de arriba, hay algo que no pude leer.`,
    estado: 'anotado',
  }
}

function mensajeAtarjeta(fajo, url) {
  const m = mensajeFajo(fajo, { url })
  return { message: m.texto, attachments: m.attachments }
}
