// PASADA D del E2E Quattropani (22/08): el formulario aceptaba fin < inicio y la fila quedaba en la
// base con un plazo negativo. La base tiene además su CHECK (20260822T6800) — esto es la primera
// línea, con el mensaje que el formulario puede mostrar. Como ISO (YYYY-MM-DD), comparar los
// strings ES comparar las fechas.
//
// Vive FUERA de actions.ts a propósito: ese módulo es 'use server' y sólo puede exportar funciones
// async — exportar esta constante desde ahí rompió el build entero (Failed to collect page data).
export const finNoAnteriorAlInicio = [
  (d: { inicio_plan?: string; fin_plan?: string }) =>
    !d.inicio_plan || !d.fin_plan || d.fin_plan >= d.inicio_plan,
  { message: 'El fin previsto no puede ser anterior al inicio' },
] as const
