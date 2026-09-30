// LO QUE SE PAGÓ EN EFECTIVO — pagos a cuenta del plantel, gastos sin ticket y subcontratistas, en el canal Efectivo.
//
// ═══ EL PEDIDO (dueño, 30/09/2026) ═══
//
// Tres mensajes reales del canal terminaron en «No pude cargarlos: ninguno tenía lo mínimo para cargarse»:
//   «hoy le pague 100 a rodrigo»
//   «hoy le pague 150000 de adelanto a emiliano maldonado»
//   «se pagaron 220000 en efectivo de arreglo de fordf100»
// y pidió además cargar pagos a subcontratistas por el mismo canal. Causa: ningún especialista cubría un pago a
// una persona SIN entrega a rendir, ni un gasto sin ticket, ni un subcontratista; los reclamaba la libreta, que no
// los entendía, o `adelantos-sueldo`, que sin entrega rechazaba.
//
// ═══ LOS TRES CASOS, Y A DÓNDE VA CADA UNO ═══
//
//   1. PAGO A UNA PERSONA DEL PLANTEL («le pagué 100 a Rodrigo», «adelanto», «a cuenta»): el MISMO «Pagado
//      efectivo» de Liquidación de horas (`liquidacion_linea`), por `pago_efectivo_de_sueldo`. Nunca una tabla
//      paralela: la que hay sólo da idempotencia y dice quién lo escribió.
//   2. GASTO EN EFECTIVO SIN TICKET: una fila de Compras por la ruta de la libreta (`escribirFajo`), Efectivo,
//      contado, pagada. Nunca «A rendir».
//   3. SUBCONTRATISTA: fila de Compras con el proveedor del padrón y la obra de su subcontrato.
//
// QUIÉN RECLAMA (la trampa número uno): este especialista ordena entre `adelantos-sueldo` (gana «adelanto» y
// delega acá cuando no hay entrega) y `entregas-efectivo`/`libreta`. El director toma el primero del área por
// orden alfabético de slug cuando hay empate: esa dependencia está fijada en el test.
import { canalOficialDeArea } from '../../lib/canal-de-area.mjs'
import {
  armarPadron, interpretarPago, pareceUnPago, dijoDeDondeSalio, leerOrigen, leerEleccion, leerPlata, itemDePago,
  textoDePregunta, pesos, ddmm, elegirEmpleadoEnPadron,
} from '../../lib/efectivo-pago-texto.mjs'
import { escribirFajo } from '../comprobantes/escritura.mjs'
import * as repo from '../comprobantes/repositorio.mjs'
import { perfilDeMattermost } from './entregas-efectivo.mjs'
import { elegirEntrega, entregasAbiertasDe, textoAmbigua } from './rendiciones.mjs'
import {
  padronDeAdelantos, hoySanJuan, cuentaNueva, enlaces, registrarAdelanto, textoCargado, finDeQuincena,
} from './adelantos-sueldo.mjs'

export const AREA = 'rendicion'

export const TEXTO = Object.freeze({
  CANAL: 'Los pagos en efectivo se escriben en el canal Efectivo.',
  NO_VERIFICABLE: 'No pude confirmar desde dónde escribís ni quién sos, así que no cargué nada. Probá de nuevo en un minuto.',
  SIN_PERSONA: 'No encuentro tu usuario en el padrón, y una carga queda firmada por quien la hace. Avisale a Administración. No cargué nada.',
  CANCELADO: 'Listo, no cargué nada.',
  NO_ENTENDI: 'No entendí la respuesta. Contestá con el número de la opción, o **no** para dejarlo.',
  TRANSFERENCIA_A_PERSONA: 'Entendí una transferencia a una persona del plantel: esa no es un pago en efectivo y no va al «Pagado efectivo» de Liquidación. No cargué nada. Si fue un adelanto en efectivo, escribilo sin «transferí».',
  SIN_MIGRACION: 'Entendí el pago, pero el registro de pagos directos todavía no está habilitado en la base, así que no cargué nada. Avisale a Administración.',
})

// ═══ LA PREGUNTA QUE QUEDÓ ABIERTA, POR HILO ═══ (misma mecánica que adelantos-sueldo: 10 minutos, en memoria)
const PENDIENTE_MIN = 10
const pendientes = new Map()
const claveDe = (a) => (a?.channel_id && a?.plataforma_user_id && a?.root_post_id
  ? `${a.channel_id}:${a.plataforma_user_id}:${a.root_post_id}` : null)
