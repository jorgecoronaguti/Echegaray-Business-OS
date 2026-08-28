// EL REGISTRO DE FUENTES — dónde existe el conocimiento que XSAS todavía no tiene.
//
// ═══ QUÉ ES Y QUÉ NO ES ═══
//
// NO es una lista de links. Es el padrón de los lugares donde vive conocimiento técnico
// verificable, con lo único que hace falta para decidir si creerle a uno frente a otro: quién lo
// publica, con qué autoridad, para qué jurisdicción, con qué vigencia y cuándo se lo consultó.
//
// NO es una lista cerrada. Una fuente entra DESCUBIERTA —la encontró una búsqueda— y sube a CURADA
// sólo cuando sirvió varias veces; una fuente que quedó vieja BAJA. Esa es la diferencia entre un
// registro que aprende y una constante escrita a mano.
//
// ═══ LA REGLA QUE GOBIERNA TODO ESTE ARCHIVO ═══
//
// El registro dice DÓNDE MIRAR. Jamás dice qué es verdad. Que una fuente sea OFICIAL no convierte
// en NORMA lo que se leyó de ella, y que sea CURADA no la hace vigente: la vigencia se verifica
// contra la fecha de la publicación, no contra la reputación del que publica.
import fs from 'node:fs'
import path from 'node:path'
import { AUTORIDAD, NOMBRE_AUTORIDAD, autoridadDe, dominioDe } from '../plano/investigacion.mjs'

export { AUTORIDAD, NOMBRE_AUTORIDAD, autoridadDe, dominioDe }

/** El ciclo de vida de una fuente. Una fuente NO nace curada: se gana el lugar sirviendo. */
export const ESTADO = Object.freeze({
  DESCUBIERTA: 'DESCUBIERTA',   // apareció en una búsqueda; todavía nadie la evaluó
  EVALUADA: 'EVALUADA',         // se le miró autoridad, jurisdicción y fecha
  CURADA: 'CURADA',             // sirvió repetidamente: se consulta antes que la web abierta
  DEGRADADA: 'DEGRADADA',       // quedó vieja o falló: se consulta última y con aviso
  REEMPLAZADA: 'REEMPLAZADA',   // hay una versión posterior; queda para poder citar lo viejo
})

/** Qué clase de cosa publica. Determina QUÉ se le puede extraer, no cuánto vale. */
export const TIPO = Object.freeze({
  REGLAMENTO: 'REGLAMENTO',           // CIRSOC, INPRES: artículo, requisito, vigencia
  NORMA: 'NORMA',                     // IRAM, ISO: número, año, alcance
  MEDICION: 'MEDICION',               // RICS NRM: regla de medición, inclusiones, exclusiones
  COSTOS: 'COSTOS',                   // GAO, NASA, USACE: estructura de estimación, madurez, riesgo
  PAPER: 'PAPER',                     // método, población, fórmulas, supuestos, limitaciones
  FABRICANTE: 'FABRICANTE',           // producto, consumo, rendimiento, compatibilidad
  INDICE: 'INDICE',                   // INDEC, cámaras: serie, período, base
  CONVENIO: 'CONVENIO',               // UOCRA: categoría, escala, vigencia
  DATOS: 'DATOS',                     // interoperabilidad, esquemas (IFC/buildingSMART)
})

/** Cuántas veces tiene que servir una fuente DESCUBIERTA para pasar a CURADA. Dos es el mínimo que
 *  distingue una casualidad de una recurrencia: es la misma escala A/B/C/D/E del repo, donde una
 *  observación aislada nunca se convierte sola en regla. */
export const USOS_PARA_CURAR = 2

/** Cuántos fallos seguidos la degradan. Uno puede ser la red; dos ya es la fuente. */
export const FALLOS_PARA_DEGRADAR = 2

export const RUTA_POR_DEFECTO = path.join(
  path.dirname(new URL(import.meta.url).pathname), '..', '..', 'datos', 'conocimiento', 'fuentes.json',
)

