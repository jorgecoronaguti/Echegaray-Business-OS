#!/usr/bin/env node
// CLASIFICADOR DE TAREAS — corre en `UserPromptSubmit`, antes de que yo lea nada.
//
// POR QUÉ EXISTE. La medición sobre 60 sesiones reales de este repo dice que el 75% de los turnos
// corre con más de 200k tokens de contexto y el 39% con más de 400k. La causa no es que las tareas
// sean grandes: es que se arranca cada una del mismo modo —abrir archivos, barrer el repo, releer
// documentación— sin distinguir si el pedido es "¿cómo viene la caja?" o "rediseñá el módulo".
//
// Este hook decide la CATEGORÍA del pedido y devuelve el protocolo mínimo de esa categoría. No es
// un resumen del CLAUDE.md ni un recordatorio de filosofía: es la lista corta de qué cargar, qué
// verificar y qué trampa de ESTE repo aplica.
//
// ═══ LAS CUATRO REGLAS QUE LO HACEN UTILIZABLE ═══
//
// 1. ES HUMILDE. Si la señal es débil no inyecta nada. Un protocolo equivocado es peor que ninguno:
//    manda a hacer el trabajo de otra categoría con la confianza de una instrucción. Ante la duda
//    se calla. La evidencia de este repo está llena de controles que mentían con seguridad.
//
// 2. ES BARATO. El protocolo más largo son ~190 tokens. Un clasificador que inyecte 2k por prompt
//    gasta más de lo que ahorra: en una sesión de 200 turnos serían 400k tokens de puro preámbulo.
//
// 3. NUNCA BLOQUEA. Sale siempre con código 0. Si algo falla adentro, se calla y deja pasar el
//    prompt intacto. Un clasificador roto no puede dejar al dueño sin poder hablarme.
//
// 4. NO DECIDE POR MÍ. Inyecta el protocolo, no ejecuta. Si la clasificación es obviamente errada
//    para el caso, el protocolo se ignora — dice explícitamente que es una guía automática.
//
// LO QUE NUNCA HACE: no lee archivos del proyecto, no corre git, no llama a ninguna API, no escribe
// nada. Es una función pura sobre el texto del pedido. Por eso tarda menos de 20 ms.

