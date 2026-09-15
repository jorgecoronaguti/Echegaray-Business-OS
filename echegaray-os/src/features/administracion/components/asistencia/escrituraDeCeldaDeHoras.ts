// ESCRIBIR UNA CELDA DE HORAS DE LA GRILLA — un número o «sin horas» — con las acciones de siempre.
//
// Existe para que el deshacer de la plataforma (Cmd/Ctrl+Z) revierta con EXACTAMENTE lo mismo que
// escribió el dedo: deshacer un vaciado vuelve a poner el número con `guardarJornada`, y rehacerlo
// vuelve a vaciar con `corregirJornada`. Qué significa el texto lo decide `leerCeldaDeHoras`, la
// misma lectura que usa la celda: dos lecturas del vacío discreparían el día que se toque una.

import { leerCeldaDeHoras } from '../../services/jornadaPorObra'
import { corregirJornada, guardarJornada } from '../../services/jornadaPorObraActions'

export type ResultadoCeldaDeHoras = { ok: true; mensaje: string } | { ok: false; error: string }

export async function escribirCeldaDeHoras({ obraId, personaId, fecha, valor }: {
  obraId: string; personaId: string; fecha: string; valor: string
}): Promise<ResultadoCeldaDeHoras> {
  const lectura = leerCeldaDeHoras(valor)
  if (lectura.accion === 'error') return { ok: false, error: lectura.error }
  if (lectura.accion === 'vaciar') {
    return corregirJornada({
      persona_id: personaId, fecha, obra_origen: obraId, obra_destino: null,
      estado: 'vaciar', horas: null, motivo: null, hasta: null, asignar: false,
    })
  }
  return guardarJornada({
    obra_id: obraId, fecha, marcas: [{ persona_id: personaId, estado: 'presente', horas: lectura.horas }],
  })
}
