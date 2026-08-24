// LAS INICIALES DEL AVATAR — la función pura detrás del círculo del header.
//
// Vive en su propio archivo y no adentro de `AppHeader` a propósito: el avatar es lo primero que
// mira cualquiera al entrar, y su contenido no puede depender de levantar Next y una sesión para
// saber si es correcto. Acá se prueba con `node --test` en milisegundos.
//
// ═══ POR QUÉ NO ES `nombre.split(' ').map(p => p[0])` ═══
//
// Porque los datos reales de `perfiles.nombre` traen las tres formas que rompen esa línea:
//
//   «Jorge Corona»                → JC
//   «jorge.o.corona+direccion-test-1783513222134@gmail.com»  (sin nombre cargado) → JC, no «J@»
//   «  Ana   Laura  Vera  »       → AV — dos primeras palabras, no la primera y la última
//
// El correo de prueba de este repo es el caso que obliga: `+direccion-test-…@gmail.com` tiene un
// `+`, puntos y dígitos, y un `split(' ')` sobre él devuelve UNA palabra de 54 caracteres.

/** Las 2 iniciales que van dentro del círculo. Nunca vacío: sin nada legible devuelve `?`. */
export function iniciales(nombre?: string | null, email?: string | null): string {
  const dePersona = palabras(nombre)
  if (dePersona) return dePersona
  // El correo se reduce a su parte local y se parte por los separadores que usan las cuentas
  // reales (`.`, `_`, `-`, `+`). Lo que quede en dígitos no cuenta: «test-1783513222134» no es
  // un apellido.
  const local = (email ?? '').split('@')[0] ?? ''
  return palabras(local.replace(/[._+-]+/g, ' ')) || '?'
}

function palabras(texto?: string | null): string {
  const partes = (texto ?? '')
    .split(/\s+/)
    .map((p) => p.replace(/[^\p{L}]/gu, ''))
    .filter(Boolean)
  if (partes.length === 0) return ''
  const dos = partes.slice(0, 2).map((p) => p[0])
  return dos.join('').toLocaleUpperCase('es-AR')
}
