
# Pam Chat

An AI assistant that transcribes your voice in realtime and responds in sub 1000ms. Hear a response quickly from an intelligent support bot that sounds like a real human. The assistant is ready to help for all your car needs!

## Features

- Live transcriptions of voice audio
- Sub 1000ms responses with groq
- Text to speech synthesis for bot responses
- RAG of responses using past messages

## Tech Stack

 - Frontend: Next.js, TailwindCSS, shadcn
 - Backend: Node.js, Javascript
 - Deployment: Vercel
 - LLM: llama3-groq-8b-8192
 - SST: Deepgram Nova-2
 - TTS: Deepgram Aura


### See our  [Demo](https://pam-voicechat.vercel.app/)


## Challenges

- The greatest initial challenge had been finding a solution for SST and TTS.
    - We thought of using WebSockets and Neural Networks for live streaming voice, but we had neither the time nor the expertise, so we settled with [Deepram](https://deepgram.com/).
- Live transcriptions had been the highest hurdle at the end. 
    - We wanted our transcriptions to be shown in realtime, which we achieved with `Deepgram`'s interim results, but had to continuously checked for any repeated word sequences.



## Future Iterations

- Implement a websocket to enable real time communication between client and server
- A neural network built from scratch using voice datasets OR using libraries like [faster-whisperer](https://github.com/SYSTRAN/faster-whisper)


## Authors

- [@Alex](https://www.linkedin.com/in/alexander-farouz-1433g/)
- [@Harvey](https://www.linkedin.com/in/harvey-tseng/)


