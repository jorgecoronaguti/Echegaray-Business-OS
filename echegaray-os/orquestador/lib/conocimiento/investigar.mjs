// EL MOTOR DE INVESTIGACIÓN — cómo XSAS descubre lo que todavía no sabe, y en qué orden.
//
// ═══ EL CAMINO RÁPIDO, QUE ES EL PUNTO ═══
//
// Saber más NO puede costar más. La defensa es el ORDEN: cada escalón es más caro y más lento que
// el anterior, y sólo se baja cuando el de arriba no contestó. Una cotización que no necesita
// internet no toca internet; una que ya se hizo no vuelve a preguntar nada.
//
//   caché → regla → Base Maestra → conocimiento estudiado → experiencia ECSAS
//         → documentos del proyecto → fuentes curadas → búsqueda web → modelo
//
// El modelo es el ÚLTIMO, y sólo para lo que quedó sin resolver arriba. No es una preferencia
// estética: es la diferencia entre un motor que sigue andando sin saldo y uno que no.
//
// ═══ LO QUE ESTE MÓDULO NO HACE ═══
//
// No decide qué es verdad. Devuelve SIEMPRE el recorrido completo —qué se probó, qué contestó, qué
// no— y cuando dos fuentes se contradicen devuelve CONFLICTO en vez de elegir. Elegir en silencio
// entre dos lecturas que se contradicen es exactamente lo que este repo llama fabricar cobertura.
import { VIA } from './metricas.mjs'
import { ESTADO as ESTADO_FUENTE, anotarUso, descubrir, ordenar } from './fuentes.mjs'
import { HUECO, PROCEDENCIA, conocimiento, hueco, saber } from './biblioteca.mjs'
import { buscar, pareceriaPdf, traer, traerPdf } from './buscar.mjs'
import { autoridadDe } from '../plano/investigacion.mjs'

/** Los escalones, en orden. Cada uno declara si necesita red y si necesita modelo: es lo que
 *  permite apagar una capa entera y saber de antemano qué se pierde. */
export const ESCALONES = Object.freeze([
  { via: VIA.CACHE, red: false, modelo: false, que: 'la misma pregunta ya resuelta para la misma entrada' },
  { via: VIA.CONOCIMIENTO, red: false, modelo: false, que: 'la biblioteca técnica: lo que XSAS ya estudió' },
  { via: VIA.BASE_MAESTRA, red: false, modelo: false, que: 'el catálogo de partidas y análisis de ECSAS' },
  { via: VIA.EXPERIENCIA, red: false, modelo: false, que: 'lo que medimos ejecutando obras' },
  { via: VIA.DOCUMENTO_LOCAL, red: false, modelo: false, que: 'los documentos de ESTE proyecto, ya procesados' },
  { via: VIA.BUSQUEDA_WEB, red: true, modelo: false, que: 'internet, priorizando fuentes primarias' },
  { via: VIA.MODELO, red: true, modelo: true, que: 'razonamiento generativo, sólo para lo que quedó' },
])

/** Cuándo se activa la investigación web, dicho como condiciones y no como intuición. PURA. */
export const MOTIVOS_PARA_INVESTIGAR = Object.freeze({
  SIN_CONOCIMIENTO: 'no hay nada estudiado sobre esto',
  CONFIANZA_BAJA: 'lo que hay tiene confianza baja',
  CONFLICTO: 'dos fuentes internas se contradicen',
  REQUIERE_VIGENCIA: 'el dato caduca y hay que ver la versión vigente',
  FUENTE_VIEJA: 'la fuente que lo sostiene venció su revisión',
})

/**
 * ¿HAY QUE SALIR A INVESTIGAR? PURA.
 *
 * Se contesta ANTES de gastar: sin esta función la web se consulta «por las dudas», que es como se
 * vuelve lento un motor que sabe mucho.
 */
export function hayQueInvestigar({ encontrados = [], huecos = [], requiereVigencia = false, fuenteVencida = false } = {}) {
  if (huecos.some((h) => h.tipo === HUECO.CONFLICTO)) return { si: true, motivo: MOTIVOS_PARA_INVESTIGAR.CONFLICTO }
  if (!encontrados.length) return { si: true, motivo: MOTIVOS_PARA_INVESTIGAR.SIN_CONOCIMIENTO }
  if (requiereVigencia) return { si: true, motivo: MOTIVOS_PARA_INVESTIGAR.REQUIERE_VIGENCIA }
  if (fuenteVencida) return { si: true, motivo: MOTIVOS_PARA_INVESTIGAR.FUENTE_VIEJA }
  if (encontrados.every((k) => k.confianza === 'BAJA')) return { si: true, motivo: MOTIVOS_PARA_INVESTIGAR.CONFIANZA_BAJA }
  return { si: false, motivo: null }
}

