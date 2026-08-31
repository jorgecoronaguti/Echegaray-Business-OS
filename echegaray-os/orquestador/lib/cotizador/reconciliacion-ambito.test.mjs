// LA RECONCILIACIÓN, CONTRA EL ÁMBITO REAL DE ARCOR · FILTRO SANITARIO.
//
// El caso es de regresión, no de laboratorio: los cuatro documentos son los que ARCOR mandó, leídos
// y guardados en `datos/conocimiento/ambito-arcor-filtro-sanitario.json`. Ninguno de los números de
// abajo está escrito a mano en el motor — todos salen de sumar los importes que las planillas
// declaran, y por eso la IDENTIDAD del primer test es la prueba fuerte: si el motor emparejara de
// más o de menos, la identidad se rompe y no hay forma de acomodarla sin romper otra cosa.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { versionOperativa } from './ambito-planillas.mjs'
import { reconciliarAmbito, VEREDICTO } from './reconciliacion-ambito.mjs'

const ARCOR = JSON.parse(readFileSync(new URL('../../datos/conocimiento/ambito-arcor-filtro-sanitario.json', import.meta.url), 'utf8'))
const version = versionOperativa(ARCOR)
const otraVersion = version.versiones.find((v) => v.nombre !== version.elegido.nombre)
const rec = reconciliarAmbito({ rige: version.elegido, contra: otraVersion })

const de = (v) => rec.renglones.filter((r) => r.veredicto === v)

// ══════════════════════════════════════════════════════════════════════════════════════════════
// ARCOR · LA BRECHA DE $ 31.882.681 SE DESCOMPONE, Y LA CUENTA CIERRA
// ══════════════════════════════════════════════════════════════════════════════════════════════

test('ARCOR · el motor encuentra SOLO la brecha entre los dos cómputos del ámbito', () => {
  // El número es el que ya medía `ambito-planillas.mjs`, y no está escrito en ninguna parte del
  // código: es la resta de los totales que las dos planillas declaran.
  assert.equal(Math.round(version.conflicto.brecha), 31_882_681)
  assert.equal(version.elegido.nombre, 'ARSJ Planilla de computo - Filtro Sanitario ESTRUCTURAS METALICAS - FINAL FINAL.xlsx')
  assert.equal(version.elegido.items, 12)
  assert.equal(otraVersion.items, 22)
})

test('ARCOR · la brecha se explica renglón por renglón, y la identidad cierra al peso', () => {
  // ═══ LA PRUEBA QUE NO SE PUEDE ACOMODAR ═══
  //
  //   lo que el cliente pidió y no se cotizó      − lo que se cotizó y el cliente no pidió = brecha
  //
  // Cada término sale de renglones distintos del motor. Si el emparejamiento fuera de más (dos ítems
  // parecidos dados por el mismo) o de menos, los dos términos se mueven y la identidad se rompe.
  const pedidoYNoCotizado = rec.resumen[VEREDICTO.EXCLUDED].plata
  // Lo que se cotiza y el pedido no lista: los UNRESOLVED sin par, más la parte de la DIFFERENCE que
  // excede a lo pedido.
  const soloEnLoQueRige = de(VEREDICTO.UNRESOLVED).reduce((a, r) => a + r.plata, 0)
    + de(VEREDICTO.DIFFERENCE).reduce((a, r) => a + (r.plata - r.pedido.importe), 0)
  assert.equal(Math.round(pedidoYNoCotizado - soloEnLoQueRige), Math.round(version.conflicto.brecha))
  // Y los dos términos, con su nombre, que es lo que se lleva a la reunión con el cliente:
  assert.equal(Math.round(pedidoYNoCotizado), 43_134_186)
  assert.equal(Math.round(soloEnLoQueRige), 11_251_505)
})

