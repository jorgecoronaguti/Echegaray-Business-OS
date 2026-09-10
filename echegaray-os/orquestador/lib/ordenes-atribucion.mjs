// ═══════════════════════════════════════════════════════════════════════════════════════════════
// DE QUIÉN ES ESTE PAPEL, Y SI YA LO TENGO — la atribución de las órdenes del cliente
// ═══════════════════════════════════════════════════════════════════════════════════════════════
//
// `ordenes-cliente.mjs` contesta qué DICE un documento (qué clase es, qué número, qué importe).
// Este archivo contesta las otras dos preguntas, que son las que deciden si la fila se guarda:
//
//   · ¿de qué CLIENTE es?      → dominio del remitente · CUIT adentro del PDF · nombre de archivo ·
//                                 texto del asunto. En ese orden, y cada vía queda escrita.
//   · ¿YA LO TENGO?            → el mismo PDF llega dos veces (rodrigo lo reenvía a jorge) y la
//                                 clave (mensaje, nombre, tamaño) no lo ve: son dos mensajes.
//
// Sin Gmail, sin base y sin bucket: todo lo de acá es una función pura y se prueba con `node --test`.
//
// ═══ POR QUÉ LOS CUIT NO ESTÁN ESCRITOS ACÁ ═══
//
// La identidad fiscal de un cliente vive en `public.clientes.cuit` y en ningún otro lado. Copiar el
// CUIT de Messina a una constante de este archivo crearía la segunda definición del mismo dato, y
// el día que se corrija uno el otro seguiría mintiendo. Por eso `clienteDelDocumento` RECIBE la
// lista de clientes con su CUIT: si un cliente no lo tiene cargado, esa vía simplemente no se usa
// para él —y eso es un dato que falta en la base, no un número para inventar acá—.
import { createHash } from 'node:crypto'
import { extraer as cuitsDelTexto } from './cuit.mjs'
import { CUIT_ECSAS } from './transferencias-proveedores.mjs'
import {
  agruparPorNumero, clasificarAdjunto, comprobantePropio, comprobantesCitados, dominioDe, extraerFechaDeOrden,
  extraerImporte, extraerNumero, facturaPropiaDe, mapaDeCitas, mapaDeEvidencia, norm,
  numeroCanonico, numeroDeRetencion, obraPorReferencia, ocsCitadas, resolverObraDeTexto,
} from './ordenes-cliente.mjs'

