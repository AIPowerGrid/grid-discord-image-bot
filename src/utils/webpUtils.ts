/**
 * Checks if a WebP file is animated
 * @param buffer The WebP buffer to check
 * @returns Boolean indicating if the WebP is animated
 */
export function isAnimatedWebp(buffer: Buffer): boolean {
    try {
        // Check for animated WebP signature
        // Animated WebP files have a specific signature in their headers
        // This is a simple check that looks for the "ANIM" chunk in the WebP file
        if (buffer.length < 16) return false;
        
        // Check for WEBP signature
        if (buffer.toString('ascii', 8, 12) !== 'WEBP') return false;
        
        // Look for ANIM chunk which indicates animation
        for (let i = 12; i < buffer.length - 4; i++) {
            if (buffer.toString('ascii', i, i + 4) === 'ANIM') {
                console.log('[WebP] Detected animated WebP file');
                return true;
            }
        }
        
        console.log('[WebP] Static WebP file detected');
        return false;
    } catch (error) {
        console.error('[WebP] Error checking if WebP is animated:', error);
        return false;
    }
}

/**
 * Determines if a URL or filename likely points to a WebP file
 * @param url URL or filename to check
 * @returns Boolean indicating if the URL or filename likely points to a WebP file
 */
export function isWebpUrl(url: string): boolean {
    if (!url) return false;
    return url.toLowerCase().endsWith('.webp');
}

/**
 * Determines if a URL or filename likely points to a video file
 * @param url URL or filename to check
 * @returns Boolean indicating if the URL or filename likely points to a video file
 */
export function isVideoUrl(url: string): boolean {
    if (!url) return false;
    const lowerUrl = url.toLowerCase();
    return lowerUrl.endsWith('.mp4') || 
           lowerUrl.endsWith('.webm') || 
           lowerUrl.endsWith('.mov') ||
           lowerUrl.endsWith('.avi');
}

/**
 * Gets the appropriate file extension for a media file
 * @returns The appropriate file extension
 */
export function getFileExtension(): string {
    return '.webp'; // Always use .webp for both static and animated content
}