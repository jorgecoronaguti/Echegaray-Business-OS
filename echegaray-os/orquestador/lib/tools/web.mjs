// LAS TRES CAPACIDADES DE INTERNET DEL OS, EN ORDEN DE COSTO: buscar · leer · navegar.
//
// Existían como una sola (`web_search`) y eso alcanzaba para orientarse, no para decidir: el
// resumen de una búsqueda no se puede citar ni fechar. Ahora hay tres, y la descripción de cada
// una dice cuándo NO usarla, porque el error caro acá es abrir un navegador para leer un HTML.
//
//   web_search   qué existe y dónde está.      Barata. Devuelve resumen + fuentes.
//   web_leer     el texto de UNA página.       Media. Es la que se puede CITAR: url + fecha.
//   web_navegar  cuando el dato exige un clic. Cara. Sólo si el contenido no existe sin interacción.
//
// LAS TRES DEVUELVEN LO MISMO: el envoltorio de `web/contenido-externo.mjs`. Nada de internet entra
// al OS suelto, y nada de internet entra como HECHO — sale como REFERENCIA_EXTERNA, con su url, su
// instante y su frescura. Convertir una referencia en conocimiento validado de ECSAS es una
// decisión del dueño, no un efecto de haberla leído.
//
// Lectura (Nivel A): reusan la capacidad 'drive.read' (auto), sin efecto externo.
import { webSearch } from '../web-search.mjs'
import { aplicarPoliticaContenidoExterno, ORIGEN_EXTERNO } from '../web/contenido-externo.mjs'
import { leerUrl } from '../web/web-lectura.mjs'
import { navegar } from '../web/navegador-web.mjs'

export function webSearchTools() {
  return {
    'web.search': {
      capability: 'drive.read',
      account: 'ecsas',
      schema: {
        name: 'web_search',
        description:
          'Busca en INTERNET información actual: precios de materiales (hormigón, acero, áridos…), jornales/convenios vigentes, normativa (CIRSOC, INTI, UOCRA, ARCA), inflación/índices, proveedores, fichas técnicas, referencias de mercado. Usalo cuando presupuestás o analizás y necesitás un dato que no está en los archivos del OS. Pasá query (específico, con lugar y fecha si aplica). Devuelve un resumen CON fuentes. Lo que vuelve es REFERENCIA EXTERNA: se cita con su fuente, nunca se presenta como dato de ECSAS. Si el dato va a decidir plata, después leé la página con web_leer para tener la URL y la fecha.',
        input_schema: {
          type: 'object',
          properties: { query: { type: 'string', description: 'qué buscar, ej. "precio m3 hormigón H21 San Juan 2026"' } },
          required: ['query'],
        },
      },
      async run(input) {
        if (!input?.query) return { error: 'falta query' }
        const consulta = String(input.query).slice(0, 300)
        try {
          const r = await webSearch(consulta)
          const envuelto = aplicarPoliticaContenidoExterno({
            texto: r.text, origen: ORIGEN_EXTERNO.BUSQUEDA, consulta,
          })
          // `resultado` y `busquedas` se conservan: hay prompts y handlers que ya los leen.
          return { ok: true, query: consulta, resultado: r.text, busquedas: r.searches, ...envuelto }
        } catch (e) {
          return { error: `no pude buscar en internet: ${String(e?.message ?? e).slice(0, 160)}` }
        }
      },
    },

    'web.read': {
      capability: 'drive.read',
      account: 'ecsas',
      schema: {
        name: 'web_leer',
        description:
          'LEE el texto de una página web concreta y devuelve su contenido con la URL, el título, la fecha de publicación si la declara y cuán fresca es. Usalo cuando el dato va a sostener una decisión (una alícuota, un tramo de paritaria, una resolución, una ficha técnica): el resumen de web_search no se puede citar, esto sí. Pasá url y opcionalmente para_que (qué buscás en la página). NO sirve para PDFs (usá la lectura de Drive) ni para sitios que exigen sesión.',
        input_schema: {
          type: 'object',
          properties: {
            url: { type: 'string', description: 'dirección completa, con https://' },
            para_que: { type: 'string', description: 'qué dato estás buscando en esa página (queda como evidencia)' },
          },
          required: ['url'],
        },
      },
      async run(input) {
        if (!input?.url) return { error: 'falta url' }
        return leerUrl(String(input.url), { consulta: input?.para_que ? String(input.para_que).slice(0, 200) : null })
      },
    },

    'web.browser': {
      // ═══ MISMO ARGUMENTO QUE BALANZ, UNA TOOL MÁS ALLÁ (28/08/2026, auditoría) ═══
      //
      // Declaraba `drive.read`, que además no describe nada: no lee Drive. Y `navegadorWeb` hace
      // `chromium.launch`: levanta un navegador en la VM y sale a internet desde la IP de la empresa.
      // Un efecto sobre un sistema de un tercero no es una lectura del OS aunque no escriba una fila
      // — es la misma regla por la que `tesoreria.analisis_inversion` dejó de ser `os.read`.
      //
      // El peor caso interno ya estaba cerrado por `urlPermitida` (bloquea localhost, la red privada
      // y el metadata server). Lo que faltaba era que el permiso nombrara el efecto.
      capability: 'externo.navegar',
      account: 'ecsas',
      schema: {
        name: 'web_navegar',
        description:
          'Abre un NAVEGADOR real y ejecuta un guión corto para llegar a contenido que NO existe sin interacción: una consulta que exige apretar "Buscar", un listado que aparece después de un clic, una página que se dibuja con JavaScript. Es la vía CARA: si el dato está en el HTML, usá web_leer. Pasá pasos = lista de {accion, ...}: {"accion":"ir","url":...}, {"accion":"escribir","selector":"#q","texto":...}, {"accion":"click","selector":...}, {"accion":"esperar","ms":2000}, {"accion":"captura"}. El primer paso siempre es "ir". NO inicia sesión ni completa contraseñas: si el sitio pide credenciales, decilo y que entre una persona.',
        input_schema: {
          type: 'object',
          properties: {
            pasos: {
              type: 'array',
              description: 'guión de navegación, máximo 12 pasos; el primero es "ir"',
              items: {
                type: 'object',
                properties: {
                  accion: { type: 'string', enum: ['ir', 'esperar', 'click', 'escribir', 'captura'] },
                  url: { type: 'string' },
                  selector: { type: 'string' },
                  texto: { type: 'string' },
                  ms: { type: 'number' },
                },
                required: ['accion'],
              },
            },
          },
          required: ['pasos'],
        },
      },
      async run(input) {
        if (!Array.isArray(input?.pasos) || !input.pasos.length) return { error: 'falta el guión (pasos)' }
        return navegar(input.pasos)
      },
    },
  }
}
