import 'dotenv/config';
import dotenv from 'dotenv';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'node:crypto';

// Local development keeps shared infrastructure secrets in the repository root.
dotenv.config({ path: '../.env', quiet: true });

const accountId=process.env.R2_ACCOUNT_ID||'';
const accessKeyId=process.env.R2_ACCESS_KEY_ID||'';
const secretAccessKey=process.env.R2_SECRET_ACCESS_KEY||'';
const bucket=process.env.R2_BUCKET_NAME||'';
const endpoint=process.env.R2_ENDPOINT||`https://${accountId}.r2.cloudflarestorage.com`;

const configured=Boolean(accountId&&accessKeyId&&secretAccessKey&&bucket);
const client=configured?new S3Client({region:'auto',endpoint,credentials:{accessKeyId,secretAccessKey}}):null;

export function objectStorageConfigured(){return configured}

export async function uploadPrivateObject(input:{organizationId:string;folder:string;originalName:string;mimeType:string;buffer:Buffer}){
  if(!client)throw Object.assign(new Error('Cloudflare R2 is not configured'),{status:503});
  const extension=input.originalName.toLowerCase().match(/\.[a-z0-9]{2,5}$/)?.[0]||'';
  const key=`organizations/${input.organizationId}/${input.folder}/${randomUUID()}${extension}`;
  await client.send(new PutObjectCommand({Bucket:bucket,Key:key,Body:input.buffer,ContentType:input.mimeType,CacheControl:'private, no-store'}));
  return key;
}

export async function signedObjectUrl(key:string,expiresInSeconds=300){
  if(!client)throw Object.assign(new Error('Cloudflare R2 is not configured'),{status:503});
  return getSignedUrl(client,new GetObjectCommand({Bucket:bucket,Key:key}),{expiresIn:Math.min(900,Math.max(30,expiresInSeconds))});
}
