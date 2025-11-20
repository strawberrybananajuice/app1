'use client';

import { useState } from 'react';
import SubtitleTab from './components/SubtitleTab';
import YouTubeDownloaderTab from './components/YouTubeDownloaderTab';
import KoreanSubtitleTab from './components/KoreanSubtitleTab';
import TranslatorTab from './components/TranslatorTab';

export default function Home() {
  const [currentTab, setCurrentTab] = useState<'subtitle' | 'youtubedownloader' | 'korean' | 'translator'>('subtitle');
  const [subtitleText, setSubtitleText] = useState<string>('');
  const [koreanSubtitle, setKoreanSubtitle] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);

  const handleSubtitleDownloaded = (text: string) => {
    setSubtitleText(text);
    setCurrentTab('subtitle');
  };

  const handleTranslationComplete = (text: string) => {
    console.log('============ PARENT RECEIVED KOREAN ============');
    console.log(text);
    console.log('================================================');
    setKoreanSubtitle(text);
  };

  return (
    <main className="h-screen flex flex-col bg-gradient-to-br from-gray-50 to-gray-100">
      {/* Top-level tabs */}
      <div className="flex border-b border-gray-300 bg-white">
        <button
          onClick={() => setCurrentTab('youtubedownloader')}
          className={`flex-1 py-3 px-6 font-semibold text-lg transition-colors ${currentTab === 'youtubedownloader'
            ? 'bg-blue-500 text-white'
            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
        >
          YouTube Downloader
        </button>
        <button
          onClick={() => setCurrentTab('subtitle')}
          className={`flex-1 py-3 px-6 font-semibold text-lg transition-colors ${currentTab === 'subtitle'
            ? 'bg-blue-500 text-white'
            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
        >
          Eng Subtitle
        </button>
        <button
          onClick={() => setCurrentTab('korean')}
          className={`flex-1 py-3 px-6 font-semibold text-lg transition-colors ${currentTab === 'korean'
            ? 'bg-blue-500 text-white'
            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
        >
          Korean Subtitle
        </button>
        <button
          onClick={() => setCurrentTab('translator')}
          className={`flex-1 py-3 px-6 font-semibold text-lg transition-colors ${currentTab === 'translator'
            ? 'bg-blue-500 text-white'
            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
        >
          Translator
        </button>
      </div>

      {/* Tab content without padding/margin */}
      <div className="flex-1 overflow-hidden">
        <div className={`${currentTab === 'subtitle' ? '' : 'hidden'} h-full`}>
          <SubtitleTab
            externalText={subtitleText}
            onTranslationComplete={handleTranslationComplete}
            isProcessing={isProcessing}
            setIsProcessing={setIsProcessing}
          />
        </div>
        <div className={`${currentTab === 'youtubedownloader' ? '' : 'hidden'} h-full`}>
          <YouTubeDownloaderTab onSubtitleDownloaded={handleSubtitleDownloaded} />
        </div>
        <div className={`${currentTab === 'korean' ? '' : 'hidden'} h-full`}>
          <KoreanSubtitleTab
            text={koreanSubtitle}
            isProcessing={isProcessing}
            setIsProcessing={setIsProcessing}
          />
        </div>
        <div className={`${currentTab === 'translator' ? '' : 'hidden'} h-full`}>
          <TranslatorTab />
        </div>
      </div>
    </main>
  );
}