/**
 * CONTRASTAR LO QUE DICEN VARIAS FUENTES. PURA.
 *
 * Devuelve `ACUERDO` con el valor cuando coinciden, y `CONFLICTO` con las dos posiciones cuando no.
 * NUNCA promedia: el promedio entre dos criterios técnicos incompatibles no es un criterio técnico,
 * es un número que nadie escribió y que nadie puede defender.
 */
export function contrastar(lecturas = [], { tolerancia = 0.02 } = {}) {
  const validas = lecturas.filter((l) => l && l.valor !== null && l.valor !== undefined)
  if (!validas.length) return { estado: HUECO.FALTA_DATO, porQue: 'ninguna fuente trajo un valor' }
  if (validas.length === 1) return { estado: 'ACUERDO', valor: validas[0].valor, fuentes: [validas[0]], porQue: 'una sola fuente lo dice' }
  const numericas = validas.every((l) => Number.isFinite(Number(l.valor)))
  const iguales = numericas
    ? validas.every((l) => {
      const a = Number(l.valor); const b = Number(validas[0].valor)
      return b === 0 ? a === 0 : Math.abs(a - b) / Math.abs(b) <= tolerancia
    })
    : validas.every((l) => String(l.valor).trim().toLowerCase() === String(validas[0].valor).trim().toLowerCase())
  if (iguales) return { estado: 'ACUERDO', valor: validas[0].valor, fuentes: validas, porQue: `${validas.length} fuentes coinciden` }
  const ordenadas = [...validas].sort((a, b) => (a.autoridad ?? 9) - (b.autoridad ?? 9))
  return {
    estado: HUECO.CONFLICTO,
    valor: null,
    fuentes: ordenadas,
    mejorAutoridad: ordenadas[0],
    porQue: `las fuentes no coinciden: ${ordenadas.map((l) => `${l.fuente ?? l.url ?? '?'} dice ${l.valor}`).join(' · ')}`,
  }
}

/**
 * INVESTIGAR EN LA WEB, SIN MODELO.
 *
 * Busca, ordena por autoridad, trae las primeras y devuelve lecturas CITABLES. Descubre fuentes
 * nuevas en el padrón y anota si sirvieron: es lo que hace que la lista de fuentes aprenda sola.
 *
 * Lo que devuelve son LECTURAS, no conocimiento: para que una lectura pase a conocimiento hace
 * falta una afirmación con su cita, y eso lo decide quien llama, no este módulo.
 */
export async function investigarWeb({
  consulta, fuentes = [], stats = null, medidor = null, max = 6, aTraer = 3,
  pistasFabricante = [], jurisdiccion = null, fetchImpl = fetch, cuando = null, dir = undefined,
} = {}) {
  const conDir = dir === undefined ? {} : { dir }
  const r = await buscar(consulta, { stats, max, fetchImpl, ...conDir })
  medidor?.busco({ consulta, motor: r.motor, deCache: r.deCache, resultados: r.resultados.length, conModelo: false })
  if (!r.ok) return { ok: false, lecturas: [], fuentes, porQue: r.porQue, sinModelo: true }

  let padron = fuentes
  const conAutoridad = r.resultados.map((x) => ({ ...x, ...autoridadDe(x.url, { pistasFabricante }) }))
  for (const x of conAutoridad) padron = descubrir(padron, { url: x.url, nombre: x.titulo, jurisdiccion: jurisdiccion ?? 'internacional' }).fuentes

  // El orden de lectura sale del padrón —que ya sabe qué está curado y qué degradado— y no del
  // orden en que el buscador los devolvió, que responde a otra cosa.
  const pesoDe = new Map(ordenar(padron, { jurisdiccion }).map((f, i) => [f.dominio, i]))
  const candidatas = [...conAutoridad].sort((a, b) => a.autoridad - b.autoridad
    || (pesoDe.get(a.dominio) ?? 999) - (pesoDe.get(b.dominio) ?? 999)
    || a.posicion - b.posicion)

  const lecturas = []
  for (const c of candidatas.slice(0, aTraer)) {
    // Un reglamento, una norma o una ficha de fabricante casi siempre son PDF. Mandarlos por el
    // lector de HTML devuelve «no sé leer ese tipo de contenido» y deja al motor leyendo blogs.
    const esPdf = pareceriaPdf(c.url, c.titulo)
    const t = esPdf
      ? await traerPdf(c.url, { stats, consulta, fetchImpl, ...conDir })
      : await traer(c.url, { stats, consulta, fetchImpl, ...conDir })
    const idFuente = padron.find((f) => f.dominio === c.dominio)?.id
    if (idFuente) padron = anotarUso(padron, idFuente, { sirvio: t.ok, que: t.ok ? consulta : null, cuando })
    lecturas.push({
      url: c.url, titulo: c.titulo, fragmento: c.fragmento, dominio: c.dominio,
      autoridad: c.autoridad, porQueAutoridad: c.porQue,
      ok: t.ok, hash: t.hash ?? null, caracteres: t.caracteres ?? 0,
      formato: t.formato ?? 'html', paginas: t.paginas ?? null, truncado: t.truncado ?? false,
      publicadoEn: t.publicado_en ?? null, frescura: t.frescura ?? null,
      contenido: t.contenido_externo ?? null, inyeccion: t.inyeccion ?? null,
      porQue: t.porQue ?? null, deCache: t.deCache ?? false,
    })
  }
  return { ok: lecturas.some((l) => l.ok), lecturas, fuentes: padron, consulta, sinModelo: true }
}

