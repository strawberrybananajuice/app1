using System.Diagnostics;
using System.Runtime.InteropServices;

class Program
{
    // Change this to your desired quality: 360, 480, 720, 1080, 1440, 2160 (4K)
    private const int VIDEO_QUALITY = 1080;

    // Enable subtitle download (true = download subtitles, false = skip)
    private const bool DOWNLOAD_SUBTITLES = true;

    static async Task Main(string[] args)
    {
        try
        {
            // Check if yt-dlp is installed
            if (!await IsYtDlpInstalledAsync())
            {
                Console.WriteLine("yt-dlp is not installed.");
                Console.WriteLine("\nTo install yt-dlp:");

                if (RuntimeInformation.IsOSPlatform(OSPlatform.OSX))
                {
                    Console.WriteLine("  brew install yt-dlp");
                }
                else if (RuntimeInformation.IsOSPlatform(OSPlatform.Linux))
                {
                    Console.WriteLine("  sudo apt install yt-dlp  (Debian/Ubuntu)");
                    Console.WriteLine("  or download from: https://github.com/yt-dlp/yt-dlp/releases");
                }
                else if (RuntimeInformation.IsOSPlatform(OSPlatform.Windows))
                {
                    Console.WriteLine("  winget install yt-dlp");
                    Console.WriteLine("  or download from: https://github.com/yt-dlp/yt-dlp/releases");
                }

                Console.WriteLine("\nAttempting to install yt-dlp via pip...");
                await InstallYtDlpAsync();
            }

            // Get video URL from user or use default test URL
            string videoUrl;
            if (args.Length > 0)
            {
                videoUrl = args[0];
            }
            else
            {
                Console.Write("Enter YouTube URL: ");
                videoUrl = Console.ReadLine() ?? string.Empty;
            }

            if (string.IsNullOrWhiteSpace(videoUrl))
            {
                Console.WriteLine("Error: No URL provided.");
                return;
            }

            Console.WriteLine($"\nProcessing: {videoUrl}");

            // Get video info first
            await GetVideoInfoAsync(videoUrl);

            // Check subtitle availability
            if (DOWNLOAD_SUBTITLES)
            {
                await CheckSubtitleAvailabilityAsync(videoUrl);
            }

            // List available formats for debugging
            await ListAvailableFormatsAsync(videoUrl);

            // Download the video
            await DownloadVideoAsync(videoUrl);
        }
        catch (Exception ex)
        {
            Console.WriteLine($"\n✗ Error: {ex.Message}");
        }
    }

    static async Task<bool> IsYtDlpInstalledAsync()
    {
        try
        {
            var process = new Process
            {
                StartInfo = new ProcessStartInfo
                {
                    FileName = "yt-dlp",
                    Arguments = "--version",
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                    UseShellExecute = false,
                    CreateNoWindow = true
                }
            };

            process.Start();
            await process.WaitForExitAsync();
            return process.ExitCode == 0;
        }
        catch
        {
            return false;
        }
    }

