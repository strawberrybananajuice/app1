import { NextRequest, NextResponse } from 'next/server';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
// User requested gemini-2.5-pro. If this fails, we might need to fallback, but we stick to instructions.
// Note: As of late 2024/early 2025, gemini-1.5-pro is common. 2.5 might be the user's specific access.
const MODEL_NAME = 'gemini-2.5-pro';

export async function POST(request: NextRequest) {
    try {
        const { text } = await request.json();

        if (!text) {
            return NextResponse.json(
                { error: 'No text provided' },
                { status: 400 }
            );
        }

        const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent?key=${GEMINI_API_KEY}`;

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                contents: [{
                    parts: [{
                        text: `Translate the following subtitle text into natural Korean. Keep the meaning and tone. Output ONLY the translated text.\n\n${text}`
                    }]
                }]
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            return NextResponse.json(
                { error: errorData.error?.message || 'Gemini API failed' },
                { status: response.status }
            );
        }

        const data = await response.json();
        const translatedText = data.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!translatedText) {
            return NextResponse.json(
                { error: 'No translation returned' },
                { status: 500 }
            );
        }

        return NextResponse.json({ translatedText });

    } catch (error) {
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Internal server error' },
            { status: 500 }
        );
    }
}
