// FINANCIAL ENGINEERING MULTI-EXPERTO (FE1) — contrato entre el backend (route handler) y la UI.
//
// A diferencia del chat interno 0-API, esta capacidad RAZONA: consume la API de Anthropic SÓLO cuando
// el dueño pregunta (nada autónomo, nada en timer). El núcleo (orquestador/lib/fe-multiexperto.mjs)
// corre tres lentes expertas (contador, abogado, financiero) grounded en sus skills + una comparación.
// Es SÓLO-LECTURA: lee el Flujo de Fondos y las fuentes únicas del OS; nunca escribe el Sheet ni la base.
//
// Estos tipos son el espejo TS del output del núcleo (.mjs). Todo lo que la UI pinta es texto ya
// producido: nunca un objeto/número crudo como nodo React.

export type LenteId = 'contador' | 'abogado' | 'financiero'

// Una lectura experta desde una lente. `skills` son las SKILL.md que la fundamentaron (trazabilidad
// del "enchufado"). `error` no-null significa que esa lente no estuvo disponible (ej. sin crédito).
export interface LecturaLente {
  id: LenteId
  titulo: string
  persona: string
  skills: string[]
  foco: string
  texto: string
  model: string
  costUsd: number | null
  error: string | null
}

// La comparación entre las tres lecturas: dónde coinciden y dónde chocan.
export interface ComparacionFE {
  coincidencias: string[]
  conflictos: string[]
  texto: string
  model: string
  costUsd: number | null
  error: string | null
}

// El resultado completo de una consulta multi-experto.
export interface RespuestaFEMultiexperto {
  pregunta: string
  contextoTexto: string
  faltantes: string[]
  lecturas: LecturaLente[]
  comparacion: ComparacionFE
  costoTotalUsd: number | null
  corridoEn: string
}

// El sobre que devuelve el route handler. `ok:false` con motivo honesto (sin crédito, sin contexto,
// sin sesión) — nunca un peso inventado ni un 500 opaco.
export type MotivoNoDisponible = 'sin_sesion' | 'sin_contexto' | 'sin_credito' | 'error'

export interface RespuestaOk {
  ok: true
  respuesta: RespuestaFEMultiexperto
}
export interface RespuestaError {
  ok: false
  motivo: MotivoNoDisponible
  error: string
  // Aun sin razonamiento, devolvemos el contexto determinístico leído (transparencia).
  contextoTexto?: string
}
export type RespuestaAPI = RespuestaOk | RespuestaError

// Un turno del hilo en la UI (no se persiste; vive en el navegador).
export interface TurnoFE {
  id: string
  pregunta: string
  respuesta: RespuestaFEMultiexperto | null
  error: string | null
  cargando: boolean
}
