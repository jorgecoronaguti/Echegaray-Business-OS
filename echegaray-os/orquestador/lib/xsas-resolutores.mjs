// LO QUE XSAS RESUELVE SIN MODELO — el registro de capacidades determinísticas del gateway.
//
// ═══ DE DÓNDE SALE CADA COSA (nada de esto se inventó acá) ═══
//
//   · las TOOLS son las que ya existen en `lib/tools/`, con su `capability` y su `input_schema`;
//   · las FRASES del atajo son literales de la propia `description` de la tool que atienden
//     («USALO cuando el dueño pregunte "¿cómo venimos?"»), no de mi criterio — el mismo método con
//     el que `elegir-capacidad.mjs` sacó sus keywords de las `description` de las skills;
//   · el vínculo SKILL → TOOL se DERIVA: el catálogo ya publica, por skill, los módulos del OS que
//     la skill cita y que existen (`ficha.modulos`). Si uno de esos módulos es un archivo de
//     `lib/tools/`, sus tools son las de esa skill. No hay una tabla escrita a mano que se pueda
//     quedar vieja: si la skill deja de citar el módulo, el vínculo desaparece solo.
//
// ═══ POR QUÉ IMPORTA EL ORDEN ═══
//
// Lookup EXACTO antes que semántico. Una intención pedida por su nombre (un botón, un timer) es un
// `Map.get`; una frase que ya sabemos qué significa no puede costar una clasificación. Recorrer las
// 44 skills —o preguntarle a un modelo— para descubrir que «cómo venimos» es el estado de la
// empresa sería pagar por lo que un índice ya sabe.
//
// ═══ POR QUÉ EL NÚCLEO ES 0-API Y GOOGLE ES OPCIONAL ═══
//
// Las tools del núcleo leen Postgres y calculan. Las que necesitan Google (Sheets, Drive) se cargan
// SÓLO si el adapter inyecta un cliente. Así el gateway contesta con Workspace caído y sin
// credenciales —que es justo el escenario en el que hace falta que conteste— y gana las de Google
// cuando están, sin dos registros distintos.

/** Fábricas sin dependencias externas: Postgres y cálculo. */
const FABRICAS_0API = Object.freeze([
  ['./tools/os-data.mjs', 'osDataTools'],
  ['./tools/obra.mjs', 'obraTools'],
  ['./tools/rendimiento.mjs', 'rendimientoTools'],
  ['./tools/legajos-tool.mjs', 'legajosTools'],
  ['./tools/indices-tool.mjs', 'indicesTools'],
  ['./tools/biblioteca-area-tool.mjs', 'bibliotecaAreaTools'],
  ['./tools/cotizaciones-tool.mjs', 'cotizacionesTools'],
  // Ésta RECIBE un cliente de Google pero no lo exige: sin él resuelve la posición de caja como
  // «sin dato» y sigue dando el resto del cuadro. Por eso vive del lado 0-API — «¿cómo venimos?» es
  // la pregunta que menos puede depender de que Workspace conteste.
  ['./tools/estado-empresa-tool.mjs', 'estadoEmpresaTools'],
  // Internet NO necesita Google: `web-search` habla con su propio proveedor y `web_leer`/`web_navegar`
  // bajan la página. Entra del lado 0-API porque su dependencia es la red, no Workspace, y porque
  // lo que devuelve ya sale marcado como REFERENCIA_EXTERNA por `web/contenido-externo.mjs`.
  ['./tools/web.mjs', 'webSearchTools'],
  // Vencimientos de caja: Postgres puro, sin Workspace. Entra al núcleo 0-API por la misma razón
  // que el briefing entra al de Google: la capacidad existía y el gateway no la conocía.
  ['./tools/caja-vencido-tool.mjs', 'cajaVencidoTools'],
  // ═══ LAS QUE EXISTÍAN Y LA PUERTA NO CONOCÍA (01/09/2026) ═══
  //
  // Medido: 48 fábricas de tools en `lib/tools/` y 15 registradas acá. Las otras 33 estaban escritas,
  // probadas y en producción por otras caras —el bot, los scripts— y para XSAS no existían: un
  // «buscá los comprobantes de X» o «qué certificamos» caía al modelo teniendo la tool al lado. No es
  // capacidad nueva, es una desconexión. Lo que escribe afuera sigue cerrado por `puedeUsar` y por
  // `TOOLS_AUTORIZADAS_A_ESCRIBIR`: estar en el registro no autoriza nada.
  ['./tools/compras-tool.mjs', 'comprasTools'],
  ['./tools/certificaciones-tool.mjs', 'certificacionesTools'],
  ['./tools/adicionales-tool.mjs', 'adicionalesTools'],
  ['./tools/obligaciones-tool.mjs', 'obligacionesTools'],
  ['./tools/control-administrativo-tool.mjs', 'controlAdministrativoTools'],
  ['./tools/no-conformidades-tool.mjs', 'noConformidadesTools'],
  ['./tools/cotizaciones-historial-tool.mjs', 'cotizacionesHistorialTools'],
  ['./tools/operating-review-tool.mjs', 'operatingReviewTools'],
  ['./tools/rodados-tool.mjs', 'rodadosTools'],
  ['./tools/cuit-tool.mjs', 'cuitTools'],
  ['./tools/learn.mjs', 'learnTools'],
])

