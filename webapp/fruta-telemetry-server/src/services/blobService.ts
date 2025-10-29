import { BlobServiceClient } from '@azure/storage-blob';
import { Blob, Telemetry } from '../types';

export class BlobService {
    private blobServiceClient: BlobServiceClient;
    private containerName: string;

    constructor(connectionString: string, containerName: string) {
        this.blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
        this.containerName = containerName;
    }

    async listBlobs(): Promise<Blob[]> {
        const containerClient = this.blobServiceClient.getContainerClient(this.containerName);
        const blobs = [];
        for await (const blob of containerClient.listBlobsFlat()) {
            blobs.push({
                name: blob.name,
                lastModified: blob.properties.lastModified,
            });
        }
        return blobs;
    }

    async getBlobContent(blobName: string): Promise<string> {
        const containerClient = this.blobServiceClient.getContainerClient(this.containerName);
        const blobClient = containerClient.getBlobClient(blobName);
        const downloadBlockBlobResponse = await blobClient.download(0);
        const downloaded = await this.streamToString(downloadBlockBlobResponse.readableStreamBody);
        return downloaded;
    }

    private async streamToString(readableStream: ReadableStream | null): Promise<string> {
        if (!readableStream) {
            throw new Error('Readable stream is null');
        }
        const chunks: Uint8Array[] = [];
        const reader = readableStream.getReader();
        while (true) {
            const { done, value } = await reader.read();
            if (done) {
                break;
            }
            chunks.push(value);
        }
        return new TextDecoder('utf-8').decode(Uint8Array.from(chunks.flat()));
    }
}