// LA CAPACIDAD CANÓNICA DE PRESENTACIONES DEL OS.
//
// ═══ POR QUÉ REEMPLAZA A `crear_presentacion` ═══
//
// La anterior pasaba `[{titulo, cuerpo}]` a los layouts predefinidos de Google. Servía para tener
// algo, no para mandárselo a un cliente: sin grilla, sin marca, sin tablas, sin números grandes,
// sin control de que el texto entre. Dos tools que crean presentaciones serían dos verdades y el
// modelo elegiría cualquiera, así que ésta la reemplaza — no convive con ella.
//
// ═══ LA FRONTERA ═══
//
// Acá el modelo declara CONTENIDO: qué lámina, qué dice, de dónde salió. No hay un solo parámetro
// de posición, tamaño, color ni fuente, y no es un olvido: es lo que hace que la décima
// presentación se vea igual que la primera. La forma la decide `lib/slides/`.
//
// ═══ Y LA REGLA QUE NO SE NEGOCIA ═══
//
// Un dato que no salió del OS va con `origen: "EXTERNO"` y su fuente con URL, o no entra. El motor
// lo pinta distinto, le pone una pastilla y agrega la lámina de referencias al final. Mezclar en
// una misma lámina «facturamos $ 480 M» y «la inflación fue 2,1%» sin distinguirlos es afirmar las
// dos con la misma autoridad, y una salió de la base y la otra de una página.

import { miniaturas, prepararDeck, publicarDeck } from '../slides/motor.mjs'
import { TIPOS_DECK } from '../slides/contrato.mjs'

const ESQUEMA_LAMINA = {
  type: 'object',
  properties: {
    tipo: { type: 'string', enum: ['seccion', 'puntos', 'dos_columnas', 'indicadores', 'tabla', 'barras', 'hitos', 'cierre'] },
    titulo: { type: 'string' },
    kicker: { type: 'string', description: 'rótulo corto arriba del título (ej. "Caja", "Riesgos")' },
    bajada: { type: 'string', description: 'una o dos oraciones bajo el título' },
    nota: { type: 'string', description: 'aclaración al pie de la lámina' },
    origen: { type: 'string', enum: ['ECSAS', 'EXTERNO'], description: 'de dónde salió el dato; por defecto ECSAS' },
    fuentes: {
      type: 'array', description: 'OBLIGATORIO si origen=EXTERNO: de dónde se sacó',
      items: { type: 'object', properties: { titulo: { type: 'string' }, url: { type: 'string' }, obtenido_en: { type: 'string' }, frescura: { type: 'string' } }, required: ['titulo', 'url'] },
    },
    puntos: { type: 'array', items: { type: 'string' }, description: 'tipo "puntos": hasta 12 viñetas; si no entran, el motor las reparte en varias láminas' },
    izquierda: { type: 'object', properties: { titulo: { type: 'string' }, puntos: { type: 'array', items: { type: 'string' } } }, description: 'tipo "dos_columnas"' },
    derecha: { type: 'object', properties: { titulo: { type: 'string' }, puntos: { type: 'array', items: { type: 'string' } } }, description: 'tipo "dos_columnas"' },
    indicadores: {
      type: 'array', description: 'tipo "indicadores": 2 a 4 números que deciden algo',
      items: { type: 'object', properties: { rotulo: { type: 'string' }, valor: { type: 'string' }, nota: { type: 'string' }, tono: { type: 'string', enum: ['neutro', 'positivo', 'negativo', 'alerta'] }, origen: { type: 'string', enum: ['ECSAS', 'EXTERNO'] } }, required: ['rotulo', 'valor'] },
    },
    columnas: { type: 'array', items: { type: 'string' }, description: 'tipo "tabla": 2 a 6 encabezados' },
    filas: { type: 'array', items: { type: 'array', items: { type: 'string' } }, description: 'tipo "tabla": hasta 9 filas' },
    alinear_derecha: { type: 'array', items: { type: 'number' }, description: 'tipo "tabla": índices de columnas numéricas' },
    unidad: { type: 'string', description: 'tipo "barras": en qué unidad están los valores' },
    series: { type: 'array', description: 'tipo "barras": 2 a 8 barras', items: { type: 'object', properties: { rotulo: { type: 'string' }, valor: { type: 'number' }, texto: { type: 'string', description: 'el valor como se escribe, ej. "$ 84,2 M"' }, tono: { type: 'string', enum: ['neutro', 'positivo', 'negativo', 'alerta'] } }, required: ['rotulo', 'valor'] } },
    hitos: { type: 'array', description: 'tipo "hitos": 2 a 6 hitos en el tiempo', items: { type: 'object', properties: { fecha: { type: 'string' }, titulo: { type: 'string' }, detalle: { type: 'string' }, estado: { type: 'string', enum: ['hecho', 'en_curso', 'pendiente'] } }, required: ['fecha', 'titulo'] } },
    mensaje: { type: 'string', description: 'tipo "cierre"' },
    contacto: { type: 'string', description: 'tipo "cierre"' },
  },
  required: ['tipo', 'titulo'],
}

