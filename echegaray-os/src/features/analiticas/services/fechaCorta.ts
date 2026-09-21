// LA FECHA QUE SE ESCRIBE EN EL FILTRO: `dd/mm/aa`, NO `mm/dd/yyyy`.
//
// ═══ EL DEFECTO (revisión de fidelidad, 21/09/2026) ═══
//
// Los dos campos del filtro eran `<input type="date">` pelados. El formato que dibuja ese control lo
// decide el navegador por su locale, no el `lang` de la página: en el teléfono del dueño salían
// `mm/dd/yyyy`. No es sólo una desviación del diseño —que pide `dd/mm/aa`—: es una fecha en formato
// norteamericano en una pantalla argentina, donde 03/09 y 09/03 son dos días distintos y nada avisa
// cuál se está leyendo.
//
// Por eso el campo pasa a ser de texto con el formato escrito al lado. Se pierde el almanaque nativo
// y se gana que la fecha diga lo que dice. El valor que viaja sigue siendo ISO.
//
// SE ACEPTA LO QUE LA GENTE ESCRIBE: con barras o sin ellas, con año de dos o de cuatro dígitos,
// con o sin ceros a la izquierda. Lo que no se acepta es adivinar: `13/13/26` no es una fecha y
// devuelve `null`, que la pantalla escribe como aviso en vez de saltar a otro día.

/** El siglo de un año de dos dígitos. 26 → 2026. Fijo: este sistema no maneja fechas del 1900. */
const SIGLO = 2000

/** ISO (`2026-09-21`) → `21/09/26`. Vacío o inválido → cadena vacía: el campo queda en blanco. */
export function aCorta(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim())
  if (!m) return ''
  return `${m[3]}/${m[2]}/${m[1].slice(2)}`
}

/**
 * `21/09/26` → `2026-09-21`. Devuelve `null` cuando lo escrito no es una fecha real.
 *
 * Valida el día CONTRA EL MES, con año bisiesto: `31/04/26` y `29/02/26` no existen y no se redondean
 * al día siguiente, que es lo que haría `new Date`. Una fecha corregida en silencio filtra un período
 * que nadie pidió.
 */
export function deCorta(texto: string): string | null {
  const limpio = texto.trim()
  if (limpio === '') return null
  const m = /^(\d{1,2})\s*[/\-. ]\s*(\d{1,2})\s*[/\-. ]\s*(\d{2}|\d{4})$/.exec(limpio)
    ?? /^(\d{2})(\d{2})(\d{2}|\d{4})$/.exec(limpio)
  if (!m) return null
  const dia = Number(m[1])
  const mes = Number(m[2])
  const anio = m[3].length === 2 ? SIGLO + Number(m[3]) : Number(m[3])
  if (mes < 1 || mes > 12 || dia < 1) return null
  const bisiesto = (anio % 4 === 0 && anio % 100 !== 0) || anio % 400 === 0
  const largo = [31, bisiesto ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mes - 1]
  if (dia > largo) return null
  return `${anio}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
}
