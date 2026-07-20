// Tools: crear PRESENTACIONES (Google Slides) y EXPORTAR A PDF cualquier archivo nativo de Google.
//
// Auditoría 2026-07-19: el chat ya ejecutaba sobre Drive, Sheets y Docs, pero Slides NO EXISTÍA como
// capacidad (cero) y de PDF solo sabía LEER. Estos eran los dos huecos reales para "si le pido que
// ejecute cosas en drive, sheet, doc, slide, pdf, que las haga".
//
// Requieren actuar como usuario autorizado (OAuth): la cuenta de servicio sola no puede crear
// archivos (403 por scopes). Ambas cuentas del dominio ya están autorizadas con Drive completo.
export function slidesPdfTools(google) {
  return {
    'drive.create_slides': {
      capability: 'drive.write',
      account: 'ecsas',
      schema: {
        name: 'crear_presentacion',
        description:
          'CREA una presentación de Google Slides y la deja en Drive. USALO cuando el dueño pida "armame una presentación", "hacé un PPT de…", "preparame las slides para la reunión con [cliente]". Pasá el título del archivo y las diapositivas: la PRIMERA es la portada (solo título) y las siguientes llevan título + cuerpo. En el cuerpo usá saltos de línea para separar los puntos. Devuelve el link para abrirla. Si el contenido sale de datos del OS (obras, caja, cotizaciones), traelos con las capacidades correspondientes ANTES y armá las slides con números reales — nunca inventes cifras para llenar una lámina.',
        input_schema: {
          type: 'object',
          properties: {
            nombre: { type: 'string', description: 'nombre del archivo de la presentación' },
            slides: {
              type: 'array',
              description: 'diapositivas en orden; la primera es la portada',
              items: {
                type: 'object',
                properties: {
                  titulo: { type: 'string', description: 'título de la diapositiva' },
                  cuerpo: { type: 'string', description: 'contenido (usar saltos de línea para los puntos); la portada no lo usa' },
                },
                required: ['titulo'],
              },
            },
            carpeta_id: { type: 'string', description: 'id de la carpeta de Drive donde guardarla (opcional)' },
          },
          required: ['nombre', 'slides'],
        },
      },
      async run(input) {
        try {
          if (!google?.createSlides) return { error: 'no hay cuenta de Google autorizada para crear archivos (hace falta el login del OS)' }
          if (!input?.nombre || !Array.isArray(input?.slides) || !input.slides.length) {
            return { error: 'necesito el nombre y al menos una diapositiva' }
          }
          const r = await google.createSlides(input.nombre, input.slides, { parentId: input.carpeta_id })
          return { creada: true, ...r, diapositivas: input.slides.length }
        } catch (e) {
          return { error: `no pude crear la presentación: ${String(e?.message ?? e).slice(0, 200)}` }
        }
      },
    },
    'drive.export_pdf': {
      capability: 'drive.write',
      account: 'ecsas',
      schema: {
        name: 'exportar_a_pdf',
        description:
          'EXPORTA a PDF un archivo nativo de Google (Sheet, Doc o presentación) y guarda el PDF en Drive. USALO cuando el dueño pida "pasame esto a PDF", "generá el PDF del presupuesto", "mandame el informe en PDF". Pasá el id del archivo de Drive; opcionalmente el nombre del PDF y la carpeta destino. Devuelve el link del PDF generado. Sirve para dejar un presupuesto, un informe o un acta en un formato que se le puede mandar al cliente.',
        input_schema: {
          type: 'object',
          properties: {
            archivo_id: { type: 'string', description: 'id del archivo de Drive a exportar (Sheet, Doc o Slides)' },
            nombre: { type: 'string', description: 'nombre del PDF resultante (opcional; por defecto el del original)' },
            carpeta_id: { type: 'string', description: 'id de la carpeta destino (opcional)' },
          },
          required: ['archivo_id'],
        },
      },
      async run(input) {
        try {
          if (!google?.exportarComoPdf) return { error: 'no hay cuenta de Google autorizada para escribir en Drive' }
          if (!input?.archivo_id) return { error: 'necesito el id del archivo a exportar' }
          const r = await google.exportarComoPdf(input.archivo_id, { nombre: input.nombre, parentId: input.carpeta_id })
          return { exportado: true, ...r }
        } catch (e) {
          return { error: `no pude exportar a PDF: ${String(e?.message ?? e).slice(0, 200)}` }
        }
      },
    },
  }
}
