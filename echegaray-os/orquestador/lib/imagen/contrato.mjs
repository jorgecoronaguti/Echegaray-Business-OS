// EL CONTRATO DE UNA IMAGEN GENERADA. Lo que se puede pedir, y nada más.
//
// Mismo reparto que el motor de Slides: quien invoca declara QUÉ imagen hace falta y PARA QUÉ; la
// dirección de arte —encuadre, luz, paleta, tratamiento— la decide `prompt.mjs`. Si el caller
// pudiera mandar el prompt final crudo, la segunda imagen no se parecería a la primera y la marca
// sería una casualidad.
//
// Zod porque la entrada la produce un modelo: va a mandar campos de más y tipos raros, y el error
// tiene que ser legible para que se corrija en el turno siguiente.

import { z } from 'zod'

const texto = (max) => z.string().trim().min(1).max(max)
const opcional = (max) => z.string().trim().max(max).optional().nullable()

/**
 * LOS OCHO TIPOS QUE LA EMPRESA USA DE VERDAD. Cada uno cambia la dirección de arte, la relación de
 * aspecto por defecto y si la marca aplica — nunca el pipeline.
 */
export const TIPOS_IMAGEN = Object.freeze([
  'comercial', 'portada', 'infografia', 'diagrama', 'concepto_arquitectonico',
  'render_conceptual', 'slide', 'comunicacion_interna',
])

/** Relación de aspecto por tipo. La lámina de Slides es 16:9 y no se discute; una portada de
 *  informe es vertical; un concepto arquitectónico se lee mejor apaisado. */
export const ASPECTO_POR_TIPO = Object.freeze({
  comercial: '16:9',
  portada: '3:4',
  infografia: '4:3',
  diagrama: '16:9',
  concepto_arquitectonico: '16:9',
  render_conceptual: '16:9',
  slide: '16:9',
  comunicacion_interna: '1:1',
})

/**
 * DÓNDE APLICA LA MARCA POR DEFECTO.
 *
 * `marca: 'paleta'` = la imagen usa el grafito y el amarillo de ECSAS como dirección de color, sin
 * un solo logo. `'ninguna'` = la marca no pinta (un diagrama técnico o un concepto arquitectónico
 * teñido de amarillo corporativo se ve peor y comunica menos).
 *
 * EL LOGO NO ENTRA POR DEFECTO EN NINGÚN TIPO, y es a propósito: un modelo de imagen no dibuja un
 * logo, lo INVENTA — sale torcido, con las letras mal y con el isotipo cambiado. Un logo falso en
 * una pieza comercial es peor que ninguno. Cuando el logo real hace falta se compone después
 * (Slides lo pone solo, `slides/marca.mjs`), no se le pide al modelo.
 */
export const MARCA_POR_TIPO = Object.freeze({
  comercial: 'paleta',
  portada: 'paleta',
  infografia: 'paleta',
  diagrama: 'paleta',
  concepto_arquitectonico: 'ninguna',
  render_conceptual: 'ninguna',
  slide: 'paleta',
  comunicacion_interna: 'paleta',
})

/** Entidades del OS que pueden dar contexto. Se nombra la entidad, no se pega su ficha entera:
 *  el motor trae SÓLO los campos que cambian la imagen (ver `prompt.mjs`). */
export const Contexto = z.object({
  obra: opcional(120),
  cliente: opcional(120),
  presupuesto_id: opcional(60),
  documento_id: opcional(80),
  // Datos ya resueltos por quien invoca. Se limitan a 6 pares para que el contexto no se convierta
  // en «mandale todo al modelo»: una imagen no mejora con el vigésimo dato, empeora.
  datos: z.array(z.object({ rotulo: texto(60), valor: texto(120) })).max(6).optional(),
}).partial()

export const PedidoImagen = z.object({
  tipo: z.enum(TIPOS_IMAGEN),
  /** Qué se ve. En castellano llano; el modelo de imagen no lo recibe tal cual. */
  pedido: texto(1200),
  /** PARA QUÉ es. Es lo que hace que la misma escena salga distinta en una propuesta y en un
   *  comunicado interno; sin objetivo el resultado es una ilustración genérica. */
  objetivo: opcional(300),
  contexto: Contexto.optional(),
  /** 'paleta' | 'ninguna'. Por defecto, lo que diga MARCA_POR_TIPO. */
  marca: z.enum(['paleta', 'ninguna']).optional(),
  aspecto: z.enum(['1:1', '3:4', '4:3', '9:16', '16:9']).optional(),
  /** Carpeta de Drive donde queda el archivo. Sin ella va a la raíz del Drive del dueño. */
  carpeta_id: opcional(80),
  /** Publicar el archivo con link de lectura para que Google Slides pueda BAJARLO. Apagado por
   *  defecto: `createImage` baja la URL sin credenciales, así que sin esto la imagen no se puede
   *  insertar en una lámina — y con esto el archivo queda accesible por link. Es una decisión de
   *  quien invoca, no un default. */
  publicar_para_slides: z.boolean().optional(),
  /** Identidad de la corrida que la pidió, para poder rastrearla después. */
  correlation_id: opcional(80),
})

/** Valida y devuelve `{ok, pedido}` o `{ok:false, errores:[...]}` en castellano llano. PURA. */
export function validarPedido(entrada) {
  const r = PedidoImagen.safeParse(entrada)
  if (r.success) return { ok: true, pedido: r.data }
  return {
    ok: false,
    errores: r.error.issues.map((i) => `${i.path.join('.') || '(raíz)'}: ${i.message}`),
  }
}

/** Aspecto efectivo: el pedido manda, el tipo pone el default. PURA. */
export function aspectoDe(pedido) {
  return pedido?.aspecto || ASPECTO_POR_TIPO[pedido?.tipo] || '16:9'
}

/** Política de marca efectiva. PURA. */
export function marcaDe(pedido) {
  return pedido?.marca || MARCA_POR_TIPO[pedido?.tipo] || 'ninguna'
}
