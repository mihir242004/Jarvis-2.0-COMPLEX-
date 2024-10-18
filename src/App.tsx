import React, { useState, useEffect, useRef } from 'react';
import { Mic, Camera, Send, X } from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc, getDoc } from 'firebase/firestore';
import OpenAI from 'openai';
import * as cocoSsd from '@tensorflow-models/coco-ssd';
import * as tf from '@tensorflow/tfjs';
import SpeechRecognition, { useSpeechRecognition } from 'react-speech-recognition';

// Initialize Firebase (replace with your config)
const firebaseConfig = {
  // Your Firebase configuration
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Initialize OpenAI (replace with your API key)
const openai = new OpenAI({
  apiKey: 'your-openai-api-key',
  dangerouslyAllowBrowser: true // Note: This is not recommended for production. Use a backend proxy instead.
});

function App() {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([]);
  const [isListening, setIsListening] = useState(false);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);

  const { transcript, resetTranscript } = useSpeechRecognition();

  useEffect(() => {
    if (transcript) {
      setInput(transcript);
    }
  }, [transcript]);

  const handleSend = async () => {
    if (input.trim() === '') return;

    const newMessage = { role: 'user', content: input };
    setMessages([...messages, newMessage]);

    // Get user context from Firebase
    const userDoc = await getDoc(doc(db, 'users', 'userId'));
    const userContext = userDoc.data() || {};

    // Generate response using GPT-3
    const completion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        { role: 'system', content: 'You are a helpful assistant named Jarvis.' },
        ...messages,
        newMessage,
      ],
      user: JSON.stringify(userContext),
    });

    const assistantMessage = completion.choices[0].message;
    setMessages([...messages, newMessage, assistantMessage]);

    // Update user context in Firebase
    await setDoc(doc(db, 'users', 'userId'), {
      ...userContext,
      lastQuery: input,
      lastResponse: assistantMessage.content,
    });

    setInput('');
    resetTranscript();
  };

  const toggleListening = () => {
    if (isListening) {
      SpeechRecognition.stopListening();
    } else {
      SpeechRecognition.startListening({ continuous: true });
    }
    setIsListening(!isListening);
  };

  const toggleCamera = async () => {
    if (isCameraActive) {
      const stream = videoRef.current.srcObject;
      const tracks = stream.getTracks();
      tracks.forEach((track) => track.stop());
      setIsCameraActive(false);
    } else {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      videoRef.current.srcObject = stream;
      setIsCameraActive(true);
      detectObjects();
    }
  };

  const detectObjects = async () => {
    await tf.ready();
    const model = await cocoSsd.load();
    const detectFrame = async () => {
      const predictions = await model.detect(videoRef.current);
      const ctx = canvasRef.current.getContext('2d');
      ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
      ctx.font = '16px sans-serif';
      ctx.textBaseline = 'top';
      predictions.forEach((prediction) => {
        const [x, y, width, height] = prediction.bbox;
        ctx.strokeStyle = '#00FFFF';
        ctx.lineWidth = 4;
        ctx.strokeRect(x, y, width, height);
        ctx.fillStyle = '#00FFFF';
        ctx.fillText(prediction.class, x, y);
      });
      requestAnimationFrame(detectFrame);
    };
    detectFrame();
  };

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      <header className="bg-blue-600 text-white p-4">
        <h1 className="text-2xl font-bold">Jarvis 2.0</h1>
      </header>
      <main className="flex-grow p-4 overflow-y-auto">
        {messages.map((message, index) => (
          <div
            key={index}
            className={`mb-4 p-3 rounded-lg ${
              message.role === 'user' ? 'bg-blue-100 ml-auto' : 'bg-white'
            }`}
          >
            {message.content}
          </div>
        ))}
      </main>
      <div className="relative">
        {isCameraActive && (
          <div className="absolute bottom-full left-0 right-0">
            <video ref={videoRef} autoPlay muted className="w-full" />
            <canvas ref={canvasRef} className="absolute top-0 left-0 w-full h-full" />
          </div>
        )}
        <div className="bg-white p-4 flex items-center">
          <button
            onClick={toggleListening}
            className={`p-2 rounded-full ${isListening ? 'bg-red-500' : 'bg-gray-200'}`}
          >
            <Mic className="w-6 h-6" />
          </button>
          <button
            onClick={toggleCamera}
            className={`ml-2 p-2 rounded-full ${isCameraActive ? 'bg-red-500' : 'bg-gray-200'}`}
          >
            {isCameraActive ? <X className="w-6 h-6" /> : <Camera className="w-6 h-6" />}
          </button>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            className="flex-grow mx-4 p-2 border rounded"
            placeholder="Type your message..."
          />
          <button onClick={handleSend} className="p-2 bg-blue-500 text-white rounded">
            <Send className="w-6 h-6" />
          </button>
        </div>
      </div>
    </div>
  );
}

export default App;