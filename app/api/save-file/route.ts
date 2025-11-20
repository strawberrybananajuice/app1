import { NextRequest, NextResponse } from 'next/server';
import { writeFile, access, constants } from 'fs/promises';
import path from 'path';
import os from 'os';

export async function POST(request: NextRequest) {
    try {
        const { content, originalFileName, destinationPath, fileExtension = '.txt', baseFileName } = await request.json();

        if (!content) {
            return NextResponse.json(
                { error: 'No content provided' },
                { status: 400 }
            );
        }

        // Get base filename without extension
        let baseName = baseFileName || originalFileName || 'processed';
        const lastDotIndex = baseName.lastIndexOf('.');
        if (lastDotIndex > 0) {
            baseName = baseName.substring(0, lastDotIndex);
        }

        const normalizedExtension = fileExtension.startsWith('.') ? fileExtension : `.${fileExtension}`;

        // Use provided destination path or default to Downloads/temp
        let targetDir = destinationPath;
        if (!targetDir) {
            const downloadsDir = path.join(os.homedir(), 'Downloads');
            targetDir = downloadsDir;
            try {
                await access(downloadsDir, constants.W_OK);
            } catch {
                targetDir = os.tmpdir();
            }
        } else {
            // Verify provided path exists
            try {
                await access(targetDir, constants.W_OK);
            } catch {
                return NextResponse.json(
                    { error: `Destination path does not exist or is not writable: ${targetDir}` },
                    { status: 400 }
                );
            }
        }

        // Find a unique filename
        let fileName = `${baseName}${normalizedExtension}`;
        let filePath = path.join(targetDir, fileName);
        let counter = 1;

        // Check if file exists and increment counter until we find a unique name
        while (true) {
            try {
                await access(filePath, constants.F_OK);
                // File exists, try next number
                fileName = `${baseName}_${counter}${normalizedExtension}`;
                filePath = path.join(targetDir, fileName);
                counter++;
            } catch {
                // File doesn't exist, we can use this name
                break;
            }
        }

        // Write the file
        await writeFile(filePath, content, 'utf-8');

        return NextResponse.json({
            fileName,
            filePath,
            message: 'File saved successfully'
        });
    } catch (error) {
        console.error('Error saving file:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to save file' },
            { status: 500 }
        );
    }
}
