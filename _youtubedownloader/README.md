# YouTube Downloader

A simple C# console application to download YouTube videos using yt-dlp.

## Features

- Download YouTube videos in the best available quality (MP4 format)
- Shows video metadata (title, duration)
- Progress indicator during download
- Handles both command-line arguments and interactive input
- Automatically installs yt-dlp if not found (via pip3)
- Merges video and audio streams into a single MP4 file

## Requirements

- .NET 9.0 SDK or later
- yt-dlp (automatically installed if missing and pip3 is available)

## Installation

The application will attempt to install yt-dlp automatically if it's not found. Alternatively, you can install it manually:

**macOS (with Homebrew):**
```bash
brew install yt-dlp
```

**Using pip:**
```bash
pip3 install yt-dlp
```

## Usage

### Interactive mode (prompts for URL):
```bash
dotnet run
```

### Command-line mode (provide URL as argument):
```bash
dotnet run "https://youtu.be/xOYGQAG3YLI?si=XPb0lEHFwG071FGt"
```

## How it works

1. Checks if yt-dlp is installed, installs it if missing
2. Retrieves video metadata (title, duration)
3. Downloads the best video and audio streams
4. Merges them into a single MP4 file
5. Saves to current directory

## Example Output

```
Processing: https://youtu.be/xOYGQAG3YLI?si=XPb0lEHFwG071FGt

Title: 전지윤(Jeon Ji Yoon) & 구준엽(Koo Jun Yeob) - 난 [불후의명곡 레전드/Immortal Songs Legend] | KBS 110806 방송
Duration: 4:34

📥 Starting download...
[youtube] Extracting URL: https://youtu.be/xOYGQAG3YLI?si=XPb0lEHFwG071FGt
...
[download] 100% of 82.45MiB
[Merger] Merging formats into "video.mp4"

✓ Download completed successfully!
File saved to: /Users/ds/Documents/utilityprograms/youtubedownloader
```

## Technical Details

- Uses yt-dlp as the backend for downloading
- Downloads best video (MP4) + best audio (M4A) and merges them
- Cross-platform compatible (Windows, macOS, Linux)
- No external NuGet packages required
