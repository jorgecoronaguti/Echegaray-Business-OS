// LEER UN PLANO — el único lugar de este circuito donde interviene un modelo.
//
// ═══ POR QUÉ VISIÓN Y NO EXTRACCIÓN DE TEXTO ═══
//
// Medido sobre `Plano de Arquitectura.pdf` de Quattropani: `readPdfText` devuelve 5.974 caracteres
// perfectamente legibles… y absolutamente inútiles. Salen así: «6.08 / 6.00 / 1.92 / Portón
// corredizo / correas C140 / 2C 200 / 1.63 1.63 1.63 1.63». Los números están todos y NINGUNO está
// atado a lo que mide: el texto de un plano vectorial es una nube de etiquetas sin geometría. Una
// cota vale por dónde está dibujada, y esa información no está en el flujo de texto.
//
// Por eso el PDF entra al modelo como `document` —que es la misma puerta que ya usa la lectura de
// comprobantes— y se le pide que MIRE: qué vista es cada dibujo, qué cota pertenece a qué elemento,
// cuántas veces se repite un pórtico, qué dice el rótulo. Y por eso mismo lo que se le pide es
// INTERPRETAR, nunca calcular: las multiplicaciones las hace `computo.mjs`, que es puro.
//
// ═══ LA REGLA QUE HACE QUE ESTO NO INVENTE ═══
//
// Cada dimensión tiene que venir con el TEXTO LITERAL que la sostiene. No «el ancho es 0,30» sino
// «el ancho es 0,30 porque la lámina dice "C1(30-50)"». `validarLamina` es implacable con eso:
// una dimensión sin texto literal no entra como leída del plano, entra degradada — y una dimensión
// que el modelo no encontró NO se completa: sale como `FALTA_DATO` con nombre propio.
//
// ═══ EL CACHÉ ═══
//
// Una lámina se interpreta UNA vez por contenido. La llave es el hash de los bytes, así que un
// plano revisado se reinterpreta solo y uno que no cambió no se vuelve a pagar. El pipeline entero
// —cómputo, partidas, precios, segunda pasada— consume esa interpretación cacheada: reinterpretar
// la misma lámina en cada etapa fue el gasto que este archivo existe para no repetir.

import crypto from 'node:crypto'
import { FUENTE, dato, evidencia } from './fuente.mjs'

/** Cómo se mide un elemento. Determina qué fórmula le aplica `computo.mjs` y qué unidad sale.
 *  No es una lista abierta: si un elemento no encaja en ninguna, se declara y no se computa. */
export const FORMA = Object.freeze({
  PRISMA: 'prisma',          // ancho × alto × largo → m³
  LINEAL: 'lineal',          // largo × cantidad → m
  SUPERFICIE: 'superficie',  // área, o largo × ancho → m²
  CONTEO: 'conteo',          // cantidad → un
})

/** El sistema constructivo al que pertenece el elemento. Gobierna el DESPIECE: una viga de H°A° no
 *  es una partida, son cinco. Un pórtico metálico no es una partida, son tres. */
export const SISTEMA = Object.freeze({
  MOVIMIENTO_SUELO: 'movimiento_suelo',
  HORMIGON_ARMADO: 'hormigon_armado',
  METALICA: 'estructura_metalica',
  MAMPOSTERIA: 'mamposteria',
  CUBIERTA: 'cubierta',
  PISO: 'piso',
  CARPINTERIA: 'carpinteria',
  TERMINACION: 'terminacion',
  INSTALACION: 'instalacion',
  OTRO: 'otro',
})

const FORMAS = new Set(Object.values(FORMA))
const SISTEMAS = new Set(Object.values(SISTEMA))

