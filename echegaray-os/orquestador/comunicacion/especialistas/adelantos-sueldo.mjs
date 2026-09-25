// ADELANTOS DE SUELDO ESCRITOS EN EL CANAL EFECTIVO — «le di 8500 de adelanto a Juan Pérez».
//
// ═══ EL PEDIDO, TEXTUAL (dueño, 25/09/2026) ═══
//
// *«necesito que se reconozca por lenguaje natural imputaciones de gastos directamente como se escribe en canal
// efectivo del chat. es una funcion especifica de pago de adelantos a empleados por escritura en ese chat. el pago
// se le tiene q imputar como rendicion directa a la persona q escribio esto, debe quedar registrado como pago en
// modulo liquidacion de hs de app.ecsas.com.ar (si hay algo antes tiene q sumarlo a lo q hay es decir antes habia
// 8500*8 + 7600, asi) y tiene q enviar todas las confirmaciones por el hilo de esa carga en el canal efectivo del
// chat asegurando q se puso el pago al empleado x y se puso la rendicion de ese efectivo en la rendicion q
// corresponde de app.ecsas.com.ar»*.
//
// ═══ QUÉ HACE ═══
//
// Quien tiene plata a rendir y le da un adelanto a un empleado lo escribe en el canal. En UNA transacción de la
// base (`rendir_adelanto_de_sueldo`, migración 20260925T1100):
//
//   · su entrega abierta baja por el importe (una rendición sin ticket: el comprobante es el mensaje);
//   · la celda «Pagado efectivo» del empleado en Liquidación, en la quincena de la fecha, SUMA el importe a la
//     cuenta que ya tenía («=8500*8» → «=8500*8+20000»). Nunca la pisa.
//
// Todas las respuestas van al hilo del mensaje (el handler contesta bajo su raíz).
//
// ═══ LO QUE NO PUBLICA ═══
//
// Ni el saldo de quien escribió ni lo que suma el empleado en la quincena: el canal lo ven todos los que rinden, y
// la Liquidación es de Administración (el jefe de obra no entra a sueldos, `liquida_sueldos()`). Se dice QUÉ se
// hizo y dónde verlo, con el enlace.
//
// ═══ LAS DOS PUERTAS, FALLA CERRADO ═══
//
//   1. CANAL: el oficial del área `rendicion` (el canal Efectivo).
//   2. QUIÉN: la persona del padrón detrás del usuario de Mattermost tiene una entrega ABIERTA. El adelanto sale
//      de SU saldo, así que tiene que tener uno.
import { canalOficialDeArea } from '../../lib/canal-de-area.mjs'
import {
  armarPadron, interpretarAdelanto, leerRespuesta, numeroParaCuenta, pesos, senalDeAdelanto, elegirEmpleado,
  textoDePregunta,
} from '../../lib/adelanto-sueldo-texto.mjs'
import { leerCeldaNumerica } from '../../../src/shared/lib/formulaEsAR.ts'
import { elegirEntrega, entregasAbiertasDe, textoAmbigua } from './rendiciones.mjs'

export const AREA = 'rendicion'
export const URL_APP = process.env.ORQ_APP_URL || 'https://app.ecsas.com.ar'

export const TEXTO = Object.freeze({
  CANAL: 'Los adelantos de sueldo pagados con plata a rendir se escriben en el canal Efectivo.',
  NO_VERIFICABLE: 'No pude confirmar desde dónde escribís ni quién sos, así que no cargué nada. Probá de nuevo en un minuto.',
  SIN_PERSONA: 'No encuentro tu legajo detrás de este usuario de Mattermost, y el adelanto se rinde de tu entrega. Avisale a Administración. No cargué nada.',
  ES_PRUEBA: 'Tu usuario es de PRUEBA: no cargo adelantos de sueldo. Si esto no es una prueba, avisale a Administración.',
  SIN_ENTREGA: [
    'No tenés efectivo a rendir abierto, así que no cargué el adelanto: se rinde de tu entrega y no tenés ninguna.',
    'Si lo pagaste con plata de la oficina, se carga en Liquidación, en la celda «Pagado efectivo» del empleado.',
  ].join('\n'),
  CANCELADO: 'Listo, no cargué nada.',
  NO_ENTENDI: 'No entendí la respuesta. Contestá con el número de la opción, o **no** para dejarlo.',
})