// ── Raíces, no palabras completas ──
//
// Este repo ya aprendió esto a la mala en el ruteo del chat de Mattermost: en voseo rioplatense
// "fijate", "revisá", "mirá", "agregá" y "arreglá" no matchean ninguna lista de infinitivos. Se
// buscan RAÍCES. Por eso `agreg` cubre agregar/agregá/agregame/agregale sin enumerarlos.
//
// ── Y dos pesos, no uno ──
//
// La primera versión trataba todas las señales igual y se equivocaba en el caso más común de este
// repo: "arreglá el bug de la caja" contaba `caja` como consulta de negocio y empataba con `bug`.
// El sustantivo del dominio NO define la categoría —"caja", "saldo" y "obra" aparecen en pedidos
// de las nueve— la define el VERBO. Por eso pedir un número ("cuánto", "decime", "mostrame") pesa
// doble para OPERACIÓN, y los sustantivos de negocio pesan uno: acompañan, no deciden.
const SEÑALES = {
  OPERACION: {
    fuertes: ['cuant', 'cuánt', 'decime', 'decíme', 'mostrame', 'mostrá', 'qué hay', 'que hay',
      'briefing', 'arqueo', 'cómo viene', 'como viene', 'cómo venimos', 'como venimos'],
    debiles: ['saldo', 'caja', 'cobranz', 'cobrad', 'pagad', 'factur', 'proveedor', 'impuest',
      'deuda', 'vencim', 'cheque', 'banco', 'jornal', 'nomin', 'nómin', 'sueldo', 'certificac',
      'flujo de fondos', 'flujo de caja', 'iva', 'arca', 'afip', 'extracto', 'conciliac'],
  },
  BUG: {
    // "no muestra el total" y "quedó mal" son reportes de defecto sin ambigüedad: van en fuertes.
    // La primera versión los tenía como débiles y "la pestaña de caja quedó mal, no muestra el
    // total" empataba con OPERACIÓN por la palabra `caja` — el pedido más típico del dueño.
    fuertes: ['error', 'roto', 'no anda', 'no funciona', 'bug', 'arregl', 'corregi', 'corregí',
      'corrig', 'se rompió', 'se rompio', 'dejó de', 'dejo de', 'anda mal', 'está mal', 'esta mal',
      'quedó mal', 'quedo mal', 'salió mal', 'salio mal', 'crash', 'se cuelga', 'excepcion',
      'excepción', 'no muestra', 'no aparece', 'no llega', 'no guarda', 'devuelve mal',
      // La familia "no + verbo": es como el dueño reporta la mitad de las fallas. Medido contra
      // los 2.229 pedidos del historial, sin estas líneas quedaban sin clasificar cosas tan
      // explícitas como "no logro hacer q cambie nada de ningun archivo, no edita, no modifica".
      'no ejecuta', 'no edita', 'no modifica', 'no cambia', 'no responde', 'no contesta',
      'no sigue', 'no logro', 'no hace', 'no lo hace', 'no me deja', 'nunca ', 'pesimo', 'pésimo'],
    debiles: ['falla', 'fallo', 'rompi', 'rompí', 'stack', 'undefined', 'regres',
      'no está andando', 'no esta andando'],
  },
  DESARROLLO: {
    fuertes: ['agreg', 'implement', 'funcionalidad', 'feature', 'desarroll', 'nuevo modul',
      'nuevo módul', 'capacidad nueva', 'habilit'],
    debiles: ['construi', 'construí', 'sumale', 'sumá', 'que ademas', 'que además', 'hace que',
      'hacé que', 'q pueda', 'que pueda', 'necesito q', 'necesito que', 'quiero q', 'quiero que',
      'permiti', 'permití'],
  },
  ARQUITECTURA: {
    fuertes: ['arquitectur', 'redise', 'rediseñ', 'fuente de verdad', 'modelo de datos',
      'desde cero', 'de raíz', 'de raiz', 'replantear', 'dónde vive', 'donde vive'],
    debiles: ['estructura del', 'cómo organiz', 'como organiz', 'migrar a', 'reemplaz',
      'decidir dónde', 'decidir donde', 'estrategia de'],
  },
  REFACTOR: {
    fuertes: ['refactor', 'deduplic', 'simplific', 'sacar la duplicac', 'unificar'],
    debiles: ['limpi', 'reorganiz', 'dividir el', 'extraer', 'renombr', 'consolidar', 'achicar',
      'partir en', 'ordenar el codigo', 'ordenar el código'],
  },
  MANTENIMIENTO: {
    fuertes: ['deploy', 'desplegar', 'desplegá', 'systemd', 'produccion', 'producción', 'worktree',
      'mergea', 'mergeá', 'cron'],
    debiles: ['servicio', 'timer', 'reinici', 'commit', 'merge', 'push', 'rama',
      'actualizar depend', 'versión de', 'está corriendo', 'esta corriendo', 'backup'],
  },
  DOCUMENTACION: {
    fuertes: ['document', 'readme', 'claude.md', 'runbook'],
    debiles: ['escribí la doc', 'escribi la doc', 'dejá escrito', 'deja escrito', 'anotá',
      'anota esto', 'explicá en el', 'guía de'],
  },
  INVESTIGACION: {
    fuertes: ['investig', 'averigu', 'audit', 'diagnostic', 'analiz'],
    debiles: ['revis', 'entender', 'entendé', 'por qué', 'por que', 'porque ', 'cómo funciona',
      'como funciona', 'dónde está', 'donde esta', 'buscá', 'busca ', 'relev', 'compará',
      'compara ', 'verificá', 'verifica ', 'chequeá', 'chequea '],
  },
  OPTIMIZACION: {
    fuertes: ['optimiz', 'performance', 'más rápido', 'mas rapido', 'consumo', 'acelerar',
      'velocidad', 'rapidez'],
    debiles: ['lento', 'rendimiento', 'costo de', 'crédito', 'credito', 'contexto', 'caro',
      'gasta mucho', 'reducir el', 'ahorra', 'eficien', 'concis'],
  },
}

