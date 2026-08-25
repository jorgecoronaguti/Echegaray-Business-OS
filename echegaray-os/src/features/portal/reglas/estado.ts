import type { CertificadoPortal } from '../types'
import { diasEntre, soloFecha } from './aPagar.ts'

// CÓMO SE LEE EL ESTADO DE UN CERTIFICADO EN LA PANTALLA DEL CLIENTE — `29`, líneas 255–379.
//
// El mockup usa cinco estados con su color y su icono: «Para aprobar» (ámbar), «A vencer» (azul),
// «Vencido» (rojo), «En revisión» (ámbar) y «Pagado» (verde). En la base hay siete valores de
// `certificado_cliente.estado`, y ninguno de ellos alcanza solo: lo que decide entre «A vencer» y
// «Vencido» no es el estado, es la fecha contra hoy.
//
// ═══ EL ORDEN DE LAS PREGUNTAS ES LA REGLA ═══
//
// 1. ¿Está cobrado? Entonces PAGADO, pase lo que pase con la fecha. Un certificado pagado tarde
//    sigue pagado; pintarlo de rojo le reclamaría al cliente algo que ya hizo.
// 2. ¿Espera SU conformidad? Entonces PARA APROBAR, y NO se le pone fecha de vencimiento: el plazo
//    de pago arranca cuando aprueba. Escribirle «vence en 3 días» a algo que todavía no aprobó es
//    apurarlo por una deuda que no existe.
// 3. ¿Lo devolvió observado o está en disputa? EN REVISIÓN — la pelota la tiene la empresa.
// 4. Recién ahí manda la fecha.

export type ClaveEstado = 'pagado' | 'para_aprobar' | 'en_revision' | 'vencido' | 'a_vencer' | 'sin_fecha'

export interface EstadoEnPantalla {
  clave: ClaveEstado
  /** Lo que dice la columna ESTADO. */
  rotulo: string
  /** Lo que dice la columna VENCE debajo de la fecha. `null` = no lleva segunda línea. */
  nota: string | null
  /** Si la fecha de vencimiento se escribe. Un certificado sin aprobar no muestra vencimiento. */
  muestra_fecha: boolean
  /** Días hasta el vencimiento (negativo = vencido). `null` = no aplica. */
  dias: number | null
}

const NUNCA = { muestra_fecha: false, dias: null }

/**
 * @param hoy el día en curso en `YYYY-MM-DD`. Entra por parámetro: una regla que lee el reloj no se
 *   puede probar dos veces igual.
 */
export function estadoEnPantalla(c: CertificadoPortal, hoy: string): EstadoEnPantalla {
  const cobrado = soloFecha(c.cobrado_at)
  if (cobrado || c.estado === 'cobrado') {
    return {
      clave: 'pagado',
      rotulo: 'Pagado',
      nota: cobrado ? `pagado ${cobrado.slice(8, 10)}/${cobrado.slice(5, 7)}` : 'pagado',
      muestra_fecha: true,
      dias: null,
    }
  }

  if (c.estado === 'emitido') {
    return { clave: 'para_aprobar', rotulo: 'Para aprobar', nota: 'espera aprobación', ...NUNCA }
  }

  if (c.estado === 'observado' || c.estado === 'en_disputa' || c.estado === 'en_revision') {
    return { clave: 'en_revision', rotulo: 'En revisión', nota: null, muestra_fecha: true, dias: null }
  }

  const vence = soloFecha(c.vence)
  if (!vence) {
    return { clave: 'sin_fecha', rotulo: 'Sin fecha de pago', nota: 'a convenir', ...NUNCA }
  }

  const dias = diasEntre(hoy, vence)
  if (dias < 0) {
    return { clave: 'vencido', rotulo: 'Vencido', nota: `${Math.abs(dias)} d`, muestra_fecha: true, dias }
  }
  return {
    clave: 'a_vencer',
    rotulo: 'A vencer',
    nota: dias === 0 ? 'hoy' : `en ${dias} d`,
    muestra_fecha: true,
    dias,
  }
}
