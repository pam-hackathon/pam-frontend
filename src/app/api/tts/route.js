const { createClient } = require("@deepgram/sdk");
const { NextResponse } = require('next/server');

// STEP 1: Create a Deepgram client with your API key
const deepgram = createClient(process.env.DEEPGRAM_API_KEY);

const getAudio = async (text) => {
  // STEP 2: Make a request and configure the request with options (such as model choice, audio configuration, etc.)
  const response = await deepgram.speak.request(
    { text },
    {
      model: "aura-asteria-en",
      encoding: "linear16",
      container: "wav",
    }
  );
  // STEP 3: Get the audio stream and headers from the response
  const stream = await response.getStream();
  if (stream) {
    // STEP 4: Convert the stream to an audio buffer
    const buffer = await getAudioBuffer(stream);
    return buffer;
  } else {
    console.error("Error generating audio:", stream);
    throw new Error("Error generating audio");
  }
};

// Helper function to convert stream to audio buffer
const getAudioBuffer = async (response) => {
  const reader = response.getReader();
  const chunks = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    chunks.push(value);
  }

  const dataArray = chunks.reduce(
    (acc, chunk) => Uint8Array.from([...acc, ...chunk]),
    new Uint8Array(0)
  );

  return Buffer.from(dataArray.buffer);
};

// POST function to handle requests
export async function POST(req) {
  try {
    const { text } = await req.json();

    const audioBuffer = await getAudio(text);

    const response = new NextResponse(audioBuffer, {
      headers: {
        'Content-Type': 'audio/wav',
        'Content-Disposition': 'attachment; filename="output.wav"',
      },
    });

    return response;
  } catch (error) {
    console.error('Error generating speech:', error);
    return new NextResponse(JSON.stringify({ message: 'Error generating speech' }), { status: 500 });
  }
}