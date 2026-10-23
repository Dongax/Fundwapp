import config from '../../config/index.js';

// S3-compatible storage (AWS S3, Cloudflare R2, DigitalOcean Spaces, MinIO...).
// Requires: npm i @aws-sdk/client-s3 (listed as an optional dependency).
let clientPromise;
async function getClient() {
  clientPromise ??= import('@aws-sdk/client-s3').then(({ S3Client }) => new S3Client({
    region: config.storage.s3.region || 'auto',
    endpoint: config.storage.s3.endpoint,
    forcePathStyle: !!config.storage.s3.endpoint,
    credentials: { accessKeyId: config.storage.s3.accessKeyId, secretAccessKey: config.storage.s3.secretAccessKey },
  }));
  return clientPromise;
}

export default {
  name: 's3',
  async save(key, buffer, contentType) {
    const { PutObjectCommand } = await import('@aws-sdk/client-s3');
    const { bucket, publicBaseUrl } = config.storage.s3;
    if (!bucket || !publicBaseUrl) throw new Error('S3_BUCKET and S3_PUBLIC_BASE_URL are required for STORAGE_DRIVER=s3');
    await (await getClient()).send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: buffer, ContentType: contentType }));
    return `${publicBaseUrl}/${key}`;
  },
  async remove(key) {
    const { DeleteObjectCommand } = await import('@aws-sdk/client-s3');
    await (await getClient()).send(new DeleteObjectCommand({ Bucket: config.storage.s3.bucket, Key: key }));
  },
  ownsUrl(url) {
    const base = config.storage.s3.publicBaseUrl;
    return typeof url === 'string' && !!base && url.startsWith(`${base}/`);
  },
};
