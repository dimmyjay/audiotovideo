// app/api/transcript/route.ts
import { NextRequest, NextResponse } from 'next/server';

const ASSEMBLYAI_API_KEY = process.env.ASSEMBLYAI_API_KEY;

if (!ASSEMBLYAI_API_KEY) {
  console.warn('ASSEMBLYAI_API_KEY is not set. Transcription will fail.');
}

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  if (!ASSEMBLYAI_API_KEY) {
    return NextResponse.json(
      { error: 'Transcription service not configured' },
      { status: 500 }
    );
  }

  try {
    const formData = await req.formData();
    const audioFile = formData.get('audio') as File;

    if (!audioFile || !(audioFile instanceof File)) {
      return NextResponse.json({ error: 'No audio file provided' }, { status: 400 });
    }

    const audioBuffer = Buffer.from(await audioFile.arrayBuffer());

    // Step 1: Upload audio to AssemblyAI (NO TRAILING SPACES!)
    const uploadRes = await fetch('https://api.assemblyai.com/v2/upload', {
      method: 'POST',
      headers: {
        Authorization: ASSEMBLYAI_API_KEY,
        'Content-Type': 'application/octet-stream',
      },
      body: audioBuffer,
    });

    if (!uploadRes.ok) {
      const text = await uploadRes.text();
      console.error('AssemblyAI upload error:', text);
      return NextResponse.json({ error: 'Audio upload failed' }, { status: 500 });
    }

    const { upload_url } = await uploadRes.json();

    // Step 2: Request transcription (NO TRAILING SPACES!)
    const transcriptRes = await fetch('https://api.assemblyai.com/v2/transcript', {
      method: 'POST',
      headers: {
        Authorization: ASSEMBLYAI_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        audio_url: upload_url,
        language_code: 'en',
        format_text: true,
        speaker_labels: false,
      }),
    });

    if (!transcriptRes.ok) {
      const text = await transcriptRes.text();
      console.error('AssemblyAI transcript error:', text);
      return NextResponse.json({ error: 'Transcription request failed' }, { status: 500 });
    }

    const { id: transcriptId } = await transcriptRes.json();

    // Step 3: Poll until complete (NO SPACES IN URL!)
    let transcriptData;
    let attempts = 0;
    while (attempts < 60) {
      const pollRes = await fetch(`https://api.assemblyai.com/v2/transcript/${transcriptId}`, {
        headers: { Authorization: ASSEMBLYAI_API_KEY },
      });

      transcriptData = await pollRes.json();

      if (transcriptData.status === 'completed') {
        break;
      } else if (transcriptData.status === 'error') {
        throw new Error(transcriptData.error || 'Transcription failed');
      }

      attempts++;
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    if (transcriptData.status !== 'completed') {
      return NextResponse.json({ error: 'Transcription timed out' }, { status: 500 });
    }

    // Step 4: Fetch VTT (NO SPACES!)
    const vttRes = await fetch(`https://api.assemblyai.com/v2/transcript/${transcriptId}/vtt`, {
      headers: { Authorization: ASSEMBLYAI_API_KEY },
    });

    const vttText = await vttRes.text();

    return new NextResponse(vttText, {
      status: 200,
      headers: { 'Content-Type': 'text/vtt' },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Transcription error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
