import { promises as fs } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const projectRoot = process.cwd();
const sourceRoot = path.join(projectRoot, 'assets', 'source-images');
const outputRoot = path.join(projectRoot, 'public', 'images', 'optimized');
const rasterExtensions = new Set(['.jpg', '.jpeg', '.png']);
const widths = [480, 800, 1200, 1600, 2200];

async function walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'optimized') {
        return [];
      }
      return walk(fullPath);
    }

    return [fullPath];
  }));

  return files.flat();
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function needsUpdate(inputPath, outputPath) {
  try {
    const [inputStat, outputStat] = await Promise.all([
      fs.stat(inputPath),
      fs.stat(outputPath),
    ]);

    return inputStat.mtimeMs > outputStat.mtimeMs;
  } catch {
    return true;
  }
}

function buildTargetWidths(originalWidth) {
  const filtered = widths.filter((width) => width < originalWidth);
  return [...filtered, originalWidth].filter((width, index, arr) => arr.indexOf(width) === index);
}

async function generateVariant(inputPath, outputPath, width, format) {
  const transformer = sharp(inputPath).rotate().resize({
    width,
    withoutEnlargement: true,
    fit: 'inside',
  });

  if (format === 'jpg') {
    await transformer.jpeg({
      quality: 78,
      mozjpeg: true,
      progressive: true,
    }).toFile(outputPath);
    return;
  }

  await transformer.webp({
    quality: 76,
    effort: 5,
  }).toFile(outputPath);
}

async function main() {
  const files = await walk(sourceRoot);
  let generatedCount = 0;
  let skippedCount = 0;

  for (const inputPath of files) {
    const extension = path.extname(inputPath).toLowerCase();
    if (!rasterExtensions.has(extension)) {
      continue;
    }

    const metadata = await sharp(inputPath).metadata();
    if (!metadata.width) {
      continue;
    }

    const relativePath = path.relative(sourceRoot, inputPath);
    const parsed = path.parse(relativePath);
    const outputDir = path.join(outputRoot, parsed.dir);
    await ensureDir(outputDir);

    for (const width of buildTargetWidths(metadata.width)) {
      for (const format of ['jpg', 'webp']) {
        const outputName = `${parsed.name}-${width}.${format}`;
        const outputPath = path.join(outputDir, outputName);

        if (!(await needsUpdate(inputPath, outputPath))) {
          skippedCount += 1;
          continue;
        }

        await generateVariant(inputPath, outputPath, width, format);
        generatedCount += 1;
      }
    }
  }

  console.log(`Optimized images: generated ${generatedCount}, skipped ${skippedCount}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