// ── QUIÉN ES CLIENTE, Y POR QUÉ NO ALCANZA EL DOMINIO ───────────────────────────────────────────
//
// El remitente NO identifica al cliente por sí solo: la mayoría de estas órdenes llegan REENVIADAS
// desde adentro (rodrigo@ecsas.com.ar reenvía la notificación de Messina). Por eso la resolución
// mira, en orden: el dominio del remitente, el CUIT que el PDF declara, la forma del nombre de
// archivo, y recién al final el texto del asunto/cuerpo. Un reenvío interno sin ninguna marca de
// cliente queda SIN CLIENTE, no adivinado.
//
// `archivos` es la firma del sistema que emite cada cliente, medida sobre los adjuntos reales:
// Messina emite `OC_32_0000200002097.pdf` y `O_P_0000000004865.pdf`; ARCOR, `6A_50123456.PDF` y
// `00001_5000123_OP.PDF`. Un nombre así no lo produce nadie más, y es lo único que queda cuando el
// mail viene reenviado sin asunto y el PDF no trae CUIT legible.
export const CLIENTES = Object.freeze([
  {
    clave: 'messina', nombre: 'Messina',
    dominios: ['juanmessina.com.ar'],
    textos: ['messina', 'juan messina', 'bsa'],
    archivos: [/^oc_\d{2,}_\d{6,}\.pdf$/i, /^o_p_\d{6,}(_g\d{5,})?\.pdf$/i],
  },
  {
    clave: 'arcor', nombre: 'ARCOR',
    // `arcornet` es la red interna desde la que salen las órdenes de pago («Grupo_Arcor_SCP@…»);
    // `arcor.com` es la casilla de compras que manda «GENERACION OC». Son la misma empresa.
    dominios: ['arcor.com', 'arcor.com.ar', 'arcornet.com', 'arcornet.com.ar'],
    textos: ['arcor'],
    archivos: [/^6a_\d{6,}\.pdf$/i, /^\d{4,6}_\d{3,}_op\.pdf$/i],
  },
  { clave: 'quattropani', nombre: 'Franco Quattropani', dominios: [], textos: ['quattropani'], archivos: [] },
  {
    clave: 'la-estrella', nombre: 'La Estrella',
    dominios: ['alimentosdelsur.com.ar'], textos: ['la estrella', 'alimentos del sur', 'palitos'], archivos: [],
  },
  {
    clave: 'san-francisco', nombre: 'Javier Sánchez - San Francisco - IMOTOR',
    dominios: ['imotor.com.ar'],
    // «san francisco» NO está: es el domicilio impreso en cualquier factura de un proveedor
    // norteamericano —medido, los recibos de Anthropic— y atribuía esos PDF a este cliente. Un token
    // que empareja documentos que no son del cliente no distingue: distorsiona.
    textos: ['imotor', 'javier sanchez', 'javier sánchez'], archivos: [],
  },
  { clave: 'mb', nombre: 'MB Emprendimientos', dominios: [], textos: ['mb emprendimientos'], archivos: [] },
  // Saint-Gobain y Orica emiten órdenes de compra y HOY NO EXISTEN en `public.clientes`. Están acá
  // para que el importador los RECONOZCA y los liste como «sin cliente en el OS» con nombre propio,
  // en vez de esconderlos entre los descartes. Darlos de alta es una decisión del dueño, no del
  // script: un cliente creado por un parser es una entidad que nadie autorizó.
  {
    clave: 'saint-gobain', nombre: 'Saint-Gobain',
    dominios: ['saint-gobain.com'], textos: ['saint-gobain', 'saint gobain'], archivos: [],
  },
  { clave: 'orica', nombre: 'Orica', dominios: ['orica.com'], textos: ['orica'], archivos: [] },
])

/** Dominios propios: un remitente de acá NO es el cliente, es quien reenvió. */
export const DOMINIOS_PROPIOS = Object.freeze(['ecsas.com.ar'])

const esPropio = (dom) => DOMINIOS_PROPIOS.some((d) => dom === d || dom.endsWith('.' + d))

/**
 * De qué CLIENTE es este mail, mirando SÓLO el mail. `{ clave, nombre, via }` o null.
 * `via` dice de dónde salió la atribución: 'remitente' (el dominio lo prueba) o 'texto' (se dedujo
 * del asunto/cuerpo de un reenvío interno). No es cosmético: un reenvío mal titulado es la única
 * forma de que esto se equivoque, y quien lea la tabla tiene que poder distinguirlo.
 */
export function clienteDelMail({ from = '', asunto = '', cuerpo = '' } = {}) {
  const dom = dominioDe(from)
  if (dom) {
    for (const c of CLIENTES) {
      if (c.dominios.some((d) => dom === d || dom.endsWith('.' + d))) return { clave: c.clave, nombre: c.nombre, via: 'remitente' }
    }
  }
  const heno = norm(`${asunto} ${cuerpo}`)
  // Sólo se cae al texto cuando el remitente es de casa o desconocido. Si el dominio es de un
  // tercero identificado (un proveedor), que el cuerpo nombre a Messina no lo vuelve de Messina.
  if (esPropio(dom) || !dom) {
    for (const c of CLIENTES) {
      if (c.textos.some((t) => heno.includes(norm(t)))) return { clave: c.clave, nombre: c.nombre, via: 'texto' }
    }
  }
  return null
}

