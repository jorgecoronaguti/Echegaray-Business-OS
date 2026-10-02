// QUÉ CAMPOS LLEVA CADA REVISIÓN — puro: sin React, sin base.
//
// Antes el formulario era uno solo y sólo cambiaba algún rótulo: un seguro mostraba kilometraje y «resultado»,
// un service pedía «vence». Cada papel dice cosas distintas: la RTO trae oblea, planta y resultado; la póliza
// trae número, compañía y vigencia; el service trae lectura (km u horas), taller y la fecha del próximo.
// Lo que un tipo no lleva NO se dibuja y NO se manda: un campo oculto con un valor viejo no viaja.

import type { ClaseRevisable, ResultadoRevision, TipoRevision } from './revision.ts'

export interface CamposRevision {
  /** «Cargar RTO», «Cargar seguro»…: lo que dice el encabezado del formulario y el botón. */
  titulo: string
  guardar: string
  fecha: string
  vence: string
  /** Sin vencimiento no se puede avisar cuando esté por vencer: se avisa, NO se bloquea el guardado. */
  venceImporta: boolean
  lectura: string | null
  numero: string | null
  lugar: string | null
  costo: boolean
  resultado: boolean
  foto: string
}

export function camposDe(tipo: TipoRevision, clase: ClaseRevisable): CamposRevision {
  const lectura = clase === 'rodado' ? 'Kilometraje' : 'Horas del horómetro'
  switch (tipo) {
    case 'rto':
      return {
        titulo: 'Cargar RTO', guardar: 'Guardar RTO', fecha: 'Fecha de la revisión', vence: 'Vence', venceImporta: true,
        lectura, numero: 'N° de certificado / oblea', lugar: 'Planta de RTO', costo: true, resultado: true, foto: 'Foto del certificado',
      }
    case 'seguro':
      return {
        titulo: 'Cargar seguro', guardar: 'Guardar seguro', fecha: 'Vigente desde', vence: 'Vence la póliza', venceImporta: true,
        lectura: null, numero: 'N° de póliza', lugar: 'Compañía', costo: true, resultado: false, foto: 'Foto de la póliza',
      }
    case 'service':
      return {
        titulo: 'Cargar service', guardar: 'Guardar service', fecha: 'Fecha del service', vence: 'Próximo service (fecha)', venceImporta: false,
        lectura: `${lectura} del service`, numero: 'N° de orden o remito', lugar: 'Taller', costo: true, resultado: false, foto: 'Foto del remito o ticket',
      }
    case 'inspeccion':
      return {
        titulo: 'Cargar inspección', guardar: 'Guardar inspección', fecha: 'Fecha de la inspección', vence: 'Próxima inspección', venceImporta: false,
        lectura, numero: 'N° de informe', lugar: 'Quién inspeccionó', costo: false, resultado: true, foto: 'Foto del informe',
      }
  }
}

export interface ValoresRevision {
  fecha: string
  vencimiento: string
  lectura: string
  resultado: ResultadoRevision | ''
  lugar: string
  numero: string
  costo: string
  observaciones: string
}

/** Sólo lo que el tipo lleva: lo demás va vacío aunque la pantalla haya guardado algo al cambiar de tipo. */
export function valoresParaEnviar(tipo: TipoRevision, clase: ClaseRevisable, v: ValoresRevision): ValoresRevision {
  const c = camposDe(tipo, clase)
  return {
    fecha: v.fecha,
    vencimiento: v.vencimiento,
    lectura: c.lectura ? v.lectura : '',
    resultado: c.resultado ? v.resultado : '',
    lugar: c.lugar ? v.lugar : '',
    numero: c.numero ? v.numero : '',
    costo: c.costo ? v.costo : '',
    observaciones: v.observaciones,
  }
}

/** Aviso que NO bloquea: se guarda igual (el vencimiento nunca fue obligatorio). */
export function avisoSinVencimiento(tipo: TipoRevision, clase: ClaseRevisable, v: Pick<ValoresRevision, 'vencimiento'>): string | null {
  return camposDe(tipo, clase).venceImporta && !v.vencimiento ? 'Sin vencimiento no se puede avisar cuando esté por vencer.' : null
}

/** Lo que falta antes de mandar, dicho en la pantalla. `null` = se puede guardar. */
export function faltaParaGuardar(tipo: TipoRevision, clase: ClaseRevisable, v: ValoresRevision): string | null {
  const c = camposDe(tipo, clase)
  if (!v.fecha) return `Falta la ${c.fecha.toLowerCase()}.`
  if (c.resultado && v.resultado === 'condicional' && !v.vencimiento) return 'Un apto condicional lleva el plazo de la nueva verificación: cargá «Vence».'
  return null
}
