// Extended types for API generation results
export interface GenerationStable {
    id?: string;
    seed?: number | string;
    img?: string;
    censored?: boolean;
    worker_id?: string;
    worker_name?: string;
    model?: string;
    
    // Properties missing in the default type definition
    media_type?: 'image' | 'video' | string;
    form?: 'image' | 'video' | string;
    type?: 'image' | 'video' | string;
    filename?: string;
}

