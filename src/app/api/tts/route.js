import { createClient } from "@deepgram/sdk";
import { NextResponse } from 'next/server';

const deepgram = createClient(process.env.DEEPGRAM_API_KEY);

export async function POST(req) {
  try {
    const { text } = await req.json();

    const response = await deepgram.speak.request(
      { text },
      {
        model: "aura-asteria-en",
        encoding: "linear16",
        container: "wav",
      }
    );

    const stream = await response.getStream();
    
    if (!stream) {
      throw new Error("Error generating audio stream");
    }

    return new NextResponse(stream, {
      headers: {
        'Content-Type': 'audio/wav',
        'Transfer-Encoding': 'chunked',
      },
    });
  } catch (error) {
    console.error('Error generating speech:', error);
    return new NextResponse(JSON.stringify({ message: 'Error generating speech' }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}