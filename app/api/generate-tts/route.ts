import { NextRequest, NextResponse } from 'next/server';

const SUPERTONE_API_KEY = process.env.SUPERTONE_API_KEY;
const DEFAULT_VOICE_ID = 'c94c72e2d5570b64490a5d';

export async function POST(request: NextRequest) {
    try {
        const { text, index, voiceId, speed } = await request.json();

        const targetVoiceId = voiceId || DEFAULT_VOICE_ID;
        const apiUrl = `https://supertoneapi.com/v1/text-to-speech/${targetVoiceId}`;

        if (!text) {
            return NextResponse.json(
                { error: 'No text provided' },
                { status: 400 }
            );
        }

        // Create request body for Supertone API
        const requestBody = {
            text: text,
            language: 'ko',
            style: 'neutral',
            model: 'sona_speech_1',
            output_format: 'mp3',
            voice_settings: {
                pitch_shift: 0,
                pitch_variance: 1,
                speed: parseFloat(speed) || 1,
                duration: 0,
                similarity: 3,
                text_guidance: 1,
                subharmonic_amplitude_control: 1
            },
            include_phonemes: false
        };

        // Send POST request to Supertone API
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-sup-api-key': SUPERTONE_API_KEY || '',
            },
            body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Supertone API error:', errorText);
            throw new Error(`Supertone API error: ${response.status} - ${errorText}`);
        }

        // Get the audio data
        const audioData = await response.arrayBuffer();

        // Return the audio file
        return new NextResponse(audioData, {
            status: 200,
            headers: {
                'Content-Type': 'audio/mpeg',
                'Content-Disposition': `attachment; filename="${String(index).padStart(3, '0')}.mp3"`,
            },
        });
    } catch (error) {
        console.error('Error generating TTS:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to generate TTS' },
            { status: 500 }
        );
    }
}
