import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import { writeFile, unlink, readFile } from 'fs/promises';
import path from 'path';
import os from 'os';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 minutes

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

async function getAudioDuration(audioPath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffprobe', [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      audioPath
    ]);
    let out = '';
    proc.stdout.on('data', (d) => (out += d));
    proc.on('close', (code) => {
      if (code === 0) {
        const val = parseFloat(out.trim());
        if (!isNaN(val)) resolve(val);
        else reject(new Error('Could not parse duration'));
      } else {
        reject(new Error('ffprobe failed to get duration'));
      }
    });
  });
}

export async function POST(req: NextRequest) {
  const tempDir = os.tmpdir();
  const now = Date.now();

  // Declare ALL file paths upfront so they're accessible in catch blocks
  const videoPaths: string[] = [];
  const transcodedPaths: string[] = [];
  let audioPath = '';
  let outputPath = '';
  let concatListPath = '';
  let concatOutput = '';

  try {
    const formData = await req.formData();
    const audioFile = formData.get('audio') as File;

    const videoFiles: File[] = [];
    for (let i = 0; ; i++) {
      const file = formData.get(`video${i}`) as File;
      if (!file || !(file instanceof File)) break;
      videoFiles.push(file);
    }

    if (!videoFiles.length || !audioFile) {
      return NextResponse.json({ error: 'Missing audio or video files' }, { status: 400 });
    }

    // Save and transcode videos
    for (let i = 0; i < videoFiles.length; i++) {
      const videoPath = path.join(tempDir, `mux-input-video${i}-${now}.mp4`);
      await writeFile(videoPath, Buffer.from(await videoFiles[i].arrayBuffer()));
      videoPaths.push(videoPath);

      const transPath = path.join(tempDir, `mux-transcoded-video${i}-${now}.mp4`);
      await new Promise<void>((resolve, reject) => {
        const ffmpeg = spawn('ffmpeg', [
          '-i', videoPath,
          '-vf', 'scale=640:360',
          '-r', '30',
          '-c:v', 'libx264',
          '-preset', 'ultrafast',
          '-crf', '23',
          '-pix_fmt', 'yuv420p',
          '-an',
          transPath
        ]);
        ffmpeg.stderr.on('data', () => {});
        ffmpeg.on('close', (code) => (code === 0 ? resolve() : reject(new Error('FFmpeg transcode failed'))));
      });
      transcodedPaths.push(transPath);
    }

    // Save audio
    const audioExt = (audioFile.name.split('.').pop() || 'aac').replace(/[^a-z0-9]/gi, '');
    audioPath = path.join(tempDir, `mux-input-audio-${now}.${audioExt}`);
    await writeFile(audioPath, Buffer.from(await audioFile.arrayBuffer()));
    outputPath = path.join(tempDir, `mux-output-${now}.mp4`);

    const audioDuration = await getAudioDuration(audioPath);

    // Create concat list
    concatListPath = path.join(tempDir, `concat-list-${now}.txt`);
    await writeFile(
      concatListPath,
      transcodedPaths.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join('\n')
    );

    concatOutput = path.join(tempDir, `concat-output-${now}.mp4`);
    await new Promise<void>((resolve, reject) => {
      const ffmpeg = spawn('ffmpeg', [
        '-f', 'concat',
        '-safe', '0',
        '-i', concatListPath,
        '-c', 'copy',
        concatOutput
      ]);
      ffmpeg.stderr.on('data', () => {});
      ffmpeg.on('close', (code) => (code === 0 ? resolve() : reject(new Error('FFmpeg concat failed'))));
    });

    // Final mux with audio
    await new Promise<void>((resolve, reject) => {
      const ffmpeg = spawn('ffmpeg', [
        '-stream_loop', '-1',
        '-i', concatOutput,
        '-i', audioPath,
        '-t', audioDuration.toString(),
        '-c:v', 'libx264',
        '-c:a', 'aac',
        '-pix_fmt', 'yuv420p',
        '-shortest',
        outputPath
      ]);
      ffmpeg.stderr.on('data', () => {});
      ffmpeg.on('close', (code) => (code === 0 ? resolve() : reject(new Error('FFmpeg mux failed'))));
    });

    const videoBuffer = await readFile(outputPath);

    // Cleanup on success
    const cleanupPromises = [
      ...videoPaths.map((p) => unlink(p)),
      ...transcodedPaths.map((p) => unlink(p)),
      unlink(audioPath),
      unlink(outputPath),
      unlink(concatListPath),
      unlink(concatOutput)
    ];
    await Promise.allSettled(cleanupPromises);

    return new NextResponse(videoBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Disposition': 'inline; filename="musicvideo.mp4"',
      },
    });
  } catch (err: unknown) {
    // Cleanup on error — all paths are now in scope
    const cleanupPromises = [
      ...videoPaths.map((p) => unlink(p).catch(() => {})),
      ...transcodedPaths.map((p) => unlink(p).catch(() => {})),
      unlink(audioPath).catch(() => {}),
      unlink(outputPath).catch(() => {}),
      unlink(concatListPath).catch(() => {}),
      unlink(concatOutput).catch(() => {})
    ];
    await Promise.allSettled(cleanupPromises);

    const message = getErrorMessage(err);
    return NextResponse.json({ error: 'Muxing failed: ' + message }, { status: 500 });
  }
}