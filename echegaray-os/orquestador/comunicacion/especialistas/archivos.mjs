// RECEPCIÓN DE ARCHIVOS — el que atiende cuando lo que llega ES el archivo, en cualquier formato.
//
// ═══ EL PEDIDO, TEXTUAL ═══
//
// «crea la capacidad de recibir cualquier tipo de archivo de cualquier formato por acá porque es algo
// que ya hacías bien». Contexto: el dueño subió el CSV del extracto bancario al bot, el bot no lo
// procesó, y el CSV terminó bajándose a mano desde la API de Mattermost.
//
// ═══ QUÉ RECLAMA, Y POR QUÉ NO SE PISA CON COMPROBANTES ═══
//
// Reclama **un post con adjuntos fuera del área `compras`**. La frontera es la misma condición que
// usa Compras IA, negada: `comprobantes` reclama cuando hay adjuntos Y el área es `compras`. Las dos
// gramáticas son mutuamente excluyentes POR CONSTRUCCIÓN, así que no hay empate que resolver ni
// mensaje que se roben. En el canal de comprobantes sigue mandando Compras IA, con su puerta, su
// registro y su flujo de botones de obra intactos: acá no se toca una línea de ese camino.
//
// Y CUANDO LO QUE LLEGA A OTRO CANAL ES UNA FOTO, se deriva a ese mismo camino en vez de contestar
// otra cosa: la carga de gastos tiene un solo dueño. Si el canal no habilita, el que contesta es su
// puerta —«los comprobantes se cargan desde el canal de comprobantes»—, que es la respuesta correcta
// y la que ya estaba escrita.
//
// ═══ ÁREA, Y POR QUÉ NO ES DUEÑO DE NINGÚN CANAL ═══
//
// `administracion_finanzas` con `preferidoDeArea: false`. Declara esa área porque el archivo que
// motivó todo esto es un extracto bancario, pero NO se queda con el canal: el dueño del área sigue
// siendo el Tesorero. Un especialista que atiende por pertenencia le secuestraría al Tesorero todo
// mensaje de texto que nadie más reclame.
//
// ═══ CONFIANZA 0,9, Y NO 1 ═══
//
// Deliberado. El asistente reclama con 0,95 cuando la persona está contestando una pregunta que él
// mismo dejó abierta, y esa puerta tiene que ganar: si alguien adjunta un archivo mientras responde
// una repregunta, la conversación abierta manda. Cualquier otro reclamo (gramáticas de dominio, que
// van por debajo) pierde contra el archivo, que es lo correcto: si mandaste un archivo, el archivo
// es el pedido.
//
// ═══ CERO MODELO ═══
//
// Este archivo y todo su árbol de imports son determinísticos: detectar un formato por sus bytes,
// parsear un extracto y extraer el texto de un PDF no necesitan un modelo. El único camino que sí lo
// necesita —mirar una foto— entra por IMPORT DINÁMICO adentro de `atender`, para que el árbol
// estático no lo alcance nunca. Hay un test que lo verifica y se pone rojo si alguien lo rompe.

import { procesarArchivos, DESTINO } from '../archivos/flujo.mjs'
import { puedeImportarBanco, hayIdentidad, TEXTO as TEXTO_GUARDA } from '../archivos/guarda.mjs'
import { movimientosCargados } from '../../lib/banco-escribir.mjs'
import { urlConSecreto } from '../secreto-compartido.mjs'

/** URL de callback de los botones. Ruta y secreto propios: es otro dominio y otro permiso. */
export const URL_ACCION_BASE = process.env.ARCHIVOS_ACCION_URL
  || 'https://chat.ecsas.com.ar/archivos/accion'

/**
 * La URL con el secreto puesto.
 *
 * Cada clave se busca en el entorno recibido Y en el del proceso, en ese orden, por la misma razón
 * que en comprobantes: `config.env` NO es el entorno, es un objeto armado con una lista blanca de
 * claves validadas por Zod. Un entorno parcial resuelve la clave en null y firma con nada — y el
 * servidor, que sí exige el secreto, contesta "no pude verificar que venga de Mattermost", que no
 * dice una palabra de un secreto y manda el diagnóstico al lado equivocado.
 */
export function urlAccion(env = process.env) {
  const de = (k) => env?.[k] || process.env[k] || null
  return urlConSecreto(de('ARCHIVOS_ACCION_URL') || URL_ACCION_BASE, de('ARCHIVOS_ACCION_SECRETO'))
}

