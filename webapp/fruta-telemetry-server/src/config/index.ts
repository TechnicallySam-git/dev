import dotenv from 'dotenv';

dotenv.config();

const config = {
  azure: {
    storageAccount: process.env.AZURE_STORAGE_ACCOUNT,
    storageAccessKey: process.env.AZURE_STORAGE_ACCESS_KEY,
    containerName: process.env.AZURE_CONTAINER_NAME,
  },
  server: {
    port: process.env.PORT || 3000,
  },
};

export default config;