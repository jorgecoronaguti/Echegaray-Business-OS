// LA CAPACIDAD CANÓNICA DE IMÁGENES DEL OS — `generar_imagen`.
//
// ═══ LA FRONTERA, IGUAL QUE EN SLIDES ═══
//
// Acá el modelo declara QUÉ imagen hace falta y PARA QUÉ. No hay un parámetro de estilo, de luz, de
// encuadre ni de color: la dirección de arte la decide `lib/imagen/prompt.mjs`. Si el prompt final
// se pudiera mandar crudo, la segunda imagen no se parecería a la primera y la marca sería una
// casualidad.
//
// ═══ Y LA REGLA QUE NO SE NEGOCIA ═══
//
// Lo que sale de acá es IMAGEN GENERADA. No es foto, no es plano, no es evidencia de obra, y no
// puede serlo por pedido de quien la invoca: `lib/imagen/procedencia.mjs` sella el resultado y el
// intento de conseguir lo contrario queda REPORTADO, no borrado en silencio. Es el mismo diseño que
// `lib/web/contenido-externo.mjs`, donde lo externo nunca asciende a HECHO aunque el caller lo pida.
//
// ESCRITURA (`drive.write`): la imagen se guarda en el Drive del dueño y puede publicarse por link,
// así que la tool se ENCOLA y la ejecuta `handlers/operation_execute.mjs` después de la aprobación.

import { TIPOS_IMAGEN, validarPedido } from '../imagen/contrato.mjs'
import { producirImagen } from '../imagen/motor.mjs'
import { construirPrompt } from '../imagen/prompt.mjs'

const ESQUEMA = {
  type: 'object',
  properties: {
    tipo: {
      type: 'string', enum: [...TIPOS_IMAGEN],
      description: 'comercial (pieza para una propuesta) · portada (tapa de informe) · infografia · diagrama (esquema técnico) · concepto_arquitectonico (idea, se nota que es un dibujo) · render_conceptual (volumetría, NO fotorrealista) · slide (apoyo de una lámina 16:9) · comunicacion_interna',
    },
    pedido: { type: 'string', description: 'QUÉ se ve, en castellano llano. No escribas un prompt de modelo de imagen: la dirección de arte la pone el motor.' },
    objetivo: { type: 'string', description: 'PARA QUÉ es (a quién se le muestra y qué tiene que entender). Cambia el resultado más que cualquier otro campo.' },
    contexto: {
      type: 'object',
      description: 'Sólo lo que cambia la imagen. Los montos, precios, márgenes, CUIT y saldos NO viajan al proveedor: se descartan aunque los mandes, y el resultado te dice cuáles.',
      properties: {
        obra: { type: 'string' },
        cliente: { type: 'string' },
        presupuesto_id: { type: 'string' },
        documento_id: { type: 'string' },
        datos: { type: 'array', maxItems: 6, items: { type: 'object', properties: { rotulo: { type: 'string' }, valor: { type: 'string' } }, required: ['rotulo', 'valor'] } },
      },
    },
    marca: { type: 'string', enum: ['paleta', 'ninguna'], description: 'paleta = grafito y amarillo de ECSAS como acento. El LOGO nunca lo dibuja el modelo (lo falsificaría): si hace falta, lo compone Slides.' },
    aspecto: { type: 'string', enum: ['1:1', '3:4', '4:3', '9:16', '16:9'] },
    carpeta_id: { type: 'string', description: 'carpeta de Drive donde dejarla (opcional)' },
    publicar_para_slides: { type: 'boolean', description: 'true SÓLO si la imagen va a entrar en una lámina: Google Slides baja la URL sin credenciales, así que el archivo queda accesible por link. Apagado por defecto.' },
    correlation_id: { type: 'string' },
  },
  required: ['tipo', 'pedido'],
}

const COMO_SE_USA =
  'Decí QUÉ se ve y PARA QUÉ, no cómo dibujarlo. '
  + 'Elegí el tipo con honestidad: si es una idea de proyecto es concepto_arquitectonico o render_conceptual, nunca una imagen que parezca una foto de la obra. '
  + 'Lo que devuelve es una IMAGEN GENERADA y se marca como tal: no sirve para probar avance, respaldar una certificación, documentar un incidente ni reemplazar un plano, y pedir que se marque como evidencia real no lo cambia. '
  + 'Si la imagen va a una lámina de crear_presentacion_google_slides, pedí publicar_para_slides:true y usá el imagen_url que devuelve (el link de Drive NO sirve: Slides baja la URL sin credenciales).'

export function imagenTools(google) {
  return {
    'imagen.generar': {
      capability: 'drive.write',
      account: 'ecsas',
      schema: {
        name: 'generar_imagen',
        description:
          'GENERA una imagen original con la identidad de ECSAS y la deja en Drive: pieza comercial, portada de informe, infografía, diagrama, concepto arquitectónico, render conceptual, imagen para una lámina de Slides o comunicación interna. '
          + COMO_SE_USA
          + ' Antes de gastar una generación podés probar el encuadre con previsualizar_imagen, que arma el prompt y no llama a ningún proveedor.',
        input_schema: ESQUEMA,
      },
      async run(input) {
        const v = validarPedido(input)
        if (!v.ok) return { error: `el pedido de imagen no es válido: ${v.errores.join(' · ')}` }
        try {
          return await producirImagen(google, v.pedido)
        } catch (e) {
          return { error: `no pude generar la imagen: ${String(e?.message ?? e).slice(0, 200)}` }
        }
      },
    },

    'imagen.previsualizar': {
      capability: 'drive.read',
      account: 'ecsas',
      schema: {
        name: 'previsualizar_imagen',
        description:
          'Muestra el prompt visual que se le va a mandar al proveedor SIN generar nada y sin costo: la dirección de arte, la paleta, la relación de aspecto, qué contexto entra y qué se descarta por confidencial. Recibe exactamente lo mismo que generar_imagen. Usala cuando el pedido es largo o cuando no estás seguro del tipo.',
        input_schema: ESQUEMA,
      },
      async run(input) {
        const v = validarPedido(input)
        if (!v.ok) return { ok: false, errores: v.errores }
        const a = construirPrompt(v.pedido)
        return {
          ok: true,
          prompt: a.prompt,
          negativo: a.negativo,
          aspecto: a.aspecto,
          marca: a.marca,
          contexto_usado: a.contexto_usado,
          contexto_descartado: a.contexto_descartado,
          aviso: a.contexto_descartado.length
            ? `no viajan al proveedor por confidenciales: ${a.contexto_descartado.join(', ')}`
            : null,
          intento_de_ascenso: a.intento,
        }
      },
    },
  }
}
