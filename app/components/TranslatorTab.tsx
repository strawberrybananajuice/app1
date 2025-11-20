"use client";

import { useState, useEffect, useCallback } from 'react';

type TranslationDirection = 'korToEng' | 'engToKor';

const directionLabels: Record<TranslationDirection, string> = {
  korToEng: 'Korean → English',
  engToKor: 'English → Korean'
};

const directionPlaceholder: Record<TranslationDirection, string> = {
  korToEng: 'Paste Korean text here. Existing line breaks and numbering are preserved.',
  engToKor: 'Paste English text here. Existing line breaks and numbering are preserved.'
};

export default function TranslatorTab() {
  const [direction, setDirection] = useState<TranslationDirection>('korToEng');
  const [sourceText, setSourceText] = useState('');
  const [translatedText, setTranslatedText] = useState('');
  const [isTranslating, setIsTranslating] = useState(false);
  const [error, setError] = useState('');
  const [destinationFolder, setDestinationFolder] = useState<FileSystemDirectoryHandle | null>(null);
  const [destinationPath, setDestinationPath] = useState('');

  const handleTranslate = useCallback(async () => {
    setError('');
    if (!sourceText.trim()) {
      setError('Please provide text to translate.');
      return;
    }

    setIsTranslating(true);
    try {
      const response = await fetch('/api/translate-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: sourceText, direction })
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Translation failed');
      }

      const data = await response.json();
      setTranslatedText(data.translation || '');
    } catch (err) {
      console.error('Translation error', err);
      setError(err instanceof Error ? err.message : 'Translation failed');
    } finally {
      setIsTranslating(false);
    }
  }, [direction, sourceText]);

  const handleSwap = useCallback(() => {
    setDirection((prev) => (prev === 'korToEng' ? 'engToKor' : 'korToEng'));
    setSourceText(translatedText);
    setTranslatedText(sourceText);
  }, [sourceText, translatedText]);

  const handleCopy = useCallback(async () => {
    if (!translatedText) return;
    try {
      await navigator.clipboard.writeText(translatedText);
    } catch (err) {
      console.error('Clipboard error', err);
    }
  }, [translatedText]);

  const handleClear = useCallback(() => {
    setSourceText('');
    setTranslatedText('');
    setError('');
  }, []);

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target?.result as string;
        setSourceText(text);
      };
      reader.readAsText(file);
    }
  }, []);

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target?.result as string;
        setSourceText(text);
      };
      reader.readAsText(file);
    }
  };

  const handleOpenDestination = async () => {
    if (typeof window === 'undefined') return;

    // If we have a saved destination, try to use it
    if (destinationFolder) {
      try {
        const fileHandle = await destinationFolder.getFileHandle('translation.txt', { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(translatedText || sourceText);
        await writable.close();
        return;
      } catch (err) {
        console.error('Failed to use saved destination:', err);
        // Fall through to picker
      }
    }

    const showDirectoryPicker = (window as unknown as { showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker;
    if (!showDirectoryPicker) {
      setError('File system access not supported in this browser.');
      return;
    }

    try {
      const dirHandle = await showDirectoryPicker();
      setDestinationFolder(dirHandle);
      setDestinationPath(dirHandle.name);

      const fileHandle = await dirHandle.getFileHandle('translation.txt', { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(translatedText || sourceText);
      await writable.close();
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        // User cancelled the picker, do nothing
        return;
      }
      console.error('Failed to open/save file:', err);
      setError('Failed to save file.');
    }
  }; return (
    <div className="h-full flex flex-col bg-white">
      <div className="border-b border-gray-200 p-4 flex flex-wrap gap-3 items-center justify-between">
        <div className="flex gap-2">
          {Object.entries(directionLabels).map(([value, label]) => (
            <button
              key={value}
              onClick={() => setDirection(value as TranslationDirection)}
              className={`px-4 py-2 rounded-md text-sm font-semibold transition-colors ${direction === value
                ? 'bg-blue-500 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleSwap}
            className="px-3 py-2 text-sm font-semibold border border-gray-300 rounded-md hover:bg-gray-100 text-black"
          >
            Swap
          </button>
          <button
            onClick={handleClear}
            className="px-3 py-2 text-sm font-semibold border border-gray-300 rounded-md hover:bg-gray-100 text-black"
          >
            Clear
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-100 text-red-700 px-4 py-2 text-sm border-b border-red-200">
          {error}
        </div>
      )}

      <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-0 md:gap-4 p-4 overflow-hidden">
        <div className="flex flex-col h-full">
          <div className="flex justify-between items-center mb-2">
            <h2 className="font-semibold text-black">Source</h2>
            <button
              onClick={handleTranslate}
              disabled={isTranslating || !sourceText.trim()}
              className={`px-3 py-3 rounded-md text-sm font-semibold transition ${isTranslating || !sourceText.trim() ? 'bg-gray-200 text-gray-600 cursor-not-allowed' : 'bg-blue-500 text-white hover:bg-blue-600'}`}
            >
              {isTranslating ? 'Translating…' : 'Translate'}
            </button>
          </div>
          {!sourceText ? (
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              className="flex-1 w-full border-2 border-dashed border-gray-400 rounded-md p-8 flex flex-col items-center justify-center bg-gray-50 hover:bg-gray-100 transition cursor-pointer"
              onClick={() => document.getElementById('fileInput')?.click()}
            >
              <svg className="mx-auto h-12 w-12 text-black mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              <p className="text-lg text-black mb-2">Drop a text file here</p>
              <p className="text-xs text-black">or click to browse</p>
              <input
                id="fileInput"
                type="file"
                accept=".txt,.srt,.md"
                onChange={handleFileSelect}
                className="hidden"
              />
            </div>
          ) : (
            <textarea
              className="flex-1 w-full border border-gray-300 rounded-md p-3 resize-none focus:outline-none focus:ring-2 focus:ring-blue-300 text-black"
              placeholder={directionPlaceholder[direction]}
              value={sourceText}
              onChange={(e) => setSourceText(e.target.value)}
            />
          )}
        </div>
        <div className="flex flex-col h-full mt-0 md:mt-0">
          <div className="flex justify-between items-center mb-2">
            <h2 className="font-semibold text-black">Translation</h2>
            <button
              onClick={handleCopy}
              disabled={!translatedText}
              className={`text-sm font-semibold px-3 py-2 rounded-md border ${translatedText ? 'border-gray-300 hover:bg-gray-100 text-black' : 'border-gray-200 text-gray-600 cursor-not-allowed bg-gray-50'}`}
            >
              Copy
            </button>
          </div>
          <textarea
            className="flex-1 w-full border border-gray-300 rounded-md p-3 resize-none bg-gray-50 focus:outline-none text-black"
            placeholder="Translation output will appear here."
            value={translatedText}
            readOnly
          />
        </div>
      </div>

      <div className="border-t border-gray-200 p-4 bg-gray-50">
        <button
          onClick={handleOpenDestination}
          className="w-full py-3 bg-gray-300 text-black font-semibold rounded-md hover:bg-gray-400 transition"
        >
          {destinationPath ? `Save to ${destinationPath}` : 'Browse & Save'}
        </button>
        <p className="text-xs text-gray-700 text-center mt-2">
          Formatting, numbering, and blank lines are preserved exactly as provided.
        </p>
      </div>
    </div>
  );
}
