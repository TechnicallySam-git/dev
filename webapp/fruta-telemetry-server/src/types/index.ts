export interface Blob {
    name: string;
    url: string;
    lastModified: Date;
}

export interface Telemetry {
    timestamp: string;
    mangoLikelihood?: number;
    prediction?: {
        mango?: number;
        [key: string]: any;
    };
    imageFileName?: string;
    blobUrl?: string;
}