/**
 * EL CUIT QUE EL PDF DECLARA, CRUZADO CONTRA EL PADRÓN DE CLIENTES.
 *
 * Es la vía más fuerte que existe: un CUIT no se parece a otro, valida por dígito verificador y
 * está impreso en el encabezado de toda orden de compra y de toda factura. Resuelve dos casos que
 * ninguna otra vía resuelve:
 *
 *   · el reenvío interno sin asunto («Fwd:» y el PDF adjunto, nada más);
 *   · NUESTRA propia factura (`30716304643_001_00001_00000225.pdf`), donde el emisor somos nosotros
 *     y el cliente es el RECEPTOR — por eso el CUIT de ECSAS se descarta antes de comparar.
 *
 * DOS CLIENTES DISTINTOS EN EL MISMO PDF ⇒ NINGUNO. Pasa cuando un documento nombra a dos empresas
 * (un contrato tripartito, un remito con destinatario y transportista): ahí el CUIT dejó de
 * distinguir y elegir uno sería sortear.
 */
export function clientePorCuit(textoPdf, clientes) {
  const enElPadron = new Map()
  for (const c of clientes ?? []) {
    const cuit = String(c.cuit ?? '').replace(/\D/g, '')
    if (cuit.length === 11 && cuit !== CUIT_ECSAS) enElPadron.set(cuit, c)
  }
  if (!enElPadron.size) return null
  const hallados = new Map()
  for (const cuit of cuitsDelTexto(textoPdf)) {
    if (cuit === CUIT_ECSAS) continue
    const c = enElPadron.get(cuit)
    if (c) hallados.set(c.id ?? c.nombre_comercial, c)
  }
  if (hallados.size !== 1) return null
  return [...hallados.values()][0]
}

/** El cliente cuyo SISTEMA emite archivos con esta forma. null si el nombre no es distintivo. */
export function clientePorArchivo(nombreArchivo) {
  const n = String(nombreArchivo ?? '')
  for (const c of CLIENTES) {
    if ((c.archivos ?? []).some((re) => re.test(n))) return { clave: c.clave, nombre: c.nombre, via: 'archivo' }
  }
  return null
}

/**
 * LA RESOLUCIÓN COMPLETA: de quién es este documento, con TODA la evidencia disponible.
 *
 * `clientes` son las filas de `public.clientes` ({ id, nombre_comercial, cuit }). El resultado trae
 * el `id` cuando el cliente existe en el OS y `null` cuando se lo reconoció pero no está dado de
 * alta (Saint-Gobain, Orica): esa diferencia es lo que separa «no sé de quién es» de «sé de quién
 * es y falta darlo de alta», y son dos trabajos distintos.
 *
 * Orden de las vías, de la más fuerte a la más débil, y la primera que contesta gana:
 *   remitente (el dominio lo prueba) → cuit (el papel lo declara) → archivo (la firma del emisor)
 *   → texto (deducido de un asunto que alguien tipeó).
 */
export function clienteDelDocumento({
  from = '', asunto = '', cuerpo = '', nombreArchivo = '', textoPdf = '', clientes = [],
} = {}) {
  const porId = new Map((clientes ?? []).map((c) => [norm(c.nombre_comercial), c]))
  const conId = (hit) => (hit ? { ...hit, id: porId.get(norm(hit.nombre))?.id ?? null } : null)

  const dom = dominioDe(from)
  for (const c of CLIENTES) {
    if (dom && c.dominios.some((d) => dom === d || dom.endsWith('.' + d))) {
      return conId({ clave: c.clave, nombre: c.nombre, via: 'remitente' })
    }
  }
  const porCuit = clientePorCuit(textoPdf, clientes)
  if (porCuit) {
    const delCatalogo = CLIENTES.find((c) => norm(c.nombre) === norm(porCuit.nombre_comercial))
    return { clave: delCatalogo?.clave ?? null, nombre: porCuit.nombre_comercial, id: porCuit.id ?? null, via: 'cuit' }
  }
  const porArchivo = clientePorArchivo(nombreArchivo)
  if (porArchivo) return conId(porArchivo)
  // El texto es la última vía y sólo desde casa: un dominio de tercero que NOMBRA a un cliente no
  // convierte su papel en un papel del cliente.
  if (esPropio(dom) || !dom) {
    const heno = norm(`${asunto} ${cuerpo}`)
    for (const c of CLIENTES) {
      if (c.textos.some((t) => heno.includes(norm(t)))) return conId({ clave: c.clave, nombre: c.nombre, via: 'texto' })
    }
  }
  return null
}