// ═══ LA PREGUNTA QUE QUEDÓ ABIERTA, POR HILO ═══
//
// «adelanto 20 mil a Emiliano» tiene dos Emilianos: se pregunta en el hilo y la respuesta («1») vuelve en el
// MISMO hilo. La clave es canal + persona + raíz del hilo: una respuesta en otro hilo, o de otra persona, no la
// toma. Vive en memoria del worker a propósito (como las entregas): son diez minutos, y si el proceso se reinicia
// lo peor que pasa es que el bot vuelve a preguntar.
const PENDIENTE_MIN = 10
const pendientes = new Map()
const claveDe = (a) => (a?.channel_id && a?.plataforma_user_id && a?.root_post_id
  ? `${a.channel_id}:${a.plataforma_user_id}:${a.root_post_id}` : null)
export function pendienteDe(actor, ahora = Date.now()) {
  const k = claveDe(actor)
  const p = k ? pendientes.get(k) : null
  if (!p) return null
  if (ahora - p.en > PENDIENTE_MIN * 60_000) { pendientes.delete(k); return null }
  return p
}
export function recordarPendiente(actor, p, ahora = Date.now()) {
  const k = claveDe(actor)
  if (!k) return
  if (p == null) pendientes.delete(k); else pendientes.set(k, { ...p, en: ahora })
}

/** Hoy en San Juan, ISO. */
export const hoySanJuan = (ahora = new Date()) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/San_Juan', year: 'numeric', month: '2-digit', day: '2-digit' }).format(ahora)

const ddmm = (iso) => `${String(iso).slice(8, 10)}/${String(iso).slice(5, 7)}`

// EL PADRÓN SE LEE UNA VEZ POR MINUTO, no por mensaje: `reconoce` lo consulta para «a cuenta»/«anticipo».
// Por puerto: cada conexión (y cada doble de prueba) tiene su propia copia.
const cachePadron = new WeakMap()
/** El plantel (sin Dirección ni prueba) con sus apodos de JORNALES, y los proveedores activos. */
export async function padronDeAdelantos(port, ahora = Date.now()) {
  const c = cachePadron.get(port)
  if (c && ahora - c.en < 60_000) return c.dato
  const personas = await port.query(
    `select p.id, p.nombre_completo, p.nombre_para_mostrar,
            array(select distinct j.nombre_planilla from public.jornales_bloque_persona j
                   where j.persona_id = p.id and j.nombre_planilla is not null) as apodos
       from public.personas p
      where p.en_la_empresa and not coalesce(p.es_prueba, false)
        and coalesce(upper(p.puesto), '') not like 'DIRECC%'
      order by p.nombre_completo`)
  const prov = await port.query(
    `select nombre, razon_social from public.proveedores where activo and not coalesce(es_prueba, false)`)
  const dato = {
    padron: armarPadron(personas?.rows ?? []),
    proveedores: (prov?.rows ?? []).flatMap((r) => [r.nombre, r.razon_social]).filter(Boolean),
  }
  cachePadron.set(port, { en: ahora, dato })
  return dato
}

/** Los enlaces que acompañan la confirmación: la Liquidación de esa quincena y la entrega de quien escribió. */
export function enlaces({ desde, persona }) {
  const q = new URLSearchParams({ vista: 'liquidacion', quincena: desde, ...(persona ? { buscar: persona } : {}) })
  return {
    liquidacion: `${URL_APP}/administracion/personas?${q.toString()}`,
    miEfectivo: `${URL_APP}/mi-informacion/efectivo`,
  }
}

/** La confirmación, en el hilo. Sin saldos: el canal lo ve todo el grupo. */
export function textoCargado({ importe, persona, desde, hasta, codigo, pagada = false, yaEstaba = false }) {
  const l = enlaces({ desde, persona })
  return [
    yaEstaba ? 'Este adelanto ya estaba cargado; no lo cargué de nuevo:' : null,
    `Adelanto de **${pesos(importe)}** a **${persona}** cargado en Liquidación, quincena ${ddmm(desde)}–${ddmm(hasta)}, en «Pagado efectivo» (sumado a lo que ya tenía, no se pisó).`,
    `Rendido de tu entrega **${codigo}**: tu saldo a rendir bajó por ese importe. Lo ves en Mi efectivo; acá no se publica.`,
    pagada ? `⚠ Esa quincena de ${persona} ya estaba marcada **pagada**: este adelanto queda como pago de más. Revisalo en Liquidación.` : null,
    '',
    `Liquidación: ${l.liquidacion}`,
    `Mi efectivo: ${l.miEfectivo}`,
  ].filter((x) => x != null).join('\n')
}

