// LA LIBRETA — lo que sale del cajón, escrito en el canal Efectivo y cargado en Compras.
//
// ═══ EL PEDIDO, TEXTUAL (22/09/2026) ═══
//
// El dueño mandó la foto de su libreta —«P. TELLO (18/9) 2.640.000», ocho líneas— y dijo: *«quiero q la
// experiencia del chat sea de carga natural y q se interprete quedando registrado todo en app.ecsas.com.ar y
// sheet flujo de fondos (compras, caja) segun corresponda»*.
//
// ═══ DÓNDE TERMINA CADA LÍNEA, Y POR QUÉ AHÍ ═══
//
// En **Compras**, con Tipo pago «Efectivo» y el gasto pagado. No hay caja nueva ni segundo registro: el dueño
// lo decidió así — *«no tiene q simplemente identificar como ahora q se pago en efectivo y en pestaña compras
// y hacer la deduccion en pestaña caja»*—. CAJA resta ese gasto como ya lo hace con cualquier pago en
// efectivo; si además lo anotáramos aparte, el cajón bajaría dos veces.
//
// Lo que NO entra por acá:
//   · los JORNALES, que van por Liquidación de horas (decisión del dueño): se contesta y no se carga;
//   · la ENTREGA de plata a una persona para que rinda, que es `entregas-efectivo.mjs`;
//   · una factura con comprobante, que sigue yendo al canal de comprobantes con su foto.
//
// ═══ SIN COMPROBANTE, PERO NO SIN IDENTIDAD ═══
//
// La línea entra con la política `LIBRETA` (sin número de factura, sin proveedor del desplegable) porque el
// dueño lo aprobó: *«¿Un gasto sin comprobante entra igual a Compras? ok»*. Lo que no se afloja es la barrera
// de duplicados: cada línea lleva su clave `l:<fecha>|<concepto>|<centavos>`, derivada de lo que la línea
// dice, así que mandar la misma libreta dos veces no carga el gasto dos veces.
import { canalOficialDeArea } from '../../lib/canal-de-area.mjs'
import { claveDeLinea, interpretarLibreta, TEXTO_JORNALES } from '../../lib/libreta-texto.mjs'
import { escribirFajo } from '../comprobantes/escritura.mjs'
import * as repo from '../comprobantes/repositorio.mjs'
import { perfilDeMattermost } from './entregas-efectivo.mjs'

export const AREA_LIBRETA = 'rendicion'

export const TEXTO = Object.freeze({
  CANAL: 'La libreta se escribe en el canal Efectivo.',
  NO_VERIFICABLE: 'No pude confirmar desde dónde escribís ni quién sos, así que no cargué nada. Probá de nuevo en un minuto.',
  SIN_PERSONA: 'No encuentro tu usuario en el padrón, y una carga queda firmada por quien la hace. Avisale a Administración.',
  AYUDA: [
    'Escribí la libreta como la escribís en papel, una línea por pago:',
    '',
    '```',
    'P. Tello 18/9 2.640.000',
    'Flete 19/9 60.000',
    'Camb EEA885 8.000',
    '```',
    '',
    'Cada línea entra en **Compras** como pagada en efectivo, y CAJA la descuenta del cajón.',
    'Los jornales no: van por Liquidación de horas.',
  ].join('\n'),
})

/** El ítem que entiende el cargador. El concepto va tal cual lo escribió la persona, y se declara sin comprobante. */
export function itemDeLinea(l) {
  return {
    origenCarga: 'libreta',
    clave: claveDeLinea(l),
    comprobante: {
      fecha: l.fecha,
      // SIN PROVEEDOR: la línea no lo dice con la exactitud del desplegable, y escribir ahí un nombre que la
      // lista estricta no tiene parte en dos la cuenta corriente del proveedor. El nombre escrito viaja al
      // concepto, que es texto libre, y desde ahí se completa en Compras en dos segundos.
      concepto: `${l.concepto} · sin comprobante`,
      total: l.monto,
      formaPago: 'Efectivo',
      // Pagado y contado: la plata YA salió del cajón cuando se anotó en la libreta.
      condicion: 'Contado',
      pagado: l.monto,
    },
  }
}

