import { NextResponse } from 'next/server';
import Groq from "groq-sdk";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const systemPrompt = `You are an AI assistant for a car dealership. Provide clear, friendly, and accurate responses about car sales, services, and 
  appointments. Wait for the caller to finish speaking, even if they pause. Prioritize speed in generating responses.

  Key points:
  1. Respond quickly, focusing on the caller's needs.
  2. Address questions on models, prices, financing, and appointments.
  3. Ensure responses are brief, informative, and easy to understand aloud.

  Example:
  - If asked about financing options for a sedan, respond with: "We offer various financing options, including low-interest loans and leases. Would you 
  like more details on a specific model?"
`;

export async function POST(req) {
  const { transcription, context } = await req.json();
  const query = `Context: ${context} \n\n${transcription}`;

  try {
    const response = await groq.chat.completions.create({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: query },
      ],
      model: "llama3-groq-8b-8192-tool-use-preview",
    });

    const generatedResponse = response.choices[0].message.content;
    console.log(generatedResponse);
    return NextResponse.json({ response: generatedResponse });
  } catch (error) {
    console.error('Error generating response:', error);
    return NextResponse.json({ error: 'Failed to generate response from OpenAI' }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
}