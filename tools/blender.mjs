// Runs a Python file inside the open Blender (Blender Lab MCP add-on, localhost:9876): node tools/blender.mjs script.py
// The add-on speaks NUL-terminated JSON over TCP; the script's `result` variable (if any) comes back.
import net from 'node:net';
import fs from 'node:fs';
const code = fs.readFileSync(process.argv[2], 'utf8');
const sock = net.connect(9876, '127.0.0.1', () => sock.write(JSON.stringify({ type: 'execute', code, strict_json: false }) + '\0'));
let buf = '';
sock.setTimeout(1800000, () => { console.error('timeout'); process.exit(1); });
sock.on('data', d => { buf += d; if (buf.endsWith('\0')) { console.log(buf.slice(0, -1)); sock.end(); } });
sock.on('error', e => { console.error(e.message); process.exit(1); });
