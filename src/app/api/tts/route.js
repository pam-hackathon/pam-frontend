import { createClient } from "@deepgram/sdk";

// Create a Deepgram client with your API key
const deepgram = createClient(process.env.DEEPGRAM_API_KEY);

export async function POST(req, res) {
  const { text } = req.body;
  console.log('Text:', text);
  try {
    const response = await deepgram.speak.request(
      { text },
      {
        model: 'aura-asteria-en',
        encoding: 'linear16',
        container: 'wav',
      }
    );

    const stream = await response.getStream();
    const audioBuffer = await getAudioBuffer(stream);
    const audioBlob = new Blob([audioBuffer], { type: 'audio/wav' });

    res.setHeader('Content-Type', 'audio/wav');
    return new NextResponse(audioBlob);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ message: 'Error generating speech' });
  }
}

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