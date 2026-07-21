// Tool: ¿DE QUIÉN ES ESTE CUIT? Cascada de fuentes con la confianza declarada.
//
// El dueño (21/07): "agregar al OS que si hay CUIT que lo busque en internet y traiga la razón
// social". Internet es la ÚLTIMA fuente, no la primera: la empresa ya sabe de quién son la mayoría
// de los CUIT que le importan (459 comprobantes de ARCA con emisor_cuit + emisor_nombre), y salir a
// buscar afuera un dato propio cuesta plata y devuelve algo menos confiable. El orden y el porqué
// están en `lib/razon-social.mjs`.
//
// Lectura (Nivel A): no escribe en ninguna tabla. Un nombre traído de internet es una INFERENCIA y
// se devuelve como tal, para que un humano lo confirme antes de que entre a proveedores.cuit.
import { query } from '../db.mjs'
import { extraer, normalizar, analizar } from '../cuit.mjs'
import { elegir, necesitaRed, extraerDeTexto } from '../razon-social.mjs'
import { webSearch } from '../web-search.mjs'

/** El padrón público de ARCA. Al 21/07 el endpoint histórico devuelve 404; se intenta igual y si
 *  falla se informa que falló, en vez de tapar la caída y pasar directo a internet sin decirlo. */
const PADRON = (cuit) => `https://soa.afip.gob.ar/sr-padron/v2/persona/${cuit}`

async function desdePadron(cuit) {
  try {
    const ctl = AbortSignal.timeout(8000)
    const r = await fetch(PADRON(cuit), { signal: ctl })
    if (!r.ok) return { nombre: null, nota: `padrón de ARCA no disponible (HTTP ${r.status})` }
    const j = await r.json()
    const d = j?.data ?? j
    const nombre = d?.razonSocial || [d?.apellido, d?.nombre].filter(Boolean).join(', ')
    return { nombre: nombre || null, nota: nombre ? null : 'el padrón contestó sin razón social' }
  } catch (e) {
    return { nombre: null, nota: `no pude consultar el padrón de ARCA: ${String(e?.message ?? e).slice(0, 90)}` }
  }
}

/** Capacidad pública: resuelve un CUIT. Se puede llamar desde cualquier lado del OS. */
export async function resolverCuit(entrada, { permitirRed = true } = {}) {
  // Acepta un CUIT suelto o un texto que lo contenga (un concepto de extracto bancario, por ejemplo).
  const cuit = normalizar(entrada) || extraer(entrada)[0] || ''
  if (!cuit) {
    const a = analizar(entrada)
    return { ...a, razon_social: null, fuente: null, confianza: 'desconocida', notas: ['no encontré un CUIT válido en lo que me pasaste'] }
  }

  const candidatos = []
  const notas = []

  // UN CUIT QUE NO CIERRA NO SE CONSULTA. Buscarlo devolvería "no lo tengo" y ese mensaje esconde
  // el problema real, que es un error de transcripción. Lo probé y pasaba exactamente eso.
  const juicio = analizar(cuit)
  if (!juicio.valido) {
    return { ...juicio, razon_social: null, fuente: null, confianza: 'desconocida', candidatos: [], coincide: false,
      notas: [`${juicio.problema}. Es un error de carga: no busco de quién es hasta que el número esté bien.`] }
  }

  // 1 y 2 — LO PROPIO, 0 API. Se consultan juntas porque ninguna cuesta.
  try {
    const { rows } = await query(
      // comprobantes_arca guarda emisor_nombre pero NO receptor_nombre: un CUIT que sólo aparece
      // como receptor (un cliente al que le facturamos) no se puede resolver por acá, y es correcto
      // que caiga a la red en vez de que me lo invente.
      `select 'comprobantes_arca' fuente, emisor_nombre nombre, count(*)::int n
         from comprobantes_arca where emisor_cuit = $1 and emisor_nombre is not null
        group by 1, 2
        union all
       select 'proveedores', nombre, 0 from public.proveedores where cuit = $1
        order by n desc limit 5`, [cuit])
    // El nombre más repetido gana dentro de la misma fuente: si un emisor cambió de razón social,
    // el que aparece en más comprobantes es el vigente.
    for (const r of rows) candidatos.push({ fuente: r.fuente, nombre: r.nombre, detalle: r.n ? `en ${r.n} comprobante(s)` : 'cargado a mano' })
  } catch (e) {
    notas.push(`no pude consultar la base propia: ${String(e?.message ?? e).slice(0, 90)}`)
  }

  // 3 y 4 — LA RED, sólo si lo propio no contestó. Es lo que evita pagar por un dato que ya se tiene.
  if (permitirRed && necesitaRed(candidatos)) {
    const p = await desdePadron(cuit)
    if (p.nombre) candidatos.push({ fuente: 'padron_arca', nombre: p.nombre, detalle: 'padrón oficial' })
    else if (p.nota) notas.push(p.nota)

    if (necesitaRed(candidatos) && !candidatos.some((c) => c.fuente === 'padron_arca')) {
      try {
        const r = await webSearch(`razón social de la empresa con CUIT ${cuit} en Argentina. Respondé sólo el nombre exacto.`)
        const n = extraerDeTexto(r.text, cuit)
        if (n) candidatos.push({ fuente: 'internet', nombre: n, detalle: 'INFERENCIA — confirmar antes de usarla como dato' })
        else notas.push('busqué en internet y no encontré una razón social que pueda afirmar')
      } catch (e) {
        notas.push(`no pude buscar en internet: ${String(e?.message ?? e).slice(0, 90)}`)
      }
    }
  } else if (!permitirRed && necesitaRed(candidatos)) {
    notas.push('no lo tengo en la base propia y la búsqueda en red está desactivada para esta consulta')
  }

  const r = elegir(cuit, candidatos)
  if (r.fuente === 'internet') notas.push('el nombre viene de internet: es una INFERENCIA, confirmala antes de cargarlo como proveedor')
  if (r.coincide) notas.push('dos fuentes independientes dan el mismo nombre')
  return { ...r, notas }
}

export function cuitTools() {
  return {
    'cuit.razon_social': {
      capability: 'drive.read',
      account: 'ecsas',
      schema: {
        name: 'cuit_razon_social',
        description:
          '¿DE QUIÉN ES ESTE CUIT? Devuelve la razón social con la FUENTE y la confianza. Usalo cada vez que aparezca un CUIT que no sabés de quién es: un concepto del extracto bancario ("Transferencia Recibida - Credin - Cuit 30710630670"), un débito automático, una factura, un comprobante de ARCA. Podés pasarle el CUIT solo o el texto entero que lo contiene: lo encuentra adentro. Primero valida el dígito verificador (un CUIT mal transcripto se detecta sin consultar nada), después busca en los comprobantes de ARCA y el padrón de proveedores de la empresa (0 API), y sólo si no lo tiene sale al padrón de ARCA y a internet. Si el nombre viene de internet lo dice: es una inferencia a confirmar, no un dato.',
        input_schema: {
          type: 'object',
          properties: {
            cuit: { type: 'string', description: 'el CUIT (con o sin guiones) o el texto que lo contiene' },
            sin_internet: { type: 'boolean', description: 'true para responder sólo con datos propios, sin salir a la red' },
          },
          required: ['cuit'],
        },
      },
      async run(input) {
        if (!input?.cuit) return { error: 'falta el cuit' }
        try {
          return await resolverCuit(input.cuit, { permitirRed: !input.sin_internet })
        } catch (e) {
          return { error: `no pude resolver el CUIT: ${String(e?.message ?? e).slice(0, 160)}` }
        }
      },
    },
  }
}
