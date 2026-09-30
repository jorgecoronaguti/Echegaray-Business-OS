// EL LOGO EN UN PDF ARMADO CON pdf-lib. Regla del dueño: todo lo que se exporta o se imprime lleva el logo.
//
// Un solo helper para que cada PDF no reinvente el embebido: `embedPng` se hace UNA vez por documento
// (WeakMap) y cada página lo dibuja las veces que haga falta sin duplicar los 42 kB en el archivo.

import type { PDFDocument, PDFImage, PDFPage } from 'pdf-lib'
import { LOGO_ALTO, LOGO_ANCHO, logoPng } from './logoMarca.ts'

const embebidos = new WeakMap<PDFDocument, Promise<PDFImage>>()

/** Dibuja el logo con su esquina superior izquierda en (x, yArriba) y el alto dado; el ancho respeta la proporción. Devuelve el ancho usado. */
export async function dibujarLogoPdf(doc: PDFDocument, page: PDFPage, x: number, yArriba: number, alto: number): Promise<number> {
  let img = embebidos.get(doc)
  if (!img) { img = doc.embedPng(logoPng()); embebidos.set(doc, img) }
  const ancho = alto * (LOGO_ANCHO / LOGO_ALTO)
  page.drawImage(await img, { x, y: yArriba - alto, width: ancho, height: alto })
  return ancho
}
