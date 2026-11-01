import fs from 'node:fs/promises';
import path from 'node:path';
import config from '../../config/index.js';

export const uploadRoot = path.resolve(config.storage.uploadDir);

export default {
  name: 'local',
  async save(key, buffer) {
    const target = path.join(uploadRoot, key);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, buffer);
    return `/uploads/${key}`;
  },
  async remove(key) {
    await fs.rm(path.join(uploadRoot, key), { force: true });
  },
  ownsUrl(url) {
    return typeof url === 'string' && url.startsWith('/uploads/') && !url.includes('..');
  },
};
