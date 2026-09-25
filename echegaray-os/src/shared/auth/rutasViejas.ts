// LAS URLS VIEJAS VAN A SU LUGAR NUEVO CON UN 308 (dueño, 25/09/2026: «las URLs son un desastre, es
// un desorden todo»).
//
// Una URL que alguna vez existió puede estar en un marcador, en un mail, en un aviso del bot o impresa
// en una etiqueta QR. Ninguna puede terminar en un 404 ni en una pantalla que ya no es la de ese concepto.
// Acá vive la tabla ÚNICA de las que se mudaron o se retiraron, y el destino de cada una. Es:
//
//   · PERMANENTE (308): sólo lo que no depende del rol ni del aparato. Un 308 lo recuerda el navegador;
//     las caras por rol o por aparato (`/obra/*` ↔ `/obras/*` del jefe, `/mi-cuenta/*` del operario) siguen
//     siendo 307 en el middleware, porque en el mismo navegador puede entrar otra persona.
//   · ANTES DEL LOGIN: se aplica aunque no haya sesión. El destino pasa después por la puerta de siempre
//     (sesión y rol): una URL vieja nunca abre algo que la nueva no abriría.
//   · CON LA QUERY: se conserva la que traía (filtros, `?obra=`), salvo donde el destino arma la suya.
//
// El árbol completo, por cara y rol, está en docs/engineering/MAPA-DE-PANTALLAS.md › «h».

/** Rutas EXACTAS que se mudaron. */
const MUDADAS: Record<string, string> = {
  // Duplicados vivos (una sola URL por concepto)
  '/h': '/herramientas',                                    // el QR sin código; `/h/<código>` sigue (etiquetas impresas)
  '/integraciones/herramientas': '/herramientas',
  '/integraciones/movimientos': '/herramientas/movimientos',
  '/integraciones/pedidos-materiales': '/herramientas/material',
  '/mi-trabajo/tareas': '/mi-trabajo',
  '/administracion/asistencia': '/administracion/personas/correcciones',
  // Pantallas retiradas (existieron; pueden quedar en marcadores y mails)
  '/flujo-caja': '/calendario-financiero',
  '/caja': '/calendario-financiero',
  '/capital-trabajo': '/calendario-financiero',
  '/obligaciones': '/calendario-financiero',
  '/calendario-caja': '/calendario-financiero',
  '/ingenieria-financiera': '/calendario-financiero',
  '/scorecard': '/os',
  '/scorecard-finanzas': '/os',
  '/dashboard': '/os',
  '/inteligencia': '/os',
  '/sintesis-semanal': '/os',
  '/direccion': '/os',
  '/motor-decisiones': '/os',
  '/backlog-autonomo': '/os',
  '/rutinas': '/os',
  '/orquestador': '/os',
  '/organizacion': '/os',
  '/operador-digital': '/os',
  '/fundacion': '/os',
  '/acciones': '/os',
  '/preguntas-negocio': '/os',
  '/chat': '/xsas',
  '/comunicacion': '/xsas',
  '/comercial': '/clientes',
  '/compras': '/administracion/compras',
  '/control-obras': '/obras',
  '/control-obras/costos': '/obras',
  '/operacion': '/obras',
  '/obras/certificaciones': '/obras',
  '/obras/documentos': '/obras',
  '/obras/operacion': '/obras',
  '/obras/cronograma': '/obras/gantt',
  '/obras/personal': '/administracion/personas',
  '/personas': '/administracion/personas',
  '/administracion/personas/recibos': '/administracion/personas',
  '/administracion/personas/recibos/imprimir': '/administracion/personas',
  '/operarios': '/administracion/usuarios',
  '/equipos': '/herramientas',
  '/fuentes': '/integraciones',
  '/extension': '/descargas',
  '/descargar': '/descargas',
  '/signup': '/login',
  '/administracion/cronograma': '/clientes',
  '/administracion/portal': '/clientes',
  '/portal-anterior': '/portal',
  '/portal/transferir': '/portal/pagos',
}

/** Rutas con un segmento variable que se mudaron. */
const MUDADAS_CON_PARAMETRO: [RegExp, (m: RegExpExecArray) => string][] = [
  [/^\/control-obras\/([^/]+)$/, (m) => `/obras/${m[1]}`],
  // La vista cronograma de una obra es la sub-vista Gantt de Tareas (`hrefCronograma`).
  [/^\/obras\/([^/]+)\/cronograma$/, (m) => `/obras/${m[1]}?vista=tareas&sub=gantt`],
  [/^\/portal-anterior\/.+$/, () => '/portal'],
  [/^\/administracion\/asistencia\/.+$/, () => '/administracion/personas/correcciones'],
  // Los recibos de pago firmados vivían en una ruta con id; hoy la lista de recibos es una sola.
  [/^\/mi-informacion\/recibos\/pago\/[^/]+(\/(completo|firmar|papel))?$/, () => '/mi-informacion/recibos'],
]

/**
 * El destino permanente de una URL vieja, con su query; `null` si la ruta no se mudó.
 * Pura: la usa el middleware y la prueba `rutasViejas.test.ts`.
 */
export function destinoPermanente(pathname: string, search = ''): string | null {
  const ruta = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname
  let destino: string | null = MUDADAS[ruta] ?? null
  if (!destino) {
    for (const [re, armar] of MUDADAS_CON_PARAMETRO) {
      const m = re.exec(ruta)
      if (m) { destino = armar(m); break }
    }
  }
  if (!destino) return null
  // La query vieja se conserva; si el destino ya trae la suya, se le suman los parámetros que no pisa.
  const vieja = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
  if (![...vieja.keys()].length) return destino
  const [base, propia = ''] = destino.split('?')
  const q = new URLSearchParams(propia)
  for (const [k, v] of vieja) if (!q.has(k)) q.append(k, v)
  return `${base}?${q.toString()}`
}

/** Para la documentación y la prueba: todas las exactas. */
export const RUTAS_MUDADAS = MUDADAS