// ── LAS CONSULTAS DE GMAIL SALEN DEL MISMO CATÁLOGO ─────────────────────────────────────────────
//
// Se derivan de los dominios de arriba para que agregar un cliente sea UN cambio y no dos. Van por
// separado y se unen por id de mensaje: una sola consulta con todos los OR se topa con el tope de
// Gmail y devuelve los más nuevos de todo junto, escondiendo lo viejo de un cliente callado.
//
// NO HAY CONSULTAS `filename:`. MEDIDO el 10/09/2026: `filename:OC_32` devuelve 0 resultados aunque
// existan decenas de `OC_32_0000200002097.pdf` — el guión bajo parte el término y el operador deja
// de emparejar. Buscar por remitente y por asunto sí funciona, y el nombre de archivo se usa para
// CLASIFICAR lo que ya se bajó, que es donde sirve.
export function consultasDeGmail() {
  const dominios = [...new Set(CLIENTES.flatMap((c) => c.dominios))]
  return [
    ...dominios.map((d) => `has:attachment from:${d}`),
    'has:attachment ("orden de compra" OR "purchase order" OR "O/C")',
    'has:attachment ("orden de pago" OR "O/P" OR "notificación de pago")',
    'has:attachment (subject:OC OR subject:OP)',
    'has:attachment (subject:"GENERACION OC" OR subject:"ORDEN DE PAGO")',
    'has:attachment ("certificado de retención" OR "certificado de retencion" OR SICORE)',
  ]
}

// ── ¿YA LO TENGO? ───────────────────────────────────────────────────────────────────────────────

/** SHA-256 de los bytes, en hexadecimal. Es la identidad del ARCHIVO, no la del mail que lo trajo. */
export function hashDocumento(bytes) {
  return createHash('sha256').update(Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes ?? [])).digest('hex')
}

/**
 * LO QUE ENTRA UNA SOLA VEZ, Y POR QUÉ LO DEMÁS NO ENTRA.
 *
 * La clave de idempotencia de la base es (message_id, nombre_archivo, tamaño) y es correcta para lo
 * que fue pensada: correr el script dos veces sobre la MISMA casilla. Pero desde que se leen dos
 * casillas, el mismo PDF llega dos veces con dos `message_id` distintos —rodrigo lo recibe de
 * Messina y lo reenvía a jorge— y esa clave no lo ve. Dos filas, una orden.
 *
 * Se agregan dos criterios, en orden:
 *   1. MISMOS BYTES (sha256). Es certeza, no parecido: el reenvío no toca el adjunto.
 *   2. MISMO (cliente, tipo, número canónico). Cubre el caso en que el archivo NO es idéntico —el
 *      cliente reemitió la orden y el PDF cambió de metadatos— pero la orden es la misma. Sólo con
 *      número: dos papeles sin número no son el mismo papel, y unirlos sería el peor invento.
 *
 * `yaEnBase` son las filas que ya existen ({ hash_sha256, cliente_id, tipo, numero }). Devuelve
 * `{ nuevos, repetidos }` y cada repetido dice POR QUÉ: una lista de descartes sin motivo no deja
 * auditar si el criterio fue el correcto.
 */
