'use client';

import { useState } from 'react';
import JSZip from 'jszip';

interface YouTubeDownloaderTabProps {
    onSubtitleDownloaded?: (text: string) => void;
}

export default function YouTubeDownloaderTab({ onSubtitleDownloaded }: YouTubeDownloaderTabProps) {
    const [url, setUrl] = useState('');
    const [isDownloading, setIsDownloading] = useState(false);
    const [message, setMessage] = useState('');
    const [serverPath, setServerPath] = useState<string>('');
    const [lastUrl, setLastUrl] = useState<string>('');

    const openFolder = async () => {
        if (!serverPath) return;
        // Only open when it's an absolute path (server-side open expects a full path)
        const isAbsolute = (p: string) => p.startsWith('/') || /^[A-Za-z]:[\\/]/.test(p);
        if (!isAbsolute(serverPath)) {
            setMessage('Open folder requires an absolute path (paste the path or use Browse)');
            return;
        }

        try {
            await fetch('/api/open-folder', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path: serverPath }),
            });
        } catch (err) {
            console.error('Failed to open folder', err);
            setMessage('Failed to open folder');
        }
    };

    const browseFolder = async () => {
        try {
            const response = await fetch('/api/select-folder', { method: 'POST' });
            const data = await response.json();
            if (data.path) {
                setServerPath(data.path);
                setMessage('Folder selected: ' + data.path);
            } else if (data.error) {
                console.log('Folder selection cancelled or failed:', data.error);
            }
        } catch (err) {
            console.error('Failed to browse folder', err);
        }
    };

    const handleDownload = async () => {
        if (!url.trim()) {
            setMessage('Please enter a YouTube URL');
            return;
        }

        if (!serverPath) {
            setMessage('Please enter a server path');
            return;
        }

        setIsDownloading(true);
        setMessage('Downloading...');

        try {
            // Call the C# YouTube downloader
            const response = await fetch('/api/download-youtube', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    url,
                    destinationPath: serverPath || undefined
                }),
            });

            if (!response.ok) {
                throw new Error('Failed to download video');
            }

            const contentType = response.headers.get('content-type');

            if (contentType && contentType.includes('application/json')) {
                // Server-side save mode
                const data = await response.json();
                if (data.subtitle && onSubtitleDownloaded) {
                    onSubtitleDownloaded(data.subtitle);
                }
                const statusMessage = data.message || '';
                setMessage(`Successfully ${statusMessage || 'downloaded video to ' + serverPath}${data.subtitle ? ' and loaded subtitles' : ''}!`);
                setLastUrl(url);
            } else {
                // Client-side zip mode (fallback if server path fails but API returns zip)
                const blob = await response.blob();

                // Load the zip file
                const zip = await JSZip.loadAsync(blob);

                let subtitleFound = false;

                // Iterate through files in the zip
                const files = Object.keys(zip.files);
                for (const filename of files) {
                    const file = zip.files[filename];
                    if (file.dir) continue;

                    if (filename.endsWith('.srt') || filename.endsWith('.vtt')) {
                        // Read subtitle content
                        const text = await file.async('string');
                        if (onSubtitleDownloaded) {
                            onSubtitleDownloaded(text);
                            subtitleFound = true;
                        }
                    }
                }

                setMessage(`Downloaded video${subtitleFound ? ' and loaded subtitles' : ''}! (Note: Files saved to server path if configured)`);
                setUrl('');
                setLastUrl(url);
            }

        } catch (err) {
            setMessage(err instanceof Error ? err.message : 'Failed to download video');
        } finally {
            setIsDownloading(false);
        }
    }; return (
        <div className="h-full flex flex-col bg-white">
            <div className="flex-1 flex flex-col items-center justify-center gap-6">
                <h1 className="text-3xl font-bold text-gray-800">YouTube Downloader</h1>

                <div className="w-full max-w-2xl space-y-4">
                    <div>
                        <div className="flex gap-2">
                            <input
                                type="text"
                                value={serverPath}
                                onChange={(e) => setServerPath(e.target.value)}
                                placeholder="Enter absolute path to save files (e.g. /Users/name/Downloads)"
                                className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-lg text-black placeholder-gray-600 bg-white"
                                disabled={isDownloading}
                            />
                            <button
                                onClick={browseFolder}
                                className="px-4 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors font-medium"
                                title="Browse Folder"
                            >
                                Browse
                            </button>
                            <button
                                onClick={openFolder}
                                disabled={!serverPath}
                                className="px-4 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
                                title={serverPath ? "Open Folder" : "Enter a path to enable opening"}
                            >
                                Open
                            </button>
                        </div>
                        <p className="text-xs text-gray-500 mt-1">Optional: Enter a local path to save files directly and enable &quot;Open Folder&quot;.</p>
                    </div>

                    <div>
                        <input
                            type="text"
                            value={url}
                            onChange={(e) => setUrl(e.target.value)}
                            placeholder="Enter YouTube URL"
                            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-lg text-black placeholder-gray-600 bg-white"
                            disabled={isDownloading}
                        />
                    </div>

                    <div className="flex gap-4">
                        <button
                            onClick={handleDownload}
                            disabled={isDownloading || !url.trim()}
                            className="flex-1 px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors font-medium text-lg"
                        >
                            {isDownloading ? 'Downloading...' : 'Download'}
                        </button>
                    </div>

                    {message && (
                        <div className={`p-4 rounded-lg ${message.includes('Success') || message.includes('selected')
                            ? 'bg-green-100 text-green-700 border border-green-400'
                            : message.includes('Downloading')
                                ? 'bg-blue-100 text-blue-700 border border-blue-400'
                                : 'bg-red-100 text-red-700 border border-red-400'
                            }`}>
                            {message}
                        </div>
                    )}
                </div>

                <div className="text-sm text-gray-500 mt-8">
                    <p>Paste a YouTube URL above and click Download to save the video to your selected folder.</p>
                </div>
            </div>
        </div>
    );
}
