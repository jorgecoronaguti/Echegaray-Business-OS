# RECORTAR UNA REGIÓN DE UN PDF A PNG, A LA RESOLUCIÓN QUE HAGA FALTA.
#
# Es lo único de todo el circuito que NO está en Node, y por una razón concreta: rasterizar un PDF
# necesita un motor de render, y el único que hay en esta VM es MuPDF (pymupdf 1.28, ya instalado).
# `pdfjs-dist` lee el PDF perfecto pero no lo dibuja sin un canvas nativo que acá no existe.
#
# QUIÉN DECIDE QUÉ: las regiones las decide `segmentar.mjs`, que es puro, determinístico y está
# probado. Este archivo NO decide nada — recibe una caja en coordenadas de PDF y devuelve un PNG.
# Esa separación es a propósito: el criterio se audita en Node y el pixel se produce acá.
#
# Uso:  python3 recortar.py <pdf> <salida.png> <pagina> <x0> <y0> <x1> <y1> <dpi>
#
# LAS COORDENADAS ENTRAN EN EL SISTEMA DE pdfjs (origen abajo a la izquierda, que es el del PDF) y
# acá se dan vuelta al de MuPDF (origen arriba). Confundirlos recorta la mitad de arriba de la
# lámina creyendo que es la de abajo, y el error no se ve hasta que alguien mira el PNG.

import sys
import fitz


def main():
    if len(sys.argv) != 9:
        print("uso: recortar.py <pdf> <salida.png> <pagina> <x0> <y0> <x1> <y1> <dpi>", file=sys.stderr)
        return 2
    ruta, salida, pagina = sys.argv[1], sys.argv[2], int(sys.argv[3])
    x0, y0, x1, y1 = (float(v) for v in sys.argv[4:8])
    dpi = int(sys.argv[8])

    doc = fitz.open(ruta)
    try:
        page = doc[pagina - 1]
        # ═══ DOS SISTEMAS DE COORDENADAS, Y HAY QUE CRUZAR LOS DOS ═══
        #
        # 1. Y. El PDF (y por lo tanto pdfjs) mide hacia ARRIBA; MuPDF mide hacia ABAJO.
        # 2. ROTACIÓN. Las láminas de obra vienen con /Rotate 90 o 270. Las coordenadas de la
        #    geometría están SIN rotar (mediabox), pero `page.rect` de MuPDF ya viene rotado.
        #
        # Medido sobre los planos de Quattropani (/Rotate 90 y 270): sin la segunda corrección, la
        # intersección con la página daba vacía y CINCO de trece recortes fallaban con CAJA_VACIA.
        # `rotation_matrix` lleva del espacio del mediabox al de la página dibujada.
        mb = page.mediabox
        caja = fitz.Rect(x0, mb.height - y1, x1, mb.height - y0) * page.rotation_matrix
        caja = caja & page.rect
        if caja.is_empty:
            print("CAJA_VACIA", file=sys.stderr)
            return 3
        pix = page.get_pixmap(clip=caja, dpi=dpi, alpha=False)
        pix.save(salida)
        print(f"{pix.width}x{pix.height}")
        return 0
    finally:
        doc.close()


if __name__ == "__main__":
    sys.exit(main())
