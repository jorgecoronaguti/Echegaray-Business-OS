#!/usr/bin/env python3
"""
UNA PÁGINA DE PDF A IMAGEN, PARA QUE UN MODELO PUEDA MIRARLA.

Sólo se usa cuando la página NO tiene capa de texto: si la tiene, leerla cuesta milisegundos y
mirarla cuesta segundos de CPU. La resolución es la decisión importante — a 72 DPI el modelo no
distingue un 3 de un 8, y a 300 DPI la imagen no entra en la ventana del modelo y además tarda el
triple. 150 DPI es el punto donde un documento A4 escaneado se lee entero.

  python3 rasterizar.py <archivo.pdf> <destino.png> [--pagina 1] [--dpi 150] [--max-lado 1600]
"""
import sys, json

DPI = 150
# Ningún lado por encima de esto. Un plano A0 a 150 DPI son 7.000 px de ancho: el modelo lo reduce
# igual, y el costo de generarlo y moverlo se paga para nada.
MAX_LADO = 1600


def rasterizar(pdf, destino, pagina=1, dpi=DPI, max_lado=MAX_LADO):
    import fitz
    doc = fitz.open(pdf)
    if pagina < 1 or pagina > doc.page_count:
        raise ValueError(f"la página {pagina} no existe (el documento tiene {doc.page_count})")
    p = doc.load_page(pagina - 1)
    escala = dpi / 72.0
    ancho = p.rect.width * escala
    alto = p.rect.height * escala
    if max(ancho, alto) > max_lado:
        escala *= max_lado / max(ancho, alto)
    pix = p.get_pixmap(matrix=fitz.Matrix(escala, escala), alpha=False)
    pix.save(destino)
    doc.close()
    return {"ok": True, "ruta": destino, "ancho": pix.width, "alto": pix.height,
            "dpi_efectivo": round(72 * escala, 1)}


if __name__ == "__main__":
    a = sys.argv[1:]
    kw = {}
    for k, n in (("--pagina", "pagina"), ("--dpi", "dpi"), ("--max-lado", "max_lado")):
        if k in a:
            kw[n] = int(a[a.index(k) + 1])
    try:
        print(json.dumps(rasterizar(a[0], a[1], **kw)))
    except Exception as e:
        print(json.dumps({"ok": False, "error": f"{type(e).__name__}: {e}"}))
        sys.exit(1)
