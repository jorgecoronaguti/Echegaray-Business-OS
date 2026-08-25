// LAS SEÑALES DE LA PRIMERA LÍNEA DE PROVEEDORES — criterio 2 del patrón de sección v2.
//
// «Cada fila que reclama algo dice qué bloquea y trae su verbo a la derecha. No un chip que cuenta:
// una frase que nombra el obstáculo y un botón que lo resuelve.»
//
// Vive en un `.ts` sin JSX a propósito: es la regla que decide QUÉ se le pide al usuario apenas
// entra, y una regla así tiene que poder probarse sin montar React ni pegarle a la base. Lo que
// dibuja está en `components/proveedores/LoQuePideTrabajo.tsx` y no decide nada.
//
// ═══ LAS TRES REGLAS QUE HACE CUMPLIR ═══
//
//   CERO NO SE DIBUJA. Nada que resolver es silencio normal: una fila que dice «0 sin CUIT» ocupa
//   la primera línea de la pantalla para no pedir nada.
//
//   NULL SÍ SE DIBUJA. Una señal que no se pudo contar NO se omite: omitirla dibuja una sección sin
//   pendientes, que es la afirmación que la pantalla no puede hacer. Va con la cifra en ausencia y
//   con el obstáculo escrito — lo que bloquea, ahí, es que el OS no puede confirmar que no hay nada.
//
//   EL VERBO ATERRIZA EN EL FILTRO QUE PRODUJO EL NÚMERO. Un aviso que dice «14 sin CUIT» y cae en
//   la lista completa de 36 obliga a buscar a mano los 14 que acaba de contar.

export interface SenalDeTrabajo {
  clave: string
  /** `null` = no se pudo contar. Nunca 0 por ausencia de lectura. */
  numero: number | null
  texto: string
  /** Qué se pierde mientras esto siga así, en consecuencia de negocio y no en jerga de base. */
  bloquea: string
  /** El verbo, sin flecha: la flecha la pone la fila. */
  accion: string
  href: string
}

/** Lo que la página sabe de cada frente: el número, o el error que impidió contarlo. */
export interface LecturaSenal {
  data: number | null
  error: string | null
}

export interface HrefsDeSenal {
  sinCuit: string
  sinResolver: string
}

export function armarSenales(
  sinCuit: LecturaSenal,
  sinResolver: LecturaSenal,
  hrefs: HrefsDeSenal,
): SenalDeTrabajo[] {
  const s: SenalDeTrabajo[] = []

  if (sinCuit.error) {
    s.push({
      clave: 'sin-cuit', numero: null, texto: 'proveedores sin CUIT',
      bloquea: 'No pude contarlos: esta pantalla no puede afirmar que estén todos',
      accion: 'Revisar', href: hrefs.sinCuit,
    })
  } else if ((sinCuit.data ?? 0) > 0) {
    const n = sinCuit.data ?? 0
    s.push({
      clave: 'sin-cuit', numero: n,
      texto: n === 1 ? 'proveedor sin CUIT' : 'proveedores sin CUIT',
      bloquea: n === 1 ? 'No cruza con ARCA ni con el banco' : 'No cruzan con ARCA ni con el banco',
      accion: 'Cargar CUIT', href: hrefs.sinCuit,
    })
  }

  if (sinResolver.error) {
    s.push({
      clave: 'sin-resolver', numero: null, texto: 'nombres de Compras sin resolver',
      bloquea: 'No pude contarlos: esta pantalla no puede afirmar que no haya nada que resolver',
      accion: 'Revisar', href: hrefs.sinResolver,
    })
  } else if ((sinResolver.data ?? 0) > 0) {
    const n = sinResolver.data ?? 0
    s.push({
      clave: 'sin-resolver', numero: n,
      texto: n === 1 ? 'nombre de Compras sin resolver' : 'nombres de Compras sin resolver',
      bloquea: 'El gasto queda fuera de la cuenta del proveedor',
      accion: 'Resolver', href: hrefs.sinResolver,
    })
  }

  return s
}

/**
 * El resumen de la cabecera: cuántas señales y cuántos registros hay detrás (`22v2:365`).
 *
 * Con alguna señal sin contar el total de registros sería un PISO, no un total: se dice que lo es
 * en vez de publicar un número con forma de completo.
 */
export function resumirTrabajo(senales: SenalDeTrabajo[]): string {
  if (senales.length === 0) return 'nada pendiente'
  const contadas = senales.filter((s) => s.numero !== null)
  const registros = contadas.reduce((a, s) => a + (s.numero ?? 0), 0)
  const senal = `${senales.length} ${senales.length === 1 ? 'señal' : 'señales'}`
  if (contadas.length !== senales.length) return `${senal} · al menos ${registros} registros`
  return `${senal} · ${registros} ${registros === 1 ? 'registro' : 'registros'}`
}
