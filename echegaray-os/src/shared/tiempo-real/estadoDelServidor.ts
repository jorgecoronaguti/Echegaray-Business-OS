// LO QUE MUESTRA UN CONTROL CUANDO OTRO USUARIO CAMBIÓ EL DATO — la regla pura, sin React.
//
// Dueño, 16/09/2026: «no se están actualizando lo que marco en el celular con lo que veo en la
// computadora… tiene que ser de ida y vuelta, en tiempo real y multiusuario». Medido en producción:
// el aviso llegaba y `router.refresh()` traía el dato nuevo, pero los controles que guardan su propia
// copia (`useState(inicial)`) la tomaban UNA vez al montarse y seguían mostrando lo viejo. Marcar
// «tarde» en el teléfono no se veía nunca en la compu.
//
// LA REGLA: cuando el valor que manda el servidor CAMBIA, el control lo adopta. Un cambio local (lo que
// esta persona acaba de tocar) se muestra mientras el servidor no traiga otra cosa. No se compara lo
// local contra lo del servidor —eso pisaría una edición en curso con el valor que ya estaba—: se
// compara el servidor contra el servidor de la vez anterior.

export interface EstadoDelServidor<T> {
  valor: T
  /** La huella del último valor visto del servidor. */
  huella: string
}

export function huellaDe(v: unknown): string {
  return JSON.stringify(v, (_k, x) => (x instanceof Set ? [...x].sort() : x instanceof Map ? [...x.entries()] : x))
}

export function nacer<T>(delServidor: T, huella = huellaDe(delServidor)): EstadoDelServidor<T> {
  return { valor: delServidor, huella }
}

/** `null` si no hay nada que cambiar; si no, el estado nuevo con el valor del servidor adoptado. */
export function alRecibirDelServidor<T>(
  e: EstadoDelServidor<T>, delServidor: T, huella = huellaDe(delServidor),
): EstadoDelServidor<T> | null {
  return huella === e.huella ? null : { valor: delServidor, huella }
}
