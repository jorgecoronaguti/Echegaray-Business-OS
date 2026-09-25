import { fonetica, tokenizar } from './voz-parte.mjs'

// FIXTURES DEL DICTADO DE PARTE — textos ESCRITOS, con nombres y tareas INVENTADOS (ninguna persona
// real). Los usan `voz-parte.test.mjs` (qué debe salir) y `scripts/voz-parte-evaluar.mjs` (el
// acierto por campo). Cada caso declara lo esperado con la forma más chica que lo prueba.

export const CONTEXTO = Object.freeze({
  obra: { nombre: 'ME - Playón de Azufre', codigo: 'OB-0099', jornada_horas: 8 },
  personas: [
    { id: 'p-arguello', nombre_completo: 'ARGÜELLO CRISTIAN DAMIAN', nombre_para_mostrar: 'Cristian Argüello' },
    { id: 'p-mansilla', nombre_completo: 'MANSILLA BRITOS EMILIO', nombre_para_mostrar: 'Emilio Mansilla' },
    { id: 'p-quiroz', nombre_completo: 'QUIROZ SEBASTIAN ALEJO', nombre_para_mostrar: 'Sebastián Quiroz' },
    { id: 'p-godoy-c', nombre_completo: 'GODOY CARLOS', nombre_para_mostrar: 'Carlos Godoy' },
    { id: 'p-godoy-m', nombre_completo: 'GODOY MARIO', nombre_para_mostrar: 'Mario Godoy' },
    { id: 'p-navarro', nombre_completo: 'NAVARRO JUAN PABLO', nombre_para_mostrar: 'Juan Pablo Navarro' },
    { id: 'p-albornoz', nombre_completo: 'ALBORNOZ EMANUEL', nombre_para_mostrar: 'Emanuel Albornoz', apodo: 'Lalo' },
  ],
  tareas: [
    { id: 't-encofrado', nombre: 'Encofrado de losa', rubro: 'Estructura', metodo_avance: 'manual', avance_pct: 10 },
    { id: 't-hormigonado', nombre: 'Hormigonado de vigas', rubro: 'Estructura', metodo_avance: 'cantidad', unidad: 'm3', cantidad_objetivo: 40, cantidad_ejecutada: 0, avance_pct: 0 },
    { id: 't-losa', nombre: 'Losa', rubro: 'Estructura', metodo_avance: 'manual', avance_pct: 20 },
    { id: 't-mamposteria', nombre: 'Mampostería planta alta', rubro: 'Albañilería', metodo_avance: 'cantidad', unidad: 'm2', cantidad_objetivo: 200, cantidad_ejecutada: 50, avance_pct: 25 },
    { id: 't-contrapiso', nombre: 'Contrapiso', rubro: 'Pisos', metodo_avance: 'manual', avance_pct: 60 },
  ],
})

/**
 * `esperado.personas`: persona_id → [estado, horas, tarea_id] (null = no importa / no hay).
 * `esperado.dudosas`: persona_ids que DEBEN salir para confirmar.
 * `esperado.ambiguas`: cuántas menciones con varios candidatos.
 * `esperado.avances`: [tarea_id, produccion|null, dudoso]
 * `esperado.materiales`: [cantidad, unidad, material]
 * `esperado.novedades`: fragmentos que deben aparecer en Novedades.
 */
