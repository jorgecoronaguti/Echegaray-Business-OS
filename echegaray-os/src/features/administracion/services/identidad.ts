// CÓMO SE ESCRIBEN LOS NÚMEROS DE IDENTIDAD — y por qué el formato NO se guarda.
//
// El CUIT y el CUIL se guardan como once dígitos pelados. No es una preferencia: guardados con
// guiones dejan de cruzar contra ARCA y contra el extracto del banco, que es para lo único que
// existen esas columnas. La base lo hace cumplir (`proveedores_cuit_formato`, un CHECK de
// `^[0-9]{11}$`).
//
// Leerlos así, en cambio, es imposible: «30708390557» son once cifras seguidas que nadie compara de
// un vistazo con la factura que tiene en la mano. El formato es DE LA PANTALLA, se aplica al
// mostrar, y nunca vuelve a la base.
//
// Vive en un archivo sin JSX a propósito: es la única forma de que `node --test` lo pueda ejercitar.

/** 30708390557 → 30-70839055-7. Devuelve el valor tal cual si no tiene once dígitos: un dato mal
 *  cargado se muestra como está, para que alguien lo corrija, y no se disfraza de bien formado. */
export function formatearCuit(cuit: string | null): string | null {
  if (!cuit) return null
  const d = cuit.replace(/\D/g, '')
  if (d.length !== 11) return cuit
  return `${d.slice(0, 2)}-${d.slice(2, 10)}-${d.slice(10)}`
}

/** 29427106 → 29.427.106. Los puntos son cómo se lee un DNI en Argentina; la base guarda dígitos. */
export function formatearDni(dni: string | null): string | null {
  if (!dni) return null
  const d = dni.replace(/\D/g, '')
  if (d.length < 7 || d.length > 8) return dni
  return d.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}