const ESQUEMA_DECK = {
  type: 'object',
  properties: {
    tipo: { type: 'string', enum: TIPOS_DECK, description: 'qué presentación es: CLIENTE (informe al cliente), AVANCE_OBRA, COMERCIAL (propuesta), DIRECCION (reunión interna), TECNICO, PRESUPUESTO' },
    titulo: { type: 'string', description: 'el título de la portada' },
    subtitulo: { type: 'string' },
    cliente: { type: 'string' },
    obra: { type: 'string' },
    fecha: { type: 'string', description: 'la fecha del informe, como se escribe (27/08/2026)' },
    carpeta_id: { type: 'string', description: 'carpeta de Drive donde dejarla (opcional)' },
    laminas: { type: 'array', items: ESQUEMA_LAMINA, description: 'las láminas en orden, sin la portada (la pone el motor)' },
  },
  required: ['tipo', 'titulo', 'laminas'],
}

const COMO_SE_USA =
  'Armá la NARRATIVA, no el diseño: elegí qué lámina va, qué dice y en qué orden. No podés pedir posiciones, colores ni tamaños — la marca la aplica el motor. '
  + 'Traé los números con las capacidades del OS ANTES de armar las láminas y usá los reales: nunca inventes una cifra para llenar una lámina. '
  + 'Todo dato que NO salga del OS va con origen:"EXTERNO" y su fuente con URL (buscalo con web_search y leelo con web_leer): se dibuja distinto y se lista al final. '
  + 'Empezá por un corte de sección, poné los números en "indicadores" (2 a 4, los que deciden algo), las comparaciones en "tabla" o "barras", los plazos en "hitos", y cerrá con "cierre". '
  + 'Máximo 7 viñetas por lámina; si mandás más, el motor las reparte solo.'

export function presentacionTools(google) {
  return {
    'slides.crear': {
      capability: 'drive.write',
      account: 'ecsas',
      schema: {
        name: 'crear_presentacion_google_slides',
        description:
          'CREA una presentación de GOOGLE SLIDES con la plantilla corporativa de Echegaray y la deja en Drive; devuelve el link para abrirla y compartirla. Usala cuando el dueño pida "armame una presentación", "preparame las slides para la reunión con X", "hacé el informe de avance para el cliente", "una propuesta comercial", "el presupuesto en slides". '
          + COMO_SE_USA
          + ' Antes de crearla podés probarla gratis con previsualizar_presentacion: dice si algo no entra sin dejar un archivo a medias en el Drive.',
        input_schema: ESQUEMA_DECK,
      },
      async run(input) {
        try {
          const r = await publicarDeck(google, input)
          if (r?.error) return r
          return {
            ok: true,
            link: r.link,
            id: r.id,
            laminas: r.laminas,
            control_de_calidad: r.qa,
            verificacion: r.verificacion,
            logo: r.logo,
            aviso: r.resumen?.fuentes_externas
              ? `${r.resumen.fuentes_externas} referencia(s) externa(s): van marcadas y listadas al final. No son datos de ECSAS.`
              : null,
          }
        } catch (e) {
          return { error: `no pude crear la presentación: ${String(e?.message ?? e).slice(0, 200)}` }
        }
      },
    },

    'slides.previsualizar': {
      capability: 'drive.read',
      account: 'ecsas',
      schema: {
        name: 'previsualizar_presentacion',
        description:
          'Prueba una presentación SIN crear nada: valida el contenido, la compone, mide todos los textos y dice si algo no entra, se pisa o no se lee. Gratis y en milisegundos. Usala antes de crear_presentacion_google_slides cuando el contenido es largo o los números son grandes. Recibe exactamente lo mismo que la tool de crear.',
        input_schema: ESQUEMA_DECK,
      },
      async run(input) {
        const p = prepararDeck(input)
        if (!p.ok) return { ok: false, motivo: p.motivo, errores: p.errores, control_de_calidad: p.qa }
        return { ok: true, laminas: p.compuesto.laminas.length, resumen: p.compuesto.resumen, control_de_calidad: p.qa, correcciones: p.correcciones }
      },
    },

    'slides.mirar': {
      capability: 'drive.read',
      account: 'ecsas',
      schema: {
        name: 'ver_presentacion',
        description:
          'Devuelve el PNG de cada lámina de una presentación de Slides, renderizado por Google. Sirve para MIRAR el resultado antes de mandarlo, o para revisar una presentación existente. Pasá el id del archivo de Drive.',
        input_schema: { type: 'object', properties: { archivo_id: { type: 'string' } }, required: ['archivo_id'] },
      },
      async run(input) {
        if (!input?.archivo_id) return { error: 'falta archivo_id' }
        if (!google?.miniaturaDeLamina) return { error: 'no hay cuenta de Google autorizada' }
        try { return { ok: true, laminas: await miniaturas(google, String(input.archivo_id)) } }
        catch (e) { return { error: `no pude leer la presentación: ${String(e?.message ?? e).slice(0, 180)}` } }
      },
    },
  }
}