test('ARCOR · el reparto por veredicto es el que la evidencia sostiene', () => {
  assert.equal(rec.resumen[VEREDICTO.EXCLUDED].n, 21, '21 de los 22 ítems del pedido no están en el cómputo que rige')
  assert.equal(rec.resumen[VEREDICTO.DIFFERENCE].n, 1)
  assert.equal(rec.resumen[VEREDICTO.UNRESOLVED].n, 11)
  assert.equal(rec.resumen[VEREDICTO.MATCH].n, 0, 'CERO coincidencias exactas: los dos documentos son de alcances distintos y el motor NO los fuerza a coincidir')
  assert.equal(rec.resumen[VEREDICTO.CONFLICT].n, 0)
})

test('ARCOR · el único ítem que existe en los dos está computado distinto, y el motor lo dice', () => {
  // Es el hallazgo del caso, y nadie lo había mirado: el cielorraso suspendido del ítem 1.8 está
  // computado 35 m² en lo que se cotizó y 27 m² en el pedido del cliente. 8 m² de diferencia sobre
  // el mismo renglón textualmente idéntico.
  const d = de(VEREDICTO.DIFFERENCE)[0]
  assert.equal(d.rige.item, '1.8')
  assert.equal(d.evidencia.cantidadRige, 35)
  assert.equal(d.evidencia.cantidadPedido, 27)
  assert.equal(d.evidencia.delta, 8)
  assert.match(d.porQue, /35 m2 en el que rige y 27/)
  // Y la cita de las dos planillas viaja: hoja, fila e ítem de cada una.
  assert.equal(d.rige.documento, version.elegido.nombre)
  assert.equal(d.pedido.documento, otraVersion.nombre)
  assert.ok(Number.isInteger(d.rige.fila) && Number.isInteger(d.pedido.fila))
})

// ══════════════════════════════════════════════════════════════════════════════════════════════
// LOS NEGATIVOS — lo que el motor NO puede hacer
// ══════════════════════════════════════════════════════════════════════════════════════════════

const grilla = (nombre, items) => ({ nombre, items: items.length, lectura: { ok: true, items } })
const it = (o) => ({ hoja: 'Planilla de cotización', fila: 10, item: '1.1', ...o })

test('NEGATIVO · SIMILAR ≠ MISMA PARTIDA: dos ítems parecidos NO dan MATCH', () => {
  // «columnas C1 de perfil 100x100x2,50mm» y «columnas C1 de perfil 120x120x3,20mm» comparten casi
  // todas las palabras y son dos piezas distintas. Emparejarlas por parecido haría desaparecer la
  // diferencia del informe, que es exactamente cómo se concilia de más.
  const r = reconciliarAmbito({
    rige: grilla('rige.xlsx', [it({ descripcion: 'Fabricación y montaje de columnas C1 de perfil sección 100x100x2,50mm', unidad: 'kg', cantidad: 161.26, importe: 1_000_000 })]),
    contra: grilla('pedido.xlsx', [it({ descripcion: 'Fabricación y montaje de columnas C1 de perfil sección 120x120x3,20mm', unidad: 'kg', cantidad: 161.26, importe: 1_000_000 })]),
  })
  assert.equal(r.resumen[VEREDICTO.MATCH].n, 0)
  const u = de2(r, VEREDICTO.UNRESOLVED)[0]
  assert.ok(u, 'el ítem tiene que quedar sin resolver, no emparejado')
  // Y el parecido NO se esconde: se ofrece como candidato para que lo mire una persona.
  assert.ok(u.evidencia.candidatoParecido.parecido >= 0.6)
  assert.match(u.evidencia.candidatoParecido.descripcion, /120x120x3,20mm/)
  // MUTACIÓN CORRIDA: en `reconciliacion-ambito.mjs`, cambiar `claveDe` por
  //   `\`${normal(i?.unidad)}|${normal(i?.descripcion).split(' ').slice(0, 6).join(' ')}\`` — o sea,
  //   emparejar por las primeras seis palabras. FALLA: «Expected values to be strictly equal:
  //   1 !== 0» sobre el conteo de MATCH: dos perfiles distintos pasan a ser el mismo ítem.
})

