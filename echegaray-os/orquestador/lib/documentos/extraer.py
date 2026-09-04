#!/usr/bin/env python3
"""
EXTRACCIÓN DE UN PDF: TEXTO, TABLAS Y LA PROCEDENCIA DE CADA COSA.

═══ POR QUÉ ESTO ES PYTHON Y NO NODE ═══

Porque PyMuPDF ya está en la VM (1.28.0) y es lo único acá que lee el árbol de texto de un PDF con
su geometría: página, bbox y bloque. `pdf-parse` de Node devuelve una cadena — sirve para buscar y
no sirve para citar. Un dato extraído que no puede decir DE QUÉ PÁGINA Y DE QUÉ LUGAR salió no es
evidencia: es una afirmación.

═══ QUÉ DECIDE, Y QUÉ NO ═══

Decide una sola cosa importante: si la página TIENE capa de texto o hay que mirarla con un modelo.
Eso no es un detalle de implementación, es la bifurcación económica del pipeline entero — la capa de
texto sale gratis y en milisegundos, y el OCR cuesta segundos de CPU por página en una VM sin GPU.

NO clasifica el documento, no extrae campos y no llama a ningún modelo. Devuelve JSON por stdout.

  python3 extraer.py <archivo.pdf> [--max-paginas N]
"""
import sys, json, contextlib, io as _io

# Cuántos caracteres tiene que tener una página para creerle que su capa de texto sirve. Medido: un
# escaneo puro devuelve 0-30 caracteres de basura (números de página, sellos vectorizados); una
# página con texto real de una factura pasa largo de 200. El umbral se declara acá y el benchmark
# lo puede mover con evidencia, no a ojo.
MINIMO_CARACTERES_UTILES = 120


def util(t):
    """Los caracteres que cuentan: letras y dígitos. Los espacios y saltos de un PDF vacío inflan
    el largo sin aportar una sola palabra."""
    return sum(1 for c in t if c.isalnum())


def extraer(ruta, max_paginas=None):
    import fitz
    doc = fitz.open(ruta)
    total = doc.page_count
    n = total if max_paginas is None else min(total, max_paginas)
    paginas, tablas = [], []
    for i in range(n):
        p = doc.load_page(i)
        texto = p.get_text("text") or ""
        bloques = []
        for b in (p.get_text("blocks") or []):
            # (x0, y0, x1, y1, texto, n_bloque, tipo) — tipo 0 = texto, 1 = imagen
            if len(b) >= 7 and b[6] == 0 and str(b[4]).strip():
                bloques.append({"bbox": [round(v, 1) for v in b[:4]], "texto": b[4].strip()})
        c = util(texto)
        paginas.append({
            "pagina": i + 1,
            "caracteres": c,
            "tiene_texto": c >= MINIMO_CARACTERES_UTILES,
            "imagenes": len(p.get_images(full=True) or []),
            "ancho": round(p.rect.width, 1), "alto": round(p.rect.height, 1),
            "texto": texto,
            "bloques": bloques,
        })
        # LAS TABLAS SE BUSCAN SÓLO DONDE HAY TEXTO. `find_tables` sobre un escaneo recorre la
        # página entera buscando líneas y no encuentra nada: es tiempo pagado por definición.
        if c >= MINIMO_CARACTERES_UTILES:
            try:
                for t in p.find_tables():
                    filas = t.extract()
                    if filas and len(filas) > 1:
                        tablas.append({"pagina": i + 1, "bbox": [round(v, 1) for v in t.bbox],
                                       "filas": len(filas), "columnas": len(filas[0]), "datos": filas})
            except Exception:
                pass  # find_tables no está en todas las builds; su ausencia no invalida el texto
    doc.close()
    con_texto = sum(1 for p in paginas if p["tiene_texto"])
    return {
        "ok": True,
        "paginas_totales": total,
        "paginas_leidas": n,
        "paginas_con_texto": con_texto,
        # LA DECISIÓN. Si ninguna página trae texto, el documento es un escaneo y necesita OCR.
        # Si algunas sí y otras no, es mixto y sólo las que faltan van al modelo.
        "necesita_ocr": con_texto == 0,
        "mixto": 0 < con_texto < n,
        "caracteres": sum(p["caracteres"] for p in paginas),
        "tablas": tablas,
        "paginas": paginas,
    }


if __name__ == "__main__":
    args = sys.argv[1:]
    ruta = args[0]
    mx = None
    if "--max-paginas" in args:
        mx = int(args[args.index("--max-paginas") + 1])
    # PyMuPDF ESCRIBE EN STDOUT SIN QUE NADIE SE LO PIDA. Sobre ciertos PDF imprime
    # "Consider using the pymupdf_layout package…", y ese aviso amistoso queda ANTES del JSON:
    # el que parsea del otro lado recibe basura y declara el documento ilegible. Pasó con los 24
    # documentos de la primera corrida del benchmark — cero fallas reales, veinticuatro reportadas.
    #
    # La salida de la biblioteca se desvía a stderr durante todo el trabajo (ahí sirve, es un log)
    # y el JSON se imprime recién después, sobre el stdout de verdad.
    ruido = _io.StringIO()
    try:
        with contextlib.redirect_stdout(ruido):
            datos = extraer(ruta, mx)
        salida = json.dumps(datos, ensure_ascii=False)
    except Exception as e:
        salida = json.dumps({"ok": False, "error": f"{type(e).__name__}: {e}"}, ensure_ascii=False)
        print(salida)
        sys.stderr.write(ruido.getvalue())
        sys.exit(1)
    print(salida)
    if ruido.getvalue():
        sys.stderr.write(ruido.getvalue())