/**
 * RESOLVER UNA NECESIDAD RECORRIENDO LOS ESCALONES.
 *
 * `resolvedores` es un objeto `{ [VIA]: async (necesidad) => ({ ok, valor, evidencia, procedencia }) }`.
 * Los que no estén, no se prueban y quedan declarados como «no disponible» en el recorrido: un
 * escalón ausente tiene que verse, porque explica por qué la respuesta vino de más abajo.
 *
 * `permitirModelo: false` es el escenario del dueño —sin saldo, sin API key, proveedor caído— y NO
 * hace fallar la resolución: la baja de escalón y la declara DEGRADADA.
 */
export async function resolver({
  necesidad, resolvedores = {}, bib = null, fuentes = [], medidor = null, stats = null,
  permitirModelo = true, permitirWeb = true, jurisdiccion = null, cuando = null, fetchImpl = fetch, dir = undefined,
} = {}) {
  const recorrido = []
  let padron = fuentes
  // Lo que la web trajo y todavía no se interpretó. Viaja hasta el final: si nadie lo convierte en
  // un valor, el hueco sale igual pero con el material citable adjunto, que no es lo mismo que nada.
  let lecturasWeb = null

  for (const esc of ESCALONES) {
    if (esc.via === VIA.MODELO && !permitirModelo) { recorrido.push({ via: esc.via, resultado: 'APAGADO', porQue: 'no hay proveedor de razonamiento disponible' }); continue }
    if (esc.red && !permitirWeb) { recorrido.push({ via: esc.via, resultado: 'APAGADO', porQue: 'la salida a internet está deshabilitada' }); continue }

    // El conocimiento ya estudiado se consulta acá y no hace falta un resolvedor: es una lectura.
    if (esc.via === VIA.CONOCIMIENTO && bib) {
      const s = saber(bib, necesidad.clave, { jurisdiccion })
      if (s.hay) {
        medidor?.decidio({ que: necesidad.clave, via: VIA.CONOCIMIENTO })
        return { ok: true, via: VIA.CONOCIMIENTO, valor: s.encontrados[0].valor, conocimiento: s.encontrados[0], recorrido: [...recorrido, { via: esc.via, resultado: 'RESOLVIO' }], fuentes: padron, degradado: null }
      }
      recorrido.push({ via: esc.via, resultado: 'NO_SABE', porQue: 'la biblioteca no tiene nada bajo esa clave' })
      continue
    }

    if (esc.via === VIA.BUSQUEDA_WEB) {
      const r = await investigarWeb({ consulta: necesidad.consulta ?? necesidad.clave, fuentes: padron, stats, medidor, jurisdiccion, cuando, fetchImpl, dir, pistasFabricante: necesidad.pistasFabricante ?? [] })
      padron = r.fuentes
      if (r.ok) {
        medidor?.decidio({ que: necesidad.clave, via: VIA.BUSQUEDA_WEB })
        const leidas = r.lecturas.filter((l) => l.ok)
        // ═══ TRAER TEXTO NO ES RESOLVER ═══
        //
        // La investigación llegó entera: bajó los documentos y los dejó citables. Lo que NO pasó es
        // que alguien los leyera para sacar un valor. Este escalón devolvía `ok: true` y cortaba la
        // cascada — o sea que con el modelo DISPONIBLE nunca se llegaba a él, y la respuesta salía
        // `ok:true · valor:null · degradado:null`: una resolución que no resolvió nada, declarada
        // limpia. Es la misma forma de fallar que este repo llama fabricar cobertura, en la rama
        // opuesta a la que ya se había corregido.
        //
        // Ahora: si el modelo está disponible, las lecturas se guardan y la cascada SIGUE hasta él,
        // que es quien las convierte en un valor. Si no lo está, se devuelven con la degradación
        // declarada — porque texto citable es más que nada, y decir de qué se trata es el trabajo.
        if (permitirModelo) {
          lecturasWeb = r.lecturas
          recorrido.push({ via: esc.via, resultado: 'TRAJO_LECTURAS', cuantas: leidas.length, porQue: 'texto citable, todavía sin interpretar: sigue al modelo' })
          continue
        }
        return {
          ok: true, via: VIA.BUSQUEDA_WEB, valor: null, lecturas: r.lecturas,
          recorrido: [...recorrido, { via: esc.via, resultado: 'TRAJO_LECTURAS', cuantas: leidas.length }],
          fuentes: padron,
          degradado: {
            porQue: `la búsqueda trajo ${leidas.length} lectura(s) citable(s) y ninguna se interpretó: sin proveedor de razonamiento no se pasa de texto a valor`,
            escalones: [VIA.MODELO],
            loQueQuedoSinRazonamiento: leidas.map((l) => l.url),
          },
        }
      }
      recorrido.push({ via: esc.via, resultado: 'NO_SABE', porQue: r.porQue })
      continue
    }

    const fn = resolvedores[esc.via]
    if (!fn) { recorrido.push({ via: esc.via, resultado: 'NO_DISPONIBLE', porQue: 'no hay resolvedor conectado para este escalón' }); continue }
    let r
    try { r = await fn(necesidad) } catch (e) { recorrido.push({ via: esc.via, resultado: 'FALLO', porQue: String(e?.message ?? e).slice(0, 160) }); continue }
    if (r?.ok) {
      medidor?.decidio({ que: necesidad.clave, via: esc.via })
      return { ok: true, via: esc.via, valor: r.valor, evidencia: r.evidencia ?? null, procedencia: r.procedencia ?? null, recorrido: [...recorrido, { via: esc.via, resultado: 'RESOLVIO' }], fuentes: padron, degradado: null }
    }
    recorrido.push({ via: esc.via, resultado: 'NO_SABE', porQue: r?.porQue ?? 'sin respuesta' })
  }

  // Nadie contestó. Eso NO es un error: es un hueco, y se declara con el motivo y con qué escalón
  // faltó. Si el modelo estaba apagado, la degradación se dice — no se disimula.
  const apagados = recorrido.filter((x) => x.resultado === 'APAGADO')
  medidor?.decidio({ que: necesidad.clave, via: VIA.HUECO })
  return {
    ok: false,
    via: VIA.HUECO,
    hueco: hueco({ clave: necesidad.clave, tipo: HUECO.FALTA_DATO, porQue: `ningún escalón pudo resolver «${necesidad.clave}»`, quienLoTiene: necesidad.quienLoTiene ?? null }),
    lecturas: lecturasWeb,
    recorrido, fuentes: padron,
    degradado: apagados.length ? { porQue: apagados.map((a) => `${a.via}: ${a.porQue}`).join(' · '), escalones: apagados.map((a) => a.via) } : null,
  }
}

/**
 * DE UNA LECTURA WEB A UN CONOCIMIENTO CANDIDATO. PURA.
 *
 * Nace CANDIDATO y con procedencia WEB, siempre. Ni una lectura de un dominio oficial nace NORMA:
 * para decir NORMA hay que citar el reglamento con su número y su año, y eso lo hace una persona o
 * un extractor que sepa de ese documento — no el hecho de haberlo bajado de un `.gob.ar`.
 */
export function candidatoDeLectura(lectura, { clave, afirmacion, valor = null, unidad = null, textoLiteral, cuando = null, area = null }) {
  if (!textoLiteral) throw new Error(`«${clave}» no trae la frase literal que lo dice: sin cita no hay candidato`)
  return conocimiento({
    clave, afirmacion, procedencia: PROCEDENCIA.WEB, valor, unidad, area,
    confianza: lectura?.autoridad <= 2 ? 'MEDIA' : 'BAJA',
    fecha: cuando,
    evidencia: { url: lectura?.url ?? null, titulo: lectura?.titulo ?? null, hash: lectura?.hash ?? null, publicadoEn: lectura?.publicadoEn ?? null, textoLiteral: String(textoLiteral).slice(0, 600) },
  })
}

export { ESTADO_FUENTE }