export function pendienteDePago(actor, ahora = Date.now()) {
  const k = claveDe(actor)
  const p = k ? pendientes.get(k) : null
  if (!p) return null
  if (ahora - p.en > PENDIENTE_MIN * 60_000) { pendientes.delete(k); return null }
  return p
}
export function recordarPendientePago(actor, p, ahora = Date.now()) {
  const k = claveDe(actor)
  if (!k) return
  if (p == null) pendientes.delete(k); else pendientes.set(k, { ...p, en: ahora })
}

// ═══ LOS MAESTROS: proveedores, obras, subcontratos, rodados — una lectura por minuto y por puerto ═══
const cacheMaestros = new WeakMap()
async function leer(port, sql) {
  try { return (await port.query(sql))?.rows ?? [] } catch { return [] }
}
export async function maestrosDePagos(port, ahora = Date.now()) {
  const c = cacheMaestros.get(port)
  if (c && ahora - c.en < 60_000) return c.dato
  const [proveedores, obras, subcontratos, rodados] = await Promise.all([
    leer(port, `select p.id, p.nombre, p.razon_social,
                       exists (select 1 from public.subcontrato s where s.proveedor_id = p.id and s.estado in ('contratado','en_curso')) as subcontratista
                  from public.proveedores p where p.activo and not coalesce(p.es_prueba, false)`),
    leer(port, `select o.id, o.nombre, coalesce(array_agg(a.alias) filter (where a.alias is not null), '{}') as alias
                  from public.obra_canonica o left join public.obra_alias a on a.obra_id = o.id group by o.id, o.nombre`),
    leer(port, `select s.id, s.obra_id, o.nombre as obra_nombre, s.proveedor_id, s.proveedor_texto, s.nombre, s.alcance, s.precio_contratado
                  from public.subcontrato s join public.obra_canonica o on o.id = s.obra_id
                 where s.estado in ('contratado','en_curso')`),
    leer(port, `select id, codigo, nombre, patente from public.activo where clase = 'rodado'`),
  ])
  const dato = { proveedores, obras, subcontratos, rodados }
  cacheMaestros.set(port, { en: ahora, dato })
  return dato
}

/**
 * LA ESCRITURA DEL PAGO A CUENTA, SIN ENTREGA: la MISMA celda que `registrarAdelanto` (Pagado efectivo), pero
 * pagada con la caja. La evidencia se lee en destino. Sin la migración aplicada (42883/42P01) no escribe nada.
 */