/** Fábricas que reciben un cliente de Google. Sin cliente NO se cargan: una tool que va a fallar
 *  igual no tiene por qué figurar como disponible. */
const FABRICAS_GOOGLE = Object.freeze([
  ['./tools/ingenieria-financiera-tool.mjs', 'ingenieriaFinancieraTools'],
  ['./tools/tesoreria-tool.mjs', 'tesoreriaTools'],
  // Slides. `crear_presentacion_google_slides` es de ESCRITURA (`drive.write`): sin esa capability
  // en el pedido, `puedeUsar` la rechaza antes de correrla. Sin cliente de Google no se registra.
  ['./tools/presentacion-tool.mjs', 'presentacionTools'],
  // Imágenes. `generar_imagen` deja el archivo en el Drive del dueño y puede publicarlo por link,
  // así que es `drive.write` y se encola igual que la presentación. Sin cliente de Google el motor
  // sabe devolver el base64, pero la tool no se registra: una capacidad que no puede persistir lo
  // que produce figuraría disponible y dejaría la imagen en ningún lado.
  ['./tools/imagen-tool.mjs', 'imagenTools'],
  // Planos. LEE de Drive y ESCRIBE una cotización borrador en Postgres, así que es `os.write` y
  // pasa por las dos cerraduras y por la firma — declararla `drive.read` fue el defecto que encontró
  // la auditoría del 27/08. Necesita el cliente de Google para bajar los PDF de las láminas: sin él
  // la capacidad existiría y no podría abrir un solo plano.
  ['./tools/plano-tool.mjs', 'planoTools'],
  // ═══ LA CAJA — LA PREGUNTA MÁS COMÚN DE LA CASA, QUE NO ESTABA EN EL REGISTRO ═══
  //
  // «¿cuánta plata hay en caja hoy?» ruteaba perfecto a `finanzas-tesoreria-construccion`, con
  // resolución determinista y confianza alta, y terminaba en el modelo pidiéndole al DUEÑO los
  // saldos por cuenta. El motivo no era el ruteo: era que el briefing determinístico —el que saca
  // el número de columnas estructuradas, sin modelo— no estaba registrado acá. La capacidad
  // existía, el gateway no la conocía.
  ['./tools/briefing-caja-tool.mjs', 'briefingCajaTools'],
  // ═══ DRIVE, WORKSPACE Y EL SHEET — el resto de la desconexión ═══
  //
  // `drive.list/read/navigate/obras` y `gmail.search` son LECTURA y ya estaban escritas. Sin ellas,
  // «buscá el contrato de X» no tenía a dónde ir. Las de escritura entran al registro pero siguen
  // necesitando la firma: `autorizadaAEscribir` las rechaza mientras no estén en la lista del dueño.
  ['./tools/drive.mjs', 'driveReadTools'],
  ['./tools/drive-write.mjs', 'driveWriteTools'],
  ['./tools/workspace.mjs', 'workspaceTools', 'objeto'],
  ['./tools/appsheet-pedidos.mjs', 'appsheetPedidosTools', 'objeto'],
  ['./tools/jornales-tool.mjs', 'jornalesTools'],
  ['./tools/cargas-sociales-tool.mjs', 'cargasSocialesTools'],
  ['./tools/nomina-sync-tool.mjs', 'nominaSyncTools'],
  ['./tools/egresos-tool.mjs', 'egresosTools'],
  ['./tools/pyl-tool.mjs', 'pylTools'],
  ['./tools/reclamo-cobranza-tool.mjs', 'reclamoCobranzaTools'],
  ['./tools/alias-pendientes-tool.mjs', 'aliasPendientesTools'],
  ['./tools/auditar-pestana-tool.mjs', 'auditarPestanaTools'],
  ['./tools/deshacer-sheet-tool.mjs', 'deshacerSheetTools'],
  ['./tools/gasto-sheet.mjs', 'gastoSheetTools'],
  ['./tools/operaciones-sheet-tool.mjs', 'operacionesSheetTools'],
  ['./tools/sheet-render.mjs', 'sheetRenderTools'],
  ['./tools/sheets-format.mjs', 'sheetsFormatTools'],
  ['./tools/sheet-dropdowns.mjs', 'sheetDropdownTools'],
  ['./tools/docs-format.mjs', 'docsFormatTools'],
  ['./tools/slides-pdf-tool.mjs', 'slidesPdfTools'],
])

