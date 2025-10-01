import React from 'react';
import { CustomVoiceWidget } from '@/components/CustomVoiceWidget';
import Navbar from '@/components/Navbar';

const CustomVoiceDemo = () => {
  // Get credentials from environment
  const assistantId = '4e8e45ff-b6f2-41fd-9e77-ef5f2419b3be'; // Your assistant ID
  const publicKey = import.meta.env.VITE_VAPI_PUBLIC_KEY || '401125bf-62a0-44e8-bc42-76c086840385';

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      
      <main className="container mx-auto px-4 py-12">
        <div className="max-w-4xl mx-auto space-y-8">
          <div className="text-center space-y-4">
            <h1 className="text-4xl font-bold">Custom Voice Widget Demo</h1>
            <p className="text-lg text-muted-foreground">
              This demo showcases the new custom voice widget with full UI/UX control
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            <div className="space-y-4">
              <h2 className="text-2xl font-semibold">Features</h2>
              <ul className="space-y-2 text-muted-foreground">
                <li className="flex items-start gap-2">
                  <span className="text-primary mt-1">✓</span>
                  <span>Fully custom UI matching your brand</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary mt-1">✓</span>
                  <span>Real-time audio visualization</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary mt-1">✓</span>
                  <span>Live transcription display</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary mt-1">✓</span>
                  <span>Mute/unmute controls</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary mt-1">✓</span>
                  <span>Connection status indicators</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary mt-1">✓</span>
                  <span>Seamless Vapi backend integration</span>
                </li>
              </ul>
            </div>

            <div className="space-y-4">
              <h2 className="text-2xl font-semibold">How to Use</h2>
              <ol className="space-y-2 text-muted-foreground list-decimal list-inside">
                <li>Click the phone button to start a call</li>
                <li>Allow microphone access when prompted</li>
                <li>Speak naturally to the assistant</li>
                <li>View real-time transcriptions</li>
                <li>Use the mute button to toggle your mic</li>
                <li>Click the red button to end the call</li>
              </ol>
            </div>
          </div>

          <div className="bg-muted/30 rounded-lg p-6 space-y-4">
            <h2 className="text-xl font-semibold">Integration Code</h2>
            <pre className="bg-background rounded p-4 text-sm overflow-x-auto">
              <code>{`import { CustomVoiceWidget } from '@/components/CustomVoiceWidget';

<CustomVoiceWidget
  assistantId="your-assistant-id"
  publicKey="your-vapi-public-key"
  position="right" // or "left" or "center"
  theme="light" // or "dark"
/>`}</code>
            </pre>
          </div>
        </div>
      </main>

      {/* The custom voice widget */}
      <CustomVoiceWidget
        assistantId={assistantId}
        publicKey={publicKey}
        position="right"
      />
    </div>
  );
};

export default CustomVoiceDemo;
