'use client';

import SubtitleTab from './SubtitleTab';

interface KoreanSubtitleTabProps {
    text: string;
    isProcessing?: boolean;
    setIsProcessing?: (value: boolean) => void;
}

export default function KoreanSubtitleTab({ text, isProcessing, setIsProcessing }: KoreanSubtitleTabProps) {
    return <SubtitleTab externalText={text} onTranslationComplete={() => { }} isProcessing={isProcessing} setIsProcessing={setIsProcessing} storageKey="koreanSubtitleState" />;
}