export const especialista = {
  slug: 'archivos',
  agentSlug: 'director-planner',
  area: 'administracion_finanzas',
  preferidoDeArea: false, // transversal: atiende por reclamo, nunca por pertenecer al canal
  titulo: 'Recepción de archivos',
  descripcion:
    'Mandale cualquier archivo y lo lee: reconoce el formato REAL por su contenido (no por el nombre). '
    + 'Un CSV o Excel del banco lo previsualiza contra el importador de movimientos y te dice si la cadena de '
    + 'saldos cierra, para que lo cargues con un botón; un PDF lo convierte a texto y te dice qué encontró; '
    + 'una foto de comprobante la deriva a Compras IA. Lo que no sabe procesar lo guarda y te lo dice, '
    + 'sin inventar nunca el contenido de un archivo que no pudo leer.',
  ejemplos: [
    '(soltá el CSV del extracto del banco en el chat)',
    '(mandá un PDF y te digo qué dice)',
  ],
  operativo: true,

  /**
   * EL PEDIDO ES EL ARCHIVO. Un post con adjuntos fuera de `compras` es una recepción de archivos
   * aunque no traiga una sola palabra — que es el caso normal: el dueño arrastra el archivo y listo.
   */
  reconoce(texto, ctx = {}) {
    if ((ctx.fileIds?.length ?? 0) === 0) return null
    // La frontera con Compras IA: adentro de `compras` el dueño del adjunto es él.
    if (ctx.area === 'compras') return null
    return { destino: 'recibir', confianza: 0.9 }
  },

  async atender({ texto, port, actor, fileIds = [], postId, mattermost, config, commEventId = null, google, googleInyectado, correlationId, log }) {
    if (!fileIds.length) return ayuda()

    // FAIL-CLOSED: sin identidad real de plataforma no se baja ni se registra nada. Un registro sin
    // nombre no es un registro.
    if (!hayIdentidad(actor ?? {})) {
      return { texto: TEXTO_GUARDA.SIN_IDENTIDAD, estado: 'sin_identidad', privado: false }
    }

    const r = await procesarArchivos({
      port,
      mattermost,
      url: urlAccion(config?.env ?? process.env),
      // CUÁNTOS SON NUEVOS se calcula con la misma función que usa el importador de la terminal
      // (`novedades`): si acá se contara distinto, el número que ve el dueño antes de apretar y el
      // que se carga después serían dos números distintos.
      existentesBanco: () => movimientosCargados(port),
      // LA PUERTA, evaluada antes de ofrecer el botón. Ver `archivos/guarda.mjs`.
      puedeImportar: () => puedeImportarBanco({ port, actor, channelId: actor?.channel_id, mattermost }),
      log,
    }, {
      fileIds,
      texto,
      actor,
      channelId: actor?.channel_id ?? null,
      rootPostId: actor?.root_post_id ?? postId ?? null,
      postId: actor?.root_post_id ?? postId ?? null,
      commEventId,
    })

    // TODO ERA FOTO: es una carga de comprobantes y la atiende su dueño, con su puerta y su registro.
    //
    // EL IMPORT ES DINÁMICO A PROPÓSITO. `especialistas/comprobantes.mjs` importa el lector de visión,
    // que sí llama al modelo. Importarlo arriba metería la API de Anthropic en el árbol estático de un
    // camino que tiene que ser 0 API —recibir un CSV no puede rozar un modelo— y el test que recorre
    // los imports se pondría rojo, con razón.
    if (r.derivar === DESTINO.COMPROBANTES) {
      const { especialista: comprobantes } = await import('./comprobantes.mjs')
      return comprobantes.atender({
        texto, intencion: null, port, actor, google, googleInyectado, fileIds, postId, mattermost, config, commEventId, correlationId, log,
      })
    }

    return {
      texto: r.texto,
      ...(r.attachments ? { attachments: r.attachments } : {}),
      estado: r.estado,
      privado: false,
      datos: { archivos: r.lecturas?.map((l) => ({ nombre: l.nombre, formato: l.formato, destino: l.destino })) ?? [] },
    }
  },

  skillDe() {
    return 'archivos.recibir'
  },
}

function ayuda() {
  return {
    texto: [
      'Soy la **recepción de archivos** del OS. Soltame un archivo acá y lo leo:',
      '',
      '· **CSV o Excel del banco** → te muestro los movimientos, cuántos son nuevos y si la cadena de saldos cierra. Lo cargo sólo si apretás **Importar**.',
      '· **PDF** → extraigo el texto y te digo qué encontré (si está escaneado, te lo digo también).',
      '· **Foto de un comprobante** → la deriva a Compras IA, que la carga en la pestaña Compras.',
      '· **Cualquier otro formato** → te digo qué es de verdad y cuánto pesa, y te aviso si no sé qué hacer con él.',
      '',
      '_Miro el contenido, no el nombre: un archivo que dice `.xls` y adentro es un CSV lo leo igual._',
    ].join('\n'),
    estado: 'ayuda',
    privado: false,
  }
}
