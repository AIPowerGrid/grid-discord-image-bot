import { writeFileSync, readFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
const webp = require('webp-converter');

/**
 * Converts a WebP buffer to GIF format for better Discord compatibility
 * @param buffer The WebP buffer to convert
 * @returns Promise resolving to a buffer containing GIF data
 */
export async function convertWebpToGif(buffer: Buffer): Promise<any> {
    // Set up temporary file paths
    const tempInputFile = join(tmpdir(), `input-${Date.now()}.webp`);
    const tempOutputFile = join(tmpdir(), `output-${Date.now()}.gif`);
    
    console.log(`[WEBP] Converting WebP to GIF...`);
    console.log(`[WEBP] Temp files: ${tempInputFile} -> ${tempOutputFile}`);
    
    // Write input buffer to temp file
    writeFileSync(tempInputFile, buffer);
    
    // Return a promise that resolves when conversion is complete
    return new Promise((resolve, reject) => {
        try {
            // Enable webp-converter dwebp binary
            webp.grant_permission();
            
            // Convert WebP to GIF
            webp.webpToGif(tempInputFile, tempOutputFile)
                .then(() => {
                    console.log(`[WEBP] Conversion completed successfully`);
                    // Read the output file into a buffer
                    try {
                        const outputBuffer = readFileSync(tempOutputFile);
                        
                        // Clean up temp files
                        try {
                            unlinkSync(tempInputFile);
                            unlinkSync(tempOutputFile);
                        } catch (cleanupError) {
                            console.error(`[WEBP] Failed to clean up temp files:`, cleanupError);
                        }
                        
                        resolve(outputBuffer);
                    } catch (readError) {
                        reject(new Error(`Failed to read output GIF file: ${readError}`));
                    }
                })
                .catch((error: any) => {
                    console.error(`[WEBP] Conversion error:`, error);
                    reject(new Error(`WebP to GIF conversion error: ${error.message || error}`));
                });
        } catch (error) {
            console.error(`[WEBP] Error setting up conversion:`, error);
            reject(error);
        }
    });
}