test('NEGATIVO · la misma descripción en DOS unidades es un CONFLICT, no una diferencia de cantidad', () => {
  const r = reconciliarAmbito({
    rige: grilla('rige.xlsx', [it({ descripcion: 'Montaje de chapa T101 en cubierta', unidad: 'm2', cantidad: 120, importe: 900_000 })]),
    contra: grilla('pedido.xlsx', [it({ descripcion: 'Montaje de chapa T101 en cubierta', unidad: 'kg', cantidad: 340, importe: 900_000 })]),
  })
  const c = de2(r, VEREDICTO.CONFLICT)[0]
  assert.ok(c, 'una unidad contra otra no se resuelve eligiendo una')
  assert.equal(c.evidencia.unidadRige, 'm2')
  assert.equal(c.evidencia.unidadPedido, 'kg')
  assert.match(c.porQue, /da un número sin significado/)
  assert.equal(r.resumen[VEREDICTO.DIFFERENCE].n, 0, '120 contra 340 NO es una diferencia de 220: son unidades distintas')
  assert.equal(r.issues.filter((i) => i.severity === 'BLOQUEANTE').length, 1)
})

test('NEGATIVO · una cantidad ausente NO es una cantidad de cero: sale UNRESOLVED', () => {
  const r = reconciliarAmbito({
    rige: grilla('rige.xlsx', [it({ descripcion: 'Provisión de junta compriband', unidad: 'ml', cantidad: null, importe: 400_000 })]),
    contra: grilla('pedido.xlsx', [it({ descripcion: 'Provisión de junta compriband', unidad: 'ml', cantidad: 60, importe: 400_000 })]),
  })
  assert.equal(r.resumen[VEREDICTO.MATCH].n, 0)
  assert.equal(r.resumen[VEREDICTO.DIFFERENCE].n, 0, 'null contra 60 no es una diferencia de 60')
  assert.match(de2(r, VEREDICTO.UNRESOLVED)[0].porQue, /NO es una cantidad de cero/)
})

test('NEGATIVO · un ítem sin importe no vale $ 0: la plata del veredicto sale null y se cuenta aparte', () => {
  const r = reconciliarAmbito({
    rige: grilla('rige.xlsx', []),
    contra: grilla('pedido.xlsx', [it({ descripcion: 'Traslado de equipos a obra', unidad: 'gl', cantidad: 1 })]),
  })
  assert.equal(r.resumen[VEREDICTO.EXCLUDED].n, 1)
  assert.equal(r.resumen[VEREDICTO.EXCLUDED].plata, null, 'un ítem excluido sin importe legible no hace que la exclusión valga cero')
  assert.equal(r.resumen[VEREDICTO.EXCLUDED].sinValorizar, 1, 'sin este contador, «plata null» y «no había ítems» se leen igual')
  // MUTACIÓN CORRIDA: en `resumirYAvisar`, cambiar `return con.length ? … : null` por
  //   `return con.reduce((a, r) => a + Number(r.plata ?? 0), 0)`. FALLA: «un ítem excluido sin
  //   importe legible no hace que la exclusión valga cero: 0 !== null».
})