export function deduplicar(candidatos, { yaEnBase = [] } = {}) {
  const porHash = new Map()
  const porOrden = new Map()
  const clave = (f) => {
    const canon = numeroCanonico(f.numero)
    return canon ? `${f.cliente_id ?? '?'}::${f.tipo}::${canon}` : null
  }
  for (const f of yaEnBase) {
    if (f.hash_sha256) porHash.set(f.hash_sha256, f)
    const k = clave(f)
    if (k) porOrden.set(k, f)
  }
  const nuevos = []
  const repetidos = []
  for (const f of candidatos ?? []) {
    const yaHash = f.hash_sha256 ? porHash.get(f.hash_sha256) : null
    if (yaHash) {
      repetidos.push({ fila: f, porque: `mismos bytes que «${yaHash.nombre_archivo ?? 'una fila ya guardada'}»` })
      continue
    }
    const k = clave(f)
    const yaOrden = k ? porOrden.get(k) : null
    if (yaOrden) {
      repetidos.push({ fila: f, porque: `ya existe ${f.tipo} N° ${numeroCanonico(f.numero)} de este cliente («${yaOrden.nombre_archivo ?? 'fila previa'}»)` })
      continue
    }
    if (f.hash_sha256) porHash.set(f.hash_sha256, f)
    if (k) porOrden.set(k, f)
    nuevos.push(f)
  }
  return { nuevos, repetidos }
}

// ── LA OBRA QUE EL PAPEL NO NOMBRA ──────────────────────────────────────────────────────────────

/**
 * HEREDAR LA OBRA DE LOS DEMÁS PAPELES, hasta que nadie más pueda.
 *
 * Una orden de pago no nombra ninguna obra: nombra las FACTURAS que cancela («FAC A0000100000225»).
 * La cadena entera es OP → factura → OC → obra, y recorrerla es lo único que le da obra a una OP
 * sin adivinar. Cuando las facturas que paga caen en DOS obras distintas, la OP no pertenece a
 * ninguna de las dos: se queda a nivel cliente y se escribe por qué. Repartirla sería inventar.
 *
 * Se repite porque la cadena tiene eslabones: la factura le da la obra a la OC, y recién entonces la
 * OC se la puede dar a la orden de pago que la cita. Tres vueltas alcanzan y el punto fijo se
 * detecta solo; sin repetir, la herencia dependería del orden en que Gmail devolvió los mails.
 *
 * Vivía adentro de `reatribuir-ordenes-clientes.mjs` y la ingesta no la tenía: una orden de pago
 * bajada hoy quedaba sin obra hasta que alguien corriera el otro script. Una definición, dos usos.
 *
 * MUTA `docs` (les pone `obra_id` y `porque`) y los devuelve. Cada doc necesita `cliente_id`,
 * `obra_id`, `asunto`, `texto`, `citadas`, `numero` y `nombre_archivo`.
 */
export function heredarObras(docs, { obras = [], nombreClientePorId = new Map(), vueltas = 3 } = {}) {
  const lista = docs ?? []
  for (let v = 0; v < vueltas; v++) {
    const mapa = mapaDeEvidencia(lista)
    const citas = mapaDeCitas(lista)
    let cambios = 0
    for (const d of lista) {
      if (d.obra_id) continue
      const delCliente = obras.filter((o) => o.cliente_id === d.cliente_id)
      const porTexto = resolverObraDeTexto(delCliente, `${d.asunto ?? ''} ${d.texto ?? ''}`, { nombreCliente: nombreClientePorId.get(d.cliente_id) ?? '' })
      if (porTexto) { d.obra_id = porTexto.id; d.porque = 'el PDF nombra la obra'; cambios++; continue }
      const ref = obraPorReferencia(d.citadas, mapa)
      d.porque = ref.porque
      if (ref.obraId) { d.obra_id = ref.obraId; cambios++; continue }
      // EL CAMINO INVERSO: la factura que CITA esta OC ya tiene obra (describe el trabajo y nombra
      // el playón; la OC del cliente sólo trae el código de centro de costo).
      const propio = numeroCanonico(d.numero)
      const porCita = propio ? citas.get(propio) : null
      if (porCita) { d.obra_id = porCita; d.porque = `una factura que cita ${propio} tiene esa obra`; cambios++ }
    }
    // Misma orden, dos papeles: el que tiene obra se la pasa al que no. `agruparPorNumero` es la que
    // decide qué es «la misma orden» — la pantalla agrupa con esa misma función.
    for (const g of agruparPorNumero(lista)) {
      const conObra = g.filas.find((f) => f.obra_id)
      if (!conObra) continue
      for (const f of g.filas) {
        if (f.obra_id) continue
        f.obra_id = conObra.obra_id
        f.porque = `misma orden que ${conObra.nombre_archivo}`
        cambios++
      }
    }
    if (!cambios) break
  }
  return lista
}

