const { BlobServiceClient, generateBlobSASQueryParameters, BlobSASPermissions, StorageSharedKeyCredential } = require('@azure/storage-blob');

const azureConnectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
if (!azureConnectionString) {
  console.error('Error: AZURE_STORAGE_CONNECTION_STRING not set');
  throw new Error('AZURE_STORAGE_CONNECTION_STRING environment variable is not defined');
}

const blobServiceClient = BlobServiceClient.fromConnectionString(azureConnectionString);
const containerName = 'trip-photos';
const containerClient = blobServiceClient.getContainerClient(containerName);

const accountName = azureConnectionString.match(/AccountName=([^;]+)/)?.[1];
const accountKey = azureConnectionString.match(/AccountKey=([^;]+)/)?.[1];
const sharedKeyCredential = new StorageSharedKeyCredential(accountName, accountKey);

function generateSasUrl(photoKey) {
  const sasToken = generateBlobSASQueryParameters({
    containerName,
    blobName: photoKey,
    permissions: BlobSASPermissions.parse('r'),
    startsOn: new Date(),
    expiresOn: new Date(Date.now() + 24 * 60 * 60 * 1000),
  }, sharedKeyCredential).toString();

  return `https://${accountName}.blob.core.windows.net/${containerName}/${photoKey}?${sasToken}`;
}

async function ensureContainer() {
  try {
    await containerClient.createIfNotExists();
    console.log(`Azure container "${containerName}" ready`);
  } catch (error) {
    console.error('Failed to create Azure container:', error);
  }
}

module.exports = { containerClient, generateSasUrl, ensureContainer };
