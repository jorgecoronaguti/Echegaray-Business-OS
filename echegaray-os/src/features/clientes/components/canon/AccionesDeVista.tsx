'use client'

// LAS ACCIONES DE LA CABECERA, UNA FILA POR SOLAPA — `28:48`, `31:48`, `32:44`.
//
// Los cuadrados son de 31px con borde `#E7E6E2`; la primaria, amarilla `padding:7px 12px` a
// 12,5px/600. El 32 tiene además una secundaria blanca («Agregar pago») a la izquierda de la
// primaria. El orden y los `title` son los del mockup, palabra por palabra.

import { C, PRIMARIA, SECUNDARIA } from './tokens'
import { Ico, P } from './Iconos'
import { Boton, BotonIcono } from './Piezas'
import { pedir } from './pedidos'

export function AccionesCuenta() {
  return (
    <>
      <BotonIcono titulo="Ver como lo ve el cliente" onClick={() => pedir('ver-como-cliente')} testid="acc-ver-cliente">
        <Ico d={P.globo} s={16} />
      </BotonIcono>
      <BotonIcono titulo="Enviar recordatorio" onClick={() => pedir('recordatorio')} testid="acc-recordatorio">
        <Ico d={P.mail} s={16} />
      </BotonIcono>
      <BotonIcono titulo="Exportar estado de cuenta" onClick={() => pedir('exportar')} testid="acc-exportar">
        <Ico d={P.bajar} s={16} />
      </BotonIcono>
      <Boton estilo={PRIMARIA} hoverFondo={C.marcaHover} onClick={() => pedir('cobro')} testid="acc-cobro">
        <Ico d={P.ok} s={14} w={2.2} />
        Registrar cobro
      </Boton>
    </>
  )
}

export function AccionesEsquema() {
  return (
    <>
      <BotonIcono titulo="Ver como lo ve el cliente" onClick={() => pedir('ver-como-cliente')} testid="acc-ver-cliente">
        <Ico d={P.ojo} s={16} />
      </BotonIcono>
      <BotonIcono titulo="Descartar cambios" onClick={() => pedir('descartar-cambios')} testid="acc-descartar">
        <Ico d={P.volver} s={16} />
      </BotonIcono>
      <Boton estilo={SECUNDARIA} hoverFondo={C.superficie} onClick={() => pedir('agregar-pago')} testid="acc-agregar-pago">
        <Ico d={P.mas} s={14} w={2} />
        Agregar pago
      </Boton>
      <Boton estilo={PRIMARIA} hoverFondo={C.marcaHover} onClick={() => pedir('publicar')} testid="acc-publicar">
        <Ico d={P.publicar} s={14} w={2.2} />
        Publicar al cliente
      </Boton>
    </>
  )
}

export function AccionesAccesos() {
  return (
    <>
      <BotonIcono titulo="Registro de ingresos" onClick={() => pedir('ingresos')} testid="acc-ingresos">
        <Ico d={P.historial} s={16} />
      </BotonIcono>
      <BotonIcono titulo="Suspender el portal de este cliente" onClick={() => pedir('suspender')} testid="acc-suspender">
        <Ico d={P.pausa} s={16} />
      </BotonIcono>
      <Boton estilo={PRIMARIA} hoverFondo={C.marcaHover} onClick={() => pedir('agregar-mail')} testid="acc-agregar-mail">
        <Ico d={P.mas} s={14} w={2.2} />
        Agregar mail
      </Boton>
    </>
  )
}