export const PROMPT = [
  'Sos un ingeniero civil de una constructora de San Juan, Argentina, leyendo un plano de obra para',
  'computarlo. MIRÁ el dibujo: las cotas, los ejes, los cortes, las vistas, el rótulo, las',
  'referencias y las notas. El texto suelto de un PDF de plano no sirve — una cota vale por dónde',
  'está dibujada y a qué elemento toca.',
  '',
  'DEVOLVÉS SÓLO UN JSON, sin markdown, sin explicación, con esta forma exacta:',
  '{',
  '  "proyecto": {"nombre":null,"propietario":null,"ubicacion":null,"destino":null,"superficie_cubierta_m2":null,"notas_generales":[]},',
  '  "lamina": {"codigo":null,"titulo":null,"tipo":null,"escalas":[],"vistas":[]},',
  '  "grilla": {"largo_total_m":null,"ancho_total_m":null,"altura_libre_m":null,',
  '             "luces_entre_ejes_m":[],"texto_literal":null,',
  '             "superficies_declaradas":[{"que":"salón","area_m2":191.92,"texto_literal":"Salon 191.92m²"}]},',
  '  "elementos": [{',
  '    "id":"C1", "nombre":"Columna de hormigón C1", "sistema":"hormigon_armado",',
  '    "forma":"prisma",',
  '    "dimensiones":{"ancho_m":0.30,"alto_m":0.50,"largo_m":3.50,"espesor_m":null,"area_m2":null},',
  '    "repeticion":{"modo":"conteo_directo","cantidad":8,"longitud_tramo_m":null,"separacion_m":null,',
  '                  "incluye_extremos":null,"texto_literal":"se ven 8 símbolos C1 en ESTRUCTURA FUNDACION"},',
  '    "material":"H21", "especificacion":"acero ADN 420, estribos Ø8 c/15",',
  '    "evidencia":{"vista":"ESTRUCTURA FUNDACION","texto_literal":"C1(30-50)","ubicacion":"planilla de columnas"},',
  '    "confianza":"alta", "faltan":[]',
  '  }],',
  '  "referencias_a_otras_laminas":[], "faltan_datos":[]',
  '}',
  '',
  'REGLAS QUE NO SE NEGOCIAN:',
  '1. CADA dimensión que declarás tiene que estar SOSTENIDA por "texto_literal": lo que dice el',
  '   plano, copiado letra por letra («C1(30-50)», «2PC-240-80-25-3.2», «Estr. Ø8c/15cm»). Si no',
  '   podés citar de dónde sacaste una medida, NO la pongas: dejala en null y anotala en "faltan".',
  '2. NO CALCULES NADA. No multipliques, no sumes, no estimes volúmenes ni superficies. Sólo leés',
  '   y contás. Las cuentas las hace el sistema después, y las hace bien.',
  '3. NO INVENTES para no dejar un null. Si el plano no dice el espesor, la longitud, el hormigón o',
  '   la armadura, va null y el motivo va en "faltan". Un null es una pregunta; un número plausible',
  '   se cotiza y se firma.',
  '4. CONTÁ lo que se repite —columnas, pórticos, cerchas, correas— y decí CÓMO lo contaste en',
  '   "repeticion". Cómo se hace eso está en las reglas 9 a 12, que son la parte más importante de',
  '   este trabajo: sin cantidad no hay cómputo, y sin cómputo no hay presupuesto.',
  '5. "forma" es cómo se mide: "prisma" (ancho×alto×largo, da m³), "lineal" (da m), "superficie"',
  '   (da m²), "conteo" (da unidades). Elegí la que corresponde a ESE elemento.',
  '6. "sistema" es uno de: movimiento_suelo, hormigon_armado, estructura_metalica, mamposteria,',
  '   cubierta, piso, carpinteria, terminacion, instalacion, otro.',
  '7. UN ELEMENTO ES UN ELEMENTO CONSTRUCTIVO, no una tarea ni una partida. «Columna C1» sí;',
  '   «hormigón de columnas» no. El despiece en tareas lo hace el sistema después.',
  '8. Si un dato está en OTRA lámina («ver detalle», «s/cálculo», «a verificar»), anotalo en',
  '   "referencias_a_otras_laminas" y dejá el dato en null.',
  '',
  'CÓMO SE RESUELVE UNA CANTIDAD — «no se puede contar» casi nunca es cierto:',
  '9. Un plano de obra no tabula «hay 12 correas»: lo dice con la GRILLA. Una cadena de cotas',
  '   repetidas («1.63 1.63 1.63 1.63 1.63 1.63») es una separación; un largo total («18.30») y una',
  '   separación dan la cantidad. Por eso "repeticion" tiene tres modos y elegís UNO:',
  '     · "conteo_directo"  → contaste los símbolos en el dibujo. Poné "cantidad".',
  '     · "por_separacion"  → poné "longitud_tramo_m", "separacion_m" e "incluye_extremos".',
  '                            NO dividas vos: la división la hace el sistema.',
  '     · "por_ejes"        → poné "cantidad" = cuántos ejes/pórticos lo llevan, citando los ejes.',
  '   Si de verdad no hay ninguna de las tres, poné "modo":"indeterminable" y decí por qué.',
  '10. LA LONGITUD DE UN ELEMENTO LINEAL sale de la geometría del edificio: una correa corre el',
  '    largo de la nave, una viga cubre la luz entre ejes, una columna mide la altura del nivel',
  '    («H=3.50m», «+7.50»). Poné ese número en "largo_m" y citá en "texto_literal" la cota de la',
  '    que lo tomaste. Si no hay ninguna cota que lo sostenga, va null.',
  '11. LA SUPERFICIE de un elemento que cubre toda la planta sale del balance de superficies del',
  '    rótulo («SUPERFICIE CUBIERTA a construir: 258.77m²», «Salon 191.92m²»). Usala y citala.',
  '    Cargá todas las que veas en "grilla.superficies_declaradas".',
  '12. Las reglas 9, 10 y 11 NO son permiso para estimar. Son la instrucción de buscar el dato',
  '    donde el plano lo pone de verdad. Si no está, sigue valiendo null con su motivo.',
].join('\n')