/**
 * LA FICHA DE UNA FUENTE. PURA.
 *
 * `jurisdiccion` no es decorativa: un reglamento de otra provincia no rige acá, y una norma
 * internacional no reemplaza a CIRSOC. `vigencia` es lo que la fuente dice de sí misma; `revisado`
 * es cuándo lo miramos nosotros. Confundir las dos es cómo un dato viejo pasa por vigente.
 */
export function fuente({
  id, nombre, autoridad = null, url, tipo, jurisdiccion = 'internacional',
  acceso = 'publico', licencia = null, vigencia = null, version = null,
  estado = ESTADO.DESCUBIERTA, frecuenciaDias = null, notas = null,
} = {}) {
  if (!id || !nombre || !url) throw new Error('una fuente necesita id, nombre y url')
  const dom = dominioDe(url)
  return {
    id: String(id), nombre: String(nombre), url: String(url), dominio: dom,
    autoridad: autoridad ?? autoridadDe(url).autoridad,
    tipo: tipo ?? null, jurisdiccion, acceso, licencia, vigencia, version,
    estado, frecuenciaDias,
    consultada: null, revisado: null, hash: null,
    usos: 0, fallos: 0, aportes: [],
    notas,
  }
}

/**
 * LAS FUENTES CON LAS QUE ARRANCA EL PADRÓN.
 *
 * Están acá porque son las que el dueño nombró y las que un motor de cotización de obra en San Juan
 * necesita primero. Ninguna nace CURADA salvo la que ya se leyó entera y se convirtió en código
 * verificable: ésa se ganó el lugar y su evidencia está en el repo.
 *
 * No es una lista eterna de marcas: los fabricantes entran por descubrimiento, no por enumeración.
 */