/**
 * LA CUENTA NUEVA DE LA CELDA. Se le suma el término a la cuenta que tenía; si la cuenta guardada no da lo que
 * la celda muestra (una cuenta vieja), se arma desde el número, para que la celda nunca abra con una cuenta que
 * da otro resultado. El valor sale del MISMO lector que usa la celda en la app.
 * @returns {{formula:string, valor:number}}
 */
export function cuentaNueva({ antes, formula }, expresion) {
  const previa = formula ? leerCeldaNumerica(formula) : null
  const sirve = previa?.ok && previa.valor != null && Math.abs(previa.valor - antes) < 0.005
  const nueva = sirve ? `${formula}+${expresion}`
    : antes > 0 ? `=${numeroParaCuenta(antes)}+${expresion}` : `=${expresion}`
  const leido = leerCeldaNumerica(nueva)
  if (!leido.ok || leido.valor == null) throw new Error(`la cuenta ${nueva} no se entiende`)
  return { formula: nueva, valor: Math.round(leido.valor * 100) / 100 }
}

/**
 * LA ESCRITURA: rendición + pago en Liquidación, en una transacción de la base, y la EVIDENCIA leída en destino.
 * Inyectable para que los tests no toquen la base.
 */
export async function registrarAdelanto({ port, entrega, persona, fecha, importe, expresion, clave, post, perfilId }) {
  for (let intento = 0; intento < 2; intento++) {
    const cel = (await port.query('select public.adelanto_de_sueldo_celda($1, $2) as c', [persona.id, fecha])).rows[0].c
    if (cel.estado === 'cerrada') return { estado: 'cerrada', desde: cel.desde, hasta: cel.hasta, grupo: cel.grupo }
    const antes = Number(cel.antes)
    const { formula, valor } = cuentaNueva({ antes, formula: cel.formula }, expresion)
    if (Math.abs(valor - (antes + importe)) > 0.005) throw new Error(`la cuenta ${formula} da ${valor} y debería dar ${antes + importe}`)
    let r
    try {
      r = (await port.query(
        'select public.rendir_adelanto_de_sueldo($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) as r',
        [entrega.id, persona.id, fecha, importe, expresion, antes, formula, valor, clave, post, perfilId])).rows[0].r
    } catch (e) {
      // Alguien tocó la celda en el medio: se relee y se vuelve a sumar, una vez.
      if (e?.code === '40001' && intento === 0) continue
      throw e
    }
    if (r.ya_estaba) return { estado: 'ya_estaba', ...r }
    // LA EVIDENCIA ES EL DATO EN SU DESTINO, no lo que devolvió la función.
    const v = (await port.query(
      `select l.pagado_efectivo, l.formulas ->> 'pagadoEfectivo' as formula,
              (select count(*) from public.efectivo_rendicion where compra_clave = $3)::int as rendiciones
         from public.liquidacion_linea l join public.liquidacion_quincena q on q.id = l.liquidacion_id
        where l.persona_id = $1 and q.desde = $2 and q.grupo = $4`, [persona.id, r.desde, clave, r.grupo])).rows[0]
    if (!v || Math.abs(Number(v.pagado_efectivo) - valor) > 0.005 || v.formula !== formula || v.rendiciones !== 1) {
      throw new Error(`la base no muestra lo escrito (pagado ${v?.pagado_efectivo ?? '—'}, cuenta ${v?.formula ?? '—'})`)
    }
    return { estado: 'cargado', ...r, formula, valor }
  }
  throw new Error('la celda cambió dos veces mientras se cargaba')
}

/** El error de la base, dicho para quien escribió. */
function motivoDe(m) {
  if (/más de lo que queda a rendir/.test(m)) return 'el adelanto es más de lo que te queda a rendir en esa entrega (lo ves en Mi efectivo).'
  if (/no está en el plantel/.test(m)) return 'esa persona no figura en el plantel activo.'
  if (/no está abierta/.test(m)) return 'tu entrega ya no está abierta.'
  if (/es de prueba/.test(m)) return 'la entrega es de prueba.'
  return m.replace(/^.*?ERROR:\s*/, '').slice(0, 180)
}

