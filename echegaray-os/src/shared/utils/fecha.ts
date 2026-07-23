// FECHA Y HORA EN CASTELLANO, SIN LA TRAMPA DE LAS 12 HORAS.
//
// POR QUÉ EXISTE (23/07). El Calendario Financiero decía "Generado … 23/7/2026, 05:33:02" para un
// snapshot generado a las 17:33. `toLocaleString('es-AR')` sin opciones devuelve el reloj de 12 horas
// y NO agrega el "a. m./p. m.": 17:33 sale como 05:33. En una pantalla de plata, leer una cifra como
// si fuera de la madrugada anterior cambia la decisión — parece vieja cuando está fresca.
//
// Se resuelve en un solo lugar para que ninguna pantalla lo repita mal.

/** Fecha y hora local, reloj de 24 horas: "23/07/2026, 17:33". */
export const fechaHora = (d: Date | string | number) =>
  new Date(d).toLocaleString('es-AR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  })

/** Sólo la fecha: "23/07/2026". */
export const fechaCorta = (d: Date | string | number) =>
  new Date(d).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