    static async Task InstallYtDlpAsync()
    {
        try
        {
            var process = new Process
            {
                StartInfo = new ProcessStartInfo
                {
                    FileName = "pip3",
                    Arguments = "install yt-dlp",
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                    UseShellExecute = false,
                    CreateNoWindow = false
                }
            };

            process.OutputDataReceived += (sender, e) =>
            {
                if (!string.IsNullOrEmpty(e.Data))
                    Console.WriteLine(e.Data);
            };

            process.ErrorDataReceived += (sender, e) =>
            {
                if (!string.IsNullOrEmpty(e.Data))
                    Console.WriteLine(e.Data);
            };

            process.Start();
            process.BeginOutputReadLine();
            process.BeginErrorReadLine();
            await process.WaitForExitAsync();

            if (process.ExitCode == 0)
            {
                Console.WriteLine("\n✓ yt-dlp installed successfully!");
            }
            else
            {
                Console.WriteLine("\n✗ Failed to install yt-dlp. Please install it manually.");
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Installation failed: {ex.Message}");
            Console.WriteLine("Please install yt-dlp manually.");
        }
    }

    static async Task GetVideoInfoAsync(string videoUrl)
    {
        try
        {
            var process = new Process
            {
                StartInfo = new ProcessStartInfo
                {
                    FileName = "yt-dlp",
                    Arguments = $"--get-title --get-duration --get-filename " +
                                $"--extractor-args \"youtube:player_client=ios,web\" " +
                                $"{videoUrl}",
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                    UseShellExecute = false,
                    CreateNoWindow = true
                }
            };

            process.Start();
            var output = await process.StandardOutput.ReadToEndAsync();
            await process.WaitForExitAsync();

            if (process.ExitCode == 0)
            {
                var lines = output.Split('\n', StringSplitOptions.RemoveEmptyEntries);
                if (lines.Length >= 2)
                {
                    Console.WriteLine($"\nTitle: {lines[0]}");
                    Console.WriteLine($"Duration: {lines[1]}");
                    if (lines.Length >= 3)
                    {
                        Console.WriteLine($"Output file: {lines[2]}");
                    }
                }
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Could not get video info: {ex.Message}");
        }
    }

    static async Task CheckSubtitleAvailabilityAsync(string videoUrl)
    {
        try
        {
            Console.WriteLine("\n📝 Checking subtitle availability...");

            var process = new Process
            {
                StartInfo = new ProcessStartInfo
                {
                    FileName = "yt-dlp",
                    Arguments = $"--list-subs --extractor-args \"youtube:player_client=ios,web\" {videoUrl}",
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                    UseShellExecute = false,
                    CreateNoWindow = true
                }
            };

            process.Start();
            var output = await process.StandardOutput.ReadToEndAsync();
            await process.WaitForExitAsync();

            if (process.ExitCode == 0)
            {
                var lines = output.Split('\n', StringSplitOptions.RemoveEmptyEntries);
                bool hasManualSubs = false;
                bool hasAutoSubs = false;

                foreach (var line in lines)
                {
                    if (line.Contains("has no subtitles"))
                    {
                        Console.WriteLine("   ⚠️  No manual subtitles available");
                        hasManualSubs = false;
                    }
                    else if (line.Contains("Available subtitles"))
                    {
                        hasManualSubs = true;
                        Console.WriteLine("   ✓ Manual subtitles available");
                    }
                    else if (line.Contains("Available automatic captions"))
                    {
                        hasAutoSubs = true;
                        Console.WriteLine("   ℹ️  Auto-generated captions available");
                    }

                    // Show English subtitle lines
                    if (line.Trim().StartsWith("en"))
                    {
                        Console.WriteLine($"      {line.Trim()}");
                    }
                }

                if (!hasManualSubs && !hasAutoSubs)
                {
                    Console.WriteLine("   ⚠️  No subtitles or captions available for this video");
                }
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Could not check subtitle availability: {ex.Message}");
        }
    }

    static async Task ListAvailableFormatsAsync(string videoUrl)
    {
        try
        {
            Console.WriteLine("\n📋 Checking available formats...");

            var process = new Process
            {
                StartInfo = new ProcessStartInfo
                {
                    FileName = "yt-dlp",
                    Arguments = $"--list-formats " +
                                $"--extractor-args \"youtube:player_client=ios,web\" " +
                                $"{videoUrl}",
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                    UseShellExecute = false,
                    CreateNoWindow = true
                }
            };

            process.Start();
            var output = await process.StandardOutput.ReadToEndAsync();
            await process.WaitForExitAsync();

            if (process.ExitCode == 0)
            {
                // Show only relevant quality lines
                var lines = output.Split('\n', StringSplitOptions.RemoveEmptyEntries);
                bool showFormats = false;

                foreach (var line in lines)
                {
                    if (line.Contains("format code") || line.Contains("ID"))
                    {
                        showFormats = true;
                        Console.WriteLine(line);
                        continue;
                    }

                    if (showFormats && (line.Contains("mp4") || line.Contains("webm")) &&
                        (line.Contains("1080") || line.Contains("720") || line.Contains("480")))
                    {
                        Console.WriteLine(line);
                    }
                }
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Could not list formats: {ex.Message}");
        }
    }

    static async Task DownloadVideoAsync(string videoUrl)
    {
        try
        {
            Console.WriteLine($"\n📥 Starting download in {VIDEO_QUALITY}p quality...");
            if (DOWNLOAD_SUBTITLES)
            {
                Console.WriteLine("📝 Subtitles enabled: English (or auto-generated if not available)");
            }

            // Improved format selector that actually gets high quality
            // bestvideo[height<=1080] gets best video up to 1080p
            // bestaudio gets best audio
            // /best fallback gets best single file format if merging fails
            var formatSelector = $"bestvideo[height<={VIDEO_QUALITY}]+bestaudio/best[height<={VIDEO_QUALITY}]";
            Console.WriteLine($"🎯 Format preference: {formatSelector}");

            // Build subtitle arguments
            // If subtitle download fails, continue with video download
            // --sub-langs "en-orig,en" will download en-orig first, then en as fallback
            var subtitleArgs = DOWNLOAD_SUBTITLES
                ? "--write-subs --write-auto-subs --sub-langs \"en-orig,en\" --convert-subs srt --no-warnings "
                : "";

            var process = new Process
            {
                StartInfo = new ProcessStartInfo
                {
                    FileName = "yt-dlp",
                    // Using default client for best quality
                    // --ignore-errors: Continue if subtitle download fails (won't stop video download)
                    Arguments = $"-f \"{formatSelector}\" " +
                                $"--merge-output-format mp4 " +
                                $"--no-warnings " +
                                $"--ignore-errors " +
                                $"{subtitleArgs}" +
                                $"{videoUrl}",
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                    UseShellExecute = false,
                    CreateNoWindow = false
                }
            };

            process.OutputDataReceived += (sender, e) =>
            {
                if (!string.IsNullOrEmpty(e.Data))
                    Console.WriteLine(e.Data);
            };

            process.ErrorDataReceived += (sender, e) =>
            {
                if (!string.IsNullOrEmpty(e.Data))
                    Console.WriteLine(e.Data);
            };

            process.Start();
            process.BeginOutputReadLine();
            process.BeginErrorReadLine();
            await process.WaitForExitAsync();

            if (process.ExitCode == 0)
            {
                Console.WriteLine("\n✓ Download completed successfully!");
                Console.WriteLine($"File saved to: {Directory.GetCurrentDirectory()}");

                // Clean up auto-generated subtitles if they were downloaded
                if (DOWNLOAD_SUBTITLES)
                {
                    await RemoveDuplicateSubtitlesAsync(Directory.GetCurrentDirectory());
                    await CleanAutoGeneratedSubtitlesAsync(Directory.GetCurrentDirectory());
                }
            }
            else
            {
                Console.WriteLine($"\n✗ Download failed with exit code: {process.ExitCode}");
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Download error: {ex.Message}");
        }
    }

    static Task RemoveDuplicateSubtitlesAsync(string directory)
    {
        try
        {
            var srtFiles = Directory.GetFiles(directory, "*.srt");

            // Group subtitle files by video ID (everything before the language code)
            var videoGroups = srtFiles
                .Select(f => new
                {
                    Path = f,
                    FileName = Path.GetFileName(f),
                    // Extract base name without language extension
                    BaseName = Path.GetFileName(f).Replace(".en-orig.srt", "")
                                                   .Replace(".en-en.srt", "")
                                                   .Replace(".en.srt", "")
                })
                .GroupBy(f => f.BaseName);

            foreach (var group in videoGroups)
            {
                var files = group.ToList();
                if (files.Count <= 1) continue; // Only one subtitle, skip

                var enOrigFile = files.FirstOrDefault(f => f.FileName.EndsWith(".en-orig.srt"));
                var enFile = files.FirstOrDefault(f => f.FileName.EndsWith(".en.srt") && !f.FileName.EndsWith(".en-en.srt"));
                var enEnFile = files.FirstOrDefault(f => f.FileName.EndsWith(".en-en.srt"));

                // Always delete en-en.srt
                if (enEnFile != null && File.Exists(enEnFile.Path))
                {
                    File.Delete(enEnFile.Path);
                    Console.WriteLine($"🗑️  Deleted: {enEnFile.FileName}");
                }

                // If en-orig exists, delete en.srt
                if (enOrigFile != null && enFile != null && File.Exists(enFile.Path))
                {
                    File.Delete(enFile.Path);
                    Console.WriteLine($"🗑️  Deleted: {enFile.FileName} (keeping en-orig)");
                }
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Error removing duplicate subtitles: {ex.Message}");
        }

        return Task.CompletedTask;
    }

    static async Task CleanAutoGeneratedSubtitlesAsync(string directory)
    {
        try
        {
            var srtFiles = Directory.GetFiles(directory, "*.srt");

            foreach (var srtFile in srtFiles)
            {
                Console.WriteLine($"\n🧹 Cleaning subtitle file: {Path.GetFileName(srtFile)}");
                await CleanSrtFileAsync(srtFile);
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Error cleaning subtitles: {ex.Message}");
        }
    }

    static async Task CleanSrtFileAsync(string filePath)
    {
        try
        {
            var lines = await File.ReadAllLinesAsync(filePath);
            var cleanedLines = new List<string>();

            string? currentTimestamp = null;
            var currentTextLines = new List<string>();
            int subtitleIndex = 1;
            string? previousText = null; // Track previous subtitle text to remove duplicates

            for (int i = 0; i < lines.Length; i++)
            {
                var line = lines[i];

                // Check if this is a timestamp line
                if (line.Contains("-->"))
                {
                    // If we have a previous subtitle, process it
                    if (currentTimestamp != null && currentTextLines.Count > 0)
                    {
                        // Get the last non-empty line as the actual subtitle text
                        var lastLine = currentTextLines.LastOrDefault(l => !string.IsNullOrWhiteSpace(l));

                        if (!string.IsNullOrWhiteSpace(lastLine))
                        {
                            var trimmedText = lastLine.Trim();

                            // Only add if it's different from the previous subtitle text
                            if (trimmedText != previousText)
                            {
                                cleanedLines.Add(subtitleIndex.ToString());
                                cleanedLines.Add(currentTimestamp);
                                cleanedLines.Add(trimmedText);
                                cleanedLines.Add(""); // Empty line separator
                                subtitleIndex++;
                                previousText = trimmedText;
                            }
                        }
                    }

                    // Start new subtitle
                    currentTimestamp = line;
                    currentTextLines.Clear();
                }
                else if (!string.IsNullOrWhiteSpace(line) && !int.TryParse(line, out _))
                {
                    // This is text content (not an index number)
                    currentTextLines.Add(line);
                }
            }

            // Don't forget the last subtitle
            if (currentTimestamp != null && currentTextLines.Count > 0)
            {
                var lastLine = currentTextLines.LastOrDefault(l => !string.IsNullOrWhiteSpace(l));
                if (!string.IsNullOrWhiteSpace(lastLine))
                {
                    var trimmedText = lastLine.Trim();
                    if (trimmedText != previousText)
                    {
                        cleanedLines.Add(subtitleIndex.ToString());
                        cleanedLines.Add(currentTimestamp);
                        cleanedLines.Add(trimmedText);
                        cleanedLines.Add("");
                        subtitleIndex++;
                    }
                }
            }

            // Write cleaned content back
            await File.WriteAllLinesAsync(filePath, cleanedLines);
            Console.WriteLine($"   ✓ Cleaned {subtitleIndex - 1} subtitle entries");
        }
        catch (Exception ex)
        {
            Console.WriteLine($"   ✗ Error cleaning {Path.GetFileName(filePath)}: {ex.Message}");
        }
    }
}
