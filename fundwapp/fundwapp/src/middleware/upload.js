import multer from 'multer';
import config from '../config/index.js';

export const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.storage.maxUploadMb * 1024 * 1024, files: 1 },
});