// ── EL DOCUMENTO ENTERO, DECIDIDO DE UNA VEZ ────────────────────────────────────────────────────

/**
 * TODO LO QUE SE DECIDE SOBRE UN ADJUNTO, en una función pura. El script que baja los mails no
 * decide nada: pide bytes, lee el PDF y llama a esto.
 *
 * Devuelve `{ ok: false, motivo }` cuando el documento no se guarda, y el motivo se imprime: una
 * lista de descartes sin motivo no permite saber si el criterio fue el correcto.
 *
 * LA FECHA SALE DE `extraerFechaDeOrden` Y NO DE `extraerFecha`. Ésta es la única diferencia que
 * quedaba entre la ingesta y la re-atribución, y costó cinco órdenes fechadas en 2086: el
 * encabezado de Messina trae «Fecha Inicio Act. 22-08-86» —cuándo abrió la empresa— antes que la
 * fecha de la orden, que además viene con espacios («11 /08 /2026»). Una definición, usada por los
 * dos caminos.
 */
export function documentoDeAdjunto({
  from = '', asunto = '', cuerpo = '', nombreArchivo = '', textoPdf = '',
  clientes = [], obras = [], hoy = new Date(),
} = {}) {
  const { tipo, senal } = clasificarAdjunto({ asunto, nombreArchivo, cuerpo, textoPdf })
  if (tipo === 'otro') return { ok: false, motivo: 'no es orden de compra, de pago ni retención' }

  const cli = clienteDelDocumento({ from, asunto, cuerpo, nombreArchivo, textoPdf, clientes })
  if (!cli) return { ok: false, motivo: 'sin cliente identificable' }
  if (!cli.id) return { ok: false, motivo: `cliente «${cli.nombre}» reconocido pero NO existe en public.clientes`, cliente: cli }

  // SI EL PDF SE DECLARA FACTURA NUESTRA, ES ESO. El nombre del archivo dice «OC 02-...» porque así
  // lo archivamos, y el detalle cita la orden que factura: las dos cosas engañan a la clasificación
  // por texto. El encabezado del propio comprobante, no.
  const fac = facturaPropiaDe(textoPdf)
  const tipoFinal = fac?.tipo ?? tipo
  const numero = fac?.numero
    ?? (tipoFinal === 'retencion' ? numeroDeRetencion({ nombreArchivo, textoPdf }) : extraerNumero(textoPdf))
  const { importe, moneda } = extraerImporte(textoPdf)

  // La obra se busca SÓLO entre las del cliente resuelto, y sobre el asunto + el PDF. El cuerpo de
  // un reenvío arrastra la conversación entera y ahí aparece el nombre de cualquier obra.
  const delCliente = (obras ?? []).filter((o) => o.cliente_id === cli.id)
  const obra = resolverObraDeTexto(delCliente, `${asunto} ${textoPdf}`, { nombreCliente: cli.nombre })

  return {
    ok: true,
    cliente: cli,
    obra: obra ?? null,
    tipo: tipoFinal,
    senal,
    numero: numero ?? null,
    numeroCanonico: numeroCanonico(numero),
    cita: fac?.cita ?? null,
    // El comprobante que este papel ES («A-1-225»). Es la clave con la que una orden de pago lo
    // encuentra: la OP no cita la OC, cita la FACTURA.
    comprobante: comprobantePropio(textoPdf),
    fecha: extraerFechaDeOrden(textoPdf, { hoy }),
    importe,
    moneda,
    // Lo que este papel CITA: las OC por número y las facturas por comprobante. Es la cadena
    // OP → factura → OC → obra, que es como una orden de pago encuentra su obra sin nombrarla.
    citadas: [...ocsCitadas(textoPdf), ...comprobantesCitados(textoPdf)],
  }
}
