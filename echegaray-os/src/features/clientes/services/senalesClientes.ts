// LAS SEÑALES DE LA PRIMERA LÍNEA DE CLIENTES — criterio 1 y 2 del patrón v2 (`25v2:40-56`).
//
// Lo primero que se ve al entrar a Clientes no es la cartera: es lo que hay que cargar para poder
// cobrar. El mockup abre con DOS señales y las dos aterrizan en el MISMO recorte «Datos faltantes»,
// que es el conjunto que las produce (ver `faltaUnDatoQueFrena` en `cartera.ts`).
//
// ═══ POR QUÉ SON DOS Y NO UNA ═══
//
// Cuentan cosas de distinta naturaleza y por eso no se suman: la primera cuenta CLIENTES a los que
// les falta un dato del maestro; la segunda cuenta OBRAS en ejecución sin monto contratado. Un solo
// número mezclaría dos unidades y el que lo lea no sabría qué está por tocar.
//
// ═══ LAS REGLAS QUE HACE CUMPLIR ═══
//
//   CERO NO SE DIBUJA — nada que cargar es silencio normal.
//   NULL SÍ SE DIBUJA — una señal que no se pudo contar no puede callarse: callarla dibuja una
//   cartera al día, que es la afirmación que la pantalla no puede hacer si no pudo mirar.

import type { SenalDeTrabajo } from '../../../shared/components/v2/trabajo.ts'
import { faltaUnDatoQueFrena, type FilaCartera } from './cartera.ts'

/** El recorte donde se resuelven las dos: el mismo que las produjo. */
const DESTINO = '/clientes?vista=sin-datos'

/**
 * @param clientes Los ACTIVOS. `null` = no se pudieron leer.
 * @param obrasSinContrato Cuántas obras en ejecución no tienen monto contratado. `null` = sin leer.
 */
export function senalesDeClientes(
  clientes: FilaCartera[] | null,
  obrasSinContrato: number | null,
): SenalDeTrabajo[] {
  const s: SenalDeTrabajo[] = []

  if (clientes === null) {
    s.push({
      clave: 'datos-faltantes', numero: null, texto: 'clientes con datos faltantes',
      bloquea: 'No pude leerlos: esta pantalla no puede afirmar que estén completos',
      accion: 'Revisar', href: DESTINO, icono: 'cliente',
    })
  } else {
    const n = clientes.filter(faltaUnDatoQueFrena).length
    if (n > 0) {
      s.push({
        clave: 'datos-faltantes', numero: n,
        texto: n === 1 ? 'cliente con datos faltantes' : 'clientes con datos faltantes',
        bloquea: 'Sin CUIT o sin teléfono no se factura ni se reclama',
        accion: 'Completar', href: DESTINO, icono: 'cliente',
      })
    }
  }

  if (obrasSinContrato === null) {
    s.push({
      clave: 'sin-contrato', numero: null, texto: 'obras sin contrato cargado',
      bloquea: 'No pude leer las obras: esta pantalla no puede afirmar que todas lo tengan',
      accion: 'Revisar', href: DESTINO, icono: 'dinero',
    })
  } else if (obrasSinContrato > 0) {
    s.push({
      clave: 'sin-contrato', numero: obrasSinContrato,
      texto: obrasSinContrato === 1 ? 'obra sin contrato cargado' : 'obras sin contrato cargado',
      bloquea: 'No se puede definir el esquema de pago ni certificar',
      accion: 'Cargar', href: DESTINO, icono: 'dinero',
    })
  }

  return s
}
