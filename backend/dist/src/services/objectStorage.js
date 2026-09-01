"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.objectStorageConfigured = objectStorageConfigured;
exports.uploadPrivateObject = uploadPrivateObject;
exports.signedObjectUrl = signedObjectUrl;
require("dotenv/config");
const dotenv_1 = __importDefault(require("dotenv"));
const client_s3_1 = require("@aws-sdk/client-s3");
const s3_request_presigner_1 = require("@aws-sdk/s3-request-presigner");
const node_crypto_1 = require("node:crypto");
// Local development keeps shared infrastructure secrets in the repository root.
dotenv_1.default.config({ path: '../.env', quiet: true });
const accountId = process.env.R2_ACCOUNT_ID || '';
const accessKeyId = process.env.R2_ACCESS_KEY_ID || '';
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY || '';
const bucket = process.env.R2_BUCKET_NAME || '';
const endpoint = process.env.R2_ENDPOINT || `https://${accountId}.r2.cloudflarestorage.com`;
const configured = Boolean(accountId && accessKeyId && secretAccessKey && bucket);
const client = configured ? new client_s3_1.S3Client({ region: 'auto', endpoint, credentials: { accessKeyId, secretAccessKey } }) : null;
function objectStorageConfigured() { return configured; }
async function uploadPrivateObject(input) {
    if (!client)
        throw Object.assign(new Error('Cloudflare R2 is not configured'), { status: 503 });
    const extension = input.originalName.toLowerCase().match(/\.[a-z0-9]{2,5}$/)?.[0] || '';
    const key = `organizations/${input.organizationId}/${input.folder}/${(0, node_crypto_1.randomUUID)()}${extension}`;
    await client.send(new client_s3_1.PutObjectCommand({ Bucket: bucket, Key: key, Body: input.buffer, ContentType: input.mimeType, CacheControl: 'private, no-store' }));
    return key;
}
async function signedObjectUrl(key, expiresInSeconds = 300) {
    if (!client)
        throw Object.assign(new Error('Cloudflare R2 is not configured'), { status: 503 });
    return (0, s3_request_presigner_1.getSignedUrl)(client, new client_s3_1.GetObjectCommand({ Bucket: bucket, Key: key }), { expiresIn: Math.min(900, Math.max(30, expiresInSeconds)) });
}