export const especialista = {
  slug: 'adelantos-sueldo',
  agentSlug: 'compras',
  area: AREA,
  titulo: 'Efectivo a rendir · adelantos de sueldo',
  descripcion:
    'Escribí el adelanto de sueldo que pagaste con la plata a rendir: «le di 8500 de adelanto a Pastrán». '
    + 'Lo rindo de tu entrega y lo sumo al «Pagado efectivo» del empleado en Liquidación, en la quincena de la fecha.',
  ejemplos: ['le di 8500 de adelanto a Pastrán', 'adelanto 20 mil a Emiliano Gonzalez', 'pagué 7600 a Nievas a cuenta'],
  operativo: true,
  // POR RECLAMO: el dueño del canal es el especialista de rendiciones (los tickets).
  preferidoDeArea: false,

  async reconoce(texto, ctx = {}) {
    if (ctx.area !== AREA) return null
    if ((ctx.fileIds?.length ?? 0) > 0) return null
    // LA RESPUESTA A MI PREGUNTA, en el mismo hilo.
    if (pendienteDe(ctx.actor)) return { destino: 'respuesta', confianza: 0.95 }
    const senal = senalDeAdelanto(texto)
    if (senal === 'fuerte') return { destino: 'adelanto', confianza: 1 }
    // «a cuenta» / «anticipo»: sólo si nombra a alguien del plantel. Si no, es de la libreta o de un proveedor.
    if (senal === 'debil' && ctx.port) {
      try {
        const { padron } = await padronDeAdelantos(ctx.port)
        const q = elegirEmpleado(texto, padron)
        if (q.persona || q.candidatos?.length) return { destino: 'adelanto', confianza: 1 }
      } catch { return null }
    }
    return null
  },

  async atender({ texto, intencion, port, actor, commEventId = null, postId = null, log, registrar = registrarAdelanto, ahora = new Date() }) {
    const ruta = intencion ?? await this.reconoce(texto, { area: AREA, actor, port })
    if (!ruta) return { texto: TEXTO.CANAL, estado: 'ayuda', privado: false }

    // 1. CANAL
    let canal = { ok: false, motivo: 'no_es_el_oficial' }
    try { canal = await canalOficialDeArea({ port, channelId: actor?.channel_id, area: AREA }) } catch { canal = { ok: false, motivo: 'no_verificable' } }
    if (!canal.ok) return { texto: canal.motivo === 'no_verificable' ? TEXTO.NO_VERIFICABLE : TEXTO.CANAL, estado: 'rechazado_canal', privado: false }

    // 2. QUIÉN ESCRIBE, y sus entregas abiertas
    let yo, datos
    try {
      yo = await entregasAbiertasDe(port, actor?.plataforma_user_id)
      datos = await padronDeAdelantos(port)
    } catch (e) {
      log?.warn?.('adelantos: no pude leer el padrón', { error: String(e?.message ?? e) })
      return { texto: TEXTO.NO_VERIFICABLE, estado: 'rechazado_no_verificable', privado: false }
    }
    if (!yo.personaId || !yo.perfilId) return { texto: TEXTO.SIN_PERSONA, estado: 'rechazado_sin_persona', privado: false }
    if (yo.esPrueba) return { texto: TEXTO.ES_PRUEBA, estado: 'rechazado_persona_prueba', privado: false }

    // 3. QUÉ DICE: el mensaje solo, o la respuesta pegada a la pregunta que quedó abierta en el hilo.
    const hoy = hoySanJuan(ahora)
    const previo = ruta.destino === 'respuesta' ? pendienteDe(actor) : null
    let leido
    let textoEntrega = texto
    let clave = `adelanto:${commEventId ?? postId ?? actor?.root_post_id ?? ''}`
    if (previo) {
      clave = previo.clave
      textoEntrega = `${previo.texto} ${texto}`
      if (previo.falta === 'entrega') {
        leido = previo.leido
      } else {
        const resp = leerRespuesta(texto, previo)
        if (resp?.cancelar) { recordarPendiente(actor, null); return { texto: TEXTO.CANCELADO, estado: 'cancelado', privado: false } }
        if (!resp) {
          // Un adelanto NUEVO escrito en el hilo no es la respuesta: se empieza de cero con él.
          if (senalDeAdelanto(texto) === 'fuerte') {
            recordarPendiente(actor, null)
            clave = `adelanto:${commEventId ?? postId ?? ''}`
            leido = interpretarAdelanto(texto, { ...datos, hoy })
            textoEntrega = texto
          } else {
            return { texto: `${TEXTO.NO_ENTENDI}\n\n${textoDePregunta(previo)}`, estado: 'pregunta_repetida', privado: false }
          }
        } else if (resp.persona) {
          leido = { estado: previo.importe ? 'listo' : 'pregunta', falta: 'monto', importe: previo.importe, expresion: previo.expresion, fecha: previo.fecha, persona: resp.persona, candidatos: [resp.persona] }
        } else if (resp.importe) {
          const quien = previo.candidatos?.length === 1 ? previo.candidatos[0] : null
          leido = quien
            ? { estado: 'listo', importe: resp.importe, expresion: resp.expresion, fecha: previo.fecha, persona: quien }
            : { ...previo, estado: 'pregunta', falta: previo.candidatos?.length ? 'persona_ambigua' : 'persona', importe: resp.importe, expresion: resp.expresion }
        }
      }
    } else {
      leido = interpretarAdelanto(texto, { ...datos, hoy })
    }
    if (!leido || leido.estado === 'nada') return { texto: TEXTO.CANAL, estado: 'ayuda', privado: false }
    if (leido.estado === 'pregunta') {
      recordarPendiente(actor, { ...leido, texto: previo?.texto ?? texto, clave })
      return { texto: textoDePregunta(leido), estado: `pregunta_${leido.falta}`, privado: false }
    }

    // 4. DE QUÉ ENTREGA: la única abierta, o la que el mensaje nombra (ER-nnnn / obra). Si no, se pregunta.
    const { entrega, motivo } = elegirEntrega(yo.abiertas, textoEntrega)
    if (motivo === 'ninguna') { recordarPendiente(actor, null); return { texto: TEXTO.SIN_ENTREGA, estado: 'rechazado_sin_entrega', privado: false } }
    if (!entrega) {
      recordarPendiente(actor, { falta: 'entrega', leido, texto: textoEntrega, clave })
      return { texto: `${textoAmbigua(yo.abiertas).replace('este ticket', 'este adelanto').replace('Mandalo de nuevo con el número', 'Contestá en este hilo con el número')}`, estado: 'pregunta_entrega', privado: false }
    }
    if (entrega.es_prueba) {
      recordarPendiente(actor, null)
      return { texto: `**${entrega.codigo}** está declarada prueba: no cargo adelantos de sueldo contra ella.`, estado: 'rechazado_entrega_prueba', privado: false }
    }
    recordarPendiente(actor, null)

    // 5. LA ESCRITURA, O NADA
    try {
      const r = await registrar({
        port, entrega, persona: leido.persona, fecha: leido.fecha, importe: leido.importe, expresion: leido.expresion,
        clave, post: actor?.root_post_id ?? postId ?? null, perfilId: yo.perfilId,
      })
      if (r.estado === 'cerrada') {
        return {
          texto: [`No cargué el adelanto de ${pesos(leido.importe)} a **${leido.persona.nombre}**: la quincena ${ddmm(r.desde)}–${ddmm(r.hasta)} de Liquidación está **cerrada**, y una quincena cerrada no recibe pagos.`,
            `Tampoco lo rendí de **${entrega.codigo}**: tu saldo a rendir quedó igual. Avisale a Administración para que la reabra o lo cargue a mano.`].join('\n'),
          estado: 'rechazado_quincena_cerrada',
          privado: false,
        }
      }
      return {
        texto: textoCargado({
          importe: leido.importe, persona: leido.persona.nombre, desde: r.desde, hasta: r.hasta ?? finDeQuincena(r.desde),
          codigo: r.codigo ?? entrega.codigo, pagada: r.pagada === true, yaEstaba: r.estado === 'ya_estaba',
        }),
        estado: r.estado === 'ya_estaba' ? 'ya_estaba' : 'adelanto_cargado',
        privado: false,
      }
    } catch (e) {
      const m = String(e?.message ?? e)
      log?.error?.('adelantos: no se pudo cargar', { error: m.slice(0, 300) })
      return {
        texto: `No cargué el adelanto de ${pesos(leido.importe)} a **${leido.persona.nombre}**: ${motivoDe(m)}\nNo se rindió nada de tu entrega ni se tocó Liquidación.`,
        estado: 'error',
        privado: false,
      }
    }
  },

  skillDe(intencion) {
    return `compras.efectivo.adelanto.${intencion?.destino === 'respuesta' ? 'respuesta' : 'cargar'}`
  },
}

/** El último día de la quincena que arranca en `desde` (ISO). */
export function finDeQuincena(desde) {
  const d = new Date(`${String(desde).slice(0, 10)}T12:00:00Z`)
  if (d.getUTCDate() <= 15) return `${String(desde).slice(0, 8)}15`
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).toISOString().slice(0, 10)
}
