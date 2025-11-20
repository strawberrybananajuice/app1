'use client';

import { useState, useCallback, useEffect, useRef } from 'react';

interface SubtitleSegment {
    id: number;
    start: string;
    end: string;
    startMs: number;
    endMs: number;
    text: string;
}

interface ProcessedSentence {
    index: number;
    text: string;
    korean?: string;
    audioUrl?: string;
    isGenerating?: boolean;
    assignedVoiceIndex?: number | null;
    startTime?: string;
    endTime?: string;
    segmentIds?: number[];
}

interface ApiProcessedSentence {
    index: number;
    text: string;
    korean?: string;
    segmentIds?: number[];
    assignedVoiceIndex?: number | null;
}

const normalizeTimestamp = (timestamp: string): string => timestamp.replace('.', ',');

const timestampToMilliseconds = (timestamp: string): number => {
    const normalized = timestamp.replace(',', '.');
    const parts = normalized.split(':');
    if (parts.length !== 3) return 0;
    const [hours, minutes, secondsPart] = parts;
    const [seconds, milliseconds = '0'] = secondsPart.split('.');
    const h = Number(hours) || 0;
    const m = Number(minutes) || 0;
    const s = Number(seconds) || 0;
    const ms = Number(milliseconds.padEnd(3, '0').slice(0, 3)) || 0;
    return h * 3600000 + m * 60000 + s * 1000 + ms;
};

const millisecondsToTimestamp = (value: number): string => {
    const msTotal = Math.max(0, Math.floor(value));
    const hours = Math.floor(msTotal / 3600000);
    const minutes = Math.floor((msTotal % 3600000) / 60000);
    const seconds = Math.floor((msTotal % 60000) / 1000);
    const milliseconds = msTotal % 1000;
    return [hours, minutes, seconds].map(unit => String(unit).padStart(2, '0')).join(':') + `,${String(milliseconds).padStart(3, '0')}`;
};

const parseSrtSegments = (input: string): SubtitleSegment[] => {
    if (!input) return [];
    const normalized = input.replace(/\r/g, '');
    const lines = normalized.split('\n');
    const segments: SubtitleSegment[] = [];
    let i = 0;

    const timestampRegex = /(\d{2}:\d{2}:\d{2}[,\.]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[,\.]\d{3})/;

    while (i < lines.length) {
        const indexLine = lines[i]?.trim();
        if (!indexLine) {
            i++;
            continue;
        }
        if (!/^\d+$/.test(indexLine)) {
            i++;
            continue;
        }
        i++;
        if (i >= lines.length) break;

        const timestampLine = lines[i]?.trim() || '';
        const match = timestampRegex.exec(timestampLine);
        if (!match) {
            i++;
            continue;
        }
        i++;

        const textLines: string[] = [];
        while (i < lines.length && lines[i].trim() !== '') {
            textLines.push(lines[i].trim());
            i++;
        }

        while (i < lines.length && lines[i].trim() === '') {
            i++;
        }

        const text = textLines.join(' ').replace(/\s+/g, ' ').trim();
        const start = normalizeTimestamp(match[1]);
        const end = normalizeTimestamp(match[2]);
        segments.push({
            id: segments.length + 1,
            start,
            end,
            startMs: timestampToMilliseconds(start),
            endMs: timestampToMilliseconds(end),
            text
        });
    }

    return segments;
};

interface SubtitleTabProps {
    externalText?: string | null;
    onTranslationComplete?: (text: string) => void;
    isProcessing?: boolean;
    setIsProcessing?: (value: boolean) => void;
}

