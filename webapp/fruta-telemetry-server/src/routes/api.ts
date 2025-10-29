import { Router } from 'express';
import BlobController from '../controllers/blobController';

const router = Router();
const blobController = new BlobController();

router.get('/images', blobController.getImages);
router.get('/telemetry', blobController.getTelemetryData);

export default router;