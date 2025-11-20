import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import os from 'os';

export async function POST() {
    try {
        const platform = os.platform();
        let command = '';

        if (platform === 'darwin') {
            // macOS: Use AppleScript
            command = `osascript -e 'POSIX path of (choose folder)'`;
        } else if (platform === 'win32') {
            // Windows: Use PowerShell (requires interactive session)
            command = `powershell -Command "Add-Type -AssemblyName System.Windows.Forms; $f = New-Object System.Windows.Forms.FolderBrowserDialog; $f.ShowDialog() | Out-Null; $f.SelectedPath"`;
        } else {
            // Linux: Use zenity or kdialog
            command = `zenity --file-selection --directory || kdialog --getexistingdirectory`;
        }

        return new Promise((resolve) => {
            exec(command, (error, stdout, stderr) => {
                if (error) {
                    console.error('Error selecting folder:', error);
                    // User likely cancelled
                    resolve(NextResponse.json({ error: 'Selection cancelled' }, { status: 400 }));
                    return;
                }
                const path = stdout.trim();
                if (path) {
                    resolve(NextResponse.json({ path }));
                } else {
                    resolve(NextResponse.json({ error: 'No folder selected' }, { status: 400 }));
                }
            });
        });
    } catch (error) {
        return NextResponse.json({ error: (error as Error).message }, { status: 500 });
    }
}