export default function SubtitleTab({ externalText, onTranslationComplete, isProcessing: externalIsProcessing, setIsProcessing: externalSetIsProcessing }: SubtitleTabProps) {
    const [cleanedText, setCleanedText] = useState('');
    const [processedSentences, setProcessedSentences] = useState<ProcessedSentence[]>([]);
    const [isProcessingGPT, setIsProcessingGPT] = useState(false);
    const [isGeneratingTTS, setIsGeneratingTTS] = useState(false);
    const [ttsProgress, setTtsProgress] = useState({ current: 0, total: 0 });
    const [audioFiles, setAudioFiles] = useState<string[]>([]);
    const [error, setError] = useState('');
    const [uploadedFileName, setUploadedFileName] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [destinationFolder, setDestinationFolder] = useState<FileSystemDirectoryHandle | null>(null);
    const [destinationPath, setDestinationPath] = useState<string>('');
    const [serverPath, setServerPath] = useState<string>('');
    const [isReading, setIsReading] = useState(false);
    const [selectedVoice, setSelectedVoice] = useState<SpeechSynthesisVoice | null>(null);
    const [selectedVoiceName, setSelectedVoiceName] = useState<string | null>(null);
    const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
    const [showVoiceSelector, setShowVoiceSelector] = useState(false);
    const [elapsedTime, setElapsedTime] = useState(0);
    const [supertoneVoiceIds, setSupertoneVoiceIds] = useState<string[]>(['c94c72e2d5570b64490a5d', '', '', '']);
    const [supertoneVoiceNicknames, setSupertoneVoiceNicknames] = useState<string[]>(['', '', '', '']);
    const [supertoneVoiceSpeeds, setSupertoneVoiceSpeeds] = useState<string[]>(['1.1', '1.1', '1.1', '1.1']);
    const [activeTab, setActiveTab] = useState(0);
    const [readingSentenceIndex, setReadingSentenceIndex] = useState<number | null>(null);
    const [isPlayingAudio, setIsPlayingAudio] = useState(false);
    const [isUsingExternalSrt, setIsUsingExternalSrt] = useState(false);
    const [subtitleSegments, setSubtitleSegments] = useState<SubtitleSegment[]>([]);
    const audioPlayerRef = useRef<HTMLAudioElement | null>(null);

    useEffect(() => {
        if (error) {
            const timer = setTimeout(() => {
                setError('');
            }, 2000);
            return () => clearTimeout(timer);
        }
    }, [error]);

    useEffect(() => {
        let interval: NodeJS.Timeout;
        if (isReading) {
            const startTime = Date.now();
            interval = setInterval(() => {
                setElapsedTime(Math.floor((Date.now() - startTime) / 1000));
            }, 1000);
        } else {
            setElapsedTime(0);
        }
        return () => clearInterval(interval);
    }, [isReading]);

    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    const cleanText = useCallback((text: string): string => {
        let cleaned = text.replace(/\d{2}:\d{2}:\d{2}[,\.]\d{3}\s*-->\s*\d{2}:\d{2}:\d{2}[,\.]\d{3}/g, '');
        cleaned = cleaned.replace(/^\d+\s*$/gm, '');
        cleaned = cleaned.replace(/<[^>]+>/g, '');
        cleaned = cleaned.replace(/[^\w\s.,!?:;'"—\-\u3000-\u303F\uAC00-\uD7A3\u1100-\u11FF\u3130-\u318F\uFF00-\uFFEF]/g, '');
        cleaned = cleaned.replace(/>>>+/g, '');
        cleaned = cleaned.replace(/[ \t]+/g, ' ');
        cleaned = cleaned.replace(/\n\s*\n\s*\n/g, '\n\n');
        return cleaned.trim();
    }, []);

    // Handle external text (e.g. from YouTube Downloader)
    const hasProcessedRef = useRef<string>('');
    useEffect(() => {
        console.log('============ EXTERNAL TEXT CHANGED ============');
        console.log('externalText:', externalText);
        console.log('hasProcessedRef.current:', hasProcessedRef.current);
        console.log('===============================================');
        if (externalText && externalText !== hasProcessedRef.current) {
            hasProcessedRef.current = externalText;
            const segments = parseSrtSegments(externalText);
            setSubtitleSegments(segments);
            const cleaned = cleanText(externalText);
            console.log('============ CLEANED TEXT ============');
            console.log('Cleaned length:', cleaned.length);
            console.log('======================================');
            setCleanedText(cleaned);
            setUploadedFileName('Imported from YouTube');
            setError('');
            setProcessedSentences([]);
            setAudioFiles([]);
            setIsUsingExternalSrt(true);

            const hasKoreanChars = /[\u3131-\u314e\u314f-\u3163\uac00-\ud7a3]/.test(cleaned);
            if (hasKoreanChars) {
                console.log('============ SKIPPING AUTO-PROCESS (KOREAN TEXT) ============');
                // Split Korean text into lines and create sentence structure
                const lines = cleaned.split('\n\n').filter(line => line.trim());
                const sentences = lines.map((line, idx) => ({
                    index: idx + 1,
                    text: line.trim(),
                    assignedVoiceIndex: null
                }));
                setProcessedSentences(sentences);
            }
        }
    }, [externalText, cleanText]);

    useEffect(() => {
        const loadVoices = () => {
            const voices = window.speechSynthesis.getVoices();
            const koreanVoices = voices.filter(v => v.lang.startsWith('ko'));
            setAvailableVoices(koreanVoices);
            if (koreanVoices.length > 0 && !selectedVoice) {
                const googleVoice = koreanVoices.find(v => v.name.includes('Google'));
                const chosen = googleVoice || koreanVoices[0];
                setSelectedVoice(chosen);
                setSelectedVoiceName(chosen?.name || null);
            }
        };
        loadVoices();
        if (window.speechSynthesis.onvoiceschanged !== undefined) {
            window.speechSynthesis.onvoiceschanged = loadVoices;
        }
    }, [selectedVoice]);

    // When saved selected voice name exists, set selectedVoice to match once voices are loaded
    useEffect(() => {
        if (selectedVoiceName && availableVoices.length > 0) {
            const found = availableVoices.find(v => v.name === selectedVoiceName) || null;
            if (found) setSelectedVoice(found);
        }
    }, [selectedVoiceName, availableVoices]);

    const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        const file = e.dataTransfer.files[0];
        if (file) {
            setUploadedFileName(file.name);
            const reader = new FileReader();
            reader.onload = (event) => {
                const text = event.target?.result as string;
                const segments = parseSrtSegments(text);
                setSubtitleSegments(segments);
                const cleaned = cleanText(text);
                setCleanedText(cleaned);
                setError('');
                setProcessedSentences([]);
                setAudioFiles([]);
                setIsUsingExternalSrt(false);
            };
            reader.readAsText(file);
        }
    }, [cleanText]);

    const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
    };

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setUploadedFileName(file.name);
            const reader = new FileReader();
            reader.onload = (event) => {
                const text = event.target?.result as string;
                const segments = parseSrtSegments(text);
                setSubtitleSegments(segments);
                const cleaned = cleanText(text);
                setCleanedText(cleaned);
                setError('');
                setProcessedSentences([]);
                setAudioFiles([]);
                setIsUsingExternalSrt(false);
            };
            reader.readAsText(file);
        }
    };

    const getBaseFileName = (suffix?: string) => {
        const withoutExtension = uploadedFileName ? uploadedFileName.replace(/\.[^/.]+$/, '') : 'subtitles';
        const sanitizedBase = withoutExtension.trim() ? withoutExtension.trim().replace(/\s+/g, '_') : 'subtitles';
        return suffix ? `${sanitizedBase}_${suffix}` : sanitizedBase;
    };

    const writeContentToFolder = async (baseName: string, extension: string, content: string) => {
        if (!destinationFolder) return;
        let attempt = 0;
        let fileName = `${baseName}${extension}`;
        while (true) {
            try {
                await destinationFolder.getFileHandle(fileName);
                attempt += 1;
                fileName = `${baseName}_${attempt}${extension}`;
            } catch {
                break;
            }
        }
        const fileHandle = await destinationFolder.getFileHandle(fileName, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(content);
        await writable.close();
    };

    const writeContentToPreferredDestination = async (content: string, extension: string, suffix?: string) => {
        const normalizedExtension = extension.startsWith('.') ? extension : `.${extension}`;
        const baseName = getBaseFileName(suffix);

        if (serverPath) {
            const response = await fetch('/api/save-file', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    content,
                    originalFileName: uploadedFileName || `${baseName}${normalizedExtension}`,
                    baseFileName: baseName,
                    destinationPath: serverPath,
                    fileExtension: normalizedExtension
                }),
            });
            if (!response.ok) {
                const data = await response.json().catch(() => ({}));
                throw new Error(data.error || 'Failed to save file');
            }
            return true;
        }

        if (destinationFolder) {
            await writeContentToFolder(baseName, normalizedExtension, content);
            return true;
        }

        return false;
    };

    const downloadContent = (content: string, extension: string, suffix?: string) => {
        const normalizedExtension = extension.startsWith('.') ? extension : `.${extension}`;
        const fileName = `${getBaseFileName(suffix)}${normalizedExtension}`;
        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

    const buildSrtContent = (sentences: ProcessedSentence[]): string => {
        return sentences.map((sentence, idx) => {
            const safeText = sentence.text.trim();
            const fallbackStart = millisecondsToTimestamp(idx * 2000);
            const start = sentence.startTime || fallbackStart;
            let end = sentence.endTime;
            if (!end) {
                const startMs = timestampToMilliseconds(start);
                end = millisecondsToTimestamp(startMs + 2000);
            }
            if (timestampToMilliseconds(end) <= timestampToMilliseconds(start)) {
                const startMs = timestampToMilliseconds(start);
                end = millisecondsToTimestamp(startMs + 500);
            }
            return `${idx + 1}\n${start} --> ${end}\n${safeText}\n`;
        }).join('\n');
    };

    const processWithGPT = async (textToProcess?: string | React.MouseEvent) => {
        const text = typeof textToProcess === 'string' ? textToProcess : cleanedText;
        if (!text) {
            setError('Please upload a file first');
            return;
        }
        setIsProcessingGPT(true);
        if (externalSetIsProcessing) externalSetIsProcessing(true);
        setError('');
        try {
            const response = await fetch('/api/process-gpt', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text, segments: subtitleSegments }),
            });
            if (!response.ok) throw new Error('Failed to process text with GPT');
            const data = await response.json();
            console.log('============ RECEIVED DATA FROM API ============');
            console.log(JSON.stringify(data, null, 2));
            console.log('================================================');
            let fallbackSegmentCursor = 0;
            const enrichedSentences: ProcessedSentence[] = (data.sentences as ApiProcessedSentence[]).map((sentence) => {
                const providedSegmentIds = Array.isArray(sentence.segmentIds) ? sentence.segmentIds : [];
                const segmentIds = providedSegmentIds.length
                    ? providedSegmentIds
                    : (() => {
                        if (subtitleSegments[fallbackSegmentCursor]) {
                            const id = subtitleSegments[fallbackSegmentCursor].id;
                            fallbackSegmentCursor += 1;
                            return [id];
                        }
                        return [];
                    })();

                const matchedSegments = segmentIds
                    .map(id => subtitleSegments.find(seg => seg.id === id))
                    .filter((seg): seg is SubtitleSegment => Boolean(seg));

                let startMs: number | null = matchedSegments.length ? Math.min(...matchedSegments.map(seg => seg.startMs)) : null;
                let endMs: number | null = matchedSegments.length ? Math.max(...matchedSegments.map(seg => seg.endMs)) : null;

                if (startMs === null && subtitleSegments[sentence.index - 1]) {
                    startMs = subtitleSegments[sentence.index - 1].startMs;
                    endMs = subtitleSegments[sentence.index - 1].endMs;
                }

                if (startMs !== null && (endMs === null || endMs < startMs)) {
                    endMs = startMs + 500;
                }

                return {
                    ...sentence,
                    segmentIds,
                    assignedVoiceIndex: sentence.assignedVoiceIndex ?? null,
                    startTime: startMs !== null ? millisecondsToTimestamp(startMs) : undefined,
                    endTime: endMs !== null ? millisecondsToTimestamp(endMs) : undefined
                } as ProcessedSentence;
            });

            setProcessedSentences(enrichedSentences);

            // Extract Korean translations and pass to parent
            if (onTranslationComplete && enrichedSentences.length > 0) {
                const koreanText = enrichedSentences
                    .map((s: { korean?: string }) => s.korean || '')
                    .filter((k: string) => k)
                    .join('\n\n');
                console.log('============ EXTRACTED KOREAN TEXT ============');
                console.log(koreanText);
                console.log('===============================================');
                if (koreanText) {
                    onTranslationComplete(koreanText);
                }
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'An error occurred');
        } finally {
            setIsProcessingGPT(false);
            if (externalSetIsProcessing) externalSetIsProcessing(false);
        }
    };

    const downloadAll = () => {
        setError('');
        audioFiles.forEach((url, index) => {
            const a = document.createElement('a');
            a.href = url;
            a.download = `${String(index + 1).padStart(3, '0')}.mp3`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        });
    };

    const handleSentenceEdit = (index: number, newText: string) => {
        setProcessedSentences(prev =>
            prev.map(sentence =>
                sentence.index === index ? { ...sentence, text: newText } : sentence
            )
        );
    };

    const removeSentence = (index: number) => {
        setError('');
        setProcessedSentences(prev => {
            const filtered = prev.filter(s => s.index !== index);
            return filtered.map((s, idx) => ({ ...s, index: idx + 1 }));
        });
    };

    const addSentence = (afterIndex?: number) => {
        setError('');
        setProcessedSentences(prev => {
            const newSentence: ProcessedSentence = {
                index: 0,
                text: '',
                assignedVoiceIndex: activeTab
            };
            let newList: ProcessedSentence[];
            if (afterIndex === undefined) {
                newList = [...prev, newSentence];
            } else {
                const insertPosition = prev.findIndex(s => s.index === afterIndex) + 1;
                newList = [...prev.slice(0, insertPosition), newSentence, ...prev.slice(insertPosition)];
            }
            return newList.map((s, idx) => ({ ...s, index: idx + 1 }));
        });
    };

    const setDestination = async () => {
        try {
            if (!('showDirectoryPicker' in window)) {
                setError('Folder selection is not supported in this browser. Please use Chrome, Edge, or another Chromium-based browser.');
                return;
            }
            interface ShowDirectoryPickerOptions {
                mode?: 'read' | 'readwrite';
            }
            const dirHandle = await (window as Window & {
                showDirectoryPicker: (options?: ShowDirectoryPickerOptions) => Promise<FileSystemDirectoryHandle>
            }).showDirectoryPicker({ mode: 'readwrite' });
            setDestinationFolder(dirHandle);
            setDestinationPath(dirHandle.name);
            // Also show the selected folder name in the server path field (can't get absolute path for security reasons)
            setServerPath(dirHandle.name);
            setError('');
        } catch (err) {
            if ((err as Error).name !== 'AbortError') {
                setError('Failed to select destination folder');
            }
        }
    };

    const openFolder = async () => {
        if (!serverPath) return;
        const isAbsolute = (p: string) => p.startsWith('/') || /^[A-Za-z]:[\\/]/.test(p);
        if (!isAbsolute(serverPath)) {
            setError('Open folder requires an absolute path (paste the path or use Browse)');
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
            setError('Failed to open folder');
        }
    };

    const browseFolder = async () => {
        try {
            const response = await fetch('/api/select-folder', { method: 'POST' });
            const data = await response.json();
            if (data.path) {
                setServerPath(data.path);
            } else if (data.error) {
                console.log('Folder selection cancelled or failed:', data.error);
            }
        } catch (err) {
            console.error('Failed to browse folder', err);
        }
    };

    const saveSentencesToFile = async () => {
        if (processedSentences.length === 0) {
            setError('No sentences to save');
            return;
        }
        setIsSaving(true);
        setError('');
        try {
            const content = processedSentences.map(sentence => sentence.text).join('\n');
            const saved = await writeContentToPreferredDestination(content, '.txt', 'processed');
            if (!saved) {
                downloadContent(content, '.txt', 'processed');
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to save file');
        } finally {
            setIsSaving(false);
        }
    };

    const generateSingleTTS = async (index: number) => {
        setError('');
        const sentence = processedSentences.find(s => s.index === index);
        if (!sentence) return;
        if (!destinationFolder) {
            setError('Please re-select the destination folder (required on reload)');
            return;
        }
        const voiceIndex = sentence.assignedVoiceIndex !== undefined && sentence.assignedVoiceIndex !== null ? sentence.assignedVoiceIndex : activeTab;
        const voiceId = supertoneVoiceIds[voiceIndex];
        const speed = supertoneVoiceSpeeds[voiceIndex];
        if (!voiceId) {
            setError(`No Voice ID configured for Voice ${voiceIndex + 1}`);
            return;
        }
        setProcessedSentences(prev => prev.map(s => s.index === index ? { ...s, isGenerating: true } : s));
        try {
            const response = await fetch('/api/generate-tts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: sentence.text, index: sentence.index, voiceId: voiceId, speed: speed }),
            });
            if (!response.ok) throw new Error(`Failed to generate TTS for sentence ${sentence.index}`);
            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            const fileName = `${String(sentence.index).padStart(3, '0')}.mp3`;
            const fileHandle = await destinationFolder.getFileHandle(fileName, { create: true });
            const writable = await fileHandle.createWritable();
            await writable.write(blob);
            await writable.close();
            setProcessedSentences(prev => prev.map(s => s.index === index ? { ...s, audioUrl: url, isGenerating: false } : s));
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to generate TTS');
            setProcessedSentences(prev => prev.map(s => s.index === index ? { ...s, isGenerating: false } : s));
        }
    };

    const toggleSentenceSelection = (index: number) => {
        setError('');
        setProcessedSentences(prev =>
            prev.map(s => {
                if (s.index === index) {
                    if (s.assignedVoiceIndex === activeTab) {
                        return { ...s, assignedVoiceIndex: null };
                    }
                    return { ...s, assignedVoiceIndex: activeTab };
                }
                return s;
            })
        );
    };

    const selectAllForTab = () => {
        setError('');
        setProcessedSentences(prev => prev.map(s => ({ ...s, assignedVoiceIndex: activeTab })));
    };

    const selectUnusedForTab = () => {
        setError('');
        setProcessedSentences(prev =>
            prev.map(s => ({
                ...s,
                assignedVoiceIndex: (s.assignedVoiceIndex === undefined || s.assignedVoiceIndex === null) ? activeTab : s.assignedVoiceIndex
            }))
        );
    };

    const deselectAllForTab = () => {
        setError('');
        setProcessedSentences(prev =>
            prev.map(s => ({ ...s, assignedVoiceIndex: s.assignedVoiceIndex === activeTab ? null : s.assignedVoiceIndex }))
        );
    };

    const readSelectedWithBrowserTTS = () => {
        setError('');
        if (isReading) {
            window.speechSynthesis.cancel();
            setIsReading(false);
            setReadingSentenceIndex(null);
            return;
        }
        const selectedSentences = processedSentences.filter(s => s.assignedVoiceIndex !== undefined && s.assignedVoiceIndex !== null);
        if (selectedSentences.length === 0) {
            setError('Please select at least one sentence to read');
            return;
        }
        if (!('speechSynthesis' in window)) {
            setError('Your browser does not support text-to-speech');
            return;
        }
        window.speechSynthesis.cancel();
        const textToRead = selectedSentences.map(s => s.text).join('. ');
        const sentenceRanges: { index: number; start: number; end: number }[] = [];
        let currentCharIndex = 0;
        selectedSentences.forEach((s) => {
            const start = currentCharIndex;
            const end = start + s.text.length;
            sentenceRanges.push({ index: s.index, start, end });
            currentCharIndex = end + 2;
        });
        const utterance = new SpeechSynthesisUtterance(textToRead);
        if (selectedVoice) utterance.voice = selectedVoice;
        utterance.lang = selectedVoice?.lang || 'ko-KR';
        utterance.rate = 1.0;
        utterance.pitch = 1.0;
        setIsReading(true);
        utterance.onboundary = (event) => {
            if (event.name === 'word' || event.name === 'sentence') {
                const charIndex = event.charIndex;
                const currentSentence = sentenceRanges.find(r => charIndex >= r.start && charIndex < r.end + 2);
                if (currentSentence) setReadingSentenceIndex(currentSentence.index);
            }
        };
        utterance.onend = () => {
            setIsReading(false);
            setReadingSentenceIndex(null);
        };
        utterance.onerror = () => {
            setIsReading(false);
            setReadingSentenceIndex(null);
        };
        window.speechSynthesis.speak(utterance);
    };

    const downloadAllSelected = async () => {
        const selectedSentences = processedSentences.filter(s => s.assignedVoiceIndex === activeTab);
        if (selectedSentences.length === 0) {
            setError(`Please select at least one sentence for ${supertoneVoiceNicknames[activeTab] || `Voice ${activeTab + 1}`}`);
            return;
        }
        if (!destinationFolder) {
            setError('Please re-select the destination folder (required on reload)');
            return;
        }
        setIsGeneratingTTS(true);
        setError('');
        setTtsProgress({ current: 0, total: selectedSentences.length });
        for (let i = 0; i < selectedSentences.length; i++) {
            const sentence = selectedSentences[i];
            setTtsProgress({ current: i + 1, total: selectedSentences.length });
            if (sentence.audioUrl) continue;
            setProcessedSentences(prev => prev.map(s => s.index === sentence.index ? { ...s, isGenerating: true } : s));
            try {
                const voiceIndex = sentence.assignedVoiceIndex!;
                const voiceId = supertoneVoiceIds[voiceIndex];
                const speed = supertoneVoiceSpeeds[voiceIndex];
                if (!voiceId) throw new Error(`No Voice ID configured for Voice ${voiceIndex + 1}`);
                const response = await fetch('/api/generate-tts', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ text: sentence.text, index: sentence.index, voiceId: voiceId, speed: speed }),
                });
                if (!response.ok) throw new Error(`Failed to generate TTS for sentence ${sentence.index}`);
                const blob = await response.blob();
                const url = URL.createObjectURL(blob);
                const fileName = `${String(sentence.index).padStart(3, '0')}.mp3`;
                const fileHandle = await destinationFolder.getFileHandle(fileName, { create: true });
                const writable = await fileHandle.createWritable();
                await writable.write(blob);
                await writable.close();
                setProcessedSentences(prev => prev.map(s => s.index === sentence.index ? { ...s, audioUrl: url, isGenerating: false } : s));
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Failed to generate TTS');
                setProcessedSentences(prev => prev.map(s => s.index === sentence.index ? { ...s, isGenerating: false } : s));
                break;
            }
        }
        setIsGeneratingTTS(false);
    };

    const playSelectedAudio = () => {
        setError('');
        if (isReading) {
            window.speechSynthesis.cancel();
            setIsReading(false);
            setReadingSentenceIndex(null);
        }
        if (isPlayingAudio) {
            if (audioPlayerRef.current) {
                audioPlayerRef.current.pause();
                audioPlayerRef.current = null;
            }
            setIsPlayingAudio(false);
            setReadingSentenceIndex(null);
            return;
        }
        const selectedSentencesWithAudio = processedSentences.filter(s => s.assignedVoiceIndex !== undefined && s.assignedVoiceIndex !== null && s.audioUrl);
        if (selectedSentencesWithAudio.length === 0) {
            setError('No selected sentences have generated audio');
            return;
        }
        setIsPlayingAudio(true);
        let currentIndex = 0;
        const playNext = () => {
            if (currentIndex >= selectedSentencesWithAudio.length) {
                setIsPlayingAudio(false);
                setReadingSentenceIndex(null);
                audioPlayerRef.current = null;
                return;
            }
            const sentence = selectedSentencesWithAudio[currentIndex];
            setReadingSentenceIndex(sentence.index);
            const audio = new Audio(sentence.audioUrl);
            audioPlayerRef.current = audio;
            audio.onended = () => {
                currentIndex++;
                playNext();
            };
            audio.onerror = () => {
                console.error(`Error playing audio for sentence ${sentence.index}`);
                currentIndex++;
                playNext();
            };
            audio.play().catch(e => {
                console.error("Playback failed", e);
                setIsPlayingAudio(false);
                setReadingSentenceIndex(null);
            });
        };
        playNext();
    };

    return (
        <div className="h-full flex flex-col">
            <div className="flex gap-4 flex-shrink-0 p-2">
                <div onDrop={handleDrop} onDragOver={handleDragOver} className={`w-1/2 border-4 border-dashed rounded-xl p-6 text-center transition-colors relative ${isUsingExternalSrt ? 'border-green-500 bg-green-50' : 'border-gray-300 hover:border-blue-400 bg-white'}`}>
                    <input type="file" accept=".txt,.srt,text/*" onChange={handleFileSelect} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                    <div className="space-y-2 pointer-events-none">
                        {isUsingExternalSrt && (
                            <div className="absolute top-2 right-2 bg-green-500 text-white text-xs px-2 py-1 rounded-full font-bold shadow-sm">
                                SRT Loaded
                            </div>
                        )}
                        <svg className={`mx-auto h-12 w-12 ${isUsingExternalSrt ? 'text-green-500' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                        </svg>
                        <p className={`text-lg ${isUsingExternalSrt ? 'text-green-700 font-medium' : 'text-gray-600'}`}>{uploadedFileName ? `Uploaded: ${uploadedFileName}` : 'Drag and drop your text file here'}</p>
                        <p className="text-xs text-gray-400">Supports .txt, .srt, and other text files</p>
                    </div>
                </div>
                <div className="w-1/2 flex flex-col justify-center bg-white p-2 rounded-xl border border-gray-200">
                    <div className="grid grid-cols-1 gap-2">
                        {supertoneVoiceIds.map((id, index) => (
                            <div key={index} className="flex items-center gap-1 p-1.5 border border-gray-200 bg-white rounded">
                                <span className="text-xs font-bold text-gray-700 w-6 text-center">{index + 1}</span>
                                <input type="text" placeholder="Voice ID" value={id} onChange={(e) => {
                                    const newIds = [...supertoneVoiceIds];
                                    newIds[index] = e.target.value;
                                    setSupertoneVoiceIds(newIds);
                                }} className="flex-1 min-w-0 px-2 py-1 border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm font-mono bg-white text-black placeholder-gray-600" />
                                <input type="text" placeholder="Nickname" value={supertoneVoiceNicknames[index]} onChange={(e) => {
                                    const newNicknames = [...supertoneVoiceNicknames];
                                    newNicknames[index] = e.target.value;
                                    setSupertoneVoiceNicknames(newNicknames);
                                }} className="w-24 px-2 py-1 border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm bg-white text-black placeholder-gray-600" />
                                <input type="text" placeholder="Speed" value={supertoneVoiceSpeeds[index]} onChange={(e) => {
                                    const newSpeeds = [...supertoneVoiceSpeeds];
                                    newSpeeds[index] = e.target.value;
                                    setSupertoneVoiceSpeeds(newSpeeds);
                                }} className="w-14 px-2 py-1 border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm text-center bg-white text-black placeholder-gray-600" />
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            <div className="flex gap-1 px-1 -mb-px z-10 relative">
                {supertoneVoiceIds.map((_, index) => {
                    const tabColors = [
                        { active: 'bg-blue-50 border-blue-400 text-blue-700', inactive: 'bg-blue-100 border-blue-300 text-blue-600 hover:bg-blue-50' },
                        { active: 'bg-green-50 border-green-400 text-green-700', inactive: 'bg-green-100 border-green-300 text-green-600 hover:bg-green-50' },
                        { active: 'bg-purple-50 border-purple-400 text-purple-700', inactive: 'bg-purple-100 border-purple-300 text-purple-600 hover:bg-purple-50' },
                        { active: 'bg-orange-50 border-orange-400 text-orange-700', inactive: 'bg-orange-100 border-orange-300 text-orange-600 hover:bg-orange-50' }
                    ];
                    const colors = tabColors[index];
                    return (
                        <button key={index} onClick={() => setActiveTab(index)} className={`flex-1 py-2 px-4 rounded-t-lg font-medium text-sm transition-colors border-t border-x ${activeTab === index ? `${colors.active} border-b-white -mb-px z-10` : `${colors.inactive}`}`}>
                            {supertoneVoiceNicknames[index] || `Voice ${index + 1}`}
                        </button>
                    );
                })}
            </div>

            {error && (
                <div className="fixed top-4 left-4 w-[calc(50%-2rem)] z-50 px-6 py-3 bg-red-100 border border-red-400 text-red-700 rounded-lg shadow-lg text-center">
                    {error}
                </div>
            )}

            {cleanedText && (
                <div className="bg-white rounded-b-xl rounded-tr-xl p-2 shadow-sm flex-1 flex flex-col overflow-hidden -mt-px border-t border-gray-200">
                    <div className="flex justify-between items-center mb-3 flex-shrink-0">
                        <h2 className="text-xl font-semibold text-gray-700 flex items-center gap-3">
                            {isReading ? <span className="font-mono text-blue-600 text-2xl">{formatTime(elapsedTime)}</span> : `Lines (${processedSentences.length})`}
                        </h2>
                        <div className="flex gap-3">
                            <button onClick={processWithGPT} disabled={isProcessingGPT || externalIsProcessing} title="Process with GPT-4o-mini" className="px-6 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex items-center gap-2">
                                {isProcessingGPT ? (
                                    <>
                                        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                        </svg>
                                        Processing...
                                    </>
                                ) : (
                                    <>
                                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                                        </svg>
                                        Process
                                    </>
                                )}
                            </button>
                            <button onClick={setDestination} title={destinationPath && !destinationFolder ? "Please re-select folder to restore access" : "Set Destination Folder"} className={`px-6 py-2 rounded-lg transition-colors flex items-center gap-2 ${destinationPath && !destinationFolder ? 'bg-red-500 hover:bg-red-600 text-white' : 'bg-orange-500 hover:bg-orange-600 text-white'}`}>
                                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                                </svg>
                                {destinationPath && !destinationFolder ? `Re-select (${destinationPath})` : `Dest ${destinationPath && `(${destinationPath})`}`}
                            </button>
                            <button onClick={() => { setError(''); setShowVoiceSelector(!showVoiceSelector); }} title="Select Browser TTS Voice" className="px-6 py-2 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 transition-colors flex items-center gap-2">
                                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                </svg>
                                Set Voice
                            </button>
                            <button onClick={downloadAllSelected} disabled={isGeneratingTTS || !processedSentences.some(s => s.assignedVoiceIndex !== undefined && s.assignedVoiceIndex !== null)} title="Fetch Selected from Supertone" className="px-6 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex items-center gap-2">
                                {isGeneratingTTS ? (
                                    <>
                                        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                        </svg>
                                        Downloading {ttsProgress.current}/{ttsProgress.total}...
                                    </>
                                ) : (
                                    <>
                                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                        </svg>
                                        Supertone
                                    </>
                                )}
                            </button>
                            <button onClick={playSelectedAudio} disabled={!isPlayingAudio && !processedSentences.some(s => s.assignedVoiceIndex !== undefined && s.assignedVoiceIndex !== null && s.audioUrl)} title="Play Selected Audio Files" className="px-6 py-2 bg-pink-500 text-white rounded-lg hover:bg-pink-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex items-center gap-2">
                                {isPlayingAudio ? (
                                    <>
                                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
                                        </svg>
                                        Stop Audio
                                    </>
                                ) : (
                                    <>
                                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                        </svg>
                                        Play
                                    </>
                                )}
                            </button>
                            <button onClick={readSelectedWithBrowserTTS} disabled={!isReading && !processedSentences.some(s => s.assignedVoiceIndex !== undefined && s.assignedVoiceIndex !== null)} title="Read with Browser TTS" className="px-6 py-2 bg-cyan-500 text-white rounded-lg hover:bg-cyan-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex items-center gap-2">
                                {isReading ? (
                                    <>
                                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
                                        </svg>
                                        Stop
                                    </>
                                ) : (
                                    <>
                                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                                        </svg>
                                        TTS
                                    </>
                                )}
                            </button>
                            <button onClick={saveSentencesToFile} disabled={isSaving} title="Save Processed Text to File" className="px-6 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex items-center gap-2">
                                {isSaving ? (
                                    <>
                                        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                        </svg>
                                        Saving...
                                    </>
                                ) : (
                                    <>
                                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                                        </svg>
                                        Save Text
                                    </>
                                )}
                            </button>
                        </div>
                    </div>

                    <div className="mt-2 flex gap-2 items-center bg-white p-2 rounded-lg border border-gray-200">
                        <input
                            type="text"
                            value={serverPath}
                            onChange={(e) => setServerPath(e.target.value)}
                            placeholder="Optional: Absolute path for direct saving & opening (e.g. /Users/name/Downloads)"
                            className="flex-1 px-3 py-2 border border-gray-300 rounded text-sm focus:ring-1 focus:ring-blue-500 outline-none text-black placeholder-gray-600 bg-white"
                        />
                        <button
                            onClick={browseFolder}
                            className="px-4 py-2 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 text-sm font-medium whitespace-nowrap"
                            title="Browse Folder"
                        >
                            Browse
                        </button>
                        <button
                            onClick={openFolder}
                            disabled={!serverPath}
                            className="px-4 py-2 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium whitespace-nowrap"
                            title={serverPath ? "Open Folder" : "Enter a path to enable"}
                        >
                            Open Folder
                        </button>
                    </div>

                    {showVoiceSelector && (
                        <div className="mt-3 p-4 bg-white rounded-lg border border-gray-200">
                            <h3 className="text-lg font-semibold mb-3 text-gray-700">Select TTS Voice</h3>
                            <div className="max-h-60 overflow-y-auto space-y-2">
                                {availableVoices.map((voice, index) => (
                                    <div key={index} onClick={() => { setError(''); setSelectedVoice(voice); setSelectedVoiceName(voice.name); setShowVoiceSelector(false); }} className={`p-3 rounded-lg cursor-pointer transition-colors ${selectedVoice?.name === voice.name ? 'bg-indigo-100 border-2 border-indigo-500' : 'bg-gray-50 hover:bg-gray-100 border-2 border-transparent'}`}>
                                        <div className="font-medium text-gray-800">{voice.name}</div>
                                        <div className="text-sm text-gray-500">{voice.lang} • {voice.localService ? 'Local' : 'Remote'}</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                    <div className="bg-gray-50 p-4 rounded-lg flex-1 overflow-y-auto min-h-0 space-y-1">
                        <div className="flex gap-2 p-2 bg-white rounded-lg items-center mb-1 flex-wrap">
                            <span className="font-semibold text-gray-600">{supertoneVoiceNicknames[activeTab] || `Voice ${activeTab + 1}`}</span>
                            <button onClick={selectAllForTab} className="px-3 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200 transition-colors font-medium">Select All</button>
                            <button onClick={selectUnusedForTab} className="px-3 py-1 text-xs bg-green-100 text-green-700 rounded hover:bg-green-200 transition-colors font-medium">Select Unused</button>
                            <button onClick={deselectAllForTab} className="px-3 py-1 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors font-medium">Clear</button>
                        </div>
                        {processedSentences.map((sentence) => (
                            <div key={sentence.index} className="flex gap-3 p-1 bg-white rounded-lg items-start">
                                <div className="flex flex-col gap-1 items-start">
                                    <input type="checkbox" checked={sentence.assignedVoiceIndex === activeTab} onChange={() => toggleSentenceSelection(sentence.index)} className="w-5 h-5 cursor-pointer flex-shrink-0" />
                                    <div className="flex gap-1">
                                        <button onClick={() => addSentence(sentence.index)} className="p-0.5 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors" title="Add sentence after this">
                                            <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                            </svg>
                                        </button>
                                        <button onClick={() => removeSentence(sentence.index)} className="p-0.5 bg-red-500 text-white rounded hover:bg-red-600 transition-colors" title="Remove this sentence">
                                            <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                            </svg>
                                        </button>
                                    </div>
                                </div>
                                <span className={`font-mono text-sm text-gray-500 min-w-[3rem] pt-2 px-1 rounded ${sentence.assignedVoiceIndex === 0 ? 'bg-blue-200' : sentence.assignedVoiceIndex === 1 ? 'bg-green-200' : sentence.assignedVoiceIndex === 2 ? 'bg-purple-200' : sentence.assignedVoiceIndex === 3 ? 'bg-orange-200' : 'bg-pink-200'}`}>
                                    {String(sentence.index).padStart(3, '0')}
                                </span>
                                <textarea value={sentence.text} onChange={(e) => handleSentenceEdit(sentence.index, e.target.value)} className={`flex-1 text-gray-700 border rounded focus:outline-none focus:border-blue-400 resize-none overflow-hidden ${readingSentenceIndex === sentence.index ? 'bg-yellow-100 border-yellow-400 ring-2 ring-yellow-200' : 'border-gray-200'}`} rows={Math.max(2, Math.ceil(sentence.text.length / 80))} style={{ minHeight: '3rem' }} />
                                <div className="flex gap-2">
                                    <button onClick={() => generateSingleTTS(sentence.index)} disabled={sentence.isGenerating} className="p-2 bg-purple-500 text-white rounded hover:bg-purple-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors" title="Download MP3">
                                        {sentence.isGenerating ? (
                                            <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                            </svg>
                                        ) : (
                                            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                            </svg>
                                        )}
                                    </button>
                                    <button onClick={() => { setError(''); if (sentence.audioUrl) { const audio = new Audio(sentence.audioUrl); audio.play(); } }} disabled={!sentence.audioUrl} className="p-2 bg-green-500 text-white rounded hover:bg-green-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors" title="Play MP3">
                                        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                        </svg>
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {audioFiles.length > 0 && (
                <div className="bg-white rounded-xl p-6 shadow-sm flex-shrink-0 max-h-60 overflow-y-auto">
                    <div className="flex justify-between items-center mb-4">
                        <h2 className="text-xl font-semibold text-gray-700">Generated Audio Files ({audioFiles.length})</h2>
                        <button onClick={downloadAll} className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors">Download All</button>
                    </div>
                    <div className="space-y-3 max-h-96 overflow-y-auto">
                        {audioFiles.map((url, index) => (
                            <div key={index} className="flex items-center gap-4 p-3 bg-gray-50 rounded-lg">
                                <span className="font-mono text-sm text-gray-500 min-w-[3rem]">{String(index + 1).padStart(3, '0')}.mp3</span>
                                <audio controls className="flex-1" src={url} />
                                <a href={url} download={`${String(index + 1).padStart(3, '0')}.mp3`} className="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 transition-colors">Download</a>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
