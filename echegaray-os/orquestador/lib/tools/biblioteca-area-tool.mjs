// Tool: BIBLIOTECA POR ÁREA — hace recuperable el conocimiento que el OS ya tenía y no usaba.
// Compone la fuente única public.conocimiento_por_area (no recalcula ni copia nada). 0 API.
import { bibliotecaArea, panoramaAreas, formatBiblioteca, formatPanorama, AREAS } from '../biblioteca-area.mjs'

export function bibliotecaAreaTools() {
  return {
    'os.biblioteca_area': {
      capability: 'os.read',
      schema: {
        name: 'biblioteca_area',
        description:
          'Dice QUÉ SABE, DE DÓNDE SALE EL DATO, QUÉ LE FALTA y QUÉ DEBE el OS sobre una de las 8 áreas ' +
          '(Compras, Administración y Finanzas, Obras, Personas, Contabilidad y Legales, Comercial/Cotización, ' +
          'Calidad, Gestión General). USALA SIEMPRE ANTES de ponerte a investigar algo de un área: el OS ya ' +
          'tiene anotadas afirmaciones confirmadas (por ejemplo en qué pestaña de qué Sheet vive cada dato) y ' +
          'buscarlo de cero es trabajo que ya está hecho. También sirve cuando el dueño pregunta "¿qué sabés ' +
          'de finanzas?", "¿qué le falta al área de personas?", "¿qué tenemos pendiente en obras?". ' +
          'Sin el argumento "area" devuelve el panorama de las 8. Los huecos que reporta son reales: un área ' +
          'sin afirmaciones significa que el OS no sabe nada estable de ella, y hay que decirlo así.',
        input_schema: {
          type: 'object',
          properties: {
            area: {
              type: 'string',
              description:
                'Área a consultar. Acepta la clave, el nombre o como lo diga el dueño ("finanzas", "rrhh", ' +
                `"cotización"). Las 8: ${AREAS.map((a) => a.clave).join(', ')}. Omitir para el panorama general.`,
            },
          },
        },
      },
      async run({ area } = {}) {
        try {
          if (!area) {
            const filas = await panoramaAreas()
            return { panorama: filas, resumen_texto: formatPanorama(filas) }
          }
          const r = await bibliotecaArea(area)
          return { ...r, resumen_texto: formatBiblioteca(r) }
        } catch (e) {
          return { error: `no pude leer la biblioteca: ${String(e?.message ?? e).slice(0, 200)}` }
        }
      },
    },
  }
}
