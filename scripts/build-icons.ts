import { existsSync, mkdirSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";

const publicDir = join(__dirname, "..", "public");
const source = join(publicDir, "icon.svg");

const targets = [
  { name: "app-icon-192.png", size: 192 },
  { name: "app-icon-512.png", size: 512 },
  { name: "apple-touch-icon.png", size: 180 },
];

if (!existsSync(publicDir)) mkdirSync(publicDir, { recursive: true });

async function main() {
  const svg = await readFile(source);
  for (const t of targets) {
    const png = await sharp(svg, { density: 300 })
      .resize(t.size, t.size)
      .png()
      .toBuffer();
    await writeFile(join(publicDir, t.name), png);
    console.log(`wrote ${t.name} (${t.size}x${t.size}, ${png.length} bytes)`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});