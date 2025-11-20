import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs/promises';
import os from 'os';
import JSZip from 'jszip';

export async function POST(req: NextRequest) {
    try {
        const { url, destinationPath } = await req.json();

        if (!url) {
            return NextResponse.json({ error: 'URL is required' }, { status: 400 });
        }

        // If destinationPath is provided, use it directly
        // Otherwise create a temp directory
        const workDir = destinationPath || await fs.mkdtemp(path.join(os.tmpdir(), 'yt-dl-'));

        // Extract video ID to check for existing files
        const videoIdMatch = url.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/);
        const videoId = videoIdMatch ? videoIdMatch[1] : null;

        // Check if file already exists in destination
        if (destinationPath && videoId) {
            try {
                const existingFiles = await fs.readdir(destinationPath);
                // Look for subtitle file containing the ID
                const existingSubtitle = existingFiles.find(f =>
                    f.includes(videoId) && (f.endsWith('.srt') || f.endsWith('.vtt'))
                );

                if (existingSubtitle) {
                    console.log(`Found existing subtitle for ${videoId}: ${existingSubtitle}`);
                    const filePath = path.join(destinationPath, existingSubtitle);
                    const subtitleText = await fs.readFile(filePath, 'utf-8');
                    return NextResponse.json({ subtitle: subtitleText, mode: 'server-save', message: 'File already exists, skipped download' });
                }
            } catch (err) {
                console.error('Error checking existing files:', err);
            }
        }

        // Path to the C# executable
        // Adjust based on your actual build path (net8.0 or net9.0)
        const executablePath = path.resolve(process.cwd(), '_youtubedownloader/bin/Debug/net9.0/YouTubeDownloader');

        console.log(`Downloading ${url} to ${workDir} using ${executablePath}`);

        // Run the C# downloader
        const child = spawn(executablePath, [url], {
            cwd: workDir, // Set CWD to work dir so files are saved there
        });

        // Capture output for debugging
        child.stdout.on('data', (data) => console.log(`[C# stdout]: ${data}`));
        child.stderr.on('data', (data) => console.error(`[C# stderr]: ${data}`));

        // Wait for process to exit
        await new Promise<void>((resolve, reject) => {
            child.on('close', (code) => {
                if (code === 0) {
                    resolve();
                } else {
                    reject(new Error(`Process exited with code ${code}`));
                }
            });
            child.on('error', (err) => reject(err));
        });

        // Find all downloaded files
        const files = await fs.readdir(workDir);

        // If we saved to a specific destination, we just need to find the subtitle to return it
        if (destinationPath) {
            let subtitleText = '';
            let targetFile = '';

            // Try to find file with video ID first
            if (videoId) {
                targetFile = files.find(f => f.includes(videoId) && (f.endsWith('.srt') || f.endsWith('.vtt'))) || '';
            }

            // Fallback to any srt/vtt if ID match fails
            if (!targetFile) {
                targetFile = files.find(f => f.endsWith('.srt') || f.endsWith('.vtt')) || '';
            }

            if (targetFile) {
                const filePath = path.join(workDir, targetFile);
                subtitleText = await fs.readFile(filePath, 'utf-8');
            }

            return NextResponse.json({ subtitle: subtitleText, mode: 'server-save' });
        }        // If we used a temp dir, zip everything and return it
        const zip = new JSZip();

        for (const file of files) {
            const filePath = path.join(workDir, file);
            const content = await fs.readFile(filePath);
            zip.file(file, content);
        }

        const zipContent = await zip.generateAsync({ type: 'nodebuffer' });

        // Clean up temp dir
        await fs.rm(workDir, { recursive: true, force: true });

        return new NextResponse(zipContent as unknown as BodyInit, {
            headers: {
                'Content-Type': 'application/zip',
                'Content-Disposition': `attachment; filename="download.zip"`,
            },
        });

    } catch (error) {
        console.error('Download error:', error);
        return NextResponse.json({ error: (error as Error).message }, { status: 500 });
    }
}
