import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';

const R2_ACCOUNT_ID    = process.env.R2_ACCOUNT_ID || '';
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID || '';
const R2_SECRET        = process.env.R2_SECRET_ACCESS_KEY || '';
const R2_BUCKET        = process.env.R2_BUCKET_NAME || 'scatterbrain-receipts';
const R2_PUBLIC_URL    = process.env.R2_PUBLIC_URL || '';

const isConfigured = R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET;

const r2 = isConfigured
  ? new S3Client({
      region: 'auto',
      endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: R2_ACCESS_KEY_ID,
        secretAccessKey: R2_SECRET,
      },
    })
  : null;

export async function uploadReceiptImage(
  buffer: Buffer,
  originalName: string,
  userId: number
): Promise<{ key: string; url: string }> {
  const ext = originalName.split('.').pop() || 'jpg';
  const key = `receipts/${userId}/${randomUUID()}.${ext}`;

  if (!r2) {
    // Local dev fallback — store in /uploads
    const { writeFileSync, mkdirSync } = await import('fs');
    const localPath = `./uploads/${key}`;
    mkdirSync(`./uploads/receipts/${userId}`, { recursive: true });
    writeFileSync(localPath, buffer);
    return { key, url: `/uploads/${key}` };
  }

  await r2.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
      Body: buffer,
      ContentType: `image/${originalName.split('.').pop() === 'png' ? 'png' : 'jpeg'}`,
    })
  );

  const url = R2_PUBLIC_URL
    ? `${R2_PUBLIC_URL}/${key}`
    : await getSignedUrl(r2, new PutObjectCommand({ Bucket: R2_BUCKET, Key: key }), { expiresIn: 3600 * 24 * 7 });

  return { key, url };
}

export async function deleteReceiptImage(key: string): Promise<void> {
  if (!r2) return;
  try {
    await r2.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: key }));
  } catch (err) {
    console.error('R2 delete failed:', err);
  }
}
