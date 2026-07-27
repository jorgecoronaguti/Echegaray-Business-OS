// CHAT INTERNO 0-API (F7) — contrato entre el backend (route handler) y la UI.
//
// El chat NO usa un modelo de lenguaje ni llama a ninguna API de Anthropic: el route handler rutea la
// pregunta con el ruteador determinístico del OS (orquestador/lib/chat-intents.mjs · routeConsulta) y
// responde LEYENDO las tablas que el OS ya materializó (patrón la-web-lee). La respuesta viaja SIEMPRE
// como texto ya formateado: la UI nunca recibe ni renderiza un objeto/número crudo como nodo React.
//
// REGLA DURA: si la pregunta no matchea ninguna capacidad, `cubierta` = false y se responde
// honestamente ("no tengo esa capacidad todavía") — nunca un peso inventado.

export const CAPACIDADES = ['caja', 'cobranzas', 'obligaciones', 'obra', 'scorecard'] as const
export type Capacidad = (typeof CAPACIDADES)[number]

// Una fila de dato ya presentada como texto (valor formateado en el server). `fuente` es la fuente única
// dueña del número (finanzas_modelo_liquidez, costos_obra, …): trazabilidad, no se duplica la propiedad.
export interface ChatDato {
  etiqueta: string
  valor: string
  fuente: string
  estado: 'ok' | 'sin_datos'
}

// La respuesta completa a un turno. Todo string salvo la lista de datos (a su vez strings).
export interface ChatRespuesta {
  cubierta: boolean
  capacidad: Capacidad | null
  titulo: string
  intro: string | null
  datos: ChatDato[]
  nota: string | null
  capturadoEn: string | null
}

// Un turno del hilo, tal como lo guarda la UI (nada de esto se persiste ni sale del navegador).
export interface ChatTurno {
  id: string
  pregunta: string
  respuesta: ChatRespuesta | null
  error: string | null
}
