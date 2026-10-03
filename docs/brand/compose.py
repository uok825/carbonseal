# Renders the brand images in this folder: the source photos plus the
# CarbonSeal headline set in Geist. Requires Python Playwright and npm install.
#
#   python3 docs/brand/compose.py

import asyncio, pathlib
from playwright.async_api import async_playwright

ROOT = pathlib.Path(__file__).resolve().parents[2]
FONT = ROOT / 'node_modules/@fontsource-variable/geist/files/geist-latin-wght-normal.woff2'
MONO = ROOT / 'node_modules/@fontsource-variable/geist-mono/files/geist-mono-latin-wght-normal.woff2'
SRC = ROOT / 'docs/brand/source'
OUT = ROOT / 'docs/brand'

BASE = f"""
@font-face {{ font-family: Geist; src: url('file://{FONT}') format('woff2'); font-weight: 100 900; }}
@font-face {{ font-family: GeistMono; src: url('file://{MONO}') format('woff2'); font-weight: 100 900; }}
* {{ margin: 0; box-sizing: border-box; }}
body {{ width: var(--w); height: var(--h); overflow: hidden; background: #08090a; font-family: Geist; color: #eeeff1;
  -webkit-font-smoothing: antialiased; }}
.bg {{ position: absolute; inset: 0; background-size: var(--size, cover); background-position: var(--pos, center); background-repeat: no-repeat; }}
.shade {{ position: absolute; inset: 0; background: linear-gradient(90deg, rgba(8,9,10,.92) 0%, rgba(8,9,10,.7) 38%, rgba(8,9,10,0) 64%); }}
.wordmark {{ position: absolute; font-weight: 600; letter-spacing: -0.035em; }}
.eyebrow {{ font-family: GeistMono; color: #5bdba2; letter-spacing: 0.02em; }}
h1 {{ font-weight: 680; letter-spacing: -0.05em; line-height: 1.0; }}
h1 .soft {{ color: #686d76; }}
.sub {{ color: #9fa4ad; letter-spacing: -0.01em; }}
"""

def page(w, h, img, pos, body, extra=''):
    size, pos = pos.split('|') if '|' in pos else ('cover', pos)
    return f"""<!doctype html><html><head><meta charset="utf-8"><style>:root{{--w:{w}px;--h:{h}px;--pos:{pos};--size:{size}}}{BASE}{extra}</style></head>
<body><div class="bg" style="background-image:url('file://{SRC/img}')"></div><div class="shade"></div>{body}</body></html>"""

JOBS = [
  # README / slide cover
  ('cover.jpg', 1600, 900, 'coil-wide.jpg', '130%|0% 50%', """
    <div class="wordmark" style="left:88px;top:72px;font-size:28px">CarbonSeal</div>
    <div style="position:absolute;left:88px;top:300px;width:820px">
      <div class="eyebrow" style="font-size:20px;margin-bottom:28px">EU CBAM · BUILT ON MIDNIGHT</div>
      <h1 style="font-size:82px">Prove your steel<br>is low&#8209;carbon.<br><span class="soft">Reveal nothing else.</span></h1>
    </div>"""),
  # GitHub social preview (1280x640)
  ('social-preview.jpg', 1280, 640, 'coil-wide.jpg', '130%|0% 50%', """
    <div class="wordmark" style="left:72px;top:60px;font-size:24px">CarbonSeal</div>
    <div style="position:absolute;left:72px;top:190px;width:660px">
      <div class="eyebrow" style="font-size:16px;margin-bottom:22px">EU CBAM · BUILT ON MIDNIGHT</div>
      <h1 style="font-size:64px">Prove your steel<br>is low&#8209;carbon.<br><span class="soft">Reveal nothing else.</span></h1>
    </div>"""),
  # Square card (AKINDO, social)
  ('card-square.jpg', 1080, 1080, 'coil-square.jpg', 'center', """
    <div class="wordmark" style="left:72px;top:72px;font-size:30px">CarbonSeal</div>
    <div style="position:absolute;left:72px;bottom:96px;width:620px">
      <div class="eyebrow" style="font-size:18px;margin-bottom:24px">EU CBAM · BUILT ON MIDNIGHT</div>
      <h1 style="font-size:66px">Prove your<br>steel is<br>low&#8209;carbon.</h1>
      <p class="sub" style="font-size:24px;margin-top:22px">Reveal nothing else.</p>
    </div>""", ".shade{background:linear-gradient(90deg,rgba(8,9,10,.9) 0%,rgba(8,9,10,.6) 45%,rgba(8,9,10,0) 70%)}"),
]

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--allow-file-access-from-files'])
        for name, w, h, img, pos, body, *extra in JOBS:
            html = OUT / f'.{name}.html'
            html.write_text(page(w, h, img, pos, body, extra[0] if extra else ''))
            pg = await b.new_page(viewport={'width': w, 'height': h})
            await pg.goto(f'file://{html}')
            await pg.evaluate('document.fonts.ready')
            await pg.wait_for_timeout(300)
            ok = await pg.evaluate("document.fonts.check('680 40px Geist')")
            await pg.screenshot(path=str(OUT / name), type='jpeg', quality=90)
            html.unlink()
            print(name, w, 'x', h, 'Geist loaded:', ok)
        await b.close()
asyncio.run(main())
