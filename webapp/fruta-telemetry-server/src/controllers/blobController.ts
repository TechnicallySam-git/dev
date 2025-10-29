import { Request, Response } from 'express';
import { BlobService } from '../services/blobService';

export class BlobController {
    private blobService: BlobService;

    constructor() {
        this.blobService = new BlobService();
    }

    public async getImages(req: Request, res: Response): Promise<void> {
        try {
            const images = await this.blobService.fetchImages();
            res.status(200).json(images);
        } catch (error) {
            res.status(500).json({ message: 'Error retrieving images', error: error.message });
        }
    }

    public async getTelemetryData(req: Request, res: Response): Promise<void> {
        try {
            const telemetryData = await this.blobService.fetchTelemetryData();
            res.status(200).json(telemetryData);
        } catch (error) {
            res.status(500).json({ message: 'Error retrieving telemetry data', error: error.message });
        }
    }
}