export const SEMILLA = Object.freeze([
  // ── Argentina · reglamento y norma técnica ──
  fuente({ id: 'inti-cirsoc', nombre: 'INTI · CIRSOC — reglamentos argentinos de estructuras', url: 'https://www.inti.gob.ar/areas/servicios-industriales/cirsoc', tipo: TIPO.REGLAMENTO, jurisdiccion: 'nacional', autoridad: AUTORIDAD.ORGANISMO_TECNICO, frecuenciaDias: 180 }),
  fuente({ id: 'inpres', nombre: 'INPRES — Instituto Nacional de Prevención Sísmica (zonificación y INPRES-CIRSOC 103)', url: 'https://www.inpres.gob.ar/', tipo: TIPO.REGLAMENTO, jurisdiccion: 'nacional', autoridad: AUTORIDAD.ORGANISMO_TECNICO, frecuenciaDias: 365, notas: 'San Juan es zona sísmica 4: lo que diga acá manda sobre cualquier criterio general' }),
  fuente({ id: 'iram', nombre: 'IRAM — normas argentinas', url: 'https://www.iram.org.ar/', tipo: TIPO.NORMA, jurisdiccion: 'nacional', autoridad: AUTORIDAD.ORGANISMO_TECNICO, acceso: 'pago', licencia: 'las normas se compran; sólo el catálogo es público', frecuenciaDias: 365 }),
  fuente({ id: 'indec', nombre: 'INDEC — índices de costos de la construcción', url: 'https://www.indec.gob.ar/', tipo: TIPO.INDICE, jurisdiccion: 'nacional', autoridad: AUTORIDAD.OFICIAL, frecuenciaDias: 30 }),
  fuente({ id: 'uocra', nombre: 'UOCRA — convenio colectivo y escalas salariales', url: 'https://www.uocra.org/', tipo: TIPO.CONVENIO, jurisdiccion: 'nacional', autoridad: AUTORIDAD.ORGANISMO_TECNICO, frecuenciaDias: 60, notas: 'la escala vigente es la que fija la relación salarial oficial/ayudante del método de cuadrilla' }),
  fuente({ id: 'unsj-circot', nombre: 'CIRCOT-FI-UNSJ — Centro de Investigación para la Racionalización de la Construcción Tradicional', url: 'https://www.unsj.edu.ar/', tipo: TIPO.PAPER, jurisdiccion: 'provincial', autoridad: AUTORIDAD.ORGANISMO_TECNICO, frecuenciaDias: 365, notas: 'los estándares zonales de San Juan salen de acá — es la fuente más cercana a nuestra obra' }),
  fuente({ id: 'sanjuan-gob', nombre: 'Gobierno de San Juan — normativa provincial y municipal', url: 'https://sanjuan.gob.ar/', tipo: TIPO.REGLAMENTO, jurisdiccion: 'provincial', autoridad: AUTORIDAD.OFICIAL, frecuenciaDias: 180 }),

  // ── El paper que ya se leyó entero y se convirtió en código ──
  fuente({
    id: 'navas-2012-cuadrilla',
    nombre: 'Navas R. F., Ridl M. R., Torés L. (2012) — Mano de obra en la construcción: determinación de la cuadrilla óptima',
    url: 'https://www.revista.ingenieria.uady.mx/volumen16/mano.pdf',
    tipo: TIPO.PAPER, jurisdiccion: 'provincial', autoridad: AUTORIDAD.ORGANISMO_TECNICO,
    version: 'Ingeniería FI-UADY 16-2 (2012), pp 151-163, ISSN 1665-529-X',
    vigencia: 'el MÉTODO no caduca; los VALORES del ejemplo (jornada 7,50 h y relación salarial 1,18) sí',
    estado: ESTADO.CURADA,
    notas: 'autores del CIRCOT-FI-UNSJ; se apoya en Vázquez Cabanillas & De La Torre (1983), Fascículo 5 CIRCOT',
  }),

  // ── Internacional · medición y estimación de costos ──
  fuente({ id: 'rics-nrm', nombre: 'RICS — New Rules of Measurement', url: 'https://www.rics.org/profession-standards/rics-standards-and-guidance', tipo: TIPO.MEDICION, jurisdiccion: 'internacional', autoridad: AUTORIDAD.ORGANISMO_TECNICO, frecuenciaDias: 365, notas: 'regla de medición, inclusiones y exclusiones — el vocabulario que le falta a nuestras partidas' }),
  fuente({ id: 'gao-cost', nombre: 'GAO — Cost Estimating and Assessment Guide', url: 'https://www.gao.gov/products/gao-20-195g', tipo: TIPO.COSTOS, jurisdiccion: 'internacional', autoridad: AUTORIDAD.OFICIAL, frecuenciaDias: 730 }),
  fuente({ id: 'nasa-cost', nombre: 'NASA — Cost Estimating Handbook', url: 'https://www.nasa.gov/reference/cost-estimating-handbook/', tipo: TIPO.COSTOS, jurisdiccion: 'internacional', autoridad: AUTORIDAD.OFICIAL, frecuenciaDias: 730 }),
  fuente({ id: 'usace', nombre: 'USACE — Engineering and Construction publications', url: 'https://www.publications.usace.army.mil/', tipo: TIPO.COSTOS, jurisdiccion: 'internacional', autoridad: AUTORIDAD.OFICIAL, frecuenciaDias: 730 }),
  fuente({ id: 'wbdg', nombre: 'WBDG — Whole Building Design Guide', url: 'https://www.wbdg.org/', tipo: TIPO.MEDICION, jurisdiccion: 'internacional', autoridad: AUTORIDAD.ORGANISMO_TECNICO, frecuenciaDias: 365 }),
  fuente({ id: 'buildingsmart', nombre: 'buildingSMART — IFC', url: 'https://www.buildingsmart.org/standards/bsi-standards/industry-foundation-classes/', tipo: TIPO.DATOS, jurisdiccion: 'internacional', autoridad: AUTORIDAD.ORGANISMO_TECNICO, frecuenciaDias: 730 }),
  fuente({ id: 'nist', nombre: 'NIST — Engineering Laboratory', url: 'https://www.nist.gov/el', tipo: TIPO.NORMA, jurisdiccion: 'internacional', autoridad: AUTORIDAD.OFICIAL, frecuenciaDias: 730 }),
])

