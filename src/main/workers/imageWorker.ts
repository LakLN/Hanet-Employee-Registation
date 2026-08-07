import { parentPort, workerData } from 'worker_threads';
import Jimp from 'jimp';

const MAX_WIDTH = 1280;
const MAX_HEIGHT = 738;

async function run() {
  const { imagePath } = workerData as { imagePath: string };
  const image = await Jimp.read(imagePath);

  // Chỉ scale-to-fit khi ảnh vượt kích thước mục tiêu, giữ nguyên tỉ lệ để không cắt mất
  // đầu/cằm như 'cover' trước đây — không upscale ảnh nhỏ hơn mục tiêu.
  if (image.bitmap.width > MAX_WIDTH || image.bitmap.height > MAX_HEIGHT) {
    image.scaleToFit(MAX_WIDTH, MAX_HEIGHT);
  }
  image.quality(90);

  const buffer: Buffer = await image.getBufferAsync(Jimp.MIME_JPEG);
  parentPort!.postMessage({ ok: true, buffer });
}

run().catch((err) => {
  parentPort!.postMessage({ ok: false, error: err?.message ?? String(err) });
});
