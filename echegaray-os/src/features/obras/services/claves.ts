// LA CLAVE DE UNA ACTIVIDAD, EN TYPESCRIPT.
//
// Es la MISMA regla que `claveDe()` en `orquestador/lib/obra-cronograma.mjs`, que es quien clavea lo
// que entra desde el tracker de Drive. Tiene que ser la misma o las dos puntas dejan de reconocerse:
// una actividad creada en la web y la misma actividad viniendo del Sheet terminarían duplicadas.
// El test `claves.test.mjs` compara las dos implementaciones sobre los mismos casos.

export function slug(s: string): string {
  return String(s ?? '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60)
}

export function claveDeActividad(seccion: string | null, nombre: string): string {
  return `${slug(seccion ?? '') || 'raiz'}/${slug(nombre) || 'sin-nombre'}`
}
