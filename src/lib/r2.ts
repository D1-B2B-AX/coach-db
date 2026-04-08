import { S3Client, PutObjectCommand, DeleteObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3'

let _r2: S3Client | null = null
function getR2Client(): S3Client {
  if (!_r2) {
    if (!process.env.R2_ACCOUNT_ID || !process.env.R2_ACCESS_KEY_ID || !process.env.R2_SECRET_ACCESS_KEY) {
      throw new Error('R2 environment variables are not configured')
    }
    _r2 = new S3Client({
      region: 'auto',
      endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID!,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
      },
    })
  }
  return _r2
}

export async function uploadFile(key: string, body: Buffer, contentType: string): Promise<string> {
  await getR2Client().send(new PutObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME!,
    Key: key,
    Body: body,
    ContentType: contentType,
  }))
  return `${process.env.R2_PUBLIC_URL}/${key}`
}

export async function deleteFile(key: string): Promise<void> {
  await getR2Client().send(new DeleteObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME!,
    Key: key,
  }))
}

export async function listFiles(prefix: string): Promise<{ key: string; lastModified?: Date }[]> {
  const res = await getR2Client().send(new ListObjectsV2Command({
    Bucket: process.env.R2_BUCKET_NAME!,
    Prefix: prefix,
  }))
  return (res.Contents || []).map((obj) => ({
    key: obj.Key!,
    lastModified: obj.LastModified,
  }))
}

export function getKeyFromUrl(url: string): string {
  const publicUrl = process.env.R2_PUBLIC_URL || ''
  return url.replace(`${publicUrl}/`, '')
}
