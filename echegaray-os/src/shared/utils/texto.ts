// ESCRIBIR UN NOMBRE QUE LLEGÓ GRITADO — la regla, sin pantalla.
//
// Los nombres de personas entraron al sistema desde las planillas de jornales y desde el legajo, y
// ahí están en MAYÚSCULA SOSTENIDA («CRISTIAN AGÜERO»). El canónico 19/20 los dibuja en oración
// («Cristian Agüero»): una columna entera en versales se lee peor y, sobre todo, deja de distinguir
// lo que sí es una sigla de lo que es sólo un nombre gritado.
//
// LA CONVERSIÓN ES DE DIBUJO, NO DE DATO. El nombre guardado no se toca: lo que la base tiene sigue
// siendo lo que el recibo, el alta temprana y el IERIC dicen. Esta función sólo decide cómo se
// PINTA, y por eso vive acá y no en un `update`.
//
// ═══ POR QUÉ NO SE TOCA LO QUE YA TIENE MINÚSCULAS ═══
//
// «La Estrella», «Quattropani - Melisa García SAS» o «McDonald» ya vienen curados por una persona.
// Pasarlos por un title-case genérico los rompería («Mcdonald») sin arreglar nada. Sólo se reescribe
// lo que está ENTERAMENTE en mayúsculas, que es la firma del dato importado.
//
// ═══ LO QUE SOBREVIVE A LA CONVERSIÓN ═══
//
//   · Cualquier token con un dígito: «H17», «3B», «B°», «CUADRILLA 2».
//   · Las siglas del vocabulario real de la empresa: societarias (SAS, SRL, SA…), técnicas (PVC,
//     HºAº) y de organismos (IERIC, UOCRA, ARCA). La lista es explícita a propósito: una regla del
//     tipo «todo token de tres letras es una sigla» convertiría a «ANA» en una sigla.

/** Las siglas que se escriben en mayúscula aunque el resto del nombre baje a oración.
 *  Se agregan de a una y con motivo: cada entrada es un caso visto en el dato real. */
const SIGLAS = new Set([
  // Societarias — vienen pegadas a la razón social de clientes y proveedores.
  'SA', 'SAS', 'SRL', 'SH', 'SCA', 'SAIC', 'SACIF', 'UTE',
  // Organismos y regímenes que aparecen en legajos y comprobantes.
  'ARCA', 'AFIP', 'IERIC', 'UOCRA', 'ART', 'IVA', 'DNI', 'CUIT', 'CUIL', 'EPP', 'IIBB', 'DGR',
  // Técnicas de obra.
  'PVC', 'HDPE', 'PPR', 'MDF', 'EPS', 'ACC',
])

/** Las partículas que en castellano van en minúscula cuando no abren el nombre: «Melisa García de
 *  los Santos». Nunca se aplican al primer token. */
const PARTICULAS = new Set(['de', 'del', 'la', 'las', 'lo', 'los', 'y', 'e', 'da', 'do', 'van', 'von'])

const TIENE_MINUSCULA = /\p{Ll}/u
const TIENE_DIGITO = /\d/u

/** Un token suelto, ya decidido que hay que bajarlo. Respeta los guiones y las comillas internas:
 *  «GARCÍA-LÓPEZ» → «García-López», «D'AGOSTINO» → «D'Agostino». */
function capitalizarToken(token: string): string {
  return token
    .toLocaleLowerCase('es-AR')
    .replace(/\p{L}[\p{L}\p{M}]*/gu, (palabra, indice: number) => {
      // Sólo se capitaliza el arranque de la palabra y lo que sigue a un guion o a un apóstrofo;
      // la «o» de «Mariano» no arranca nada.
      const previo = indice === 0 ? '' : token[indice - 1]
      if (indice > 0 && previo !== '-' && previo !== '’' && previo !== "'" && previo !== '.') return palabra
      return palabra.charAt(0).toLocaleUpperCase('es-AR') + palabra.slice(1)
    })
}

/**
 * Un texto gritado, escrito en oración. Lo que ya trae minúsculas vuelve intacto.
 *
 * @example oracion('CRISTIAN AGÜERO')            // 'Cristian Agüero'
 * @example oracion('MELISA GARCÍA SAS')          // 'Melisa García SAS'
 * @example oracion('CAÑERÍA PVC H17')            // 'Cañería PVC H17'
 * @example oracion('La Estrella')                // 'La Estrella' (no se toca)
 */
export function oracion(texto: string | null | undefined): string {
  const s = String(texto ?? '')
  if (!s.trim()) return s
  // LA PUERTA: si hay una sola minúscula, alguien ya lo escribió como quería.
  if (TIENE_MINUSCULA.test(s)) return s

  // Se parte CONSERVANDO los separadores para no reescribir los espacios de nadie.
  const partes = s.split(/(\s+)/)
  let primeraPalabra = true
  return partes
    .map((parte) => {
      if (!parte.trim()) return parte
      const esPrimera = primeraPalabra
      primeraPalabra = false
      // Un token con dígito es una designación, no una palabra: «H17» minusculado deja de ser el
      // hormigón y pasa a parecer un typo.
      if (TIENE_DIGITO.test(parte)) return parte
      const desnudo = parte.replace(/[^\p{L}]/gu, '')
      if (SIGLAS.has(desnudo)) return parte
      const bajado = capitalizarToken(parte)
      if (!esPrimera && PARTICULAS.has(bajado.toLocaleLowerCase('es-AR'))) {
        return bajado.toLocaleLowerCase('es-AR')
      }
      return bajado
    })
    .join('')
}
