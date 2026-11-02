# Headless smoke test: loads the app at phone, tablet and desktop sizes, selects a place,
# opens add-spot mode, and saves screenshots. Usage: python3 tools/e2e-check.py [url] [outdir]
import sys, os
from playwright.sync_api import sync_playwright

url = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:8080'
out = sys.argv[2] if len(sys.argv) > 2 else 'e2e-shots'
os.makedirs(out, exist_ok=True)
errors = []

with sync_playwright() as p:
    b = p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
    for name, w, h, mobile in [('phone', 390, 844, True), ('tablet', 820, 1180, True), ('desktop', 1440, 900, False)]:
        pg = b.new_page(viewport={'width': w, 'height': h}, is_mobile=mobile, has_touch=mobile)
        pg.on('pageerror', lambda e: errors.append(f'{name}: {e}'))
        pg.goto(url, wait_until='networkidle')
        pg.wait_for_timeout(4500)
        pg.screenshot(path=f'{out}/{name}-overview.png')
        pg.locator('.story').first.click()
        pg.wait_for_timeout(5000 if not mobile else 2500)
        pg.screenshot(path=f'{out}/{name}-place.png')
        print(name, 'pins:', pg.locator('.pin').count(), 'sheet open:', pg.locator('#sheet.open').count(), 'title:', pg.locator('#sheet .title').inner_text())
        pg.close()
    b.close()
print('page errors:', errors or 'none')
sys.exit(1 if errors else 0)
