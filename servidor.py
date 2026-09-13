#!/usr/bin/env python3
"""
Servidor local para ListaDo.

Igual que `python3 -m http.server`, pero pidiendo al navegador que **no guarde
nada en caché**. Sin esto, al editar un .js o el .css el navegador puede seguir
sirviendo la versión antigua y parece que el cambio no se ha aplicado.

    python3 servidor.py            # http://localhost:4173
    python3 servidor.py 8080       # otro puerto
"""

import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

PUERTO_POR_DEFECTO = 4173


# Las mismas cabeceras de seguridad que netlify.toml, para que lo que pruebas en
# local sea lo que se sirve en producción (si algo rompe la CSP, se ve aquí).
CSP = (
    "default-src 'self'; "
    "script-src 'self' https://cdn.jsdelivr.net; "
    "style-src 'self' 'unsafe-inline'; "
    "img-src 'self' data:; "
    "font-src 'self'; "
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://cdn.jsdelivr.net; "
    "manifest-src 'self'; "
    "worker-src 'self'; "
    "base-uri 'none'; "
    "form-action 'self'; "
    "frame-ancestors 'none'; "
    "object-src 'none'"
)


class SinCache(SimpleHTTPRequestHandler):
    """Desactiva la caché del navegador y replica las cabeceras de Netlify."""

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "strict-origin-when-cross-origin")
        self.send_header("Content-Security-Policy", CSP)
        super().end_headers()

    def log_message(self, formato, *args):          # una línea por petición, sin ruido
        sys.stderr.write("  %s\n" % (formato % args))


def main():
    puerto = int(sys.argv[1]) if len(sys.argv) > 1 else PUERTO_POR_DEFECTO
    raiz = Path(__file__).resolve().parent
    handler = partial(SinCache, directory=str(raiz))

    with ThreadingHTTPServer(("127.0.0.1", puerto), handler) as httpd:
        print("ListaDo en http://localhost:%d  (Ctrl+C para parar)" % puerto)
        print("Sirviendo %s\n" % raiz)
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nParado.")


if __name__ == "__main__":
    main()
