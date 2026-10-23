import config from '../../config/index.js';
import { uuid } from '../../utils/ids.js';
import { badRequest } from '../../utils/errors.js';
import local from './local.js';
import s3 from './s3.js';

const drivers = { local, s3 };
const driver = drivers[config.storage.driver];
if (!driver) throw new Error(`Unknown STORAGE_DRIVER "${config.storage.driver}". Use: ${Object.keys(drivers).join(', ')}`);

// Detect the real file type from magic bytes instead of trusting the browser-supplied mimetype.
function sniffImage(buf) {
  if (buf.length > 12 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { ext: 'jpg', type: 'image/jpeg' };
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { ext: 'png', type: 'image/png' };
  if (buf.length > 12 && buf.subarray(0, 4).toString() === 'RIFF' && buf.subarray(8, 12).toString() === 'WEBP') return { ext: 'webp', type: 'image/webp' };
  if (buf.length > 6 && ['GIF87a', 'GIF89a'].includes(buf.subarray(0, 6).toString())) return { ext: 'gif', type: 'image/gif' };
  return null;
}

export async function saveImage(buffer, folder = 'covers') {
  const kind = sniffImage(buffer);
  if (!kind) throw badRequest('Upload a JPG, PNG, WEBP or GIF image', 'INVALID_IMAGE');
  const key = `${folder}/${uuid()}.${kind.ext}`;
  const url = await driver.save(key, buffer, kind.type);
  return { url, key };
}

export const isOwnedUrl = (url) => driver.ownsUrl(url);
export const storageDriverName = driver.name;