// ── Los protocolos ──
//
// Cada uno responde tres cosas y nada más: qué contexto cargar, cómo se verifica, y qué trampa de
// ESTE repo aplica. Lo que ya está en el CLAUDE.md no se repite acá — se repetiría en cada prompt.
const PROTOCOLOS = {
  OPERACION: [
    'CONTEXTO: ninguno de código. Los datos salen de las capacidades del OS (Postgres, scripts del',
    'orquestador), no de leer archivos fuente.',
    'VERIFICACIÓN: la cifra sale de una fuente con origen trazable. Si no hay dato, se dice que no hay.',
    'TRAMPA: nunca correr un generador del Sheet real para "ver si anda" — ya borró trabajo del dueño.',
  ],
  BUG: [
    'CONTEXTO: el archivo del síntoma y su test. Nada más hasta tener la reproducción.',
    'ORDEN: reproducir con un test que FALLE → causa raíz → corregir → el test pasa.',
    'VERIFICACIÓN: `npm run orq:test` (37 s) o el test puntual. Silenciar el error no es corregirlo.',
    'TRAMPA: dos correcciones fallidas sobre el mismo problema = parar y reformular, no una tercera.',
  ],
  DESARROLLO: [
    'CONTEXTO: worktree propio (`git worktree add`), y `git merge main` PRIMERO — el worktree nace del',
    'commit inicial de la sesión, no de main vivo.',
    'ORDEN: entender el proceso real → buscar qué ya lo hace → recién ahí código.',
    'VERIFICACIÓN: test que falla antes y pasa después + `npm run orq:test` + typecheck.',
    'CIERRE: lo firma quien no lo construyó (agente `auditor-de-cierre`).',
  ],
  ARQUITECTURA: [
    'CONTEXTO: plan mode. No se escribe código hasta que el diseño esté decidido.',
    'ORDEN: qué existe hoy y por qué no alcanza → una sola fuente por concepto → recién ahí estructura.',
    'VERIFICACIÓN: la decisión queda escrita con su porqué antes de implementarse.',
    'TRAMPA: no crear un sistema paralelo a uno que ya existe (Sheet, tabla, otra feature).',
  ],
  REFACTOR: [
    'CONTEXTO: el archivo a tocar y sus tests. El comportamiento NO cambia.',
    'VERIFICACIÓN: los tests existentes son el contrato — pasan igual antes y después, sin editarlos.',
    'TRAMPA: no mezclar refactor con feature en el mismo cambio; si hace falta, son dos tareas.',
  ],
  MANTENIMIENTO: [
    'CONTEXTO: estado real del sistema, no el código (agente `centinela-de-produccion`).',
    'VERIFICACIÓN: la evidencia es del EFECTO — el servicio activo, el hash desplegado, el dato en',
    'destino. Que el comando devuelva 0 no prueba nada.',
    'TRAMPA: `enabled` no es `active`; un timer detenido parece un diseño roto.',
  ],
  DOCUMENTACION: [
    'CONTEXTO: sólo el documento. No se toca código en la misma tarea.',
    'CRITERIO por línea: ¿causaría un error si la borro? Si no, no va.',
    'TRAMPA: conocimiento de dominio va a una skill, nunca al CLAUDE.md.',
  ],
  INVESTIGACION: [
    'CONTEXTO: delegar el barrido a un subagente (`Explore` o `buscador-de-evidencia`) y quedarse con',
    'la conclusión, no con los archivos. Un barrido en la conversación principal es contexto quemado.',
    'ACOTAR: qué se busca y qué cuenta como respuesta, antes de empezar.',
    'TRAMPA: usar las herramientas Grep/Glob, no `grep -rn` por Bash — la salida de shell entra cruda.',
  ],
  OPTIMIZACION: [
    'ORDEN: MEDIR primero. Sin número de partida no hay optimización, hay opinión.',
    'VERIFICACIÓN: el mismo número medido igual, antes y después, y se muestra.',
    'TRAMPA: optimizar lo que se ve en vez de lo que pesa. Buscar el que domina, no el más feo.',
  ],
}