export const CASOS = [
  {
    nombre: 'el parte de la maqueta',
    texto: 'Playón de azufre. Hoy éramos seis. Argüello y Mansilla ocho horas en encofrado de la losa, el resto en hormigonado. La losa quedó al cuarenta por ciento. Faltan veinte bolsas de cemento para mañana. Quiroz no vino.',
    esperado: {
      personas: {
        'p-arguello': ['presente', 8, 't-encofrado'], 'p-mansilla': ['presente', 8, 't-encofrado'],
        'p-godoy-c': ['presente', 8, 't-hormigonado'], 'p-godoy-m': ['presente', 8, 't-hormigonado'],
        'p-navarro': ['presente', 8, 't-hormigonado'], 'p-albornoz': ['presente', 8, 't-hormigonado'],
        'p-quiroz': ['ausente', null, null],
      },
      dudosas: ['p-quiroz'],
      avances: [['t-losa', 20, false]],
      materiales: [[20, 'bolsa', 'cemento']],
      novedades: [],
      avisos: 0,
    },
  },
  {
    nombre: 'dos personas con el mismo apellido',
    texto: 'Godoy ocho horas en contrapiso. Carlos Godoy nueve horas en encofrado.',
    esperado: {
      personas: { 'p-godoy-c': ['presente', 9, 't-encofrado'] },
      ambiguas: 1,
      novedades: [],
    },
  },
  {
    nombre: 'una tarea que no es de la obra va a Novedades',
    texto: 'Navarro ocho horas en pintura de rejas.',
    esperado: {
      personas: { 'p-navarro': ['presente', 8, null] },
      novedades: ['pintura de rejas'],
    },
  },
  {
    nombre: 'ruido y muletillas',
    texto: 'Eh bueno, este, mmm. Hoy hubo viento zonda y se voló una chapa del obrador. Albornoz siete horas en contrapiso.',
    esperado: {
      personas: { 'p-albornoz': ['presente', 7, 't-contrapiso'] },
      novedades: ['viento zonda'],
    },
  },
  {
    nombre: '«los otros cuatro» cuando del plantel quedan seis',
    texto: 'Argüello ocho horas en contrapiso, los otros cuatro en encofrado de losa.',
    esperado: {
      personas: { 'p-arguello': ['presente', 8, 't-contrapiso'], 'p-navarro': ['presente', 8, 't-encofrado'] },
      dudosas: ['p-navarro', 'p-quiroz'],
    },
  },
  {
    nombre: 'faltas dichas antes del nombre',
    texto: 'Faltaron Quiroz y Navarro.',
    esperado: {
      personas: { 'p-quiroz': ['ausente', null, null], 'p-navarro': ['ausente', null, null] },
      dudosas: ['p-quiroz', 'p-navarro'],
      novedades: [],
    },
  },
  {
    nombre: 'lista de materiales con unidad heredada',
    texto: 'Hace falta pedir treinta bolsas de cemento, seis barras de hierro del ocho y dos del doce.',
    esperado: {
      materiales: [[30, 'bolsa', 'cemento'], [6, 'barra', 'hierro del ocho'], [2, 'barra', 'hierro del doce']],
      novedades: [],
    },
  },
  {
    nombre: 'avance en cantidad con números en palabras',
    texto: 'Hicimos quince metros cuadrados de mampostería.',
    esperado: { avances: [['t-mamposteria', 15, false]], novedades: [] },
  },
  {
    nombre: '«terminamos» completa lo que falta',
    texto: 'Terminamos el contrapiso.',
    esperado: { avances: [['t-contrapiso', 40, false]], novedades: [] },
  },
  {
    nombre: 'dígitos como los escribe el reconocedor',
    texto: 'Argüello 8 horas en encofrado. El contrapiso quedó al 70 %.',
    esperado: {
      personas: { 'p-arguello': ['presente', 8, 't-encofrado'] },
      avances: [['t-contrapiso', 10, false]],
    },
  },
  {
    nombre: 'alguien que no es de la obra no se inventa',
    texto: 'Fernández ocho horas en contrapiso.',
    esperado: { personas: {}, novedades: ['Fernández'] },
  },
  {
    nombre: 'el apodo',
    texto: 'Lalo nueve horas en contrapiso.',
    esperado: { personas: { 'p-albornoz': ['presente', 9, 't-contrapiso'] } },
  },
  {
    nombre: 'un apellido mal transcripto a una letra',
    texto: 'Mancilla ocho horas en contrapiso.',
    esperado: { personas: { 'p-mansilla': ['presente', 8, 't-contrapiso'] } },
  },
  {
    nombre: 'un avance que retrocede se confirma',
    texto: 'El contrapiso quedó al cincuenta por ciento.',
    esperado: { avances: [['t-contrapiso', null, true]] },
  },
  {
    nombre: 'horas dichas para todos',
    texto: 'Hoy trabajamos nueve horas. Argüello y Navarro en contrapiso.',
    esperado: {
      personas: { 'p-arguello': ['presente', 9, 't-contrapiso'], 'p-navarro': ['presente', 9, 't-contrapiso'] },
      novedades: [],
    },
  },
  {
    nombre: 'ocho y media',
    texto: 'Mansilla ocho y media horas en losa.',
    esperado: { personas: { 'p-mansilla': ['presente', 8.5, 't-losa'] } },
  },
]

