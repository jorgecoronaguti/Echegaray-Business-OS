// UN PROVEEDOR NUEVO EN `public.proveedores`: LA IDENTIDAD ES EL CUIT, NUNCA EL NOMBRE.
//
// El padrón lo consumen dos cruces que rompen en silencio si la ficha nace con el CUIT equivocado:
// `gmail-transferencias-proveedores.mjs` cuelga cada comprobante de transferencia POR CUIT, y la
// carga de Compras matchea el proveedor del papel contra el padrón. Una ficha con un dígito mal no
// da error: deja los papeles en `sin-proveedor/` para siempre.
//
// POR ESO EL DÍGITO VERIFICADOR SE MIRA ACÁ Y NO EN `documentos/campos.mjs`. Allá se calcula para
// PUNTUAR una lectura dudosa; acá decide si la ficha nace o no. Caso real del 10/09/2026: la visión
// leyó 30-71965694-4 en la factura de A.C.SAT (DV no cierra) y el dueño escribió 30-71096504-4 (DV
// cierra). Sin esta guarda se creaba la ficha con el CUIT inventado por el OCR y las transferencias
// del mail no se colgaban nunca.

import { cuitValido } from '../documentos/campos.mjs'

export const ALTA = {
  crear: 'crear',
  ya_esta: 'ya_esta',            // el CUIT ya tiene ficha: no se duplica ni se pisa el nombre
  cuit_invalido: 'cuit_invalido', // el DV no cierra: NO se crea, se pide el CUIT de una fuente firme
  sin_cuit: 'sin_cuit',          // el papel no lo trae: se crea igual, marcado, y alguien lo completa
}

const soloDigitos = (c) => String(c ?? '').replace(/\D/g, '')

/**
 * @param {Array<{nombre:string, razon_social?:string, cuit?:string|null, fuente:string}>} pedidos
 * @param {Array<{id?:string, nombre:string, cuit:string|null}>} padron
 */
export function planDeAltas(pedidos = [], padron = []) {
  const porCuit = new Map(padron.filter((p) => soloDigitos(p.cuit).length === 11)
    .map((p) => [soloDigitos(p.cuit), p]))
  return pedidos.map((p) => {
    const cuit = soloDigitos(p.cuit)
    if (!cuit) return { ...p, cuit: null, accion: ALTA.sin_cuit }
    if (!cuitValido(cuit)) return { ...p, cuit, accion: ALTA.cuit_invalido }
    const ya = porCuit.get(cuit)
    if (ya) return { ...p, cuit, accion: ALTA.ya_esta, existente: ya.nombre }
    return { ...p, cuit, accion: ALTA.crear }
  })
}
