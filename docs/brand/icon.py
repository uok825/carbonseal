# Renders docs/brand/icon.jpg: the coil cropped to sit inside a circular avatar.
#   python3 docs/brand/icon.py

import asyncio, pathlib
from playwright.async_api import async_playwright
SRC = pathlib.Path(__file__).resolve().parent / 'source/coil-square.jpg'
OUT = pathlib.Path(__file__).resolve().parent / 'icon.jpg'
# Square crop around the coil (source 2000x2000; coil sits right of centre), shown inside a circle preview too.
CROP_X, CROP_Y, CROP = 645, 300, 1360
S = 800
scale = S / CROP
html = f"""<!doctype html><html><body style="margin:0;width:{S}px;height:{S}px;background:#08090a;overflow:hidden">
<div style="width:{S}px;height:{S}px;background:url('file://{SRC}') no-repeat;background-size:{2000*scale}px;background-position:{-CROP_X*scale}px {-CROP_Y*scale}px"></div></body></html>"""
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--allow-file-access-from-files'])
        pg = await b.new_page(viewport={'width': S, 'height': S})
        tmp = OUT.with_suffix('.html'); tmp.write_text(html)
        await pg.goto(f'file://{tmp}'); await pg.wait_for_timeout(300)
        await pg.screenshot(path=str(OUT), type='jpeg', quality=92)
        # circular preview, as AKINDO shows it
        await pg.set_content(f"<body style='margin:0;background:#fff;padding:20px'><img src='file://{OUT}' style='width:240px;height:240px;border-radius:50%'></body>")
        await pg.set_viewport_size({'width': 280, 'height': 280})
        await pg.wait_for_timeout(200)
        await pg.screenshot(path=str(OUT.with_name('.icon-preview.png')))
        tmp.unlink()
        await b.close()
asyncio.run(main())