/** `./tools/x.mjs` → `orquestador/lib/tools/x.mjs`, que es como el catálogo nombra los módulos. */
const comoLoNombraElCatalogo = (ruta) => ruta.replace(/^\.\//, 'orquestador/lib/')

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { autorizadaAEscribir, escribeAfuera } from './xsas-permisos.mjs'

let _cache = null

/**
 * EL REGISTRO DE TOOLS DEL GATEWAY. Se carga una vez por proceso (por combinación con/sin Google).
 * Una fábrica que no se puede importar NO tumba las demás: se anota en `fallaron` y el gateway
 * sigue con lo que sí cargó — degradar es perder una capacidad, no perder el sistema.
 *
 * @returns {Promise<{mapa:Map<string,object>, porArchivo:Map<string,string[]>, fallaron:string[]}>}
 */
export async function toolsDelNucleo({ google = null, refrescar = false } = {}) {
  const llave = google ? 'con-google' : 'solo-os'
  if (_cache?.llave === llave && !refrescar) return _cache.valor
  const mapa = new Map()
  const porArchivo = new Map()
  const fallaron = []
  /** Las que escriben afuera y todavía no tienen la firma del dueño. Se declaran, no se ocultan. */
  const sinFirma = []
  const fabricas = google ? [...FABRICAS_0API, ...FABRICAS_GOOGLE] : FABRICAS_0API
  for (const [ruta, nombre, forma] of fabricas) {
    try {
      const mod = await import(ruta)
      const claves = []
      // Dos fábricas reciben `{ google }` en vez del cliente pelado. Pasarles el cliente
      // positional no falla: DESTRUCTURA `undefined` y devuelve tools sin Google, que fallarían
      // recién al correrse. Un registro que miente en silencio es peor que una fábrica que no carga.
      const arg = forma === 'objeto' ? { google } : google
      for (const [clave, tool] of Object.entries(mod[nombre](arg))) {
        // ═══ SIN FIRMA NO ENTRA AL REGISTRO (01/09/2026) ═══
        //
        // Registrar las fábricas que faltaban dejó alcanzables ~40 tools de ESCRITURA que el dueño
        // todavía no firmó en `TOOLS_AUTORIZADAS_A_ESCRIBIR`. `puedeUsar` las habría frenado igual al
        // correrlas, pero figurarían como disponibles: XSAS ofrecería escribir en el Sheet o mandar
        // un mail que después no puede hacer. Una capacidad que se ofrece y no se puede ejecutar es
        // peor que una que no aparece. No se pierden: quedan listadas en `sinFirma`, que es la cola
        // exacta de lo que el dueño tiene que autorizar.
        if (escribeAfuera(tool?.capability) && !autorizadaAEscribir(clave)) {
          sinFirma.push(clave)
          continue
        }
        mapa.set(clave, tool)
        claves.push(clave)
      }
      porArchivo.set(comoLoNombraElCatalogo(ruta), claves)
    } catch (e) {
      fallaron.push(`${ruta}: ${String(e?.message ?? e).slice(0, 80)}`)
    }
  }
  _cache = { llave, valor: { mapa, porArchivo, porLib: libsDeLasTools(porArchivo, mapa), fallaron, sinFirma } }
  return _cache.valor
}

/**
 * El techo de importadores a partir del cual una lib deja de identificar una capacidad.
 *
 * Bajó de 4 a 3 (27/08/2026, auditoría): el comentario de abajo decía que `db.mjs` la importaban
 * cinco archivos de tools y el corte la dejaba afuera. Son TRES, así que el corte no disparaba y
 * `db.mjs` —la conexión a Postgres, que no identifica nada— resolvía a siete tools. Ninguna skill la
 * cita hoy, así que era latente; una sola línea en un markdown la habría activado.
 */
export const TOOLS_QUE_VUELVEN_INFRA_A_UNA_LIB = 3

/**
 * QUÉ LIB RESUELVE CADA TOOL — el grafo de imports, leído del disco.
 *
 * ═══ POR QUÉ HIZO FALTA (27/08/2026) ═══
 *
 * El vínculo skill → tool se derivaba SÓLO de que la skill citara el archivo `lib/tools/x.mjs`. Y
 * las skills no citan wrappers: citan el motor. `finanzas-tesoreria-construccion` —la skill de la
 * pregunta más común de la casa— cita `lib/cash-briefing.mjs` y `lib/caja-alertas.mjs`, que son
 * exactamente los motores que `briefing-caja-tool.mjs` y `caja-vencido-tool.mjs` envuelven. El
 * resultado medido: la skill correcta, elegida con confianza alta, con CERO tools ejecutables, y la
 * pregunta terminando en el modelo.
 *
 * Registrar las dos tools no alcanzaba: sin este grafo el vínculo seguía sin existir. Y pedirle a
 * cada skill que cite el wrapper además del motor sería una lista escrita a mano que envejece —
 * justo lo que el resto de este archivo evita.
 *
 * ═══ POR QUÉ UNA LIB MUY IMPORTADA NO CUENTA ═══
 *
 * `db.mjs` la importan tres archivos de tools. Una lib así no identifica una capacidad: es
 * infraestructura, y ligarla a una skill le daría a esa skill media docena de tools que no tienen
 * nada que ver. El corte no es una lista de excepciones —que habría que mantener— sino una
 * propiedad medible del grafo: lo que muchos usan, no distingue a ninguno.
 *
 * ═══ Y UNA TOOL DE ESCRITURA NUNCA SE DERIVA (27/08/2026, auditoría) ═══
 *
 * Un umbral atrapa la lib que usan muchos; no puede atrapar una lib genérica que usa una sola tool.
 * Mientras eso sólo agrega capacidades de LECTURA, el costo de equivocarse es que el gateway
 * considere una tool de más y la afinidad la descarte. Con una de ESCRITURA el costo es otro: una
 * cita en un markdown alcanzaría para que una skill pudiera escribir. El vínculo con una capacidad
 * que escribe se declara citando su archivo, no se deduce.
 */
export function libsDeLasTools(porArchivo, mapa = null) {
  const porLib = new Map()
  const raiz = path.dirname(fileURLToPath(import.meta.url))
  for (const archivo of porArchivo.keys()) {
    let fuente
    try { fuente = fs.readFileSync(path.join(raiz, '..', '..', archivo), 'utf8') } catch { continue }
    for (const m of fuente.matchAll(/^import[^\n]*?from\s+['"]\.\.\/([^'"]+)['"]/gm)) {
      const lib = `orquestador/lib/${m[1]}`
      if (!porLib.has(lib)) porLib.set(lib, new Set())
      porLib.get(lib).add(archivo)
    }
  }
  const salida = new Map()
  for (const [lib, archivos] of porLib) {
    if (archivos.size >= TOOLS_QUE_VUELVEN_INFRA_A_UNA_LIB) continue
    const claves = [...new Set([...archivos].flatMap((a) => porArchivo.get(a) ?? []))]
      .filter((clave) => !escribeAfuera(mapa?.get(clave)?.capability))
    if (claves.length) salida.set(lib, claves)
  }
  return salida
}

/** Tira el caché. Lo usan los tests que inyectan tools de mentira. */
export function invalidarTools() { _cache = null }

/**
 * ATAJOS EXACTOS. Frase normalizada → tool. Si mañana la tool cambia de nombre, el atajo queda
 * huérfano y el test que cruza atajos contra el registro se pone rojo.
 */
export const ATAJOS = Object.freeze({
  'como venimos': 'os.estado_empresa',
  'como estamos': 'os.estado_empresa',
  'como estamos como empresa': 'os.estado_empresa',
  'dame el panorama': 'os.estado_empresa',
  'como viene el negocio': 'os.estado_empresa',
  'cual es hoy mi mayor problema': 'os.estado_empresa',
  'estado de la empresa': 'os.estado_empresa',
  'donde se va la plata': 'os.costos_obras',
  'donde va la plata': 'os.costos_obras',
  'como venimos por obra': 'os.costos_obras',
  'ranking de costos por obra': 'os.costos_obras',
  'costos por obra': 'os.costos_obras',
  // ═══ LAS PREGUNTAS DE PLATA QUE CAÍAN AL MODELO TENIENDO LA TOOL AL LADO (01/09/2026) ═══
  //
  // Medido contra la puerta viva: «qué vence esta semana» escaló a un modelo, que contestó pidiendo
  // que le aclararan la pregunta — teniendo `caja.vencido` registrada y andando. No es una pregunta
  // ambigua para esta casa: vencimiento es plata a pagar.
  'que vence esta semana': 'caja.vencido',
  'que vence': 'caja.vencido',
  'que tenemos que pagar': 'caja.vencido',
  'que hay que pagar': 'caja.vencido',
  'vencimientos': 'caja.vencido',
  // La caja NO entra acá: `briefing.caja` necesita el cliente de Google y un atajo a una tool que
  // puede no estar registrada es un atajo huérfano. Esa pregunta ya rutea sola por su skill.
  'quien nos debe': 'os.cobranzas',
  'que nos deben': 'os.cobranzas',
  'cobranzas': 'os.cobranzas',
})

/**
 * LOS MISMOS ATAJOS, CUANDO LA PANTALLA YA DIJO EN QUÉ OBRA ESTÁ.
 *
 * «¿Cómo venimos?» parado en una obra no pregunta por la empresa: pregunta por ESA obra. Hasta el
 * 27/08/2026 la frase caía siempre en `os.estado_empresa`, así que la app mandaba el `obra_id`
 * verificado, el gateway lo recibía… y contestaba exactamente lo mismo que sin contexto. El contexto
 * llegaba y no cambiaba nada, que para el que mira la pantalla es indistinguible de que no llegara.
 *
 * Sólo están acá las frases que CAMBIAN de significado dentro de una obra. «¿Cómo viene el negocio?»
 * sigue siendo de la empresa aunque se pregunte parado en una obra, y por eso no figura.
 */
export const ATAJOS_EN_OBRA = Object.freeze({
  'como venimos': 'os.salud_obra',
  'como estamos': 'os.salud_obra',
  'dame el panorama': 'os.salud_obra',
  'como viene la obra': 'os.salud_obra',
  'como va la obra': 'os.salud_obra',
  'estado de la obra': 'os.salud_obra',
})

/** Sin tildes, sin signos, sin espacios de más. Lo mínimo para que «¿Cómo venimos?» y «como
 *  venimos» sean la misma llave. No hay stemming: un atajo es exacto o no es. */
export function normalizarFrase(t) {
  return String(t ?? '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[¿?¡!.,;:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** El atajo exacto para un texto, o null. PURA y O(1). */
export function atajoPara(texto, atajos = ATAJOS) {
  return atajos[normalizarFrase(texto)] ?? null
}

/**
 * ARMA LOS ARGUMENTOS DE UNA TOOL con el contexto YA AUTORIZADO del pedido.
 *
 * Sólo se llenan propiedades que la tool declara en su `input_schema`: el contexto de una pantalla
 * no puede inyectar un parámetro que la tool no pidió. Si falta un `required`, devuelve `falta` y
 * el gateway NO ejecuta — decir qué dato falta es mejor que correr con un hueco.
 *
 * @returns {{args:object, falta:string[]}}
 */
export function argumentosPara(tool, { contexto = {}, entidad = {}, verificadoPor = null } = {}) {
  const props = tool?.schema?.input_schema?.properties ?? {}
  const requeridos = tool?.schema?.input_schema?.required ?? []
  const args = {}
  // ═══ UN CONTEXTO SIN FIRMA NO LLENA NINGÚN ARGUMENTO (27/08/2026, auditoría round 3) ═══
  //
  // `contexto` era la PRIMERA fuente para llenar argumentos, y venía del caller. Se cerró primero
  // filtrando las claves que nombran una entidad —`obra`, `cliente`, `proveedor`…—, y el auditor
  // cruzó esa lista contra los `input_schema` de las 37 tools: quedaban 40 parámetros que el caller
  // seguía pudiendo imponer, entre ellos `sheet` (a qué planilla mira tesorería), `carpeta_id` (a qué
  // carpeta de Drive escribe), `url` (a qué página sale el OS), `notas`, `estado`.
  //
  // Enumerar claves peligrosas es la quinta lista de esta familia y falla por lo mismo. El corte
  // correcto es el otro: si nadie firmó el contexto, no llena NADA. Un pedido sin firma sigue
  // pudiendo correr una tool —el argumento se saca de la frase, que es lo que deja la decisión a la
  // vista— y `entidad` sólo existe cuando ya está verificada.
  const fuente = verificadoPor ? contexto : {}
  for (const prop of Object.keys(props)) {
    const v = fuente[prop] ?? entidad[prop] ?? entidad[`${prop}_id`]
    if (v != null && v !== '') args[prop] = v
  }
  return { args, falta: requeridos.filter((r) => args[r] == null) }
}

/**
 * ¿ESTE ACTOR PUEDE CORRER ESTA TOOL? Falla cerrado en cada paso.
 *
 * Dos cerraduras, y una capability de ESCRITURA tiene que pasar las dos:
 *   · el actor tiene la capability (la llena el adapter desde el rol real, no el que pide);
 *   · y, si esa capability escribe afuera, la tool está NOMBRADA en la lista de autorizadas.
 *
 * Sin `clave` no se puede verificar la segunda, así que una tool de escritura sin clave no corre:
 * un control que no puede mirar no dice «está bien», dice que no pudo mirar.
 */
export function puedeUsar(actor, tool, clave = null) {
  const cap = tool?.capability
  if (!cap) return false
  if (!Array.isArray(actor?.permisos) || !actor.permisos.includes(cap)) return false
  if (escribeAfuera(cap)) return autorizadaAEscribir(clave)
  return true
}

/** Las tools de una skill, DERIVADAS de los módulos que la skill cita y que existen. PURA. */
/** Palabras que no distinguen nada: aparecen en toda frase y en toda descripción. */
const VACIAS = new Set(['el','la','los','las','un','una','de','del','al','a','en','y','o','que','qué','se','es','son','para','por','con','sin','me','mi','le','lo','su','sus','hay','tengo','tenemos','esta','este','cuanto','cuanta','cuantos','cuantas','cual','cuales','dame','decime','mostrame','quiero','saber','ver'])

/** Las palabras con contenido de una frase. PURA. */
export function palabrasDe(texto) {
  return [...new Set(normalizarFrase(texto).split(' ').filter((w) => w.length > 2 && !VACIAS.has(w)))]
}

/**
 * CUÁNTO SE PARECE UNA TOOL A LO QUE SE PIDIÓ — determinístico, sin modelo.
 *
 * ═══ POR QUÉ NO ALCANZA EL ORDEN EN QUE LA SKILL CITA SUS MÓDULOS ═══
 *
 * Una skill de finanzas resuelve hoy a tres capacidades: el briefing de caja, los vencimientos sin
 * conciliar y el estado de la empresa. Las tres son legítimas y contestan preguntas DISTINTAS.
 * Tomar la primera que la ficha nombra hace que «¿cuánta plata hay en caja?» dependa del orden en
 * que alguien escribió una lista en un markdown — y ese orden no significa nada.
 *
 * Se puntúa contra la `description` de cada tool, que es donde ya está escrito para qué sirve y con
 * qué frases se pide (las mismas de las que salieron los atajos). Cero tokens, cero red, y el
 * resultado no cambia entre corridas: dos veces la misma frase dan el mismo orden.
 * PURA.
 */
export const PESO = Object.freeze({ CABEZA: 3, DISPARADOR: 2, CUERPO: 1 })

/** Las frases entrecomilladas de una `description` — el «USALO cuando el dueño pregunte "…"». */
export function disparadoresDe(descripcion) {
  return [...String(descripcion ?? '').matchAll(/[«"“']([^«"”']{4,80})[»"”']/g)].map((m) => m[1]).join(' · ')
}

export function afinidad(texto, tool) {
  const nombre = tool?.schema?.name ?? ''
  const desc = String(tool?.schema?.description ?? '')
  // La CABEZA es la primera oración: dice QUÉ DEVUELVE la tool, que es lo que hay que comparar
  // contra lo que se pidió. El resto explica cómo y con qué salvedades.
  const cabeza = normalizarFrase(`${nombre} ${desc.split(/(?<=\.)\s/)[0] ?? ''}`)
  const disparadores = normalizarFrase(disparadoresDe(desc))
  const cuerpo = normalizarFrase(desc)
  // Cuántas veces aparece la palabra, hasta 3. Que la cabeza diga «caja» dos veces —el nombre del
  // briefing y «saldo de caja hoy»— la distingue de otra tool que la nombra una sola vez de paso.
  const veces = (donde, w) => Math.min(3, donde.split(w).length - 1)
  let puntos = 0
  for (const w of palabrasDe(texto)) {
    if (cabeza.includes(w)) puntos += PESO.CABEZA * veces(cabeza, w)
    else if (disparadores.includes(w)) puntos += PESO.DISPARADOR
    else if (cuerpo.includes(w)) puntos += PESO.CUERPO
  }
  return puntos
}

/** Ordena candidatas por afinidad, estable: con el mismo puntaje se respeta el orden de entrada. */
export function ordenarPorAfinidad(texto, candidatas, dameTool = (c) => c) {
  return candidatas
    .map((c, i) => ({ c, i, p: afinidad(texto, dameTool(c)) }))
    .sort((a, b) => (b.p - a.p) || (a.i - b.i))
    .map((x) => x.c)
}

export function toolsDeSkill(ficha, porArchivo, porLib = null) {
  const out = []
  for (const m of ficha?.modulos ?? []) {
    // El wrapper citado directo gana el orden: es el vínculo más explícito que puede declarar una
    // skill. La lib entra después, para las skills que citan el motor y no su envoltorio.
    for (const t of porArchivo.get(m) ?? []) out.push(t)
    for (const t of porLib?.get(m) ?? []) out.push(t)
  }
  return [...new Set(out)]
}