/** Carga el padrón del disco. Si no existe, arranca con la semilla: el padrón no puede estar vacío
 *  porque entonces la primera búsqueda no tiene con qué comparar autoridad. */
export function cargar({ ruta = RUTA_POR_DEFECTO } = {}) {
  try {
    const d = JSON.parse(fs.readFileSync(ruta, 'utf8'))
    if (Array.isArray(d?.fuentes) && d.fuentes.length) return d.fuentes
  } catch { /* el padrón todavía no existe */ }
  return SEMILLA.map((f) => ({ ...f, aportes: [...f.aportes] }))
}

/** Guarda el padrón. `version` sube en cada escritura: es lo que permite ver qué cambió y volver. */
export function guardar(fuentes, { ruta = RUTA_POR_DEFECTO } = {}) {
  fs.mkdirSync(path.dirname(ruta), { recursive: true })
  const previo = (() => { try { return JSON.parse(fs.readFileSync(ruta, 'utf8')).version ?? 0 } catch { return 0 } })()
  fs.writeFileSync(ruta, `${JSON.stringify({ version: previo + 1, fuentes: [...fuentes].sort((a, b) => a.id.localeCompare(b.id)) }, null, 1)}\n`)
  return previo + 1
}

/** Busca una fuente por id o por dominio. PURA. */
export const buscarFuente = (fuentes, idOdominio) => fuentes.find((f) => f.id === idOdominio || f.dominio === dominioDe(idOdominio) || f.dominio === idOdominio) ?? null

/**
 * DESCUBRIR UNA FUENTE. Si ya está, no la duplica ni la degrada: devuelve la que hay.
 *
 * Una URL que aparece en una búsqueda entra por acá, y entra DESCUBIERTA aunque el dominio sea
 * oficial: la autoridad dice cuánto pesa, el estado dice cuánto la conocemos. Son dos cosas.
 */
export function descubrir(fuentes, { url, nombre = null, tipo = null, jurisdiccion = 'internacional' } = {}) {
  const dom = dominioDe(url)
  if (!dom) return { fuentes, fuente: null, nueva: false, porQue: 'la URL no se puede interpretar' }
  const ya = fuentes.find((f) => f.dominio === dom)
  if (ya) return { fuentes, fuente: ya, nueva: false, porQue: `«${dom}» ya está en el padrón como ${ya.estado}` }
  const nueva = fuente({ id: dom.replace(/[^a-z0-9]+/g, '-'), nombre: nombre || dom, url, tipo, jurisdiccion })
  return { fuentes: [...fuentes, nueva], fuente: nueva, nueva: true, porQue: `«${dom}» no estaba: entra DESCUBIERTA` }
}

/**
 * ANOTAR QUE UNA FUENTE SIRVIÓ (o no) — y mover su estado si corresponde. PURA sobre la lista.
 *
 * Ésta es la única forma de que una fuente suba o baje. No hay promoción manual: si el ascenso se
 * pudiera escribir a mano, el padrón volvería a ser una lista de opiniones.
 */
export function anotarUso(fuentes, id, { sirvio, que = null, cuando = null } = {}) {
  return fuentes.map((f) => {
    if (f.id !== id) return f
    const usos = f.usos + (sirvio ? 1 : 0)
    const fallos = sirvio ? 0 : f.fallos + 1
    const aportes = sirvio && que ? [...f.aportes, { que, cuando }].slice(-20) : f.aportes
    let estado = f.estado
    if (f.estado === ESTADO.REEMPLAZADA) estado = ESTADO.REEMPLAZADA
    else if (fallos >= FALLOS_PARA_DEGRADAR) estado = ESTADO.DEGRADADA
    else if (sirvio && usos >= USOS_PARA_CURAR && f.estado !== ESTADO.CURADA) estado = ESTADO.CURADA
    else if (sirvio && f.estado === ESTADO.DESCUBIERTA) estado = ESTADO.EVALUADA
    else if (sirvio && f.estado === ESTADO.DEGRADADA) estado = ESTADO.EVALUADA
    return { ...f, usos, fallos, aportes, estado, consultada: cuando ?? f.consultada }
  })
}