export async function registrarPagoDirecto({ port, persona, fecha, importe, expresion, clave, post, perfilId }) {
  for (let intento = 0; intento < 2; intento++) {
    const cel = (await port.query('select public.adelanto_de_sueldo_celda($1, $2) as c', [persona.id, fecha])).rows[0].c
    if (cel.estado === 'cerrada') return { estado: 'cerrada', desde: cel.desde, hasta: cel.hasta, grupo: cel.grupo }
    const antes = Number(cel.antes)
    const { formula, valor } = cuentaNueva({ antes, formula: cel.formula }, expresion)
    if (Math.abs(valor - (antes + importe)) > 0.005) throw new Error(`la cuenta ${formula} da ${valor} y debería dar ${antes + importe}`)
    let r
    try {
      r = (await port.query(
        'select public.pago_efectivo_de_sueldo($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) as r',
        [persona.id, fecha, importe, expresion, antes, formula, valor, clave, post, perfilId])).rows[0].r
    } catch (e) {
      if (e?.code === '42883' || e?.code === '42P01') return { estado: 'sin_migracion' }
      if (e?.code === '40001' && intento === 0) continue
      throw e
    }
    if (r.ya_estaba) return { estado: 'ya_estaba', ...r }
    const v = (await port.query(
      `select l.pagado_efectivo, l.formulas ->> 'pagadoEfectivo' as formula,
              (select count(*) from public.pago_efectivo_sueldo where clave = $3)::int as registros
         from public.liquidacion_linea l join public.liquidacion_quincena q on q.id = l.liquidacion_id
        where l.persona_id = $1 and q.desde = $2 and q.grupo = $4`, [persona.id, r.desde, clave, r.grupo])).rows[0]
    if (!v || Math.abs(Number(v.pagado_efectivo) - valor) > 0.005 || v.formula !== formula || v.registros !== 1) {
      throw new Error(`la base no muestra lo escrito (pagado ${v?.pagado_efectivo ?? '—'}, cuenta ${v?.formula ?? '—'})`)
    }
    return { estado: 'cargado', ...r, formula, valor }
  }
  throw new Error('la celda cambió dos veces mientras se cargaba')
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

/** La confirmación del pago a cuenta: persona, monto, período y «efectivo, a cuenta». Sin saldos. */
export function textoPagoDirecto({ importe, persona, desde, hasta, grupo, pagada = false, yaEstaba = false, aviso = null }) {
  const mensual = String(grupo ?? '').toLowerCase().includes('oficina')
  const periodo = mensual
    ? `el mes de ${MESES[Number(String(desde).slice(5, 7)) - 1] ?? ddmm(desde)} (quincena ${ddmm(desde)}–${ddmm(hasta)})`
    : `la quincena ${ddmm(desde)}–${ddmm(hasta)}`
  const l = enlaces({ desde, persona })
  return [
    yaEstaba ? 'Este pago ya estaba cargado; no lo cargué de nuevo:' : null,
    `Pago de **${pesos(importe)}** a **${persona}** cargado en Liquidación contra ${periodo}: **efectivo, a cuenta** (sumado a lo que ya tenía en «Pagado efectivo», no se pisó).`,
    pagada ? `⚠ Ese período de ${persona} ya estaba marcado **pagado**: este pago queda como pago de más. Revisalo en Liquidación.` : null,
    aviso,
    '',
    `Liquidación: ${l.liquidacion}`,
  ].filter((x) => x != null).join('\n')
}

/** Lo que se entendió del gasto o del subcontrato, y lo que quedó sin completar. */
export function resumenDeGasto(l) {
  const filas = [
    `- ${l.tipo === 'subcontrato' ? 'Subcontratista' : 'Proveedor'}: ${l.proveedor?.nombre ?? '**sin identificar**'}`,
    `- Importe: **${pesos(l.importe)}** · ${l.forma} · ${ddmm(l.fecha)}`,
    `- Obra: ${l.obra?.nombre ?? '**sin completar**'}`,
    l.tipoCosto ? `- Tipo de costo: ${l.tipoCosto}${l.tipo === 'subcontrato' ? ' (subcontrato)' : ''}` : null,
    l.rodado ? `- Rodado: ${l.rodado.codigo}${l.rodado.patente ? ` (${l.rodado.patente})` : ''}` : null,
    l.subcontrato ? `- Subcontrato: ${l.subcontrato.nombre}${l.subcontrato.precio_contratado ? ` · contratado ${pesos(l.subcontrato.precio_contratado)}` : ''}` : null,
  ].filter(Boolean)
  const faltan = []
  if (!l.proveedor?.nombre) faltan.push('el proveedor')
  if (!l.obra?.nombre) faltan.push('la obra')
  return { filas, faltan }
}

const motivoDe = (m) => String(m).replace(/^.*?ERROR:\s*/, '').slice(0, 180)

export const especialista = {
  slug: 'efectivo-pagos',
  agentSlug: 'compras',
  area: AREA,
  titulo: 'Efectivo · pagos, gastos sin ticket y subcontratistas',
  descripcion:
    'Escribí lo que pagaste en efectivo: «le pagué 100 a Rodrigo» (a cuenta de su liquidación), «pagué 50.000 de gasoil» '
    + '(gasto sin ticket, va a Compras) o «le pagué 500.000 a Nasser por Quattropani» (subcontratista).',
  ejemplos: ['hoy le pagué 100 a Rodrigo', 'se pagaron 220000 en efectivo de arreglo de ford f100', 'le pagué 500000 a Nasser por Quattropani'],
  operativo: true,
  preferidoDeArea: false,

  async reconoce(texto, ctx = {}) {
    if (ctx.area !== AREA) return null
    if ((ctx.fileIds?.length ?? 0) > 0) return null
    if (pendienteDePago(ctx.actor)) return { destino: 'respuesta', confianza: 0.96 }
    if (pareceUnPago(texto)) return { destino: 'pago', confianza: 1 }
    return null
  },

  async atender({
    texto, intencion, port, actor, commEventId = null, postId = null, log, ahora = new Date(),
    registrar = registrarPagoDirecto, abrir = repo.abrirFajo, escribir = escribirFajo,
  }) {
    const ruta = intencion ?? await this.reconoce(texto, { area: AREA, actor, port })
    if (!ruta) return { texto: TEXTO.CANAL, estado: 'ayuda', privado: false }

    let canal = { ok: false, motivo: 'no_es_el_oficial' }
    try { canal = await canalOficialDeArea({ port, channelId: actor?.channel_id, area: AREA }) } catch { canal = { ok: false, motivo: 'no_verificable' } }
    if (!canal.ok) return { texto: canal.motivo === 'no_verificable' ? TEXTO.NO_VERIFICABLE : TEXTO.CANAL, estado: 'rechazado_canal', privado: false }

    let yo, perfil, datos, maestros
    try {
      yo = await entregasAbiertasDe(port, actor?.plataforma_user_id)
      perfil = await perfilDeMattermost(port, actor?.plataforma_user_id)
      datos = await padronDeAdelantos(port)
      maestros = await maestrosDePagos(port)
    } catch (e) {
      log?.warn?.('efectivo-pagos: no pude leer el padrón', { error: String(e?.message ?? e) })
      return { texto: TEXTO.NO_VERIFICABLE, estado: 'rechazado_no_verificable', privado: false }
    }
    if (!yo.perfilId && !perfil?.perfil_id) return { texto: TEXTO.SIN_PERSONA, estado: 'rechazado_sin_persona', privado: false }
    const perfilId = yo.perfilId ?? perfil.perfil_id

    const hoy = hoySanJuan(ahora)
    const ctx = { hoy, padron: datos.padron, ...maestros }
    const idMensaje = commEventId ?? postId ?? actor?.root_post_id ?? null
    const previo = ruta.destino === 'respuesta' ? pendienteDePago(actor) : null

    // 1. QUÉ DICE: el mensaje solo, o la respuesta pegada a la pregunta abierta en el hilo.
    let leido
    let textoBase = texto
    if (previo) {
      textoBase = previo.texto
      const r = this.responder({ texto, previo, ctx })
      if (r.cancelar) { recordarPendientePago(actor, null); return { texto: TEXTO.CANCELADO, estado: 'cancelado', privado: false } }
      if (!r.leido) {
        if (pareceUnPago(texto)) { recordarPendientePago(actor, null); leido = interpretarPago(texto, ctx); textoBase = texto }
        else return { texto: `${TEXTO.NO_ENTENDI}\n\n${textoDePregunta({ ...previo.leido, falta: previo.falta })}`, estado: 'pregunta_repetida', privado: false }
      } else leido = r.leido
    } else {
      leido = interpretarPago(texto, ctx)
    }
    if (leido.estado === 'nada') return { texto: TEXTO.CANAL, estado: 'ayuda', privado: false }
    if (leido.estado === 'fuera') return { texto: TEXTO.TRANSFERENCIA_A_PERSONA, estado: 'rechazado_transferencia_a_persona', privado: false }
    const origenDicho = previo?.origen ?? leido.origen ?? dijoDeDondeSalio(textoBase)
    if (leido.estado === 'pregunta') {
      recordarPendientePago(actor, { falta: leido.falta, leido, texto: textoBase, origen: origenDicho })
      return { texto: textoDePregunta(leido), estado: `pregunta_${leido.falta}`, privado: false }
    }
    if (leido.importe == null) return { texto: textoDePregunta({ ...leido, falta: 'monto' }), estado: 'pregunta_monto', privado: false }

    // 2. ¿CON QUÉ PLATA? Sólo se pregunta si hay una entrega abierta y el texto no lo dice.
    const hayEntrega = (yo.abiertas?.length ?? 0) > 0
    const pregunta = leido.tipo === 'gasto' || leido.tipo === 'sueldo'
    if (hayEntrega && pregunta && !origenDicho && leido.forma !== 'Transferencia') {
      const e = elegirEntrega(yo.abiertas, textoBase).entrega ?? yo.abiertas[0]
      recordarPendientePago(actor, { falta: 'origen', leido: { ...leido, falta: 'origen', codigo: e.codigo }, texto: textoBase, origen: null })
      return { texto: textoDePregunta({ ...leido, falta: 'origen', codigo: e.codigo }), estado: 'pregunta_origen', privado: false }
    }
    recordarPendientePago(actor, null)

    // 3. CADA CASO
    if (leido.tipo === 'sueldo') {
      if (origenDicho === 'entrega') {
        const { entrega } = elegirEntrega(yo.abiertas, textoBase)
        if (!entrega) return { texto: textoAmbigua(yo.abiertas).replace('este ticket', 'este pago'), estado: 'pregunta_entrega', privado: false }
        try {
          const r = await registrarAdelanto({
            port, entrega, persona: leido.persona, fecha: leido.fecha, importe: leido.importe, expresion: leido.expresion,
            clave: `adelanto:${idMensaje ?? `${leido.persona.id}|${leido.fecha}|${leido.importe}`}`, post: actor?.root_post_id ?? postId ?? null, perfilId,
          })
          if (r.estado === 'cerrada') return { texto: `No cargué el pago de ${pesos(leido.importe)} a **${leido.persona.nombre}**: la quincena ${ddmm(r.desde)}–${ddmm(r.hasta)} está **cerrada**.`, estado: 'rechazado_quincena_cerrada', privado: false }
          return {
            texto: textoCargado({ importe: leido.importe, persona: leido.persona.nombre, desde: r.desde, hasta: r.hasta ?? finDeQuincena(r.desde), codigo: r.codigo ?? entrega.codigo, pagada: r.pagada === true, yaEstaba: r.estado === 'ya_estaba' }),
            estado: r.estado === 'ya_estaba' ? 'ya_estaba' : 'adelanto_cargado', privado: false,
          }
        } catch (e) {
          log?.error?.('efectivo-pagos: no se pudo cargar', { error: String(e?.message ?? e).slice(0, 300) })
          return { texto: `No cargué el pago de ${pesos(leido.importe)} a **${leido.persona.nombre}**: ${motivoDe(e?.message ?? e)}\nNo se tocó tu entrega ni Liquidación.`, estado: 'error', privado: false }
        }
      }
      return this.pagarSueldo({ leido, port, idMensaje, actor, postId, perfilId, log, registrar })
    }

    if (origenDicho === 'entrega') {
      return {
        texto: `Entendí un gasto de ${pesos(leido.importe)} pagado con tu entrega. Para rendirlo mandá el ticket (foto) en este canal, que es lo que baja lo que te queda por rendir. No cargué nada.`,
        estado: 'rechazado_origen_entrega', privado: false,
      }
    }
    return this.cargarGasto({ leido, port, actor, perfil, log, abrir, escribir })
  },

  /** Lee la respuesta a la pregunta abierta. Devuelve {cancelar}|{leido}|{} (no se entendió). */
  responder({ texto, previo, ctx }) {
    const falta = previo.falta
    if (falta === 'origen') {
      const o = leerOrigen(texto)
      if (o?.cancelar) return { cancelar: true }
      return o ? { leido: { ...previo.leido, estado: 'listo', origen: o.origen } } : {}
    }
    if (falta === 'monto') {
      if (/^(?:no|cancela(?:r|lo)?|dejalo|olvidalo)$/i.test(texto.trim())) return { cancelar: true }
      const m = leerPlata(texto)
      if (!m) return {}
      const l = interpretarPago(`${previo.texto} ${texto}`, ctx)
      return l.estado === 'pregunta' && l.falta === 'monto' ? {} : { leido: l }
    }
    const e = leerEleccion(texto, previo.leido.candidatos)
    if (e?.cancelar) return { cancelar: true }
    if (falta === 'persona' && !previo.leido.candidatos?.length) {
      const q = elegirEmpleadoEnPadron(texto, ctx.padron)
      return q?.persona ? { leido: { ...previo.leido, estado: 'listo', tipo: 'sueldo', persona: q.persona } } : {}
    }
    if (!e?.elegido) return {}
    if (falta === 'persona_ambigua' || falta === 'persona') return { leido: { ...previo.leido, estado: 'listo', tipo: 'sueldo', persona: e.elegido } }
    if (falta === 'proveedor_ambiguo') return { leido: interpretarPago(previo.texto, { ...ctx, proveedores: [e.elegido] }) }
    if (falta === 'subcontrato_varios') {
      return { leido: interpretarPago(previo.texto, { ...ctx, subcontratos: [e.elegido], obras: ctx.obras.filter((o) => o.id === e.elegido.obra_id) }) }
    }
    return {}
  },

  async pagarSueldo({ leido, port, idMensaje, actor, postId, perfilId, log, registrar = registrarPagoDirecto }) {
    const clave = `pago-efectivo:${idMensaje ?? `${leido.persona.id}|${leido.fecha}|${leido.importe}`}`
    try {
      const r = await registrar({
        port, persona: leido.persona, fecha: leido.fecha, importe: leido.importe, expresion: leido.expresion ?? String(leido.importe),
        clave, post: actor?.root_post_id ?? postId ?? null, perfilId,
      })
      if (r.estado === 'sin_migracion') return { texto: TEXTO.SIN_MIGRACION, estado: 'rechazado_sin_migracion', privado: false }
      if (r.estado === 'cerrada') {
        return {
          texto: `No cargué el pago de ${pesos(leido.importe)} a **${leido.persona.nombre}**: la quincena ${ddmm(r.desde)}–${ddmm(r.hasta)} de Liquidación está **cerrada**, y una quincena cerrada no recibe pagos. Avisale a Administración para que la reabra o lo cargue a mano.`,
          estado: 'rechazado_quincena_cerrada', privado: false,
        }
      }
      return {
        texto: textoPagoDirecto({
          importe: leido.importe, persona: leido.persona.nombre, desde: r.desde, hasta: r.hasta ?? finDeQuincena(r.desde),
          grupo: r.grupo, pagada: r.pagada === true, yaEstaba: r.estado === 'ya_estaba',
        }),
        estado: r.estado === 'ya_estaba' ? 'ya_estaba' : 'pago_cargado', privado: false,
      }
    } catch (e) {
      const m = String(e?.message ?? e)
      log?.error?.('efectivo-pagos: no se pudo cargar', { error: m.slice(0, 300) })
      return { texto: `No cargué el pago de ${pesos(leido.importe)} a **${leido.persona.nombre}**: ${motivoDe(m)}\nNo se tocó Liquidación.`, estado: 'error', privado: false }
    }
  },

  async cargarGasto({ leido, port, actor, perfil, log, abrir, escribir }) {
    if (!perfil?.perfil_id) return { texto: TEXTO.SIN_PERSONA, estado: 'rechazado_sin_perfil', privado: false }
    const item = itemDePago(leido)
    const fajo = await abrir(port, {
      plataforma: actor?.plataforma ?? 'mattermost',
      userId: actor?.plataforma_user_id,
      username: perfil.nombre ?? actor?.plataforma_username ?? null,
      channelId: actor?.channel_id,
      rootPostId: actor?.root_post_id ?? null,
      postId: actor?.root_post_id ?? null,
      items: [item],
    })
    if (!fajo) return { texto: 'No pude abrir la carga. Probá de nuevo en un minuto.', estado: 'error', privado: false }
    let r
    try { r = await escribir({ port, log }, fajo) } catch (e) {
      log?.error?.('efectivo-pagos: no se pudo escribir en Compras', { error: String(e?.message ?? e).slice(0, 300) })
      return { texto: 'Entendí el pago pero no pude escribirlo en Compras, así que no quedó cargado. Probá de nuevo en un minuto.', estado: 'error', privado: false }
    }
    const { filas, faltan } = resumenDeGasto(leido)
    const cierre = faltan.length
      ? `Quedó sin completar ${faltan.join(' y ')}: completalo en Compras.${leido.tipo === 'subcontrato' && !leido.obra ? ' Decime a qué obra va si querés que lo busque.' : ''}`
      : null
    return {
      texto: ['Pago en efectivo cargado en Compras (sin comprobante):', ...filas, '', r?.texto ?? 'Cargado.', cierre].filter((x) => x != null).join('\n'),
      estado: r?.estado ?? 'cargado', privado: false,
    }
  },

  skillDe(intencion) {
    return `compras.efectivo.pago.${intencion?.destino === 'respuesta' ? 'respuesta' : 'cargar'}`
  },
}
