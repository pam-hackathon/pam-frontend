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
import { useRef, useState } from "react";

interface Message {
  type: "user" | "bot";
  content: string;
}

export default function Dashboard() {
  const [isRecording, setIsRecording] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      type: "bot",
      content: "Hello, please click the microphone to begin recording",
    },
  ]);

  let userFinishedSpeakingTime = 0;
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  const startMic = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      console.log({ stream });
      const mediaRecorder = new MediaRecorder(stream);

      const tokenResponse = await fetch("/api/websocket")
      const { token } = await tokenResponse.json()
      const socket = new WebSocket(
        "wss://api.deepgram.com/v1/listen?model=nova-2-conversationalai&smart_format=true&no_delay=true",
        ["token", token]
      );

      let lastMessageTime = 0;
      const TIME_THRESHOLD = 8000; // 8 seconds

      socket.onopen = () => {
        console.log({ event: "onopen" });
        mediaRecorder.addEventListener("dataavailable", (event) => {
          if (event.data.size > 0 && socket.readyState === 1) {
            socket.send(event.data);
          }
        });
        mediaRecorder.start(250);
      };

      socket.onmessage = async (message) => {
        const received = JSON.parse(message.data);
        console.log({ received });

        if (!received.channel) {
          console.error("No alternatives available in the received message");
          return;
        }

        const transcript = received.channel.alternatives[0].transcript;
        const currentTime = Date.now();

        if (transcript) {
          console.log(transcript);
          setMessages((prevMessages) => {
            const newMessages = [...prevMessages];
            if (
              currentTime - lastMessageTime < TIME_THRESHOLD &&
              newMessages.length > 0
            ) {
              // Append to the last message
              const lastMessage = newMessages[newMessages.length - 1];
              if (lastMessage.type === "user") {
                newMessages[newMessages.length - 1] = {
                  ...lastMessage,
                  content: lastMessage.content + " " + transcript,
                };
              } else {
                newMessages.push({ type: "user", content: transcript });
              }
            } else {
              // Create a new message
              newMessages.push({ type: "user", content: transcript });
            }

            // Check if the time threshold has been reached
            if (currentTime - lastMessageTime >= TIME_THRESHOLD) {
              console.log("Generating bot response...");
              generateBotResponse(transcript, newMessages);
            }

            lastMessageTime = currentTime;

            return newMessages;
          });
        }
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
      const botResponseStartTime = Date.now(); // Log when the bot starts generating a response
      // Log the message contents
      console.log(
        "Messages: " +messages.map((message) => (message.type === "bot" ? "BOT:" : "USER:") + message.content).join(" ")
      );

      // Fetch the generated response from your backend
      const backendResponse = await fetch("/api/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          transcription: userMessage,
          context: messages.map((message) => (message.type === "bot" ? "BOT: " : "USER: ") + message.content + "\n").join(" "),
        }),
      });

      if (!backendResponse.ok) {
        throw new Error("Failed to fetch response from backend");
      }

      const backendData = await backendResponse.json();
      const generatedResponse = backendData.response;
      let botResponseEndTime = Date.now(); // Log when the bot has generated the response
      console.log(`Time taken to generate bot response: ${botResponseEndTime - botResponseStartTime}ms`);

      // Fetch the audio blob from your backend route
      const audioResponse = await fetch("/api/tts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ text: generatedResponse }),
      });

      if (!audioResponse.ok) {
        throw new Error("Failed to fetch audio from backend");
      }

      const audioBlob = await audioResponse.blob();
      const audioUrl = URL.createObjectURL(audioBlob);

      // Play the generated speech aloud
      const audio = new Audio(audioUrl);

      botResponseEndTime = Date.now(); // Log when the bot has generated the response
      console.log(`Time taken to generate bot response: ${botResponseEndTime - botResponseStartTime}ms`);
      
      audio.play();

      // Update the messages state with the bot's response
      setMessages((prevMessages) => [
        ...prevMessages,
        { type: "bot", content: generatedResponse },
      ]);
    } catch (error) {
      console.error("Error:", error);
    }
  };

  return (
    <div className="grid h-screen w-full">
      {audioUrl && <audio src={audioUrl} autoPlay />}
      <div className="flex flex-col">
        <header className="sticky top-0 z-10 flex h-[57px] justify-between items-center gap-1 border-b bg-background px-8">
          <h1 className="text-xl font-semibold">Playground</h1>
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
