import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import CreateAssistant from "./pages/CreateAssistant";
import VoiceAssistantDemo from "./pages/VoiceAssistantDemo";
import LiveAssistantTest from "./pages/LiveAssistantTest";
import Analytics from "./pages/Analytics";
import NotFound from "./pages/NotFound";
import VoiceAssistantEmbedJS from "./pages/VoiceAssistantEmbedJS";
import JavaScriptEmbed from "./pages/JavaScriptEmbed";
import QueryTool from "./pages/QueryTool";
import CleanupAssistant from "./pages/CleanupAssistant";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/auth" element={<Auth />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/create-assistant" element={<CreateAssistant />} />
          <Route path="/voice-demo" element={<VoiceAssistantDemo />} />
          <Route path="/live-test" element={<LiveAssistantTest />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="/query-tool" element={<QueryTool />} />
          <Route path="/cleanup-assistant" element={<CleanupAssistant />} />
          {/* Serve the voice assistant embed JavaScript */}
          <Route path="/js/voice-assistant-embed.js" element={<VoiceAssistantEmbedJS />} />
          <Route path="/js/external-chatbot-voice.js" element={<JavaScriptEmbed />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