/**
 * EL ACIERTO DE UN CASO, CAMPO POR CAMPO. Devuelve cada comparación con su resultado para que el
 * test diga cuál falló y el evaluador cuente el porcentaje. Un campo = un dato que el jefe tendría
 * que corregir si saliera mal (estado, horas y tarea de cada persona; tarea y producción de cada
 * avance; cantidad, unidad y material de cada pedido; cada novedad; cada duda que debía marcarse).
 */
/** «hierro del ocho» y «hierro del 8» son el mismo material: el reconocedor escribe dígitos. */
const canon = (s) => tokenizar(s).map((t) => (t.tipo === 'num' ? String(t.valor) : t.n)).join(' ')

export function compararCaso(caso, p) {
  const e = caso.esperado
  const campos = []
  const campo = (nombre, esperado, obtenido) => campos.push({ nombre, esperado, obtenido, ok: JSON.stringify(esperado) === JSON.stringify(obtenido) })
  const porId = new Map(p.personas.filter((f) => f.persona_id).map((f) => [f.persona_id, f]))
  for (const [id, [estado, horas, tarea]] of Object.entries(e.personas ?? {})) {
    const f = porId.get(id)
    campo(`${id}.estado`, estado, f?.estado ?? null)
    if (horas != null) campo(`${id}.horas`, horas, f?.horas ?? null)
    if (estado === 'presente') campo(`${id}.tarea`, tarea, f?.tarea_id ?? null)
  }
  if (e.personas && Object.keys(e.personas).length === 0) campo('personas.ninguna', 0, p.personas.length)
  for (const id of e.dudosas ?? []) campo(`${id}.dudosa`, true, Boolean(porId.get(id)?.dudoso))
  if (e.ambiguas != null) campo('ambiguas', e.ambiguas, p.personas.filter((f) => !f.persona_id && f.candidatos?.length > 1).length)
  ;(e.avances ?? []).forEach(([tarea, prod, dudoso], k) => {
    const a = p.avances[k]
    campo(`avance${k}.tarea`, tarea, a?.tarea_id ?? null)
    campo(`avance${k}.produccion`, prod, a?.produccion ?? null)
    campo(`avance${k}.dudoso`, dudoso, a?.dudoso ?? null)
  })
  ;(e.materiales ?? []).forEach(([cant, unidad, material], k) => {
    const m = p.materiales[k]
    campo(`material${k}.cantidad`, cant, m?.cantidad ?? null)
    campo(`material${k}.unidad`, unidad, m?.unidad ?? null)
    campo(`material${k}.material`, canon(material), m ? canon(m.material) : null)
  })
  if (e.materiales) campo('materiales.cuantos', e.materiales.length, p.materiales.length)
  if (Array.isArray(e.novedades)) {
    if (e.novedades.length === 0) campo('novedades.ninguna', 0, p.novedades.length)
    // Por cómo suena: «viento sonda» es la novedad «viento zonda» escrita por el reconocedor.
    for (const frag of e.novedades) campo(`novedad «${frag}»`, true, p.novedades.some((n) => fonetica(n.texto).includes(fonetica(frag))))
  }
  if (e.avisos != null) campo('avisos', e.avisos, p.avisos.length)
  return campos
}
