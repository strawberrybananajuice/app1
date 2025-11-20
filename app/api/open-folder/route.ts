import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import os from 'os';

export async function POST(req: NextRequest) {
    try {
        const { path: folderPath } = await req.json();

        if (!folderPath) {
            return NextResponse.json({ error: 'Path is required' }, { status: 400 });
        }

        let command = '';
        const platform = os.platform();

        if (platform === 'darwin') {
            command = `open "${folderPath}"`;
        } else if (platform === 'win32') {
            command = `explorer "${folderPath}"`;
        } else {
            command = `xdg-open "${folderPath}"`;
        }

        exec(command, (error) => {
            if (error) {
                console.error(`Error opening folder: ${error}`);
            }
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        return NextResponse.json({ error: (error as Error).message }, { status: 500 });
    }
}