/** Lo que el bot contesta: una línea por renglón, con lo que entendió y qué pasó. */
export function textoDeRespuesta(leidas, resultado) {
  const filas = leidas.map((l) => {
    if (l.estado === 'jornales') return `- \`${l.linea}\` → **no la cargué**: ${TEXTO_JORNALES}`
    if (l.estado === 'nada') return null
    if (l.estado === 'pregunta') {
      return `- \`${l.linea}\` → **no la cargué**: ${l.falta === 'monto' ? 'no entendí el importe' : 'no entendí el concepto'}`
    }
    return `- ${l.concepto} · ${l.fecha.slice(8, 10)}/${l.fecha.slice(5, 7)} · $ ${l.monto.toLocaleString('es-AR')}`
  }).filter(Boolean)
  return [...filas, '', resultado].join('\n')
}

export const especialista = {
  slug: 'libreta',
  agentSlug: 'compras',
  area: AREA_LIBRETA,
  titulo: 'Efectivo · la libreta',
  descripcion:
    'Escribí lo que sale del cajón como en la libreta —«P. Tello 18/9 2.640.000»— y lo cargo en Compras como '
    + 'pagado en efectivo, para que CAJA lo descuente. Los jornales van por Liquidación.',
  ejemplos: ['P. Tello 18/9 2.640.000', 'Flete 60.000'],
  operativo: true,
  // Atiende por reclamo: el dueño del área es el especialista de rendiciones (la foto del ticket).
  preferidoDeArea: false,

  async reconoce(texto, ctx = {}) {
    if (ctx.area !== AREA_LIBRETA) return null
    // Con adjuntos manda la foto: eso es un ticket o un vale, no una línea escrita.
    if ((ctx.fileIds?.length ?? 0) > 0) return null
    const leidas = interpretarLibreta(texto)
    if (!leidas.some((l) => l.estado === 'listo' || l.estado === 'jornales')) return null
    return { destino: 'libreta', confianza: 1, leidas }
  },

  async atender({ texto, intencion, port, actor, log, escribir = escribirFajo, abrir = repo.abrirFajo }) {
    const ruta = intencion ?? await this.reconoce(texto, { area: AREA_LIBRETA })
    if (ruta?.destino !== 'libreta') return { texto: TEXTO.AYUDA, estado: 'ayuda', privado: false }

    const canal = await canalOficialDeArea({ port, channelId: actor?.channel_id, area: AREA_LIBRETA })
    if (!canal.ok) {
      return { texto: canal.motivo === 'no_verificable' ? TEXTO.NO_VERIFICABLE : TEXTO.CANAL, estado: 'rechazado_canal', privado: false }
    }
    let yo
    try { yo = await perfilDeMattermost(port, actor?.plataforma_user_id) } catch { yo = null }
    if (!yo?.perfil_id) return { texto: TEXTO.SIN_PERSONA, estado: 'rechazado_sin_perfil', privado: false }

    const leidas = ruta.leidas ?? interpretarLibreta(texto)
    const cargables = leidas.filter((l) => l.estado === 'listo')
    if (!cargables.length) {
      return { texto: textoDeRespuesta(leidas, 'No cargué nada.'), estado: 'nada_cargable', privado: false }
    }

    // UN FAJO CON TODAS LAS LÍNEAS: es la misma tanda, igual que las fotos de un fajo. El fajo lleva el
    // nombre de quien escribió, que es lo que le permite al escritor levantar el freno de mano — nunca un
    // timer ni un agente: una persona identificada que escribió la libreta.
    const items = cargables.map(itemDeLinea)
    const fajo = await abrir(port, {
      plataforma: actor?.plataforma ?? 'mattermost',
      userId: actor?.plataforma_user_id,
      username: yo.nombre ?? actor?.plataforma_username ?? null,
      channelId: actor?.channel_id,
      rootPostId: actor?.root_post_id ?? null,
      postId: actor?.root_post_id ?? null,
      items,
    })
    if (!fajo) return { texto: 'No pude abrir la carga. Probá de nuevo en un minuto.', estado: 'error', privado: false }

    const r = await escribir({ port, log }, fajo)
    return { texto: textoDeRespuesta(leidas, r?.texto ?? 'Cargado.'), estado: r?.estado ?? 'cargado', privado: false }
  },

  skillDe() {
    return 'compras.efectivo.libreta'
  },
}