/** Frases que no son una tarea. Inyectar un protocolo acá es puro ruido pagado. */
const CHARLA = /^(ok|oka?y|dale|listo|gracias|perfecto|bien|bueno|si|sí|no|segu[ií]|continu[aá]?|and[aá]|hac[eé]lo|proced[eé]|sigue|adelante|joya|barbaro|bárbaro|excelente)[\s.!,]*$/i

/**
 * Clasifica el pedido. Función pura: mismo texto, misma respuesta, sin tocar el mundo.
 *
 * Devuelve `null` cuando no hay señal suficiente. Ese `null` es una respuesta legítima y frecuente:
 * el clasificador acierta callándose, no forzando una categoría.
 */
export function clasificar(texto) {
  if (typeof texto !== 'string') return null
  const t = texto.toLowerCase().trim()
  if (!t || t.length < 12) return null
  if (CHARLA.test(t)) return null
  if (t.startsWith('/')) return null // comando explícito: ya sabe lo que hace

  const puntajes = []
  for (const [cat, { fuertes, debiles }] of Object.entries(SEÑALES)) {
    const f = fuertes.filter((s) => t.includes(s))
    const d = debiles.filter((s) => t.includes(s))
    const n = f.length * 2 + d.length
    if (n) puntajes.push({ cat, n, señales: [...f, ...d] })
  }
  if (!puntajes.length) return null
  puntajes.sort((a, b) => b.n - a.n)

  const [primero, segundo] = puntajes
  const margen = primero.n - (segundo?.n ?? 0)

  // UMBRAL. Una sola señal débil, o un empate, es una moneda al aire: no se inyecta nada.
  // Preferimos callarnos a nombrar la categoría equivocada con tono de instrucción.
  if (primero.n < 2 || margen < 1) return null

  // MEZCLA. Dos categorías fuertes a la vez casi siempre son dos tareas metidas en un pedido
  // ("arreglá el bug y de paso agregá X"). El CLAUDE.md pide separarlas; acá se avisa.
  const mezcla = segundo && segundo.n >= 3 && margen <= 2 ? segundo.cat : null

  return {
    categoria: primero.cat,
    confianza: primero.n >= 4 && margen >= 2 ? 'alta' : 'media',
    señales: primero.señales.slice(0, 4),
    mezcla,
  }
}

/** El texto que se le inyecta a Claude. Corto a propósito: se paga en CADA prompt. */
export function armarContexto(r) {
  if (!r) return null
  const lineas = [
    `[clasificador automático · ${r.categoria} · confianza ${r.confianza}]`,
    ...PROTOCOLOS[r.categoria],
  ]
  if (r.mezcla) {
    lineas.push(
      `MEZCLA: el pedido también da señales de ${r.mezcla}. Son dos tareas — separalas y hacé una por vez.`,
    )
  }
  lineas.push('(Guía automática por palabras clave. Si no aplica al pedido real, ignorala.)')
  return lineas.join('\n')
}

/** Punto de entrada del hook. Nunca tira, nunca bloquea, siempre sale 0. */
async function main() {
  let entrada = ''
  try {
    entrada = await new Promise((r) => {
      let s = ''
      const t = setTimeout(() => r(s), 5000) // stdin que no cierra no puede colgar el prompt
      process.stdin.on('data', (d) => (s += d)).on('end', () => { clearTimeout(t); r(s) })
    })
  } catch { /* sin entrada no hay nada que clasificar */ }

  let evento = {}
  try { evento = JSON.parse(entrada || '{}') } catch { /* idem */ }

  // El nombre del campo no está documentado de forma estable para este evento, así que se prueban
  // los candidatos razonables antes de rendirse. Rendirse es salir en silencio, no romper.
  const texto = evento.prompt ?? evento.user_prompt ?? evento.message ?? ''

  const ctx = armarContexto(clasificar(texto))
  if (ctx) {
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: ctx },
    }))
  }
  process.exit(0)
}

// Sólo corre como hook si lo invocan directamente; importado desde el test no hace nada.
if (process.argv[1] && process.argv[1].endsWith('clasificar-tarea.mjs')) {
  main().catch(() => process.exit(0))
}
