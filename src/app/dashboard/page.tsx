"use client";
import { Bot, LifeBuoy, Mic, SquareUser, User, Disc } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  TooltipProvider,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useRef, useState, useEffect } from "react";

interface Message {
  type: "user" | "bot";
  content: string;
}

export default function Dashboard() {
  const [isRecording, setIsRecording] = useState(false);
  const [isBotSpeaking, setIsBotSpeaking] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      type: "bot",
      content: "Hello, please click the microphone to begin recording",
    },
  ]);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const startMic = async () => {
    try {
      // Request access to user's mic
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);

      const tokenResponse = await fetch("/api/websocket");
      const { token } = await tokenResponse.json(); // Fetch token for connecting to WebSocket
      const socket = new WebSocket( // Create WebSocket connection to Deepgram
        "wss://api.deepgram.com/v1/listen?model=nova-2-conversationalai&smart_format=true&no_delay=true&interim_results=true&endpointing=250",
        ["token", token]
      );

      let lastMessageTime = 0;
      let interimBuffer = "";
      let runningTranscription = ""; // Buffer to keep track of the current transcription
      let botResponseTimer: NodeJS.Timeout | undefined; // Timer to keep track of the bot response
      const TIME_THRESHOLD = 8000; // 8 seconds

      socket.onopen = () => {
        console.log({ event: "onopen" });
        // Start sending recorded audio to WebSocket
        mediaRecorder.addEventListener("dataavailable", (event) => {
          if (event.data.size > 0 && socket.readyState === 1) {
            socket.send(event.data);
          }
        });
        mediaRecorder.start(250); // Record in chunks of 250ms
      };

      socket.onmessage = async (message) => {
        if (isBotSpeaking) {
          return; // Do not process new transcriptions while the bot is speaking
        }

        const received = JSON.parse(message.data);
        if (
          !received.channel ||
          !received.channel.alternatives ||
          received.channel.alternatives.length === 0
        ) {
          console.error("No alternatives available in the received message");
          return;
        }

        const transcript = received.channel.alternatives[0].transcript;

        if (transcript.trim() === "") {
          return;
        }

        const currentTime = Date.now();

        setMessages((prevMessages) => {
          const newMessages = [...prevMessages];
          const lastMessage = newMessages[newMessages.length - 1];

          if (
            lastMessage &&
            lastMessage.type === "user" &&
            currentTime - lastMessageTime < TIME_THRESHOLD &&
            received.is_final === false
          ) {
            // Set the interim buffer
            interimBuffer = transcript;
            // Update the last user message with the interim transcript
            newMessages[newMessages.length - 1] = {
              ...lastMessage,
              content: (lastMessage.content + " " + interimBuffer).trim(),
            };
          } else {
            // Check if the last message was from a bot
            if (lastMessage && lastMessage.type === "bot") {
              // Create a new message if it's a new utterance or the first message
              newMessages.push({ type: "user", content: transcript });
              interimBuffer = transcript; // Reset the interim buffer
              runningTranscription = transcript; // Update the running transcription
            } else {
              // Append the interim buffer to the last user message
              interimBuffer = transcript;
              newMessages[newMessages.length - 1] = {
                ...lastMessage,
                content: (lastMessage.content + " " + interimBuffer).trim(),
              };
            }
          }

          if (received.is_final === true || received.speech_final === true) {
            // Check if the new transcript is an extension of the last part of the running transcription
            const lastWords = runningTranscription
              .split(" ")
              .slice(-transcript.split(" ").length)
              .join(" ");
            if (lastWords === transcript) {
              // If the last part matches the new transcript, do not append it again
              runningTranscription = runningTranscription.trim();
            } else {
              // Find the longest suffix of `runningTranscription` that matches a prefix of `transcript`
              let overlapIndex = -1;
              for (let i = 1; i <= transcript.length; i++) {
                if (runningTranscription.endsWith(transcript.substring(0, i))) {
                  overlapIndex = i;
                }
              }
              // Append the non-overlapping part of the transcript
              runningTranscription +=
                " " + transcript.substring(overlapIndex).trim();
            }

            newMessages[newMessages.length - 1] = {
              ...newMessages[newMessages.length - 1],
              content: runningTranscription.trim(),
            };
            interimBuffer = ""; // Reset the interim buffer
            if (received.speech_final === true || received.type === "UtteranceEnd") {
              console.log("Generating bot response...");
              if (botResponseTimer) {
                clearTimeout(botResponseTimer);
              }

              botResponseTimer = setTimeout(() => {
                generateBotResponse(runningTranscription, newMessages);
              }, 500);
            }
          }

          if (currentTime - lastMessageTime >= TIME_THRESHOLD) {
            interimBuffer = ""; // Reset the interim buffer if time threshold is exceeded
          }

          lastMessageTime = currentTime;

          return newMessages;
        });
      };

      socket.onclose = () => {
        console.log({ event: "onclose" });
      };

      socket.onerror = (error) => {
        console.log({ event: "onerror", error });
        const closeMessage = JSON.stringify({ type: "CloseStream" });
        socket.send(closeMessage);
      };

      // Store references to mediaRecorder and socket
      mediaRecorderRef.current = mediaRecorder;
      socketRef.current = socket;
      setIsRecording(true);
    } catch (error) {
      console.error("Error accessing microphone", error);
    }
  };

  const stopMic = () => {
    if (socketRef.current) {
      const finalizeMsg = JSON.stringify({ type: "Finalize" });
      socketRef.current.send(finalizeMsg);
    }
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream
        .getTracks()
        .forEach((track) => track.stop());
      mediaRecorderRef.current = null;
    }
    setIsRecording(false);
    setMessages([
      {
        type: "bot",
        content: "Recording stopped. Click the microphone to start again",
      },
    ]);
  };

  const handleMicClick = async () => {
    if (isRecording) {
      stopMic();
    } else {
      await startMic();
    }
  };

  const generateBotResponse = async (
    userMessage: string,
    messages: Message[]
  ) => {
    try {
      console.log("Generating bot response for:", userMessage);
      const backendResponse = await fetch("/api/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          transcription: userMessage,
          context: messages
            .map(
              (message) =>
                (message.type === "bot" ? "BOT: " : "USER: ") +
                message.content +
                "\n"
            )
            .join(" "),
        }),
      });

      if (!backendResponse.ok) {
        throw new Error(
          `Failed to fetch response from backend: ${backendResponse.status} ${backendResponse.statusText}`
        );
      }

      const reader = backendResponse.body!.getReader();
      const decoder = new TextDecoder();
      let fullResponse = "";
      let currentSentence = "";
      const audioQueue: string[] = [];
      const audioBlobsQueue: Blob[] = [];
      let isFirstBlobPlayed = false;

      // Start with an empty message for the bot response
      setMessages((prev) => [...prev, { type: "bot", content: "" }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const partialResponse = decoder.decode(value);
        fullResponse += partialResponse;
        currentSentence += partialResponse;

        // Update the UI with the current full response so far
        setMessages((prev) => {
          const newMessages = [...prev];
          newMessages[newMessages.length - 1] = {
            type: "bot",
            content: fullResponse,
          };
          return newMessages;
        });

        // Check for complete sentences
        const sentences = currentSentence.match(/[^.!?]+[.!?]+/g);
        if (sentences) {
          for (const sentence of sentences) {
            const trimmedSentence = sentence.trim();
            currentSentence = currentSentence.slice(sentence.length);
            audioQueue.push(trimmedSentence);

            // Generate and play the first blob immediately
            if (!isFirstBlobPlayed) {
              isFirstBlobPlayed = true;
              const firstBlob = await generateAudioBlob(trimmedSentence);
              if (firstBlob) {
                await playAudioBlobsSequentially([firstBlob], audioBlobsQueue);
              }
            }
          }
        }
      }

      // Handle any remaining sentence
      if (currentSentence.trim()) {
        audioQueue.push(currentSentence.trim());
      }

      // Pre-fetch remaining audio blobs in the background
      for (let i = 1; i < audioQueue.length; i++) {
        const blob = await generateAudioBlob(audioQueue[i]);
        if (blob) {
          audioBlobsQueue.push(blob);
        }
      }

      // Play the remaining pre-fetched audio blobs sequentially
      if (audioBlobsQueue.length > 0) {
        await playAudioBlobsSequentially(audioBlobsQueue, []);
      }

      console.log("Full bot response:", fullResponse);
    } catch (error) {
      console.error("Error generating bot response:", error);
    }
  };

  const generateAudioBlob = async (text: string): Promise<Blob | null> => {
    try {
      console.log("Generating TTS for:", text);
      const audioResponse = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });

      if (!audioResponse.ok) {
        throw new Error(
          `Failed to generate TTS: ${audioResponse.status} ${audioResponse.statusText}`
        );
      }

      return await audioResponse.blob();
    } catch (error) {
      console.error("Error generating audio blob:", error);
      return null;
    }
  };

  const playAudioBlobsSequentially = async (
    initialBlobs: Blob[],
    additionalBlobsQueue: Blob[]
  ) => {
    setIsBotSpeaking(true);
    // Play initial blobs
    for (const blob of initialBlobs) {
      const audioUrl = URL.createObjectURL(blob);
      const audio = new Audio(audioUrl);

      await new Promise<void>((resolve) => {
        audio.onended = () => {
          URL.revokeObjectURL(audioUrl);
          resolve();
        };
        audio.play();
      });
    }

    // Play any additional blobs queued during initial playback
    while (additionalBlobsQueue.length > 0) {
      const blob = additionalBlobsQueue.shift()!;
      const audioUrl = URL.createObjectURL(blob);
      const audio = new Audio(audioUrl);

      await new Promise<void>((resolve) => {
        audio.onended = () => {
          URL.revokeObjectURL(audioUrl);
          resolve();
        };
        audio.play();
      });
    }
    setIsBotSpeaking(false);
  };

  return (
    <div className="grid h-screen w-full">
      {audioUrl && <audio src={audioUrl} autoPlay />}
      <div className="flex flex-col">
        <header className="sticky top-0 z-10 flex h-[57px] justify-between items-center gap-1 border-b bg-background px-8">
          <h1 className="text-xl font-semibold">Pam Playground</h1>
          <nav className="flex gap-1">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="mt-auto rounded-lg"
                    aria-label="Help"
                  >
                    <LifeBuoy className="size-5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right" sideOffset={5}>
                  Help
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="mt-auto rounded-lg"
                    aria-label="Account"
                  >
                    <SquareUser className="size-5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right" sideOffset={5}>
                  Account
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </nav>
        </header>
        <main className="flex-1 gap-4 overflow-auto p-8">
          <div className="relative flex h-full min-h-[50vh] flex-col rounded-xl bg-muted/50 p-4 lg:col-span-2">
            <Badge variant="outline" className="absolute right-3 top-3">
              Transcriptions
            </Badge>
            <div className="flex-1">
              {messages.map((message, index) => (
                <div
                  key={index}
                  className={`flex ${
                    message.type === "user" ? "justify-end" : "justify-start"
                  } mb-4`} // Added margin-bottom for spacing
                >
                  <div
                    className={`max-w-[70%] p-3 rounded-lg ${
                      message.type === "user"
                        ? "bg-blue-500 text-white"
                        : "bg-gray-200"
                    }`}
                  >
                    <div className="flex items-center mb-1">
                      {message.type === "user" ? (
                        <User className="w-4 h-4 mr-2" />
                      ) : (
                        <Bot className="w-4 h-4 mr-2" />
                      )}
                      <span className="font-semibold">
                        {message.type === "user" ? "You" : "Support Bot"}
                      </span>
                    </div>
                    <p>{message.content}</p>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
            <div className="flex gap-2 items-center justify-center mb-8">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="animate-pulse border-2 border-gray-300 rounded-full p-2 size-16"
                      onClick={handleMicClick}
                    >
                      {isRecording ? (
                        <Disc className="size-16" />
                      ) : (
                        <Mic className="size-16" />
                      )}
                      <span className="sr-only">
                        {isRecording ? "Recording" : "Use Microphone"}
                      </span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    {isRecording ? "Recording" : "Use Microphone"}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
