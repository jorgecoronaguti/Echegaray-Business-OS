// EL CONTRATO DE UNA OBRA NUEVA SE SIEMBRA DEL PAPEL QUE YA ESTÁ, Y SI NO HAY PAPEL NO SE INVENTA.
//
// Caso real, 29/09/2026: OB-0072 y OB-0073 se dieron de alta sin fila en `obra_contrato`. Por la
// regla «o suma completa o nada», esa sola obra sin precio anuló el «Contratado en ejecución» de
// Messina entero. `presupuestos.obra_id` (uuid) queda null, así que el alta no heredaba nada; el
// vínculo real es `presupuestos.obra_canonica_id` y `cliente_orden.obra_id`.
//
// Esta decisión es PURA y va aparte de la escritura para poder probarla sin base. Reglas:
//
//   1. El presupuesto aprobado manda: su monto ya es NETO de IVA (es el precio de venta), que es
//      lo que `obra_contrato` guarda. Si hay dos aprobados con montos distintos no se elige uno:
//      no se sabe cuál es el vigente.
//   2. La OC sólo entra si dice que su importe es NETO. Una OC con IVA obligaría a suponer la
//      alícuota (21 %, 10,5 %) y eso es una decisión fiscal que este código no toma.
//   3. Moneda distinta de pesos: no se siembra. `presupuestos.monto_presupuestado` no dice en qué
//      moneda quedó guardado el original y convertirlo sería fabricar el número.
//   4. Sin origen utilizable: NO se crea la fila (nunca con 0: «un total de cero no es una base»,
//      20260911T0930) y se devuelve el motivo, para que la pantalla lo diga.
//
// El desglose mano de obra / materiales NO lo sabe ningún origen que no sea el papel mismo. Se asienta
// el total en `mano_obra` (la tabla exige al menos un componente) y la `nota` lo declara como
// tal: es un total sin desglosar, no una afirmación de que los materiales valgan cero.

export interface PresupuestoAprobado {
  id: string
  version: number | null
  monto: number | null
  moneda_original: string | null
}

export interface OrdenDeCompra {
  id: string
  numero: string | null
  importe: number | null
  moneda: string | null
  importe_es_neto: boolean | null
  drive_file_id: string | null
  nombre_archivo: string | null
}

export interface FilaContrato {
  mano_obra: number
  materiales: null
  fuente_tipo: 'presupuesto' | 'oc'
  fuente_drive_id: string | null
  fuente_nombre: string | null
  cita: string
  nota: string
}

export type DecisionContrato =
  | { tipo: 'crear'; fila: FilaContrato }
  | { tipo: 'sin_precio'; motivo: string }

const NOTA_SIN_DESGLOSE =
  'Alta de obra: total del origen asentado en mano_obra SIN desglosar; materiales NULL = el papel aún no los separa. ' +
  'Corregir el desglose desde el papel cuando se lo lea.'

const esPesos = (m: string | null): boolean => m === null || m.toUpperCase() === 'ARS'
const positivo = (n: number | null): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0
const $ = (n: number): string => n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function desdePresupuesto(aprobados: PresupuestoAprobado[]): DecisionContrato | null {
  if (aprobados.length === 0) return null
  const con = aprobados.filter((p) => positivo(p.monto))
  if (con.length === 0) return { tipo: 'sin_precio', motivo: 'El presupuesto aprobado no tiene monto cargado.' }
  if (con.some((p) => !esPesos(p.moneda_original))) {
    return { tipo: 'sin_precio', motivo: 'El presupuesto aprobado no está en pesos: cargá el contrato a mano.' }
  }
  const montos = new Set(con.map((p) => p.monto))
  if (montos.size > 1) {
    return { tipo: 'sin_precio', motivo: 'Hay más de un presupuesto aprobado con montos distintos: no se sabe cuál es el vigente.' }
  }
  const p = con[0]
  return {
    tipo: 'crear',
    fila: {
      mano_obra: p.monto as number,
      materiales: null,
      fuente_tipo: 'presupuesto',
      fuente_drive_id: null,
      fuente_nombre: null,
      cita: `Presupuesto aprobado ${p.id}${p.version ? ` v${p.version}` : ''}: venta neta $${$(p.monto as number)}.`,
      nota: NOTA_SIN_DESGLOSE,
    },
  }
}

function desdeOrden(ordenes: OrdenDeCompra[]): DecisionContrato | null {
  if (ordenes.length === 0) return null
  if (ordenes.length > 1) {
    return { tipo: 'sin_precio', motivo: 'Hay más de una orden de compra y ningún presupuesto aprobado: no se sabe si suman o se reemplazan.' }
  }
  const o = ordenes[0]
  if (!positivo(o.importe)) return { tipo: 'sin_precio', motivo: 'La orden de compra no tiene importe cargado.' }
  if (!esPesos(o.moneda)) return { tipo: 'sin_precio', motivo: 'La orden de compra no está en pesos: cargá el contrato a mano.' }
  if (o.importe_es_neto !== true) {
    return { tipo: 'sin_precio', motivo: 'La orden de compra trae el importe con IVA: falta el neto para el contrato.' }
  }
  return {
    tipo: 'crear',
    fila: {
      mano_obra: o.importe,
      materiales: null,
      fuente_tipo: 'oc',
      fuente_drive_id: o.drive_file_id,
      fuente_nombre: o.nombre_archivo,
      cita: `OC ${o.numero ?? o.id}: importe neto $${$(o.importe)}.`,
      nota: NOTA_SIN_DESGLOSE,
    },
  }
}

/** Presupuesto aprobado primero, después la OC; si ninguno existe, el motivo es «sin origen». */
export function decidirContratoDeAlta(
  aprobados: PresupuestoAprobado[], ordenes: OrdenDeCompra[],
): DecisionContrato {
  return desdePresupuesto(aprobados) ?? desdeOrden(ordenes) ??
    { tipo: 'sin_precio', motivo: 'Sin presupuesto aprobado ni orden de compra vinculados a la obra.' }
}
