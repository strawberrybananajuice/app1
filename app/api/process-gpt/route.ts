import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

type InputSegment = {
    id: number;
    start?: string;
    end?: string;
    text?: string;
};

export async function POST(request: NextRequest) {
    try {
        const { text, segments = [] } = await request.json();

        if (!text && (!segments || segments.length === 0)) {
            return NextResponse.json(
                { error: 'No text or segments provided' },
                { status: 400 }
            );
        }

        const sanitizedSegments: InputSegment[] = Array.isArray(segments)
            ? segments
                .filter((segment: InputSegment) => segment && typeof segment.id === 'number')
                .map((segment: InputSegment) => ({
                    id: segment.id,
                    start: segment.start,
                    end: segment.end,
                    text: segment.text,
                }))
            : [];

        const segmentPayload = JSON.stringify(sanitizedSegments);
        const plainTextPayload = text || sanitizedSegments.map((segment) => segment.text ?? '').join('\n');

        const systemPrompt = `You receive subtitle segments that include ids and timestamps. Convert them into polished sentences while preserving the mapping to the original segments.

    Rules:
    1. Each JSON object MUST contain exactly one complete sentence. Never place two sentences in the same object.
    2. Combine only the fragments needed to complete that sentence. If multiple sentences appear across the same source segments, split their ids across multiple JSON objects in chronological order.
    3. If a fragment already forms a sentence, keep it as is.
    4. Always provide both English text ("text") and a natural Korean translation ("korean").
    5. Every output must include a "segmentIds" array listing the ids you merged, sorted ascending, with no duplicates.
    6. Do not include timestamps or numbering inside the "text" itself.
    7. Output ONLY a JSON array shaped like [{"index": 1, "text": "english", "korean": "한국어", "segmentIds": [1,2]}, ...].
    8. Maintain chronological order strictly by segment ids, never skipping earlier ids.
    9. Spell out numbers as they sound (e.g., 십일월 2일 instead of 11월 2일 / 일호 instead of 1호).`;

        const userPrompt = `Segments (JSON):\n${segmentPayload}\n\nPlain text reference:\n${plainTextPayload}`;

        const completion = await openai.chat.completions.create({
            model: 'gpt-4.1',
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt }
            ],
        });

        const responseText = completion.choices[0].message.content;

        console.log('============ GPT RAW RESPONSE ============');
        console.log(responseText);
        console.log('==========================================');

        if (!responseText) {
            throw new Error('No response from OpenAI');
        }

        let sentences;
        try {
            const jsonMatch = responseText.match(/\[[\s\S]*\]/);
            if (jsonMatch) {
                sentences = JSON.parse(jsonMatch[0]);
            } else {
                sentences = JSON.parse(responseText);
            }
            console.log('============ PARSED SENTENCES ============');
            console.log(JSON.stringify(sentences, null, 2));
            console.log('==========================================');
        } catch (parseError) {
            console.error('Failed to parse OpenAI response:', responseText);
            console.error(parseError);
            throw new Error('Failed to parse OpenAI response');
        }

        return NextResponse.json({ sentences });
    } catch (error) {
        console.error('Error processing with GPT:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to process text' },
            { status: 500 }
        );
    }
}