/** Declarar que una fuente quedó reemplazada por otra versión. La vieja NO se borra: sin ella no se
 *  puede explicar una cotización firmada con el criterio anterior. */
export function reemplazar(fuentes, id, { porId, cuando = null } = {}) {
  return fuentes.map((f) => (f.id === id ? { ...f, estado: ESTADO.REEMPLAZADA, notas: `${f.notas ? `${f.notas} · ` : ''}reemplazada por «${porId}»${cuando ? ` el ${cuando}` : ''}`, revisado: cuando ?? f.revisado } : f))
}

/**
 * DEJAR CONSTANCIA DE QUE MIRAMOS LA FUENTE. PURA sobre la lista.
 *
 * `revisado` es lo único que apaga `vencidas()`, y hasta ahora no lo escribía nadie: la tarea de
 * fondo volvía a proponer las mismas catorce fuentes en cada corrida, para siempre. Revisar NO es
 * lo mismo que usar —`anotarUso` toca `consultada`—: una fuente se puede consultar diez veces sin
 * que nadie haya mirado si sigue vigente, y confundir las dos cosas es cómo un dato viejo pasa por
 * al día.
 *
 * `hash` queda guardado para poder contestar «¿cambió?» la próxima vez sin volver a bajarla entera.
 */
export function revisar(fuentes, id, { cuando, hash = null, vigencia = null, version = null } = {}) {
  if (!cuando) throw new Error('revisar necesita la fecha en que se miró: sin fecha no hay revisión que caduque')
  return fuentes.map((f) => (f.id === id
    ? { ...f, revisado: cuando, hash: hash ?? f.hash, vigencia: vigencia ?? f.vigencia, version: version ?? f.version }
    : f))
}

/** Cuánto pesa una fuente al ordenarla. Menor es mejor. El estado modifica la autoridad, no la
 *  reemplaza: una fuente OFICIAL degradada sigue pesando más que un foro curado. PURA. */
export const AJUSTE_ESTADO = Object.freeze({ CURADA: -0.5, EVALUADA: 0, DESCUBIERTA: 0.25, DEGRADADA: 1.5, REEMPLAZADA: 3 })

/** Ordena fuentes para consultarlas. TOTAL y determinístico: mismo padrón, mismo orden. PURA. */
export function ordenar(fuentes, { jurisdiccion = null, tipo = null } = {}) {
  const puntaje = (f) => f.autoridad + (AJUSTE_ESTADO[f.estado] ?? 0)
     + (jurisdiccion && f.jurisdiccion === jurisdiccion ? -1 : 0)
     + (tipo && f.tipo === tipo ? -0.75 : 0)
  return [...fuentes].sort((a, b) => puntaje(a) - puntaje(b) || a.id.localeCompare(b.id))
}

/** Las fuentes cuya revisión venció. Es lo que consume la tarea de fondo: no bloquea una cotización,
 *  pero deja de ser cierto que «la fuente está al día» sin que nadie lo mire. PURA. */
export function vencidas(fuentes, hoy) {
  const t = new Date(hoy).getTime()
  if (!Number.isFinite(t)) throw new Error('vencidas() necesita una fecha: sin ella no hay vencimiento que calcular')
  return fuentes.filter((f) => {
    if (!f.frecuenciaDias || f.estado === ESTADO.REEMPLAZADA) return false
    if (!f.revisado) return true
    return (t - new Date(f.revisado).getTime()) / 86400000 > f.frecuenciaDias
  })
}
