// Scratch evaluator: node tools/qa/dbg.mjs <route> <scrollY> "<js expression>"
import { chromium } from 'playwright';
const [route, y, expr] = process.argv.slice(2);
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
await p.goto('http://localhost:4321' + route, { waitUntil: 'load' }); await p.waitForTimeout(1500);
await p.evaluate(y => scrollTo(0, y), +y); await p.waitForTimeout(1200);
console.log(JSON.stringify(await p.evaluate(expr), null, 1)); await b.close();