test('CLIENT_SUPPLIED gana sobre el MATCH: un ítem que coincide perfecto puede pagar dos veces', () => {
  // El ítem es idéntico en los dos documentos —sería un MATCH— y su análisis compra la puerta que el
  // cliente ya compró. Publicarlo como MATCH sería declarar conciliado un renglón que paga de más.
  const item = it({ item: '5.3', descripcion: 'Montaje de puerta de rebatir P1. Puerta provista por el cliente', unidad: 'un', cantidad: 1, importe: 800_000 })
  const r = reconciliarAmbito({
    rige: grilla('rige.xlsx', [item]),
    contra: grilla('pedido.xlsx', [item]),
    suministros: {
      conChoque: [{
        elemento: '5.3', codigo: 'T1064', plataEnRiesgo: 2_894_561,
        declarados: [{ literal: 'Puerta provista por el cliente' }],
        lineas: [{ recursoCodigo: 'MAT-PUE', nombre: 'Puerta de aluminio', cantidad: 1 }],
        porQue: 'el ítem dice «Puerta provista por el cliente» y T1064 compra 1 de esos materiales',
      }],
    },
  })
  assert.equal(r.resumen[VEREDICTO.MATCH].n, 0)
  assert.equal(r.resumen[VEREDICTO.CLIENT_SUPPLIED].n, 1)
  assert.equal(r.resumen[VEREDICTO.CLIENT_SUPPLIED].plata, 2_894_561)
  assert.equal(r.issues[0].severity, 'BLOQUEANTE')
  assert.equal(r.issues[0].impact, 2_894_561)
  // MUTACIÓN CORRIDA: en `renglonDeRige`, mover el `if (choque)` DESPUÉS de la rama del MATCH.
  //   FALLA: «Expected values to be strictly equal: 1 !== 0» sobre el conteo de MATCH.
})

test('con un solo cómputo no se reconcilia, y eso se DICE — no sale todo en verde', () => {
  const r = reconciliarAmbito({ rige: grilla('rige.xlsx', [it({ descripcion: 'x', unidad: 'gl', cantidad: 1 })]), contra: null })
  assert.equal(r.renglones.length, 0)
  assert.equal(r.resumen, null, 'un resumen con seis ceros diría que se miró y no había nada')
  assert.match(r.porQue, /hacen falta DOS cómputos/)
})

/** Los renglones de un veredicto, para las reconciliaciones locales de los negativos. */
function de2(r, v) { return r.renglones.filter((x) => x.veredicto === v) }

test('el choque se encuentra por FILA, no sólo por número de ítem', () => {
  // `barrerSuministros` indexa por el ID DEL CÓMPUTO —un id interno—, no por el «5.3» de la grilla.
  // Buscarlo sólo por `item` daba CERO choques sobre ARCOR mientras el barrido encontraba uno de
  // $ 2.894.561: la reconciliación publicaba «0 CLIENT_SUPPLIED» al lado del hallazgo que sí existía.
  const item = it({ item: '1.2', fila: 11, descripcion: 'Provisión de placas de acero. Materiales a cargo de ARCOR', unidad: 'kg', cantidad: 88, importe: 700_000 })
  const choque = {
    elemento: 'computo-a3f9-interno', fila: 11, codigo: 'T1111.1', plataEnRiesgo: 2_894_561,
    declarados: [{ literal: 'Materiales a cargo de ARCOR' }], lineas: [{ recursoCodigo: 'MAT-P', nombre: 'Perfil C', cantidad: 6 }],
    porQue: 'el ítem dice «Materiales a cargo de ARCOR» y T1111.1 compra 6 de esos materiales',
  }
  const r = reconciliarAmbito({ rige: grilla('rige.xlsx', [item]), contra: grilla('pedido.xlsx', [item]), suministros: { conChoque: [choque] } })
  assert.equal(r.resumen[VEREDICTO.CLIENT_SUPPLIED].n, 1, 'el id interno del cómputo no coincide con «1.2»: la fila es lo único que las dos vistas comparten')
  assert.equal(r.resumen[VEREDICTO.CLIENT_SUPPLIED].plata, 2_894_561)
  assert.equal(r.resumen[VEREDICTO.MATCH].n, 0)
  // MUTACIÓN CORRIDA: en `reconciliacion-ambito.mjs`, volver a
  //   `const choqueDe = (i) => conChoque.get(\`item:${String(i?.item)}\`) ?? null`.
  //   FALLA: «el id interno del cómputo no coincide con «1.2»: la fila es lo único que las dos vistas
  //   comparten: 0 !== 1».
})
