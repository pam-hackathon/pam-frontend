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
    const stream = await groq.chat.completions.create({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: query },
      ],
      model: "llama3-groq-8b-8192-tool-use-preview",
      stream: true,
    });

    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        for await (const chunk of stream) {
          const content = chunk.choices[0]?.delta?.content || '';
          controller.enqueue(encoder.encode(content));
        }
        controller.close();
      },
    });

    return new Response(readable, {
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  } catch (error) {
    console.error('Error generating response:', error);
    return new Response(JSON.stringify({ error: 'Failed to generate response from Groq' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

export async function GET() {
  return new Response(JSON.stringify({ error: 'Method not allowed' }), {
    status: 405,
    headers: { 'Content-Type': 'application/json' },
  });
}