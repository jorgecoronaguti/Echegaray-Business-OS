// EL SELECTOR DE OBRAS DEL CRONOGRAMA — agrupado por cliente, no en una fila plana.
//
// ═══ EL DEFECTO QUE ARREGLA ═══
//
// El dueño (26/08/2026), textual: *"es un desastre lo hecho en el manejo del cronograma mezcla todas
// las obras"*. La pantalla traía TODAS las obras de TODOS los clientes ordenadas por `estado` y luego
// por `nombre`: dos obras de ARCOR quedaban separadas por una de Messinas porque una está activa y la
// otra contratada, y de ninguna se veía de quién era salvo por una línea gris de 11px al costado.
//
// Editar el cronograma equivocado no es un error de navegación: es publicarle a un cliente los cobros
// de otro. El agrupamiento por cliente no es cosmética, es la barrera contra ese error.
//
// ═══ POR QUÉ LAS CERRADAS AL FINAL Y NO FUERA ═══
//
// Una obra cerrada todavía tiene cronograma que corregir —el fondo de reparo se devuelve meses
// después del cierre— así que sacarla de la lista dejaría ese cobro sin pantalla. Va al final del
// grupo y ROTULADA: quien la elige sabe que la eligió.
//
// Sin imports de React ni de Supabase a propósito: se prueba con `node --test`, sin base ni navegador.

/** Una obra tal como la necesita el selector. `cliente` null = la obra no tiene cliente cargado. */
export interface ObraDelSelector {
  id: string
  nombre: string
  estado: string | null
  cliente: string | null
}

export interface GrupoDeCliente {
  cliente: string
  obras: ObraDelSelector[]
}

/** El grupo de las obras sin cliente. Existe y se nombra: esconderlas las volvería ineditables. */
export const SIN_CLIENTE = 'Sin cliente asignado'

/**
 * EL NOMBRE DEL CLIENTE, COMO SE LEE.
 *
 * Hay razones sociales cargadas entre paréntesis —`(Messinas)`— y el paréntesis no es parte del
 * nombre: es un resto de cómo entró el dato. Se saca acá, una vez, y no en cada pantalla que lo
 * dibuja. Vacío o null NO es un cliente llamado "": es la ausencia, y se nombra.
 */
export function nombreDeCliente(crudo: string | null | undefined): string {
  const limpio = (crudo ?? '').trim().replace(/^\((.*)\)$/, '$1').trim()
  return limpio || SIN_CLIENTE
}

/** `estado` viene de `obras.estado in ('contratada','activa','pausada','cerrada')`. */
export function estaCerrada(estado: string | null | undefined): boolean {
  return (estado ?? '').trim().toLowerCase() === 'cerrada'
}

/** Lo que se lee dentro del `<option>`. La obra cerrada lo dice, porque elegirla suele ser un error. */
export function rotuloDeObra(o: Pick<ObraDelSelector, 'nombre' | 'estado'>): string {
  return estaCerrada(o.estado) ? `${o.nombre} — cerrada` : o.nombre
}

/**
 * LAS OBRAS AGRUPADAS POR CLIENTE, listas para pintar `<optgroup>`.
 *
 * Orden: clientes alfabéticos y «Sin cliente asignado» SIEMPRE al final —es una anomalía a resolver,
 * no un cliente más—; dentro de cada uno, las abiertas antes que las cerradas y alfabéticas.
 */
export function agruparPorCliente(obras: readonly ObraDelSelector[]): GrupoDeCliente[] {
  const por = new Map<string, ObraDelSelector[]>()
  for (const o of obras) {
    const cliente = nombreDeCliente(o.cliente)
    por.set(cliente, [...(por.get(cliente) ?? []), { ...o, cliente }])
  }
  return [...por.entries()]
    .map(([cliente, suyas]) => ({
      cliente,
      obras: suyas.sort(
        (a, b) => Number(estaCerrada(a.estado)) - Number(estaCerrada(b.estado)) || a.nombre.localeCompare(b.nombre, 'es'),
      ),
    }))
    .sort((a, b) => {
      if (a.cliente === SIN_CLIENTE) return 1
      if (b.cliente === SIN_CLIENTE) return -1
      return a.cliente.localeCompare(b.cliente, 'es')
    })
}

/**
 * DE QUIÉN ES LA OBRA QUE SE ESTÁ EDITANDO. `null` = no está en la lista.
 *
 * El encabezado del editor lo necesita: sin él la tabla dice el nombre de la obra y nada más, y
 * «Nave 2» no alcanza para saber a qué cliente se le va a publicar lo que se guarde.
 */
export function ubicarObra(grupos: readonly GrupoDeCliente[], obraId: string | null | undefined): ObraDelSelector | null {
  if (obraId == null || obraId === '') return null
  for (const g of grupos) {
    const encontrada = g.obras.find((o) => o.id === obraId)
    if (encontrada) return encontrada
  }
  return null
}