const num = (v) => {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

/** El JSON que devuelve el modelo, sin la envoltura de markdown que a veces le pone. */
export function extraerJson(texto) {
  const s = String(texto ?? '').trim()
  const sinCerca = s.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim()
  const a = sinCerca.indexOf('{')
  const b = sinCerca.lastIndexOf('}')
  if (a < 0 || b <= a) return null
  try { return JSON.parse(sinCerca.slice(a, b + 1)) } catch { return null }
}

const CLAVES_DIM = Object.freeze([['ancho_m', 'ancho'], ['alto_m', 'alto'], ['largo_m', 'largo'], ['espesor_m', 'espesor'], ['area_m2', 'area']])

/** Las dimensiones de un elemento, cada una con su procedencia. Las que el modelo no trajo salen
 *  como `FALTA_DATO` explícito y no como ausencia — un campo que no está se lee como cero. */
function dimensionesDe(crudo, ev) {
  const out = {}
  for (const [clave, nombre] of CLAVES_DIM) {
    const v = num(crudo?.dimensiones?.[clave])
    out[nombre] = v === null
      ? null
      : dato({ valor: v, unidad: clave.endsWith('m2') ? 'm2' : 'm', fuente: FUENTE.EXTRAIDO_PLANO, evidencia: ev })
  }
  return out
}

/** Los tres modos en que un plano dice CUÁNTOS hay. `indeterminable` es una respuesta válida y no
 *  un error: hay elementos que este plano no permite contar, y decirlo es el trabajo bien hecho. */
export const MODO = Object.freeze({
  CONTEO: 'conteo_directo', SEPARACION: 'por_separacion', EJES: 'por_ejes', INDETERMINABLE: 'indeterminable',
})

/**
 * LA REPETICIÓN DECLARADA, NORMALIZADA. Acá NO se divide nada: si el modelo declaró una separación,
 * los números viajan crudos y la división la hace `computo.mjs`. Es la misma frontera de siempre —
 * el modelo dice «cada 1,63 m sobre 18,30 m», el código dice «12».
 *
 * Retrocompatible con el primer contrato, que sólo tenía `cantidad`: una cantidad suelta es un
 * conteo directo. Sin eso, una interpretación cacheada con el contrato viejo se leería como si el
 * modelo no hubiera contado nada.
 */
export function repeticionDe(crudo, ev) {
  const r = crudo?.repeticion ?? null
  const sueltoModo = num(crudo?.cantidad) === null ? null : MODO.CONTEO
  const modo = [MODO.CONTEO, MODO.SEPARACION, MODO.EJES].includes(r?.modo) ? r.modo : sueltoModo
  return {
    modo: modo ?? MODO.INDETERMINABLE,
    cantidad: num(r?.cantidad) ?? num(crudo?.cantidad),
    longitudTramo: num(r?.longitud_tramo_m),
    separacion: num(r?.separacion_m),
    incluyeExtremos: r?.incluye_extremos === null || r?.incluye_extremos === undefined ? true : Boolean(r.incluye_extremos),
    textoLiteral: r?.texto_literal ? String(r.texto_literal).slice(0, 300) : null,
    evidencia: ev,
  }
}

/**
 * UN ELEMENTO VALIDADO, o `null` si no se puede sostener.
 *
 * Se descarta lo que no tiene id ni nombre —no se puede citar ni computar— y lo que trae una
 * `forma` o un `sistema` que el motor no conoce: aceptar un valor inventado por el modelo haría
 * que el cómputo eligiera una fórmula equivocada en silencio, que es peor que no computar.
 */
export function validarElemento(crudo, { archivo, archivoId, lamina } = {}) {
  const id = String(crudo?.id ?? crudo?.nombre ?? '').trim()
  if (!id) return null
  const forma = FORMAS.has(crudo?.forma) ? crudo.forma : null
  const sistema = SISTEMAS.has(crudo?.sistema) ? crudo.sistema : SISTEMA.OTRO
  const ev = evidencia({
    archivo, archivoId, lamina,
    vista: crudo?.evidencia?.vista ?? null,
    textoLiteral: crudo?.evidencia?.texto_literal ?? null,
    ubicacion: crudo?.evidencia?.ubicacion ?? null,
  })
  return {
    id,
    nombre: String(crudo?.nombre ?? id),
    sistema,
    forma,
    lamina,
    archivo,
    archivoId,
    repeticion: repeticionDe(crudo, ev),
    dimensiones: dimensionesDe(crudo, ev),
    material: crudo?.material ? dato({ valor: String(crudo.material), fuente: FUENTE.EXTRAIDO_PLANO, evidencia: ev }) : null,
    especificacion: crudo?.especificacion ? String(crudo.especificacion) : null,
    evidencia: ev,
    confianza: ['alta', 'media', 'baja'].includes(crudo?.confianza) ? crudo.confianza : 'baja',
    faltan: Array.isArray(crudo?.faltan) ? crudo.faltan.map(String) : [],
    // Sin forma no hay fórmula: el elemento queda detectado y declarado, pero no computable.
    computable: Boolean(forma) && Boolean(ev),
    porQueNoComputable: forma ? (ev ? null : 'sin texto literal que sostenga las medidas') : 'el plano no permite decidir cómo se mide',
  }
}

/** La lámina entera, validada. Lo que no valida no se pierde: se cuenta en `descartados`. */
export function validarLamina(crudo, { archivo, archivoId } = {}) {
  const lamina = String(crudo?.lamina?.codigo ?? crudo?.lamina?.titulo ?? archivo ?? 's/n')
  const elementos = []
  let descartados = 0
  for (const e of Array.isArray(crudo?.elementos) ? crudo.elementos : []) {
    const v = validarElemento(e, { archivo, archivoId, lamina })
    if (v) elementos.push(v); else descartados += 1
  }
  return {
    archivo, archivoId,
    proyecto: crudo?.proyecto ?? {},
    lamina: { codigo: lamina, titulo: crudo?.lamina?.titulo ?? null, tipo: crudo?.lamina?.tipo ?? null, escalas: crudo?.lamina?.escalas ?? [], vistas: crudo?.lamina?.vistas ?? [] },
    elementos,
    descartados,
    referencias: Array.isArray(crudo?.referencias_a_otras_laminas) ? crudo.referencias_a_otras_laminas.map(String) : [],
    faltanDatos: Array.isArray(crudo?.faltan_datos) ? crudo.faltan_datos.map(String) : [],
  }
}

/** La llave de caché de una lámina: el CONTENIDO, no el nombre ni el id de Drive. Un plano
 *  revisado cambia de bytes y se reinterpreta solo; uno renombrado no se vuelve a pagar. */
export const llaveDeCache = (bytes, version = 'v2') => `${version}:${crypto.createHash('sha256').update(bytes).digest('hex').slice(0, 32)}`
